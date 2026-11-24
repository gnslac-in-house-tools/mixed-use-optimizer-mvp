// The Summary by building (Decision "Buildings and options"): each building of the active option with its own figures,
// footprint and floor area (GFA), from `derived.buildings`; context ones last, marked as not counted. Read-only: the
// option's totals are the Site figures and the KPI strip. In the Overview's *By building* (Overview.tsx): a click on a
// design building's name isolates it (Decision "Isolate in the Overview"), and `expanded` lists its programs under it
// (each one's floor area: its masses' areas times their levels' ×N). Always the whole option's.
import type { Id } from '../../model/schema.ts'
import { optionBuildings, optionOf } from '../../engine/buildings.ts'
import { levelOf } from '../../engine/levels.ts'
import { useApp } from '../../state/store.ts'
import { m2 } from '../format.ts'
import { useIsolate } from './isolate.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function BuildingRows({ expanded = false }: { expanded?: boolean }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const isolated = useIsolate((s) => (s.isolated?.kind === 'building' ? s.isolated.id : null))
  const rows = optionBuildings(project, optionOf(project, derived.option)).sort((a, b) => Number(a.context === true) - Number(b.context === true))
  // a building's programs, each with its floor area
  const programsOf = (id: Id) => {
    const by = new Map<string, number>()
    for (const m of project.masses) {
      const d = derived.masses[m.id]
      if (!d || d.buildingId !== id) continue
      const key = m.programId ?? 'none'
      by.set(key, (by.get(key) ?? 0) + d.area * levelOf(project, m).repeat)
    }
    return [...by].map(([pid, area]) => {
      const g = project.programs.find((x) => x.id === pid)
      return { id: pid, name: g?.name ?? 'No program', color: g?.color ?? 'var(--fill)', area }
    })
  }

  if (rows.length === 0) return <p className="text-caption text-ink-secondary">{tr("No buildings in this option.")}</p>
  return (
    <table aria-label="By building" className="w-full table-fixed text-body">
      <thead>
        <tr className="text-left text-caption text-ink-secondary">
          <th className="w-[44%] pb-1 font-medium">{tr("Building")}</th>
          <th className="pb-1 text-right font-medium">{tr("Footprint")}</th>
          <th className="pb-1 text-right font-medium">GFA</th>
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((b) => {
          const f = derived.buildings[b.id]
          const on = isolated === b.id
          const name = (
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: b.context ? 'var(--context-fill)' : b.color }} />
              <span className={`truncate ${on ? 'font-medium' : ''}`}>{b.name}</span>
            </span>
          )
          const row = (
            <tr key={b.id} data-building-row={b.id} className={b.context ? 'text-ink-secondary' : on ? 'bg-fill' : ''}>
              <td className="py-0.5 pr-2">
                {b.context ? (
                  name
                ) : (
                  <button
                    type="button"
                    aria-pressed={on}
                    title={on ? 'Show everything' : `Isolate ${b.name}: the plan, the 3D and the figures, its masses alone`}
                    onClick={() => useIsolate.getState().toggle('building', b.id)}
                    className="-mx-1 block w-[calc(100%+0.5rem)] rounded-control px-1 text-left hover:bg-hover"
                  >
                    {name}
                  </button>
                )}
                {b.context && <span className="block text-caption">context, not counted</span>}
              </td>
              <td className="py-0.5 text-right tabular-nums">{m2(f?.footprint ?? 0)}</td>
              <td className="py-0.5 text-right tabular-nums">{m2(f?.gfa ?? 0)}</td>
            </tr>
          )
          if (!expanded || b.context) return [row]
          return [
            row,
            ...programsOf(b.id).map((g) => (
              <tr key={`${b.id}:${g.id}`} data-building-program={g.id} className="text-label text-ink-secondary">
                <td className="py-0.5 pl-4 pr-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: g.color }} />
                    <span className="truncate">{g.name}</span>
                  </span>
                </td>
                <td />
                <td className="py-0.5 text-right tabular-nums">{m2(g.area)}</td>
              </tr>
            )),
          ]
        })}
      </tbody>
    </table>
  )
}
