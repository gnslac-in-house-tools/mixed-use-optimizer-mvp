// A ring's inside corners rounded as true arcs near given points (Phase DI.2: a paving's curb returns where streets
// meet). The region lies on the ring's left (an outer ring counter-clockwise, a hole clockwise, as booleans give them),
// so an inside corner is a right turn. Each is replaced by its two tangent points and the arc between them, carried as
// a bulge (DXF's sign: counter-clockwise positive), so CAD gets an arc, not chords. Only corners within a fillet's
// reach change: two streets side by side, far from any junction, are never touched, let alone bridged. A return is
// cut short of whatever stands in its corner (blockers: the stalls, lots and buildings by the paving), never drawn
// across it.
import type { Point, Polygon } from '../../model/schema.ts'
import type { Region } from './boolean.ts'
import { bounds, boundsTouch, cross, lineCrossing, pointInPolygon, type Bounds } from './polygon.ts'

/** Where corners are rounded: those within `reach` m of `at`, with `radius` m. */
export interface Fillet {
  at: Point
  radius: number
  reach: number
}

/** rad: a right turn gentler than this is no corner (a curve's vertex, a booleans' kink). */
const MIN_TURN = (5 * Math.PI) / 180

/** Two points closer than this (m) are one: two corners that each took half of the edge between them. */
const SAME = 1e-9

/** m: a return whose tangent length a blocker cuts below this is none (CAD would draw a dot). */
const MIN_RETURN = 0.01

/** m: a blocker's point this close outside a corner's wedge still counts (a stall drawn on the curb line). */
const ON = 1e-9

/** The fillet within reach of v, the nearest when several are; null when none is. */
function nearest(v: Point, fillets: Fillet[]): Fillet | null {
  let best: Fillet | null = null
  let bestD = Infinity
  for (const f of fillets) {
    const d = Math.hypot(v.x - f.at.x, v.y - f.at.y)
    if (d <= f.reach && d < bestD) {
      best = f
      bestD = d
    }
  }
  return best
}

/** A blocker with its box, for the cheap test first. */
type Blocker = { rings: Polygon[]; box: Bounds }

/**
 * The longest tangent length, up to `d`, whose corner (the triangle v + e1·d, v, v + e2·d: the arc lies inside it)
 * no blocker reaches. A point v + α·e1 + β·e2 of the wedge enters that triangle once d reaches α + β, so the answer is
 * the least α + β over the blockers in the wedge: their corners in it, and where their edges cross its two sides
 * (where else a polygon can come nearest); 0 when v is inside one (rings read even-odd: a mass's court is no mass).
 */
function clearance(v: Point, e1: Point, e2: Point, d: number, blockers: Blocker[]): number {
  const det = cross(e1, e2)
  if (det <= 1e-12) return d
  const reach = bounds([v, { x: v.x + e1.x * d, y: v.y + e1.y * d }, { x: v.x + e2.x * d, y: v.y + e2.y * d }])
  let best = d
  for (const b of blockers) {
    if (!boundsTouch(b.box, reach)) continue
    if (b.rings.filter((r) => pointInPolygon(v, r)).length % 2 === 1) return 0
    for (const r of b.rings)
      for (let i = 0; i < r.length; i++) {
        const q = r[i]
        const w = { x: q.x - v.x, y: q.y - v.y }
        const alpha = cross(w, e2) / det
        const beta = cross(e1, w) / det
        if (alpha >= -ON && beta >= -ON) best = Math.min(best, Math.max(0, alpha + beta))
        const next = r[(i + 1) % r.length]
        for (const e of [e1, e2]) {
          const x = lineCrossing(v, { x: v.x + e.x, y: v.y + e.y }, q, next)
          if (x && x.t >= -ON && x.u >= -ON && x.u <= 1 + ON) best = Math.min(best, Math.max(0, x.t))
        }
      }
    if (best <= 0) return 0
  }
  return best
}

/**
 * The ring's points and bulges (`bulges[i]` for the edge points[i] → points[i+1]) with each inside corner within a
 * fillet's reach rounded: its turn φ, the tangent length radius · tan(φ/2) cut to half the shorter of its two edges (so
 * two rounded corners never overlap) and to what the blockers leave clear (each [outer, ...holes]), the radius
 * following; the arc from the first tangent point clockwise, −tan(φ/4), tangent to both edges whatever its length.
 */
export function filletRing(ring: Polygon, fillets: Fillet[], blockers: Region[] = []): { points: Point[]; bulges: number[] } {
  const n = ring.length
  const points: Point[] = []
  const bulges: number[] = []
  const boxed = blockers.filter((b) => b.some((r) => r.length >= 3)).map((rings) => ({ rings, box: bounds(rings.flat()) }))
  for (let i = 0; i < n; i++) {
    const v = ring[i]
    const f = nearest(v, fillets)
    const a = ring[(i - 1 + n) % n]
    const b = ring[(i + 1) % n]
    const lin = Math.hypot(v.x - a.x, v.y - a.y)
    const lout = Math.hypot(b.x - v.x, b.y - v.y)
    if (f && lin > 0 && lout > 0) {
      const uin = { x: (v.x - a.x) / lin, y: (v.y - a.y) / lin }
      const uout = { x: (b.x - v.x) / lout, y: (b.y - v.y) / lout }
      // a right turn is negative: φ, how far it turns, is its opposite
      const phi = -Math.atan2(cross(uin, uout), uin.x * uout.x + uin.y * uout.y)
      const fits = phi >= MIN_TURN ? Math.min(f.radius * Math.tan(phi / 2), Math.min(lin, lout) / 2) : 0
      const d = fits > 0 ? clearance(v, { x: -uin.x, y: -uin.y }, uout, fits, boxed) : 0
      if (d >= MIN_RETURN) {
        points.push({ x: v.x - uin.x * d, y: v.y - uin.y * d }, { x: v.x + uout.x * d, y: v.y + uout.y * d })
        bulges.push(-Math.tan(phi / 4), 0)
        continue
      }
    }
    points.push(v)
    bulges.push(0)
  }
  // a point on the next one leaves an edge of no length: it goes, the next keeps its own edge
  const m = points.length
  const keep = points.map((q, i) => {
    const r = points[(i + 1) % m]
    return Math.hypot(r.x - q.x, r.y - q.y) > SAME
  })
  if (keep.every(Boolean)) return { points, bulges }
  return { points: points.filter((_, i) => keep[i]), bulges: bulges.filter((_, i) => keep[i]) }
}
