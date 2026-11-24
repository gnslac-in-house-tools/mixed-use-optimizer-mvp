// A contour as the curves a CAD or BIM file wants (moved out of io/export3dm.ts, shared by the model's exports): straight
// lines and arcs through three points, exact, never chords. Pure.
import type { Contour, Point } from '../../model/schema.ts'
import { arcOfEdge, bulgeAt, chamferOf, contourToPolygon, effectiveSetbacks, turnAt } from './contour.ts'
import { EPS, signedArea } from './polygon.ts'

/** A line from `a` to `b`, or an arc from `a` through `m` to `b`. */
export type Segment = { a: Point; b: Point } | { a: Point; m: Point; b: Point }

export const isArc = (s: Segment): s is { a: Point; m: Point; b: Point } => 'm' in s

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const unit = (a: Point, b: Point): Point => {
  const l = dist(a, b)
  return l <= EPS ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/** Segments (lines and arcs through three points) that run the closed contour: rounded corners and arc edges as arcs. */
export function contourSegments(c: Contour): Segment[] {
  const v = c.vertices
  const n = v.length
  // what each corner takes of its walls; where two neighbouring corners overlap it is cut in proportion (as contourToPolygon does)
  const { inn: lim, out: leave } = effectiveSetbacks(c)

  const segs: Segment[] = []
  let cur = null as Point | null
  let start = null as Point | null
  const lineTo = (p: Point) => {
    if (cur && dist(cur, p) > 1e-9) segs.push({ a: cur, b: p })
    else if (!cur) start = p
    cur = p
  }
  const arcTo = (m: Point, p: Point) => {
    segs.push({ a: cur!, m, b: p })
    cur = p
  }

  for (let i = 0; i < n; i++) {
    const vi = v[i]
    if (chamferOf(c, i)) {
      // a chamfer is one line between its two ends
      const uIn = unit(v[(i - 1 + n) % n], vi)
      const uOut = unit(vi, v[(i + 1) % n])
      lineTo({ x: vi.x - uIn.x * lim[i], y: vi.y - uIn.y * lim[i] })
      lineTo({ x: vi.x + uOut.x * leave[i], y: vi.y + uOut.y * leave[i] })
    } else if (lim[i] > EPS) {
      const uIn = unit(v[(i - 1 + n) % n], vi)
      const uOut = unit(vi, v[(i + 1) % n])
      const g = turnAt(c, i)
      const r = lim[i] / Math.tan(Math.abs(g) / 2)
      const t1 = { x: vi.x - uIn.x * lim[i], y: vi.y - uIn.y * lim[i] }
      const t2 = { x: vi.x + uOut.x * lim[i], y: vi.y + uOut.y * lim[i] }
      const sg = Math.sign(g)
      const center = { x: t1.x - uIn.y * r * sg, y: t1.y + uIn.x * r * sg }
      const w = unit(center, { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 })
      lineTo(t1)
      arcTo({ x: center.x + w.x * r, y: center.y + w.y * r }, t2)
    } else lineTo({ x: vi.x, y: vi.y })
    const b = bulgeAt(c, i)
    const vj = v[(i + 1) % n]
    if (b !== 0 && dist(vi, vj) > EPS) {
      const { center, radius, sweep } = arcOfEdge(vi, vj, b)
      const a0 = Math.atan2(vi.y - center.y, vi.x - center.x)
      arcTo({ x: center.x + radius * Math.cos(a0 + sweep / 2), y: center.y + radius * Math.sin(a0 + sweep / 2) }, { x: vj.x, y: vj.y })
    }
  }
  if (start) lineTo(start)
  return segs
}

/** The same closed contour turning the other way: edge i (vertex i → i+1) becomes edge n−2−i, bulging the other way. */
export function reversed<C extends Contour>(c: C): C {
  const n = c.vertices.length
  const vertices = c.vertices.slice().reverse().map((w) => (w.chamfer ? { ...w, chamfer: [w.chamfer[1], w.chamfer[0]] as [number, number] } : w))
  const arcs: Record<number, number> = {}
  for (const [k, b] of Object.entries(c.arcs ?? {})) arcs[(n - 2 - Number(k) + n) % n] = -b
  return { ...c, vertices, arcs }
}

/** A closed contour turning counter-clockwise (an extrusion along its plane's normal goes up; a floor's outline). */
export function counterClockwise<C extends Contour>(c: C): C {
  return signedArea(contourToPolygon(c)) >= 0 ? c : reversed(c)
}

/** A closed contour turning clockwise (a hole of a floor). */
export function clockwise<C extends Contour>(c: C): C {
  return signedArea(contourToPolygon(c)) <= 0 ? c : reversed(c)
}
