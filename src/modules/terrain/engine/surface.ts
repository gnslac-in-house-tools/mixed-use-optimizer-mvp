// The ground as a surface (Decision "Terrain"): triangulated (Delaunay) through the samples of the contours whose
// height is known (heights.ts) and the points of the ground; a point's elevation is its triangle's plane, its slope
// that plane's; a terrain's edge (edge.ts: the ground carried to the boundary) is triangulated as points of the
// ground. Beyond them there is no ground: null. Made once per terrain, which an edit of the design leaves as it is. Schematic: a contour's own bends make some triangles flat (all three corners on one contour), so the
// ground steps a little there, unless it is smoothed (smooth.ts, Decision "Terrain smoothing", the surface by
// default); good enough to compare options, not a survey.
import Delaunator from 'delaunator'
import type { Point, Terrain } from '../../../model/schema.ts'
import { heightsOf } from './heights.ts'
import { samplesOf } from './samples.ts'
import { smoothedPoints, smoothingOf } from './smooth.ts'

export interface Surface {
  x: Float64Array
  y: Float64Array
  z: Float64Array
  /** Three vertices a triangle, clockwise with y up (Delaunator's way): the 3D turns them to face up (terrain3d.ts). */
  triangles: Uint32Array
  /** Each triangle side's twin in the triangle beside it (Delaunator's halfedges; -1: the ground's edge). */
  halfedges: Int32Array
  /** The lowest and highest ground (m). */
  min: number
  max: number
  /** The ground's height at p (m), or null where there is no ground. */
  elevation(p: Point): number | null
  /** The steepest rise over run at p (0.1: 10 %), or null where there is no ground. */
  slope(p: Point): number | null
}

const made = new WeakMap<Terrain, Surface | null>()

export function surfaceOf(t: Terrain): Surface | null {
  if (made.has(t)) return made.get(t)!
  const s = build(t)
  made.set(t, s)
  return s
}

/** On a triangle's edge, a point is in it (a little either way). */
const ON_EDGE = 1e-9

function build(terrain: Terrain): Surface | null {
  // the ground carried to the boundary (edge.ts) is triangulated as points of the ground
  const { edge, ...surveyed } = terrain
  const t: Terrain = edge?.length ? { ...surveyed, points: [...surveyed.points, ...edge] } : terrain
  const heights = heightsOf(t)
  const mode = smoothingOf(t)
  const s = samplesOf(t, (k) => heights.z[k] !== null)
  const n = s.x.length
  const z = new Float64Array(n)
  for (let i = 0; i < n; i++) z[i] = s.contour[i] >= 0 ? heights.z[s.contour[i]]! : t.points[s.point[i]].z
  const raw = surfaceFrom(s.x, s.y, z)
  // points alone have no terraces: only a ground with contours is smoothed
  if (mode !== 'surface' || !raw || !s.contour.some((c) => c >= 0)) return raw
  const smooth = smoothedPoints(t, raw, s.contour, heights.interval)
  return smooth ? (surfaceFrom(smooth.x, smooth.y, smooth.z) ?? raw) : raw
}

/** A surface through any points of the ground (x, y, z): triangulated (Delaunay); null with fewer than three. */
export function surfaceFrom(x: Float64Array, y: Float64Array, z: Float64Array): Surface | null {
  const n = x.length
  if (n < 3) return null
  const coords = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    coords[2 * i] = x[i]
    coords[2 * i + 1] = y[i]
  }
  const { triangles, halfedges } = new Delaunator(coords)
  if (triangles.length === 0) return null
  const grid = gridOf(x, y, triangles)

  /** The triangle under p and p's weights on its corners, or null. */
  const locate = (p: Point): { t: number; w: [number, number, number] } | null => {
    for (const k of grid.at(p.x, p.y)) {
      const a = triangles[3 * k]
      const b = triangles[3 * k + 1]
      const c = triangles[3 * k + 2]
      const det = (y[b] - y[c]) * (x[a] - x[c]) + (x[c] - x[b]) * (y[a] - y[c])
      if (Math.abs(det) < 1e-12) continue
      const wa = ((y[b] - y[c]) * (p.x - x[c]) + (x[c] - x[b]) * (p.y - y[c])) / det
      const wb = ((y[c] - y[a]) * (p.x - x[c]) + (x[a] - x[c]) * (p.y - y[c])) / det
      const wc = 1 - wa - wb
      if (wa >= -ON_EDGE && wb >= -ON_EDGE && wc >= -ON_EDGE) return { t: k, w: [wa, wb, wc] }
    }
    return null
  }

  let min = Infinity
  let max = -Infinity
  for (const v of z) {
    min = Math.min(min, v)
    max = Math.max(max, v)
  }

  return {
    x,
    y,
    z,
    triangles,
    halfedges,
    min,
    max,
    elevation(p) {
      const at = locate(p)
      if (!at) return null
      const [a, b, c] = [triangles[3 * at.t], triangles[3 * at.t + 1], triangles[3 * at.t + 2]]
      return at.w[0] * z[a] + at.w[1] * z[b] + at.w[2] * z[c]
    },
    slope(p) {
      const at = locate(p)
      if (!at) return null
      const [a, b, c] = [triangles[3 * at.t], triangles[3 * at.t + 1], triangles[3 * at.t + 2]]
      // the plane's gradient: (b − a) × (c − a) is its normal
      const ux = x[b] - x[a]
      const uy = y[b] - y[a]
      const uz = z[b] - z[a]
      const vx = x[c] - x[a]
      const vy = y[c] - y[a]
      const vz = z[c] - z[a]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      return Math.hypot(nx, ny) / Math.abs(nz)
    },
  }
}

/** The triangles by the cells of a grid over them, so a point is looked for among a few. */
function gridOf(x: Float64Array, y: Float64Array, triangles: Uint32Array) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < x.length; i++) {
    x0 = Math.min(x0, x[i])
    y0 = Math.min(y0, y[i])
    x1 = Math.max(x1, x[i])
    y1 = Math.max(y1, y[i])
  }
  const count = triangles.length / 3
  const side = Math.max(1, Math.ceil(Math.sqrt(count / 2)))
  const w = (x1 - x0) / side || 1
  const h = (y1 - y0) / side || 1
  const col = (v: number) => Math.min(side - 1, Math.max(0, Math.floor((v - x0) / w)))
  const row = (v: number) => Math.min(side - 1, Math.max(0, Math.floor((v - y0) / h)))
  const cells: number[][] = Array.from({ length: side * side }, () => [])
  for (let k = 0; k < count; k++) {
    const vs = [triangles[3 * k], triangles[3 * k + 1], triangles[3 * k + 2]]
    const cs = vs.map((v) => col(x[v]))
    const rs = vs.map((v) => row(y[v]))
    for (let r = Math.min(...rs); r <= Math.max(...rs); r++) for (let c = Math.min(...cs); c <= Math.max(...cs); c++) cells[r * side + c].push(k)
  }
  return {
    at(px: number, py: number): number[] {
      if (px < x0 - 1e-9 || px > x1 + 1e-9 || py < y0 - 1e-9 || py > y1 + 1e-9) return []
      return cells[row(py) * side + col(px)]
    },
  }
}
