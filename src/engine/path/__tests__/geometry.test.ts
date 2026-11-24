import { describe, expect, it } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { regionsArea } from '../../geom/boolean.ts'
import { joinedPaving, joinEnds, type JoinRun } from '../join.ts'
import { offsetLine } from '../offset.ts'
import { cornerRadii } from '../round.ts'
import { stretchStrip } from '../strip.ts'

const P = (x: number, y: number): Point => ({ x, y })
const run = (drawn: Point[], left: number, right: number, ends: [string | null, string | null]): JoinRun => ({
  drawn,
  line: offsetLine(drawn, (left - right) / 2),
  left,
  right,
  ends,
})

describe('joinEnds', () => {
  it('two runs drawn by their left edge, meeting at 90 degrees: both ends go to the mitre', () => {
    const a = run([P(0, 0), P(50, 0)], 0, 8, ['a0', 'n'])
    const b = run([P(50, 0), P(50, 50)], 0, 8, ['n', 'b1'])
    const [la, lb] = joinEnds([a, b])
    // a's centre line is 4 below its drawn line, b's 4 to its right: they cross at (54, -4)
    expect(la[1].x).toBeCloseTo(54)
    expect(la[1].y).toBeCloseTo(-4)
    expect(lb[0]).toEqual(la[1])
  })

  it('a switch of side in line: each end runs on half its width past the node', () => {
    const a = run([P(0, 0), P(50, 0)], 0, 8, ['a0', 'n'])
    const b = run([P(50, 0), P(100, 0)], 8, 0, ['n', 'b1'])
    const [la, lb] = joinEnds([a, b])
    expect(la[1].x).toBeCloseTo(54)
    expect(lb[0].x).toBeCloseTo(46)
  })

  it('equal sides, in line: untouched', () => {
    const a = run([P(0, 0), P(50, 0)], 4, 4, ['a0', 'n'])
    const b = run([P(50, 0), P(100, 0)], 4, 4, ['n', 'b1'])
    const [la, lb] = joinEnds([a, b])
    expect(la).toBe(a.line)
    expect(lb).toBe(b.line)
  })

  it('a node of three ends joins nothing', () => {
    const rs = [run([P(0, 0), P(50, 0)], 0, 8, [null, 'n']), run([P(50, 0), P(50, 50)], 0, 8, ['n', null]), run([P(50, 0), P(50, -50)], 8, 0, ['n', null])]
    expect(joinEnds(rs).map((l, i) => l === rs[i].line)).toEqual([true, true, true])
  })
})

describe('cornerRadii', () => {
  const drawn = [P(0, 0), P(50, 0), P(50, 50), P(100, 50)]
  it('the drawn edge on the inside of a turn keeps half the width; the others the radius', () => {
    expect(cornerRadii(drawn, 0, 8, 15)).toEqual([15, 4, 15, 15])
    expect(cornerRadii(drawn, 8, 0, 15)).toEqual([15, 15, 4, 15])
  })
  it('paving on both sides: the radius everywhere', () => {
    expect(cornerRadii(drawn, 4, 4, 15)).toBe(15)
    expect(cornerRadii(drawn, 2, 6, 15)).toBe(15)
  })
})

describe('stretchStrip', () => {
  it('left and right of the drawn line', () => {
    const q = stretchStrip(P(0, 0), P(10, 0), 1, 3)!
    const ys = q.map((p) => p.y)
    expect(Math.max(...ys)).toBeCloseTo(1)
    expect(Math.min(...ys)).toBeCloseTo(-3)
  })
  it('null for a stretch of no length', () => expect(stretchStrip(P(1, 1), P(1, 1), 2, 2)).toBeNull())
})

describe('joinedPaving', () => {
  const strip = (r: { points: Point[]; width: number }) => r.width * Math.hypot(r.points[1].x - r.points[0].x, r.points[1].y - r.points[0].y)
  it('an L of two roads ending at one node has no notch', () => {
    const a = { points: [P(0, 0), P(50, 0)], width: 10 }
    const b = { points: [P(50, 0), P(50, 50)], width: 10 }
    const area = regionsArea(joinedPaving([a, b]))
    // the two strips overlap in a 5 x 5 corner; the closing fills the outer 5 x 5 corner: a full 10 x 10 corner
    expect(area).toBeGreaterThan(strip(a) + strip(b) - 25 + 24)
    expect(joinedPaving([a, b])).toHaveLength(1)
  })
  it('a road ending 0.3 m short of another road runs on to it: one region', () => {
    const main = { points: [P(-50, 0), P(50, 0)], width: 10 }
    const short = { points: [P(0, 5.3), P(0, 40)], width: 8 }
    expect(joinedPaving([main, short])).toHaveLength(1)
  })
  it('a hole under 1 m² goes, a bigger one stays', () => {
    const holeOf = (s: number) => {
      // four areas around the hole make a frame (a hole of s x s)
      const frame = [
        [P(-20, -20), P(60, -20), P(60, 0), P(-20, 0)],
        [P(-20, s), P(60, s), P(60, 60), P(-20, 60)],
        [P(-20, 0), P(0, 0), P(0, s), P(-20, s)],
        [P(s, 0), P(60, 0), P(60, s), P(s, s)],
      ]
      return joinedPaving([], { areas: frame })
    }
    expect(holeOf(0.7).every((r) => r.length === 1)).toBe(true)
    expect(holeOf(3).some((r) => r.length === 2)).toBe(true)
  })
})
