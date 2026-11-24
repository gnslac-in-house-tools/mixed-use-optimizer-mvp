// The live data, as the app holds it right now: selection, history, metrics, issues, masses, rules.
// Rows the last event changed are marked, so the data answers to what you just did.
import type { Footprint } from '../../model/schema.ts'
import type { StateSnapshot, TraceEvent } from '../../state/trace/tracer.ts'
import { m, m2, pct } from '../../views/format.ts'

const shape = (f: Footprint) =>
  f.kind === 'rect' ? `rect ${m(f.width)} × ${m(f.depth)} · ${f.rotation}°` : `contour · ${f.contour.vertices.length} corners`

function Title({ children }: { children: string }) {
  return <h3 className="text-caption text-ink-tertiary">{children}</h3>
}

export function StatePanel({ state, last }: { state: StateSnapshot | null; last: TraceEvent | null }) {
  if (!state) return <p className="p-panel-pad text-caption text-ink-tertiary">Waiting for the app to send its state…</p>
  const { project, metrics, issues, masses, selection, history, dragging } = state
  const changed = new Set(last?.changes.map((c) => c.path) ?? [])
  const touched = (prefix: string) => [...changed].some((p) => p === prefix || p.startsWith(`${prefix}.`))
  const mark = (on: boolean) => (on ? { background: 'color-mix(in srgb, var(--flow-call) 10%, var(--panel))' } : undefined)

  return (
    <div className="flex flex-col gap-4 px-panel-pad py-3 text-caption">
      <section className="flex flex-wrap gap-2">
        <span className="rounded-pill bg-fill px-2 py-1">selection: {selection.massId ?? 'none'}{selection.vertex !== null && ` · corner ${selection.vertex + 1}`}</span>
        <span className="rounded-pill bg-fill px-2 py-1">
          {history.past} undo · {history.future} redo
        </span>
        {dragging && <span className="rounded-pill bg-fill px-2 py-1 text-flow-call">dragging</span>}
      </section>

      <section className="flex flex-col gap-1">
        <Title>Metrics (derived)</Title>
        <div className="grid grid-cols-2 gap-x-3">
          <span className="text-ink-secondary">Site</span>
          <span className="text-right tabular-nums">{m2(metrics.siteArea)}</span>
          <span className="text-ink-secondary">Buildable</span>
          <span className="text-right tabular-nums">{m2(metrics.buildableArea)}</span>
          <span className="text-ink-secondary">Built footprint</span>
          <span className="text-right tabular-nums">{m2(metrics.builtFootprint)}</span>
          <span className="text-ink-secondary">Coverage</span>
          <span className="text-right tabular-nums">{metrics.coverage === null ? '—' : pct(metrics.coverage)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <Title>{`Issues (${issues.length})`}</Title>
        {issues.length === 0 ? (
          <span className="text-status-within">All rules met.</span>
        ) : (
          issues.map((i, k) => (
            <span key={k} className={i.severity === 'error' ? 'text-status-over' : 'text-ink'}>
              {i.code} · {i.massIds.join(', ') || 'project'}
            </span>
          ))
        )}
      </section>

      <section className="flex flex-col gap-1">
        <Title>{`Masses (${project.masses.length})`}</Title>
        <table className="w-full">
          <tbody>
            {project.masses.map((x) => (
              <tr key={x.id} className="align-top" style={mark(touched(`masses.${x.id}`))}>
                <td className={`py-1 pr-2 ${selection.massId === x.id ? 'text-flow-call' : ''}`}>{x.id}</td>
                <td className="py-1 pr-2">
                  {x.name}
                  <div className="text-ink-tertiary">
                    {x.programId ?? 'no program'} · {x.levelId} · {shape(x.footprint)} · h {x.height === undefined ? 'level' : m(x.height)}
                  </div>
                </td>
                <td className="whitespace-nowrap py-1 text-right tabular-nums">
                  {masses[x.id] ? m2(masses[x.id].area) : '—'}
                  {masses[x.id] && !masses[x.id].built && <div className="text-ink-tertiary">not built</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-1" style={mark(touched('site'))}>
        <Title>Site rules</Title>
        <span>
          setback {m(project.site.rules.setback)} · max coverage{' '}
          {project.site.rules.maxCoverage === null ? 'none' : pct(project.site.rules.maxCoverage)}
        </span>
      </section>

      <details>
        <summary className="cursor-pointer text-ink-tertiary">Project JSON</summary>
        <pre className="mt-1 max-h-[24rem] overflow-auto rounded-control bg-panel-sunken p-2 font-mono">{JSON.stringify(project, null, 2)}</pre>
      </details>
    </div>
  )
}
