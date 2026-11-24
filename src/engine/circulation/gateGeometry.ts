// The sides a gate stands on (Phase PE.2, Decision "On edge engine"): a side of a street's segment, of an existing street's stretch, or of the site's
// boundary, each a straight edge with its place along its host. Pure; the leaf under `gates.ts` (a gate's place) and `gateSides.ts` (a host's sides).
import type { ExistingRoad, Gate, GateOn, Id, Point, Polygon, StreetSegment, Streets } from '../../model/schema.ts'
import { vertexTs } from '../geom/perimeter.ts'
import { signedArea } from '../geom/polygon.ts'

/** What a gate stands on. */
export type GateHostKind = 'street' | 'existing-road' | 'boundary'

/**
 * One straight side: `a` → `b` is the edge itself, `dir` its unit direction, `out` its outward unit vector (away from the street's paving, out of the
 * site) and `lane` the way a gate's lane runs from it (away from a street; into the site from the boundary). `host`: the segment's or the road's id
 * (the boundary's: ''); `from`: m along the host's drawn line where this side starts; `index`: the boundary side's number, the existing street's stretch.
 */
export interface GateSide {
  /** The edge's id on the On edge engine: `<segment>:left`, `<stretch>:right`, `boundary:<i>`. */
  id: string
  kind: GateHostKind
  host: Id
  side?: 'left' | 'right'
  index: number
  a: Point
  b: Point
  dir: Point
  out: Point
  lane: Point
  length: number
  from: number
  /** A boundary side: the t of its two ends (the last side's second is 1). */
  ts?: [number, number]
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** The left and right sides of the straight line p → q with this paving each side, from `from` m along its host; none for a line of no length. */
function sidesOfLine(p: Point, q: Point, left: number, right: number, kind: 'street' | 'existing-road', host: Id, index: number, from: number, name: (side: 'left' | 'right') => string): GateSide[] {
  const length = dist(p, q)
  if (length < 1e-9) return []
  const dir = { x: (q.x - p.x) / length, y: (q.y - p.y) / length }
  const n = { x: -dir.y, y: dir.x }
  return (['left', 'right'] as const).map((side): GateSide => {
    const k = side === 'left' ? left : -right
    const out = side === 'left' ? n : { x: -n.x, y: -n.y }
    return { id: name(side), kind, host, side, index, a: { x: p.x + n.x * k, y: p.y + n.y * k }, b: { x: q.x + n.x * k, y: q.y + n.y * k }, dir, out, lane: out, length, from }
  })
}

/** A street segment's two sides, walking a → b (nothing when a node is missing). */
export function segmentSides(streets: Streets | undefined, seg: Pick<StreetSegment, 'id' | 'a' | 'b' | 'left' | 'right'>): GateSide[] {
  const a = streets?.nodes.find((n) => n.id === seg.a)
  const b = streets?.nodes.find((n) => n.id === seg.b)
  return a && b ? sidesOfLine(a, b, seg.left, seg.right, 'street', seg.id, 0, 0, (side) => `${seg.id}:${side}`) : []
}

/** An existing street's two sides on each stretch, `from` the metres along its whole line. */
export function roadSides(road: Pick<ExistingRoad, 'id' | 'points' | 'stretches'>): GateSide[] {
  const out: GateSide[] = []
  let from = 0
  road.stretches.forEach((s, k) => {
    const p = road.points[k]
    const q = road.points[k + 1]
    if (!p || !q) return
    out.push(...sidesOfLine(p, q, s.left, s.right, 'existing-road', road.id, k, from, (side) => `${k}:${side}`))
    from += dist(p, q)
  })
  return out
}

/** The boundary's sides, counter-clockwise, `boundary:<i>` from corner i; the outline's outside is `out`. */
export function boundarySides(boundary: Polygon | null | undefined): GateSide[] {
  if (!boundary || boundary.length < 3) return []
  const n = boundary.length
  const ts = vertexTs(boundary)
  const s = signedArea(boundary) >= 0 ? 1 : -1
  return boundary.flatMap((a, i): GateSide[] => {
    const b = boundary[(i + 1) % n]
    const length = dist(a, b)
    if (length < 1e-9) return []
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    const lane = { x: -dir.y * s, y: dir.x * s }
    return [{ id: `boundary:${i}`, kind: 'boundary', host: '', index: i, a, b, dir, out: { x: -lane.x, y: -lane.y }, lane, length, from: 0, ts: [ts[i], i === n - 1 ? 1 : ts[i + 1]] }]
  })
}

/** Where along a side (m from its `a`) a point of the side's host is, kept on the side. */
export const alongOf = (side: GateSide, metres: number): number => Math.min(side.length, Math.max(0, metres))

/** The point `along` m from the side's `a`. */
export const pointOn = (side: GateSide, along: number): Point => ({ x: side.a.x + side.dir.x * along, y: side.a.y + side.dir.y * along })

/** The gate's `on` for a place `along` m on a street or existing-street side. */
export const onOf = (side: GateSide, along: number): GateOn => ({ kind: side.kind as GateOn['kind'], id: side.host, side: side.side!, at: Math.round((side.from + along) * 1e6) / 1e6 })

/** The t of the place `along` m on a boundary side. */
export function tOf(side: GateSide, along: number): number {
  const [t0, t1] = side.ts!
  const t = t0 + ((t1 - t0) * along) / side.length
  return t >= 1 ? 0 : t
}

/** The side a gate stands on among `sides` (the ones of its own host or all of them) and how far along it (m from the side's `a`, kept on it); null when none is. */
export function sideOfGate(g: Pick<Gate, 't' | 'on'>, sides: GateSide[]): { side: GateSide; along: number } | null {
  if (g.on) {
    const here = sides.filter((s) => s.kind === g.on!.kind && s.host === g.on!.id && s.side === g.on!.side)
    if (!here.length) return null
    // an existing street: the stretch its place along the whole line falls in (the last takes what is past its end)
    const side = here.find((s) => g.on!.at <= s.from + s.length + 1e-9) ?? here[here.length - 1]
    return { side, along: alongOf(side, g.on.at - side.from) }
  }
  if (g.t === undefined) return null
  const t = g.t >= 1 ? 0 : g.t
  const bs = sides.filter((s) => s.kind === 'boundary')
  const side = bs.find((s) => t >= s.ts![0] - 1e-12 && t < s.ts![1] - 1e-12) ?? bs[bs.length - 1]
  if (!side) return null
  const [t0, t1] = side.ts!
  return { side, along: alongOf(side, ((t - t0) / (t1 - t0)) * side.length) }
}

/** The side of `sides` nearest to `q`, its place kept in `clamp` (m along the side; default all of it): the place, how far that is from q; null when there are none. */
export function nearestSide(q: Point, sides: GateSide[], clamp: (side: GateSide) => [number, number] = (s) => [0, s.length]): { side: GateSide; along: number; distance: number } | null {
  let best: { side: GateSide; along: number; distance: number } | null = null
  for (const side of sides) {
    const [lo, hi] = clamp(side)
    const raw = (q.x - side.a.x) * side.dir.x + (q.y - side.a.y) * side.dir.y
    const along = Math.min(hi, Math.max(lo, raw))
    const distance = dist(q, pointOn(side, along))
    if (!best || distance < best.distance - 1e-12) best = { side, along, distance }
  }
  return best
}

/** Where a gate of this width may stand on a side: its middle from half its width in to half its width before the end; a side shorter than the gate keeps it in the middle. */
export const gateRange = (side: Pick<GateSide, 'length'>, width: number): [number, number] => (side.length >= width ? [width / 2, side.length - width / 2] : [side.length / 2, side.length / 2])
