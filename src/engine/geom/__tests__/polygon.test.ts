import { describe, expect, it } from 'vitest'
import { area, bounds, centroid, pointInPolygon, signedArea, toCounterClockwise } from '../polygon.ts'

// 100 × 50 m rectangle, counter-clockwise.
const rect = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
]

// L shape: a 100 × 100 square minus its 50 × 50 top-right corner → 7,500 m².
const lShape = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 100 },
]

describe('polygon', () => {
  it('measures area regardless of orientation', () => {
    expect(area(rect)).toBe(5000)
    expect(signedArea(rect)).toBe(5000)
    expect(signedArea([...rect].reverse())).toBe(-5000)
    expect(area(lShape)).toBe(7500)
  })

  it('flips clockwise polygons to counter-clockwise', () => {
    expect(signedArea(toCounterClockwise([...rect].reverse()))).toBeGreaterThan(0)
  })

  it('finds the centroid of the area', () => {
    expect(centroid(rect)).toEqual({ x: 50, y: 25 })
    // L shape: pulled towards the bottom-left, where there is more area.
    const c = centroid(lShape)
    expect(c.x).toBeCloseTo(41.667, 3)
    expect(c.y).toBeCloseTo(41.667, 3)
  })

  it('computes the bounding box', () => {
    expect(bounds(lShape)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })

  it('tests points inside and outside', () => {
    expect(pointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true)
    expect(pointInPolygon({ x: 75, y: 75 }, lShape)).toBe(false) // the missing corner
    expect(pointInPolygon({ x: 150, y: 25 }, lShape)).toBe(false)
  })
})
