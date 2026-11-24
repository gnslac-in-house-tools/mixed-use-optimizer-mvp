// The convex hull and the minimum-area rectangle around points (port of Plaza-Practiko `motores/geom/rectangulo.ts`,
// itself a port of Trama's `rectangulo.py`). The docks read a footprint's long direction from it (Decision "Exterior
// circulation"), so an L or a trapezoid has long and short walls too.
import type { Point } from '../../model/schema.ts'

/** The convex hull (monotone chain), counter-clockwise, without collinear points. */
export function convexHull(p: Point[]): Point[] {
  const seen = new Set<string>()
  const pts: Point[] = []
  for (const q of p) {
    const k = `${q.x},${q.y}`
    if (seen.has(k)) continue
    seen.add(k)
    pts.push({ x: q.x, y: q.y })
  }
  pts.sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Point[] = []
  for (let k = pts.length - 1; k >= 0; k--) {
    const q = pts[k]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** The minimum-area rectangle: its centre, the unit direction of its long side (u.x ≥ 0), its length and width. */
export function minimumRectangle(p: Point[]): { center: Point; u: Point; length: number; width: number } {
  const hull = convexHull(p)
  if (hull.length < 3) throw new Error('At least 3 points that are not on one line are needed')
  let best: { area: number; u: Point; v: Point; au: number; bu: number; av: number; bv: number } | null = null
  const n = hull.length
  for (let i = 0; i < n; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % n]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l < 1e-12) continue
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    const v = { x: -u.y, y: u.x }
    const us = hull.map((q) => q.x * u.x + q.y * u.y)
    const vs = hull.map((q) => q.x * v.x + q.y * v.y)
    const au = Math.min(...us)
    const bu = Math.max(...us)
    const av = Math.min(...vs)
    const bv = Math.max(...vs)
    const area = (bu - au) * (bv - av)
    if (best === null || area < best.area - 1e-9) best = { area, u, v, au, bu, av, bv }
  }
  const { u, v, au, bu, av, bv } = best!
  const mu = (au + bu) / 2
  const mv = (av + bv) / 2
  const center = { x: u.x * mu + v.x * mv, y: u.y * mu + v.y * mv }
  let dir = u
  let length = bu - au
  let width = bv - av
  if (width > length) {
    dir = v
    ;[length, width] = [width, length]
  }
  if (dir.x < 0 || (Math.abs(dir.x) < 1e-12 && dir.y < 0)) dir = { x: -dir.x, y: -dir.y }
  return { center, u: dir, length, width }
}
