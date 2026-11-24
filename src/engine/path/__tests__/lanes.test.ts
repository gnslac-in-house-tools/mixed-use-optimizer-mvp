import { describe, expect, it } from 'vitest'
import { LANE_WIDTH, laneLines, lanesOf, MIN_LANE, pulledLanes } from '../lanes.ts'

describe('lanesOf', () => {
  it('shows equal lanes from the width when none are stored', () => {
    expect(lanesOf({ left: 0, right: 7 })).toEqual([3.5, 3.5])
    expect(lanesOf({ left: 4, right: 4 })).toEqual([4, 4])
    expect(lanesOf({ left: 0, right: 0.5 })).toEqual([0.5])
  })
  it('gives the stored lanes when they add up to the width', () => {
    expect(lanesOf({ left: 0, right: 10.5, lanes: [3, 3.5, 4] })).toEqual([3, 3.5, 4])
    expect(lanesOf({ left: 0, right: 10.5, lanes: [3, 3.5, 4.0004] })).toEqual([3, 3.5, 4.0004])
  })
  it('falls back to the equal ones when the stored lanes are off by 2 mm', () => {
    expect(lanesOf({ left: 0, right: 7, lanes: [3.5, 3.502] })).toEqual([3.5, 3.5])
    expect(lanesOf({ left: 0, right: 7, lanes: [] })).toEqual([3.5, 3.5])
    expect(lanesOf({ left: 0, right: 7, lanes: [7, 0, 0] })).toEqual([3.5, 3.5])
  })
  it('counts the lanes with the lane width given', () => {
    // round(7 / 3) = 2
    expect(lanesOf({ left: 0, right: 7 }, 3)).toEqual([3.5, 3.5])
    // round(7 / 2) = 4 (3.5 rounds up)
    expect(lanesOf({ left: 0, right: 7 }, 2)).toEqual([1.75, 1.75, 1.75, 1.75])
  })
  it('names the defaults', () => {
    expect(LANE_WIDTH).toBe(3.5)
    expect(MIN_LANE).toBe(2)
  })
})

describe('laneLines', () => {
  const axis = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
  it('draws the dividers 1.75 m each side of the centre line for 3 lanes of 3.5 m', () => {
    const lines = laneLines(axis, 0, 10.5, [3.5, 3.5, 3.5])
    expect(lines).toHaveLength(2)
    // the first divider is the one nearer the left edge: to the axis' left (+y when walking +x)
    expect(lines[0][0].y).toBeCloseTo(1.75)
    expect(lines[0][1].y).toBeCloseTo(1.75)
    expect(lines[1][0].y).toBeCloseTo(-1.75)
    expect(lines[0][0].x).toBeCloseTo(0)
    expect(lines[0][1].x).toBeCloseTo(100)
  })
  it('puts a divider where the lanes meet, whatever their widths', () => {
    const lines = laneLines(axis, 4, 6.5, [3, 7])
    expect(lines).toHaveLength(1)
    // the width is 10.5: the left edge is 5.25 left of the centre, the divider 3 m in
    expect(lines[0][0].y).toBeCloseTo(2.25)
  })
  it('has none for one lane', () => {
    expect(laneLines(axis, 3, 3, [6])).toEqual([])
  })
})

describe('pulledLanes', () => {
  it('grows the edge lane when an edge goes out', () => {
    expect(pulledLanes([3.5, 3.5, 3.5], 'right', 1)).toEqual({ lanes: [3.5, 3.5, 4.5], gone: false })
    expect(pulledLanes([3.5, 3.5, 3.5], 'left', 2)).toEqual({ lanes: [5.5, 3.5, 3.5], gone: false })
  })
  it('cuts the edge lane when an edge goes in, whole lanes going while the amount lasts', () => {
    const a = pulledLanes([3.5, 3.5, 3.5], 'left', -5)
    expect(a.lanes).toEqual([2, 3.5])
    expect(a.gone).toBe(true)
    const b = pulledLanes([3.5, 3.5, 3.5], 'right', -1)
    expect(b.lanes).toEqual([3.5, 3.5, 2.5])
    expect(b.gone).toBe(false)
  })
  it('merges an edge lane left under 2 m into its neighbour', () => {
    const r = pulledLanes([3.5, 3.5, 3.5], 'right', -2.5)
    expect(r.lanes).toEqual([3.5, 4.5])
    expect(r.gone).toBe(true)
  })
  it('keeps the sum equal to the sum less the cut and leaves its input alone', () => {
    const lanes = [3.5, 3.5, 3.5]
    const r = pulledLanes(lanes, 'left', -4.25)
    expect(r.lanes.reduce((a, b) => a + b, 0)).toBeCloseTo(10.5 - 4.25)
    expect(lanes).toEqual([3.5, 3.5, 3.5])
  })
  it('shrinks a single lane without it going', () => {
    expect(pulledLanes([7], 'right', -3)).toEqual({ lanes: [4], gone: false })
  })
})
