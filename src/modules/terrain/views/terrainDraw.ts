// What the plan draws of the ground (Decision "Terrain layout", Show's *Terrain ▾*), pure: the contours with their
// heights (each one's from the designer, the file, counted, or none), every fifth interval a major one with its label;
// the slope as the surface's triangles in classes; the platforms' cut and fill as the earthwork grid's cells in
// classes (Decision "Platforms"). Made once per terrain object, or per grid (an edit of the design leaves the ground).
import type { Point, Terrain } from '../../../model/schema.ts'
import { heightsOf, surfaceOf, type HeightFrom, type Surface } from '../engine/index.ts'
import type { EarthGrid } from '../../../engine/types.ts'

export interface ContourDrawing {
  /** The contour's index in the terrain (the Heights tool gives it by it). */
  index: number
  points: Point[]
  closed: boolean
  z: number | null
  from: HeightFrom | null
  /** Every fifth interval: drawn stronger and labelled. */
  major: boolean
  /** Where its height is written: the middle of its length, along it, never upside down (degrees, y up). */
  label: { at: Point; angle: number }
}

/** A height as the plan writes it: whole metres plainly, else to the centimetre. */
export const heightText = (z: number) => z.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Major contours every this many intervals. */
const MAJOR_EVERY = 5

/** The point halfway along a line and the way it runs there. */
function middle(pts: Point[]): { at: Point; angle: number } {
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  let left = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const a = pts[i]
      const b = pts[i + 1]
      const t = lengths[i] ? Math.min(1, left / lengths[i]) : 0
      let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      if (angle > 90) angle -= 180
      if (angle <= -90) angle += 180
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle }
    }
    left -= lengths[i]
  }
  return { at: pts[0], angle: 0 }
}

const contoursMade = new WeakMap<Terrain, ContourDrawing[]>()

export function contoursOf(t: Terrain): ContourDrawing[] {
  const had = contoursMade.get(t)
  if (had) return had
  const h = heightsOf(t)
  const step = h.interval ? h.interval * MAJOR_EVERY : null
  const out = t.contours.map((c, index): ContourDrawing => {
    const z = h.z[index]
    const major = z !== null && step !== null && Math.abs(z / step - Math.round(z / step)) < 1e-3
    const points = c.closed && c.points.length > 2 ? [...c.points, c.points[0]] : c.points
    return { index, points, closed: !!c.closed, z, from: h.from[index], major, label: middle(points) }
  })
  contoursMade.set(t, out)
  return out
}

/** The slope classes, rise over run: each class is up to its limit (the last, beyond the one before). */
export const SLOPE_CLASSES = [
  { max: 0.02, label: '0–2 %' },
  { max: 0.05, label: '2–5 %' },
  { max: 0.1, label: '5–10 %' },
  { max: 0.15, label: '10–15 %' },
  { max: Infinity, label: 'over 15 %' },
] as const

/** A class's colour (tokens.css `--slope-1` … `--slope-5`). */
export const slopeColor = (k: number) => `var(--slope-${k + 1})`

/** Triangle k's slope (rise over run) on the surface, or null when it stands on edge. */
export function triangleSlope(s: Pick<Surface, 'x' | 'y' | 'z' | 'triangles'>, k: number): number | null {
  const { x, y, z, triangles } = s
  const a = triangles[3 * k]
  const b = triangles[3 * k + 1]
  const c = triangles[3 * k + 2]
  // the plane's normal through the three corners: its tilt is the slope
  const u = [x[b] - x[a], y[b] - y[a], z[b] - z[a]]
  const v = [x[c] - x[a], y[c] - y[a], z[c] - z[a]]
  const nx = u[1] * v[2] - u[2] * v[1]
  const ny = u[2] * v[0] - u[0] * v[2]
  const nz = u[0] * v[1] - u[1] * v[0]
  return Math.abs(nz) < 1e-12 ? null : Math.hypot(nx, ny) / Math.abs(nz)
}

/** The class a slope falls in (SLOPE_CLASSES' index). */
export const slopeClass = (slope: number) => SLOPE_CLASSES.findIndex((q) => slope <= q.max)

const slopesMade = new WeakMap<Terrain, string[] | null>()

/** The surface's triangles as one path per slope class (y drawn down, as the plan's); null: no surface. */
export function slopePathsOf(t: Terrain): string[] | null {
  if (slopesMade.has(t)) return slopesMade.get(t)!
  const s = surfaceOf(t)
  let out: string[] | null = null
  if (s) {
    const parts: string[][] = SLOPE_CLASSES.map(() => [])
    const { x, y, triangles } = s
    const at = (i: number) => `${x[i].toFixed(2)},${(-y[i]).toFixed(2)}`
    for (let k = 0; k < triangles.length / 3; k++) {
      const slope = triangleSlope(s, k)
      if (slope === null) continue
      parts[slopeClass(slope)].push(`M${at(triangles[3 * k])}L${at(triangles[3 * k + 1])}L${at(triangles[3 * k + 2])}Z`)
    }
    out = parts.map((p) => p.join(''))
  }
  slopesMade.set(t, out)
  return out
}

/**
 * The earthwork's classes by depth (m): cut and fill alike, each up to its limit; under the first, the ground stays
 * as it is to the eye (not drawn).
 */
export const EARTH_CLASSES = [
  { max: 0.25, label: 'under 0.25 m' },
  { max: 1, label: '0.25–1 m' },
  { max: 3, label: '1–3 m' },
  { max: Infinity, label: 'over 3 m' },
] as const

/** A class's colour (tokens.css `--cut-1` … `--cut-3`, `--fill-1` … `--fill-3`); the first class has none. */
export const earthColor = (kind: 'cut' | 'fill', k: number) => `var(--${kind}-${k})`

/** The class a depth falls in (EARTH_CLASSES' index), cut or fill alike. */
export const earthClass = (depth: number) => EARTH_CLASSES.findIndex((q) => Math.abs(depth) <= q.max)

const earthMade = new WeakMap<EarthGrid, { cut: string[]; fill: string[] }>()

/**
 * The grid's graded cells as one path per class, cut and fill apart (index 0 empty: the ground as it is); a row's
 * cells of one class side by side are one rectangle. y drawn down, as the plan's.
 */
export function earthPathsOf(g: EarthGrid): { cut: string[]; fill: string[] } {
  const had = earthMade.get(g)
  if (had) return had
  const parts = { cut: EARTH_CLASSES.map(() => [] as string[]), fill: EARTH_CLASSES.map(() => [] as string[]) }
  const classOf = (c: number): [kind: 'cut' | 'fill', k: number] | null => {
    const d = g.depth[c]
    if (Number.isNaN(d)) return null
    const k = earthClass(d)
    return k > 0 ? [d < 0 ? 'cut' : 'fill', k] : null
  }
  for (let j = 0; j < g.rows; j++) {
    const y = -(g.y0 + (j + 1) * g.size)
    let i = 0
    while (i < g.cols) {
      const at = classOf(j * g.cols + i)
      if (!at) {
        i++
        continue
      }
      let n = 1
      while (i + n < g.cols) {
        const next = classOf(j * g.cols + i + n)
        if (!next || next[0] !== at[0] || next[1] !== at[1]) break
        n++
      }
      parts[at[0]][at[1]].push(`M${(g.x0 + i * g.size).toFixed(2)},${y.toFixed(2)}h${(n * g.size).toFixed(2)}v${g.size.toFixed(2)}h${(-n * g.size).toFixed(2)}Z`)
      i += n
    }
  }
  const out = { cut: parts.cut.map((p) => p.join('')), fill: parts.fill.map((p) => p.join('')) }
  earthMade.set(g, out)
  return out
}
