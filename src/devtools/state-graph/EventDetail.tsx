// Everything one event carries: who called, each call with its args and time, what changed, issues, history.
// For a drag, the last step, plus how many steps and rejections it had.
import type { ReactNode } from 'react'
import type { TraceEvent } from '../../state/trace/tracer.ts'
import { fmtArgs, fmtMs, fmtTime } from './roles.ts'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2 text-caption">
      <span className="text-ink-tertiary">{label}</span>
      <span className="min-w-0 break-words text-ink">{children}</span>
    </div>
  )
}

export function EventDetail({ events }: { events: TraceEvent[] }) {
  const e = events[events.length - 1]
  const rejected = events.filter((x) => x.rejected).length
  return (
    <div className="flex flex-col gap-2 px-panel-pad py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-label">
          store.{e.door}
          {e.rejected && <span className="text-flow-reject"> · rejected</span>}
        </h2>
        <span className="text-caption tabular-nums text-ink-tertiary">
          #{e.seq} · {fmtTime(e.at)} · {fmtMs(e.ms)}
        </span>
      </div>
      <Row label="Called from">{e.origin ?? 'unknown'}</Row>
      {events.length > 1 && (
        <Row label="Drag">
          {events.length} previews{rejected > 0 && `, ${rejected} rejected`} · showing the last
        </Row>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-caption text-ink-tertiary">Calls</span>
        {e.calls.length === 0 ? (
          <span className="text-caption text-ink-secondary">None: this door only moves state.</span>
        ) : (
          <table className="w-full text-caption">
            <tbody>
              {e.calls.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className={`pr-2 ${c.module.startsWith('engine/') ? 'text-flow-engine' : 'text-flow-call'}`}>{c.name}</td>
                  <td className="break-all pr-2 font-mono text-ink-secondary" title={c.module}>
                    ({fmtArgs(c.args)})
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums text-ink-tertiary">{fmtMs(c.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Row label="New slices">{e.slices.length ? e.slices.join(', ') : 'none (no view re-renders)'}</Row>
      <Row label="Changed">
        {e.changes.length === 0
          ? 'nothing in the project'
          : e.changes.map((c) => (
              <span key={c.path} className="mr-2 inline-block font-mono">
                {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '~'} {c.path}
              </span>
            ))}
      </Row>
      <Row label="Issues">
        {e.issues.total} open
        {e.issues.added.map((i) => (
          <span key={`a${i.code}${i.massIds}`} className="ml-2 text-flow-reject">
            + {i.code} ({i.massIds.join(', ')})
          </span>
        ))}
        {e.issues.resolved.map((i) => (
          <span key={`r${i.code}${i.massIds}`} className="ml-2 text-flow-data">
            ✓ {i.code} ({i.massIds.join(', ')})
          </span>
        ))}
      </Row>
      <Row label="History">
        {e.history.past} undo · {e.history.future} redo{e.dragging && ' · dragging'}
      </Row>
      <Row label="Selection">
        {e.selection.massId ?? 'none'}
        {e.selection.vertex !== null && ` · corner ${e.selection.vertex + 1}`}
      </Row>
    </div>
  )
}
