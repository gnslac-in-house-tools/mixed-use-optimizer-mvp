// A polyline shifted sideways: the path engine's offset (Decision "Drawing side"), pure.
import type { Point } from '../../model/schema.ts'
import type { Path } from './types.ts'

/** How far a mitred corner may reach from its point, in offsets (a line nearly doubling back keeps its point shifted
 *  instead: its mitre would run off far beyond the corner). */
export const MITRE_LIMIT = 10

/**
 * A polyline shifted by d (Decision "Drawing side"): positive to its left walking it, negative to its right. Its ends
 * are shifted square to their segments; its inner corners mitred, the two shifted lines' intersection (neighbours in
 * line, or nearly doubling back, keep the point shifted). A closed one (its last point its first) is mitred there too.
 * By 0, the polyline itself.
 */
export function offsetLine(points: Point[], d: number): Point[] {
  if (d === 0 || points.length < 2) return points
  const n = points.length
  // each segment's unit normal to its left; one of no length takes its neighbour's
  const normals: (Point | null)[] = points.slice(1).map((b, i) => {
    const a = points[i]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    return l < 1e-9 ? null : { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
  })
  for (let i = 1; i < normals.length; i++) normals[i] ??= normals[i - 1]
  for (let i = normals.length - 2; i >= 0; i--) normals[i] ??= normals[i + 1]
  if (!normals[0]) return points
  const m = normals as Point[]
  const shifted = (q: Point, u: Point): Point => ({ x: q.x + u.x * d, y: q.y + u.y * d })
  const mitre = (q: Point, u: Point, v: Point): Point => {
    // q + d (u + v) / (1 + u·v): where the lines shifted along u and along v meet
    const c = 1 + u.x * v.x + u.y * v.y
    if (Math.abs(u.x * v.y - u.y * v.x) < 1e-9 || c < 1e-9) return shifted(q, u)
    const r = { x: q.x + ((u.x + v.x) * d) / c, y: q.y + ((u.y + v.y) * d) / c }
    return Math.hypot(r.x - q.x, r.y - q.y) > MITRE_LIMIT * Math.abs(d) ? shifted(q, u) : r
  }
  const out = points.map((q, i) => (i === 0 ? shifted(q, m[0]) : i === n - 1 ? shifted(q, m[n - 2]) : mitre(q, m[i - 1], m[i])))
  const p0 = points[0]
  const pn = points[n - 1]
  if (n > 3 && Math.hypot(p0.x - pn.x, p0.y - pn.y) < 1e-9) out[0] = out[n - 1] = mitre(p0, m[n - 2], m[0])
  return out
}

/**
 * A polyline with a shift of its own on each stretch (positive to its left, `shifts.length === points.length - 1`):
 * each inner node is the crossing of its two stretches' shifted lines (mitred, `MITRE_LIMIT` kept); two stretches in
 * line (or doubling back) with different shifts meet at the midpoint of their two shifted ends. Equal shifts are
 * `offsetLine` itself.
 */
export function offsetPath(points: Point[], shifts: number[]): Point[] {
  const n = points.length
  if (n < 2) return points
  if (shifts.every((s) => s === shifts[0])) return offsetLine(points, shifts[0])
  const normals: (Point | null)[] = points.slice(1).map((b, i) => {
    const a = points[i]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    return l < 1e-9 ? null : { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
  })
  for (let i = 1; i < normals.length; i++) normals[i] ??= normals[i - 1]
  for (let i = normals.length - 2; i >= 0; i--) normals[i] ??= normals[i + 1]
  if (!normals[0]) return points
  const m = normals as Point[]
  const shifted = (q: Point, u: Point, d: number): Point => ({ x: q.x + u.x * d, y: q.y + u.y * d })
  const mitre = (q: Point, u: Point, v: Point, d1: number, d2: number): Point => {
    const mid = (): Point => {
      const a = shifted(q, u, d1)
      const b = shifted(q, v, d2)
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    const c = u.x * v.x + u.y * v.y
    const cr = u.x * v.y - u.y * v.x
    if (Math.abs(cr) < 1e-9 || 1 + c < 1e-9) return d1 === d2 ? shifted(q, u, d1) : mid()
    // q + d1 u + t dirU, with dirU = (u.y, -u.x): on the line shifted by d2 along v: (p - q)·v = d2
    const t = (d2 - d1 * c) / (u.y * v.x - u.x * v.y)
    const r = { x: q.x + u.x * d1 + u.y * t, y: q.y + u.y * d1 - u.x * t }
    return Math.hypot(r.x - q.x, r.y - q.y) > MITRE_LIMIT * Math.max(Math.abs(d1), Math.abs(d2)) ? mid() : r
  }
  const out = points.map((q, i) =>
    i === 0 ? shifted(q, m[0], shifts[0]) : i === n - 1 ? shifted(q, m[n - 2], shifts[n - 2]) : mitre(q, m[i - 1], m[i], shifts[i - 1], shifts[i]),
  )
  const p0 = points[0]
  const pn = points[n - 1]
  if (n > 3 && Math.hypot(p0.x - pn.x, p0.y - pn.y) < 1e-9) out[0] = out[n - 1] = mitre(p0, m[n - 2], m[0], shifts[n - 2], shifts[0])
  return out
}

/** The path's centre line: each stretch's paving centre, `(left − right) / 2` to the drawn line's left. */
export function centreOf(path: Path): Point[] {
  return offsetPath(path.points, path.stretches.map((s) => (s.left - s.right) / 2))
}

/** The path's two edges: where the paving ends on each hand. */
export function edgesOf(path: Path): { left: Point[]; right: Point[] } {
  return {
    left: offsetPath(path.points, path.stretches.map((s) => s.left)),
    right: offsetPath(path.points, path.stretches.map((s) => -s.right)),
  }
}
