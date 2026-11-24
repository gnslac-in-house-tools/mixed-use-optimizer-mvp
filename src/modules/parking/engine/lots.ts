// Parking lots (Decision "Lot tool", PK.3; Practiko's lot of stalls, its idea and not its code): car stalls in rows at
// right angles to an aisle, two rows to an aisle, the rows' metres from the lot's sizes (its own, else the standards').
// A lot is anchored to a side of a mass's box, or free:
//   anchored  the side as a wall (`wallOf`): the mass's own frame, its footprint's first edge, so it follows the mass
//             when it grows, moves or turns; the lot runs along the whole wall or a length of it from the corner where
//             the wall starts, a walk off it, as many rows deep as it says or as fit before the first thing in its
//             way: a street, a truck court, a gate's lane, another mass, else the setback (`roomOut`)
//   free      its rectangle; its rows run along its width, as many as its depth holds
// A stall stays only whole inside the site and clear of the masses (and a walk round them), the truck courts, the
// gates' lanes, the roads and the lots before it; what it runs over is named, and the stalls left out are not counted
// (Decision "Lot tool": warnings, never a block). Its entrance is an end of its first aisle: a road that cars may use
// must come within reach of it, or Connect draws one (engine/circulation/connect.ts). Pure.
import type { Id, Lot, LotSide, Point, Polygon } from '../../../model/schema.ts'
import type { StandardFigures } from '../../../engine/circulation/standards.ts'
import type { Region } from '../../../engine/geom/boolean.ts'
import { bounds, boundsTouch, centroid, distancePointSegment, pointInPolygon, type Bounds } from '../../../engine/geom/polygon.ts'
import { obstacleOf } from '../../../engine/circulation/route.ts'
import { stripPieces } from '../../../engine/path/strip.ts'
import { courtShapes, type DerivedDock, type DerivedGate, type DerivedMass, type DerivedRoad, type Issue } from '../../../engine/types.ts'
import { convexPieces, overlap, SIDEWALK } from './parking.ts'

/** m: the walk between an anchored lot and its wall. */
export const WALK = SIDEWALK
/** m: a road this close to a lot's entrance (past half its width) reaches it. */
export const REACH = 3
/** Rows "to the limit" where there is no site to stop them. */
const NO_LIMIT_ROWS = 4

export interface LotSizes {
  stallWidth: number
  stallDepth: number
  aisleWidth: number
}

/** A lot's sizes: its own, else the standards'. */
export const sizesOf = (s: StandardFigures, lot: Pick<Lot, 'sizes'>): LotSizes => ({
  stallWidth: lot.sizes?.stallWidth ?? s.stallWidth,
  stallDepth: lot.sizes?.stallDepth ?? s.stallDepth,
  aisleWidth: lot.sizes?.aisleWidth ?? s.aisleWidth,
})

/** m: so many rows deep, each its stalls' depth, two rows to an aisle (a row alone has an aisle of its own). */
export const depthOf = (rows: number, z: LotSizes) => rows * z.stallDepth + Math.ceil(rows / 2) * z.aisleWidth

/** The rows a depth holds. */
export function rowsIn(depth: number, z: LotSizes): number {
  let r = 0
  while (depthOf(r + 1, z) <= depth + 1e-6 && r < 200) r++
  return r
}

const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y

/** A side of a mass's box as a wall: the corner it starts at, its way along it, the way out of the box, its length. */
export interface Wall {
  side: LotSide
  start: Point
  along: Point
  out: Point
  length: number
}

/** The mass's own frame: its footprint's first edge's way `u`, `n` to its left, and its box in them. */
function frameOf(polygon: Polygon) {
  if (polygon.length < 3) return null
  let u: Point | null = null
  for (let i = 0; i < polygon.length && !u; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l > 1e-6) u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  }
  if (!u) return null
  const n = { x: -u.y, y: u.x }
  const o = polygon[0]
  const s = polygon.map((q) => dot({ x: q.x - o.x, y: q.y - o.y }, u!))
  const t = polygon.map((q) => dot({ x: q.x - o.x, y: q.y - o.y }, n))
  return { o, u, n, s0: Math.min(...s), s1: Math.max(...s), t0: Math.min(...t), t1: Math.max(...t) }
}

/** The side of a mass's box as a wall (null for a polygon with no box). */
export function wallOf(polygon: Polygon, side: LotSide): Wall | null {
  const f = frameOf(polygon)
  if (!f) return null
  const at = (s: number, t: number) => add(add(f.o, f.u, s), f.n, t)
  const neg = (p: Point) => ({ x: -p.x, y: -p.y })
  if (side === 's0') return { side, start: at(f.s0, f.t0), along: f.n, out: neg(f.u), length: f.t1 - f.t0 }
  if (side === 's1') return { side, start: at(f.s1, f.t0), along: f.n, out: f.u, length: f.t1 - f.t0 }
  if (side === 't0') return { side, start: at(f.s0, f.t0), along: f.u, out: neg(f.n), length: f.s1 - f.s0 }
  return { side, start: at(f.s0, f.t1), along: f.u, out: f.n, length: f.s1 - f.s0 }
}

/** The four sides of a mass's box as walls. */
export const wallsOf = (polygon: Polygon): Wall[] => (['s0', 's1', 't0', 't1'] as const).flatMap((s) => wallOf(polygon, s) ?? [])

export type Facing = 'north' | 'east' | 'south' | 'west'
/** Which way a unit vector points, as a compass reads it (the plan's y is north). */
export function facingOf(out: Point): Facing {
  if (Math.abs(out.x) >= Math.abs(out.y)) return out.x >= 0 ? 'east' : 'west'
  return out.y >= 0 ? 'north' : 'south'
}

/** Whether a truck court stands on this wall of a mass: a docked wall facing its way, along it. */
export function courtOn(docks: DerivedDock[], massId: Id, wall: Wall): boolean {
  return docks.some((d) => {
    if (d.massId !== massId || dot(d.out, wall.out) < 0.95) return false
    const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 }
    const off = { x: mid.x - wall.start.x, y: mid.y - wall.start.y }
    const a = dot(off, wall.along)
    return Math.abs(dot(off, wall.out)) < 1 && a > -1e-6 && a < wall.length + 1e-6
  })
}

/** The first crossing of a ray with any ring (its distance; Infinity: none). */
function rayExit(p: Point, d: Point, rings: Polygon[]): number {
  let best = Infinity
  for (const ring of rings)
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % n]
      const e = { x: b.x - a.x, y: b.y - a.y }
      const den = d.x * e.y - d.y * e.x
      if (Math.abs(den) < 1e-12) continue
      const t = ((a.x - p.x) * e.y - (a.y - p.y) * e.x) / den
      const r = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den
      if (t > 1e-9 && r >= -1e-9 && r <= 1 + 1e-9 && t < best) best = t
    }
  return best
}

/** Something a lot "to the limit" stops before: its outline and its name. */
export interface Stop {
  shape: Polygon
  name: string
}

/** The setback's name, as the warnings say it. */
export const SETBACK = 'the setback'

/**
 * How far a lot along a wall (from a0 to a1, its near edge `v0` out) may reach, in m, and what stops it: the first
 * thing in its way (`stops`: a point inside one has none), else the buildable area (the setback), else the site. Read
 * every 2 m along it; a point off the limit has none. Null: no site and nothing in its way.
 */
export function roomOut(wall: Wall, a0: number, a1: number, v0: number, limit: Region[], stops: Stop[] = []): { room: number; stop: string } | null {
  const n = Math.max(1, Math.ceil((a1 - a0) / 2))
  let best: { room: number; stop: string } | null = null
  const take = (room: number, stop: string) => {
    if (Number.isFinite(room) && (!best || room < best.room)) best = { room, stop }
  }
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n + (k === 0 ? 0.01 : k === n ? -0.01 : 0)
    const p = add(add(wall.start, wall.along, a), wall.out, v0)
    if (limit.length) {
      const region = limit.find((r) => r[0] && pointInPolygon(p, r[0]) && !r.slice(1).some((h) => pointInPolygon(p, h)))
      take(region ? rayExit(p, wall.out, region) : 0, SETBACK)
    }
    for (const s of stops) take(pointInPolygon(p, s.shape) ? 0 : rayExit(p, wall.out, [s.shape]), s.name)
  }
  return best
}

/** A lot laid out: its frame (from `start`, `along` its rows, `out` across them) and its extent in it. */
export interface LotFrame {
  start: Point
  along: Point
  out: Point
  a0: number
  a1: number
  v0: number
  v1: number
}

export interface DerivedLot {
  id: Id
  name: string
  /** Anchored: the mass, the side, which way it faces and the wall's stretch it stands against. */
  anchor: { massId: Id; side: LotSide; facing: Facing; wall: [Point, Point]; length: number } | null
  frame: LotFrame
  polygon: Polygon
  stalls: Polygon[]
  aisles: [Point, Point][]
  rows: number
  /** Anchored: the rows that fit before what stops it (null: no site and nothing in its way). Free: null. */
  fits: number | null
  /** Anchored: what stops it "to the limit" (`SETBACK`, a street, a mass's name…). Free: null. */
  stop: string | null
  length: number
  depth: number
  sizes: LotSizes
  /** The stalls left out where it runs over something, and what. */
  left: number
  over: string[]
  /** Its entrance: an end of its first aisle (the point on its edge, the way out), its end, and both ends' names. */
  entrance: { at: Point; out: Point; end: 'start' | 'end'; names: [string, string] }
  reached: boolean
}

export interface LotInput {
  lots: Lot[]
  shown: DerivedMass[]
  docks: DerivedDock[]
  gates: DerivedGate[]
  roads: DerivedRoad[]
  site: { polygon: Polygon | null; buildable: Region[] }
  standards: StandardFigures
}

/** The ground masses a lot can stand against or runs over: built, on the ground, with an outline. */
const groundOf = (shown: DerivedMass[]) => shown.filter((m) => m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6)

/** Where a lot is laid: its frame, rows and what fits. Null: its wall is gone (the mass, or its outline). */
function layOut(lot: Lot, input: LotInput, z: LotSizes, stops: (Stop & { massId?: Id })[]): { frame: LotFrame; rows: number; fits: number | null; stop: string | null; anchor: DerivedLot['anchor'] } | null {
  if (lot.anchor) {
    const m = groundOf(input.shown).find((x) => x.id === lot.anchor!.massId)
    const wall = m && wallOf(m.polygon, lot.anchor.side)
    if (!wall || wall.length < 1e-6) return null
    const len = wall.length
    const a0 = Math.min(lot.anchor.from ?? 0, Math.max(0, len - z.stallWidth))
    const a1 = lot.anchor.length === undefined ? len : Math.min(len, a0 + lot.anchor.length)
    const limit = input.site.buildable.length ? input.site.buildable : input.site.polygon ? [[input.site.polygon]] : []
    // its own mass's walk does not stop it
    const room = roomOut(wall, a0, a1, WALK, limit, stops.filter((s) => s.massId !== m.id))
    const fits = room === null ? null : rowsIn(room.room, z)
    const rows = lot.rows ?? fits ?? NO_LIMIT_ROWS
    const v1 = WALK + depthOf(Math.max(1, rows), z)
    const frame = { start: wall.start, along: wall.along, out: wall.out, a0, a1, v0: WALK, v1 }
    const at = (a: number) => add(wall.start, wall.along, a)
    return { frame, rows, fits, stop: room?.stop ?? null, anchor: { massId: m.id, side: wall.side, facing: facingOf(wall.out), wall: [at(a0), at(a1)], length: len } }
  }
  const r = lot.rect!
  const c = Math.cos((r.rotation * Math.PI) / 180)
  const s = Math.sin((r.rotation * Math.PI) / 180)
  const along = { x: c, y: s }
  const out = { x: -s, y: c }
  const start = add(add(r.center, along, -r.width / 2), out, -r.depth / 2)
  return { frame: { start, along, out, a0: 0, a1: r.width, v0: 0, v1: r.depth }, rows: rowsIn(r.depth, z), fits: null, stop: null, anchor: null }
}

/** What a stall must keep clear of: each thing, its bounds and its name. */
interface Blocker {
  shape: Polygon
  box: Bounds
  name: string
}

/** Every lot of an option laid out, in order: a lot keeps clear of those before it. */
export function deriveLots(input: LotInput): DerivedLot[] {
  const { lots, docks, gates, roads, site, standards } = input
  if (lots.length === 0) return []
  const blockers: Blocker[] = []
  // what a lot "to the limit" stops before: the same things its stalls keep clear of (the lots before it too)
  const stops: (Stop & { massId?: Id })[] = []
  const block = (shape: Polygon, name: string, massId?: Id) => {
    blockers.push({ shape, box: bounds(shape), name })
    stops.push({ shape, name, massId })
  }
  for (const m of groundOf(input.shown)) block(obstacleOf(m.polygon, SIDEWALK), m.name, m.id)
  for (const d of docks) for (const court of courtShapes(d).flatMap(convexPieces)) block(court, 'a truck court')
  for (const g of gates) block(g.lane, 'a gate’s lane')
  for (const r of roads) for (const piece of stripPieces(r.points, r.width)) block(piece, 'a street')
  const carRoads = roads.filter((r) => r.vehicles !== 'trucks')
  const out: DerivedLot[] = []
  for (const lot of lots) {
    const z = sizesOf(standards, lot)
    const laid = layOut(lot, input, z, stops)
    if (!laid) continue
    const { frame: f, rows } = laid
    const map = (a: number, v: number) => add(add(f.start, f.along, a), f.out, v)
    const quad = (a0: number, a1: number, v0: number, v1: number): Polygon => [map(a0, v0), map(a1, v0), map(a1, v1), map(a0, v1)]
    const stalls: Polygon[] = []
    const aisles: [Point, Point][] = []
    const over = new Set<string>()
    let left = 0
    const per = Math.max(0, Math.floor((f.a1 - f.a0) / z.stallWidth + 1e-6))
    let v = f.v0
    let entryV: number | null = null
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < per; k++) {
        const cell = quad(f.a0 + k * z.stallWidth, f.a0 + (k + 1) * z.stallWidth, v, v + z.stallDepth)
        const box = bounds(cell)
        const hit = blockers.find((b) => boundsTouch(box, b.box) && overlap(cell, b.shape))
        const outside = site.polygon && !cell.every((q) => pointInPolygon(q, site.polygon!))
        if (hit || outside) {
          left++
          over.add(hit ? hit.name : 'the site’s edge')
        } else stalls.push(cell)
      }
      v += z.stallDepth
      if (i % 2 === 0) {
        const mid = v + z.aisleWidth / 2
        if (entryV === null) entryV = mid
        aisles.push([map(f.a0, mid), map(f.a1, mid)])
        v += z.aisleWidth
      }
    }
    const polygon = quad(f.a0, f.a1, f.v0, f.v1)
    // the lots after it keep clear of it
    block(polygon, lot.name)
    // its entrance: an end of its first aisle; absent, the end nearer a road cars may use
    const ev = entryV ?? (f.v0 + f.v1) / 2
    const ends = { start: { at: map(f.a0, ev), out: { x: -f.along.x, y: -f.along.y } }, end: { at: map(f.a1, ev), out: f.along } }
    const nearest = (q: Point) => Math.min(Infinity, ...carRoads.flatMap((r) => r.points.slice(1).map((b, i) => distancePointSegment(q, r.points[i], b) - r.width / 2)))
    const end = lot.entry ?? (nearest(ends.end.at) < nearest(ends.start.at) ? 'end' : 'start')
    const e = ends[end]
    const name = (o: Point) => `${facingOf(o)[0].toUpperCase()}${facingOf(o).slice(1)} end`
    out.push({
      id: lot.id,
      name: lot.name,
      anchor: laid.anchor,
      frame: f,
      polygon,
      stalls,
      aisles,
      rows,
      fits: laid.fits,
      stop: laid.stop,
      length: f.a1 - f.a0,
      depth: f.v1 - f.v0,
      sizes: z,
      left,
      over: [...over],
      entrance: { at: e.at, out: e.out, end, names: [name(ends.start.out), name(ends.end.out)] },
      reached: nearest(e.at) <= REACH,
    })
  }
  return out
}

/** m, to 0.1. */
const m = (x: number) => (Math.round(x * 10) / 10).toLocaleString('en-US')

/**
 * A lot's warnings (Decision "Lot tool": warnings, never a block): rows past the setback, stalls left out where it runs
 * over something, an entrance no street reaches.
 */
export function lotIssues(lots: DerivedLot[]): Issue[] {
  const issues: Issue[] = []
  for (const l of lots) {
    const at = centroid(l.polygon)
    const where = `${l.stop === SETBACK ? 'to' : 'before'} ${l.stop}`
    if (l.fits !== null && l.rows > l.fits)
      issues.push({
        code: 'lot',
        severity: 'warning',
        massIds: [],
        at,
        message: `${l.name}: ${l.rows} ${l.rows === 1 ? 'row is' : 'rows are'} ${m(depthOf(l.rows, l.sizes))} m deep; ${l.fits === 0 ? 'none fits' : `${l.fits} fit`} ${where}.`,
      })
    // to the limit, and something came to stand in front of it
    else if (l.rows === 0) issues.push({ code: 'lot', severity: 'warning', massIds: [], at, message: `${l.name}: no row fits ${where}; set its rows to go past it.` })
    if (l.left > 0)
      issues.push({ code: 'lot', severity: 'warning', massIds: [], at, message: `${l.name} runs over ${l.over.join(', ')}: ${l.left} of its stalls are left out.` })
    if (!l.reached)
      issues.push({ code: 'lot', severity: 'warning', massIds: [], at: l.entrance.at, message: `No street reaches ${l.name}’s entrance: draw one, or Connect draws it.` })
  }
  return issues
}

/** m: how far past a wall the Lot tool finds it (and how far inside). */
const NEAR_OUT = 30
const NEAR_IN = 3

/**
 * The wall of a ground mass the Lot tool is next to at `q` (Decision "Lot tool"): the side of its box `q` stands in
 * front of, within NEAR_OUT m out of it; the nearest. Null: open ground.
 */
export function wallNear(shown: DerivedMass[], q: Point): { massId: Id; wall: Wall } | null {
  let best: { massId: Id; wall: Wall; d: number } | null = null
  for (const ms of groundOf(shown).filter((x) => !x.context))
    for (const wall of wallsOf(ms.polygon)) {
      const off = { x: q.x - wall.start.x, y: q.y - wall.start.y }
      const a = dot(off, wall.along)
      const d = dot(off, wall.out)
      if (a < 0 || a > wall.length || d < -NEAR_IN || d > NEAR_OUT) continue
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { massId: ms.id, wall, d }
    }
  return best && { massId: best.massId, wall: best.wall }
}

/** Where `q` falls along a wall and out of it (m). */
export function onWall(wall: Wall, q: Point): { a: number; v: number } {
  const off = { x: q.x - wall.start.x, y: q.y - wall.start.y }
  return { a: dot(off, wall.along), v: dot(off, wall.out) }
}

/** m: a free lot's near edge this close to a wall's walk (and parallel to it) is anchored to it when dropped there. */
export const SNAP = 3

/**
 * A free lot dropped against a wall (Decision "Lot tool"): its rectangle parallel to the wall, its near edge within
 * SNAP m of the walk, along it by at least two stalls; anchored there, over the stretch it covers and as many rows as
 * its depth held. Null: it stays free.
 */
export function anchorFor(shown: DerivedMass[], rect: NonNullable<Lot['rect']>, z: LotSizes): Pick<Lot, 'anchor' | 'rows'> | null {
  const c = Math.cos((rect.rotation * Math.PI) / 180)
  const s = Math.sin((rect.rotation * Math.PI) / 180)
  const axes = [{ x: c, y: s }, { x: -s, y: c }]
  const corners = [-1, 1].flatMap((i) => [-1, 1].map((j) => add(add(rect.center, axes[0], (i * rect.width) / 2), axes[1], (j * rect.depth) / 2)))
  for (const ms of groundOf(shown).filter((x) => !x.context))
    for (const wall of wallsOf(ms.polygon)) {
      if (!axes.some((ax) => Math.abs(Math.abs(dot(ax, wall.along)) - 1) < 0.002)) continue
      const at = corners.map((q) => onWall(wall, q))
      const near = Math.min(...at.map((x) => x.v))
      const far = Math.max(...at.map((x) => x.v))
      const a0 = Math.max(0, Math.min(...at.map((x) => x.a)))
      const a1 = Math.min(wall.length, Math.max(...at.map((x) => x.a)))
      if (Math.abs(near - WALK) > SNAP || a1 - a0 < 2 * z.stallWidth) continue
      const whole = a0 < z.stallWidth / 2 && a1 > wall.length - z.stallWidth / 2
      return {
        anchor: { massId: ms.id, side: wall.side, ...(whole ? {} : { from: a0, length: a1 - a0 }) },
        rows: Math.max(1, rowsIn(far - WALK, z)),
      }
    }
  return null
}
