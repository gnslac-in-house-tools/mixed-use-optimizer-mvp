// A stage's settings, as its window shows them (Decisions "Optimize tab", "Stages layout"), each edit on the window's
// draft of the stage's own template:
//   What may change  a box per kind the stage moves, by area (Decision "Stage window by area"), with its step and range;
//                    + What may change offers the others; how many genes, masses, fixed ones
//   Objectives       ↓ min / ↑ max, each with the design's own figure; + Objective by area (up to 4 read well), without
//                    what is never an objective; one the typology's stage carries is marked "from the typology"
//   Must hold        the fixed rules as one locked line, the COS (strict, or allow +N points), and the typology's
//                    other constraints, each ≤ a value, ✓ or the design's excess (Decision "Fixed constraints")
// The kinds and measures are the catalog's (Decisions "Catalog", "What is not there is not shown"): what may change and
// what is offered to aim at are those of the modules on for the project; a saved one of a module that is off, or one
// that is never offered, is still named (and kept), never offered.
//   Margin           each kind an earlier stage varied: ± its steps, 0 frozen
//   Budget           population, generations, seed: how many specimens and about how long
// The design's figures come from the same measures a run uses, on the stage's input.
import { useMemo, useState, type ReactNode } from 'react'
import { CellField } from '../../../../views/controls/fields.tsx'
import { Icon } from '../../../../views/controls/Icon.tsx'
import { formatFigure, m as metres, whole } from '../../../../views/format.ts'
import type { Project } from '../../../host.ts'
import { AREAS, measureCatalog, objectivesOn, paramKind, paramKindsOn, type Area } from '../../../../modules/catalog.ts'
import type { Measure, MeasureUnit, ParamKind } from '../../../../modules/types.ts'
import { summaryOf } from '../../engine/problem.ts'
import { COS, FIXED_RULES, type Template } from '../../engine/template.ts'
import { selectClass } from '../kit.ts'
import { t as tr } from '../../../../i18n/idioma.ts' // mixed-use-mvp

/** More objectives than this and NSGA-II tells them apart less well. */
const READ_WELL = 4

export type Edit = (f: (t: Template) => Template) => void

/** A figure in its measure's unit: "424 m²", "313 m", "22.6 %". */
export const fmt = (v: number | undefined, unit: MeasureUnit) => (v === undefined ? '—' : unit === 'm' ? metres(Math.round(v * 10) / 10) : formatFigure(v, unit))
/** A value as typed in a field: a share as a percentage. */
const shown = (v: number, unit: MeasureUnit) => (unit === 'pct' ? Math.round(v * 1000) / 10 : v)
const typed = (v: number, unit: MeasureUnit) => (unit === 'pct' ? v / 100 : v)

/** The template's genes and every measure of the design at once (one derive), timed for the budget's estimate; the
 *  kinds the project offers (its modules on) and the measures *+ Objective* offers (`aimable`). */
export function useSummary(project: Project, optionId: string, t: Template) {
  const measures = useMemo(() => measureCatalog(project), [project])
  const aimable = useMemo(() => objectivesOn(project), [project])
  const kinds = useMemo(() => paramKindsOn(project), [project])
  const key = JSON.stringify(t.variables)
  const summary = useMemo(() => {
    const t0 = performance.now()
    const s = summaryOf(project, optionId, { ...t, objectives: measures.map((m) => ({ measure: m.id, sense: 'min' as const })), constraints: [] })
    const figures = new Map(measures.map((m, i) => [m.id, s.design.objectives[i]]))
    return { ...s, figures, ms: performance.now() - t0 }
    // t's variables are in `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, optionId, key, measures])
  return { measures, aimable, kinds, summary }
}
export type Summary = ReturnType<typeof useSummary>['summary']

export function Heading({ title, right }: { title: string; right?: string }) {
  return (
    <h2 className="flex items-baseline justify-between text-label text-ink-secondary">
      {title}
      {right && <span className="text-caption text-ink-tertiary">{right}</span>}
    </h2>
  )
}

export function Small({ children, onClick, title, label, disabled }: { children: ReactNode; onClick(): void; title: string; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="pressable h-row shrink-0 rounded-control bg-fill px-2 text-label text-ink hover:bg-hover disabled:opacity-50"
    >
      {children}
    </button>
  )
}

const AREA_LABEL: Record<Area, string> = { site: 'Site', massing: 'Massing', flow: 'Flow' }

/** `kinds`: those of the modules on; `own`: the ids of the kinds the stage moves (its saved template's, margin aside):
 *  the rows listed. A kind the draft ticks, or chose to add, gets a row too, and keeps it when unticked. */
export function MayChange({ template: t, edit, summary, kinds, own: ownKinds }: { template: Template; edit: Edit; summary: Summary; kinds: ParamKind[]; own: string[] }) {
  const [added, setAdded] = useState<string[]>([])
  const listed = kinds.filter((k) => ownKinds.includes(k.id) || added.includes(k.id) || t.variables.some((x) => x.kind === k.id))
  const offer = kinds.filter((k) => !listed.includes(k))
  const add = (id: string) => {
    const k = kinds.find((x) => x.id === id)
    if (!k) return
    setAdded((a) => [...a, id])
    edit((x) => ({ ...x, variables: x.variables.some((y) => y.kind === id) ? x.variables : [...x.variables, { kind: id, step: k.step }] }))
  }
  const masses = [...summary.ctx.units.values()].flat().length
  // the masses that move as one (a warehouse copy's one mass, a building's masses that touch): a unit each
  const units = summary.ctx.units.size
  const fixed = summary.ctx.fixed.size
  const knobs = summary.ctx.knobs.length
  // the stage's own genes (an earlier stage's kinds are its margin)
  const own = summary.variables.filter((v) => t.variables.some((x) => x.kind === v.kind && x.margin === undefined))
  const count = (kind: string) => own.filter((v) => v.kind === kind).length
  const gates = count('gate.position')
  return (
    <section aria-label="What may change" className="flex flex-col gap-1.5">
      <Heading title={tr("What may change")} />
      {AREAS.map((area) => {
        const rows = listed.filter((k) => k.area === area)
        return rows.length === 0 ? null : (
          <div key={area} className="flex flex-col gap-1.5">
            <h3 className="text-caption uppercase tracking-wide text-ink-tertiary">{AREA_LABEL[area]}</h3>
            {rows.map((k) => {
              const v = t.variables.find((x) => x.kind === k.id)
              const on = v !== undefined
              const step = v?.step ?? k.step
              const range = v?.range ?? k.range ?? 0
              const set = (patch: { step?: number; range?: number }) =>
                edit((x) => ({ ...x, variables: x.variables.map((y) => (y.kind === k.id ? { ...y, ...patch } : y)) }))
              const toggle = (yes: boolean) =>
                edit((x) => ({ ...x, variables: yes ? [...x.variables, { kind: k.id, step: k.step }] : x.variables.filter((y) => y.kind !== k.id) }))
              const field = (label: string, value: number, commit: (n: number) => void, integer = false) => (
                <span className="w-12 shrink-0">
                  <CellField label={`${k.label} ${label}`} value={value} number={{ min: integer ? 1 : 0.1, integer }} disabled={!on} onCommit={(s) => Number(s) > 0 && commit(Number(s))} />
                </span>
              )
              const word = (w: string) => <span className="shrink-0 text-caption text-ink-tertiary">{w}</span>
              return (
                <div key={k.id} className="flex items-center gap-1.5">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2" title={`${k.label}: ${k.help}`}>
                    <input type="checkbox" className="h-4 w-4 accent-ink" checked={on} onChange={(e) => toggle(e.target.checked)} />
                    <span className={`truncate text-label ${on ? 'text-ink' : 'text-ink-secondary'}`}>{k.label}</span>
                  </label>
                  {k.fields === 'step' && (
                    <>
                      {word('every')}
                      {field('step', step, (n) => set({ step: n }))}
                      {word(k.hint)}
                    </>
                  )}
                  {k.fields === 'range-step' && (
                    <>
                      {word('±')}
                      {field('range', range, (n) => set({ range: n }))}
                      {word(`${k.hint} by`)}
                      {field('step', step, (n) => set({ step: n }))}
                    </>
                  )}
                  {k.fields === 'hall' && (
                    <>
                      {word('±')}
                      {field('range', range, (n) => set({ range: n }), true)}
                      {word('bays by')}
                      {field('step', step, (n) => set({ step: n }), true)}
                      {word('mod')}
                    </>
                  )}
                  {k.fields === 'switch' && word('on or off')}
                  {k.fields === 'choice' && word(k.hint)}
                  {k.fields === 'modules' && word('by its modules')}
                  {k.fields === 'floors' && (
                    <>
                      {word('1 to')}
                      {field('most', range, (n) => set({ range: n }), true)}
                    </>
                  )}
                  {k.fields === 'share-step' && (
                    <>
                      {word('±')}
                      {field('range', Math.round(range * 100), (n) => set({ range: n / 100 }), true)}
                      {word('% by')}
                      {field('step', step, (n) => set({ step: n }))}
                      {word('m')}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {offer.length > 0 && (
        <select aria-label="Add what may change" className={selectClass} value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">+ What may change</option>
          {AREAS.map((area) => {
            const rest = offer.filter((k) => k.area === area)
            return rest.length === 0 ? null : (
              <optgroup key={area} label={AREA_LABEL[area]}>
                {rest.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      )}
      <p className="text-caption text-ink-secondary">
        {own.length === 0
          ? 'Nothing may change: tick what the search may move.'
          : [`${whole(own.length)} genes`, units === masses ? `${whole(masses)} masses` : `${whole(masses)} masses in ${whole(units)} ${units === 1 ? 'unit' : 'units'}`, fixed ? `${fixed} fixed by the brief` : '', knobs ? `${knobs} dimensions` : '', gates ? `${gates} ${gates === 1 ? 'gate' : 'gates'}` : '']
              .filter(Boolean)
              .join(' · ')}
      </p>
    </section>
  )
}

function Remove({ label, onClick, disabled }: { label: string; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled ? 'A search needs one objective at least' : label}
      disabled={disabled}
      onClick={onClick}
      className="pressable grid h-5 w-5 shrink-0 place-items-center rounded-pill text-ink-tertiary hover:bg-hover hover:text-ink disabled:invisible"
    >
      <Icon name="close" className="h-3 w-3" />
    </button>
  )
}

/** `measures`: the catalog, to name a saved one; `aimable`: those *+ Objective* offers (the modules on, without what is
 *  never an objective); `first`: the areas of the stage's own kinds, offered before the others. */
export function Objectives(props: { template: Template; edit: Edit; measures: Measure[]; aimable: Measure[]; first: Area[]; figures: Map<string, number> }) {
  const { template: t, edit, measures, aimable, first, figures } = props
  const free = aimable.filter((m) => !t.objectives.some((o) => o.measure === m.id))
  const order = [...AREAS.filter((a) => first.includes(a)), ...AREAS.filter((a) => !first.includes(a))]
  return (
    <section aria-label="Objectives" className="flex flex-col gap-1.5">
      <Heading title={tr("Objectives")} right="design" />
      {t.objectives.map((o, i) => {
        const m = measures.find((x) => x.id === o.measure)
        const label = m?.label ?? o.measure
        return (
          <div key={o.measure} className="flex items-center gap-1.5">
            <span aria-hidden className="w-3 shrink-0 text-center text-label text-ink-secondary">
              {o.sense === 'min' ? '↓' : '↑'}
            </span>
            <span className={`min-w-0 truncate text-label ${m ? 'text-ink' : 'text-status-over'}`} title={m ? `${label}: ${m.help}` : 'No measure has this name any more'}>
              {label}
            </span>
            {/* a stage of the typology aims at what is not offered any more: kept, named, removable */}
            {m?.aim === false && <FromTypology />}
            <span className="flex-1" />
            <select
              aria-label={`${label}: minimize or maximize`}
              className={selectClass}
              value={o.sense}
              onChange={(e) => edit((x) => ({ ...x, objectives: x.objectives.map((y, j) => (j === i ? { ...y, sense: e.target.value as 'min' | 'max' } : y)) }))}
            >
              <option value="min">min</option>
              <option value="max">max</option>
            </select>
            <span className="w-[4.5rem] shrink-0 text-right text-caption tabular-nums text-ink-secondary">{m ? fmt(figures.get(m.id), m.unit) : 'missing'}</span>
            <Remove label={`Remove ${label}`} disabled={t.objectives.length < 2} onClick={() => edit((x) => ({ ...x, objectives: x.objectives.filter((_, j) => j !== i) }))} />
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        <select
          aria-label="Add an objective"
          className={`${selectClass} min-w-0 flex-1`}
          value=""
          onChange={(e) => e.target.value && edit((x) => ({ ...x, objectives: [...x.objectives, { measure: e.target.value, sense: 'min' }] }))}
        >
          <option value="">+ Objective</option>
          {order.map((area) => {
            const rest = free.filter((m) => m.area === area)
            return rest.length === 0 ? null : (
              <optgroup key={area} label={AREA_LABEL[area]}>
                {rest.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
        <span className={`shrink-0 text-caption ${t.objectives.length > READ_WELL ? 'text-status-over' : 'text-ink-tertiary'}`}>
          {t.objectives.length > READ_WELL ? `${t.objectives.length}: more than ${READ_WELL} read less well` : `up to ${READ_WELL} read well`}
        </span>
      </div>
    </section>
  )
}

/** What a stage of the typology carries that the window does not offer by itself. */
function FromTypology() {
  return <span className="shrink-0 text-caption text-ink-tertiary">from the typology</span>
}

/** The COS the stage allows over the rule, in points: `max` is a share of the site's area. */
const POINTS_DEFAULT = 10
/** The points as stored, rounded; under half a point (but over 0) one decimal, never clamped up to 1. */
const pointsOf = (max: number, site: number) => {
  const p = (max / site) * 100
  return Math.round(p) > 0 || p <= 0 ? Math.round(p) : Math.max(0.1, Math.round(p * 10) / 10)
}

/**
 * Three things (Decision "Fixed constraints"): the fixed rules as one locked line, the COS as strict or a few points
 * over, and the typology's other constraints, each a line with its value. `measures`: the catalog, to name a saved one.
 */
export function MustHold(props: { template: Template; edit: Edit; measures: Measure[]; figures: Map<string, number> }) {
  const { template: t, edit, measures, figures } = props
  const fixed: readonly string[] = FIXED_RULES
  const others = t.constraints.filter((c) => !fixed.includes(c.measure) && c.measure !== COS)
  // the design's excess over the three together (each at 0)
  const excess = FIXED_RULES.map((id) => ({ id, over: figures.get(id) ?? 0 })).filter((x) => x.over > 1e-9)
  const site = figures.get('site-area') ?? 0
  const cos = t.constraints.find((c) => c.measure === COS)
  const allowed = cos !== undefined && cos.max > 1e-9
  const cosValue = figures.get(COS)
  const cosOk = cosValue !== undefined ? cosValue <= (cos?.max ?? 0) + 1e-9 : null
  const noSite = !(site > 0)
  const points = cos && !noSite ? pointsOf(cos.max, site) : 0
  const setCos = (max: number) =>
    edit((x) => ({ ...x, constraints: x.constraints.some((y) => y.measure === COS) ? x.constraints.map((y) => (y.measure === COS ? { ...y, max } : y)) : [...x.constraints, { measure: COS, max }] }))
  const segment = (label: string, on: boolean, pick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      disabled={noSite}
      title={noSite ? "COS needs the site's boundary" : label === 'Strict' ? 'Not a point over the allowed coverage' : 'Test a few points of coverage over what is allowed'}
      onClick={pick}
      className={`pressable h-5 rounded-pill px-2 text-label disabled:opacity-50 ${on ? 'bg-panel text-ink shadow-control' : 'text-ink-segment hover:text-ink'}`}
    >
      {label}
    </button>
  )
  return (
    <section aria-label="Must hold" className="flex flex-col gap-1.5">
      <Heading title={tr("Must hold")} right="design" />
      <div role="group" aria-label="Always held" className="flex items-center gap-1.5" title={tr("Every run holds these at 0; they cannot be loosened")}>
        <Icon name="lock" className="h-3 w-3 shrink-0 text-ink-tertiary" />
        <span className="min-w-0 flex-1 truncate text-label text-ink">{tr("Inside the buildable area · No overlaps · Required rules")}</span>
        <span
          className={`w-[4.5rem] shrink-0 text-right text-caption tabular-nums ${excess.length === 0 ? 'text-status-within' : 'text-status-over'}`}
          title={excess.length === 0 ? undefined : excess.map((x) => `${measures.find((m) => m.id === x.id)?.label ?? x.id}: over by ${fmt(x.over, measures.find((m) => m.id === x.id)?.unit ?? 'm')}`).join('\n')}
        >
          {excess.length === 0 ? '✓' : 'over'}
        </span>
      </div>
      <div role="group" aria-label="Coverage" className="flex items-center gap-1.5" title={noSite ? "COS needs the site's boundary" : 'The coverage rule (COS): held, or allowed a few points over'}>
        <span className="min-w-0 flex-1 truncate text-label text-ink">{tr("Coverage (COS)")}</span>
        <span className="inline-flex shrink-0 rounded-pill bg-fill p-0.5">
          {segment('Strict', !allowed, () => cos && setCos(0))}
          {segment('Allow +', allowed, () => !allowed && setCos((POINTS_DEFAULT / 100) * site))}
        </span>
        {cos && allowed && !noSite && (
          <>
            <span className="w-10 shrink-0">
              <CellField
                label="points"
                value={points}
                number={{ min: 1, integer: true }}
                onCommit={(s) => Number.isInteger(Number(s)) && Number(s) >= 1 && setCos((Number(s) / 100) * site)}
              />
            </span>
            <span className="shrink-0 text-caption text-ink-tertiary">{points === 1 ? 'point' : 'points'}</span>
          </>
        )}
        <span
          className={`w-[4.5rem] shrink-0 text-right text-caption tabular-nums ${cosOk === null ? 'text-ink-tertiary' : cosOk ? 'text-status-within' : 'text-status-over'}`}
          title={cosOk === false ? `The design is over by ${fmt((cosValue ?? 0) - (cos?.max ?? 0), 'm2')}` : undefined}
        >
          {cosOk ? '✓' : fmt(cosValue, 'm2')}
        </span>
      </div>
      {others.map((c) => {
        const m = measures.find((x) => x.id === c.measure)
        const label = m?.label ?? c.measure
        const value = figures.get(c.measure)
        const unit = m?.unit ?? 'm'
        const ok = value !== undefined ? value <= c.max + 1e-9 : null
        return (
          <div key={c.measure} className="flex items-center gap-1.5">
            <span className={`min-w-0 truncate text-label ${m ? 'text-ink' : 'text-status-over'}`} title={m ? `${label}: ${m.help}` : 'No measure has this name any more'}>
              {label}
            </span>
            <FromTypology />
            <span className="flex-1" />
            <span className="shrink-0 text-caption text-ink-tertiary">≤</span>
            <span className="w-10 shrink-0">
              <CellField
                label={`${label}: at most`}
                value={shown(c.max, unit)}
                number={{}}
                onCommit={(s) => Number.isFinite(Number(s)) && edit((x) => ({ ...x, constraints: x.constraints.map((y) => (y.measure === c.measure ? { ...y, max: typed(Number(s), unit) } : y)) }))}
              />
            </span>
            <span
              className={`w-[4.5rem] shrink-0 text-right text-caption tabular-nums ${ok === null ? 'text-ink-tertiary' : ok ? 'text-status-within' : 'text-status-over'}`}
              title={ok === false ? `The design is over by ${fmt((value ?? 0) - c.max, unit)}` : undefined}
            >
              {ok ? '✓' : fmt(value, unit)}
            </span>
            <Remove label={`Remove ${label}`} onClick={() => edit((x) => ({ ...x, constraints: x.constraints.filter((y) => y.measure !== c.measure) }))} />
          </div>
        )
      })}
    </section>
  )
}

/** Each kind an earlier stage varied that this one does not: ± so many of its steps (0: frozen). A kind the catalog no
 *  longer has (a stored plan's, `warehouse.elements` retired in BE.3) is left out, as the problem reads it ("missing"). */
export function Margin({ margins, set }: { margins: { kind: string; step: number; margin: number }[]; set(kind: string, steps: number): void }) {
  const label = (kind: string) => paramKind(kind)?.label ?? kind
  const known = margins.filter((m) => paramKind(m.kind) !== undefined)
  return (
    <section aria-label="Margin over earlier stages" className="flex flex-col gap-1.5">
      <Heading title={tr("Margin over earlier stages")} right="± steps" />
      {margins.length === 0 ? (
        <p className="text-caption text-ink-secondary">{tr("The first stage: nothing earlier to keep.")}</p>
      ) : (
        known.map((m) => (
          <div key={m.kind} className="flex items-center gap-1.5" title={tr("How many of its steps this stage may move what an earlier stage approved; 0 keeps it as approved")}>
            <span className="min-w-0 flex-1 truncate text-label text-ink">{label(m.kind)}</span>
            <span className="shrink-0 text-caption text-ink-tertiary">±</span>
            <span className="w-12 shrink-0">
              <CellField label={`${label(m.kind)} margin`} value={m.margin} number={{ min: 0, integer: true }} onCommit={(s) => Number(s) >= 0 && set(m.kind, Math.round(Number(s)))} />
            </span>
            <span className="w-[4.5rem] shrink-0 text-right text-caption text-ink-tertiary">{m.margin === 0 ? 'frozen' : `of ${m.step}`}</span>
          </div>
        ))
      )}
    </section>
  )
}

/** About how long: "about 30 s", "about 4 min". */
function duration(ms: number): string {
  const s = ms / 1000
  if (s < 10) return `about ${Math.max(1, Math.round(s))} s`
  if (s < 60) return `about ${Math.round(s / 5) * 5} s`
  return `about ${Math.round(s / 60)} min`
}

export function Budget({ template: t, edit, ms }: { template: Template; edit: Edit; ms: number }) {
  const b = t.budget
  const set = (patch: Partial<Template['budget']>) => edit((x) => ({ ...x, budget: { ...x.budget, ...patch } }))
  const evaluations = b.population * b.generations
  const field = (label: string, value: number, min: number, commit: (n: number) => void) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-ink-secondary">{label}</span>
      <CellField label={label} value={value} number={{ min, integer: true }} step={label === 'Seed' ? 1 : 10} onCommit={(s) => commit(Number(s))} />
    </label>
  )
  return (
    <section aria-label="Budget" className="flex flex-col gap-1.5">
      <Heading title={tr("Budget")} />
      <div className="grid grid-cols-3 gap-2">
        {field('Population', b.population, 4, (n) => set({ population: n }))}
        {field('Generations', b.generations, 1, (n) => set({ generations: n }))}
        {field('Seed', b.seed, 0, (n) => set({ seed: n }))}
      </div>
      <p className="text-caption text-ink-secondary" title={tr("The same seed and settings give the same run")}>
        {whole(evaluations)} specimens · {duration(evaluations * ms)}
      </p>
    </section>
  )
}
