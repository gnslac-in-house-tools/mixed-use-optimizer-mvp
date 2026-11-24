// Speckle in Export's 3D model dialog (Decisions "Speckle publish", "Speckle sign-in"; the server mocked: io/__tests__/
// tests the client and the login): off the public link the sign-in waits and says where it works; on it, Sign in with
// Speckle keeps a verifier and the route and goes to Speckle's login; back with a code, the address as it was, the code
// traded, the dialog open on Speckle, signed in; Publish makes the new model and leaves the link; the token in this
// browser only; an ended session signs out; a workspace's SSO is offered.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signsInHere, tradeCode } from '../../../io/speckleAuth.ts'
import { createModel, projectsOf, publish, signIn, SpeckleSignedOut, SpeckleSsoNeeded } from '../../../io/speckleClient.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { ModelExportDialog, useModelExport } from '../ModelExportDialog.tsx'
import { navigate, NEW_MODEL, PENDING_KEY, SPECKLE_KEY, useSpeckle } from '../speckle.ts'
import { returnFromSpeckle } from '../speckleReturn.ts'

vi.mock('../../../io/speckleAuth.ts', async (original) => ({
  ...(await original<typeof import('../../../io/speckleAuth.ts')>()),
  signsInHere: vi.fn(() => true),
  pkcePair: vi.fn(async () => ({ verifier: 'the-verifier', challenge: 'the-challenge' })),
  tradeCode: vi.fn(async () => 'the-token'),
}))
vi.mock('../../../io/speckleClient.ts', async (original) => ({
  ...(await original<typeof import('../../../io/speckleClient.ts')>()),
  signIn: vi.fn(async (_server: string, token: string) => ({ server: 'https://app.speckle.systems', token, user: 'Ana R.' })),
  projectsOf: vi.fn(async () => [
    { id: 'p1', name: 'GFit tests' },
    { id: 'p2', name: 'Other' },
  ]),
  modelsOf: vi.fn(async (_a: unknown, projectId: string) => (projectId === 'p1' ? [{ id: 'm1', name: 'massing' }] : [])),
  createModel: vi.fn(async (_a: unknown, _p: string, name: string) => ({ id: 'm9', name })),
  publish: vi.fn(async () => ({ versionId: 'v1', url: 'https://app.speckle.systems/projects/p1/models/m9@v1', ready: true })),
}))

const signedOut = () =>
  useSpeckle.setState({ account: null, projects: null, models: null, projectId: '', modelId: NEW_MODEL, newModel: '', message: '', status: { kind: 'idle' } })

let went: string[] = []
beforeEach(() => {
  went = []
  navigate.to = (url) => void went.push(url)
  localStorage.removeItem(SPECKLE_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  signedOut()
  useModelExport.setState({ open: true, format: 'speckle', part: 'all' })
  useApp.getState().open(demoProject())
  window.history.replaceState(null, '', `/#/p/${useApp.getState().project.id}`)
})
afterEach(() => vi.clearAllMocks())

const dialog = () => screen.getByRole('dialog', { name: 'Export 3D model' })
const speckle = () => within(dialog()).getByRole('region', { name: 'Speckle' })

describe('Speckle in the 3D model dialog', () => {
  it('off the public link, Sign in waits and says where it works; Publish waits for a sign-in', () => {
    vi.mocked(signsInHere).mockReturnValue(false)
    render(<ModelExportDialog />)
    expect(within(speckle()).getByRole('button', { name: 'Sign in with Speckle ↗' })).toBeDisabled()
    expect(within(speckle()).getByRole('link', { name: 'open it ↗' })).toHaveAttribute('href', 'https://gnslac-in-house-tools.github.io/gfit-generative-information-modeler/')
    expect(within(dialog()).getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(within(speckle()).queryByLabelText('Token')).toBeNull()
    vi.mocked(signsInHere).mockReturnValue(true)
  })

  it('sign in with Speckle, back signed in where it was, publish to a new model, the link; the token in this browser only', async () => {
    const route = window.location.hash
    const { unmount } = render(<ModelExportDialog />)
    await act(async () => fireEvent.click(within(speckle()).getByRole('button', { name: 'Sign in with Speckle ↗' })))
    expect(went).toEqual(['https://app.speckle.systems/authn/verify/f5adce22b8/the-challenge?code_challenge_method=S256'])
    expect(JSON.parse(sessionStorage.getItem(PENDING_KEY)!)).toEqual({ verifier: 'the-verifier', hash: route })

    // Speckle sends the browser back to the public link with a code; the page loads again
    unmount()
    signedOut()
    useModelExport.setState({ open: false, format: 'rhino' })
    window.history.replaceState(null, '', '/?access_code=the-code')
    await act(async () => void (await returnFromSpeckle()))
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe(route)
    expect(vi.mocked(tradeCode).mock.calls[0]).toEqual(['the-code', 'the-verifier'])
    expect(vi.mocked(signIn).mock.calls[0]).toEqual(['https://app.speckle.systems', 'the-token'])
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull()
    expect(useModelExport.getState()).toMatchObject({ open: true, format: 'speckle' })

    render(<ModelExportDialog />)
    expect(within(speckle()).getByText('Ana R.')).toBeInTheDocument()
    await waitFor(() => expect(within(speckle()).getByLabelText('Project')).toHaveValue('p1'))
    const model = within(speckle()).getByLabelText('Model') as HTMLSelectElement
    await waitFor(() => expect(model.options).toHaveLength(2))
    expect(model.options[0].textContent).toBe('+ New model: Demo site')

    fireEvent.change(within(speckle()).getByLabelText('Message'), { target: { value: 'Option B' } })
    await act(async () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Publish' })))
    await waitFor(() => expect(within(dialog()).getByRole('link', { name: 'Open in Speckle ↗' })).toHaveAttribute('href', 'https://app.speckle.systems/projects/p1/models/m9@v1'))
    expect(vi.mocked(createModel).mock.calls.at(-1)?.slice(1)).toEqual(['p1', 'Demo site'])
    const [, input] = vi.mocked(publish).mock.calls.at(-1)!
    expect(input).toMatchObject({ projectId: 'p1', modelId: 'm9', message: 'Option B' })
    expect(input.batch.objects.length).toBeGreaterThan(1)
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()

    expect(JSON.parse(localStorage.getItem(SPECKLE_KEY)!)).toMatchObject({ account: { token: 'the-token' }, projectId: 'p1', modelId: 'm9' })
    expect(JSON.stringify(useApp.getState().project)).not.toContain('the-token')
  })

  it('a page that did not come back from Speckle is left as it is', () => {
    expect(returnFromSpeckle()).toBeNull()
    expect(useModelExport.getState().format).toBe('speckle')
  })

  it('a session Speckle no longer takes signs out and says so', async () => {
    useSpeckle.setState({ account: { server: 'https://app.speckle.systems', token: 'old', user: 'Ana R.' } })
    vi.mocked(projectsOf).mockRejectedValueOnce(new SpeckleSignedOut('Token expired'))
    render(<ModelExportDialog />)
    await waitFor(() => expect(within(speckle()).getByRole('alert')).toHaveTextContent('Your Speckle session has ended: sign in again.'))
    expect(within(speckle()).getByRole('button', { name: 'Sign in with Speckle ↗' })).toBeEnabled()
    expect(JSON.parse(localStorage.getItem(SPECKLE_KEY)!).account).toBeNull()
  })

  it('a workspace whose SSO session ended: Continue with SSO goes through it, and back the projects are listed again', async () => {
    useSpeckle.setState({ account: { server: 'https://app.speckle.systems', token: 't', user: 'Ana R.' } })
    vi.mocked(projectsOf).mockRejectedValueOnce(new SpeckleSsoNeeded('gensler'))
    const { unmount } = render(<ModelExportDialog />)
    await waitFor(() => expect(within(speckle()).getByRole('alert')).toHaveTextContent('“gensler” asks you to sign in with its SSO'))
    fireEvent.click(within(speckle()).getByRole('button', { name: 'Continue with SSO ↗' }))
    expect(went[0]).toMatch(
      /^https:\/\/app\.speckle\.systems\/api\/v1\/workspaces\/gensler\/sso\/auth\?challenge=[\w-]+&appId=f5adce22b8&finalPath=%2Fgfit-generative-information-modeler%2F$/,
    )

    unmount()
    const route = window.location.hash
    window.history.replaceState(null, '', '/')
    await act(async () => void (await returnFromSpeckle()))
    expect(window.location.hash).toBe(route)
    expect(useSpeckle.getState().projects).toHaveLength(2)
    expect(useSpeckle.getState().status.kind).toBe('idle')
  })
})
