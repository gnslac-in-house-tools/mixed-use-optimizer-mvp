// Tracking lines for a dragged corner. Port of Plaza-Practiko `vistas/planta/edicion/guias.ts`, on the world axes
// (Plaza's rotated work plane is left out until a site needs it).
// - A corner sticks to a line within `tol`; two non-parallel lines nearby combine in their crossing.
// - Along a single line, the grid still decides.
// - The lines: the mass's dominant axes through its other corners (so a corner squares up with its neighbours
//   without landing on an edge) and the extension of every straight wall nearby.
import type { Contour, Point } from '../../../model/schema.ts'
import { straightWalls, type LabeledWall } from './walls.ts'

/** A guide line: through `p`, unit direction `u`. */
export interface Line {
  p: Point
  u: Point
  /** What it says when drawn: "∥ axis 1", "wall of Warehouse 2", "Ortho". */
  label: string
}

/** Two lines combine only if they cross at ≥ ~11°. */
const SIN_INDEPENDENT = Math.sin((11 * Math.PI) / 180)
/** Two walls belong to the same axis family within this (degrees). */
const AXIS_TOL = 2

const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const dirOf = (degrees: number): Point => ({ x: Math.cos((degrees * Math.PI) / 180), y: Math.sin((degrees * Math.PI) / 180) })
const round = (v: number, step: number) => Math.round(v / step) * step

/** Distance from q to the line, and the foot of the perpendicular. */
export function toLine(q: Point, r: Line): { d: number; foot: Point } {
  const t = (q.x - r.p.x) * r.u.x + (q.y - r.p.y) * r.u.y
  const foot = { x: r.p.x + r.u.x * t, y: r.p.y + r.u.y * t }
  return { d: Math.hypot(q.x - foot.x, q.y - foot.y), foot }
}

/** Where two lines cross; null if they are (nearly) parallel. */
export function crossing(a: Line, b: Line): Point | null {
  const den = cross(a.u, b.u)
  if (Math.abs(den) < SIN_INDEPENDENT) return null
  const t = cross({ x: b.p.x - a.p.x, y: b.p.y - a.p.y }, b.u) / den
  return { x: a.p.x + a.u.x * t, y: a.p.y + a.u.y * t }
}

/**
 * Along a single line the grid decides too: a horizontal line puts x on the grid, a vertical one y, an oblique one
 * moves its distance from `p` by whole steps.
 */
export function alongLine(foot: Point, r: Line, step: number): Point {
  if (!(step > 0)) return foot
  if (Math.abs(r.u.y) < 1e-9) return { x: round(foot.x, step), y: foot.y }
  if (Math.abs(r.u.x) < 1e-9) return { x: foot.x, y: round(foot.y, step) }
  const t = round((foot.x - r.p.x) * r.u.x + (foot.y - r.p.y) * r.u.y, step)
  return { x: r.p.x + r.u.x * t, y: r.p.y + r.u.y * t }
}

/**
 * Snaps q to the lines: the closest within `tol` and, if a second one nearby is not parallel to it, their crossing
 * (when it is near the pointer); otherwise along the closest one. null if none is near.
 */
export function snapToLines(q: Point, lines: Line[], tol: number, step: number): { point: Point; lines: Line[] } | null {
  const near = lines
    .map((r) => ({ r, ...toLine(q, r) }))
    .filter((x) => x.d <= tol)
    .sort((a, b) => a.d - b.d)
  if (near.length === 0) return null
  const r1 = near[0]
  for (const r2 of near.slice(1)) {
    // two lines through the same point cross on it: that would put the corner on top of another one
    if (Math.hypot(r1.r.p.x - r2.r.p.x, r1.r.p.y - r2.r.p.y) < 1e-9) continue
    const x = crossing(r1.r, r2.r)
    if (x && Math.hypot(x.x - q.x, x.y - q.y) <= tol * 1.5) return { point: x, lines: [r1.r, r2.r] }
  }
  return { point: alongLine(r1.foot, r1.r, step), lines: [r1.r] }
}

/**
 * The dominant axes of a contour: its straight walls grouped by direction (mod 180°, within 2°), weighted by length.
 * The `max` heaviest families, in degrees [0, 180), heaviest first.
 */
export function dominantAxes(c: Contour, max = 3): number[] {
  const families: { angle: number; weight: number }[] = []
  for (const w of straightWalls(c)) {
    const a = ((((Math.atan2(w.u.y, w.u.x) * 180) / Math.PI) % 180) + 180) % 180
    const f = families.find((x) => {
      const d = Math.abs(x.angle - a)
      return Math.min(d, 180 - d) < AXIS_TOL
    })
    if (f) f.weight += w.length
    else families.push({ angle: a, weight: w.length })
  }
  return families
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max)
    .map((f) => Math.round(f.angle * 1e6) / 1e6)
}

/**
 * The tracking lines for dragging corner i: through every other corner, along each dominant axis and square to it.
 * The corner does not need to land on an edge: going along an axis from a neighbour is enough.
 */
export function axisLines(c: Contour, i: number): Line[] {
  const n = c.vertices.length
  if (n < 3) return []
  const out: Line[] = []
  dominantAxes(c).forEach((a, k) => {
    for (const [angle, sign] of [
      [a, '∥'],
      [a + 90, '⟂'],
    ] as const) {
      const u = dirOf(angle)
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const neighbour = j === (i + n - 1) % n || j === (i + 1) % n
        out.push({ p: c.vertices[j], u, label: neighbour ? `${sign} axis ${k + 1}` : `aligned (axis ${k + 1})` })
      }
    }
  })
  return out
}

/** The extension of each straight wall that attracts (but those that do not track). */
export function wallLines(walls: LabeledWall[]): Line[] {
  return walls.filter((w) => w.track !== false).map((w) => ({ p: w.a, u: w.u, label: `wall of ${w.label}` }))
}
