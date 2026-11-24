// Basic polygon math. Pure functions: numbers in, numbers out. Every other engine module builds on these.
import type { Point, Polygon } from '../../model/schema.ts'

/** Below this, two lengths are considered equal. */
export const EPS = 1e-9

/**
 * Shoelace formula. Positive when the points run counter-clockwise, negative when clockwise.
 * The sign tells us the orientation; the absolute value is the area.
 */
export function signedArea(poly: Polygon): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Area in m², whatever the orientation. */
export function area(poly: Polygon): number {
  return Math.abs(signedArea(poly))
}

/** The same polygon, guaranteed counter-clockwise. Offsets and booleans assume this. */
export function toCounterClockwise(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly
}

/** Centre of mass of the area (not the average of the vertices, which is skewed by extra points). */
export function centroid(poly: Polygon): Point {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-12) {
    // Degenerate (all points on a line): fall back to the vertex average.
    const n = poly.length
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const cross = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Axis-aligned bounding box. Cheap first test before any expensive geometry. */
export function bounds(poly: Polygon): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Do two boxes overlap (or come closer than `gap`)? */
export function boundsTouch(a: Bounds, b: Bounds, gap = 0): boolean {
  return a.minX - gap <= b.maxX && b.minX - gap <= a.maxX && a.minY - gap <= b.maxY && b.minY - gap <= a.maxY
}

/** Ray casting: count how many edges a horizontal ray from `p` crosses. Odd = inside. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

/** Shortest distance from point q to the segment a–b. */
export function distancePointSegment(q: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 <= EPS * EPS ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2))
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy))
}

/** u × v: > 0 when v turns left of u. */
export function cross(u: Point, v: Point): number {
  return u.x * v.y - u.y * v.x
}

/**
 * Where the lines through a → b and c → d meet, as how far along each it is (a + t·(b − a) = c + u·(d − c)); null when
 * they run parallel (to 1e-12 of their lengths), a line of no length included.
 */
export function lineCrossing(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const den = cross(r, s)
  if (Math.abs(den) <= 1e-12 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return null
  const ca = { x: c.x - a.x, y: c.y - a.y }
  return { t: cross(ca, s) / den, u: cross(ca, r) / den }
}

/** Twice the signed area of triangle o-a-b: > 0 when b is to the left of o → a. */
function orient(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function inBox(q: Point, a: Point, b: Point): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= q.x && q.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= q.y && q.y <= Math.max(a.y, b.y) + EPS
  )
}

/** Do segments ab and cd cross or touch (collinear overlaps included)? */
export function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true
  if (Math.abs(d1) <= EPS && inBox(a, c, d)) return true
  if (Math.abs(d2) <= EPS && inBox(b, c, d)) return true
  if (Math.abs(d3) <= EPS && inBox(c, a, b)) return true
  if (Math.abs(d4) <= EPS && inBox(d, a, b)) return true
  return false
}

/**
 * A simple polygon: it has area and no edge crosses or touches a non-neighbouring one (nor folds back on the next).
 * Port of Plaza-Practiko `esSimple`. Editing rejects any shape that fails it.
 */
export function isSimple(poly: Polygon): boolean {
  const q: Point[] = []
  for (const v of poly) {
    const u = q[q.length - 1]
    if (!u || Math.hypot(v.x - u.x, v.y - u.y) > EPS) q.push(v)
  }
  while (q.length > 1 && Math.hypot(q[0].x - q[q.length - 1].x, q[0].y - q[q.length - 1].y) <= EPS) q.pop()
  const n = q.length
  if (n < 3 || area(q) <= EPS) return false
  for (let i = 0; i < n; i++) {
    const a = q[i]
    const b = q[(i + 1) % n]
    // the next edge may not turn back over this one
    const c = q[(i + 2) % n]
    if (Math.abs(orient(a, b, c)) <= EPS && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // neighbours through the closing edge
      if (segmentsTouch(a, b, q[j], q[(j + 1) % n])) return false
    }
  }
  return true
}
