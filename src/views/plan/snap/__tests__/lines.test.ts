// Ported from Plaza-Practiko `vistas/planta/edicion/__tests__/guias.test.ts` (dominant axes, axis guides, lines).
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { axisLines, dominantAxes, snapToLines, wallLines, type Line } from '../lines.ts'
import { straightWalls } from '../walls.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rot = (q: Point, deg: number): Point => {
  const a = (deg * Math.PI) / 180
  return p(q.x * Math.cos(a) - q.y * Math.sin(a), q.x * Math.sin(a) + q.y * Math.cos(a))
}

/** An elbow: a 40 × 10 wing and a 20 × 10 wing leaving its right end at 30°. */
const ELBOW = contourFromPolygon([p(0, 0), p(40, 0), p(57.3205, 10), p(52.3205, 18.6603), p(37.3205, 10), p(0, 10)])

describe('dominant axes', () => {
  it('a rectangle has two families, the long one first', () => {
    expect(dominantAxes(contourFromPolygon([p(0, 0), p(40, 0), p(40, 10), p(0, 10)]))).toEqual([0, 90])
  })

  it('an elbow gives the directions of its two wings, the longest first', () => {
    const axes = dominantAxes(ELBOW)
    expect(axes[0]).toBeCloseTo(0, 3)
    expect(axes[1]).toBeCloseTo(30, 3)
  })

  it('in an elbow, a corner of the rotated wing lines up again with that wing from its neighbour', () => {
    const r = snapToLines(p(52.0, 19.4), axisLines(ELBOW, 3), 0.6, 1)!
    expect(r.lines.length).toBeGreaterThan(0)
    const g = r.lines[0]
    // the line goes through the snapped point
    expect(Math.abs((r.point.x - g.p.x) * g.u.y - (r.point.y - g.p.y) * g.u.x)).toBeLessThan(1e-9)
  })
})

describe('snapping to lines', () => {
  const wall: Line = { p: p(0, 0), u: p(1, 0), label: 'wall' }
  const axis: Line = { p: p(10, 0), u: p(0, 1), label: 'axis' }

  it('the crossing of two lines; otherwise along one (with the grid); otherwise null', () => {
    const x = snapToLines(p(10.3, 0.2), [wall, axis], 0.5, 1)!
    expect(x.point).toEqual(p(10, 0))
    expect(x.lines).toHaveLength(2)
    const on = snapToLines(p(4.3, 0.3), [wall, axis], 0.5, 1)!
    expect(on.point.y).toBeCloseTo(0, 9)
    expect(on.point.x).toBeCloseTo(4, 9)
    expect(on.lines.map((l) => l.label)).toEqual(['wall'])
    expect(snapToLines(p(4.3, 3.7), [wall, axis], 0.5, 1)).toBeNull()
  })

  it('the axis lines go through the neighbours: a corner squares up without landing on an edge', () => {
    // a rectangle rotated 30°: dragging corner 2 near where it "should" be puts it square
    const c = contourFromPolygon([p(0, 0), p(40, 0), p(40, 10), p(0, 10)].map((q) => rot(q, 30)))
    const ideal = rot(p(40, 10), 30)
    const r = snapToLines(p(ideal.x + 0.3, ideal.y - 0.2), axisLines(c, 2), 0.6, 1)!
    expect(r.point.x).toBeCloseTo(ideal.x, 6)
    expect(r.point.y).toBeCloseTo(ideal.y, 6)
    expect(r.lines.map((l) => l.label).sort()).toEqual(['∥ axis 1', '⟂ axis 1'])
  })

  it('the walls of another mass are lines', () => {
    const other = contourFromPolygon([p(50, 0), p(60, 0), p(60, 10), p(50, 10)])
    const lines = wallLines(straightWalls(other).map((w) => ({ ...w, label: 'Warehouse 2' })))
    const r = snapToLines(p(55, 10.2), lines, 0.5, 1)!
    expect(r.point.y).toBeCloseTo(10, 9)
    expect(r.lines[0].label).toBe('wall of Warehouse 2')
  })
})
