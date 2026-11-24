// A segment clipped to a region (Phase DI.1, `clipSegment`): its pieces inside the rings read even-odd, from `a`.
import { describe, expect, it } from 'vitest'
import type { Point, Polygon } from '../../../model/schema.ts'
import { clipSegment } from '../clipSegment.ts'

const square = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const outer = square(0, 0, 10, 10)
const hole = square(4, 4, 6, 6)

const tidy = (pieces: [Point, Point][]) => pieces.map((s) => s.map((q) => ({ x: Math.round(q.x * 1e9) / 1e9 + 0, y: Math.round(q.y * 1e9) / 1e9 + 0 })))

describe('clipSegment', () => {
  it('across a square: the piece inside it', () => {
    expect(tidy(clipSegment({ x: -5, y: 5 }, { x: 15, y: 5 }, [outer]))).toEqual([[{ x: 0, y: 5 }, { x: 10, y: 5 }]])
  })

  it('a hole cuts it in two, its ring in either orientation', () => {
    const two = [[{ x: 0, y: 5 }, { x: 4, y: 5 }], [{ x: 6, y: 5 }, { x: 10, y: 5 }]]
    expect(tidy(clipSegment({ x: -5, y: 5 }, { x: 15, y: 5 }, [outer, hole]))).toEqual(two)
    expect(tidy(clipSegment({ x: -5, y: 5 }, { x: 15, y: 5 }, [outer, hole.slice().reverse()]))).toEqual(two)
    expect(tidy(clipSegment({ x: -5, y: 5 }, { x: 15, y: 5 }, [hole, outer]))).toEqual(two)
  })

  it('wholly inside: itself; wholly outside: nothing', () => {
    const a = { x: 1, y: 1 }
    const b = { x: 3, y: 2 }
    expect(clipSegment(a, b, [outer, hole])).toEqual([[a, b]])
    expect(clipSegment({ x: 11, y: 0 }, { x: 20, y: 9 }, [outer, hole])).toEqual([])
  })

  it('the pieces in order from a', () => {
    expect(tidy(clipSegment({ x: 15, y: 5 }, { x: -5, y: 5 }, [outer, hole]))).toEqual([
      [{ x: 10, y: 5 }, { x: 6, y: 5 }],
      [{ x: 4, y: 5 }, { x: 0, y: 5 }],
    ])
  })

  it('along an edge is on the region, not in it: nothing', () => {
    expect(clipSegment({ x: -5, y: 0 }, { x: 15, y: 0 }, [outer])).toEqual([])
    expect(tidy(clipSegment({ x: 4, y: 2 }, { x: 4, y: 8 }, [outer, hole]))).toEqual([
      [{ x: 4, y: 2 }, { x: 4, y: 4 }],
      [{ x: 4, y: 6 }, { x: 4, y: 8 }],
    ])
  })

  it('through a corner, or touching one, stays one piece', () => {
    // a diagonal through the hole's corners (4, 6) and (6, 4) crosses the hole; one touching its corner (4, 4) does not
    expect(tidy(clipSegment({ x: 2, y: 8 }, { x: 8, y: 2 }, [outer, hole]))).toEqual([
      [{ x: 2, y: 8 }, { x: 4, y: 6 }],
      [{ x: 6, y: 4 }, { x: 8, y: 2 }],
    ])
    expect(tidy(clipSegment({ x: 1, y: 7 }, { x: 7, y: 1 }, [outer, hole]))).toEqual([[{ x: 1, y: 7 }, { x: 7, y: 1 }]])
  })
})
