// Window and crossing selection (Decision "Multi-selection"), as in AutoCAD: a drag on empty ground draws a box.
//   left → right   window    selects what is fully inside
//   right → left   crossing  selects what it touches (inside, or crossing an edge)
// Pure: world points in, mass ids out.
import type { Id, Point, Polygon } from '../../model/schema.ts'
import { pointInPolygon } from '../../engine/geom/polygon.ts'

export interface Box {
  /** Where the drag started. */
  a: Point
  /** Where the pointer is. */
  b: Point
}

/** A box dragged right to left selects what it touches. */
export const isCrossing = (box: Box) => box.b.x < box.a.x

function corners({ a, b }: Box) {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return { minX, maxX, minY, maxY }
}

/** Do the segments p–q and r–s cross or touch? */
function segmentsMeet(p: Point, q: Point, r: Point, s: Point): boolean {
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  const d1 = side(r, s, p)
  const d2 = side(r, s, q)
  const d3 = side(p, q, r)
  const d4 = side(p, q, s)
  if (d1 !== d2 && d3 !== d4) return true
  // collinear and overlapping
  const on = (a: Point, b: Point, c: Point) =>
    Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)
  return (d1 === 0 && on(r, s, p)) || (d2 === 0 && on(r, s, q)) || (d3 === 0 && on(p, q, r)) || (d4 === 0 && on(p, q, s))
}

/** Is the polygon picked by the box: fully inside it (window), or touching it (crossing)? */
export function picks(polygon: Polygon, box: Box): boolean {
  if (polygon.length === 0) return false
  const { minX, maxX, minY, maxY } = corners(box)
  const inside = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
  if (!isCrossing(box)) return polygon.every(inside)
  if (polygon.some(inside)) return true
  const rect = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
  // the box inside the polygon (a small box over a big mass)
  if (rect.some((c) => pointInPolygon(c, polygon))) return true
  return polygon.some((p, i) => {
    const q = polygon[(i + 1) % polygon.length]
    return rect.some((r, j) => segmentsMeet(p, q, r, rect[(j + 1) % 4]))
  })
}

/** The masses the box picks, of those given (the active level's). */
export function massesInBox(masses: { id: Id; polygon: Polygon }[], box: Box): Id[] {
  return masses.filter((m) => picks(m.polygon, box)).map((m) => m.id)
}

/** Is the point in the box (its edges included)? */
export function pointInBox(q: Point, box: Box): boolean {
  const { minX, maxX, minY, maxY } = corners(box)
  return q.x >= minX && q.x <= maxX && q.y >= minY && q.y <= maxY
}

/** Is the polyline (a street, a dimension, a gate's point) picked: all of it inside (window), or touched (crossing)? */
export function picksLine(points: Point[], box: Box): boolean {
  if (points.length === 0) return false
  if (!isCrossing(box)) return points.every((p) => pointInBox(p, box))
  if (points.some((p) => pointInBox(p, box))) return true
  const { minX, maxX, minY, maxY } = corners(box)
  const rect = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
  return points.some((p, i) => i + 1 < points.length && rect.some((r, j) => segmentsMeet(p, points[i + 1], r, rect[(j + 1) % 4])))
}
