// Speckle's side of Export's 3D model dialog (Decision "Speckle publish"): the account, kept in this browser
// (`gfit.speckle`; a token is the designer's own, never in the project or its file) with the project and model last
// published to, the lists the server gives, and how a publish goes. Signing in is Speckle's own login (Decision
// "Speckle sign-in"): what it needs back here waits in this tab's `gfit.speckle.pending` while the browser is away.
import { create } from 'zustand'
import type { Derived } from '../../engine/types.ts'
import type { ModelPart } from '../../io/exportModel.ts'
import { authorizeUrl, pkcePair, SPECKLE_APP, ssoUrl, tradeCode } from '../../io/speckleAuth.ts'
import {
  createModel,
  modelsOf,
  projectsOf,
  publish,
  signIn,
  SpeckleSignedOut,
  SpeckleSsoNeeded,
  type SpeckleAccount,
  type SpeckleItem,
} from '../../io/speckleClient.ts'
import type { Project } from '../../model/schema.ts'

export const SPECKLE_KEY = 'gfit.speckle'
export const PENDING_KEY = 'gfit.speckle.pending'
/** The model picker's first item: a new model, named in its own field. */
export const NEW_MODEL = '+new'

export type SpeckleStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'done'; url: string; ready: boolean; model: string }
  | { kind: 'error'; text: string }
  /** The workspace asks for its SSO before it lists or takes anything. */
  | { kind: 'sso'; workspace: string }

interface Saved {
  account: SpeckleAccount | null
  projectId: string
  modelId: string
}

interface SpeckleState extends Saved {
  projects: SpeckleItem[] | null
  models: SpeckleItem[] | null
  /** The new model's name (blank: the project's). */
  newModel: string
  message: string
  status: SpeckleStatus
}

/** What the browser needs when it comes back from Speckle: the verifier (a login, not an SSO) and where GFit was. */
export interface Pending {
  verifier?: string
  hash: string
}

/** Where the browser goes: Speckle's login or a workspace's SSO (replaced in the tests). */
export const navigate = { to: (url: string) => window.location.assign(url) }

function read(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(SPECKLE_KEY) ?? 'null') as Partial<Saved> | null
    const a = raw?.account
    return {
      account: a && typeof a.server === 'string' && typeof a.token === 'string' && a.token ? { server: a.server, token: a.token, user: String(a.user ?? '') } : null,
      projectId: typeof raw?.projectId === 'string' ? raw.projectId : '',
      modelId: typeof raw?.modelId === 'string' ? raw.modelId : NEW_MODEL,
    }
  } catch {
    return { account: null, projectId: '', modelId: NEW_MODEL }
  }
}

export const useSpeckle = create<SpeckleState>(() => ({ ...read(), projects: null, models: null, newModel: '', message: '', status: { kind: 'idle' } }))

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function save(patch: Partial<SpeckleState>) {
  useSpeckle.setState(patch)
  const { account, projectId, modelId } = useSpeckle.getState()
  try {
    localStorage.setItem(SPECKLE_KEY, JSON.stringify({ account, projectId, modelId }))
  } catch {
    // full or blocked: it lasts as long as the tab
  }
}

function keep(p: Pending) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p))
  } catch {
    // blocked: the login still runs, but GFit opens Home when it comes back
  }
}

/** What waits for the browser's return, taken (it is one-time). */
export function takePending(): Pending | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null
    sessionStorage.removeItem(PENDING_KEY)
    return raw && typeof raw.hash === 'string' ? raw : null
  } catch {
    return null
  }
}

/** Off to Speckle's login; it comes back to the public link with a code (speckleReturn.ts). */
export async function startSpeckleSignIn(): Promise<void> {
  useSpeckle.setState({ status: { kind: 'busy', text: 'Going to Speckle…' } })
  const { verifier, challenge } = await pkcePair()
  keep({ verifier, hash: window.location.hash })
  navigate.to(authorizeUrl(challenge))
}

/** Off to the workspace's SSO; it comes back to the public link with the session valid again. */
export function startSpeckleSso(workspace: string): void {
  keep({ hash: window.location.hash })
  navigate.to(ssoUrl(workspace))
}

/** Back from Speckle's login: the code traded for a token, the account kept, its projects listed. */
export async function finishSpeckleSignIn(accessCode: string, verifier: string): Promise<void> {
  useSpeckle.setState({ status: { kind: 'busy', text: 'Signing in…' } })
  try {
    const account = await signIn(SPECKLE_APP.server, await tradeCode(accessCode, verifier))
    save({ account, projects: null, models: null, status: { kind: 'idle' } })
    await loadProjects()
  } catch (e) {
    useSpeckle.setState({ status: { kind: 'error', text: `Could not sign in to Speckle: ${message(e)}` } })
  }
}

export function speckleSignOut(): void {
  save({ account: null, projectId: '', modelId: NEW_MODEL, projects: null, models: null, status: { kind: 'idle' } })
}

/** What went wrong: an ended sign-in signs out, a workspace's SSO is offered, the rest is said. */
function failed(e: unknown, prefix = ''): void {
  if (e instanceof SpeckleSsoNeeded) return useSpeckle.setState({ status: { kind: 'sso', workspace: e.workspace } })
  if (e instanceof SpeckleSignedOut) {
    save({ account: null, projects: null, models: null })
    return useSpeckle.setState({ status: { kind: 'error', text: 'Your Speckle session has ended: sign in again.' } })
  }
  useSpeckle.setState({ status: { kind: 'error', text: `${prefix}${message(e)}` } })
}

/** The account's projects; the one last published to stays picked while it is there, else the first. */
export async function loadProjects(): Promise<void> {
  const { account, projectId } = useSpeckle.getState()
  if (!account) return
  try {
    const projects = await projectsOf(account)
    useSpeckle.setState({ projects })
    await pickProject(projects.some((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? ''))
  } catch (e) {
    useSpeckle.setState({ projects: [] })
    failed(e)
  }
}

export async function pickProject(projectId: string): Promise<void> {
  const { account, modelId, projectId: before } = useSpeckle.getState()
  save({ projectId, models: null, modelId: projectId === before ? modelId : NEW_MODEL })
  if (!account || !projectId) return useSpeckle.setState({ models: [] })
  try {
    const models = await modelsOf(account, projectId)
    if (useSpeckle.getState().projectId !== projectId) return
    useSpeckle.setState({ models })
    if (!models.some((m) => m.id === useSpeckle.getState().modelId)) save({ modelId: NEW_MODEL })
  } catch (e) {
    useSpeckle.setState({ models: [] })
    failed(e)
  }
}

export const pickModel = (modelId: string) => save({ modelId })

/** The asked option, as asked, published as a new version of the model picked (made first when new). */
export async function publishToSpeckle(project: Project, derived: Derived, part: ModelPart): Promise<void> {
  const { account, projectId, modelId, newModel, message: text, models } = useSpeckle.getState()
  if (!account || !projectId) return
  const busy = (t: string) => useSpeckle.setState({ status: { kind: 'busy', text: t } })
  busy('Preparing the model…')
  try {
    const { exportSpeckle } = await import('../../io/exportSpeckle.ts')
    const batch = exportSpeckle(project, derived, part)
    let model = models?.find((m) => m.id === modelId)
    if (modelId === NEW_MODEL || !model) {
      busy('Creating the model…')
      model = await createModel(account, projectId, newModel.trim() || project.name)
      useSpeckle.setState({ models: [...(useSpeckle.getState().models ?? []), model] })
      save({ modelId: model.id })
    }
    const done = await publish(
      account,
      { projectId, modelId: model.id, batch, message: text.trim() },
      { progress: (stage, d) => busy(stage === 'uploading' ? `Uploading… ${Math.round(d * 100)}%` : 'Speckle is processing it…') },
    )
    useSpeckle.setState({ status: { kind: 'done', url: done.url, ready: done.ready, model: model.name }, message: '' })
  } catch (e) {
    failed(e, 'Could not publish: ')
  }
}
