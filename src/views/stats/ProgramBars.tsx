// Footprint by program (port of Plaza-Practiko `vistas/tablero/BarrasPrograma.tsx`): one bar per program, in its
// colour, whose width is its share of the total; the largest first. A program that is not built (outdoor storage)
// shows too: it is ground the project uses. In the Overview's group of that name (Overview.tsx): a click on a program
// isolates it (Decision "Isolate in the Overview"), and `expanded` lists its masses under it. Always the whole option's,
// so another program can be picked while one is isolated.
import { useApp } from '../../state/store.ts'
import { m2, pct } from '../format.ts'
import { useIsolate } from './isolate.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function ProgramBars({ expanded = false }: { expanded?: boolean }) {
  const byProgram = useApp((s) => s.derived.metrics.footprintByProgram)
  const programs = useApp((s) => s.project.programs)
  const masses = useApp((s) => s.project.masses)
  const derived = useApp((s) => s.derived.masses)
  const isolated = useIsolate((s) => (s.isolated?.kind === 'program' ? s.isolated.id : null))
  const rows = Object.entries(byProgram)
    .filter(([, area]) => area > 0)
    .map(([id, area]) => {
      const p = programs.find((g) => g.id === id)
      return { id, area, name: p?.name ?? 'No program', color: p?.color ?? 'var(--fill)' }
    })
    .sort((a, b) => b.area - a.area)
  const total = rows.reduce((s, r) => s + r.area, 0)

  if (rows.length === 0) return <p className="text-caption text-ink-secondary">{tr("No masses yet.")}</p>
  return (
    <ul aria-label="Footprint by program" className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const share = r.area / total
        const on = isolated === r.id
        const own = expanded ? masses.filter((m) => (m.programId ?? 'none') === r.id && derived[m.id]) : []
        return (
          <li key={r.id}>
            <button
              type="button"
              aria-pressed={on}
              title={on ? `Show everything` : `Isolate ${r.name}: the plan, the 3D and the figures, its masses alone`}
              onClick={() => useIsolate.getState().toggle('program', r.id)}
              className={`-mx-1.5 block w-[calc(100%+0.75rem)] rounded-control px-1.5 py-1 text-left hover:bg-hover ${on ? 'bg-fill' : ''}`}
            >
              <span className="flex items-baseline justify-between gap-3 text-body">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                  <span className={`truncate ${on ? 'font-medium' : ''}`}>{r.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {m2(r.area)} <span className="text-label text-ink-secondary">· {pct(share)}</span>
                </span>
              </span>
              <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-fill">
                <span data-bar={r.id} className="block h-full rounded-pill" style={{ width: `${share * 100}%`, background: r.color }} />
              </span>
            </button>
            {own.length > 0 && (
              <ul aria-label={`${r.name}'s masses`} className="mb-1 ml-4 mt-0.5 flex flex-col gap-0.5">
                {own.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 text-label text-ink-secondary">
                    <span className="truncate">{m.name}</span>
                    <span className="tabular-nums">{m2(derived[m.id].area)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
