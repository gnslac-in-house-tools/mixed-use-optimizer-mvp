// Optimize's badge on its action at the left rail's end (Decisions "Optimizer button", "Areas rail"): while a run goes,
// how far it is, over the icon, and a bar that fills under it, whatever tabs are open. The rail draws the action itself.
import { progressOf, useRun } from '../run/store.ts'
// the last run comes back after a reload (Decision "Last run kept")
import '../run/lastRun.ts'

export default function OptimizeBadge() {
  const run = useRun((s) => s.run)
  if (!run || run.status !== 'running') return null
  const progress = progressOf(run)
  return (
    <>
      <span data-progress className="absolute -right-0.5 -top-0.5 rounded-pill bg-ink px-1 text-[0.625rem] font-semibold leading-tight tabular-nums text-on-ink">
        {Math.round(progress * 100)} %
      </span>
      <span aria-hidden className="absolute inset-x-1.5 bottom-0.5 h-0.5 overflow-hidden rounded-pill bg-separator">
        <span className="block h-full bg-ink" style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
    </>
  )
}
