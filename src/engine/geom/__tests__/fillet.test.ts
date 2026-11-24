// A ring's inside corners near a junction rounded as true arcs (Phase DI.2, `filletRing`): the region on the ring's
// left, a concave corner a right turn; the bulge in DXF's sign (clockwise negative).
import { describe, expect, it } from 'vitest'
import type { Point, Polygon } from '../../../model/schema.ts'
import { filletRing } from '../fillet.ts'

const P = (x: number, y: number): Point => ({ x, y })
const tidy = (qs: Point[]) => qs.map((q) => ({ x: Math.round(q.x * 1e9) / 1e9 + 0, y: Math.round(q.y * 1e9) / 1e9 + 0 }))
const square: Polygon = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]
/** Counter-clockwise; its one concave corner at (10,10). */
const L: Polygon = [P(0, 0), P(20, 0), P(20, 10), P(10, 10), P(10, 20), P(0, 20)]
const quarter = -Math.tan(Math.PI / 8)

describe('filletRing', () => {
  it('a square (every corner convex): its points, every bulge 0', () => {
    expect(filletRing(square, [{ at: P(5, 5), radius: 2, reach: 100 }])).toEqual({ points: square, bulges: [0, 0, 0, 0] })
  })

  it('the L’s concave corner in reach: a quarter arc of the radius, tangent to both edges, clockwise', () => {
    const { points, bulges } = filletRing(L, [{ at: P(10, 10), radius: 2, reach: 1 }])
    expect(tidy(points)).toEqual([P(0, 0), P(20, 0), P(20, 10), P(12, 10), P(10, 12), P(10, 20), P(0, 20)])
    expect(bulges).toHaveLength(7)
    bulges.forEach((b, i) => expect(b).toBeCloseTo(i === 3 ? quarter : 0, 6))
  })

  it('out of reach, or a convex corner in reach: unchanged', () => {
    const none = { points: L, bulges: L.map(() => 0) }
    expect(filletRing(L, [{ at: P(100, 100), radius: 2, reach: 10 }])).toEqual(none)
    expect(filletRing(L, [{ at: P(20, 0), radius: 2, reach: 1 }])).toEqual(none)
    expect(filletRing(L, [])).toEqual(none)
  })

  it('a turn gentler than 5° is no corner', () => {
    // a right turn of 3°, then one of 8°, both in reach
    const t = (deg: number) => P(20 + 10 * Math.cos((-deg * Math.PI) / 180), 10 * Math.sin((-deg * Math.PI) / 180))
    const gentle: Polygon = [P(0, 0), P(10, 0), P(20, 0), t(3), P(30, 20), P(0, 20)]
    expect(filletRing(gentle, [{ at: P(20, 0), radius: 2, reach: 1 }]).bulges.every((b) => b === 0)).toBe(true)
    const sharp: Polygon = [P(0, 0), P(10, 0), P(20, 0), t(8), P(30, 20), P(0, 20)]
    expect(filletRing(sharp, [{ at: P(20, 0), radius: 2, reach: 1 }]).bulges.filter((b) => b !== 0)).toHaveLength(1)
  })

  it('the radius cut to fit: the tangent points at half the shorter edge', () => {
    const short: Polygon = [P(0, 0), P(20, 0), P(20, 10), P(10, 10), P(10, 12), P(0, 12)]
    const { points, bulges } = filletRing(short, [{ at: P(10, 10), radius: 9, reach: 5 }])
    expect(tidy(points)).toEqual([P(0, 0), P(20, 0), P(20, 10), P(11, 10), P(10, 11), P(10, 12), P(0, 12)])
    bulges.forEach((b, i) => expect(b).toBeCloseTo(i === 3 ? quarter : 0, 6))
  })

  it('two corners that each take half of the edge between them share its middle: no zero-length edge', () => {
    // a notch 2 m wide: both inner corners concave, the 2 m edge between them shared
    const notch: Polygon = [P(0, 0), P(20, 0), P(20, 10), P(11, 10), P(11, 5), P(9, 5), P(9, 10), P(0, 10)]
    const { points, bulges } = filletRing(notch, [{ at: P(10, 5), radius: 9, reach: 5 }])
    expect(tidy(points)).toEqual([P(0, 0), P(20, 0), P(20, 10), P(11, 10), P(11, 6), P(10, 5), P(9, 6), P(9, 10), P(0, 10)])
    expect(bulges.map((b) => Math.round(b * 1e6) / 1e6)).toEqual([0, 0, 0, 0, Math.round(quarter * 1e6) / 1e6, Math.round(quarter * 1e6) / 1e6, 0, 0, 0])
  })

  it('a clockwise hole: its corners are the region’s inside corners, all four rounded', () => {
    const hole: Polygon = [P(0, 0), P(0, 10), P(10, 10), P(10, 0)]
    const { points, bulges } = filletRing(hole, [{ at: P(5, 5), radius: 2, reach: 10 }])
    expect(tidy(points)).toEqual([P(2, 0), P(0, 2), P(0, 8), P(2, 10), P(8, 10), P(10, 8), P(10, 2), P(8, 0)])
    bulges.forEach((b, i) => expect(b).toBeCloseTo(i % 2 === 0 ? quarter : 0, 6))
  })

  it('several fillets in reach: the nearest one serves', () => {
    const { points } = filletRing(L, [
      { at: P(13, 13), radius: 4, reach: 10 },
      { at: P(10, 10), radius: 2, reach: 10 },
    ])
    expect(tidy(points).slice(3, 5)).toEqual([P(12, 10), P(10, 12)])
  })
})

describe('filletRing with blockers: the corner it cuts off stays clear of them', () => {
  // the L's notch, x > 10 and y > 10, is where the arc goes: the triangle (10+d, 10), (10, 10), (10, 10+d) holds it
  const at = [{ at: P(10, 10), radius: 3, reach: 1 }]
  const cut = (d: number) => [P(0, 0), P(20, 0), P(20, 10), P(10 + d, 10), P(10, 10 + d), P(10, 20), P(0, 20)]

  it('a blocker’s corner in the notch: the tangent length cut to it (α + β), the arc still a quarter, tangent', () => {
    const { points, bulges } = filletRing(L, at, [[[P(10.5, 11), P(14, 11), P(14, 14), P(10.5, 14)]]])
    expect(tidy(points)).toEqual(tidy(cut(1.5)))
    bulges.forEach((b, i) => expect(b).toBeCloseTo(i === 3 ? quarter : 0, 6))
  })

  it('a blocker’s edge across the corner, none of its corners in it: cut to where the edge meets the curbs', () => {
    // the edge x + y = 22.5 crosses both sides 2.5 m from the corner; its ends lie outside the notch
    const { points } = filletRing(L, at, [[[P(13, 9.5), P(30, 5), P(30, 30), P(5, 30), P(9.5, 13)]]])
    expect(tidy(points)).toEqual(tidy(cut(2.5)))
  })

  it('a stall along a curb, from 2 m off the corner: the return reaches 2 m', () => {
    const { points } = filletRing(L, at, [[[P(12, 10), P(14.5, 10), P(14.5, 15), P(12, 15)]]])
    expect(tidy(points)).toEqual(tidy(cut(2)))
  })

  it('the corner inside a blocker, or a blocker’s corner on it: no fillet', () => {
    const none = { points: L, bulges: L.map(() => 0) }
    expect(filletRing(L, at, [[[P(5, 5), P(15, 5), P(15, 15), P(5, 15)]]])).toEqual(none)
    expect(filletRing(L, at, [[[P(10, 10), P(14, 10), P(14, 14), P(10, 14)]]])).toEqual(none)
  })

  it('a blocker read even-odd: the corner in its hole is clear, cut only by the hole’s own edges', () => {
    const outer = [P(-10, -10), P(40, -10), P(40, 40), P(-10, 40)]
    expect(tidy(filletRing(L, at, [[outer, [P(9, 9), P(16, 9), P(16, 16), P(9, 16)]]]).points)).toEqual(tidy(cut(3)))
    expect(tidy(filletRing(L, at, [[outer, [P(9, 9), P(11, 9), P(11, 11.5), P(9, 11.5)]]]).points)).toEqual(tidy(cut(1)))
  })

  it('blockers away from the corner, or outside the notch: unchanged', () => {
    const free = filletRing(L, at)
    expect(filletRing(L, at, [[[P(30, 30), P(40, 30), P(40, 40)]], [[P(12, 2), P(18, 2), P(18, 8), P(12, 8)]]])).toEqual(free)
  })
})
