// The log, newest first. A drag is one row (its previews grouped); click a row to show it on the map.
import type { LogRow } from './log.ts'
import { callLine, shortPath } from './log.ts'
import { fmtMs, fmtTime } from './roles.ts'

const SHOWN = 400 // rows rendered; older ones stay in memory (heat counts) but off screen

export function EventLog(props: { rows: LogRow[]; shown: string | null; selected: string | null; onSelect(key: string | null): void }) {
  const { rows, shown, selected, onSelect } = props
  const recent = rows.slice(-SHOWN).reverse()
  if (recent.length === 0) {
    return <p className="p-panel-pad text-caption text-ink-tertiary">No events yet. Use the app: every store call shows up here.</p>
  }
  return (
    <ol className="flex flex-col" aria-label="Events">
      {recent.map((r) => {
        if (r.kind === 'app') {
          return (
            <li key={r.key} className="flex items-center gap-2 px-panel-pad py-1 text-caption text-ink-tertiary">
              <span className="h-px flex-1 bg-separator" />
              App {r.status === 'connected' ? 'loaded' : 'closed'} · {fmtTime(r.at)}
              <span className="h-px flex-1 bg-separator" />
            </li>
          )
        }
        const last = r.events[r.events.length - 1]
        const rejected = r.events.filter((e) => e.rejected).length
        const changes = new Set(r.events.flatMap((e) => e.changes.map((c) => c.path))).size
        const isShown = r.key === shown
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onSelect(r.key === selected ? null : r.key)}
              className={`grid w-full grid-cols-[5.5rem_4.5rem_1fr_auto] items-baseline gap-2 px-panel-pad py-1 text-left text-caption hover:bg-hover ${isShown ? 'bg-fill' : ''}`}
            >
              <span className="tabular-nums text-ink-tertiary">{fmtTime(last.at)}</span>
              <span className={last.rejected ? 'text-flow-reject' : 'text-ink'}>
                {last.door}
                {r.events.length > 1 && ` ×${r.events.length}`}
              </span>
              <span className="truncate text-ink-secondary">
                {shortPath(last.origin)} → {callLine(last)}
                {rejected > 0 && <span className="text-flow-reject"> · {rejected} rejected</span>}
                {changes > 0 && ` · ${changes} changed`}
              </span>
              <span className="tabular-nums text-ink-tertiary">{fmtMs(last.ms)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
