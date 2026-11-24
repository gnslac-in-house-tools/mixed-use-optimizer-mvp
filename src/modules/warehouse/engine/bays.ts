// A warehouse type's bays (Decision "Warehouse type", step 2), pure: along one of the hall's axes, the whole bays of the
// grid inside its length and the end bays that take what is left, each bay in its modules. Places on the hall are
// kept as indices into these lists (a bay, a module line), so a new grid or a new size re-applies them.
import type { HallSide, WarehouseType } from '../../../model/schema.ts'

/** m: lengths this close are the same (no end bay of a few mm). */
const ON = 0.005

/** One bay along an axis: from `lo` to `hi` (m from the column line A or 1), an end bay or not, in `modules` modules. */
export interface Bay {
  lo: number
  hi: number
  end: boolean
  modules: number
}

/** The hall along one axis: its bays, its column lines (each bay's ends) and its module lines (each module's ends). */
export interface Run {
  length: number
  bay: number
  bays: Bay[]
  /** The column lines, from 0 to the length. */
  lines: number[]
  /** The module lines, from 0 to the length: a place's `from` and `span` count them. */
  modules: number[]
  /** m: the end bays at the start and the end (0: none). */
  start: number
  end: number
  /** m: an interior bay's module (the bay over its modules). */
  module: number
}

const mm = (v: number) => Math.round(v * 1000) / 1000

/** m: an end bay shorter joins the bay next to it, when the hall does not say (Decision "Grid by line"): two thirds of a bay. */
export const joinUnderOf = (bay: number, joinUnder?: number): number => Math.max(0, Math.min(bay, joinUnder ?? (bay * 2) / 3))

/** A join rule: the hall's one figure (m) for both axes, or each axis its own (the rule files were laid by before). */
export type JoinRule = number | { x: number; y: number }
export const joinOn = (j: JoinRule | undefined, k: 'x' | 'y'): number | undefined => (typeof j === 'object' ? j[k] : j)

/** The join rule before Decision "Grid by line" (a file of project version 11 or older, a block of format 2): half a bay. */
export const halfBays = (grid: { x: number; y: number }): JoinRule => ({ x: grid.x / 2, y: grid.y / 2 })

/**
 * The bays along a length: whole bays of `bay` m, and what is left to the end bays. At both ends, with a remainder r,
 * one bay fewer and each end (r + bay) / 2, so an end bay is between half a bay and a whole one; at one end, r. An end
 * bay under `joinUnder` (m; absent, two thirds of a bay: Decision "Grid by line") joins the whole bay next to it, at
 * both ends each (two whole bays to join at least); `short`: one under it stays its own, a module at least (a bump's).
 * Shorter than a bay: one end bay. Each interior bay in `modules` modules, an end bay in as many of about the same size
 * (at least 1), so a bay joined keeps the modules it had.
 */
export function runAlong(length: number, bay: number, modules: number, ends: 'both' | 'start' | 'end', short = false, joinUnder?: number): Run {
  const n = Math.floor(length / bay + ON / bay)
  const r = mm(length - n * bay)
  const join = joinUnderOf(bay, joinUnder)
  // an end bay as long as the rule stays (8 m in a 12 m bay at two thirds)
  const stays = (e: number) => e >= join - 1e-9 || (short && e >= bay / modules - ON)
  let start = 0
  let end = 0
  let whole = n
  if (n === 0) {
    whole = 0
    start = mm(length)
  } else if (r > ON) {
    if (ends === 'both') {
      const e = mm((r + bay) / 2)
      const own = stays(e) || n - 1 < 2
      whole = own ? n - 1 : n - 3
      start = end = own ? e : mm(e + bay)
    } else {
      const own = stays(r)
      const e = own ? r : mm(r + bay)
      whole = own ? n : n - 1
      if (ends === 'start') start = e
      else end = e
    }
  }
  const module = bay / modules
  const endModules = (l: number) => Math.max(1, Math.round(l / module))
  const bays: Bay[] = []
  let at = 0
  if (start > 0) {
    bays.push({ lo: 0, hi: start, end: true, modules: endModules(start) })
    at = start
  }
  for (let i = 0; i < whole; i++) {
    bays.push({ lo: mm(at), hi: mm(at + bay), end: false, modules })
    at += bay
  }
  if (end > 0) bays.push({ lo: mm(at), hi: mm(at + end), end: true, modules: endModules(end) })
  const lines = [0, ...bays.map((b) => b.hi)]
  const mods = [0, ...bays.flatMap((b) => Array.from({ length: b.modules }, (_, k) => mm(b.lo + ((b.hi - b.lo) * (k + 1)) / b.modules)))]
  return { length, bay, bays, lines, modules: mods, start, end, module }
}

/**
 * A block's own lines along an axis (Decision "Grid by line", GR.3): module lines taken away from the column lines
 * (`off`) or made column lines (`on`), each counted from its nearer wall: k > 0, the kth module line from the start;
 * k < 0, the |k|th from the end. A line moved is one off and one on.
 */
export interface OwnLines {
  off?: number[]
  on?: number[]
}

/** The module line each column line of a run stands on. */
export function lineModules(r: Run): number[] {
  return r.lines.map((l) => r.modules.findIndex((v) => Math.abs(v - l) < ON))
}

/**
 * Some column lines moved together (Decision "Multi-selection", BE.9): `idx` the module line of each (lineModules),
 * the ones at `lines` by `by` modules; the first and last (the box's walls) never move. All or none: null when one
 * would come within a module of a line not moved, or none moves.
 */
export function movedLines(idx: readonly number[], lines: readonly number[], by: number): number[] | null {
  const k = Math.round(by)
  const moving = new Set(lines.filter((l) => Number.isInteger(l) && l > 0 && l < idx.length - 1))
  if (k === 0 || !moving.size || !Number.isFinite(by)) return null
  const next = idx.map((m, i) => (moving.has(i) ? m + k : m))
  return next.every((m, i) => i === 0 || m > next[i - 1]) ? next : null
}

/**
 * A run with its block's own lines (GR.3): its module lines where they are, its column lines those of the rules less
 * `off` and with `on`; each counted from its wall, so an edit at an end holds in a copy of another length, and one past
 * that copy's middle (or off its ends) gives way to the rules. Its first bay an end bay when the rules' was, the last too.
 */
export function withOwnLines(r: Run, own: OwnLines | undefined): Run {
  if (!own || (!own.off?.length && !own.on?.length)) return r
  const n = r.modules.length - 1
  // a line counted from the start up to the middle, from the end past it
  const at = (k: number) => (k > 0 ? (k <= n / 2 ? k : null) : n + k > n / 2 && n + k < n ? n + k : null)
  const set = new Set(lineModules(r))
  for (const k of own.off ?? []) {
    const i = at(k)
    if (i !== null && i > 0 && i < n) set.delete(i)
  }
  for (const k of own.on ?? []) {
    const i = at(k)
    if (i !== null && i > 0 && i < n) set.add(i)
  }
  const idx = [...set].sort((a, b) => a - b)
  const bays: Bay[] = idx.slice(1).map((b, j) => {
    const a = idx[j]
    const end = (j === 0 && r.start > 0) || (j === idx.length - 2 && r.end > 0)
    return { lo: r.modules[a], hi: r.modules[b], end, modules: b - a }
  })
  const first = bays[0]
  const last = bays[bays.length - 1]
  return { ...r, bays, lines: idx.map((i) => r.modules[i]), start: first.end && r.start > 0 ? mm(first.hi - first.lo) : 0, end: last.end && r.end > 0 ? mm(last.hi - last.lo) : 0 }
}

/** The own lines that make `lines` (module lines) the column lines of the run of the rules `regular`; none: undefined. */
export function ownLinesOf(regular: Run, lines: number[]): OwnLines | undefined {
  const n = regular.modules.length - 1
  const was = new Set(lineModules(regular))
  const now = new Set(lines)
  const from = (i: number) => (i <= n / 2 ? i : i - n)
  const off = [...was].filter((i) => i > 0 && i < n && !now.has(i)).map(from)
  const on = [...now].filter((i) => i > 0 && i < n && !was.has(i)).map(from)
  if (!off.length && !on.length) return undefined
  return { ...(off.length && { off: off.sort((a, b) => a - b) }), ...(on.length && { on: on.sort((a, b) => a - b) }) }
}

/** The hall's two runs: along its length (x) and its width (y). */
export interface HallRuns {
  x: Run
  y: Run
}

/**
 * The box's bays along its length and its width, its own lines moved or deleted (Decision "Grid by line"); `size`: the box
 * of that size (m) instead of the hall's (the box an outline was drawn on); `join`: a join rule other than the hall's.
 */
export function runsOf(t: Pick<WarehouseType, 'grid' | 'hall'>, size?: { x: number; y: number }, join: JoinRule | undefined = t.hall.joinUnder): HallRuns {
  return {
    x: withOwnLines(runAlong(size?.x ?? t.hall.length, t.grid.x, t.grid.modules, t.hall.ends, t.hall.shortEnds?.x, joinOn(join, 'x')), t.grid.lines?.x),
    y: withOwnLines(runAlong(size?.y ?? t.hall.width, t.grid.y, t.grid.modules, t.hall.endsWidth ?? t.hall.ends, t.hall.shortEnds?.y, joinOn(join, 'y')), t.grid.lines?.y),
  }
}

/** The run a wall facing `side` counts along: x for the front and the back, y for the left and the right. */
export const runOfSide = (h: HallRuns, side: HallSide): Run => (side === 'front' || side === 'back' ? h.x : h.y)

/** The module line `k` of a run (m), held to its ends. */
export function moduleLine(r: Run, k: number): number {
  return r.modules[Math.max(0, Math.min(r.modules.length - 1, k))]
}

/** The module line `k` of a run (m), past its ends by its interior modules (a shape pulled out of its box). */
export function moduleAt(r: Run, k: number): number {
  const n = r.modules.length - 1
  if (k < 0) return mm(k * r.module)
  if (k > n) return mm(r.length + (k - n) * r.module)
  return r.modules[k]
}

/** The module line nearest `v` (m along the run), its index; past the ends, counted on in interior modules. */
export function nearestLine(r: Run, v: number): number {
  const n = r.modules.length - 1
  if (v < -ON) return Math.round(v / r.module)
  if (v > r.length + ON) return n + Math.round((v - r.length) / r.module)
  let best = 0
  r.modules.forEach((m, i) => {
    if (Math.abs(m - v) < Math.abs(r.modules[best] - v)) best = i
  })
  return best
}

/** The module whose centre is nearest `v` (m along the run), its index (from module line k to k + 1); as near two:
 *  the lower. Past the ends, counted on in interior modules. */
export function nearestModule(r: Run, v: number): number {
  const k = nearestLine(r, v)
  const centre = (i: number) => (moduleAt(r, i) + moduleAt(r, i + 1)) / 2
  return Math.abs(centre(k - 1) - v) <= Math.abs(centre(k) - v) + 1e-9 ? k - 1 : k
}

/** A bay's module (m). */
export const moduleOfBay = (b: Bay): number => (b.hi - b.lo) / b.modules

export type Ends = 'both' | 'start' | 'end'

/** A box's end bays along each axis: at which ends, and whether one under the join rule stays its own. */
export interface AxisEnds {
  x: Ends
  y: Ends
  short?: { x?: boolean; y?: boolean }
  /** m: the hall's join rule (absent: two thirds of a bay). */
  joinUnder?: JoinRule
}

/**
 * The ends that lay a box's bays nearest the lines it should keep (m along each axis), each axis its own: its column
 * lines first, then its module lines; what it was when as near (a box grown by a bump keeps its grid where it stood:
 * Decision "Block shape"). An end bay under the join rule stays its own only when that keeps them nearer (a bump
 * shallower than that: its wall's column line stays).
 */
export function endsKeeping(
  size: { x: number; y: number },
  grid: { x: number; y: number; modules: number },
  was: AxisEnds,
  keep: { x: { lines: number[]; modules: number[] }; y: { lines: number[]; modules: number[] } },
): AxisEnds & { short: { x: boolean; y: boolean } } {
  const off = (got: number[], want: number[], length: number) => want.filter((v) => v > ON && v < length - ON).reduce((sum, v) => sum + Math.min(...got.map((g) => Math.abs(g - v))), 0)
  const best = (k: 'x' | 'y'): [Ends, boolean] => {
    const score = ([ends, short]: [Ends, boolean]) => {
      const r = runAlong(size[k], grid[k], grid.modules, ends, short, joinOn(was.joinUnder, k))
      return 10 * off(r.lines, keep[k].lines, size[k]) + off(r.modules, keep[k].modules, size[k])
    }
    const first: [Ends, boolean] = [was[k], was.short?.[k] ?? false]
    const options: [Ends, boolean][] = [first, ['both', false], ['start', false], ['end', false], ['start', true], ['end', true], ['both', true]]
    return options.reduce((b, e) => (score(e) < score(b) - ON ? e : b), first)
  }
  const [x, sx] = best('x')
  const [y, sy] = best('y')
  return { x, y, short: { x: sx, y: sy } }
}

/** A box's ends as its figures keep them: the length's, the width's own when they differ, the short ones kept. */
export function hallEnds(e: AxisEnds): { ends: Ends; endsWidth?: Ends; shortEnds?: { x?: true; y?: true } } {
  const short = { ...(e.short?.x && { x: true as const }), ...(e.short?.y && { y: true as const }) }
  return { ends: e.x, ...(e.y !== e.x && { endsWidth: e.y }), ...(Object.keys(short).length > 0 && { shortEnds: short }) }
}

/**
 * The end bays *Set end bays automatically* gives a block (BE.6): at both ends along each axis, an equal end bay at each
 * end of what the whole bays leave (none when the length is whole bays; a short one joining the bay next to it by the
 * join rule: Decision "Grid by line"). The rest of the stored layout (`endsWidth`, `shortEnds`) goes; `joinUnder` is
 * the designer's rule and stays. Pure and the same for every block, it takes the block so a later rule can read it.
 */
export function autoEnds(_t: Pick<WarehouseType, 'grid' | 'hall'>): Pick<WarehouseType['hall'], 'ends'> {
  return { ends: 'both' }
}
