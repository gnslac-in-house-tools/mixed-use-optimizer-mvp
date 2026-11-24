// A shaped truck court in the exports (Phase D.3, task 5): the CAD plan's paving takes the courts as they are (a gap between two of a wall, a chamfer
// cut off), the 3D model has a court for each shape (what Rhino, IFC and Speckle write), a wall without a shape its one rectangle as before.
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { distancePointSegment, pointInPolygon } from '../../engine/geom/polygon.ts'
import type { Point, Polygon } from '../../model/schema.ts'
import { gapOf, shapedDocks, shapedSite } from '../../modules/docks/__tests__/shapedCourtFixture.ts'
import { modelOf } from '../exportModel.ts'
import { planOf, type PlanEntity } from '../exportPlan.ts'

const inOrOn = (q: Point, r: Polygon) => pointInPolygon(q, r) || r.some((c, i) => distancePointSegment(q, c, r[(i + 1) % r.length]) <= 1e-4)
const paving = (es: PlanEntity[]) => es.filter((e): e is Extract<PlanEntity, { kind: 'poly' }> => e.kind === 'poly' && e.layer === 'C-ROAD')

describe('the CAD plan', () => {
  it('the paving holds every corner of every shape, and not the gap between two courts of a wall', () => {
    const s = shapedSite()
    const { d, split, mine } = shapedDocks(s.p, s.optionId, s.hall.id)
    const plan = planOf(s.p, d, { threeD: false })
    const rings = paving(plan.entities)
    for (const k of mine) for (const sh of k.shapes!) for (const q of sh) expect(rings.some((x) => inOrOn(q, x.points))).toBe(true)
    // the corner of the frame the first court's chamfer cuts off (the block is not turned): a point inside the cut triangle
    const [a, b] = [split.shapes![0][2], split.shapes![0][3]]
    const corner = { x: a.x, y: b.y }
    const inCut = { x: (a.x + b.x + corner.x) / 3, y: (a.y + b.y + corner.y) / 3 }
    expect(pointInPolygon(inCut, split.court)).toBe(true)
    expect(split.shapes!.some((q) => pointInPolygon(inCut, q))).toBe(false)
    expect(rings.some((x) => pointInPolygon(inCut, x.points))).toBe(false)
    const gap = gapOf(split)
    expect(rings.some((x) => pointInPolygon(gap, x.points))).toBe(false)
  })
})

describe('the 3D model', () => {
  it('a court for each shape, its outline the shape’s; its depth its own; its name says which of the wall', () => {
    const s = shapedSite()
    const { d, mine } = shapedDocks(s.p, s.optionId, s.hall.id)
    const m = modelOf(s.p, d, 'geometry')
    const mineCourts = m.courts.filter((c) => c.massId === s.hall.id)
    expect(mineCourts).toHaveLength(mine.reduce((n, k) => n + (k.shapes?.length ?? 1), 0))
    const split = mine.find((k) => k.shapes!.length === 2)!
    const two = mineCourts.filter((c) => c.wall === split.wall)
    expect(two.map((c) => c.outline)).toEqual(split.shapes)
    expect(two.map((c) => c.part)).toEqual([1, 2])
    expect(new Set(two.map((c) => c.name)).size).toBe(2)
    for (const c of two) expect(c.depth).toBeCloseTo(12, 6)
    const single = mine.find((k) => k.shapes!.length === 1)!
    const one = mineCourts.find((c) => c.wall === single.wall)!
    expect(one.outline).toEqual(single.shapes![0])
    expect(one.depth).toBeCloseTo(10, 6)
    expect(one.part).toBe(1)
  })

  it('a wall without a shape: one court, its rectangle, as before', () => {
    const s = shapedSite([{ edge: 'e1', depth: 24 }])
    const d = derive(s.p, s.optionId)
    const m = modelOf(s.p, d, 'geometry')
    const docks = d.circulation.docks
    expect(m.courts.map((c) => [c.massId, c.wall, c.outline, c.part])).toEqual(docks.map((k) => [k.massId, k.wall, k.court, undefined]))
  })
})
