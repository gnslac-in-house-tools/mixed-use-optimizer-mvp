// Ported from Plaza-Practiko `vistas/planta/edicion/__tests__/geometria.test.ts` (ajustarMovimiento). Plaza's single
// function is two here, `gridDelta` (first corner onto the grid) and `snapToWalls`; `snapMove` chains them.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { gridDelta, snapToGrid } from '../grid.ts'
import { snapToWalls, straightWalls, type LabeledWall } from '../walls.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rectC = (w: number, h: number, x = 0, y = 0): Contour => contourFromPolygon([p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)])
const labeled = (c: Contour, label: string): LabeledWall[] => straightWalls(c).map((w) => ({ ...w, label }))
/** Plaza's fixed distance. In the app it is 8 screen px at the current zoom. */
const TOL = 0.5

const moving = rectC(10, 6, 0.3, 0.2)
const walls = straightWalls(moving)

describe('grid', () => {
  it('the first corner lands on the grid, not just moves by whole steps', () => {
    const d = gridDelta(moving.vertices[0], p(2.1, 0.1))
    expect(0.3 + d.x).toBeCloseTo(2)
    expect(0.2 + d.y).toBeCloseTo(0)
    expect(snapToGrid(p(12.4, -3.6), 5)).toEqual(p(10, -5))
  })
})

describe('snapToWalls', () => {
  it('within tol of a wall of another mass it sticks to it (before the grid)', () => {
    // the neighbour starts at x = 12.45: the moving right wall (x = 10.3 + dx) sticks to it
    const raw = p(2, 0.1)
    const r = snapToWalls(walls, labeled(rectC(5, 6, 12.45, 0), 'B'), raw, gridDelta(moving.vertices[0], raw), TOL)!
    expect(10.3 + r.delta.x).toBeCloseTo(12.45)
    expect(0.2 + r.delta.y).toBeCloseTo(0) // the neighbour's bottom wall (and the grid agrees)
  })

  it('far from every wall: null, the grid decides', () => {
    expect(snapToWalls(walls, labeled(rectC(5, 6, 30, 30), 'B'), p(2, 0), p(2, 0), TOL)).toBeNull()
  })

  it('new: lines up with a wall that is NOT in front of it (fronts side by side) and gives the guide', () => {
    // A is 0..10 × 0..6. The moving mass is 10 m to its right and 0.3 m higher: its bottom wall lines up with A's.
    const m = rectC(10, 6, 20, 0.3)
    const r = snapToWalls(straightWalls(m), labeled(rectC(10, 6), 'A'), p(0, 0), p(0, 0), TOL)!
    expect(r.delta.x).toBeCloseTo(0)
    expect(r.delta.y).toBeCloseTo(-0.3)
    // the top walls line up too, but they are parallel to the bottom ones: one direction, one guide
    expect(r.guides).toHaveLength(1)
    const g = r.guides[0]
    expect(g.label).toBe('A')
    expect(Math.min(g.a.x, g.b.x)).toBeCloseTo(0) // from A's corner…
    expect(Math.max(g.a.x, g.b.x)).toBeCloseTo(30) // …to the far corner of the moved mass
  })

  it('two independent walls (a corner) fix both directions, whatever the base says', () => {
    // moving 0..10 × 0..6, pulled 10.2 right and 0.2 up; the neighbour starts at x = 20
    const base = p(10.2, 0.2)
    const r = snapToWalls(straightWalls(rectC(10, 6)), labeled(rectC(5, 6, 20, 0), 'B'), base, base, TOL)!
    expect(r.delta.x).toBeCloseTo(10)
    expect(r.delta.y).toBeCloseTo(0)
    expect(r.guides).toHaveLength(2)
  })
})
