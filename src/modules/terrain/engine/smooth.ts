// The ground smoothed (Decision "Terrain smoothing"): a triangulation through contours has flat triangles where a
// contour bends (all three corners on one contour), so the ground steps there, terraces a contour wide. Smoothed (the
// default, `Terrain.smoothing`), the ground keeps every sample at its height and gains points inside the flat
// triangles (each one's middle and its chords' middles), on the plane that best fits the ground round them (Gaussian weights, about half the way from one
// contour to the next), never more than one interval off the flat triangle's height and on the side the ground goes
// beyond its sides (the ground between two contours stays between them). The flat top of a hill or the bottom of a pit (inside a closed contour with no other inside) is
// left flat: nothing says how high or deep it goes; so is a flat triangle on the ground's edge. Rounding the contours instead was tried on a surveyor's file and
// left more flat triangles (9.7 % → 11.6 %): see the Decision. Points alone (a TIN) have no terraces. Pure.
import type { Terrain, TerrainSmoothing } from '../../../model/schema.ts'
import type { Point } from '../../../model/schema.ts'
import { pointInPolygon } from '../../../engine/geom/polygon.ts'

/** How the ground is smoothed: absent, smoothed. */
export const smoothingOf = (t: Pick<Terrain, 'smoothing'>): TerrainSmoothing => t.smoothing ?? 'surface'

/** About how many nodes the smoothing grid has over the ground's bounds. */
const NODES = 60_000
/** The widest the Gaussian may be (m). */
const WIDEST = 30

/** What the smoothing needs of the raw ground: its samples, its triangles and its height anywhere. */
interface Ground {
  x: Float64Array
  y: Float64Array
  z: Float64Array
  triangles: Uint32Array
  halfedges: Int32Array
  elevation(p: Point): number | null
  slope(p: Point): number | null
}

/** The closed contours with no other contour's sample inside: a hill's top or a pit's bottom, left flat. */
function innermost(t: Terrain, contourOf: Int32Array, x: Float64Array, y: Float64Array): Set<number> {
  const out = new Set<number>()
  t.contours.forEach((c, k) => {
    if (!c.closed || c.points.length < 3) return
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of c.points) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    for (let i = 0; i < x.length; i++) {
      if (contourOf[i] === k || x[i] < x0 || x[i] > x1 || y[i] < y0 || y[i] > y1) continue
      if (pointInPolygon({ x: x[i], y: y[i] }, c.points)) return
    }
    out.add(k)
  })
  return out
}

/**
 * The raw ground's samples and, inside its flat triangles, points of the smoothed ground (a local plane fit read on a
 * grid, kept within one interval of the triangle's height). `contourOf`: each sample's contour (-1: a point). Null when
 * there is nothing to smooth (no interval, no slope, no flat triangle).
 */
export function smoothedPoints(t: Terrain, g: Ground, contourOf: Int32Array, interval: number | null): { x: Float64Array; y: Float64Array; z: Float64Array } | null {
  if (!interval || interval <= 0) return null
  const tops = innermost(t, contourOf, g.x, g.y)
  // the flat triangles, by the cells of the grid they cover
  const count = g.triangles.length / 3
  const flat = new Uint8Array(count)
  let any = false
  for (let k = 0; k < count; k++) {
    const a = g.triangles[3 * k]
    const b = g.triangles[3 * k + 1]
    const c = g.triangles[3 * k + 2]
    const ca = contourOf[a]
    if (ca < 0 || contourOf[b] !== ca || contourOf[c] !== ca) continue
    // a triangle on the ground's edge has ground on one side only: nothing to fit it to
    if (g.halfedges[3 * k] < 0 || g.halfedges[3 * k + 1] < 0 || g.halfedges[3 * k + 2] < 0) continue
    if (tops.has(ca) && pointInPolygon({ x: (g.x[a] + g.x[b] + g.x[c]) / 3, y: (g.y[a] + g.y[b] + g.y[c]) / 3 }, t.contours[ca].points)) continue
    flat[k] = 1
    any = true
  }
  if (!any) return null

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < g.x.length; i++) {
    x0 = Math.min(x0, g.x[i])
    y0 = Math.min(y0, g.y[i])
    x1 = Math.max(x1, g.x[i])
    y1 = Math.max(y1, g.y[i])
  }
  const h = Math.max(0.5, Math.sqrt(((x1 - x0) * (y1 - y0)) / NODES))
  const cols = Math.floor((x1 - x0) / h) + 1
  const rows = Math.floor((y1 - y0) / h) + 1
  const n = cols * rows
  const mask = new Float64Array(n)
  const zm = new Float64Array(n)
  const slopes: number[] = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const p = { x: x0 + i * h, y: y0 + j * h }
      const z = g.elevation(p)
      if (z === null) continue
      const k = j * cols + i
      mask[k] = 1
      zm[k] = z
      if ((i + j) % 3 === 0) {
        const s = g.slope(p)
        if (s !== null && s > 1e-3) slopes.push(s)
      }
    }
  if (slopes.length === 0) return null
  slopes.sort((a, b) => a - b)
  const spacing = interval / slopes[Math.floor(slopes.length / 2)]
  const sigma = Math.min(WIDEST, Math.max(h, spacing / 2))
  const reach = Math.max(1, Math.ceil((2.5 * sigma) / h))


  // what is added: each flat triangle's middle and the middle of each of its chords (a side between two samples of its
  // contour that are not next to each other along it: the side that cuts across a bend)
  const ends = new Map<number, [number, number]>()
  for (let i = 0; i < contourOf.length; i++) {
    const c = contourOf[i]
    if (c < 0) continue
    const e = ends.get(c)
    if (e) e[1] = i
    else ends.set(c, [i, i])
  }
  const chord = (a: number, b: number) => {
    if (Math.abs(a - b) <= 1) return false
    const e = ends.get(contourOf[a])!
    return !(t.contours[contourOf[a]].closed && Math.min(a, b) === e[0] && Math.max(a, b) === e[1])
  }
  /**
   * Which way the ground goes from flat triangle `k`: the corners across its sides (through flat triangles beside it,
   * a few at most) above its height (1), below (-1), both or none known (0).
   */
  const way = (k: number): number => {
    const level = g.z[g.triangles[3 * k]]
    let up = false
    let down = false
    const seen = new Set([k])
    const todo = [k]
    while (todo.length && seen.size < 24) {
      const at = todo.shift()!
      for (let s = 0; s < 3; s++) {
        const twin = g.halfedges[3 * at + s]
        if (twin < 0) continue
        const next = Math.floor(twin / 3)
        if (seen.has(next)) continue
        seen.add(next)
        if (flat[next]) {
          todo.push(next)
          continue
        }
        const z = g.z[g.triangles[3 * next + ((twin % 3) + 2) % 3]]
        if (z > level + 1e-9) up = true
        else if (z < level - 1e-9) down = true
      }
    }
    return up === down ? 0 : up ? 1 : -1
  }
  const added: { x: number; y: number; level: number; way: number }[] = []
  const seen = new Set<string>()
  for (let k = 0; k < count; k++) {
    if (!flat[k]) continue
    const v = [g.triangles[3 * k], g.triangles[3 * k + 1], g.triangles[3 * k + 2]]
    const level = g.z[v[0]]
    const w = way(k)
    added.push({ x: (g.x[v[0]] + g.x[v[1]] + g.x[v[2]]) / 3, y: (g.y[v[0]] + g.y[v[1]] + g.y[v[2]]) / 3, level, way: w })
    for (let s = 0; s < 3; s++) {
      const a = v[s]
      const b = v[(s + 1) % 3]
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`
      if (!chord(a, b) || seen.has(key)) continue
      seen.add(key)
      added.push({ x: (g.x[a] + g.x[b]) / 2, y: (g.y[a] + g.y[b]) / 2, level, way: w })
    }
  }

  // the fit is needed at the grid's nodes round each added point (bilinear between four)
  const col = (x: number) => Math.min(cols - 2, Math.max(0, Math.floor((x - x0) / h)))
  const row = (y: number) => Math.min(rows - 2, Math.max(0, Math.floor((y - y0) / h)))
  const want = new Uint8Array(n)
  const rowsNeeded = new Uint8Array(n)
  for (const q of added) {
    const i = col(q.x)
    const j = row(q.y)
    for (const c of [j * cols + i, j * cols + i + 1, (j + 1) * cols + i, (j + 1) * cols + i + 1]) {
      if (c >= n || want[c]) continue
      want[c] = 1
      const ci = c % cols
      const cj = Math.floor(c / cols)
      for (let b = Math.max(0, cj - reach); b <= Math.min(rows - 1, cj + reach); b++) rowsNeeded[b * cols + ci] = 1
    }
  }

  // the Gaussian's weights times d, d² (d in cells: the fit's value at d = 0 is the same in any unit)
  const k0 = new Float64Array(2 * reach + 1)
  const k1 = new Float64Array(2 * reach + 1)
  const k2 = new Float64Array(2 * reach + 1)
  for (let d = -reach; d <= reach; d++) {
    const w = Math.exp(-((d * h) ** 2) / (2 * sigma * sigma))
    k0[d + reach] = w
    k1[d + reach] = w * d
    k2[d + reach] = w * d * d
  }
  /** `f` weighed by kernel `k` along x (dx 1) or y (dy 1), only where `keep` says. */
  const along = (f: Float64Array, k: Float64Array, dx: number, dy: number, keep: Uint8Array) => {
    const out = new Float64Array(n)
    for (let c = 0; c < n; c++) {
      if (!keep[c]) continue
      const i = c % cols
      const j = Math.floor(c / cols)
      let s = 0
      for (let d = -reach; d <= reach; d++) {
        const a = i + d * dx
        const b = j + d * dy
        if (a < 0 || b < 0 || a >= cols || b >= rows) continue
        s += k[d + reach] * f[b * cols + a]
      }
      out[c] = s
    }
    return out
  }
  const ks = [k0, k1, k2]
  const xs = ks.map((k) => along(mask, k, 1, 0, rowsNeeded))
  const zx = ks.slice(0, 2).map((k) => along(zm, k, 1, 0, rowsNeeded))
  // the moments of the weights (a: in x, b: in y) and of the heights
  const S = (a: number, b: number) => along(xs[a], ks[b], 0, 1, want)
  const [s00, s10, s01, s20, s11, s02] = [S(0, 0), S(1, 0), S(0, 1), S(2, 0), S(1, 1), S(0, 2)]
  const t00 = along(zx[0], k0, 0, 1, want)
  const t10 = along(zx[1], k0, 0, 1, want)
  const t01 = along(zx[0], k1, 0, 1, want)
  /** The plane c + gx·dx + gy·dy that fits the weighted ground round node `c` best: its c, by Cramer's rule. */
  const fitAt = (c: number): number | null => {
    const a = s00[c]
    if (!mask[c] || a <= 0) return null
    const b = s10[c]
    const e = s01[c]
    const d = s20[c]
    const m = s11[c]
    const f = s02[c]
    const det = a * (d * f - m * m) - b * (b * f - m * e) + e * (b * m - d * e)
    return Math.abs(det) > 1e-9 * a * a * a ? (t00[c] * (d * f - m * m) - b * (t10[c] * f - m * t01[c]) + e * (t10[c] * m - d * t01[c])) / det : t00[c] / a
  }

  const px: number[] = Array.from(g.x)
  const py: number[] = Array.from(g.y)
  const pz: number[] = Array.from(g.z)
  for (const q of added) {
    const i = col(q.x)
    const j = row(q.y)
    const u = Math.min(1, Math.max(0, (q.x - x0) / h - i))
    const w = Math.min(1, Math.max(0, (q.y - y0) / h - j))
    let sum = 0
    let weight = 0
    for (const [c, cw] of [
      [j * cols + i, (1 - u) * (1 - w)],
      [j * cols + i + 1, u * (1 - w)],
      [(j + 1) * cols + i, (1 - u) * w],
      [(j + 1) * cols + i + 1, u * w],
    ] as const) {
      const z = c < n ? fitAt(c) : null
      if (z === null || cw <= 0) continue
      sum += cw * z
      weight += cw
    }
    if (weight <= 0) continue
    px.push(q.x)
    py.push(q.y)
    // within an interval of its height, on the side the ground goes
    pz.push(Math.min(q.level + (q.way < 0 ? 0 : interval), Math.max(q.level - (q.way > 0 ? 0 : interval), sum / weight)))
  }
  return { x: Float64Array.from(px), y: Float64Array.from(py), z: Float64Array.from(pz) }
}
