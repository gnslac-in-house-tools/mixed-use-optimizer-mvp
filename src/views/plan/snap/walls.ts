// Wall snap: a dragged mass's walls line up with parallel walls nearby. Port of Plaza-Practiko
// `vistas/planta/edicion/geometria.ts` (`murosRectos`, `ajustarMovimiento`), with one change: Plaza only sticks to a
// wall IN FRONT of the moving one (their projections must overlap). Here any parallel wall whose LINE is near
// attracts, so warehouse fronts line up across a yard, like smart guides. A dashed guide shows what aligned.
import type { Contour, Point } from '../../../model/schema.ts'
import { bulgeAt } from '../../../engine/geom/contour.ts'

export interface Wall {
  a: Point
  b: Point
  length: number
  /** Unit direction a → b. */
  u: Point
  /** Unit normal (right of a → b: outwards on a counter-clockwise contour). */
  n: Point
}

export interface LabeledWall extends Wall {
  label: string
  /** false: its line does not run on past it as a tracking line (the site, the setback, a street's pieces). */
  track?: boolean
}

/** A segment to draw as a dashed guide. */
export interface Guide {
  a: Point
  b: Point
  label: string
}

/** Within ~0.5° two walls count as parallel. */
const SIN_PARALLEL = Math.sin((0.5 * Math.PI) / 180)
/** Two constraints only combine when their normals differ by at least ~11°. */
const SIN_INDEPENDENT = 0.2

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const plus = (a: Point, d: Point) => ({ x: a.x + d.x, y: a.y + d.y })

/** Wall i of a contour (vertices[i] → vertices[i+1]), by its chord. A zero-length wall has u = n = (0, 0). */
export function wallAt(c: Contour, i: number): Wall {
  const v = c.vertices
  const a = { x: v[i].x, y: v[i].y }
  const b = { x: v[(i + 1) % v.length].x, y: v[(i + 1) % v.length].y }
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const u = length <= 1e-9 ? { x: 0, y: 0 } : { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  return { a, b, length, u, n: { x: u.y, y: -u.x } }
}

/** The straight walls of a contour (arc edges and zero-length walls are skipped). */
export function straightWalls(c: Contour, open = false): Wall[] {
  const n = c.vertices.length
  return c.vertices
    .map((_, i) => i)
    .filter((i) => !(open && i === n - 1) && bulgeAt(c, i) === 0)
    .map((i) => wallAt(c, i))
    .filter((w) => w.length > 1e-9)
}

/** "The offset d must satisfy n·d = k": one wall sitting on one line. */
interface Constraint {
  n: Point
  k: number
  error: number
  target: LabeledWall
  own: Wall
}

/** The guide along the target's line, long enough to cover both walls (the own one already moved by `d`). */
function guideOf(c: Constraint, d: Point): Guide {
  const q = c.target
  const ts = [q.a, q.b, plus(c.own.a, d), plus(c.own.b, d)].map((p) => dot({ x: p.x - q.a.x, y: p.y - q.a.y }, q.u))
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts)
  return { a: { x: q.a.x + q.u.x * t0, y: q.a.y + q.u.y * t0 }, b: { x: q.a.x + q.u.x * t1, y: q.a.y + q.u.y * t1 }, label: q.label }
}

export interface WallSnap {
  delta: Point
  guides: Guide[]
  /** Where to write the label: the middle of the moved wall that aligned. */
  at: Point
}

/**
 * Snaps the drag offset so that a wall of the moving shape sits on the line of a parallel wall within `tol`.
 * - `own`: the shape's walls at the drag start. `raw`: the pointer offset. `base`: the offset to keep where no wall
 *   decides (the grid, or `raw`).
 * - One wall: fixes the offset across it; along it, `base` stays. Two independent walls (a corner): both.
 * - null when no wall is near.
 */
export function snapToWalls(own: Wall[], targets: LabeledWall[], raw: Point, base: Point, tol: number): WallSnap | null {
  const found: Constraint[] = []
  for (const q of targets) {
    for (const p of own) {
      if (Math.abs(cross(p.u, q.u)) > SIN_PARALLEL) continue
      // signed distance from the moved wall's middle to the target's line, along the target's normal
      const mid = { x: (p.a.x + p.b.x) / 2 + raw.x, y: (p.a.y + p.b.y) / 2 + raw.y }
      const d = dot({ x: mid.x - q.a.x, y: mid.y - q.a.y }, q.n)
      if (Math.abs(d) > tol) continue
      found.push({ n: q.n, k: dot(raw, q.n) - d, error: Math.abs(d), target: q, own: p })
    }
  }
  if (found.length === 0) return null
  found.sort((a, b) => a.error - b.error)
  const c1 = found[0]
  const c2 = found.find((c) => Math.abs(cross(c.n, c1.n)) > SIN_INDEPENDENT)
  let delta: Point
  if (!c2) {
    // n1·d = k1; along the wall, base decides
    const s = c1.k - dot(base, c1.n)
    delta = { x: base.x + s * c1.n.x, y: base.y + s * c1.n.y }
  } else {
    const det = cross(c1.n, c2.n)
    delta = { x: (c1.k * c2.n.y - c2.k * c1.n.y) / det, y: (c1.n.x * c2.k - c2.n.x * c1.k) / det }
  }
  const used = c2 ? [c1, c2] : [c1]
  const at = { x: (c1.own.a.x + c1.own.b.x) / 2 + delta.x, y: (c1.own.a.y + c1.own.b.y) / 2 + delta.y }
  return { delta, guides: used.map((c) => guideOf(c, delta)), at }
}
