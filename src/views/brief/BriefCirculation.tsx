// The Brief's *Circulation* tab (Phase K.4, Decision "Program rule set layout"): the circulation's standards (what the
// roads, gates, courts and stalls are made with, the road widths' ranges the optimizer searches), the street types
// (StreetTypesSection.tsx, ST.3) under them, and under them, or
// beside them on a wide window, the *Demand*: what each program asks of the parking (a car stall per so many m² of its
// floor; trailer stalls per dock door of its masses, where the typology has docks) and how many that makes in the
// active option. The car stalls short are an Issue in Flow and a KPI (`stalls-short`), the Parking stage's target.
import { demandOf } from '../../modules/parking/engine/demand.ts'
import { optionOf } from '../../engine/buildings.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { CellField } from '../controls/fields.tsx'
import { Note } from '../layout/Note.tsx'
import { useModule } from '../modules.ts'
import { StandardsSection } from './StandardsSection.tsx'
import { StreetTypesSection } from './StreetTypesSection.tsx'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function BriefCirculation() {
  return (
    <div className="grid min-w-0 gap-x-10 gap-y-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <StandardsSection />
        <StreetTypesSection />
      </div>
      <DemandSection />
    </div>
  )
}

function DemandSection() {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const apply = useApp((s) => s.apply)
  // the trailer stalls follow the docks, which a typology offers (Decision "What is not there is not shown")
  const docks = useModule('docks').offered
  const d = demandOf(project, derived.metrics.areaByProgram, derived.circulation.docks)
  const stalls = derived.circulation.totals.stalls
  const option = optionOf(project, derived.option)
  const set = (id: string, k: 'carStalls' | 'trailerStalls', v: string) => apply((p) => actions.setProgramDemand(p, id, { [k]: v === '' ? null : Number(v) }))
  const asks = (n: number | null) => (n === null ? '—' : String(n))

  return (
    <section aria-label="Demand" className="flex min-w-0 flex-col gap-2">
      <h3 className="text-label font-semibold text-ink">{tr("Demand")}</h3>
      <Note>What each program asks of the parking; what it makes is {option.name}’s, from its floor area{docks ? ' and its dock doors' : ''}. Empty: it asks none.</Note>
      <table aria-label="Parking demand" className="w-full table-fixed text-body">
        <thead>
          <tr className="border-b border-separator text-left align-bottom text-caption text-ink-secondary">
            <th className="w-[32%] pb-1.5 font-medium">{tr("Program")}</th>
            <th className="pb-1.5 pr-2 text-right font-medium" title="A car stall per so many m² of the program’s floor (GFA; ground for an open one)">
              {tr("Car stalls")}<span className="block font-normal text-ink-tertiary">1 per m²</span>
            </th>
            <th className="pb-1.5 pr-2 text-right font-medium">{tr("Asks")}</th>
            {docks && (
              <>
                <th className="pb-1.5 pr-2 text-right font-medium" title="Trailer stalls per dock door of the program’s masses">
                  {tr("Trailer stalls")}<span className="block font-normal text-ink-tertiary">per door</span>
                </th>
                <th className="pb-1.5 text-right font-medium">{tr("Asks")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {project.programs.map((g, k) => (
            <tr key={g.id} className="border-b border-separator last:border-b-0">
              <td className="truncate py-1.5 pr-2">
                <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-pill border border-separator align-middle" style={{ background: g.color }} />
                {g.name}
              </td>
              <td className="py-1.5 pr-2 text-right">
                <CellField label={`${g.name} car stall per m²`} value={g.demand?.carStalls ?? null} number={{ min: 1 }} step={5} optional placeholder="—" onCommit={(v) => set(g.id, 'carStalls', v)} />
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-ink-secondary">{asks(d.rows[k].carStalls)}</td>
              {docks && (
                <>
                  <td className="py-1.5 pr-2 text-right">
                    <CellField label={`${g.name} trailer stalls per door`} value={g.demand?.trailerStalls ?? null} number={{ min: 0.1 }} step={0.5} optional placeholder="—" onCommit={(v) => set(g.id, 'trailerStalls', v)} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-ink-secondary">{asks(d.rows[k].trailerStalls)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-separator text-label">
            <th scope="row" className="pt-2 text-left font-semibold">
              {tr("Total")}
            </th>
            <td />
            <td className="pt-2 pr-2 text-right tabular-nums">{asks(d.carStalls)}</td>
            {docks && (
              <>
                <td />
                <td className="pt-2 text-right tabular-nums">{asks(d.trailerStalls)}</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
      <dl aria-label="Against the demand" className="flex flex-col gap-1 text-caption text-ink-secondary">
        <div className="flex flex-wrap gap-x-1.5">
          <dt>Car stalls along {option.name}’s roads:</dt>
          <dd className="tabular-nums text-ink">
            {stalls}
            {d.carStalls !== null && (stalls >= d.carStalls ? ', the demand met' : `, ${d.carStalls - stalls} short (an Issue in Flow; the Parking stage’s target)`)}
          </dd>
        </div>
        {docks && d.trailerStalls !== null && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt>Trailer stalls:</dt>
            <dd>asked only; where they stand (a trailer yard) comes later.</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
