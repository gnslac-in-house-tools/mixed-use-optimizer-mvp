// @vitest-environment node
// (Node's own FormData and Blob, as a browser's.) The Speckle client (Decision "Speckle publish"), on a fetch that
// answers as app.speckle.systems does: a server as typed; signing in; publishing uploads only what the project lacks,
// in batches, creates the version with the root's id and waits for the server to have it, else gives the model's link.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { batches, projectsOf, publish, serverOf, signIn, SpeckleSignedOut, SpeckleSsoNeeded } from '../speckleClient.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

describe('the Speckle client', () => {
  it('a server as typed: its origin, https by default, Speckle’s own when blank', () => {
    expect(serverOf('app.speckle.systems/projects')).toBe('https://app.speckle.systems')
    expect(serverOf('  ')).toBe('https://app.speckle.systems')
    expect(serverOf('http://localhost:3000/')).toBe('http://localhost:3000')
  })

  it('signing in names the user; a token the server does not take says so', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => json({ data: { activeUser: { name: 'Ana R.' } } }))
    vi.stubGlobal('fetch', fetch)
    expect(await signIn('app.speckle.systems', ' tok ')).toEqual({ server: 'https://app.speckle.systems', token: 'tok', user: 'Ana R.' })
    expect(fetch.mock.calls[0][0]).toBe('https://app.speckle.systems/graphql')
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
    fetch.mockImplementation(async () => json({ data: { activeUser: null } }))
    await expect(signIn('app.speckle.systems', 'bad')).rejects.toThrow('does not sign in')
    fetch.mockImplementation(async () => json({ errors: [{ message: 'Your token is not valid' }] }))
    await expect(signIn('app.speckle.systems', 'bad')).rejects.toThrow('Your token is not valid')
  })

  it('a token the server no longer takes, and a workspace asking for its SSO, are told apart from other errors', async () => {
    const a = { server: 'https://app.speckle.systems', token: 't' }
    vi.stubGlobal('fetch', vi.fn(async () => json({ errors: [{ message: 'Unauthorized' }] }, 401)))
    await expect(projectsOf(a)).rejects.toBeInstanceOf(SpeckleSignedOut)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ errors: [{ message: 'Your workspace SSO session is expired', extensions: { code: 'SSO_SESSION_MISSING_OR_EXPIRED_ERROR', workspaceSlug: 'gensler' } }] }, 401)),
    )
    const sso = await projectsOf(a).catch((e: unknown) => e)
    expect(sso).toBeInstanceOf(SpeckleSsoNeeded)
    expect((sso as SpeckleSsoNeeded).workspace).toBe('gensler')
    vi.stubGlobal('fetch', vi.fn(async () => json({ errors: [{ message: 'Project not found' }] })))
    const other = await projectsOf(a).catch((e: unknown) => e)
    expect(other).not.toBeInstanceOf(SpeckleSignedOut)
    expect((other as Error).message).toBe('Project not found')
  })

  it('batches of about a size, none empty', () => {
    expect(batches(['aaaa', 'bb', 'cccc', 'd'], 6)).toEqual([['aaaa', 'bb'], ['cccc', 'd']])
    expect(batches(['x'.repeat(10)], 6)).toEqual([['x'.repeat(10)]])
    expect(batches([], 6)).toEqual([])
  })

  it('publishing: only the missing objects, the version on the root, the version’s link once the server has it', async () => {
    const objects = ['{"id":"a","speckle_type":"Base"}', '{"id":"b","speckle_type":"Base"}', '{"id":"root","speckle_type":"Base"}']
    const uploaded: string[] = []
    let created: Record<string, unknown> = {}
    let asked = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/api/diff/p1')) return json({ a: true, b: false, root: false })
        if (url.endsWith('/objects/p1')) {
          uploaded.push(await ((init.body as FormData).get('object-batch') as Blob).text())
          return new Response('', { status: 201 })
        }
        const body = JSON.parse(init.body as string) as { query: string; variables: { input: Record<string, unknown> } }
        if (body.query.includes('versionMutations')) {
          created = body.variables.input
          return json({ data: { versionMutations: { create: { id: 'v1' } } } })
        }
        return ++asked < 3 ? json({ errors: [{ message: 'Version not found' }] }) : json({ data: { project: { version: { id: 'v1' } } } })
      }),
    )
    const stages: string[] = []
    const out = await publish(
      { server: 'https://app.speckle.systems', token: 't' },
      { projectId: 'p1', modelId: 'm1', batch: { id: 'root', objects, totalChildrenCount: 2 }, message: 'Option B' },
      { progress: (s) => stages.push(s), every: 0 },
    )
    expect(uploaded).toHaveLength(1)
    expect(JSON.parse(uploaded[0]).map((o: { id: string }) => o.id)).toEqual(['b', 'root'])
    expect(created).toMatchObject({ projectId: 'p1', modelId: 'm1', objectId: 'root', message: 'Option B', sourceApplication: 'GFit', totalChildrenCount: 2 })
    expect(out).toEqual({ versionId: 'v1', url: 'https://app.speckle.systems/projects/p1/models/m1@v1', ready: true })
    expect(stages[0]).toBe('uploading')
    expect(stages.at(-1)).toBe('processing')
  })

  it('while the server is still processing it, the model’s link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('/api/diff/')) return json({ root: true })
        const body = JSON.parse(init.body as string) as { query: string }
        return body.query.includes('versionMutations') ? json({ data: { versionMutations: { create: { id: 'v2' } } } }) : json({ errors: [{ message: 'Version not found' }] })
      }),
    )
    const out = await publish(
      { server: 'https://app.speckle.systems', token: 't' },
      { projectId: 'p1', modelId: 'm1', batch: { id: 'root', objects: ['{"id":"root"}'], totalChildrenCount: 0 }, message: '' },
      { tries: 2, every: 0 },
    )
    expect(out).toEqual({ versionId: 'v2', url: 'https://app.speckle.systems/projects/p1/models/m1', ready: false })
  })
})
