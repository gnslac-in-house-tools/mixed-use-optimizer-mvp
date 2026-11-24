// The KPI table under the panes (Decision "Compare options"): one column per option, read from the engine's registry
// for each option (`asOption`), so every figure is the same one the strip shows when that option is active.
//   KPIs          the strip's choice, then the core ones it leaves out (footprint, coverage, GFA, volume, counts, issues)
//   By building   each building of the compared options with its GFA; — where an option does not show it; 🔗 when
//                 several of them show it (the same building: the same figure); context ones say so, not counted
// Its columns line up with the panes above (the user: "the text of Option 1 goes past the middle"): the names take the
// left half of the first pane's width, so each option's figures end where its pane ends.
// Versions (9.3) will reuse it, one column per version.
import { asOption } from '../../engine/derive.ts'
import { chosenKpis, readKpi } from '../../modules/catalog.ts'
import type { DesignOption } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { Icon } from '../controls/Icon.tsx'
import { formatFigure, m2 } from '../format.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** Figures worth comparing even when the strip does not show them. Site area and buildable area are the same for all. */
const CORE = ['built-footprint', 'coverage', 'gfa', 'built-volume', 'buildings', 'masses', 'issues']

const STATUS_COLOR = { over: 'var(--status-over)', within: 'var(--status-within)' } as const

export function CompareTable({ options }: { options: DesignOption[] }) {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const active = useApp((s) => s.option)
  const results = options.map((o) => asOption(derived, o.id))
  const ids = [...new Set([...chosenKpis(project).filter((id) => !id.startsWith('building:')), ...CORE])]
  const buildings = project.buildings.filter((b) => options.some((o) => o.buildingIds.includes(b.id)))

  return (
    <table aria-label="Options compared" className="w-full table-fixed border-collapse text-body">
      <colgroup>
        {/* a pane is 100/N % wide: the names, half of the first; its figures, the other half; the rest, a pane each */}
        <col style={{ width: `${50 / options.length}%` }} />
        {options.map((o, i) => (
          <col key={o.id} style={{ width: `${(i === 0 ? 50 : 100) / options.length}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-separator text-left text-caption text-ink-secondary">
          <th className="px-3 py-2 font-medium">KPI</th>
          {options.map((o) => (
            <th key={o.id} className="truncate px-3 py-2 text-right font-medium">
              {o.name}
              {o.id === active && <span className="text-ink-tertiary"> · active</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const reads = results.map((d) => readKpi(id, project, d))
          const first = reads.find((r) => r !== null)
          if (!first) return null
          return (
            <tr key={id} data-kpi-row={id} className="border-b border-separator">
              <th scope="row" className="truncate px-3 py-1.5 text-left text-label font-normal text-ink-secondary">
                {first.label}
              </th>
              {reads.map((r, i) => (
                <td key={options[i].id} className="px-3 py-1.5 text-right tabular-nums">
                  {r?.status && (
                    <span aria-hidden data-status={r.status} className="mr-1.5 inline-block h-2 w-2 rounded-pill align-middle" style={{ background: STATUS_COLOR[r.status] }} />
                  )}
                  {formatFigure(r?.value ?? null, first.unit)}
                </td>
              ))}
            </tr>
          )
        })}
        <tr>
          <th scope="rowgroup" colSpan={options.length + 1} className="px-3 pb-1 pt-3 text-left text-caption font-medium text-ink-secondary">
            {tr("GFA by building")}
          </th>
        </tr>
        {buildings.map((b) => {
          const showing = options.filter((o) => o.buildingIds.includes(b.id))
          return (
            <tr key={b.id} data-building-row={b.id} className="border-b border-separator">
              <th scope="row" className="px-3 py-1.5 text-left text-label font-normal text-ink-secondary">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: b.context ? 'var(--context-fill)' : b.color }} />
                  <span className="truncate">{b.name}</span>
                  {showing.length > 1 && (
                    <span title={`The same building in ${showing.map((o) => o.name).join(', ')}`} className="shrink-0">
                      <Icon name="link" className="h-3.5 w-3.5" />
                      <span className="sr-only">, linked</span>
                    </span>
                  )}
                </span>
              </th>
              {options.map((o) => (
                <td key={o.id} className="px-3 py-1.5 text-right tabular-nums">
                  {!o.buildingIds.includes(b.id) ? '—' : b.context ? <span className="text-caption text-ink-secondary">context</span> : m2(derived.buildings[b.id]?.gfa ?? 0)}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
