// The 3D in its own chunk: three.js and react-three-fiber download only when the 3D or Split view opens, so the plan
// opens fast. Port of Plaza-Practiko `vistas/tresd/EscenaPerezosa.tsx`. If the download fails (no signal, a new
// deploy), the notice stays where the 3D goes, with "Retry": the plan and the rest keep working. With `option`, it is
// that option's pane in Compare (read-only, its camera shared with the other panes).
import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

// one download for every pane (Compare opens several at once); a failed one is asked for again on Retry
let loading: Promise<typeof import('./Scene.tsx')> | null = null
function importScene() {
  loading ??= import('./Scene.tsx').catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}

const load = () => lazy(() => importScene().then((m) => ({ default: m.Scene })))

function Notice({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`${className ?? ''} grid place-items-center bg-panel-sunken`}>
      <div className="flex flex-col items-center gap-2 text-body text-ink-secondary">{children}</div>
    </div>
  )
}

class Boundary extends Component<{ className?: string; retry: () => void; children: ReactNode }, { error: boolean }> {
  state = { error: false }

  static getDerivedStateFromError(): { error: boolean } {
    return { error: true }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Notice className={this.props.className}>
        {tr("Could not load the 3D view.")}
        <button type="button" className="pressable rounded-control bg-fill px-3 py-1.5 text-label font-medium hover:bg-hover" onClick={this.props.retry}>
          {tr("Retry")}
        </button>
      </Notice>
    )
  }
}

export function LazyScene({ className, option, graph }: { className?: string; option?: string; graph?: boolean }) {
  const [{ Scene, attempt }, setLoad] = useState(() => ({ Scene: load(), attempt: 0 }))
  return (
    <Boundary key={attempt} className={className} retry={() => setLoad((c) => ({ Scene: load(), attempt: c.attempt + 1 }))}>
      <Suspense fallback={<Notice className={className}>{tr("Loading 3D…")}</Notice>}>
        <Scene className={className} option={option} graph={graph} />
      </Suspense>
    </Boundary>
  )
}
