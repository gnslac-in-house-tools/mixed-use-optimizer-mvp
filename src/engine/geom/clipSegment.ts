// A segment clipped to a region (Phase DI.1: a block's module lines cut to inside its walls), pure. The region is its
// rings read even-odd, so outer rings and holes may come in any order and orientation, as booleans give them.
import type { Point, Polygon } from '../../model/schema.ts'
import { cross, distancePointSegment, lineCrossing, pointInPolygon } from './polygon.ts'

/** m: a piece shorter than this is no piece. */
const SHORT = 1e-9
/** m: a point this close to a ring's edge is on it. */
const ON = 1e-7

/**
 * The pieces of a → b inside the region the rings make, in order from `a`. A piece along a ring's edge is on the
 * region, not in it, and is left out (a module line on a wall's inner face would draw that face twice).
 */
export function clipSegment(a: Point, b: Point, rings: Polygon[]): [Point, Point][] {
  const ab = { x: b.x - a.x, y: b.y - a.y }
  const l2 = ab.x * ab.x + ab.y * ab.y
  if (l2 <= SHORT * SHORT) return []
  // where a → b meets each edge, as its parameter: crossings, and the ends of an edge that lies along it
  const ts = [0, 1]
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const c = r[i]
      const d = r[(i + 1) % r.length]
      const x = lineCrossing(a, b, c, d)
      if (!x) {
        const ca = { x: c.x - a.x, y: c.y - a.y }
        if (Math.abs(cross(ca, ab)) <= ON * Math.sqrt(l2)) for (const q of [c, d]) ts.push(((q.x - a.x) * ab.x + (q.y - a.y) * ab.y) / l2)
        continue
      }
      if (x.u >= -1e-12 && x.u <= 1 + 1e-12) ts.push(x.t)
    }
  const at = (t: number): Point => (t === 0 ? a : t === 1 ? b : { x: a.x + t * ab.x, y: a.y + t * ab.y })
  const onEdge = (q: Point) => rings.some((r) => r.some((c, i) => distancePointSegment(q, c, r[(i + 1) % r.length]) <= ON))
  const inside = (q: Point) => rings.filter((r) => pointInPolygon(q, r)).length % 2 === 1
  const sorted = [...new Set(ts.filter((t) => t >= 0 && t <= 1))].sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let k = 1; k < sorted.length; k++) {
    const [t0, t1] = [sorted[k - 1], sorted[k]]
    if ((t1 - t0) * Math.sqrt(l2) < SHORT) continue
    const mid = at((t0 + t1) / 2)
    if (onEdge(mid) || !inside(mid)) continue
    // a split where it only touched a corner joins again
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - t0) * Math.sqrt(l2) < SHORT) last[1] = t1
    else out.push([t0, t1])
  }
  return out.map(([t0, t1]) => [at(t0), at(t1)])
}
