// The site's own point on the plan (Phase 5): where a pasted location lands and a new map is centred, as in
// Practiko's `centroInicial`: the middle of the boundary's box; without one, of the masses'; else the origin.
import type { Point, Project } from '../../model/schema.ts'
import { contourToPolygon } from '../geom/contour.ts'
import { footprintPolygon } from '../geom/footprint.ts'
import { bounds } from '../geom/polygon.ts'

export function siteCenter(p: Project): Point {
  const pts = p.site.boundary ? contourToPolygon(p.site.boundary) : p.masses.flatMap((m) => footprintPolygon(m.footprint))
  if (pts.length === 0) return { x: 0, y: 0 }
  const b = bounds(pts)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** Half the diagonal of what siteCenter measures, in m (0 when there is nothing): how far a map must reach. */
export function siteReach(p: Project): number {
  const pts = p.site.boundary ? contourToPolygon(p.site.boundary) : p.masses.flatMap((m) => footprintPolygon(m.footprint))
  if (pts.length === 0) return 0
  const b = bounds(pts)
  return Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2
}
