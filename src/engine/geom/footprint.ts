// Footprint → Polygon. After this function, a rectangle and a free contour are the same thing to the engine.
import type { Contour, Footprint, Point, Polygon } from '../../model/schema.ts'
import { contourFromPolygon, contourToPolygon } from './contour.ts'

/** cos and sin of an angle in degrees; exact at multiples of 90° (no 6e-17 noise in the vertices that get saved). */
export function cosSin(degrees: number): [number, number] {
  const q = ((degrees % 360) + 360) % 360
  const exact: Record<number, [number, number]> = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }
  if (exact[q]) return exact[q]
  const r = (degrees * Math.PI) / 180
  return [Math.cos(r), Math.sin(r)]
}

/** Rotate `p` around `origin` by `degrees`, counter-clockwise. */
export function rotate(p: Point, origin: Point, degrees: number): Point {
  const [cos, sin] = cosSin(degrees)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/** The footprint as a counter-clockwise polygon in site coordinates. */
export function footprintPolygon(f: Footprint): Polygon {
  if (f.kind === 'contour') return contourToPolygon(f.contour)

  // Build the rectangle around the origin, then rotate it and move it to its centre.
  const hw = f.width / 2
  const hd = f.depth / 2
  const local: Point[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  const origin = { x: 0, y: 0 }
  return local.map((p) => {
    const q = rotate(p, origin, f.rotation)
    return { x: q.x + f.center.x, y: q.y + f.center.y }
  })
}

/**
 * The footprint as a contour (a rect becomes 4 sharp corners, first one at its local bottom-left). Editing tools and
 * snapping work on contours, so they keep a free footprint's arcs and rounded corners instead of its chords.
 */
export function footprintContour(f: Footprint): Contour {
  return f.kind === 'contour' ? f.contour : contourFromPolygon(footprintPolygon(f))
}
