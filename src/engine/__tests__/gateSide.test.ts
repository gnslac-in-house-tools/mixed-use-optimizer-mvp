// Where + Gate puts a gate (Phase PE.2, task 7): the middle of the boundary side nearest an existing street, else of the longest side.
import { describe, expect, it } from 'vitest'
import { gateSideMiddle } from '../circulation/gates.ts'
import { pointAt } from '../geom/perimeter.ts'

// a rectangle, counter-clockwise: bottom 100 m, right 40, top 100, left 40; the right side is not the longest
const RECT = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 0, y: 40 },
]

describe('gateSideMiddle', () => {
  it('no boundary, or fewer than three corners: nothing', () => {
    expect(gateSideMiddle(null, [])).toBeNull()
    expect(gateSideMiddle(RECT.slice(0, 2), [])).toBeNull()
  })

  it('with no street, the middle of the longest side (the first of equals)', () => {
    const q = pointAt(RECT, gateSideMiddle(RECT, [])!)
    expect(q.x).toBeCloseTo(50, 6)
    expect(q.y).toBeCloseTo(0, 6)
  })

  it('with a street, the middle of the side whose middle is nearest its drawn line', () => {
    const q = pointAt(RECT, gateSideMiddle(RECT, [[{ x: 130, y: 0 }, { x: 130, y: 40 }]])!)
    expect(q.x).toBeCloseTo(100, 6) // the right side, from (100, 0) to (100, 40)
    expect(q.y).toBeCloseTo(20, 6)
    const top = pointAt(RECT, gateSideMiddle(RECT, [[{ x: 0, y: 60 }, { x: 100, y: 60 }]])!)
    expect([top.x, top.y].map(Math.round)).toEqual([50, 40])
  })

  it('the last side (back to the first corner) has its middle too', () => {
    const q = pointAt(RECT, gateSideMiddle(RECT, [[{ x: -20, y: 0 }, { x: -20, y: 40 }]])!)
    expect([q.x, q.y].map(Math.round)).toEqual([0, 20])
  })
})
