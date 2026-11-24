// The contours as samples (Decision "Terrain"): each contour walked and cut so no stretch is longer than the spacing,
// each sample with its contour and the way the contour runs there. A closed contour is walked counter-clockwise, so
// its left is its inside. The surface triangulates the samples; the count of heights reads from a triangulation of
// the same samples which contours are neighbours, and on which side.
import type { Terrain } from '../../../model/schema.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'

export interface Samples {
  x: Float64Array
  y: Float64Array
  /** Its contour's index; -1: a point of the ground. */
  contour: Int32Array
  /** The way its contour runs there (a unit vector; 0, 0 for a point of the ground). */
  tx: Float64Array
  ty: Float64Array
  /** A point of the ground's index in `Terrain.points` (-1 for a contour's sample). */
  point: Int32Array
}

/** The most samples the contours give: a bigger file is sampled more coarsely. */
const MOST = 60_000
/** The finest spacing (m). */
const FINEST = 1

const lengthOf = (pts: { x: number; y: number }[], closed: boolean) => {
  let sum = 0
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

/** The spacing that keeps the samples under MOST, never under FINEST. */
export function spacingFor(t: Terrain): number {
  const total = t.contours.reduce((s, c) => s + lengthOf(c.points, !!c.closed), 0)
  return Math.max(FINEST, total / MOST)
}

/** The samples of the contours (those `use` keeps; all by default), then the points of the ground. */
export function samplesOf(t: Terrain, use: (contour: number) => boolean = () => true, spacing = spacingFor(t)): Samples {
  const xs: number[] = []
  const ys: number[] = []
  const cs: number[] = []
  const txs: number[] = []
  const tys: number[] = []
  t.contours.forEach((c, k) => {
    if (!use(k)) return
    const closed = !!c.closed && c.points.length > 2
    const pts = closed && signedArea(c.points) < 0 ? [...c.points].reverse() : c.points
    const n = closed ? pts.length : pts.length - 1
    let last: { x: number; y: number } | null = null
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-9) continue
      const steps = Math.ceil(len / spacing)
      for (let j = 0; j < steps; j++) {
        xs.push(a.x + ((b.x - a.x) * j) / steps)
        ys.push(a.y + ((b.y - a.y) * j) / steps)
        cs.push(k)
        txs.push((b.x - a.x) / len)
        tys.push((b.y - a.y) / len)
      }
      last = b
    }
    // an open contour's last point, running as its last stretch
    if (!closed && last) {
      xs.push(last.x)
      ys.push(last.y)
      cs.push(k)
      txs.push(txs.at(-1)!)
      tys.push(tys.at(-1)!)
    }
  })
  const fromContours = xs.length
  for (const p of t.points) {
    xs.push(p.x)
    ys.push(p.y)
    cs.push(-1)
    txs.push(0)
    tys.push(0)
  }
  const point = new Int32Array(xs.length).fill(-1)
  for (let i = fromContours; i < xs.length; i++) point[i] = i - fromContours
  return {
    x: Float64Array.from(xs),
    y: Float64Array.from(ys),
    contour: Int32Array.from(cs),
    tx: Float64Array.from(txs),
    ty: Float64Array.from(tys),
    point,
  }
}
