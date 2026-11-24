// The ground's KPIs and rules (Phase E.4a, Decision "Terrain"): cut, fill and their balance; the largest step between
// platforms side by side; the steepest ground of the buildable area against the site's maximum; with Flow, the
// steepest road. A built mass on ground too steep is an Issue, and so is a step between a building's platforms over
// the standards' limit. The demo on a plane rising 5 % east from 100 m at x 0; an office (Office 2) added to Building
// 1 against Warehouse 1's east wall (x 200–240, y 70–150).
import { describe, expect, it } from 'vitest'
import type { GroundPoint, Project, Terrain } from '../../model/schema.ts'
import { addBuilding } from '../../state/actions/buildings.ts'
import { updateStandards } from '../../state/actions/circulation.ts'
import { addMass } from '../../state/actions/masses.ts'
import { setPlatformLevel, setStepLevel, stepMasses } from '../../modules/terrain/actions.ts'
import { setTerrain, updateSiteRules } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { figure } from '../../views/format.ts'
import { derive } from '../derive.ts'
import { readKpi } from '../../modules/catalog.ts'
import { roadGradeIssues } from '../../modules/terrain/engine/checks.ts'
import { profileOf } from '../../modules/terrain/engine/roads.ts'
import { gradedSurfaceOf, surfaceOf } from '../../modules/terrain/engine/index.ts'
import { pointInPolygon } from '../geom/polygon.ts'

const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}
const onGround = (p: Project = demoProject()) => setTerrain(p, plane())
const kpi = (id: string, p: Project) => readKpi(id, p, derive(p))!

/** The demo on the plane with Office 2 stepped onto its own platform, `rise` m over Building 1's. */
function stepped(rise: number): Project {
  const level = demoProject().buildings[0].levels[0].id
  const a = addMass(onGround(), { programId: 'office', footprint: { kind: 'rect', center: { x: 220, y: 110 }, width: 40, depth: 80, rotation: 0 }, levelId: level })
  const s = stepMasses(a.project, [a.id])
  const b1 = derive(s.project).earthwork!.platforms[0].level!
  return setStepLevel(s.project, s.ids[0], b1 + rise)
}

describe('the ground’s KPIs', () => {
  it('none without ground; cut and fill, balanced; the earth balance their difference', () => {
    for (const id of ['cut', 'fill', 'earth-balance', 'earth-moved', 'largest-step', 'steepest-ground', 'steepest-road']) expect(kpi(id, demoProject()).value).toBeNull()
    const p = onGround()
    const cut = kpi('cut', p).value!
    expect(cut).toBeGreaterThan(1000)
    // balanced under its masses and courts: what is left over is its banks' and the roads' (a ring road that crosses a
    // bank lies on it and climbs no steeper than its grade, so it cuts and fills: Decision "Banks meet the roads")
    const d = derive(p)
    const { banks } = d.earthwork!.platforms[0]
    const roads = d.roadGrading!
    expect(kpi('earth-balance', p).value!).toBeCloseTo(Math.abs(banks.cut + roads.cut - banks.fill - roads.fill), 3)
    // all the ground moved: cut and fill together
    expect(kpi('earth-moved', p).value!).toBeCloseTo(cut + kpi('fill', p).value!, 3)
  })

  it('the largest step between platforms side by side; none side by side, none', () => {
    expect(kpi('largest-step', onGround()).value).toBeNull()
    expect(kpi('largest-step', stepped(2.5)).value).toBeCloseTo(2.5, 6)
    expect(figure(2.46, 'm')).toEqual({ value: '2.5', unit: 'm' })
  })

  it('the steepest ground of the buildable area, over the site’s maximum or within; with Flow, the steepest road', () => {
    const p = onGround()
    const v = kpi('steepest-ground', p)
    expect(v.value).toBeCloseTo(0.05, 3)
    // the demo's industrial rules: 15 % at most
    expect(v).toMatchObject({ limit: 0.15, status: 'within' })
    expect(kpi('steepest-ground', updateSiteRules(p, { maxSlope: 0.04 }))).toMatchObject({ limit: 0.04, status: 'over' })
    expect(kpi('steepest-ground', updateSiteRules(p, { maxSlope: 0.15 })).status).toBe('within')
    // the roads lie on the ground (the plane's 5 %) and on the banks they cross, climbing those at the industrial 8 % at
    // most (Decision "Banks meet the roads")
    expect(kpi('steepest-road', p).value).toBeGreaterThanOrEqual(0.05 - 1e-6)
    expect(kpi('steepest-road', p).value).toBeLessThanOrEqual(0.08 + 1e-6)
    expect(kpi('steepest-road', p)).toMatchObject({ limit: 0.08, status: 'within' })
    // at 4 % at most the roads are graded to it: they cut and fill, in the option's Cut and Fill (Decision "Graded roads")
    const gentle = updateStandards(p, { maxGrade: 0.04 })
    expect(kpi('steepest-road', gentle)).toMatchObject({ limit: 0.04, status: 'within' })
    expect(kpi('steepest-road', gentle).value!).toBeLessThanOrEqual(0.04 + 1e-6)
    const roads = derive(gentle).roadGrading!
    expect(roads.cut).toBeGreaterThan(100)
    expect(roads.fill).toBeGreaterThan(100)
    expect(kpi('cut', gentle).value).toBeCloseTo(derive(gentle).earthwork!.cut + roads.cut, 6)
    expect(derive(p).roadGrading!.cut).toBeLessThan(roads.cut)
  })

  it('a road graded still steeper than the max. grade is an Issue where it climbs most (Flow’s); graded within it, nothing', () => {
    const roads = (p: Project) => derive(p).issues.filter((i) => i.code === 'road' && /climbs/.test(i.message))
    expect(roads(onGround())).toEqual([])
    expect(roads(updateStandards(onGround(), { maxGrade: 0.04 }))).toEqual([])
    const at = { x: 1, y: 2 }
    const issues = roadGradeIssues(onGround(), { roads: [{ roadId: 'r', width: 7, stations: [], cut: 0, fill: 0, grade: 0.123, at }], cut: 0, fill: 0 })
    expect(issues).toEqual([
      { code: 'road', severity: 'warning', massIds: [], at, message: 'A road climbs 12.3 % here, over the 8 % max. road grade: the levels it joins are too far apart for its length.' },
    ])
  })
})

describe('the ground’s rules', () => {
  const terrain = (p: Project) => derive(p).issues.filter((i) => i.code === 'terrain')

  it('a built mass on ground steeper than the site’s maximum; within it, nothing', () => {
    expect(terrain(updateSiteRules(onGround(), { maxSlope: 0.15 }))).toEqual([])
    const steep = terrain(updateSiteRules(onGround(), { maxSlope: 0.04 }))
    expect(steep.map((i) => i.massIds)).toEqual([['m1'], ['m2'], ['m3']])
    expect(steep[0].message).toBe('Warehouse 1: 100 % of it on ground steeper than 4 % (up to 5 %), too steep to build.')
  })

  it('a step between a building’s platforms side by side over the limit; within it, nothing', () => {
    const over = terrain(stepped(2.5))
    expect(over).toHaveLength(1)
    expect(over[0].message).toMatch(/^A step of 2\.5 m between Building 1 and Office 2,/)
    expect(over[0].message).toMatch(/over the 1\.5 m a building’s platforms may differ\.$/)
    expect(terrain(updateStandards(stepped(2.5), { maxStep: 3 }))).toEqual([])
    expect(terrain(stepped(1))).toEqual([])
  })

  it('two buildings’ platforms that touch, further apart than the step: a wall (no room for a bank)', () => {
    // the office against Warehouse 1's east wall, in a building of its own, its platform 3 m over Building 1's
    const b = addBuilding(onGround(), { name: 'Building 2', optionId: demoProject().options[0].id })
    const a = addMass(b.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 220, y: 110 }, width: 40, depth: 80, rotation: 0 }, levelId: b.levelId })
    const b1 = derive(a.project).earthwork!.platforms[0].level!
    const wall = terrain(setPlatformLevel(a.project, b.id, b1 + 3))
    expect(wall).toHaveLength(1)
    expect(wall[0].message).toMatch(/^A wall of 3 m where Building 1’s and Building 2’s platforms touch \(no room for a bank\), over the 1\.5 m max\. step\.$/)
    expect(terrain(setPlatformLevel(a.project, b.id, b1 + 1))).toEqual([])
  })
})

describe('a road’s profile (Decision "Graded roads")', () => {
  it('no steeper than the grade, halfway between the steepest under the ground and over it: cut and fill even out', () => {
    expect(profileOf([0, 50, 100], [0, 10, 0], [null, null, null], 0.08)).toEqual([3, 7, 3])
    // gentler ground: the road lies on it
    expect(profileOf([0, 50, 100], [0, 2, 1], [null, null, null], 0.08)).toEqual([0, 2, 1])
  })

  it('a pin (a court it runs onto) holds it at its level, and it climbs to it within the grade', () => {
    const z = profileOf([0, 10, 20], [0, 0, 0], [null, null, 5], 0.1)
    expect(z.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([3, 4, 5])
    // two pins too far apart in height for the run: each at its level, the road straight between them, steeper than the grade
    const far = profileOf([0, 10, 20], [0, 0, 0], [0, null, 10], 0.1)
    expect([far[0], far[2]]).toEqual([0, 10])
    expect(far[1]).toBeCloseTo(5, 9)
    expect(Math.abs(far[1] - far[0]) / 10).toBeGreaterThan(0.1)
  })
})

describe('the roads graded in the 3D (Decision "Graded roads")', () => {
  it('the graded ground runs through each road’s profile', () => {
    const p = updateStandards(onGround(), { maxGrade: 0.04 })
    const d = derive(p)
    const road = d.roadGrading!.roads.reduce((a, b) => (b.cut + b.fill > a.cut + a.fill ? b : a))
    const g = gradedSurfaceOf(surfaceOf(p.site.terrain!)!, d.earthwork!, d.roadGrading)!
    const inShape = (q: { x: number; y: number }) => d.earthwork!.shapes.some((s) => pointInPolygon(q, s.polygon))
    const open = road.stations.filter((s) => !inShape(s.p))
    expect(open.length).toBeGreaterThan(3)
    for (const s of open) expect(Math.abs(g.elevation(s.p)! - s.z)).toBeLessThan(0.01)
    // made once per earthwork and roads
    expect(gradedSurfaceOf(surfaceOf(p.site.terrain!)!, d.earthwork!, d.roadGrading)).toBe(g)
  })
})

describe('the roads graded as one network (Decision "Graded roads")', () => {
  it('where two roads meet they stand at one height; every road within the grade', () => {
    const d = derive(updateStandards(onGround(), { maxGrade: 0.04 }))
    const ends = d.roadGrading!.roads.flatMap((r) => [r.stations[0], r.stations.at(-1)!])
    let met = 0
    for (const a of ends)
      for (const b of ends)
        if (a !== b && Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < 0.5) {
          met++
          expect(Math.abs(a.z - b.z)).toBeLessThan(0.01)
        }
    expect(met).toBeGreaterThan(8)
    for (const r of d.roadGrading!.roads) expect(r.grade).toBeLessThanOrEqual(0.04 + 1e-6)
  })
})

describe('banks meet the roads (Decision "Banks meet the roads")', () => {
  it('a ring road across a bank lies on it: the 3D graded ground has no saw along the bank', () => {
    // Building 1 typed 6 m over its ground: fill banks round it, its ring road running through them
    const p = setPlatformLevel(onGround(), 'b1', 112)
    const d = derive(p)
    const g = gradedSurfaceOf(surfaceOf(p.site.terrain!)!, d.earthwork!, d.roadGrading)!
    // along lines parallel to Warehouse 1's west bank and Warehouse 2's east one, 1 m apart, no jump over 0.2 m
    for (const x of [25, 28, 30, 400, 405]) {
      let prev: number | null = null
      for (let y = 75; y <= 145; y += 1) {
        const z = g.elevation({ x, y })
        if (z !== null && prev !== null) expect(Math.abs(z - prev)).toBeLessThan(0.2)
        prev = z
      }
    }
    // Warehouse 2's court, where the ring road runs along its far edge: flat, no road point on its edge at another height
    const court = d.earthwork!.shapes.find((s) => s.wall && s.polygon.some((q) => q.x > 300))!
    for (const y of [160, 170, 180]) {
      const zs = Array.from({ length: 100 }, (_, k) => g.elevation({ x: 270 + k, y }))
      expect(Math.max(...zs.map((z) => Math.abs(z! - court.z)))).toBeLessThan(1e-6)
    }
  })
})
