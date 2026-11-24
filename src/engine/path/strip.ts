// A road's paving from its centreline (Decision "Exterior circulation"), as polygons for what the booleans and the
// overlaps need (the buildable area around an existing road, the paved area, a road over a mass, the parking); the
// plan draws a stroke instead. Two ways: convex pieces (a rectangle per segment and, at each inner vertex, a bevel on
// its outer side where it turns gently, a disc, a 16-gon that never cuts less than the width, where it turns
// sharply), and outlines (a gentle stretch as one polygon): a curve of hundreds of points stays light for the booleans.
import type { Point, Polygon } from '../../model/schema.ts'
import { union, type Region } from '../geom/boolean.ts'
import { offsetLine } from './offset.ts'

const DISC_SIDES = 16
/** A bend sharper than this (radians, 60°) is closed with a disc; a gentler one with a bevel. */
const BEVEL = Math.PI / 3

/** The rectangle `w` m wide around the segment a→b (counter-clockwise); null when a and b are one point. */
export function segmentStrip(a: Point, b: Point, w: number): Polygon | null {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  if (l < 1e-9 || w <= 0) return null
  const n = { x: (-(b.y - a.y) / l) * (w / 2), y: ((b.x - a.x) / l) * (w / 2) }
  return [
    { x: a.x - n.x, y: a.y - n.y },
    { x: b.x - n.x, y: b.y - n.y },
    { x: b.x + n.x, y: b.y + n.y },
    { x: a.x + n.x, y: a.y + n.y },
  ]
}

function disc(c: Point, r: number): Polygon {
  const R = r / Math.cos(Math.PI / DISC_SIDES)
  return Array.from({ length: DISC_SIDES }, (_, k) => {
    const a = (2 * Math.PI * k) / DISC_SIDES
    return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) }
  })
}

/** What closes the bend at v, from a (before) to b (after): nothing on a straight line, a bevel or a disc. */
function joint(a: Point, v: Point, b: Point, w: number): Polygon | null {
  const u1 = { x: v.x - a.x, y: v.y - a.y }
  const u2 = { x: b.x - v.x, y: b.y - v.y }
  const l1 = Math.hypot(u1.x, u1.y)
  const l2 = Math.hypot(u2.x, u2.y)
  if (l1 < 1e-9 || l2 < 1e-9 || w <= 0) return w > 0 ? disc(v, w / 2) : null
  const cross = (u1.x * u2.y - u1.y * u2.x) / (l1 * l2)
  const turn = Math.atan2(cross, (u1.x * u2.x + u1.y * u2.y) / (l1 * l2))
  if (Math.abs(turn) < 1e-6) return null
  if (Math.abs(turn) > BEVEL) return disc(v, w / 2)
  // the outer side: right of a left turn, left of a right turn. Its corners a hair past the rectangles' and its tip
  // a little inside: no edge or corner shared exactly with them (Clipper can loop forever on those)
  const h = w / 2 + 0.005
  const s = turn > 0 ? -1 : 1
  const p = { x: v.x + (-u1.y / l1) * h * s, y: v.y + (u1.x / l1) * h * s }
  const q = { x: v.x + (-u2.y / l2) * h * s, y: v.y + (u2.x / l2) * h * s }
  const tip = { x: v.x - ((p.x + q.x) / 2 - v.x) * 0.25, y: v.y - ((p.y + q.y) / 2 - v.y) * 0.25 }
  return turn > 0 ? [tip, p, q] : [tip, q, p]
}

/** The pieces of a polyline's paving: its segments' rectangles and its inner vertices' joints (`closed`: a loop). */
export function stripPieces(points: Point[], w: number, closed = false): Polygon[] {
  const n = points.length
  const pieces: Polygon[] = []
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const r = segmentStrip(points[i], points[(i + 1) % n], w)
    if (r) pieces.push(r)
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const j = joint(points[(i - 1 + n) % n], points[i], points[(i + 1) % n], w)
    if (j) pieces.push(j)
  }
  return pieces
}

/** The point at vertex i of the open polyline, `d` m to its left, mitred (its neighbours' normals averaged). */
function mitre(t: Point[], i: number, d: number): Point {
  const left = (a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
  }
  const n1 = i > 0 ? left(t[i - 1], t[i]) : null
  const n2 = i < t.length - 1 ? left(t[i], t[i + 1]) : null
  if (!n1 || !n2) {
    const n = (n1 ?? n2)!
    return { x: t[i].x + n.x * d, y: t[i].y + n.y * d }
  }
  const k = 1 + n1.x * n2.x + n1.y * n2.y
  return { x: t[i].x + ((n1.x + n2.x) * d) / k, y: t[i].y + ((n1.y + n2.y) * d) / k }
}

/**
 * The paving as few polygons as it takes, for the booleans: each stretch that bends gently as one outline (its sides
 * mitred), a joint where it bends sharply or its points are too close for the mitres. A curve of hundreds of points
 * is one polygon. Not convex: what needs convex pieces (the parking's overlaps) uses stripPieces.
 */
export function stripOutlines(points: Point[], w: number, closed = false): Polygon[] {
  if (closed) return stripPieces(points, w, true)
  const t: Point[] = []
  for (const q of points) if (!t.length || Math.hypot(q.x - t[t.length - 1].x, q.y - t[t.length - 1].y) > 1e-6) t.push(q)
  if (t.length < 2 || w <= 0) return []
  const h = w / 2
  const length = (i: number) => Math.hypot(t[i + 1].x - t[i].x, t[i + 1].y - t[i].y)
  const turn = (i: number) => {
    const [a, v, b] = [t[i - 1], t[i], t[i + 1]]
    return Math.atan2((v.x - a.x) * (b.y - v.y) - (v.y - a.y) * (b.x - v.x), (v.x - a.x) * (b.x - v.x) + (v.y - a.y) * (b.y - v.y))
  }
  // how far a mitre moves the inner side's corner along the segments
  const shift = (i: number) => h * Math.tan(Math.abs(turn(i)) / 2)
  const out: Polygon[] = []
  const outline = (run: Point[]) => {
    const right = run.map((_, i) => mitre(run, i, -h))
    const left = run.map((_, i) => mitre(run, i, h))
    out.push([...right, ...left.reverse()])
  }
  let start = 0
  let before = 0 // the shift at the run's last inner vertex
  for (let i = 1; i < t.length - 1; i++) {
    const a = Math.abs(turn(i)) <= BEVEL ? shift(i) : Infinity
    if (a + before < length(i - 1) && a < length(i)) {
      before = a
      continue
    }
    // vertex i ends a run: its joint closes the bend
    outline(t.slice(start, i + 1))
    const j = joint(t[i - 1], t[i], t[i + 1], w)
    if (j) out.push(j)
    start = i
    before = 0
  }
  outline(t.slice(start))
  return out
}

/** The paving of several centrelines, merged: [outer, ...holes] regions. */
export function stripRegions(lines: { points: Point[]; width: number; closed?: boolean }[]): Region[] {
  const pieces = lines.flatMap((l) => stripOutlines(l.points, l.width, l.closed))
  // one union of every piece (each counter-clockwise): far faster than adding them one by one
  return pieces.length ? union(pieces, []) : []
}

/** The rectangle of the stretch a→b: `left` m of paving to its left and `right` to its right (counter-clockwise); null when a and b are one point. */
export function stretchStrip(a: Point, b: Point, left: number, right: number): Polygon | null {
  const [p, q] = offsetLine([a, b], (left - right) / 2)
  return segmentStrip(p, q, left + right)
}
