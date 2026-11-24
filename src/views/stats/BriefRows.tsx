// The Summary's *Against the brief* tab (Decisions "Brief" and "Summary tabs"; the user: "these stats should be
// somewhere else, maybe in Summary but in another tab"): each program with a target, or with something in the active
// option, against the brief:
//   Option  its area in the option (floor area; ground for open programs), coloured as it stands (±5 % meets it)
//   Δ       that area minus the target, and as a share of it
//   Now     its masses over the target count
// and the totals of the programs with a target area. Read-only; the targets are set in the Brief workspace, which the
// link opens.
import { briefRows, briefTotals, type BriefStatus } from '../../engine/brief.ts'
import { useApp } from '../../state/store.ts'
import { STATUS_TEXT, STATUS_WORD } from '../brief/columns.tsx'
import { m2, whole } from '../format.ts'
import { useUi } from '../layout/ui.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±')
/** The difference with its sign, its unit in the header: +120, −1,600, ±0. */
const delta = (v: number) => `${sign(v)}${whole(Math.abs(v))}`
/** The difference as a share of the target: −36 %. */
const share = (v: number, target: number) => (target > 0 ? `${sign(Math.round((v / target) * 100))}${Math.abs(Math.round((v / target) * 100))} %` : null)

const tint = (s: BriefStatus | null) => (s ? STATUS_TEXT[s] : '')

export function BriefRows() {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const inBrief = useUi((s) => s.dialog === 'brief')
  const all = briefRows(project, derived)
  const rows = all.filter((r) => r.targetArea !== null || r.targetCount !== null || r.area > 0 || r.count > 0)
  const asked = all.some((r) => r.targetArea !== null || r.targetCount !== null)
  const totals = briefTotals(all)
  const programs = new Map(project.programs.map((g) => [g.id, g]))
  const open = () => useUi.getState().openDialog('brief')
  const link = (
    <button type="button" onClick={open} className="pressable rounded-control underline underline-offset-2 hover:text-ink">
      {tr("Brief")}
    </button>
  )
  const head = 'pb-1.5 text-right font-medium'

  return (
    <section aria-label="Against the brief" className="flex flex-col gap-3">
      {!asked && <p className="text-caption text-ink-secondary">No targets yet: set them in the {link}.</p>}
      {rows.length > 0 && (
        <table aria-label="The option against the brief" className="w-full table-fixed text-body">
          <colgroup>
            <col className="w-[39%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-separator align-bottom text-caption text-ink-secondary">
              <th className="pb-1.5 text-left font-medium">{tr("Program")}</th>
              <th className={head} title={tr("What the active option has: its floor area (ground area for open programs)")}>
                {tr("Option")}<span className="block font-normal text-ink-tertiary">m²</span>
              </th>
              <th className={head} title={tr("The option’s area minus the target, and as a share of it (±5 % meets it)")}>
                Δ<span className="block font-normal text-ink-tertiary">m²</span>
              </th>
              <th className={head} title={tr("How many masses of it the active option has, against the target")}>
                {tr("Now")}<span className="block font-normal text-ink-tertiary">#</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const g = programs.get(r.programId)!
              return (
                <tr key={r.programId} data-brief-row={r.programId} className="border-b border-separator align-top last:border-b-0">
                  <td className="py-1.5 pr-2">
                    <span className="flex min-w-0 items-center gap-2" title={g.name}>
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: g.color }} />
                      <span className="truncate">{g.name}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums" title={r.areaStatus ? `${m2(r.area)}: ${STATUS_WORD[r.areaStatus]}` : undefined}>
                    <span className={tint(r.areaStatus)}>{whole(r.area)}</span>
                    {r.targetArea !== null && <span className="block text-caption text-ink-tertiary">of {whole(r.targetArea)}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.targetArea === null ? (
                      <span className="text-ink-tertiary">—</span>
                    ) : (
                      <>
                        <span className={tint(r.areaStatus)}>{delta(r.area - r.targetArea)}</span>
                        <span className="block text-caption text-ink-tertiary">{share(r.area - r.targetArea, r.targetArea)}</span>
                      </>
                    )}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${tint(r.countStatus)}`} title={r.countStatus ? STATUS_WORD[r.countStatus] : undefined}>
                    {r.targetCount === null ? r.count : `${r.count} / ${r.targetCount}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {totals.targetArea !== null && (
            <tfoot>
              <tr className="border-t-2 border-separator align-top text-label">
                <th scope="row" className="pt-2 text-left font-semibold">
                  {tr("Total")}
                </th>
                <td className="pt-2 text-right tabular-nums">
                  <span className={tint(totals.status)}>{whole(totals.area)}</span>
                  <span className="block text-caption font-normal text-ink-tertiary">of {whole(totals.targetArea)}</span>
                </td>
                <td className="pt-2 text-right tabular-nums">
                  <span className={tint(totals.status)}>{delta(totals.area - totals.targetArea)}</span>
                  <span className="block text-caption font-normal text-ink-tertiary">{share(totals.area - totals.targetArea, totals.targetArea)}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}
      {asked && (
        <p className="text-caption text-ink-tertiary">
          ±5 % meets a target; the totals count the programs with a target area.{!inBrief && <> The targets are set in the {link}.</>}
        </p>
      )}
    </section>
  )
}
