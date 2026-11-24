// Window and crossing selection, pure (Decision "Multi-selection").
import { describe, expect, it } from 'vitest'
import { isCrossing, massesInBox, picks, picksLine, pointInBox } from '../windowSelect.ts'

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]

describe('window and crossing', () => {
  it('left to right is a window: only what is fully inside', () => {
    const box = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }
    expect(isCrossing(box)).toBe(false)
    expect(picks(square(2, 2, 3), box)).toBe(true)
    expect(picks(square(8, 8, 5), box)).toBe(false)
  })

  it('right to left is a crossing: what it touches, crosses or lies under', () => {
    const box = { a: { x: 10, y: 10 }, b: { x: 0, y: 0 } }
    expect(isCrossing(box)).toBe(true)
    expect(picks(square(8, 8, 5), box)).toBe(true) // a corner inside
    expect(picks(square(-5, 4, 20), box)).toBe(true) // edges cross, no corner inside either way
    expect(picks(square(-50, -50, 100), box)).toBe(true) // the box inside the mass
    expect(picks(square(20, 20, 5), box)).toBe(false)
  })

  it('massesInBox returns the ids it picks', () => {
    const masses = [
      { id: 'a', polygon: square(1, 1, 2) },
      { id: 'b', polygon: square(5, 5, 10) },
    ]
    expect(massesInBox(masses, { a: { x: 0, y: 0 }, b: { x: 8, y: 8 } })).toEqual(['a'])
    expect(massesInBox(masses, { a: { x: 8, y: 8 }, b: { x: 0, y: 0 } })).toEqual(['a', 'b'])
  })
})

describe('lines and points', () => {
  const road = [
    { x: 0, y: 5 },
    { x: 20, y: 5 },
  ]
  it('a window picks a line only when all of it is inside', () => {
    expect(picksLine(road, { a: { x: -1, y: 0 }, b: { x: 25, y: 10 } })).toBe(true)
    expect(picksLine(road, { a: { x: -1, y: 0 }, b: { x: 10, y: 10 } })).toBe(false)
  })

  it('a crossing picks a line it only touches', () => {
    // over one end: a window does not pick it, the crossing does
    expect(picksLine(road, { a: { x: -1, y: 0 }, b: { x: 3, y: 10 } })).toBe(false)
    expect(picksLine(road, { a: { x: 3, y: 10 }, b: { x: -1, y: 0 } })).toBe(true)
    // across its middle, no end inside
    expect(picksLine(road, { a: { x: 12, y: 10 }, b: { x: 8, y: 0 } })).toBe(true)
    expect(picksLine(road, { a: { x: 12, y: 20 }, b: { x: 8, y: 10 } })).toBe(false)
  })

  it('pointInBox is the box, edges included', () => {
    const box = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }
    expect(pointInBox({ x: 10, y: 5 }, box)).toBe(true)
    expect(pointInBox({ x: 11, y: 5 }, box)).toBe(false)
  })
})
