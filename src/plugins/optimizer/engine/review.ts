// A stage's review (Decisions "Stages layout", "Stage review"): what a stage made against its input, the option the
// stage before approved (the first: the plan's own). Pure: two options in, figures out, each read by the same measures
// a run uses (one derive a side):
//   objectives  the stage's, each before → after, better or worse by its sense
//   must hold   its constraints, held or not
//   changed     every other measure of the catalog (the KPIs and the optimizer's own) that changed; the rest `same`
//   moved       what earlier stages approved that this one moved within its margin (a run template's kind with a
//               `margin`), each value before → after; only for a specimen of the input (the same option, its masses'
//               ids): an option kept apart has masses of its own, so null
//   massesOnly  a stage of the circulation's (7.5): the Issues of what it made that only the masses can fix (a court
//               with no room, masses that overlap or stand outside the buildable area); else none
// A building's KPI counts only where both options show that building.
import { optionOf } from '../../../engine/buildings.ts'
import { derive } from '../../../engine/derive.ts'
import type { Issue } from '../../../engine/types.ts'
import type { Id, Project } from '../../../model/schema.ts'
import { measureCatalog, paramKind } from '../../../modules/catalog.ts'
import type { MeasureUnit, Variable } from '../../../modules/types.ts'
import { summaryOf } from './problem.ts'
import { ofCirculation } from './stages.ts'
import { withFixedRules, type Template } from './template.ts'

/** The Issues a stage of the circulation cannot settle: the masses' that stand in the roads' way. */
export const MASSES_ONLY = new Set<Issue['code']>(['court', 'overlap', 'outside-buildable'])

/** One side of the review: a project and the option looked at. */
export interface Side {
  project: Project
  option: Id
}

export interface Figure {
  id: string
  label: string
  unit: MeasureUnit
  before: number
  after: number
  /** Which way it went (null: unchanged). */
  change: 'up' | 'down' | null
  /** Better or worse by the measure's sense (null: unchanged, or a measure with no sense). */
  better: boolean | null
}

export interface Moved {
  key: string
  label: string
  unit: string
  before: number
  after: number
  /** ± steps it may move, and the step. */
  margin: number
  step: number
  /** A choice's names, by its index (before and after are indexes). */
  choices?: readonly string[]
}

export interface Review {
  objectives: (Figure & { sense: 'min' | 'max' })[]
  constraints: (Figure & { max: number; held: boolean })[]
  changed: Figure[]
  same: Figure[]
  moved: Moved[] | null
  massesOnly: Issue[]
}

/** Less than this share of its size, a change is a float's noise. */
const NOISE = 1e-6
/** The core's per-building KPIs (engine/kpis.ts). */
const BUILDING = 'building:'

const differs = (a: number, b: number) => Math.abs(a - b) > NOISE * Math.max(1, Math.abs(a), Math.abs(b))
const better = (a: number, b: number, sense: 'min' | 'max' | null) => (sense === null || !differs(a, b) ? null : sense === 'min' ? b < a : b > a)

export function reviewOf(before: Side, after: Side, template: Template): Review {
  // a building's KPI where both options show it
  const shownBy = (s: Side) => new Set(optionOf(s.project, s.option).buildingIds)
  const a = shownBy(before)
  const b = shownBy(after)
  const ids = new Set(measureCatalog(before.project).map((m) => m.id))
  const measures = measureCatalog(after.project).filter((m) => ids.has(m.id) && (!m.id.startsWith(BUILDING) || (a.has(m.id.slice(BUILDING.length)) && b.has(m.id.slice(BUILDING.length)))))
  // every measure at once, as the stage's window reads them
  const all = { ...template, objectives: measures.map((m) => ({ measure: m.id, sense: 'min' as const })), constraints: [] }
  const was = summaryOf(before.project, before.option, all)
  const now = summaryOf(after.project, after.option, all)
  const figure = (id: string, sense: 'min' | 'max' | null): Figure | null => {
    const i = measures.findIndex((m) => m.id === id)
    if (i < 0) return null
    const m = measures[i]
    const x = was.design.objectives[i]
    const y = now.design.objectives[i]
    const change = differs(x, y) ? (y > x ? 'up' : 'down') : null
    return { id, label: m.label, unit: m.unit, before: x, after: y, change, better: better(x, y, sense) }
  }

  const objectives = template.objectives.flatMap((o) => {
    const f = figure(o.measure, o.sense)
    return f ? [{ ...f, sense: o.sense }] : []
  })
  const run = withFixedRules(template) // what the run held: the fixed rules and a strict COS too
  const constraints = run.constraints.flatMap((c) => {
    const f = figure(c.measure, 'min')
    return f ? [{ ...f, max: c.max, held: f.after <= c.max + NOISE * Math.max(1, Math.abs(c.max)) }] : []
  })
  const aimed = new Set([...template.objectives.map((o) => o.measure), ...run.constraints.map((c) => c.measure)])
  const rest = measures.filter((m) => !aimed.has(m.id)).map((m) => figure(m.id, null)!)
  return {
    objectives,
    constraints,
    changed: rest.filter((f) => f.change !== null),
    same: rest.filter((f) => f.change === null),
    moved: before.option === after.option ? movedOf(before, after, template, was.variables) : null,
    massesOnly: ofCirculation(template) ? derive(after.project, after.option).issues.filter((i) => MASSES_ONLY.has(i.code)) : [],
  }
}

/** The earlier stages' variables (a kind with a margin) that changed. */
function movedOf(before: Side, after: Side, template: Template, variables: Variable[]): Moved[] {
  const margins = new Map(template.variables.flatMap((v) => (v.margin === undefined ? [] : [[v.kind, v] as const])))
  return variables.flatMap((v) => {
    const t = margins.get(v.kind)
    if (!t) return []
    const x = v.read(before.project)
    const y = v.read(after.project)
    if (!differs(x, y)) return []
    return [{ key: v.key, label: v.label, unit: paramKind(v.kind)?.unit ?? '', before: x, after: y, margin: t.margin!, step: t.step, ...(v.choices && { choices: v.choices }) }]
  })
}
