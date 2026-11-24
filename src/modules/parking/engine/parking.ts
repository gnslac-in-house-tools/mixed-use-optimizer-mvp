// Car parking along the roads (Decision "Exterior circulation", 4.6; port of Plaza-Practiko `motores/cajones/calles.ts`
// and `cajonesDeTramo` of `circuito.ts`, TestFit's way: the roads lead and the stalls come by themselves). Each road
// cars use (not the trucks' alone, not an existing street) is split into runs at its bends; along each run a row of
// stalls at right angles to it, on one side (the left: a loop's inside, drawn anticlockwise) or both, outwards from its
// edge; which, a street segment's own (Decision "Street parking by side"), else the option's, else the standard
// (Decision "Circulation optimization"); segments of a road that differ each take their stretch. A stall stays only whole inside
// the site and clear of the masses (and a sidewalk around them), the truck courts, the gates' lanes, the roads and
// the other stalls. Pure. Practiko measured the overlaps with booleans; here the stalls and what they meet are convex,
// so a separating axis test does it, and a grid keeps it fast.
import type { DesignOption, Id, ParkingSide, Point, Polygon, StreetParking } from '../../../model/schema.ts'
import { centreShift, turned } from '../../../engine/circulation/streets.ts'
import { offsetLine } from '../../../engine/path/offset.ts'
import type { StandardFigures } from '../../../engine/circulation/standards.ts'
import { pointInPolygon } from '../../../engine/geom/polygon.ts'
import { courtShapes, type DerivedDock, type DerivedGate, type DerivedMass, type DerivedRoad } from '../../../engine/types.ts'
import { obstacleOf } from '../../../engine/circulation/route.ts'
import { stripPieces } from '../../../engine/path/strip.ts'

/** A road splits into runs at bends of more than this (degrees): each side starts another row there. */
const BEND = 20
/** m: the walk kept between a stall and a building's wall. */
export const SIDEWALK = 1.5
/** m: what two shapes may share before they overlap (a touch is not a clash). */
const SLACK = 0.05
/** m: the grid's cell. */
const CELL = 20

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const along = (a: Point, v: Point, t: number): Point => ({ x: a.x + v.x * t, y: a.y + v.y * t })
const len = (v: Point) => Math.hypot(v.x, v.y)
const unit = (v: Point): Point => {
  const l = len(v) || 1
  return { x: v.x / l, y: v.y / l }
}
const left = (d: Point): Point => {
  const u = unit(d)
  return { x: -u.y, y: u.x }
}

/** The polyline without repeated points. */
function clean(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) if (!out.length || len(sub(p, out[out.length - 1])) > 1e-6) out.push(p)
  return out
}

/** How much the polyline turns at vertex i (degrees, unsigned). */
function turn(t: Point[], i: number): number {
  const a = sub(t[i], t[i - 1])
  const b = sub(t[i + 1], t[i])
  const la = len(a)
  const lb = len(b)
  if (la === 0 || lb === 0) return 0
  const c = (a.x * b.x + a.y * b.y) / (la * lb)
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

/** The road split into runs where it bends more than BEND degrees (a curve is one run). Port of `tramosDeCalle`. */
export function runsOf(points: Point[]): Point[][] {
  const t = clean(points)
  if (t.length < 2) return []
  const out: Point[][] = []
  let run = [t[0]]
  for (let i = 1; i < t.length; i++) {
    run.push(t[i])
    if (i < t.length - 1 && turn(t, i) > BEND) {
      out.push(run)
      run = [t[i]]
    }
  }
  out.push(run)
  return out
}

/** The parallel `d` m to the left of the open polyline, mitred at its vertices. Port of `paralela`. */
export function parallel(t: Point[], d: number): Point[] {
  return t.map((p, i) => {
    const n1 = i > 0 ? left(sub(p, t[i - 1])) : null
    const n2 = i < t.length - 1 ? left(sub(t[i + 1], p)) : null
    if (!n1) return along(p, n2!, d)
    if (!n2) return along(p, n1, d)
    const k = 1 + n1.x * n2.x + n1.y * n2.y
    // a very sharp bend is not mitred (the parallel would run far)
    if (k < 0.2) return along(p, n2, d)
    return { x: p.x + ((n1.x + n2.x) * d) / k, y: p.y + ((n1.y + n2.y) * d) / k }
  })
}

/** The run lengthened `h` m at both ends. Port of `prolongado`. */
function extended(t: Point[], h: number): Point[] {
  const n = t.length
  const u0 = unit(sub(t[1], t[0]))
  const u1 = unit(sub(t[n - 1], t[n - 2]))
  return [along(t[0], u0, -h), ...t.slice(1, -1), along(t[n - 1], u1, h)]
}

const cumulative = (t: Point[]) => t.reduce<number[]>((acc, q, i) => [...acc, i ? acc[i - 1] + len(sub(q, t[i - 1])) : 0], [])

/** The point `s` m from the polyline's start. */
function at(t: Point[], acc: number[], s: number): Point {
  let i = 1
  while (i < t.length - 1 && acc[i] < s) i++
  const l = acc[i] - acc[i - 1]
  return l > 0 ? along(t[i - 1], sub(t[i], t[i - 1]), (s - acc[i - 1]) / l) : t[i]
}

/** The pieces of the polyline inside the outline: each row starts where the site does. Port of `pedazosDentro`. */
export function piecesInside(t: Point[], outline: Polygon): Point[][] {
  const acc = cumulative(t)
  const total = acc[acc.length - 1]
  const cuts = [0, total]
  for (let i = 1; i < t.length; i++) {
    const p = t[i - 1]
    const d = sub(t[i], p)
    for (let k = 0, n = outline.length; k < n; k++) {
      const a = outline[k]
      const w = sub(outline[(k + 1) % n], a)
      const den = d.x * w.y - d.y * w.x
      if (Math.abs(den) < 1e-12) continue
      const s = ((a.x - p.x) * w.y - (a.y - p.y) * w.x) / den
      const v = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den
      if (s > 0 && s < 1 && v >= 0 && v <= 1) cuts.push(acc[i - 1] + s * (acc[i] - acc[i - 1]))
    }
  }
  cuts.sort((x, y) => x - y)
  const out: Point[][] = []
  for (let k = 0; k + 1 < cuts.length; k++) {
    const s0 = cuts[k]
    const s1 = cuts[k + 1]
    if (s1 - s0 < 1e-6 || !pointInPolygon(at(t, acc, (s0 + s1) / 2), outline)) continue
    const piece = [at(t, acc, s0), ...t.filter((_, i) => acc[i] > s0 && acc[i] < s1), at(t, acc, s1)]
    const last = out[out.length - 1]
    if (last && len(sub(last[last.length - 1], piece[0])) < 1e-9) last.push(...piece.slice(1))
    else out.push(piece)
  }
  return out
}

/** The stalls along a polyline, on its right, W wide and L deep, centred on it. Port of `cajonesDeTramo`. */
export function stallsAlong(t: Point[], W: number, L: number): Polygon[] {
  const acc = cumulative(t)
  const total = acc[acc.length - 1]
  const n = Math.floor(total / W + 1e-9)
  const stall = (s: number): Polygon | null => {
    const p0 = at(t, acc, s)
    const p1 = at(t, acc, s + W)
    const d = sub(p1, p0)
    const l = len(d)
    if (l < W * 0.9) return null // the chord is short: a tight curve
    const normal = { x: d.y / l, y: -d.x / l } // to the right
    return [p0, p1, along(p1, normal, L), along(p0, normal, L)]
  }
  const out: Polygon[] = []
  const step = W / 10
  let s = (total - n * W) / 2
  while (s + W <= total + 1e-9) {
    const c = stall(s)
    const prev = out[out.length - 1]
    if (!c || (prev && overlap(prev, c))) {
      s += step
      continue
    }
    out.push(c)
    s += W
  }
  return out
}

// ---- convex overlap, with a grid -------------------------------------------------------------------------------

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/**
 * A polygon as convex pieces (the separating axis test is exact only for convex shapes): itself when it is convex, else its triangles (ears cut one by
 * one). A court with a shape of its own may be a U, a notch or an inward arc (Phase D.3, review S4): its stalls keep off its area, not its hull.
 */
export function convexPieces(poly: Polygon): Polygon[] {
  const n = poly.length
  if (n <= 3) return [poly]
  const area = poly.reduce((s, q, i) => s + (q.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * q.y), 0)
  const sign = area >= 0 ? 1 : -1
  if (poly.every((q, i) => sign * cross(poly[(i + n - 1) % n], q, poly[(i + 1) % n]) >= -1e-9)) return [poly]
  const rest = [...poly]
  const out: Polygon[] = []
  while (rest.length > 3) {
    const m = rest.length
    const ear = rest.findIndex((q, i) => {
      const a = rest[(i + m - 1) % m]
      const b = rest[(i + 1) % m]
      if (sign * cross(a, q, b) <= 1e-9) return false
      return !rest.some((r, j) => j !== i && j !== (i + m - 1) % m && j !== (i + 1) % m && [cross(a, q, r), cross(q, b, r), cross(b, a, r)].every((c) => sign * c > 1e-9))
    })
    if (ear < 0) return [poly]
    out.push([rest[(ear + m - 1) % m], rest[ear], rest[(ear + 1) % m]])
    rest.splice(ear, 1)
  }
  out.push(rest)
  return out
}

/** Do two convex polygons overlap by more than SLACK (separating axis test)? */
export function overlap(a: Polygon, b: Polygon): boolean {
  for (const poly of [a, b])
    for (let i = 0, n = poly.length; i < n; i++) {
      const e = sub(poly[(i + 1) % n], poly[i])
      const axis = unit({ x: -e.y, y: e.x })
      let [amin, amax, bmin, bmax] = [Infinity, -Infinity, Infinity, -Infinity]
      for (const q of a) {
        const v = q.x * axis.x + q.y * axis.y
        amin = Math.min(amin, v)
        amax = Math.max(amax, v)
      }
      for (const q of b) {
        const v = q.x * axis.x + q.y * axis.y
        bmin = Math.min(bmin, v)
        bmax = Math.max(bmax, v)
      }
      if (amax <= bmin + SLACK || bmax <= amin + SLACK) return false
    }
  return true
}

/** Convex shapes filed by the grid cells their bounds touch. */
class Grid {
  private cells = new Map<number, Polygon[]>()
  /** The cells a shape's bounds touch, as numbers (a cell's column and row packed). */
  private keys(p: Polygon): number[] {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const q of p) {
      if (q.x < x0) x0 = q.x
      if (q.x > x1) x1 = q.x
      if (q.y < y0) y0 = q.y
      if (q.y > y1) y1 = q.y
    }
    const out: number[] = []
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) out.push(i * 1048576 + j)
    return out
  }
  add(p: Polygon) {
    for (const k of this.keys(p)) {
      const list = this.cells.get(k)
      if (list) list.push(p)
      else this.cells.set(k, [p])
    }
  }
  hits(p: Polygon): boolean {
    for (const k of this.keys(p)) for (const q of this.cells.get(k) ?? []) if (overlap(p, q)) return true
    return false
  }
}

export interface ParkingInput {
  roads: DerivedRoad[]
  shown: DerivedMass[]
  docks: DerivedDock[]
  /** The courts' approaches from a side (network.ts): paved, no stalls. */
  approaches?: Polygon[]
  gates: DerivedGate[]
  site: Polygon | null
  standards: StandardFigures
  /** The option's parking (Decision "Circulation optimization"): over the standard's. */
  option?: Pick<DesignOption, 'parking'>
  /** Its parking lots' outlines (Decision "Lot tool"): no stall along a street goes into one. */
  lots?: Polygon[]
}

/** The roads' parking: the option's, else the standard's. */
export function parkingOf(s: StandardFigures, option?: Pick<DesignOption, 'parking'>): ParkingSide {
  return option?.parking ?? s.parking
}

/** The option's side as a street's (one side: its left, a loop's inside drawn anticlockwise). */
export const asStreetSide = (side: ParkingSide): StreetParking => (side === 'double' ? 'both' : side === 'single' ? 'left' : 'none')

/**
 * Each segment's stalls along a road, turned to its way: the segment's own, else the option's (Decision "Street parking
 * by side"). A road for trucks alone, or an existing one, has none.
 */
export function roadSides(r: DerivedRoad, side: ParkingSide): StreetParking[] {
  const n = Math.max(1, r.segments?.length ?? 1)
  if (r.kind === 'existing' || r.vehicles === 'trucks') return Array(n).fill('none')
  const fallback = asStreetSide(side)
  return Array.from({ length: n }, (_, i) => r.parking?.[i] ?? fallback)
}

/** Has a street's side these stalls? */
export const hasSide = (side: StreetParking, which: 'left' | 'right'): boolean => side === 'both' || side === which

/** A street's side with one of its two turned on or off. */
export function withSide(side: StreetParking, which: 'left' | 'right', on: boolean): StreetParking {
  const left = which === 'left' ? on : hasSide(side, 'left')
  const right = which === 'right' ? on : hasSide(side, 'right')
  return left && right ? 'both' : left ? 'left' : right ? 'right' : 'none'
}

/**
 * A road's sides (turned to its way, one per segment; null: back to the option's) as each segment's own, walked a → b:
 * what `setStreetParking` writes.
 */
export function segmentSides(r: DerivedRoad, sides: (StreetParking | null)[]): Record<Id, StreetParking | null> {
  return Object.fromEntries((r.segments ?? []).map((id, i) => [id, sides[i] === null ? null : turned(sides[i], r.forward?.[i] ?? true)]))
}

/**
 * The stretches of a road to put stalls along: its whole length when its segments agree (round at its bends), else
 * each run of segments that agree, corner to corner (of its centre line: the drawn one shifted by its side, Decision
 * "Drawing side"). With what each takes.
 */
function stretches(r: DerivedRoad, sides: StreetParking[]): { points: Point[]; side: StreetParking }[] {
  if (sides.every((x) => x === sides[0]) || !r.nodePoints || r.nodePoints.length !== sides.length + 1) return [{ points: r.points, side: sides[0] }]
  const corners = offsetLine(r.nodePoints, centreShift(r))
  const out: { points: Point[]; side: StreetParking }[] = []
  for (let i = 0; i < sides.length; ) {
    let j = i
    while (j + 1 < sides.length && sides[j + 1] === sides[i]) j++
    out.push({ points: corners.slice(i, j + 2), side: sides[i] })
    i = j + 1
  }
  return out
}

/** The option's car stalls along its roads. */
export const deriveParking = (input: ParkingInput): Polygon[] => deriveParkingBy(input).stalls

/**
 * The same stalls, and for each the id of the road it stands along (`roads[i]` is the road of `stalls[i]`): what Hide for one street reads to leave a hidden
 * street's stalls out (Phase AS.4) while they still count.
 */
export function deriveParkingBy(input: ParkingInput): { stalls: Polygon[]; roads: string[] } {
  const { roads, shown, docks, approaches = [], gates, site, standards: s, option, lots = [] } = input
  const side = parkingOf(s, option)
  const sides = roads.map((r) => roadSides(r, side))
  if (!site || sides.every((x) => x.every((y) => y === 'none'))) return { stalls: [], roads: [] }
  const W = s.stallWidth
  const L = s.stallDepth
  const blocked = new Grid()
  for (const m of shown) if (m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6) blocked.add(obstacleOf(m.polygon, SIDEWALK))
  for (const d of docks) for (const court of courtShapes(d).flatMap(convexPieces)) blocked.add(court)
  for (const a of approaches) blocked.add(a)
  for (const l of lots) blocked.add(l)
  for (const g of gates) blocked.add(g.lane)
  for (const r of roads) for (const piece of stripPieces(r.points, r.width)) blocked.add(piece)
  const stalls = new Grid()
  const out: Polygon[] = []
  const owners: string[] = []
  let owner = ''
  const place = (c: Polygon) => {
    if (!c.every((q) => pointInPolygon(q, site)) || blocked.hits(c) || stalls.hits(c)) return
    stalls.add(c)
    out.push(c)
    owners.push(owner)
  }
  roads.forEach((r, k) => {
    owner = r.id
    const h = r.width / 2
    for (const stretch of stretches(r, sides[k])) {
      if (stretch.side === 'none') continue
      for (const run of runsOf(stretch.points)) {
        // along the whole edge, its ends lengthened: at a corner the outer row reaches it. The stalls go on a line's
        // right: the left edge is walked backwards
        const axis = extended(run, h)
        const edges = [...(stretch.side !== 'right' ? [parallel(axis, h).reverse()] : []), ...(stretch.side !== 'left' ? [parallel(axis, -h)] : [])]
        for (const edge of edges) for (const piece of piecesInside(edge, site)) for (const c of stallsAlong(piece, W, L)) place(c)
      }
    }
  })
  return { stalls: out, roads: owners }
}
