// A path's corners rounded (the street type's turning radius), pure.
import type { Point } from '../../model/schema.ts'

/**
 * Each corner's radius along a path drawn by an edge (Decision "Street side when drawing"): a corner whose inside is the
 * drawn edge (a left edge turning left, a right edge turning right: the edge against a building drawn round) keeps
 * that edge sharp: its centre line is rounded by half the width, about the drawn corner (its outer edge by the width),
 * and the type's radius is not honoured there; a type that keeps its corners sharp (0) keeps them sharp. Every other
 * corner, and every corner of a path with paving on both sides of its drawn line, takes the type's radius.
 * The drawn line is the left edge when `left` is 0, the right edge when `right` is 0.
 */
export function cornerRadii(drawn: Point[], left: number, right: number, radius: number): number | number[] {
  if ((left !== 0 && right !== 0) || radius <= 0 || drawn.length < 3) return radius
  const towards = left === 0 ? 1 : -1
  const width = left + right
  return drawn.map((p, i) => {
    if (i === 0 || i === drawn.length - 1) return radius
    const a = drawn[i - 1]
    const b = drawn[i + 1]
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)
    return cross * towards > 1e-9 ? width / 2 : radius
  })
}

/** rad: an arc's points this far apart, at most (16 to a half turn). */
const ARC_STEP = Math.PI / 16
/** m: an arc's points at least this far apart. */
const MIN_CHORD = 2
/** m: a corner rounded less than this is kept sharp; and one the arc would pass this close to. */
const MIN_RADIUS = 2
const SAGITTA = 0.05

/**
 * A polyline with its inner corners rounded: an arc of radius r tangent to both sides (smaller where a side is too
 * short: it takes half of each side at most); r one for every corner, or each point's own (`cornerRadii`). Its ends
 * stay where they are, so what meets them still meets them.
 */
export function rounded(points: Point[], r: number | number[]): Point[] {
  const at = (i: number) => (typeof r === 'number' ? r : (r[i] ?? 0))
  if (points.length < 3 || (typeof r === 'number' ? r <= 0 : r.every((x) => x <= 0))) return points
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) out.push(...corner(points[i - 1], points[i], points[i + 1], at(i)))
  out.push(points[points.length - 1])
  // a loop's start is kept sharp, as an end: where the loop was begun. Two corners that each take half of the side
  // between them meet at its middle: that point once (the stress test: a migrated ring's short side)
  return out.filter((q, i) => i === 0 || Math.hypot(q.x - out[i - 1].x, q.y - out[i - 1].y) > 1e-6)
}

function corner(a: Point, p: Point, b: Point, r: number): Point[] {
  const la = Math.hypot(a.x - p.x, a.y - p.y)
  const lb = Math.hypot(b.x - p.x, b.y - p.y)
  if (la < 1e-9 || lb < 1e-9) return [p]
  const u = { x: (a.x - p.x) / la, y: (a.y - p.y) / la }
  const v = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb }
  const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) // the angle between the two sides
  if (theta > Math.PI - 1e-3 || theta < 1e-3) return [p] // straight on, or doubling back: no arc
  const half = Math.tan(theta / 2)
  const t = Math.min(r / half, la / 2, lb / 2) // from the corner to where the arc meets each side
  const radius = t * half
  const d = radius / Math.sin(theta / 2)
  // an arc no one would see stays a corner: under 2 m round (a noisy line's zigzag), or a bend it would leave by
  // less than SAGITTA (a curve drawn point by point)
  if (radius < MIN_RADIUS || d - radius < SAGITTA) return [p]
  const bis = { x: u.x + v.x, y: u.y + v.y }
  const lbis = Math.hypot(bis.x, bis.y)
  const c = { x: p.x + (bis.x / lbis) * d, y: p.y + (bis.y / lbis) * d }
  const p1 = { x: p.x + u.x * t, y: p.y + u.y * t }
  const p2 = { x: p.x + v.x * t, y: p.y + v.y * t }
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x)
  let sweep = Math.atan2(p2.y - c.y, p2.x - c.x) - a1
  if (sweep > Math.PI) sweep -= 2 * Math.PI
  if (sweep < -Math.PI) sweep += 2 * Math.PI
  // and a chord of 2 m at least: a small arc (a noisy line's) takes few points (the stress test: 200 noisy points)
  const n = Math.max(1, Math.min(Math.ceil(Math.abs(sweep) / ARC_STEP), Math.ceil((radius * Math.abs(sweep)) / MIN_CHORD)))
  const arc: Point[] = []
  for (let k = 0; k <= n; k++) {
    const ang = a1 + (sweep * k) / n
    arc.push({ x: c.x + radius * Math.cos(ang), y: c.y + radius * Math.sin(ang) })
  }
  return arc
}
