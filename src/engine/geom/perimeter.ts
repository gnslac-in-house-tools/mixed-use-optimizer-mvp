// Positions on a closed polygon's perimeter as a fraction t (0..1) of its length from vertex 0 (port of Plaza-Practiko
// `motores/geom/perimetro.ts`; the convention of its ramps and street accesses). A gate or a dock wall
// stored this way stays on its edge when the outline is edited, where an edge index would jump when a corner is added
// (Decision "Exterior circulation").
import type { Point, Polygon } from '../../model/schema.ts'

function sides(p: Polygon): { lengths: number[]; total: number } {
  const lengths: number[] = []
  let total = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(l)
    total += l
  }
  return { lengths, total }
}

export function perimeter(p: Polygon): number {
  return sides(p).total
}

/** Where t falls: the edge (vertices[i] → vertices[i+1]) and the fraction along it. */
export function edgeAt(p: Polygon, t: number): { i: number; f: number } {
  const { lengths, total } = sides(p)
  if (p.length === 0 || total <= 0) return { i: 0, f: 0 }
  let s = Math.min(1, Math.max(0, t)) * total
  for (let i = 0, n = p.length; i < n; i++) {
    if (s <= lengths[i] || i === n - 1) return { i, f: lengths[i] > 0 ? Math.min(1, s / lengths[i]) : 0 }
    s -= lengths[i]
  }
  return { i: 0, f: 0 }
}

/** The point at t. */
export function pointAt(p: Polygon, t: number): Point {
  if (p.length === 0) return { x: 0, y: 0 }
  const { i, f } = edgeAt(p, t)
  const a = p[i]
  const b = p[(i + 1) % p.length]
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
}

/** The unit direction of the edge at t (counter-clockwise outline: its inside is to the left). */
export function directionAt(p: Polygon, t: number): Point {
  if (p.length < 2) return { x: 1, y: 0 }
  const { i } = edgeAt(p, t)
  const a = p[i]
  const b = p[(i + 1) % p.length]
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/** The t of the perimeter's point nearest to q. */
export function nearestT(p: Polygon, q: Point): number {
  const { lengths, total } = sides(p)
  if (p.length < 2 || total <= 0) return 0
  let best = Infinity
  let tBest = 0
  let along = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    const l = lengths[i]
    let f = 0
    if (l > 0) f = Math.min(1, Math.max(0, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (l * l)))
    const d = Math.hypot(a.x + f * (b.x - a.x) - q.x, a.y + f * (b.y - a.y) - q.y)
    if (d < best - 1e-12) {
      best = d
      tBest = (along + f * l) / total
    }
    along += l
  }
  return tBest >= 1 ? 0 : tBest
}

/** The t of each vertex (vertex 0 at 0). */
export function vertexTs(p: Polygon): number[] {
  const { lengths, total } = sides(p)
  if (total <= 0) return p.map(() => 0)
  let along = 0
  return lengths.map((l) => {
    const t = along / total
    along += l
    return t
  })
}

/** Is t inside the stretch from `from` to `to` (counter-clockwise; `to` below `from` passes vertex 0)? */
export function inStretch(t: number, from: number, to: number, eps = 1e-9): boolean {
  return from <= to ? t >= from - eps && t <= to + eps : t >= from - eps || t <= to + eps
}

/** The stretch's length as a fraction of the perimeter. */
export const stretchLength = (from: number, to: number): number => (from <= to ? to - from : 1 - from + to)

/** The open polyline along the perimeter from `from` to `to` (counter-clockwise, passing vertex 0 if it must). */
export function perimeterPath(p: Polygon, from: number, to: number): Point[] {
  if (p.length < 2) return []
  const ts = vertexTs(p)
  const out: Point[] = [pointAt(p, from)]
  const span = stretchLength(from, to)
  // the vertices strictly inside the stretch, in order from `from`
  const inside = ts
    .map((t, i) => ({ i, d: t - from < 0 ? t - from + 1 : t - from }))
    .filter((v) => v.d > 1e-9 && v.d < span - 1e-9)
    .sort((a, b) => a.d - b.d)
  for (const v of inside) out.push(p[v.i])
  out.push(pointAt(p, to))
  return out
}
