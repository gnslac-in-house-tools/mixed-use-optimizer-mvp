// The ground carried to the site's boundary (Decision "Ground to the boundary"; the user, 2026-11-05: a civil drawing
// whose contours cover part of the parcel left the rest with no ground, drawn flat at the mean height). Where the
// boundary runs beyond the surveyed ground, points along it at the height of the nearest ground surveyed: the surface
// then reaches the whole site, held level past the survey. Schematic, as the ground is: good enough to compare
// options, not a survey. Made when a file is imported (`Terrain.edge`), apart from the surveyed points. Pure.
import type { GroundPoint, Point, Terrain } from '../../../model/schema.ts'
import { surfaceOf } from './surface.ts'

/** How far apart the points along the boundary are (m). */
export const EDGE_STEP = 10

/** The boundary's corners and points between them, no further apart than `step`. */
function along(ring: Point[], step: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return out
}

/**
 * The points of the boundary beyond the ground surveyed, each at the height of the nearest point of the surface
 * (its own edge pieces left out); none when the ground covers the boundary or there is no surface.
 */
export function edgeOf(t: Terrain, boundary: Point[], step = EDGE_STEP): GroundPoint[] {
  const { edge: _e, ...surveyed } = t
  const s = surfaceOf(surveyed)
  if (!s || boundary.length < 3) return []
  const out: GroundPoint[] = []
  for (const p of along(boundary, step)) {
    if (s.elevation(p) !== null) continue
    let best = Infinity
    let z = 0
    for (let i = 0; i < s.x.length; i++) {
      const d = (s.x[i] - p.x) ** 2 + (s.y[i] - p.y) ** 2
      if (d < best) {
        best = d
        z = s.z[i]
      }
    }
    out.push({ x: p.x, y: p.y, z })
  }
  return out
}

/** The terrain with its edge to this boundary (made again; absent when the ground covers it). */
export function withEdge(t: Terrain, boundary: Point[]): Terrain {
  const { edge: _e, ...rest } = t
  const edge = edgeOf(rest, boundary)
  return edge.length ? { ...rest, edge } : rest
}
