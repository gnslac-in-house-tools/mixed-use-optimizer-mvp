// The convex hull and the minimum-area rectangle (port of Plaza-Practiko `rectangulo.test.ts`).
import { describe, expect, it } from 'vitest'
import { convexHull, minimumRectangle } from '../rectangle.ts'

describe('rectangle', () => {
  it('the convex hull leaves the inner points out', () => {
    const c = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ])
    expect(c).toHaveLength(4)
  })

  it('a 30 × 10 rectangle turned 30° gives length 30, width 10 and u at 30°', () => {
    const a = Math.PI / 6
    const u = { x: Math.cos(a), y: Math.sin(a) }
    const v = { x: -Math.sin(a), y: Math.cos(a) }
    const c0 = { x: 3, y: -2 }
    const pts = [
      [-15, -5],
      [15, -5],
      [15, 5],
      [-15, 5],
    ].map(([s, t]) => ({ x: c0.x + s * u.x + t * v.x, y: c0.y + s * u.y + t * v.y }))
    const r = minimumRectangle(pts)
    expect(r.length).toBeCloseTo(30, 6)
    expect(r.width).toBeCloseTo(10, 6)
    expect(r.u.x).toBeCloseTo(Math.cos(a), 6)
    expect(r.u.y).toBeCloseTo(Math.sin(a), 6)
    expect(r.center.x).toBeCloseTo(3, 6)
    expect(r.center.y).toBeCloseTo(-2, 6)
  })
})
