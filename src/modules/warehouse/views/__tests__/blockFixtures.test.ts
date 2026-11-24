// A placed block's level doors and patterns in the 3D (the user, 2026-11-10: "I don't see the patterns or doors in 3D"):
// each door a panel just out of its wall at its hall's floor, as tall as a level door; each pattern (a downpipe) a thin
// post on its wall as tall as the hall; its docks stay the docks' fixtures.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { distancePointSegment } from '../../../../engine/geom/polygon.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { putCopyElements } from '../../actions.ts'
import { copyGenerated, copyOnPlan } from '../../engine/copies.ts'
import { bayModules } from '../../engine/dockRule.ts'
import { blockFixturesOf, LEVEL_DOOR_HEIGHT } from '../blockFixtures.ts'

/** The sample's first option with a placed block, a door and a pattern put on that block's free wall. */
function withElements(): { p: Project; option: string; hallId: string } {
  let p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const b = p.buildings.find((x) => option.buildingIds.includes(x.id) && x.warehouse)!
  const t = p.warehouseTypes!.find((x) => x.id === b.warehouse!.type)!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
  const g = copyGenerated(t, copyOnPlan(t, b.warehouse!, hall.footprint))
  const e = g.edges.find((x) => !g.doors.some((d) => d.edge === x.id) && bayModules(g.runs, x, 0).length > 1)!
  const [k0, k1] = bayModules(g.runs, e, 0)
  p = putCopyElements(p, b.id, 'door', e.id, [k0], true)
  p = putCopyElements(p, b.id, 'pattern', e.id, [k1], true)
  return { p, option: option.id, hallId: hall.id }
}

describe('blockFixturesOf: a placed block’s doors and patterns in the 3D', () => {
  it('a panel for each level door and a post for each pattern, on the hall’s wall, from its floor', () => {
    const { p, option, hallId } = withElements()
    const d = derive(p, option)
    const f = blockFixturesOf(p, d.masses, option, () => 0)
    const m = d.masses[hallId]
    const doors = f.doors.filter((x) => x.massId === hallId)
    const marks = f.marks.filter((x) => x.massId === hallId)
    expect(doors.length).toBe(1)
    expect(marks.length).toBe(1)
    const ring = m.polygon
    const onWall = (q: { x: number; y: number }) => Math.min(...ring.map((a, i) => distancePointSegment(q, a, ring[(i + 1) % ring.length])))
    for (const x of [...doors, ...marks]) expect(onWall(x.at)).toBeLessThan(1)
    expect(doors[0].z0).toBeCloseTo(m.span[0])
    expect(doors[0].height).toBe(LEVEL_DOOR_HEIGHT)
    expect(marks[0].height).toBeCloseTo(m.span[1] - m.span[0])
  })

  it('stands on its platform: the lift added to its floor', () => {
    const { p, option, hallId } = withElements()
    const d = derive(p, option)
    const f = blockFixturesOf(p, d.masses, option, () => 2.5)
    expect(f.doors.find((x) => x.massId === hallId)!.z0).toBeCloseTo(d.masses[hallId].span[0] + 2.5)
  })

  it('no docks among them (the docks’ fixtures draw those)', () => {
    const { p, option } = withElements()
    const d = derive(p, option)
    const f = blockFixturesOf(p, d.masses, option, () => 0)
    expect(f.doors.every((x) => x.kind === 'door')).toBe(true)
  })
})
