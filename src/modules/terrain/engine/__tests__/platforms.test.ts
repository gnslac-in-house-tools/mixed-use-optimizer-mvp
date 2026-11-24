// The platforms (Phase E.3a, Decision "Platforms"): each building on its own at the level that balances its cut and
// fill, or typed; buildings joined on one; masses stepped onto one of their own; the courts the dock height below;
// a context building on the ground as it is. The demo: Building 1 (b1) with Warehouse 1 (m1, x 40–200, y 70–150, its
// court south, y 30–70), Warehouse 2 (m2, x 250–390, turned round: its court north) and Office 1 (m3); the ground a
// plane rising 5 % east from 100 m at x 0.
import { describe, expect, it } from 'vitest'
import type { Footprint, GroundPoint, Project, Terrain } from '../../../../model/schema.ts'
import { addBuilding, copyBuilding, updateBuilding } from '../../../../state/actions/buildings.ts'
import { updateStandards } from '../../../../state/actions/circulation.ts'
import { addMass } from '../../../../state/actions/masses.ts'
import { joinPlatform, ownPlatform, removeStep, setPlatformLevel, setStepLevel, stepMasses, unstepMasses } from '../../actions.ts'
import { setTerrain } from '../../../../state/actions/site.ts'
import { demoProject } from '../../../../state/demo.ts'
import { derive } from '../../../../engine/derive.ts'
import { platformOfMass, platformRoot } from '../platforms.ts'

const ground = (x: number) => 100 + 0.05 * x
const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: ground(x) })
  return { contours: [], points }
}
const rect = (x: number, y: number, w: number, d: number): Footprint => ({ kind: 'rect', center: { x, y }, width: w, depth: d, rotation: 0 })
const onGround = (p: Project = demoProject()) => setTerrain(p, plane())
const earth = (p: Project) => derive(p).earthwork!
/** A platform's cut and fill under its masses and its courts: its banks' left out. */
const own = (x: { cut: number; fill: number; banks: { cut: number; fill: number } }) => ({ cut: x.cut - x.banks.cut, fill: x.fill - x.banks.fill })

/** The demo on the plane, with Building 2 (one warehouse east of b1's, x 450–550) in Option 1. */
function withSecond(): { p: Project; b2: string; m: string } {
  const b = addBuilding(onGround(), { optionId: 'o1' })
  const m = addMass(b.project, { programId: 'office', footprint: rect(500, 220, 100, 30), levelId: b.levelId })
  return { p: m.project, b2: b.id, m: m.id }
}

describe('the platforms', () => {
  it('no ground, no platforms; a building on its own, balanced: its cut and fill even, its courts with it', () => {
    expect(derive(demoProject()).earthwork).toBeNull()
    const e = earth(onGround())
    expect(e.platforms).toHaveLength(1)
    const [b1] = e.platforms
    expect(b1).toMatchObject({ id: 'b1', step: false, buildingIds: ['b1'], context: false, typed: false })
    expect(b1.massIds.sort()).toEqual(['m1', 'm2', 'm3'])
    expect(b1.level).toBe(b1.balanced)
    expect(own(b1).cut).toBeGreaterThan(1000)
    expect(Math.abs(own(b1).cut - own(b1).fill)).toBeLessThan(1e-6 * own(b1).cut)
    expect([e.cut, e.fill]).toEqual([b1.cut, b1.fill])
    expect(platformOfMass(e, 'm2')).toBe(b1)
  })

  it('a court stands the dock height below its platform, and the balance counts it so', () => {
    const p = onGround()
    const e = earth(p)
    const b1 = e.platforms[0]
    const g = e.grid
    // a cell in Warehouse 1's court, south of it
    const k = Math.floor((50 - g.y0) / g.size) * g.cols + Math.floor((120 - g.x0) / g.size)
    const x = g.x0 + ((k % g.cols) + 0.5) * g.size
    expect(g.owner[k]).toBe(0)
    expect(g.depth[k]).toBeCloseTo(b1.level! - 1.2 - ground(x), 4)
    // no dock height: the balance is the ground's mean alone, lower
    const flat = earth(updateStandards(p, { dockHeight: 0 })).platforms[0]
    const rise = b1.balanced! - flat.balanced!
    expect(rise).toBeGreaterThan(0.1)
    expect(rise).toBeLessThan(1.2)
  })

  it('typed: at that level, its fill over its cut the area times the rise over the balance', () => {
    const p = setPlatformLevel(onGround(), 'b1', 110)
    const b1 = earth(p).platforms[0]
    expect(b1).toMatchObject({ level: 110, typed: true })
    expect(own(b1).fill - own(b1).cut).toBeCloseTo(b1.area * (110 - b1.balanced!), 0)
    expect(earth(setPlatformLevel(p, 'b1', null)).platforms[0].typed).toBe(false)
  })

  it('joined: one platform for both, balanced over both; on its own again, two', () => {
    const { p, b2 } = withSecond()
    expect(earth(p).platforms.map((x) => x.id)).toEqual(['b1', b2])
    const joined = joinPlatform(p, b2, 'b1')
    const e = earth(joined)
    expect(e.platforms).toHaveLength(1)
    expect(e.platforms[0].buildingIds).toEqual(['b1', b2])
    expect(Math.abs(own(e.platforms[0]).cut - own(e.platforms[0]).fill)).toBeLessThan(1e-6 * own(e.platforms[0]).cut)
    // the shared level is typed on the one the other joined
    expect(setPlatformLevel(joined, b2, 104).buildings.find((b) => b.id === 'b1')!.platform).toEqual({ level: 104 })
    expect(earth(ownPlatform(joined, b2)).platforms).toHaveLength(2)
  })

  it('a step: masses on their own platform in their building, higher up the slope; back, one platform again', () => {
    const { project: p, ids } = stepMasses(onGround(), ['m2'])
    expect(ids).toHaveLength(1)
    const e = earth(p)
    expect(e.platforms.map((x) => [x.id, x.step, x.massIds])).toEqual([
      ['b1', false, ['m1', 'm3']],
      [ids[0], true, ['m2']],
    ])
    expect(e.platforms[1].buildingIds).toEqual(['b1'])
    expect(e.platforms[1].level!).toBeGreaterThan(e.platforms[0].level!)
    expect(earth(setStepLevel(p, ids[0], 115)).platforms[1]).toMatchObject({ level: 115, typed: true })
    expect(earth(unstepMasses(p, ['m2'])).platforms).toHaveLength(1)
    expect(earth(removeStep(p, ids[0])).platforms).toHaveLength(1)
  })

  it('a context building stands on the ground as it is: its mean, never counted', () => {
    const { p, b2 } = withSecond()
    const e = earth(updateBuilding(p, b2, { context: true }))
    const c = e.platforms.find((x) => x.id === b2)!
    expect(c).toMatchObject({ context: true, cut: 0, fill: 0, area: 0 })
    expect(c.level!).toBeCloseTo(ground(500), 1)
    expect([e.cut, e.fill]).toEqual([e.platforms[0].cut, e.platforms[0].fill])
  })
})

describe('the platform verbs', () => {
  it('joining follows the chain to its end; those on the joiner’s platform come along; nothing joins itself', () => {
    const { p, b2 } = withSecond()
    const b = addBuilding(p, { optionId: 'o1' })
    const b3 = b.id
    // b3 joins b2, then b2 joins b1: b3 comes along
    const q = joinPlatform(joinPlatform(b.project, b3, b2), b2, 'b1')
    expect([platformRoot(q, b2), platformRoot(q, b3)]).toEqual(['b1', 'b1'])
    expect(joinPlatform(q, b3, b2)).toBe(q)
    // the one the others joined leaves: they stay together on the first, with the typed level
    const typed = setPlatformLevel(q, 'b1', 103)
    const left = ownPlatform(typed, 'b1')
    expect(platformRoot(left, b3)).toBe(b2)
    expect(left.buildings.find((x) => x.id === b2)!.platform).toEqual({ level: 103 })
    expect(left.buildings.find((x) => x.id === 'b1')!.platform).toEqual({ level: 103 })
    expect(ownPlatform(left, 'b1')).toBe(left)
    // a context building joins none
    expect(joinPlatform(updateBuilding(p, b2, { context: true }), b2, 'b1').buildings.find((x) => x.id === b2)!.platform).toBeUndefined()
  })

  it('a mass stepped again leaves its old step; a step left empty goes; a copy of the building steps its copies', () => {
    const one = stepMasses(onGround(), ['m1', 'm2'])
    const two = stepMasses(one.project, ['m2'])
    const steps = two.project.buildings[0].platform!.steps!
    expect(steps.map((s) => s.masses)).toEqual([['m1'], ['m2']])
    expect(unstepMasses(two.project, ['m1']).buildings[0].platform!.steps!.map((s) => s.masses)).toEqual([['m2']])
    expect(unstepMasses(unstepMasses(two.project, ['m1']), ['m2']).buildings[0].platform).toBeUndefined()
    const copy = copyBuilding(two.project, 'b1', 'o1')!
    const b = copy.project.buildings.find((x) => x.id === copy.id)!
    const own = new Set(copy.project.masses.filter((m) => b.levels.some((l) => l.id === m.levelId)).map((m) => m.id))
    expect(b.platform!.steps!.every((s) => s.masses.every((m) => own.has(m)))).toBe(true)
    expect(new Set([...steps, ...b.platform!.steps!].map((s) => s.id)).size).toBe(4)
  })
})
