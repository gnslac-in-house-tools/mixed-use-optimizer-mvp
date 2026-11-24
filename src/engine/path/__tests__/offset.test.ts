import { describe, expect, it } from 'vitest'
import { centreOf, edgesOf, offsetPath } from '../offset.ts'

describe('offsetPath, centreOf, edgesOf', () => {
  it('mitres a right angle', () => {
    const o = offsetPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [2, 2])
    expect(o[1].x).toBeCloseTo(8)
    expect(o[1].y).toBeCloseTo(2)
  })
  it('mitres a right angle with shifts of its own', () => {
    const o = offsetPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [2, 3])
    expect(o[1].x).toBeCloseTo(7)
    expect(o[1].y).toBeCloseTo(2)
  })
  it('two stretches in line with different shifts meet at the midpoint', () => {
    const o = offsetPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], [2, 4])
    expect(o[1].x).toBeCloseTo(10)
    expect(o[1].y).toBeCloseTo(3)
  })
  it('centreOf a {0,8} stretch lies 4 m to the right; edgesOf {4,4} 4 m out each hand', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    expect(centreOf({ points: pts, stretches: [{ left: 0, right: 8 }] })[0].y).toBeCloseTo(-4)
    const e = edgesOf({ points: pts, stretches: [{ left: 4, right: 4 }] })
    expect(e.left[0].y).toBeCloseTo(4)
    expect(e.right[0].y).toBeCloseTo(-4)
  })
})
