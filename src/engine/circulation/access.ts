// The site's access, measured (Decision "Exterior circulation", 4.2): each gate's opening, the lane that takes it inside
// (as long as its queue, at least one road width; port of Plaza-Practiko `filaDeAcceso`), its guard house and the ends of
// its arrow. Pure: the plan draws it, the checks and the road network read it.
import type { Gate, Point, Polygon } from '../../model/schema.ts'
import { directionAt } from '../geom/perimeter.ts'
import { signedArea } from '../geom/polygon.ts'
import type { DerivedGate } from '../types.ts'
import { gatePlace, type GateHosts } from './gates.ts'

/** A guard house beside a gate's lane (Practiko's `CASETA`): 2 × 3 m, 0.3 m from the lane, 1 m in from the boundary. */
const GUARD_HOUSE = { width: 2, depth: 3, gap: 0.3, back: 1 }
/** m: a lane is at least this long, a queue or not. */
export const MIN_LANE = 6

/** +1 when the outline runs counter-clockwise (its inside on the left of each edge), −1 otherwise. */
export const turning = (poly: Polygon): number => (signedArea(poly) >= 0 ? 1 : -1)

/** The normal into the outline at t. */
export function inwardAt(poly: Polygon, t: number): Point {
  const u = directionAt(poly, t)
  const s = turning(poly)
  return { x: -u.y * s, y: u.x * s }
}

/**
 * Each gate: its opening on its host (the boundary at `t`, or a side of a street or an existing street, `on`), its lane away from it, its guard house and
 * its arrow. A gate whose host is not there (a street edited away, no boundary) is left out.
 */
export function deriveGates(boundary: Polygon | null, gates: Gate[], hosts: GateHosts, roadWidth: number): DerivedGate[] {
  return gates.flatMap((g): DerivedGate[] => {
    const place = gatePlace(g, boundary, hosts)
    if (!place) return []
    const { at, dir, inward } = place
    const h = g.width / 2
    const a = { x: at.x - dir.x * h, y: at.y - dir.y * h }
    const b = { x: at.x + dir.x * h, y: at.y + dir.y * h }
    const depth = Math.max(MIN_LANE, roadWidth, g.queue ?? 0)
    const inside = (q: Point, d: number) => ({ x: q.x + inward.x * d, y: q.y + inward.y * d })
    const lane: Polygon = [a, b, inside(b, depth), inside(a, depth)]
    // the guard house: beside the lane, past its `b` end
    const q = (s: number, r: number) => ({ x: b.x + dir.x * s + inward.x * r, y: b.y + dir.y * s + inward.y * r })
    const { width, depth: dh, gap, back } = GUARD_HOUSE
    const guardHouse: Polygon | null = g.guardHouse ? [q(gap, back), q(gap + width, back), q(gap + width, back + dh), q(gap, back + dh)] : null
    // the arrow runs from the street (outside) to the end of the lane
    const from = inside(at, -Math.min(6, depth / 2))
    const to = inside(at, depth)
    return [{
      id: g.id,
      ...(g.t !== undefined ? { t: g.t } : {}),
      ...(g.on ? { on: g.on } : {}),
      at,
      dir,
      inward,
      a,
      b,
      lane,
      guardHouse,
      arrow: { from, to },
      end: to,
      width: g.width,
      flow: g.flow,
      vehicles: g.vehicles,
    }]
  })
}

/**
 * t kept inside the stretch from `from` to `to`, `margin` (a fraction of the perimeter) from its ends: a gate slides
 * along its boundary side and stops at its corners (Decision "Exterior circulation"). Outside it, t goes to the nearer end; a
 * stretch shorter than two margins keeps its middle.
 */
export function clampToStretch(t: number, from: number, to: number, margin = 0): number {
  const span = from <= to ? to - from : 1 - from + to
  const wrap = (x: number) => ((x % 1) + 1) % 1
  if (span <= 2 * margin) return wrap(from + span / 2)
  let rel = wrap(t - from)
  if (rel > span) rel = rel - span < 1 - rel ? span : 0
  return wrap(from + Math.min(span - margin, Math.max(margin, rel)))
}
