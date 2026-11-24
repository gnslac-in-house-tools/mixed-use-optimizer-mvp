// The wall's span for a court (Phase D.3, task 4: the plan's *Frame span* decision): the rule on write holds a court's wall side to 0..length of the
// reference line, or to the face's span where the site derives it, one frame in both. See also views/__tests__/courtFrame.test.ts.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../../model/schema.ts'
import { clipToWall, courtRule } from '../courts.ts'

const slab = (x0: number, x1: number, depth = 20): Contour => ({
  vertices: [
    { x: x0, y: 0, r: 0 },
    { x: x1, y: 0, r: 0 },
    { x: x1, y: depth, r: 0 },
    { x: x0, y: depth, r: 0 },
  ],
})
const xs = (c: Contour) => c.vertices.map((v) => v.x)

describe('the rule on write holds the wall side to the wall’s span', () => {
  it('by default the reference line’s: 0 to its length; a side past it is clipped, and said', () => {
    const r = courtRule(slab(-0.3, 36.3), 36)
    expect('contour' in r && r.notes.length).toBe(1)
    expect('contour' in r && [Math.min(...xs(r.contour)), Math.max(...xs(r.contour))]).toEqual([0, 36])
  })

  it('given the face’s span (a wall’s thickness more at each end) the face’s court is whole', () => {
    const c = slab(-0.3, 36.3)
    const r = courtRule(c, 36.3, -0.3)
    expect(r).toEqual({ contour: c, notes: [] })
    // past the face's span it is clipped to it
    const wide = courtRule(slab(-5, 40), 36.3, -0.3)
    expect('contour' in wide && [Math.min(...xs(wide.contour)), Math.max(...xs(wide.contour))]).toEqual([-0.3, 36.3])
  })

  it('clipToWall cuts at the span’s two ends', () => {
    const c = clipToWall(slab(-5, 40), 36.3, false, -0.3)!
    expect(Math.min(...xs(c))).toBeCloseTo(-0.3, 9)
    expect(Math.max(...xs(c))).toBeCloseTo(36.3, 9)
    expect(clipToWall(slab(-5, 40), 36)).not.toBeNull()
  })
})
