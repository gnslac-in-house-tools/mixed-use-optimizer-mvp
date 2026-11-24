// The 3D's paving of a shaped court is the shapes (Phase D.3, task 5): a region for each court, not the frame that holds them; a wall without a shape
// pays the one rectangle as before. `lyingOf` lays the same regions on the ground, a court each at its platform's level.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { regionsArea } from '../../../engine/geom/boolean.ts'
import { pavingOf } from '../Paving.tsx'
import { area, shapedDocks, shapedSite } from '../../../modules/docks/__tests__/shapedCourtFixture.ts'

describe('pavingOf and a shaped court', () => {
  it('the courts layer holds a region for each shape and none for the frame', () => {
    const s = shapedSite()
    const { d, mine } = shapedDocks(s.p, s.optionId, s.hall.id)
    const c = d.circulation
    const paved = pavingOf(c)
    const shapes = c.docks.reduce((n, k) => n + (k.shapes?.length ?? 1), 0)
    expect(shapes).toBe(c.docks.length + 1)
    expect(paved.courts.length).toBe(shapes + c.approaches.length)
    // the area paved is the shapes’, which is less than the frames’ (a gap, a chamfer)
    const frames = mine.reduce((n, k) => n + area(k.court), 0)
    const shaped = mine.reduce((n, k) => n + (k.shapes ?? [k.court]).reduce((m, q) => m + area(q), 0), 0)
    expect(shaped).toBeLessThan(frames - 100)
    const hidden = pavingOf({ ...c, docks: c.docks.filter((k) => k.massId !== s.hall.id) })
    expect(regionsArea(paved.courts) - regionsArea(hidden.courts)).toBeCloseTo(shaped, 3)
  })

  it('a wall with no shape: one region, its rectangle', () => {
    const s = shapedSite([{ edge: 'e1', depth: 24 }])
    const c = derive(s.p, s.optionId).circulation
    expect(c.docks.every((k) => k.shapes === undefined)).toBe(true)
    expect(pavingOf(c).courts.length).toBe(c.docks.length + c.approaches.length)
  })
})
