// Contours: counter-clockwise vertices with a corner radius and optional arc edges.
// Ported from Plaza-Practiko `app/src/motores/geom/contorno.ts` (its tests came along in __tests__/contour.test.ts).
// `desdeTramos` (chained lines and arcs → contour) came back with the DXF import (Phase 5.2) as `contourFromSpans`.
//
// Bulge convention (contour.arcs[i], edge i = vertices[i] → vertices[i+1]):
//   bulge = tan(θ/4), θ = central angle of the arc (0 < |θ| < 2π).
//   bulge > 0: the arc bulges to the LEFT of the directed edge a → b. On a counter-clockwise contour the left
//              is the inside: it bulges inwards.
//   bulge < 0: bulges to the RIGHT of a → b: outwards on a counter-clockwise contour.
//   Example: unit square, counter-clockwise, bulge −1 on edge (0,0)→(1,0): a half circle downwards, area 1 + π/8.
//
// Corner radius: only applies between two straight edges; next to an arc edge it is ignored.
// Corner chamfer (Phase D.1): `vertex.chamfer = [a, b]`, the cut runs from a m back along the incoming wall to b m along the
// outgoing wall; the vertex stays where the two walls meet. Straight edges only, like the radius, and a corner has one or the
// other (the radius, if both are in the data). Set-backs and radii share each wall's length (`effectiveSetbacks`).
import type { Contour, Point, Polygon, Vertex } from '../../model/schema.ts'
import { EPS, signedArea } from './polygon.ts'

const POINT_TOL = 1e-6
const MAX_SEGMENTS = 1024

const next = (i: number, n: number) => (i + 1) % n
const prev = (i: number, n: number) => (i - 1 + n) % n
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

function unit(a: Point, b: Point): Point {
  const l = dist(a, b)
  return l <= EPS ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

function rotateVector(u: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: u.x * c - u.y * s, y: u.x * s + u.y * c }
}

/** Bulge of edge i (0 if straight). */
export function bulgeAt(c: Contour, i: number): number {
  const b = c.arcs?.[i]
  return b !== undefined && Number.isFinite(b) && Math.abs(b) > EPS ? b : 0
}

/** Bulges of every edge, in order. */
export function bulges(c: Contour): number[] {
  return c.vertices.map((_, i) => bulgeAt(c, i))
}

/** Builds a contour from vertices and per-edge bulges; omits `arcs` when every edge is straight. */
export function withBulges(vertices: Vertex[], bs: number[]): Contour {
  const arcs: Record<string, number> = {}
  let any = false
  bs.forEach((b, i) => {
    if (i < vertices.length && Math.abs(b) > EPS) {
      arcs[i] = b
      any = true
    }
  })
  return any ? { vertices, arcs } : { vertices }
}

/** Centre, radius and sweep (counter-clockwise positive, around the centre) of the arc from a to b. */
export function arcOfEdge(a: Point, b: Point, bulge: number): { center: Point; radius: number; sweep: number } {
  const l = dist(a, b)
  const nx = -(b.y - a.y) / l // left normal
  const ny = (b.x - a.x) / l
  const s = (bulge * l) / 2 // signed sagitta (positive to the left)
  const radius = (l * (1 + bulge * bulge)) / (4 * Math.abs(bulge))
  const mx = (a.x + b.x) / 2 + nx * s
  const my = (a.y + b.y) / 2 + ny * s
  const k = Math.sign(bulge) * radius
  return { center: { x: mx - nx * k, y: my - ny * k }, radius, sweep: -4 * Math.atan(bulge) }
}

/**
 * The bounding box of a contour's vertices and its arc edges (Phase D.3: a block's box holds an outward arc): an arc's farthest points on each
 * axis, not its chord. Corner radii and chamfers cut inside the vertices' hull, so they never widen it.
 */
export function arcBox(c: Contour): { x0: number; y0: number; x1: number; y1: number } {
  const v = c.vertices
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const take = (p: Point) => {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  v.forEach(take)
  const n = v.length
  const TAU = 2 * Math.PI
  for (let i = 0; i < n; i++) {
    const b = bulgeAt(c, i)
    const a = v[i]
    const e = v[next(i, n)]
    if (b === 0 || dist(a, e) <= EPS) continue
    const { center, radius, sweep } = arcOfEdge(a, e, b)
    const start = Math.atan2(a.y - center.y, a.x - center.x)
    // the arc runs from `start` by `sweep` (counter-clockwise positive): each quarter turn it passes is a point farthest along an axis
    for (let k = 0; k < 4; k++) {
      const turn = (k * Math.PI) / 2
      const delta = sweep >= 0 ? (((turn - start) % TAU) + TAU) % TAU : (((start - turn) % TAU) + TAU) % TAU
      if (delta <= Math.abs(sweep)) take({ x: center.x + radius * Math.cos(turn), y: center.y + radius * Math.sin(turn) })
    }
  }
  return { x0, y0, x1, y1 }
}

/** Unit tangent leaving vertex i along edge i. */
function outgoingDirection(c: Contour, i: number): Point {
  const n = c.vertices.length
  const u = unit(c.vertices[i], c.vertices[next(i, n)])
  return rotateVector(u, 2 * Math.atan(bulgeAt(c, i)))
}

/** Unit tangent arriving at vertex i along edge i − 1. */
function incomingDirection(c: Contour, i: number): Point {
  const n = c.vertices.length
  const j = prev(i, n)
  const u = unit(c.vertices[j], c.vertices[i])
  return rotateVector(u, -2 * Math.atan(bulgeAt(c, j)))
}

/** Signed exterior angle at corner i (rad): positive when the contour turns left (convex corner). */
export function turnAt(c: Contour, i: number): number {
  const a = incomingDirection(c, i)
  const b = outgoingDirection(c, i)
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)
}

function isStraightCorner(c: Contour, i: number): boolean {
  const n = c.vertices.length
  return bulgeAt(c, prev(i, n)) === 0 && bulgeAt(c, i) === 0
}

/** Distance from vertex i to each tangent point of its corner arc: r·tan(|φ|/2), φ = exterior angle. */
export function tangentLength(c: Contour, i: number): number {
  const r = c.vertices[i].r
  if (!(r > 0) || !isStraightCorner(c, i)) return 0
  return r * Math.tan(Math.abs(turnAt(c, i)) / 2)
}

/** Does corner i have a radius that is drawn? (a straight corner with r > 0) */
const isRounded = (c: Contour, i: number) => c.vertices[i].r > 0 && isStraightCorner(c, i)

/** The chamfer of corner i as it is drawn, [a, b] in m; null when it has none, has a radius, or stands next to an arc edge. */
export function chamferOf(c: Contour, i: number): [number, number] | null {
  const k = c.vertices[i].chamfer
  if (!k || !(k[0] > 0 || k[1] > 0) || c.vertices[i].r > 0 || !isStraightCorner(c, i)) return null
  return [k[0], k[1]]
}

/** What corner i takes of its incoming and its outgoing wall, as asked (m): a radius the same along both, a chamfer its [a, b]. */
export function setbacks(c: Contour, i: number): [number, number] {
  if (isRounded(c, i)) {
    const t = tangentLength(c, i)
    return [t, t]
  }
  return chamferOf(c, i) ?? [0, 0]
}

/** How much of each wall is free for corner i's radius or chamfer next to its neighbours' (m along the incoming, along the outgoing). */
export function freeAlong(c: Contour, i: number): [number, number] {
  const v = c.vertices
  const n = v.length
  if (!isStraightCorner(c, i)) return [0, 0]
  return [Math.max(0, dist(v[prev(i, n)], v[i]) - setbacks(c, prev(i, n))[1]), Math.max(0, dist(v[i], v[next(i, n)]) - setbacks(c, next(i, n))[0])]
}

/** A rounded corner: its tangent points (on the incoming and outgoing edge), the middle of its arc and its centre. */
export interface CornerArc {
  t1: Point
  t2: Point
  mid: Point
  center: Point
  r: number
}

/** The arc of rounded corner i, or null when the corner is sharp. Port of Plaza's `esquinaRedondeada`. */
export function cornerArc(c: Contour, i: number): CornerArc | null {
  const t = tangentLength(c, i)
  if (!(t > 0)) return null
  const v = c.vertices
  const n = v.length
  const p = v[i]
  const r = p.r
  const uIn = unit(v[prev(i, n)], p)
  const uOut = unit(p, v[next(i, n)])
  const s = turnAt(c, i) >= 0 ? 1 : -1
  const t1 = { x: p.x - uIn.x * t, y: p.y - uIn.y * t }
  const t2 = { x: p.x + uOut.x * t, y: p.y + uOut.y * t }
  // the centre sits on the side the contour turns towards
  const center = { x: t1.x - uIn.y * r * s, y: t1.y + uIn.x * r * s }
  const toward = unit(center, p)
  return { t1, t2, mid: { x: center.x + toward.x * r, y: center.y + toward.y * r }, center, r }
}

/** The largest radius that fits at corner i, given the neighbours' current radii. */
export function maxRadius(c: Contour, i: number): number {
  const v = c.vertices
  const n = v.length
  if (!isStraightCorner(c, i)) return 0
  const k = Math.tan(Math.abs(turnAt(c, i)) / 2)
  if (k <= EPS) return Infinity
  const freeBefore = dist(v[prev(i, n)], v[i]) - setbacks(c, prev(i, n))[1]
  const freeAfter = dist(v[i], v[next(i, n)]) - setbacks(c, next(i, n))[0]
  return Math.max(0, Math.min(freeBefore, freeAfter) / k)
}

/**
 * What each corner takes of its incoming (`inn`) and outgoing (`out`) wall, scaled down proportionally where two neighbouring
 * corners would overlap on a wall (a radius, a chamfer's end). A radius takes the same along both of its walls (the smaller).
 */
export function effectiveSetbacks(c: Contour): { inn: number[]; out: number[] } {
  const v = c.vertices
  const n = v.length
  const raw = v.map((_, i) => setbacks(c, i))
  const inn = raw.map((r) => r[0])
  const out = raw.map((r) => r[1])
  for (let s = 0; s < n; s++) {
    const q = next(s, n)
    const l = dist(v[s], v[q])
    const sum = raw[s][1] + raw[q][0]
    if (sum > l) {
      const f = l / sum
      out[s] = Math.min(out[s], raw[s][1] * f)
      inn[q] = Math.min(inn[q], raw[q][0] * f)
    }
  }
  for (let i = 0; i < n; i++) if (isRounded(c, i)) inn[i] = out[i] = Math.min(inn[i], out[i])
  return { inn, out }
}

/** The two ends of corner i's chamfer, on its incoming and outgoing wall, as drawn (set-backs fitted); null when it has none. */
export function cornerCut(c: Contour, i: number): { p1: Point; p2: Point } | null {
  if (!chamferOf(c, i)) return null
  const v = c.vertices
  const n = v.length
  const { inn, out } = effectiveSetbacks(c)
  const p = v[i]
  const uIn = unit(v[prev(i, n)], p)
  const uOut = unit(p, v[next(i, n)])
  return { p1: { x: p.x - uIn.x * inn[i], y: p.y - uIn.y * inn[i] }, p2: { x: p.x + uOut.x * out[i], y: p.y + uOut.y * out[i] } }
}

/**
 * Interior points of an arc (end points excluded). The end points stay exact; interior points sit on a radius
 * R' ≥ R that makes the fan's area equal the sector's, without moving further than the sagitta tolerance.
 */
function arcPoints(center: Point, radius: number, a0: number, sweep: number, sagitta: number): Point[] {
  const f = Math.max(sagitta, 1e-6)
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - f / radius)))
  const m = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.abs(sweep) / step - 1e-9)))
  if (m <= 1) return []
  const d = sweep / m
  const q = (m * Math.abs(d)) / Math.sin(Math.abs(d))
  const rArea = m === 2 ? (radius * q) / 2 : (radius * (-1 + Math.sqrt(1 + (m - 2) * q))) / (m - 2)
  const rp = Math.min(rArea, radius + f)
  const out: Point[] = []
  for (let k = 1; k < m; k++) {
    const ang = a0 + k * d
    out.push({ x: center.x + rp * Math.cos(ang), y: center.y + rp * Math.sin(ang) })
  }
  return out
}

/** What a polygon point's segment belongs to: the segment that ends at it runs along edge `edge`, or is the cut or the arc of corner `corner`. */
export type PolygonTag = { edge: number } | { corner: number }

/**
 * Polygon in the order the vertices come (no re-orientation). `tags`, when given, is filled in step with the points: for each
 * point, what the segment that ends at it belongs to (a point's segment from the one before; the first's, the closing one).
 */
export function rawPolygon(c: Contour, sagitta = 0.02, tags?: PolygonTag[]): Polygon {
  const v = c.vertices
  const n = v.length
  if (n < 3) return v.map((p) => ({ x: p.x, y: p.y }))
  const { inn: t, out: leave } = effectiveSetbacks(c)
  const out: Point[] = []
  const put = (p: Point, tag: PolygonTag) => {
    const last = out[out.length - 1]
    if (!last || dist(last, p) > EPS) {
      out.push({ x: p.x, y: p.y })
      tags?.push(tag)
    }
  }
  for (let i = 0; i < n; i++) {
    const vi = v[i]
    const before: PolygonTag = { edge: prev(i, n) }
    const here: PolygonTag = { corner: i }
    if (chamferOf(c, i)) {
      // Chamfered corner: the vertex is replaced by the two ends of its cut.
      const uIn = unit(v[prev(i, n)], vi)
      const uOut = unit(vi, v[next(i, n)])
      put({ x: vi.x - uIn.x * t[i], y: vi.y - uIn.y * t[i] }, before)
      put({ x: vi.x + uOut.x * leave[i], y: vi.y + uOut.y * leave[i] }, here)
    } else if (t[i] > EPS) {
      // Rounded corner: replace the vertex with an arc between its two tangent points.
      const uIn = unit(v[prev(i, n)], vi)
      const uOut = unit(vi, v[next(i, n)])
      const g = turnAt(c, i)
      const r = t[i] / Math.tan(Math.abs(g) / 2)
      const t1 = { x: vi.x - uIn.x * t[i], y: vi.y - uIn.y * t[i] }
      const t2 = { x: vi.x + uOut.x * t[i], y: vi.y + uOut.y * t[i] }
      const sg = Math.sign(g)
      const center = { x: t1.x - uIn.y * r * sg, y: t1.y + uIn.x * r * sg }
      put(t1, before)
      for (const p of arcPoints(center, r, Math.atan2(t1.y - center.y, t1.x - center.x), g, sagitta)) put(p, here)
      put(t2, here)
    } else put(vi, before)
    // Arc edge: insert the chord points between vi and the next vertex.
    const b = bulgeAt(c, i)
    const vj = v[next(i, n)]
    if (b !== 0 && dist(vi, vj) > EPS) {
      const { center, radius, sweep } = arcOfEdge(vi, vj, b)
      for (const p of arcPoints(center, radius, Math.atan2(vi.y - center.y, vi.x - center.x), sweep, sagitta))
        put(p, { edge: i })
    }
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= EPS) {
    out.pop()
    tags?.pop()
  }
  return out
}

/** Counter-clockwise polygon; corner arcs and arc edges become chords no further than `sagitta` m from the curve. */
export function contourToPolygon(c: Contour, sagitta = 0.02): Polygon {
  const p = rawPolygon(c, sagitta)
  return signedArea(p) < 0 ? p.reverse() : p
}

/** Counter-clockwise and without repeated vertices. When reversing, each bulge flips sign (same physical arc) and each chamfer's ends swap. */
export function normalize(c: Contour): Contour {
  const bs = bulges(c)
  const V: Vertex[] = []
  const B: number[] = []
  c.vertices.forEach((v, i) => {
    if (V.length > 0 && dist(V[V.length - 1], v) <= POINT_TOL) {
      B[B.length - 1] = bs[i] // a zero-length edge disappears
      return
    }
    V.push({ ...v })
    B.push(bs[i])
  })
  while (V.length > 1 && dist(V[V.length - 1], V[0]) <= POINT_TOL) {
    V.pop()
    B.pop()
  }
  const n = V.length
  if (n >= 3 && signedArea(rawPolygon(withBulges(V, B))) < 0) {
    const W = V.slice()
      .reverse()
      .map((w) => (w.chamfer ? { ...w, chamfer: [w.chamfer[1], w.chamfer[0]] as [number, number] } : w))
    const C = W.map((_, k) => -B[(((n - 2 - k) % n) + n) % n])
    return withBulges(W, C)
  }
  return withBulges(V, B)
}

/** A contour from a plain polygon, every corner sharp. */
export function contourFromPolygon(p: Polygon): Contour {
  return normalize({ vertices: p.map((q) => ({ x: q.x, y: q.y, r: 0 })) })
}

// ---- From chained spans (port of Practiko's `desdeTramos`; Phase 5.2, the DXF import) -------------------------

const TANGENT_TOL = Math.PI / 180 // 1°

/** A line or an arc of a drawing, chained end to end (a DXF's lines, arcs and polylines; a Rhino polycurve). */
export type Span =
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'arc'; a: Point; b: Point; center: Point; radius: number; ccw: boolean }

function reverseSpan(t: Span): Span {
  return t.kind === 'line' ? { ...t, a: t.b, b: t.a } : { ...t, a: t.b, b: t.a, ccw: !t.ccw }
}

function arcTangent(t: Extract<Span, { kind: 'arc' }>, p: Point): Point {
  const r = unit(t.center, p)
  return t.ccw ? { x: -r.y, y: r.x } : { x: r.y, y: -r.x }
}

function angleBetween(a: Point, b: Point): number {
  return Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y))
}

function lineIntersection(p: Point, u: Point, q: Point, w: Point): Point | null {
  const den = u.x * w.y - u.y * w.x
  if (Math.abs(den) <= EPS) return null
  const s = ((q.x - p.x) * w.y - (q.y - p.y) * w.x) / den
  return { x: p.x + u.x * s, y: p.y + u.y * s }
}

/**
 * A contour from chained spans.
 * - An arc tangent (±1°) to its two neighbouring lines becomes a corner where those lines meet, with r = its radius.
 * - Any other arc becomes an arc edge (bulge) between its ends.
 * - Consecutive collinear lines (±1°) are joined.
 * - Whatever is approximated adds a warning. The result is counter-clockwise.
 */
export function contourFromSpans(t: Span[]): { contour: Contour; warnings: string[] } {
  const warnings: string[] = []
  const list = t.filter((x) => dist(x.a, x.b) > POINT_TOL)
  if (list.length >= 2) {
    const [p, q] = list
    if (Math.min(dist(p.b, q.a), dist(p.b, q.b)) > Math.min(dist(p.a, q.a), dist(p.a, q.b))) list[0] = reverseSpan(p)
  }
  for (let k = 1; k < list.length; k++) {
    const end = list[k - 1].b
    if (dist(end, list[k].b) < dist(end, list[k].a)) list[k] = reverseSpan(list[k])
  }
  const m = list.length
  for (let k = 0; k < m; k++) {
    const gap = dist(list[k].b, list[(k + 1) % m].a)
    if (gap > 1e-3) warnings.push(`the spans do not close: a gap of ${gap.toFixed(3)} m`)
  }

  // fillets: arcs tangent to two lines
  const fillet: (Point | null)[] = list.map((x, k) => {
    if (x.kind !== 'arc' || m < 3) return null
    const before = list[(k - 1 + m) % m]
    const after = list[(k + 1) % m]
    if (before.kind !== 'line' || after.kind !== 'line') return null
    const dBefore = unit(before.a, before.b)
    const dAfter = unit(after.a, after.b)
    if (angleBetween(dBefore, dAfter) <= TANGENT_TOL) return null
    const offA = angleBetween(arcTangent(x, x.a), dBefore)
    const offB = angleBetween(arcTangent(x, x.b), dAfter)
    if (offA > TANGENT_TOL || offB > TANGENT_TOL) return null
    const p = lineIntersection(before.a, dBefore, after.a, dAfter)
    if (p && Math.max(offA, offB) > 1e-6) warnings.push(`an almost tangent arc made a corner of radius ${x.radius.toFixed(2)} m`)
    return p
  })

  const V: Vertex[] = []
  const B: number[] = []
  list.forEach((x, k) => {
    if (fillet[k]) return
    const before = fillet[(k - 1 + m) % m]
    const beforeSpan = list[(k - 1 + m) % m]
    const a = before ?? x.a
    const r = before && beforeSpan.kind === 'arc' ? beforeSpan.radius : 0
    V.push({ x: a.x, y: a.y, r })
    if (x.kind === 'arc') {
      const a0 = Math.atan2(x.a.y - x.center.y, x.a.x - x.center.x)
      const a1 = Math.atan2(x.b.y - x.center.y, x.b.x - x.center.x)
      let sweep = a1 - a0
      if (x.ccw) while (sweep <= 0) sweep += 2 * Math.PI
      else while (sweep >= 0) sweep -= 2 * Math.PI
      B.push(-Math.tan(sweep / 4))
    } else B.push(0)
  })

  // join collinear lines
  let changed = true
  while (changed && V.length > 3) {
    changed = false
    for (let i = 0; i < V.length && V.length > 3; i++) {
      const n = V.length
      const h = prev(i, n)
      if (B[h] !== 0 || B[i] !== 0 || V[i].r > 0) continue
      const turn = angleBetween(unit(V[h], V[i]), unit(V[i], V[next(i, n)]))
      if (turn > TANGENT_TOL) continue
      if (turn > 1e-9) warnings.push(`almost collinear lines joined at (${V[i].x.toFixed(2)}, ${V[i].y.toFixed(2)})`)
      V.splice(i, 1)
      B.splice(i, 1)
      changed = true
      i--
    }
  }

  return { contour: normalize(withBulges(V, B)), warnings }
}
