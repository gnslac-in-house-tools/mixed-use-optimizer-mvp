// Snap for a dragged wall (a dragged corner: resolve.test.ts).
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { snapWallOffset } from '../handles.ts'
import { DEFAULT_SNAP, type SnapSettings } from '../kinds.ts'
import { targetsOf } from '../move.ts'
import { wallAt } from '../walls.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rectC = (x0: number, y0: number, x1: number, y1: number) => contourFromPolygon([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)])
const settings = (changes: Partial<SnapSettings>): SnapSettings => ({ ...DEFAULT_SNAP, ...changes })
const targets = targetsOf([{ contour: rectC(0, 0, 20, 10), label: 'A', centroid: true }])

describe('snapWallOffset (a dragged wall)', () => {
  // the left wall of a mass at x = 40.3 (it runs downwards: outward normal −x)
  const left = wallAt(rectC(40.3, 0.5, 60, 9.5), 3)

  it('an axis-aligned wall lands ON a grid line (its x), not just moves by whole metres', () => {
    // pulled 5.1 m left: x = 35.2 → 35, so d = 5.3 outwards
    const r = snapWallOffset(left, p(-5.1, 0), [], DEFAULT_SNAP, 0.4)
    expect(r.d).toBeCloseTo(5.3, 9)
    expect(r.mark).toBeNull()
  })

  it("near the line of a parallel wall it lines up with it (A's right wall, x = 20)", () => {
    const r = snapWallOffset(left, p(-20.1, 0), targets.walls, DEFAULT_SNAP, 0.4)
    expect(40.3 - r.d).toBeCloseTo(20, 9)
    expect(r.mark).toMatchObject({ kind: null, label: 'Aligned · A' })
  })

  it('Align off: only the grid', () => {
    expect(snapWallOffset(left, p(-20.1, 0), targets.walls, settings({ align: false }), 0.4).d).toBeCloseTo(20.3, 9)
  })
})
