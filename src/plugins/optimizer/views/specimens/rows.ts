// What the Specimens tab lists and draws (Decision "Specimens tab"), pure: a run's specimens as read (a max objective
// not negated, as the design's ◇), which are on its front, which hold every must-hold, the most balanced of the front
// (★, its knee) and the list as shown: the front, the feasible ones or all, inside the ranges dragged on the parallel
// coordinates' axes, sorted. A specimen the problem could not build (a refused edit: the worst there is) is not a
// layout: it is never listed nor drawn.
import type { MeasureUnit } from '../../../../modules/types.ts'
import type { Specimen } from '../../engine/nsga2.ts'
import type { Described } from '../../run/protocol.ts'

export type Show = 'front' | 'feasible' | 'all'
/** The balanced first, an objective's best first (its index), or the newest first. */
export type Sort = 'balanced' | 'newest' | number
/** A scatter's axis: an objective (its index) or the generation a specimen was born in. */
export type Axis = 'generation' | number
/** The ranges dragged on the parallel coordinates' axes, by objective, as read (low, high). */
export type Filters = Record<number, [number, number]>

export interface Row {
  s: Specimen
  /** Its objectives as read. */
  read: number[]
  feasible: boolean
  front: boolean
  /** How far from the front's best on every objective at once, each over the front's range: the knee is the least. */
  balance: number
}

/** The worst there is (nsga2's sanitize): a specimen with it was refused. */
const REFUSED = 1e99
const built = (s: Specimen) => s.violation < REFUSED && s.objectives.every((v) => Math.abs(v) < REFUSED)

/** Every specimen built, as read, in order of birth. */
export function rowsOf(problem: Described, specimens: Specimen[], front: Specimen[]): Row[] {
  const onFront = new Set(front.map((s) => s.id))
  const best = front.filter(built)
  const n = problem.objectives.length
  // each objective's range over the front, as the engine sees it (all minimized)
  const lo = Array.from({ length: n }, (_, i) => Math.min(...best.map((s) => s.objectives[i])))
  const hi = Array.from({ length: n }, (_, i) => Math.max(...best.map((s) => s.objectives[i])))
  const balance = (s: Specimen) =>
    best.length ? Math.hypot(...s.objectives.map((v, i) => (hi[i] > lo[i] ? (v - lo[i]) / (hi[i] - lo[i]) : 0))) : 0
  return specimens.filter(built).map((s) => ({
    s,
    read: s.objectives.map((v, i) => (problem.objectives[i].sense === 'max' ? -v : v)),
    feasible: s.violation === 0,
    front: onFront.has(s.id),
    balance: balance(s),
  }))
}

/** The most balanced feasible specimen of the front (★), if any. */
export function kneeOf(rows: Row[]): number | null {
  let knee: Row | null = null
  for (const r of rows) if (r.front && r.feasible && (!knee || r.balance < knee.balance)) knee = r
  return knee?.s.id ?? null
}

export const inFilters = (r: Row, filters: Filters) =>
  Object.entries(filters).every(([i, [lo, hi]]) => r.read[Number(i)] >= lo && r.read[Number(i)] <= hi)

/** The rows a Show keeps, before the filters. */
export const shownOf = (rows: Row[], show: Show) => (show === 'front' ? rows.filter((r) => r.front) : show === 'feasible' ? rows.filter((r) => r.feasible) : rows)

/** The list as shown: a Show, inside the filters, sorted (feasible first, then by the sort, then the older first). */
export function listed(rows: Row[], view: { show: Show; sort: Sort; filters: Filters }): Row[] {
  const { sort } = view
  const by =
    sort === 'balanced'
      ? (a: Row, b: Row) => a.balance - b.balance
      : sort === 'newest'
        ? (a: Row, b: Row) => b.s.id - a.s.id
        : // the engine's (minimized) value: an objective's best first, min or max
          (a: Row, b: Row) => a.s.objectives[sort] - b.s.objectives[sort]
  return shownOf(rows, view.show)
    .filter((r) => inFilters(r, view.filters))
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || by(a, b) || a.s.id - b.s.id)
}

/** A sort that names an objective the problem no longer has falls back to the balanced. */
export const sortOf = (sort: Sort, problem: Described): Sort => (typeof sort === 'number' && sort >= problem.objectives.length ? 'balanced' : sort)

/** Less than this share of its size, an objective's spread along the front says nothing (the brief's when the areas
 *  are fixed: a rounded proportion moves it by a fraction of a m²). */
const FLAT = 0.01
/** Fewer values than this along the front (a count of rules broken: 0 or 1) make a poor axis: two columns of dots. */
const FEW = 5


/**
 * The scatter's axes until the designer picks: the two objectives that differ most along the front, each by its
 * spread over its size (the ones with a few values only after the others), in their order; one alone against the
 * generation; none, the first two.
 */
export function defaultAxes(rows: Row[], problem: Described): [Axis, Axis] {
  const front = rows.filter((r) => r.front)
  const axis = (i: number) => {
    const values = front.map((r) => r.read[i])
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    // its values, each to a hundredth of its spread: a float's noise is not a value of its own
    const steps = new Set(values.map((v) => Math.round(((v - lo) / (hi - lo || 1)) * 100))).size
    return { i, d: (hi - lo) / Math.max(1, Math.abs(lo), Math.abs(hi)), many: steps >= FEW }
  }
  const varying = front.length > 1 ? problem.objectives.map((_, i) => axis(i)).filter((o) => o.d >= FLAT) : []
  const two = varying
    .sort((a, b) => Number(b.many) - Number(a.many) || b.d - a.d)
    .slice(0, 2)
    .map((o) => o.i)
    .sort((a, b) => a - b)
  if (two.length === 2) return [two[0], two[1]]
  if (two.length === 1) return ['generation', two[0]]
  return problem.objectives.length > 1 ? [0, 1] : ['generation', 0]
}

/** An axis the designer picked, unless it names an objective the problem no longer has. */
export const axisOf = (axis: Axis | null, problem: Described, fallback: Axis): Axis =>
  axis === null || (typeof axis === 'number' && axis >= problem.objectives.length) ? fallback : axis

/** A value on an axis: an objective as read, or the generation. */
export const valueOn = (r: Row, axis: Axis) => (axis === 'generation' ? r.s.generation : r.read[axis])

/** The span of some values, never empty nor thinner than a few % of their size: values that hardly differ (a
 *  rounding) draw flat, in the middle, not stretched over a whole axis. */
export function extent(values: number[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) return [0, 1]
  const least = 4 * FLAT * Math.max(1, Math.abs(lo), Math.abs(hi))
  if (hi - lo < least) {
    const mid = (lo + hi) / 2
    return [mid - least / 2, mid + least / 2]
  }
  return [lo, hi]
}

/** A specimen's objective against the design's: up or down, and whether that is better. */
export function against(value: number, design: number, sense: 'min' | 'max'): { delta: number; better: boolean | null } {
  const delta = value - design
  if (Math.abs(delta) < 1e-6 * Math.max(1, Math.abs(design))) return { delta: 0, better: null }
  return { delta, better: sense === 'min' ? delta < 0 : delta > 0 }
}

/** A figure in a narrow column: 0 · 12 · 140 · 1.2k · 23k · 41% (the unit is in the column's head). */
export function compact(v: number, unit: MeasureUnit): string {
  if (unit === 'pct') return `${Math.round(v * 100)}%`
  const a = Math.abs(v)
  if (a >= 9_999.5) return `${Math.round(v / 1000)}k`
  if (a >= 999.5) return `${(v / 1000).toFixed(1)}k`
  if (a >= 9.95 || unit === 'count') return `${Math.round(v)}`
  return `${Math.round(v * 10) / 10}`
}

export const UNIT_WORD: Record<MeasureUnit, string> = { m: 'm', m2: 'm²', m3: 'm³', pct: '%', count: '' }
