// Docks and truck courts (Decision "Exterior circulation", 4.3). A design mass that stands on the ground and is built
// has its docks on some walls: its own (Mass.docks: each wall named by the t of its middle) or its program's, when it
// has docks (Program.docks; on or off: Decision "Docks on or off"): one long wall. The long walls come from the
// footprint's minimum-area rectangle, so an L or a trapezoid has them too. A program's docks never go on a wall another
// mass stands against (Decision "Docks turn with the building"); they take the building's front, the side of the first
// long wall along its outline (a rect's local bottom), so the docks turn with it, unless the front's court has no room
// there and the back's has (room for the court before the next mass, and for the court and a road before the site's
// edge, where the ring has to pass). Doors go along each docked wall, a few metres from its ends; a truck court as deep
// as the standards say stands in front of it. On the structural grid (Phase G.3, Decision "Structural grid") a mass on
// it has its doors by pattern, module by module (`slotsOn`), its exceptions flipped, and the brief's doors become its
// target. The court's depth is its wall's own (Mass.courts: the pill on the plan), else the one its block gives that
// wall (Mass.blockCourts, from WarehouseType.courts: BE.2), else its block's (WarehouseType.court), else the standards'; or (Phase D.3) its
// block's courts there have shapes of their own (Mass.blockCourts: several to a wall after a split): `DerivedDock.shapes` are those, on the plan,
// and `court` the frame that holds them, the rectangle whose mouth trucks come in by;
// a warehouse type's copy has a wall with a court and no docks among its docked walls, its doors given (none). Two warehouses whose docked walls face each other share the court between them, each side's
// stopping at the other's wall (Decision "Truck court"). Pure.
import type { Contour, DockPattern, Docks, Grid, Id, Mass, Point, Polygon, Program } from '../../../model/schema.ts'
import { bayOf, moduleOf, ON_LINE, onGrid, toGrid, type BayRun, type BuildingBays } from '../../../engine/grid/index.ts'
import { intersection } from '../../../engine/geom/boolean.ts'
import { arcBox, rawPolygon } from '../../../engine/geom/contour.ts'
import { minimumRectangle } from '../../../engine/geom/rectangle.ts'
import { edgeAt, perimeter, vertexTs } from '../../../engine/geom/perimeter.ts'
import { pointInPolygon, signedArea } from '../../../engine/geom/polygon.ts'
import type { CourtGap, DerivedDock, DerivedMass, DockSlot, DoorTarget } from '../../../engine/types.ts'

/** m: a wall shorter than this takes no docks (an arc's chords, a jog). */
export const MIN_DOCK_WALL = 8
/** m: no door closer than this to a wall's end. */
export const DOOR_EDGE = 4
/** m: door centres at least this far apart (a 3 m door and its pier). */
export const DOOR_PITCH = 4
/** The doors of a mass with its own docks whose program says none: one every 12 m of wall. */
export const DEFAULT_DOORS: Docks = { per: 'm', every: 12 }
/** cos 20°: a wall this parallel to the long direction is a long wall (to the short one, a short wall). */
const PARALLEL = Math.cos((20 * Math.PI) / 180)
/** m: a wall with less room than this in front of it is covered (another mass stands against it): no docks for it. */
export const COVERED = 1
/** m: a court fits in front of a wall with this much less room than its depth (the rays start a hair off the wall). */
const FIT_SLACK = 0.1

/** What the room in front of a wall is measured against: the other masses on the ground, and the site's boundary. */
export interface Around {
  masses: Polygon[]
  boundary: Polygon | null
}

/** A wall of a mass's outline that can take docks. */
export interface Wall {
  i: number // the edge: vertices[i] → vertices[i + 1]
  a: Point
  b: Point
  t: number // its middle, as t on the outline's perimeter
  length: number
  out: Point // the unit normal out of the mass
}

/** The walls docks can go on: the outline's edges at least MIN_DOCK_WALL long. */
export function dockableWalls(poly: Polygon): Wall[] {
  const n = poly.length
  if (n < 3) return []
  const total = perimeter(poly)
  const ts = vertexTs(poly)
  const s = signedArea(poly) >= 0 ? 1 : -1 // counter-clockwise: the outside is on the right
  const walls: Wall[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < MIN_DOCK_WALL) continue
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    walls.push({ i, a, b, t: ts[i] + length / 2 / total, length, out: { x: u.y * s, y: -u.x * s } })
  }
  return walls
}

/** How far a ray from p along unit d goes before it meets one of the outlines (Infinity: never). */
function rayDistance(p: Point, d: Point, outlines: Polygon[]): number {
  let best = Infinity
  for (const poly of outlines)
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % n]
      const ex = b.x - a.x
      const ey = b.y - a.y
      const den = d.x * ey - d.y * ex
      if (Math.abs(den) < 1e-12) continue
      const s = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den // along the ray
      const r = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den // along the edge
      if (s > 1e-6 && r >= 0 && r <= 1) best = Math.min(best, s)
    }
  return best
}

/** The room in front of a wall, up to the next mass and up to the site's edge. */
export interface Room {
  masses: number
  boundary: number
}

/**
 * The room in front of a wall: the least of its quarter points' rays to the masses (none where a mass stands against
 * it: a ray started inside a neighbour would measure the neighbour's depth instead) and to the boundary.
 */
export function roomInFront(w: Wall, around: Around): Room {
  const at = (f: number) => ({ x: w.a.x + (w.b.x - w.a.x) * f + w.out.x * 0.01, y: w.a.y + (w.b.y - w.a.y) * f + w.out.y * 0.01 })
  const probes = [0.25, 0.5, 0.75].map(at)
  return {
    masses: Math.min(...probes.map((p) => (around.masses.some((m) => pointInPolygon(p, m)) ? 0 : rayDistance(p, w.out, around.masses)))),
    boundary: around.boundary ? Math.min(...probes.map((p) => rayDistance(p, w.out, [around.boundary!]))) : Infinity,
  }
}

/** The long walls of a footprint, the ones a program's docks may take (before any is found covered). */
function candidates(poly: Polygon): { walls: Wall[]; u: Point } {
  const walls = dockableWalls(poly)
  const { u } = minimumRectangle(poly)
  const along = (w: Wall) => Math.abs((w.b.x - w.a.x) * u.x + (w.b.y - w.a.y) * u.y) / w.length
  return { walls: walls.filter((w) => along(w) >= PARALLEL), u }
}

/**
 * The first long wall along an outline, the one whose side is the front a program's docks take (`defaultWalls`): of the walls at least
 * MIN_DOCK_WALL long and within 20° of the minimum rectangle's long direction, the first in the outline's order. Null when there is none.
 */
export function firstLongWall(poly: Polygon): Wall | null {
  return candidates(poly).walls[0] ?? null
}

/**
 * The walls a program's docks go on: never one another mass stands against (or on the site's edge). The front (the
 * side of the first long wall along the outline, so it turns with the mass), unless its court has no room there and
 * the back's has: room for the court (`courtDepth`) before the next mass, and for the court and a road (`roadWidth`)
 * before the site's edge. Neither has room: the roomier (the front on a tie); both covered: none.
 */
export function defaultWalls(poly: Polygon, around: Around, courtDepth: number, roadWidth = 0): Wall[] {
  const { walls, u } = candidates(poly)
  const rooms = new Map(walls.map((w) => [w, roomInFront(w, around)]))
  const room = new Map(walls.map((w) => [w, Math.min(rooms.get(w)!.masses, rooms.get(w)!.boundary)]))
  const free = (ws: Wall[]) => ws.filter((w) => room.get(w)! >= COVERED)
  if (walls.length === 0) return []
  // the two sides across the long direction: the front is the first long wall's
  const v = { x: -u.y, y: u.x }
  const side = (w: Wall) => (w.out.x * v.x + w.out.y * v.y > 0 ? 1 : -1)
  const front = side(walls[0])
  const ahead = free(walls.filter((w) => side(w) === front))
  const behind = free(walls.filter((w) => side(w) !== front))
  const least = (ws: Wall[]) => (ws.length ? Math.min(...ws.map((w) => room.get(w)!)) : -1)
  const fits = (ws: Wall[]) =>
    ws.length > 0 &&
    ws.every((w) => rooms.get(w)!.masses >= courtDepth - FIT_SLACK && rooms.get(w)!.boundary >= courtDepth + roadWidth - FIT_SLACK)
  if (fits(ahead)) return ahead
  if (fits(behind)) return behind
  return least(behind) > least(ahead) + 1e-6 ? behind : ahead
}

/** The doors along each docked wall: per m of wall, or per m² of floor spread over the walls by their length. */
export function doorsOn(walls: Wall[], rule: Docks, floorArea: number): Point[][] {
  const usable = walls.map((w) => Math.max(0, w.length - 2 * DOOR_EDGE))
  const most = usable.map((l) => Math.floor(l / DOOR_PITCH) + 1)
  let counts: number[]
  if (rule.per === 'm') counts = usable.map((l, k) => Math.min(most[k], Math.floor(l / Math.max(rule.every, DOOR_PITCH)) + 1))
  else {
    const want = Math.ceil(floorArea / rule.every)
    const sum = usable.reduce((s, l) => s + l, 0) || 1
    const share = usable.map((l) => (want * l) / sum)
    counts = share.map(Math.floor)
    // the remainders, largest first, until the doors asked are placed
    let left = want - counts.reduce((s, c) => s + c, 0)
    for (const k of share.map((x, k) => ({ k, r: x - Math.floor(x) })).sort((p, q) => q.r - p.r).map((x) => x.k)) {
      if (left <= 0) break
      counts[k]++
      left--
    }
    counts = counts.map((c, k) => Math.min(c, most[k]))
  }
  return walls.map((w, k) => {
    const n = counts[k]
    if (n <= 0) return []
    const ux = (w.b.x - w.a.x) / w.length
    const uy = (w.b.y - w.a.y) / w.length
    // by length: one every `every` m, centred; by area: spread evenly over the usable wall
    const pitch = rule.per === 'm' ? Math.max(rule.every, DOOR_PITCH) : usable[k] / n
    const first = rule.per === 'm' ? (w.length - (n - 1) * pitch) / 2 : DOOR_EDGE + pitch / 2
    return Array.from({ length: n }, (_, j) => {
      const s = first + j * pitch
      return { x: w.a.x + ux * s, y: w.a.y + uy * s }
    })
  })
}

/** A wall's doors on the grid where neither its mass nor its program says: one every module, the end bays skipped. */
export const DEFAULT_PATTERN: DockPattern = { every: 1, offset: 0, skip: 'ends' }

/** What the docks need of the grid an option stands on: it, and each building's runs (where its end bays are). */
export interface DockGrid {
  grid: Grid
  runs: Map<Id, BuildingBays>
}

/**
 * A wall's modules on the grid, from its start: null when it does not run along the grid's axes a whole number of
 * modules long. The modules of the building's end bays (`run`, along the wall's axis) or the wall's first and last are
 * skipped as the pattern says; of the others, a door every `every` from the `offset`th (or as its mask repeats); each
 * module in `flips` the other way.
 */
export function slotsOn(w: Wall, g: Grid, run: BayRun | null, pattern: DockPattern, flips: ReadonlySet<number>): DockSlot[] | null {
  const a = toGrid(g, w.a)
  const b = toGrid(g, w.b)
  const axis = Math.abs(a.y - b.y) < ON_LINE ? 'x' : Math.abs(a.x - b.x) < ON_LINE ? 'y' : null
  if (!axis) return null
  const m = moduleOf(g)[axis]
  const n = Math.round(w.length / m)
  if (n < 1 || Math.abs(n * m - w.length) > ON_LINE) return null
  const bay = bayOf(g, axis)
  const dir = Math.sign(b[axis] - a[axis])
  const ux = (w.b.x - w.a.x) / w.length
  const uy = (w.b.y - w.a.y) / w.length
  // the end bays: a part bay past the first (last) line, or, the building starting (ending) on a line, its first (last)
  // whole bay, when it has three or more (found in the stress test: on lines, "the end bays skipped" skipped none)
  const ends = (() => {
    if (run === null || run.first === null || run.last === null) return null
    const whole = run.last - run.first >= 3
    const lo = run.start > 0 ? run.first * bay : whole ? (run.first + 1) * bay : -Infinity
    const hi = run.end > 0 ? run.last * bay : whole ? (run.last - 1) * bay : Infinity
    return { lo, hi }
  })()
  const inEnds = (v: number) => ends !== null && (v < ends.lo || v > ends.hi)
  const out: DockSlot[] = []
  let counted = 0 // the modules the pattern runs over
  for (let j = 0; j < n; j++) {
    const s = (j + 0.5) * m
    const skipped = (pattern.skip === 'ends' && inEnds(a[axis] + dir * s)) || (pattern.skip === 'corners' && (j === 0 || j === n - 1))
    let door = false
    if (!skipped) {
      const i = counted - pattern.offset
      door = i >= 0 && (pattern.mask ? pattern.mask[i % pattern.mask.length] === 1 : i % pattern.every === 0)
      counted++
    }
    const flipped = flips.has(j)
    out.push({ module: j, at: { x: w.a.x + ux * s, y: w.a.y + uy * s }, door: door !== flipped, flipped })
  }
  return out
}

/** The truck court in front of a wall: as wide as the wall, `depth` m out. */
export function courtOf(w: Wall, depth: number): Polygon {
  const o = { x: w.out.x * depth, y: w.out.y * depth }
  return [w.a, w.b, { x: w.b.x + o.x, y: w.b.y + o.y }, { x: w.a.x + o.x, y: w.a.y + o.y }]
}

/**
 * A wall's courts with a shape of their own (Phase D.3, Decision "Courts in the circulation"): `shapes`, each a contour in the wall's frame as the
 * site reads it (x m along the wall from its start `a`, y m out of it), as polygons on the plan; `court`, the frame that holds them: from their
 * lowest x to their highest along the wall, as deep as the deepest, its ends on the wall's line, its mouth `court[3]`–`court[2]` the far edge.
 * Null: no depth (a shape that does not stand out of the wall).
 */
export function shapedCourts(w: Pick<Wall, 'a' | 'b' | 'out'>, shapes: Contour[]): { court: Polygon; shapes: Polygon[]; depth: number } | null {
  const l = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  if (!shapes.length || l < 1e-9) return null
  const u = { x: (w.b.x - w.a.x) / l, y: (w.b.y - w.a.y) / l }
  const at = (q: Point): Point => ({ x: w.a.x + u.x * q.x + w.out.x * q.y, y: w.a.y + u.y * q.x + w.out.y * q.y })
  const boxes = shapes.map(arcBox)
  const x0 = Math.min(...boxes.map((b) => b.x0))
  const x1 = Math.max(...boxes.map((b) => b.x1))
  const depth = Math.max(...boxes.map((b) => b.y1))
  if (!(depth > 0) || !(x1 > x0)) return null
  return { court: [at({ x: x0, y: 0 }), at({ x: x1, y: 0 }), at({ x: x1, y: depth }), at({ x: x0, y: depth })], shapes: shapes.map((c) => rawPolygon(c).map(at)), depth }
}

/** A dock's courts as they are paved and stood in: its shapes, else the one rectangle (the definition is the engine's, `engine/types.ts`: the other modules read it there). */
export { courtShapes } from '../../../engine/types.ts'

/** m: the shallowest and deepest a court's own depth may be (a pill dragged past them stops there). */
export const COURT_DEPTH_MIN = 5
/** Why a wall's own depth cannot be set: its courts have shapes of their own (Phase D.3), which a rectangle would hide. */
export const SHAPED_COURT = 'That wall’s court has its own shape: change it with its handles, or take it back to a rectangle first'
export const COURT_DEPTH_MAX = 200

/** m: two docked walls facing each other this far along each other (at least) share the court between them. */
const SHARE_ALONG = 1

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y

type WallLine = Pick<DerivedDock, 'a' | 'b' | 'out'>

/** Docked wall `p` facing `q`: how far `q`'s wall stands in front of it, and the stretch of `p` (m from its start) it
 *  stands in front of; null when they do not face each other (not facing, not in front, not along each other
 *  SHARE_ALONG m). */
function facing(p: WallLine, q: WallLine): { gap: number; lo: number; hi: number } | null {
  if (dot(p.out, q.out) > -PARALLEL) return null
  const mid = { x: (q.a.x + q.b.x) / 2, y: (q.a.y + q.b.y) / 2 }
  const gap = dot({ x: mid.x - p.a.x, y: mid.y - p.a.y }, p.out)
  if (gap <= COVERED) return null
  const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
  const u = { x: (p.b.x - p.a.x) / len, y: (p.b.y - p.a.y) / len }
  const sa = dot({ x: q.a.x - p.a.x, y: q.a.y - p.a.y }, u)
  const sb = dot({ x: q.b.x - p.a.x, y: q.b.y - p.a.y }, u)
  const lo = Math.max(0, Math.min(sa, sb))
  const hi = Math.min(len, Math.max(sa, sb))
  return hi - lo >= SHARE_ALONG ? { gap, lo, hi } : null
}

/** How deep the court in front of docked wall `p` reaches before `q`'s wall, when the two face each other: null when
 *  they do not. */
export function facingGap(p: WallLine, q: WallLine): number | null {
  return facing(p, q)?.gap ?? null
}

/**
 * The yards between warehouses (Decision "Truck court", ST.6): each pair of docked walls of different masses facing
 * each other with no other mass between them (the line from the middle of the stretch they share, wall to wall),
 * measured from the first's wall to the second's; `asks` the deeper of their courts. `outlines`: each mass's footprint.
 */
export function courtGaps(docks: DerivedDock[], outlines: ReadonlyMap<Id, Polygon>): CourtGap[] {
  const out: CourtGap[] = []
  for (let i = 0; i < docks.length; i++)
    for (let j = i + 1; j < docks.length; j++) {
      const p = docks[i]
      const q = docks[j]
      if (p.massId === q.massId) continue
      const f = facing(p, q)
      if (!f || facingGap(q, p) === null) continue
      const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)
      const s = (f.lo + f.hi) / 2 / len
      const from = { x: p.a.x + (p.b.x - p.a.x) * s, y: p.a.y + (p.b.y - p.a.y) * s }
      const others = [...outlines].filter(([id]) => id !== p.massId && id !== q.massId).map(([, o]) => o)
      const start = { x: from.x + p.out.x * 0.01, y: from.y + p.out.y * 0.01 }
      if (others.some((o) => pointInPolygon(start, o)) || rayDistance(start, p.out, others) < f.gap - 0.02) continue
      out.push({
        a: { massId: p.massId, wall: p.wall },
        b: { massId: q.massId, wall: q.wall },
        from,
        to: { x: from.x + p.out.x * f.gap, y: from.y + p.out.y * f.gap },
        gap: f.gap,
        asks: Math.max(p.depth, q.depth),
      })
    }
  return out
}

/**
 * Courts shared (Decision "Truck court"): two docked walls of different masses facing each other, their courts meeting
 * (the gap under both depths together), share one court: each says the other (the nearest, when several), and a court
 * deeper than its gap stops at the other mass's wall, all along its own (so it does not run into it: the gap against
 * the depths is the courts' Issue). It stays a rectangle, its mouth `court[3]`–`court[2]` as every court's (the network
 * and the routes read it there: a court cut round the other mass lost its corners' order).
 */
export function shareCourts(docks: DerivedDock[]): DerivedDock[] {
  const out = docks.map((d) => ({ ...d }))
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const p = out[i]
      const q = out[j]
      if (p.massId === q.massId) continue
      const gp = facingGap(p, q)
      const gq = facingGap(q, p)
      if (gp === null || gq === null || Math.min(gp, gq) > p.depth + q.depth + 1e-6) continue
      if (!p.shares || gp < p.shares.gap) p.shares = { massId: q.massId, wall: q.wall, gap: gp }
      if (!q.shares || gq < q.shares.gap) q.shares = { massId: p.massId, wall: p.wall, gap: gq }
    }
  for (const d of out)
    if (d.shares && d.shares.gap < d.depth - 1e-6) {
      const o = { x: d.out.x * d.shares.gap, y: d.out.y * d.shares.gap }
      // the frame keeps its ends (the wall's own, unless its courts have shapes: then theirs) and stops at the other wall; so do its shapes, cut by the line
      const [a, b] = [d.court[0], d.court[1]]
      d.court = [a, b, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }]
      if (d.shapes) {
        const cut = intersection(d.shapes, [d.court]).map((r) => r[0])
        d.shapes = cut.length ? cut : [d.court]
      }
    }
  return out
}

/** A wall's court depth by the t of its middle in one of a mass's lists (its own, Mass.courts; its block's for it,
 *  Mass.blockCourts), if that list has one: the first entry of the wall that says a depth (a wall may have several entries, Phase D.3). */
const depthIn = (list: { t: number; depth?: number }[] | undefined, poly: Polygon, w: Wall) => list?.find((c) => c.depth !== undefined && edgeAt(poly, c.t).i === w.i)?.depth

/** The shapes of a wall's courts in a mass's `blockCourts` (Phase D.3): one per entry that has one, a wall's several (a split) in the list's order. */
const shapesIn = (list: { t: number; shape?: Contour }[] | undefined, poly: Polygon, w: Wall): Contour[] =>
  (list ?? []).flatMap((c) => (c.shape && edgeAt(poly, c.t).i === w.i ? [c.shape] : []))

/**
 * The option's docks: for each design mass that is built and stands on the ground, its docked walls with their doors
 * and courts. `shown`: every mass the option shows (its context too: what a wall's room is measured against).
 * `covered`: the masses whose program asks for docks and finds every wall it would take covered by another mass.
 * `grid`: the option's structural grid; a mass on it has its doors by pattern, and `targets` says, for those whose
 * program's docks the brief counts, how many doors it places against how many that rule would give. `blockDepths`: by
 * building, its block's court depth (a warehouse type's copy; absent, `courtDepth`).
 */
export function deriveDocks(
  masses: Mass[],
  programs: Program[],
  shown: DerivedMass[],
  courtDepth: number,
  boundary: Polygon | null,
  roadWidth = 0,
  grid: DockGrid | null = null,
  blockDepths: ReadonlyMap<Id, number> = new Map(),
): { docks: DerivedDock[]; covered: Id[]; targets: DoorTarget[]; gaps: CourtGap[] } {
  const byId = new Map(masses.map((m) => [m.id, m]))
  const programOf = new Map(programs.map((g) => [g.id, g]))
  const grounded = shown.filter((d) => d.built && d.polygon.length >= 3 && d.span[0] <= 1e-6 && d.span[1] > 0)
  const out: DerivedDock[] = []
  const covered: Id[] = []
  const targets: DoorTarget[] = []
  for (const d of grounded) {
    if (d.context) continue
    const m = byId.get(d.id)
    if (!m) continue
    const program = m.programId ? programOf.get(m.programId) : undefined
    const own = m.docks !== undefined
    const base = blockDepths.get(d.buildingId) ?? courtDepth
    let walls: Wall[]
    if (own) {
      const all = dockableWalls(d.polygon)
      const picked = new Set(m.docks!.map((t) => edgeAt(d.polygon, t).i))
      walls = all.filter((w) => picked.has(w.i))
    } else {
      if (!program?.docks) continue
      const around = { masses: grounded.filter((x) => x.id !== d.id).map((x) => x.polygon), boundary }
      walls = defaultWalls(d.polygon, around, base, roadWidth)
      if (walls.length === 0 && candidates(d.polygon).walls.length > 0) covered.push(d.id)
    }
    // a warehouse type's copy (Decision "Warehouse type"): its doors exactly where the type's elements put them
    const given = m.doorsAt ? givenDoors(walls, d.polygon, m.doorsAt) : null
    const doors = given ?? doorsOn(walls, program?.docks ?? DEFAULT_DOORS, d.area)
    // on the grid: the doors by pattern, every wall module by module (one that is not, and the mass's doors stay as above)
    const slots = !given && grid && onGrid(grid.grid, d.polygon) ? patterned(walls, d, m, program, grid) : null
    walls.forEach((w, k) => {
      const mine = depthIn(m.courts, d.polygon, w)
      // courts with a shape of their own (Phase D.3): under the wall's own pill, as the block's depth is; their frame is the court trucks come in by
      const shaped = mine === undefined ? shapedCourts(w, shapesIn(m.blockCourts, d.polygon, w)) : null
      const depth = shaped?.depth ?? mine ?? depthIn(m.blockCourts, d.polygon, w) ?? base
      out.push({
        massId: d.id,
        wall: w.i,
        t: w.t,
        a: w.a,
        b: w.b,
        out: w.out,
        doors: slots ? slots[k].filter((x) => x.door).map((x) => x.at) : doors[k],
        court: shaped?.court ?? courtOf(w, depth),
        ...(shaped ? { shapes: shaped.shapes } : {}),
        depth,
        ...(mine !== undefined ? { ownDepth: true as const } : {}),
        own,
        ...(slots ? { slots: slots[k] } : {}),
      })
    })
    if (slots && program?.docks && walls.length > 0)
      targets.push({ massId: d.id, doors: slots.flat().filter((x) => x.door).length, target: doors.reduce((n, x) => n + x.length, 0) })
  }
  const outlines = new Map(grounded.map((x) => [x.id, x.polygon]))
  return { docks: shareCourts(out), covered, targets, gaps: courtGaps(out, outlines) }
}

/** Each wall's dock doors as a warehouse type placed them (`Mass.doorsAt`: by wall, m from its start). */
function givenDoors(walls: Wall[], poly: Polygon, given: NonNullable<Mass['doorsAt']>): Point[][] {
  return walls.map((w) =>
    given
      .filter((e) => e.kind === 'dock' && edgeAt(poly, e.t).i === w.i)
      .flatMap((e) => e.at.filter((s) => s <= w.length + 1e-6).map((s) => ({ x: w.a.x + ((w.b.x - w.a.x) * s) / w.length, y: w.a.y + ((w.b.y - w.a.y) * s) / w.length }))),
  )
}

/** Each wall's modules with their doors by the mass's pattern (its own, its program's, the default); null when a wall
 *  is not on the grid's modules. */
function patterned(walls: Wall[], d: DerivedMass, m: Mass, program: Program | undefined, grid: DockGrid): DockSlot[][] | null {
  const pattern = m.doorPattern ?? program?.docks?.pattern ?? DEFAULT_PATTERN
  const bays = grid.runs.get(d.buildingId) ?? null
  const out: DockSlot[][] = []
  for (const w of walls) {
    const flips = new Set((m.doorFlips ?? []).filter((f) => edgeAt(d.polygon, f.t).i === w.i).map((f) => f.module))
    const a = toGrid(grid.grid, w.a)
    const b = toGrid(grid.grid, w.b)
    const run = bays ? (Math.abs(a.y - b.y) < ON_LINE ? bays.x : bays.y) : null
    const slots = slotsOn(w, grid.grid, run, pattern, flips)
    if (!slots) return null
    out.push(slots)
  }
  return out
}
