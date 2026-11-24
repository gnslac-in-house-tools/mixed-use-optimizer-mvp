// A drawn outline as a footprint: what the Mass tool closes on the plan and what an agent gives point by point
// (`addMassFromPoints`, `setMassOutline`). Pure, so the plan and the MCP make the same shape from the same points.
import type { Footprint, Point } from '../../model/schema.ts'
import { contourFromPolygon } from './contour.ts'
import { MIN_RECT_SIDE } from './edit.ts'
import { area, isSimple } from './polygon.ts'

/** An axis-aligned rectangle from two corners as a `rect` footprint; null if a side is under 1 m. */
export function rectFootprint(a: Point, b: Point): Footprint | null {
  const width = Math.abs(b.x - a.x)
  const depth = Math.abs(b.y - a.y)
  if (width < MIN_RECT_SIDE || depth < MIN_RECT_SIDE) return null
  return { kind: 'rect', center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width, depth, rotation: 0 }
}

/** A closed polygon as a footprint: an axis-aligned rectangle stays a `rect`; null when it encloses nothing. */
export function polygonFootprint(points: Point[]): Footprint | 'crossing' | null {
  if (points.length < 3) return null
  if (!isSimple(points)) return 'crossing'
  if (area(points) < 1e-6) return null
  const xs = points.map((q) => q.x)
  const ys = points.map((q) => q.y)
  const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  if (points.length === 4 && Math.abs(box - area(points)) < 1e-6)
    return rectFootprint({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) })
  return { kind: 'contour', contour: contourFromPolygon(points) }
}
