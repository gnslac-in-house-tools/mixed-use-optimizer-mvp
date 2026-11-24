// The ground over an area (Decision "Terrain"), pure: its mean height, sampled on a grid over the polygon. The 3D lays
// the ground round the site's mean height (E.2c); a platform's balanced level starts from its footprint's (E.3).
import type { Point } from '../../../model/schema.ts'
import { bounds, pointInPolygon } from '../../../engine/geom/polygon.ts'
import type { Surface } from './surface.ts'

/** The mean height of the ground inside `poly`, sampled on a `cells` × `cells` grid; null: no ground there. */
export function meanHeight(s: Surface, poly: Point[], cells = 24): number | null {
  if (poly.length < 3) return null
  const b = bounds(poly)
  const dx = (b.maxX - b.minX) / cells
  const dy = (b.maxY - b.minY) / cells
  let sum = 0
  let n = 0
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const p = { x: b.minX + (i + 0.5) * dx, y: b.minY + (j + 0.5) * dy }
      if (!pointInPolygon(p, poly)) continue
      const z = s.elevation(p)
      if (z === null) continue
      sum += z
      n++
    }
  return n ? sum / n : null
}
