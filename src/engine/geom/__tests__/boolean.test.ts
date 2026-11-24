import { describe, expect, it } from 'vitest'
import type { Polygon } from '../../../model/schema.ts'
import { difference, intersection, offset, regionsArea, union, unionPieces } from '../boolean.ts'
import { bounds } from '../polygon.ts'

const square = (x: number, y: number, s: number): Polygon => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]

describe('boolean', () => {
  // Two 10 × 10 squares, the second shifted 5 m right and 5 m up: they share a 5 × 5 corner.
  const a = square(0, 0, 10)
  const b = square(5, 5, 10)

  it('intersection, difference and union areas', () => {
    expect(regionsArea(intersection([a], [b]))).toBeCloseTo(25)
    expect(regionsArea(difference([a], [b]))).toBeCloseTo(75)
    expect(regionsArea(union([a, b], []))).toBeCloseTo(175)
  })

  it('unionPieces: every piece an outer ring, so one inside another is no hole', () => {
    const nested = [square(0, 0, 10), square(4, 4, 2)]
    const one = unionPieces(nested)
    expect(one).toHaveLength(1)
    expect(one[0]).toHaveLength(1)
    expect(regionsArea(one)).toBeCloseTo(100)
    // what `union` does with the same rings: nesting reads the small one as a hole
    expect(regionsArea(union(nested, []))).toBeCloseTo(96)
    // a clockwise piece is turned, not subtracted
    expect(regionsArea(unionPieces([square(0, 0, 10), square(4, 4, 2).reverse()]))).toBeCloseTo(100)
    const overlapping = unionPieces([a, b])
    expect(overlapping).toHaveLength(1)
    expect(regionsArea(overlapping)).toBeCloseTo(175)
    expect(unionPieces([])).toEqual([])
  })

  it('unionPieces keeps no straight-through vertex: two squares side by side are a rectangle of four corners', () => {
    // a vertex where the outline runs straight on would shorten the edges a curb return is cut to (fillet.ts)
    const [[ring]] = unionPieces([square(0, 0, 10), square(10, 0, 10), square(5, 10, 5)])
    expect(ring).toHaveLength(8)
    const [[rect]] = unionPieces([square(0, 0, 10), square(10, 0, 10)])
    expect(rect).toHaveLength(4)
  })

  it('squares that only touch have no intersection area', () => {
    expect(regionsArea(intersection([a], [square(10, 0, 10)]))).toBeCloseTo(0)
  })

  it('offsets inwards and outwards', () => {
    const rect: Polygon = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: 40 },
    ]
    const inner = offset([rect], -1)
    expect(regionsArea(inner)).toBeCloseTo(58 * 38)
    expect(bounds(inner[0][0])).toEqual({ minX: 1, minY: 1, maxX: 59, maxY: 39 })
    expect(regionsArea(offset([rect], 2))).toBeCloseTo(64 * 44) // mitred corners
  })

  it('an inset bigger than half the shape makes it vanish (no flipped ghost)', () => {
    expect(offset([square(0, 0, 10)], -6)).toEqual([])
  })

  it('insets an L shape, rounding the concave corner like a true distance rule', () => {
    // Two arms: 80 × 30 + 30 × 80 − 30 × 30 = 3,900 m². Plus, at the concave corner (50,50), the points of the
    // 10 × 10 square [40,50]² that are ≥ 10 m from that corner: 100 − π·10²/4 ≈ 21.46 m² (a quarter-circle fillet).
    const l: Polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 100 },
    ]
    // The fillet is a 32-gon circumscribing the circle, so it cuts a hair more: within 0.5 m².
    expect(Math.abs(regionsArea(offset([l], -10)) - (3900 + 100 - 25 * Math.PI))).toBeLessThan(0.5)
  })

  it('a site with a narrow neck splits into two buildable pieces', () => {
    // Two 50 × 50 squares joined by a 10 m wide neck; a 10 m setback closes the neck.
    const dumbbell: Polygon = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 20 },
      { x: 70, y: 20 },
      { x: 70, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 50 },
      { x: 70, y: 50 },
      { x: 70, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ]
    expect(offset([dumbbell], -10)).toHaveLength(2)
  })
})
