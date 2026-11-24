import { describe, expect, it } from 'vitest'
import { footprintContour, footprintPolygon } from '../footprint.ts'
import { area, bounds, signedArea } from '../polygon.ts'

describe('footprintPolygon', () => {
  it('builds an unrotated rectangle around its centre', () => {
    const poly = footprintPolygon({ kind: 'rect', center: { x: 100, y: 50 }, width: 120, depth: 60, rotation: 0 })
    expect(area(poly)).toBeCloseTo(7200)
    expect(bounds(poly)).toEqual({ minX: 40, minY: 20, maxX: 160, maxY: 80 })
  })

  it('rotating 90° swaps width and depth on the plan', () => {
    const poly = footprintPolygon({ kind: 'rect', center: { x: 0, y: 0 }, width: 120, depth: 60, rotation: 90 })
    const b = bounds(poly)
    expect(b.maxX - b.minX).toBeCloseTo(60)
    expect(b.maxY - b.minY).toBeCloseTo(120)
    expect(area(poly)).toBeCloseTo(7200) // rotation never changes area
  })

  it('turns a contour (here an L) into a counter-clockwise polygon', () => {
    const l = [
      { x: 0, y: 0, r: 0 },
      { x: 0, y: 100, r: 0 },
      { x: 50, y: 100, r: 0 },
      { x: 50, y: 50, r: 0 },
      { x: 100, y: 50, r: 0 },
      { x: 100, y: 0, r: 0 },
    ] // clockwise on purpose
    const poly = footprintPolygon({ kind: 'contour', contour: { vertices: l } })
    expect(signedArea(poly)).toBeCloseTo(7500)
  })
})

describe('footprintContour', () => {
  it('a rect becomes four sharp corners, starting at its bottom-left; a contour stays as it is', () => {
    const c = footprintContour({ kind: 'rect', center: { x: 50, y: 30 }, width: 100, depth: 60, rotation: 0 })
    expect(c.vertices).toEqual([
      { x: 0, y: 0, r: 0 },
      { x: 100, y: 0, r: 0 },
      { x: 100, y: 60, r: 0 },
      { x: 0, y: 60, r: 0 },
    ])
    const free = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 2 }, { x: 0, y: 10, r: 0 }] }
    expect(footprintContour({ kind: 'contour', contour: free })).toBe(free)
  })
})
