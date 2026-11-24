// The Speckle section of Export's 3D model dialog (Phase SP.0's layout, SL.0's sign-in): signed out, *Sign in with
// Speckle* (Speckle's own login; it works on the public link, the one place Speckle sends the browser back to); signed
// in, the server and the user with Sign out, Project ▾, Model ▾ (a new one first, its name editable) and the version's
// message; below, how a publish goes and, once done, the link to open it in Speckle.
import { useEffect, type ReactNode } from 'react'
import { signsInHere, SPECKLE_APP } from '../../io/speckleAuth.ts'
import { inputClass } from '../controls/fields.tsx'
import { loadProjects, NEW_MODEL, pickModel, pickProject, speckleSignOut, startSpeckleSignIn, startSpeckleSso, useSpeckle } from './speckle.ts'

const field = `${inputClass} w-full min-w-0`

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-label text-ink-secondary">{label}</span>
      {children}
    </label>
  )
}

export function SpeckleSection({ projectName }: { projectName: string }) {
  const { account, projects, models, projectId, modelId, newModel, message, status } = useSpeckle()
  const here = signsInHere(window.location.href)

  useEffect(() => {
    if (useSpeckle.getState().status.kind !== 'busy') useSpeckle.setState({ status: { kind: 'idle' } })
    if (useSpeckle.getState().account && !useSpeckle.getState().projects) void loadProjects()
  }, [])

  const busy = status.kind === 'busy'
  return (
    <section aria-label="Speckle" className="flex flex-col gap-3 border-t border-separator pt-3">
      <span className="text-label font-medium text-ink">Speckle</span>
      {!account ? (
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            disabled={!here || busy}
            onClick={() => void startSpeckleSignIn()}
            className="pressable rounded-control bg-fill px-3 py-1.5 text-body font-medium shadow-control hover:bg-hover disabled:opacity-50"
          >
            Sign in with Speckle ↗
          </button>
          {here ? (
            <p className="text-caption text-ink-secondary">Takes you to {SPECKLE_APP.server.replace(/^https?:\/\//, '')} and back here, signed in. The session stays in this browser only.</p>
          ) : (
            <p className="text-caption text-ink-secondary">
              Signing in to Speckle works on GFit’s public link:{' '}
              <a className="underline hover:text-ink" href={SPECKLE_APP.redirect} target="_blank" rel="noreferrer">
                open it ↗
              </a>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center justify-between gap-2 text-label">
            <span className="truncate text-ink-secondary">
              {account.server.replace(/^https?:\/\//, '')} · <span className="text-ink">{account.user}</span>
            </span>
            <button type="button" onClick={speckleSignOut} className="pressable shrink-0 rounded-control px-2 py-1 text-label hover:bg-hover">
              Sign out
            </button>
          </div>
          <Labelled label="Project">
            <select className={field} value={projectId} disabled={!projects || busy} onChange={(e) => void pickProject(e.target.value)}>
              {!projects && <option value={projectId}>Loading…</option>}
              {projects?.length === 0 && <option value="">No projects: make one in Speckle</option>}
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Model">
            <select className={field} value={modelId} disabled={!projectId || !models || busy} onChange={(e) => pickModel(e.target.value)}>
              <option value={NEW_MODEL}>+ New model: {newModel.trim() || projectName}</option>
              {models?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Labelled>
          {modelId === NEW_MODEL && (
            <Labelled label="New model’s name">
              <input className={field} value={newModel} placeholder={projectName} disabled={busy} onChange={(e) => useSpeckle.setState({ newModel: e.target.value })} />
            </Labelled>
          )}
          <Labelled label="Message">
            <input className={field} value={message} placeholder="What this version shows (optional)" disabled={busy} onChange={(e) => useSpeckle.setState({ message: e.target.value })} />
          </Labelled>
        </>
      )}
      <Status />
    </section>
  )
}

function Status() {
  const status = useSpeckle((s) => s.status)
  if (status.kind === 'idle') return null
  if (status.kind === 'busy')
    return (
      <p role="status" className="text-caption text-ink-secondary">
        {status.text}
      </p>
    )
  if (status.kind === 'error')
    return (
      <p role="alert" className="text-caption text-status-over">
        {status.text}
      </p>
    )
  if (status.kind === 'sso')
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-caption text-ink-secondary">
        <span>The workspace “{status.workspace}” asks you to sign in with its SSO.</span>
        <button type="button" onClick={() => startSpeckleSso(status.workspace)} className="pressable rounded-control px-2 py-1 text-label text-ink hover:bg-hover">
          Continue with SSO ↗
        </button>
      </div>
    )
  return (
    <p role="status" className="text-caption text-ink">
      <span className="text-status-within">Published ✓</span> · {status.model} ·{' '}
      <a className="underline hover:text-ink-secondary" href={status.url} target="_blank" rel="noreferrer">
        Open in Speckle ↗
      </a>
      {!status.ready && <span className="text-ink-secondary"> (Speckle is still processing it: it shows in a minute)</span>}
    </p>
  )
}
