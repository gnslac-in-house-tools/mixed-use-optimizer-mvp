// A contour's edges moved along their normals, each by its own distance (Phase D.2, Decision "Outline in metres"): a block's
// face from its reference line (each wall its own thickness and offset), and the line back from the face. Pure geometry.
//
// Edge i runs from corner i to corner i + 1; its normal points out (to the right of the edge on a counter-clockwise contour),
// and a distance is positive when the edge moves out. A straight edge moves along its normal; an arc edge keeps its centre and
// changes its radius (an outward bulge grows by the distance, an inward one shrinks by it). Each corner goes to where the two
// moved edges meet, closest to where it was; where they are parallel it stays on them. A corner keeps its radius and chamfer.
import type { Contour, Point, Vertex } from '../../model/schema.ts'
import { arcOfEdge, bulges, rawPolygon, withBulges } from './contour.ts'
import { EPS, isSimple, signedArea } from './polygon.ts'

/** Unit vectors whose cross product is under this are parallel. */
const PARALLEL = 1e-9
/** A circle that meets a line or a circle within this (of its radius squared) touches it: one point. */
const TANGENT = 1e-12

type Curve =
  /** The moved line: a point on it, its direction, its out normal and the distance it moved. */
  | { kind: 'line'; p: Point; u: Point; n: Point; d: number }
  /** The moved arc: the circle of the edge, its radius now. */
  | { kind: 'arc'; c: Point; r: number; sweep: number }

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const nearest = (ref: Point, a: Point, b: Point) => (dist(ref, a) <= dist(ref, b) ? a : b)

/** The edge a → b (bulge) moved by d, or null when it has no length or its arc would have no radius left. */
function moved(a: Point, b: Point, bulge: number, d: number): Curve | null {
  const l = dist(a, b)
  if (l <= EPS) return null
  if (bulge === 0) {
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    const n = { x: u.y, y: -u.x }
    return { kind: 'line', p: { x: a.x + n.x * d, y: a.y + n.y * d }, u, n, d }
  }
  const { center, radius, sweep } = arcOfEdge(a, b, bulge)
  // out is away from the centre on a counter-clockwise arc (positive sweep), towards it on a clockwise one
  const r = radius + d * Math.sign(sweep)
  return r > EPS ? { kind: 'arc', c: center, r, sweep } : null
}

/** Where a moved line and a moved circle meet, the one of the two points closest to `ref`. */
function lineCircle(l: Extract<Curve, { kind: 'line' }>, k: Extract<Curve, { kind: 'arc' }>, ref: Point): Point | null {
  const s = (k.c.x - l.p.x) * l.u.x + (k.c.y - l.p.y) * l.u.y
  const foot = { x: l.p.x + l.u.x * s, y: l.p.y + l.u.y * s }
  const disc = k.r * k.r - (foot.x - k.c.x) ** 2 - (foot.y - k.c.y) ** 2
  if (disc < -TANGENT * k.r * k.r) return null
  if (disc <= TANGENT * k.r * k.r) return foot
  const h = Math.sqrt(disc)
  return nearest(ref, { x: foot.x + l.u.x * h, y: foot.y + l.u.y * h }, { x: foot.x - l.u.x * h, y: foot.y - l.u.y * h })
}

/** Where two moved circles meet, the one of the two points closest to `ref` (one circle on the other: the point radially out from the centre). */
function circleCircle(a: Extract<Curve, { kind: 'arc' }>, b: Extract<Curve, { kind: 'arc' }>, ref: Point): Point | null {
  const dd = dist(a.c, b.c)
  const scale = Math.max(a.r, b.r) ** 2
  if (dd <= EPS) {
    if (Math.abs(a.r - b.r) > EPS) return null
    const l = dist(a.c, ref)
    return l <= EPS ? null : { x: a.c.x + ((ref.x - a.c.x) / l) * a.r, y: a.c.y + ((ref.y - a.c.y) / l) * a.r }
  }
  const along = (a.r * a.r - b.r * b.r + dd * dd) / (2 * dd)
  const h2 = a.r * a.r - along * along
  if (h2 < -TANGENT * scale) return null
  const ux = (b.c.x - a.c.x) / dd
  const uy = (b.c.y - a.c.y) / dd
  const m = { x: a.c.x + ux * along, y: a.c.y + uy * along }
  if (h2 <= TANGENT * scale) return m
  const h = Math.sqrt(h2)
  return nearest(ref, { x: m.x - uy * h, y: m.y + ux * h }, { x: m.x + uy * h, y: m.y - ux * h })
}

/** The corner where two moved edges meet; `ref` is where the corner was. */
function meeting(a: Curve, b: Curve, ref: Point): Point | null {
  if (a.kind === 'line' && b.kind === 'line') {
    const den = cross(a.u, b.u)
    if (Math.abs(den) <= PARALLEL) {
      // on both lines already (parallel and the same distance): stays on them, moved by what the two walls moved
      return { x: ref.x + (a.n.x * a.d + b.n.x * b.d) / 2, y: ref.y + (a.n.y * a.d + b.n.y * b.d) / 2 }
    }
    const s = cross({ x: b.p.x - a.p.x, y: b.p.y - a.p.y }, b.u) / den
    return { x: a.p.x + a.u.x * s, y: a.p.y + a.u.y * s }
  }
  if (a.kind === 'line' && b.kind === 'arc') return lineCircle(a, b, ref)
  if (a.kind === 'arc' && b.kind === 'line') return lineCircle(b, a, ref)
  return a.kind === 'arc' && b.kind === 'arc' ? circleCircle(a, b, ref) : null
}

/**
 * Edge i moved out by d[i] (negative: in), one distance per edge. Corners keep their radius and chamfer, arc edges keep their centre.
 * Null when it makes no simple polygon (an edge turned over, an arc without a radius, the shape crossing itself) or `d` does not
 * have one distance per edge.
 */
export function offsetEdges(c: Contour, d: readonly number[]): Contour | null {
  const v = c.vertices
  const n = v.length
  if (n < 3 || d.length !== n || d.some((x) => !Number.isFinite(x))) return null
  const bs = bulges(c)
  const curves: Curve[] = []
  for (let i = 0; i < n; i++) {
    const k = moved(v[i], v[(i + 1) % n], bs[i], d[i])
    if (!k) return null
    curves.push(k)
  }
  const vertices: Vertex[] = []
  for (let i = 0; i < n; i++) {
    const p = meeting(curves[(i + n - 1) % n], curves[i], v[i])
    if (!p) return null
    vertices.push({ ...v[i], x: p.x, y: p.y })
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % n]
    // an edge may not turn over or collapse
    if ((b.x - a.x) * (v[(i + 1) % n].x - v[i].x) + (b.y - a.y) * (v[(i + 1) % n].y - v[i].y) <= 0) return null
    const k = curves[i]
    if (k.kind === 'line') {
      out.push(0)
      continue
    }
    // the arc between its new ends, on the same circle, turning the same way as before
    let sweep = Math.atan2(b.y - k.c.y, b.x - k.c.x) - Math.atan2(a.y - k.c.y, a.x - k.c.x)
    if (k.sweep > 0) while (sweep <= 1e-12) sweep += 2 * Math.PI
    else while (sweep >= -1e-12) sweep -= 2 * Math.PI
    if (Math.abs(sweep) >= 2 * Math.PI - 1e-9) return null
    out.push(-Math.tan(sweep / 4))
  }
  const shifted = withBulges(vertices, out)
  const poly = rawPolygon(shifted)
  return signedArea(poly) > EPS && isSimple(poly) ? shifted : null
}

/** The inverse of `offsetEdges`: edge i moved in by d[i]. A contour offset by d and inset by d is the contour (within 1e-9). */
export function insetEdges(c: Contour, d: readonly number[]): Contour | null {
  return offsetEdges(
    c,
    d.map((x) => -x),
  )
}
