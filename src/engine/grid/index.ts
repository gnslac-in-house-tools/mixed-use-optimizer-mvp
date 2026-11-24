// The structural grid (Decisions "Structural grid", "Grid layout"; Phase G.1), pure: the grid an option stands on, its
// frame (u along its x, v along its y, from its origin), its lines and their names, its modules, a mass on them and a
// building's bays. A building's bays are never stored: they are the box its masses make in the grid's frame, its bays
// the whole ones between the first and the last grid line inside it, its end bays what is left at either end.
import type { Building, Footprint, Grid, Id, Point, Polygon, Project } from '../../model/schema.ts'
import type { DerivedMass } from '../types.ts'
import { optionOf } from '../buildings.ts'
import { boundaryRoads } from '../circulation/streets.ts'
import { mainAxis } from '../geom/axis.ts'
import { cosSin, footprintPolygon } from '../geom/footprint.ts'
import { deriveSite } from '../massing/site.ts'

/** A new grid's bays and modules where the typology gives none (Decision "Structural grid": 12 × 12 m in 4). */
export const DEFAULT_GRID_SIZE = { x: 12, y: 12, modules: 4 }
/** m: a corner this close to a module line is on it. */
export const ON_LINE = 0.01
/** The most lines of one kind drawn across an extent (a tiny bay on a large site draws no more). */
const MOST_LINES = 1000

/** Along which of the grid's axes: x (its lines lettered A, B, C…) or y (numbered 1, 2, 3…). */
export type Axis = 'x' | 'y'

/** The grid an option stands on: its own, else the project's; null without either. */
export function gridOf(p: Project, optionId?: Id | null): Grid | null {
  return optionOf(p, optionId)?.grid ?? p.grid ?? null
}

/** A grid's module along each of its axes (m): its bay over its modules. */
export const moduleOf = (g: Grid): Point => ({ x: g.x / g.modules, y: g.y / g.modules })

/** A grid's bay along an axis (m). */
export const bayOf = (g: Grid, axis: Axis): number => (axis === 'x' ? g.x : g.y)

/** A plan point in the grid's frame: x along its x axis, y along its y, from its origin. */
export function toGrid(g: Grid, p: Point): Point {
  const [c, s] = cosSin(g.angle)
  const dx = p.x - g.origin.x
  const dy = p.y - g.origin.y
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

/** A point of the grid's frame on the plan. */
export function toPlan(g: Grid, q: Point): Point {
  const [c, s] = cosSin(g.angle)
  return { x: g.origin.x + q.x * c - q.y * s, y: g.origin.y + q.x * s + q.y * c }
}

/** The grid's axes on the plan, as unit vectors. */
export function axesOf(g: Grid): { u: Point; v: Point } {
  const [c, s] = cosSin(g.angle)
  return { u: { x: c, y: s }, v: { x: -s, y: c } }
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, no O: they read as 1 and 0

/** The name of the `k`th line from the first (0): A, B… Z, AA, AB… along x; 1, 2, 3… along y. */
export function lineName(axis: Axis, k: number): string {
  if (k < 0) return `${lineName(axis, 0)}−${-k}`
  if (axis === 'y') return String(k + 1)
  let n = k
  let out = ''
  do {
    out = LETTERS[n % LETTERS.length] + out
    n = Math.floor(n / LETTERS.length) - 1
  } while (n >= 0)
  return out
}

/** An end bay's line beside the `k`th line, as the user writes them: A1, E1 along x; 1.1, 5.1 along y (never 11). */
export const endName = (axis: Axis, k: number): string => (axis === 'x' ? `${lineName(axis, k)}1` : `${lineName(axis, k)}.1`)

/** The grid's box over some points, in its frame. */
function boxIn(g: Grid, pts: Point[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (pts.length === 0) return null
  const q = pts.map((p) => toGrid(g, p))
  return {
    minX: Math.min(...q.map((p) => p.x)),
    minY: Math.min(...q.map((p) => p.y)),
    maxX: Math.max(...q.map((p) => p.x)),
    maxY: Math.max(...q.map((p) => p.y)),
  }
}

/**
 * Where the names start: the index of the first grid line over `extent` (the site) each way, so moving the origin
 * less than a bay keeps them; without one, the origin's lines.
 */
export function nameBase(g: Grid, extent: Point[] | null): Point {
  const b = extent ? boxIn(g, extent) : null
  return b ? { x: Math.ceil(b.minX / g.x - 1e-9) + 0, y: Math.ceil(b.minY / g.y - 1e-9) + 0 } : { x: 0, y: 0 }
}

/** The name of the bay line at index `k` (at k × bay from the origin), counted from `base`. */
export const nameOf = (axis: Axis, k: number, base: Point): string => lineName(axis, k - (axis === 'x' ? base.x : base.y))

/** A line of the grid on the plan: across `extent`, at index `k` (k × bay, or k × module for a module line). */
export interface GridLine {
  axis: Axis
  k: number
  a: Point
  b: Point
  /** A bay line's name; a module line has none. */
  name?: string
}

/**
 * The grid's lines across a box of points (the site), `pad` m past it each way: the bay lines, named from `base`, and
 * (with `modules`) the module lines between them.
 */
export function gridLines(g: Grid, extent: Point[], base: Point, { pad = 0, modules = false }: { pad?: number; modules?: boolean } = {}): GridLine[] {
  const b = boxIn(g, extent)
  if (!b) return []
  const m = moduleOf(g)
  const out: GridLine[] = []
  const run = (axis: Axis, step: number, lo: number, hi: number, across: [number, number], every: number) => {
    const first = Math.ceil(lo / step - 1e-9)
    const last = Math.floor(hi / step + 1e-9)
    if (last - first > MOST_LINES) return
    for (let k = first; k <= last; k++) {
      const bay = k % every === 0
      if (every > 1 && bay) continue // a module line on a bay line is the bay line
      const at = k * step
      const [a, c] = axis === 'x' ? [{ x: at, y: across[0] }, { x: at, y: across[1] }] : [{ x: across[0], y: at }, { x: across[1], y: at }]
      out.push({ axis, k, a: toPlan(g, a), b: toPlan(g, c), ...(every === 1 ? { name: nameOf(axis, k, base) } : {}) })
    }
  }
  run('x', g.x, b.minX, b.maxX, [b.minY - pad, b.maxY + pad], 1)
  run('y', g.y, b.minY, b.maxY, [b.minX - pad, b.maxX + pad], 1)
  if (modules && g.modules > 1) {
    run('x', m.x, b.minX, b.maxX, [b.minY - pad, b.maxY + pad], g.modules)
    run('y', m.y, b.minY, b.maxY, [b.minX - pad, b.maxX + pad], g.modules)
  }
  return out
}

/** The module node nearest a plan point. */
export function snapToModules(g: Grid, p: Point): Point {
  const m = moduleOf(g)
  const q = toGrid(g, p)
  return toPlan(g, { x: Math.round(q.x / m.x) * m.x, y: Math.round(q.y / m.y) * m.y })
}

const onStep = (v: number, step: number) => Math.abs(v - Math.round(v / step) * step) < ON_LINE

/** Whether an outline is on the grid: its edges along the grid's axes, every corner on its module lines. */
export function onGrid(g: Grid, poly: Polygon): boolean {
  if (poly.length < 3) return false
  const m = moduleOf(g)
  const q = poly.map((p) => toGrid(g, p))
  if (!q.every((p) => onStep(p.x, m.x) && onStep(p.y, m.y))) return false
  return q.every((p, i) => {
    const n = q[(i + 1) % q.length]
    return Math.abs(p.x - n.x) < ON_LINE || Math.abs(p.y - n.y) < ON_LINE
  })
}

/** A building's run along one of the grid's axes. */
export interface BayRun {
  /** The first and the last grid line inside it (their index); null when none is (narrower than a bay). */
  first: number | null
  last: number | null
  /** Whole bays between them. */
  bays: number
  /** m: its end bays, before the first line and after the last (0: none). */
  start: number
  end: number
  /** Its ends' lines' names: an end bay's (A1, E1) or the grid line it ends on (A, E); — with no line inside. */
  from: string
  to: string
  /** Its ends, in the grid's frame (m). */
  lo: number
  hi: number
}

/** A building on the grid: its runs each way, and its masses that are not on the grid. */
export interface BuildingBays {
  x: BayRun
  y: BayRun
  off: Id[]
}

/** mm, and nothing under a line's tolerance. */
const clean = (v: number) => (Math.abs(v) < ON_LINE ? 0 : Math.round(v * 1000) / 1000)

/** A building's bays and end bays on the grid, from its masses' outlines; null with none. */
export function buildingBays(g: Grid, base: Point, masses: { id: Id; polygon: Polygon }[]): BuildingBays | null {
  const pts = masses.flatMap((m) => m.polygon.map((p) => toGrid(g, p)))
  if (pts.length === 0) return null
  const run = (axis: Axis): BayRun => {
    const vs = pts.map((p) => (axis === 'x' ? p.x : p.y))
    const lo = Math.min(...vs)
    const hi = Math.max(...vs)
    const bay = bayOf(g, axis)
    const first = Math.ceil((lo - ON_LINE) / bay) + 0 // + 0: no −0
    const last = Math.floor((hi + ON_LINE) / bay)
    if (last < first) return { first: null, last: null, bays: 0, start: clean(hi - lo), end: 0, from: '—', to: '—', lo, hi }
    const start = clean(first * bay - lo)
    const end = clean(hi - last * bay)
    const b = axis === 'x' ? base.x : base.y
    return {
      first,
      last,
      bays: last - first,
      start,
      end,
      from: start > 0 ? endName(axis, first - b) : lineName(axis, first - b),
      to: end > 0 ? endName(axis, last - b) : lineName(axis, last - b),
      lo,
      hi,
    }
  }
  return { x: run('x'), y: run('y'), off: masses.filter((m) => !onGrid(g, m.polygon)).map((m) => m.id) }
}

const round = (v: number, step: number) => Math.round(v / step) * step

/**
 * A grid of that size along the site's main axis, its origin at the corner of the buildable area's box in that frame
 * (the site's when nothing is buildable), so lines A and 1 run along the setback; with no site, at the plan's origin.
 */
export function fitGrid(p: Project, size: { x: number; y: number; modules: number }): Grid {
  const site = deriveSite(p.site)
  if (!site.polygon) return { ...size, origin: { x: 0, y: 0 }, angle: 0 }
  const angle = round(mainAxis(site.polygon, boundaryRoads(p.site)), 1e-6)
  const zone = site.buildable.flat().flat()
  const frame: Grid = { ...size, origin: { x: 0, y: 0 }, angle }
  const b = boxIn(frame, zone.length >= 3 ? zone : site.polygon)!
  const o = toPlan(frame, { x: b.minX, y: b.minY })
  return { ...size, origin: { x: round(o.x, 0.01), y: round(o.y, 0.01) }, angle }
}

/**
 * The project with a grid (Decision "Grid always": a project always has one): as it is when it has one, else with one
 * of `size` (its typology's, which the caller knows: the engine reads no typology) fitted to the site.
 */
export function withGrid(p: Project, size: { x: number; y: number; modules: number }): Project {
  return p.grid ? p : { ...p, grid: fitGrid(p, size) }
}

/**
 * Every grid of the project, its own and each option's, fitted to its site again (a new site: Decision "Grid always"):
 * along the site's main axis, from the buildable area's corner; their bays and modules kept.
 */
export function refitGrids(p: Project): Project {
  const fit = (g: Grid): Grid => fitGrid(p, { x: g.x, y: g.y, modules: g.modules })
  return {
    ...p,
    ...(p.grid ? { grid: fit(p.grid) } : {}),
    options: p.options.map((o) => (o.grid ? { ...o, grid: fit(o.grid) } : o)),
  }
}

/** A design building of an option on its grid: its bays, from its built masses. */
export interface BuildingOnGrid {
  building: Building
  bays: BuildingBays
}

/**
 * Each design building an option shows with built masses, and its bays on the option's grid (`masses`: the derived
 * ones, `site`: where the names start). None without a grid.
 */
export function optionBays(p: Project, optionId: Id, masses: Record<Id, DerivedMass>, site: Polygon | null): BuildingOnGrid[] {
  const g = gridOf(p, optionId)
  if (!g) return []
  const base = nameBase(g, site)
  const option = optionOf(p, optionId)
  return option.buildingIds.flatMap((id) => {
    const building = p.buildings.find((b) => b.id === id)
    if (!building || building.context) return []
    const own = Object.values(masses).filter((m) => m.buildingId === id && m.built && m.polygon.length >= 3)
    const bays = buildingBays(g, base, own)
    return bays ? [{ building, bays }] : []
  })
}

/**
 * The rectangle two opposite corners make along the grid's axes, turned with it (a mass drawn on a turned grid stays on
 * it); null when it is thinner than `min` m either way.
 */
export function gridRect(g: Grid, a: Point, b: Point, min = 1): Extract<Footprint, { kind: 'rect' }> | null {
  const p = toGrid(g, a)
  const q = toGrid(g, b)
  const width = Math.abs(q.x - p.x)
  const depth = Math.abs(q.y - p.y)
  if (width < min || depth < min) return null
  return { kind: 'rect', center: toPlan(g, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }), width, depth, rotation: g.angle }
}

/** The four corners of that rectangle on the plan, as drawn while it is dragged. */
export function gridRectCorners(g: Grid, a: Point, b: Point): Point[] {
  const p = toGrid(g, a)
  const q = toGrid(g, b)
  return [p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }].map((c) => toPlan(g, c))
}

/** A rect along the grid's axes: its box in the grid's frame, and whether its width runs along the grid's x. */
export interface RectOnGrid {
  lo: Point
  hi: Point
  widthAlongX: boolean
}

/** A footprint as a rect along the grid's axes (turned by a multiple of 90° from it); null for any other. */
export function rectOnGrid(g: Grid, f: Footprint): RectOnGrid | null {
  if (f.kind !== 'rect') return null
  const quarter = (((f.rotation - g.angle) % 90) + 90) % 90
  if (Math.min(quarter, 90 - quarter) > 1e-6) return null
  const half = (((f.rotation - g.angle) % 180) + 180) % 180
  const q = footprintPolygon(f).map((p) => toGrid(g, p))
  return {
    lo: { x: Math.min(...q.map((p) => p.x)), y: Math.min(...q.map((p) => p.y)) },
    hi: { x: Math.max(...q.map((p) => p.x)), y: Math.max(...q.map((p) => p.y)) },
    widthAlongX: Math.min(half, 180 - half) < 1e-6,
  }
}

/** The rect of that box in the grid's frame, turned as `f` is (its width along the grid's x or y, as it was). */
export function rectFromGrid(g: Grid, f: Extract<Footprint, { kind: 'rect' }>, lo: Point, hi: Point, widthAlongX: boolean): Footprint {
  const along = { x: hi.x - lo.x, y: hi.y - lo.y }
  return {
    ...f,
    center: toPlan(g, { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 }),
    width: widthAlongX ? along.x : along.y,
    depth: widthAlongX ? along.y : along.x,
  }
}

/** The bay lines inside an outline, at least `margin` m from its ends each way (where it may be split). */
export function linesInside(g: Grid, poly: Polygon, margin = 1): { axis: Axis; k: number }[] {
  const q = poly.map((p) => toGrid(g, p))
  return (['x', 'y'] as Axis[]).flatMap((axis) => {
    const vs = q.map((p) => (axis === 'x' ? p.x : p.y))
    const bay = bayOf(g, axis)
    const first = Math.ceil((Math.min(...vs) + margin) / bay)
    const last = Math.floor((Math.max(...vs) - margin) / bay)
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => ({ axis, k: first + i }))
  })
}
