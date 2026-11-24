// What speaks to a Speckle server (Decision "Speckle publish"): who a token (speckleAuth.ts) signs in as, the user's
// projects and a project's models, a new model, and publishing what exportSpeckle.ts serialised — only the objects the
// server lacks (`/api/diff`), in batches to `/objects/<project>`, then `versionMutations.create`. Since 2026.9 that
// version appears once the server has processed it: `publish` waits for it a while and says whether it is there yet.

export const SPECKLE_SERVER = 'https://app.speckle.systems'

export interface SpeckleAccount {
  /** Its origin, e.g. https://app.speckle.systems. */
  server: string
  token: string
  /** The signed-in user's name. */
  user: string
}

export interface SpeckleItem {
  id: string
  name: string
}

/** A server as typed: its origin, https when no scheme is given. */
export function serverOf(typed: string): string {
  const s = typed.trim() || SPECKLE_SERVER
  return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).origin
}

type Auth = Pick<SpeckleAccount, 'server' | 'token'>

/** The server no longer takes the token (it ended, or was revoked): sign in again. */
export class SpeckleSignedOut extends Error {}
/** A workspace with single sign-on whose SSO session has ended: through its SSO, then again. */
export class SpeckleSsoNeeded extends Error {
  readonly workspace: string
  constructor(workspace: string) {
    super(`The workspace “${workspace}” asks to sign in with its SSO`)
    this.workspace = workspace
  }
}

async function gql<T>(a: Auth, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${a.server}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
    body: JSON.stringify({ query, variables }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    data?: T
    errors?: { message: string; extensions?: { code?: string; workspaceSlug?: string } }[]
  }
  const first = json.errors?.[0]
  if (first?.extensions?.code === 'SSO_SESSION_MISSING_OR_EXPIRED_ERROR' && first.extensions.workspaceSlug) throw new SpeckleSsoNeeded(first.extensions.workspaceSlug)
  if (res.status === 401 || first?.extensions?.code === 'UNAUTHENTICATED') throw new SpeckleSignedOut(first?.message ?? `${a.server} no longer takes this sign-in`)
  if (first) throw new Error(first.message)
  if (!res.ok || !json.data) throw new Error(`${a.server} answered ${res.status}`)
  return json.data
}

/** The account a token opens on a server; throws when the server does not take it. */
export async function signIn(server: string, token: string): Promise<SpeckleAccount> {
  const a = { server: serverOf(server), token: token.trim() }
  const data = await gql<{ activeUser: { name: string } | null }>(a, 'query { activeUser { name } }')
  if (!data.activeUser) throw new Error(`That token does not sign in to ${a.server}`)
  return { ...a, user: data.activeUser.name }
}

export async function projectsOf(a: Auth): Promise<SpeckleItem[]> {
  const data = await gql<{ activeUser: { projects: { items: SpeckleItem[] } } }>(a, 'query { activeUser { projects(limit: 100) { items { id name } } } }')
  return data.activeUser.projects.items
}

export async function modelsOf(a: Auth, projectId: string): Promise<SpeckleItem[]> {
  const data = await gql<{ project: { models: { items: SpeckleItem[] } } }>(
    a,
    'query ($id: String!) { project(id: $id) { models(limit: 100) { items { id name } } } }',
    { id: projectId },
  )
  return data.project.models.items
}

export async function createModel(a: Auth, projectId: string, name: string): Promise<SpeckleItem> {
  const data = await gql<{ modelMutations: { create: SpeckleItem } }>(
    a,
    'mutation ($input: CreateModelInput!) { modelMutations { create(input: $input) { id name } } }',
    { input: { projectId, name } },
  )
  return data.modelMutations.create
}

/** Where a model (or one of its versions) opens in Speckle's web app. */
export const modelUrl = (a: Pick<SpeckleAccount, 'server'>, projectId: string, modelId: string, versionId?: string) =>
  `${a.server}/projects/${projectId}/models/${modelId}${versionId ? `@${versionId}` : ''}`

const idOf = (json: string) => (JSON.parse(json) as { id: string }).id

/** Of these objects, the ones the project does not hold yet. */
async function missing(a: Auth, projectId: string, objects: string[]): Promise<string[]> {
  const out: string[] = []
  for (let k = 0; k < objects.length; k += 1000) {
    const part = objects.slice(k, k + 1000)
    const res = await fetch(`${a.server}/api/diff/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ objects: JSON.stringify(part.map(idOf)) }),
    })
    if (res.status === 401) throw new SpeckleSignedOut(`${a.server} no longer takes this sign-in`)
    if (!res.ok) throw new Error(`${a.server} answered ${res.status} when comparing the objects`)
    const has = (await res.json()) as Record<string, boolean>
    out.push(...part.filter((o) => !has[idOf(o)]))
  }
  return out
}

/** Batches of objects of about `size` characters each. */
export function batches(objects: string[], size = 1_000_000): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let length = 0
  for (const o of objects) {
    if (current.length && length + o.length > size) {
      out.push(current)
      current = []
      length = 0
    }
    current.push(o)
    length += o.length
  }
  if (current.length) out.push(current)
  return out
}

/** Uploads the objects the project lacks; `progress` runs from 0 to 1. */
export async function uploadObjects(a: Auth, projectId: string, objects: string[], progress: (done: number) => void = () => {}): Promise<void> {
  const send = batches(await missing(a, projectId, objects))
  for (let k = 0; k < send.length; k++) {
    const form = new FormData()
    form.append('object-batch', new Blob([`[${send[k].join(',')}]`], { type: 'application/json' }))
    const res = await fetch(`${a.server}/objects/${projectId}`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` }, body: form })
    if (res.status === 401) throw new SpeckleSignedOut(`${a.server} no longer takes this sign-in`)
    if (res.status !== 201) throw new Error(`${a.server} answered ${res.status} when uploading the objects`)
    progress((k + 1) / send.length)
  }
  if (!send.length) progress(1)
}

export interface PublishInput {
  projectId: string
  modelId: string
  /** The root's id and every object (exportSpeckle.ts). */
  batch: { id: string; objects: string[]; totalChildrenCount: number }
  message: string
}

export interface Published {
  versionId: string
  /** The version's link once it is there, else the model's. */
  url: string
  /** Whether the server had processed it when publish returned. */
  ready: boolean
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Uploads the objects, creates the version and waits (`tries` × `every` ms) until the server has it. */
export async function publish(
  a: Auth,
  input: PublishInput,
  options: { progress?: (stage: 'uploading' | 'processing', done: number) => void; tries?: number; every?: number } = {},
): Promise<Published> {
  const { progress = () => {}, tries = 30, every = 2000 } = options
  await uploadObjects(a, input.projectId, input.batch.objects, (done) => progress('uploading', done))
  const data = await gql<{ versionMutations: { create: { id: string } } }>(
    a,
    'mutation ($input: CreateVersionInput!) { versionMutations { create(input: $input) { id } } }',
    {
      input: {
        projectId: input.projectId,
        modelId: input.modelId,
        objectId: input.batch.id,
        message: input.message || undefined,
        sourceApplication: 'GFit',
        totalChildrenCount: input.batch.totalChildrenCount,
      },
    },
  )
  const versionId = data.versionMutations.create.id
  progress('processing', 0)
  for (let k = 0; k < tries; k++) {
    try {
      await gql(a, 'query ($p: String!, $v: String!) { project(id: $p) { version(id: $v) { id } } }', { p: input.projectId, v: versionId })
      return { versionId, url: modelUrl(a, input.projectId, input.modelId, versionId), ready: true }
    } catch {
      // not there yet
    }
    progress('processing', (k + 1) / tries)
    await pause(every)
  }
  return { versionId, url: modelUrl(a, input.projectId, input.modelId), ready: false }
}
