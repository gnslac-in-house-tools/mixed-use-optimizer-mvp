// The platforms in the 3D (Phase E.3c, Decision "Platforms in 3D"): the ground graded flat under each platform's
// masses and its courts the dock height below, the ground as it was beyond; each mass lifted by its platform's level
// over the site's mean height; the cut and fill coloured by class; the contours cut where the ground is graded; the
// paving lying on its heights. The demo on a plane rising 5 % east from 100 m at x 0, Building 1's platform typed at
// 110 m: Warehouse 1 (x 40–200, y 70–150, its court south, y 30–70) in fill, Warehouse 2 (x 250–390) in cut.
import { describe, expect, it } from 'vitest'
import type { GroundPoint, Project, Terrain } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { gradedSurfaceOf, surfaceOf } from '../../../modules/terrain/engine/index.ts'
import { setPlatformLevel } from '../../../modules/terrain/actions.ts'
import { setTerrain } from '../../../state/actions/site.ts'
import { demoProject } from '../../../state/demo.ts'
import { buildingLift, laidOf, liftOf } from '../laid.ts'
import { drapedRegions } from '../Paving.tsx'
import { earthMesh, offGraded } from '../terrain3d.ts'
import { ups } from './faces.ts'

const ground = (x: number) => 100 + 0.05 * x
const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: ground(x) })
  return { contours: [], points }
}
const typed = (): Project => setPlatformLevel(setTerrain(demoProject(), plane()), 'b1', 110)

describe('the ground graded', () => {
  it('flat under the masses at the level, the courts the dock height below, as it was far away', () => {
    const p = typed()
    const e = derive(p).earthwork!
    const s = surfaceOf(p.site.terrain!)!
    const g = gradedSurfaceOf(s, e)!
    expect(g.elevation({ x: 120, y: 110 })).toBeCloseTo(110, 6)
    expect(g.elevation({ x: 320, y: 110 })).toBeCloseTo(110, 6)
    expect(g.elevation({ x: 120, y: 50 })).toBeCloseTo(110 - 1.2, 6)
    expect(g.elevation({ x: 600, y: 400 })).toBeCloseTo(ground(600), 6)
    // made once per earthwork
    expect(gradedSurfaceOf(s, e)).toBe(g)
  })

  it('the masses lifted by their platform over the site’s mean height; flat with the terrain off', () => {
    const p = typed()
    const d = derive(p)
    const laid = laidOf(p.site.terrain, 'contours', d.site.polygon, d.earthwork, 1.2)!
    expect(liftOf(laid, 'm1')).toBeCloseTo(110 - laid.base, 6)
    expect(buildingLift(laid, 'b1')).toBeCloseTo(110 - laid.base, 6)
    expect(liftOf(laidOf(p.site.terrain, 'off', d.site.polygon, d.earthwork, 1.2), 'm1')).toBe(0)
  })

  it('exaggerated (Decision "Vertical exaggeration"): the ground and the platforms’ levels k times over the base', () => {
    const p = typed()
    const d = derive(p)
    const laid = laidOf(p.site.terrain, 'contours', d.site.polygon, d.earthwork, 1.2, null, 3)!
    expect(laid.k).toBe(3)
    expect(liftOf(laid, 'm1')).toBeCloseTo(3 * (110 - laid.base), 6)
    expect(laid.up(laid.base + 2)).toBeCloseTo(6, 9)
    const flat = earthMesh(laid.ground, laid.surface, laid.base)
    const tall = earthMesh(laid.ground, laid.surface, laid.base, 3)
    for (let i = 1; i < flat.positions.length; i += 3) expect(tall.positions[i]).toBeCloseTo(3 * flat.positions[i], 3)
    // the classes are the ground's, not the drawing's
    expect([...tall.classes]).toEqual([...flat.classes])
  })

  it('cut and fill by class: Warehouse 1 filled, Warehouse 2 cut; the contours cut where the ground is graded', () => {
    const p = typed()
    const e = derive(p).earthwork!
    const s = surfaceOf(p.site.terrain!)!
    const { classes } = earthMesh(gradedSurfaceOf(s, e)!, s, 0)
    const kinds = new Set(classes)
    expect([...kinds].some((k) => k > 0)).toBe(true)
    expect([...kinds].some((k) => k < 0)).toBe(true)
    expect(kinds.has(0)).toBe(true)
    // a contour along y = 110 from x 0 to 600: through both warehouses, left in three pieces
    const line = { points: Array.from({ length: 61 }, (_, i) => ({ x: i * 10, y: 110 })), z: 105 }
    const pieces = offGraded([line], e.grid)
    expect(pieces).toHaveLength(3)
    // to a cell's size (the grid's cells are graded by their middles)
    const cell = e.grid.size
    expect(pieces.every((x) => x.points.every((q) => q.x <= 40 + cell || (q.x >= 200 - cell && q.x <= 250 + cell) || q.x >= 390 - cell))).toBe(true)
  })

  it('paving lies on its heights: every corner at the height asked for, its outline cut every few metres', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const out = drapedRegions([{ region: [square], height: (q) => q.x / 10 }])
    expect(out.length % 9).toBe(0)
    // facing up, whichever way the outline runs
    expect(ups(out).every((y) => y > 0)).toBe(true)
    expect(ups(drapedRegions([{ region: [[...square].reverse()], height: () => 0 }])).every((y) => y > 0)).toBe(true)
    for (let i = 0; i < out.length; i += 3) expect(out[i + 1]).toBeCloseTo(out[i] / 10, 5)
    // cut every 3 m: more corners than a square's
    expect(new Set(Array.from({ length: out.length / 3 }, (_, i) => `${out[3 * i]},${out[3 * i + 2]}`)).size).toBeGreaterThan(4)
  })
})
