// Where a new mass fits (Decision "Graph mode"): free buildable ground, the site's spacing from what is there, nearest
// a point first; and *From brief*, which adds the masses the targets still ask for.
import { describe, expect, it } from 'vitest'
import { addFromBrief, addNode, addProgramMass, addRule, removeProgramMass } from '../../state/actions/graph.ts'
import { lockMasses } from '../../state/actions/masses.ts'
import { setProgramTarget } from '../../state/actions/programs.ts'
import { demoProject } from '../../state/demo.ts'
import type { Grid, Polygon } from '../../model/schema.ts'
import { setGrid } from '../../state/actions/grid.ts'
import { programSize } from '../brief.ts'
import { derive } from '../derive.ts'
import { freeSpot, inRegions, placeByRules, rectAround } from '../graph/place.ts'
import { polygonDistance, sharedWall } from '../graph/relations.ts'
import { intersection, regionsArea } from '../geom/boolean.ts'
import { footprintPolygon } from '../geom/footprint.ts'
import { onGrid } from '../grid/index.ts'

const square = (s: number) => [[rectAround({ x: s / 2, y: s / 2 }, s, s)]]

describe('freeSpot', () => {
  it('nearest the point, inside the area, away from what is there', () => {
    const area = square(100)
    expect(freeSpot(area, [], 20, 10, 0, { x: 50, y: 50 })).toEqual({ x: 50, y: 50 })
    // a 20 × 10 at the middle is taken: the next place keeps 5 m from it
    const taken = [rectAround({ x: 50, y: 50 }, 20, 10)]
    const c = freeSpot(area, taken, 20, 10, 5, { x: 50, y: 50 })!
    expect(polygonDistance(rectAround(c, 20, 10), taken[0])).toBeGreaterThanOrEqual(5 - 1e-6)
    expect(rectAround(c, 20, 10).every((q) => inRegions(q, area))).toBe(true)
  })

  it('none when it does not fit; the same answer every time', () => {
    expect(freeSpot(square(10), [], 20, 10, 0, { x: 5, y: 5 })).toBeNull()
    expect(freeSpot([], [], 1, 1, 0, { x: 0, y: 0 })).toBeNull()
    const a = freeSpot(square(100), [rectAround({ x: 50, y: 50 }, 30, 30)], 20, 10, 5, { x: 50, y: 50 })
    expect(freeSpot(square(100), [rectAround({ x: 50, y: 50 }, 30, 30)], 20, 10, 5, { x: 50, y: 50 })).toEqual(a)
  })
})

describe('addFromBrief', () => {
  it('adds what the target counts still ask for, at the programs’ size (the area per mass at 2:1, in the grid’s whole modules), in free buildable ground', () => {
    const p = demoProject() // asks for 2 warehouses (has 2), 1 office (has 1), 1 guard house (has 0)
    const r = addFromBrief(p, 'o1', 'l1')
    expect(r.missing).toBe(0)
    expect(r.added).toHaveLength(1)
    const g = r.project.masses.find((m) => m.id === r.added[0])!
    // the demo stands on its typology's grid (Decision "Grid always"): 24 m² at 2:1 is 6.9 × 3.5, on 3 m modules 6 × 3
    expect(g).toMatchObject({ programId: 'guardhouse', levelId: expect.not.stringMatching(/^l1$/), footprint: { kind: 'rect', width: 6, depth: 3 } })
    const issues = derive(r.project).issues.filter((i) => i.massIds.includes(g.id))
    expect(issues).toEqual([]) // inside the buildable area, 20 m from the others
    // again: nothing more to add
    expect(addFromBrief(r.project, 'o1', 'l1')).toEqual({ project: r.project, added: [], missing: 0 })
  })

  it('what finds no room is counted, not placed', () => {
    // twelve warehouses of 12,800 m² each (160 × 80)
    const p = setProgramTarget(demoProject(), 'warehouse', { area: 12 * 12800, count: 12 })
    const r = addFromBrief(p, 'o1', 'l1')
    expect(r.added.length + r.missing).toBe(10 + 1)
    expect(r.missing).toBeGreaterThan(0)
    expect(derive(r.project).issues.filter((i) => i.code === 'overlap' || i.code === 'outside-buildable')).toEqual([])
  })
})

describe('placed by its rules', () => {
  const poly = (p: ReturnType<typeof demoProject>, id: string) => footprintPolygon(p.masses.find((m) => m.id === id)!.footprint)

  it('a new office goes against a warehouse (Office must be adjacent to Warehouse), and breaks nothing', () => {
    const r = addNode(demoProject(), 'o1', 'l1', 'office')!
    const office = poly(r.project, r.id)
    expect(Math.max(sharedWall(office, poly(r.project, 'm1')), sharedWall(office, poly(r.project, 'm2')))).toBeGreaterThan(1)
    const d = derive(r.project)
    expect(d.relations.filter((x) => x.a === r.id).every((x) => x.met)).toBe(true)
    // (one office more than the brief asks for is the brief's: Decision "Brief issues")
    // (and a street drawn before is where it was: the office stands on it, a warning; Decision "Streets")
    expect(d.issues.filter((i) => i.massIds.includes(r.id) && i.code !== 'brief' && i.code !== 'road')).toEqual([])
  })

  it('outdoor storage within 40 m of a warehouse; a guard house at least 30 m from every one', () => {
    const s = addNode(demoProject(), 'o1', 'l1', 'outdoor-storage')!
    expect(derive(s.project).relations.find((x) => x.a === s.id)).toMatchObject({ met: true })
    const g = addNode(demoProject(), 'o1', 'l1', 'guardhouse')!
    expect(derive(g.project).relations.filter((x) => x.a === g.id).every((x) => x.met)).toBe(true)
  })

  it('never on a truck court: outdoor storage within 40 m of a warehouse keeps off the courts (stress test)', () => {
    const p = demoProject()
    const courts = derive(p).docks.docks.map((x) => x.court)
    const onCourts = (poly: Polygon) => regionsArea(intersection([poly], courts))
    const s = addNode(p, 'o1', 'l1', 'outdoor-storage')!
    expect(onCourts(poly(s.project, s.id))).toBeLessThan(1)
    expect(derive(s.project).relations.find((x) => x.a === s.id)).toMatchObject({ met: true })
    // with nothing to keep off, its first place by its rules is on one: what ▶ Solve did before
    const { width, depth } = programSize(p.programs.find((g) => g.id === 'outdoor-storage'))
    expect(onCourts(rectAround(placeByRules(p, 'o1', 'outdoor-storage', width, depth)!, width, depth))).toBeGreaterThan(1)
  })

  it('on a grid: along its axes, its sides whole modules, its corners on the module lines; turned with it', () => {
    for (const angle of [0, 30]) {
      const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle }
      const r = addNode(setGrid(demoProject(), grid), 'o1', 'l1', 'office')!
      const f = r.project.masses.find((m) => m.id === r.id)!.footprint
      expect(f).toMatchObject({ kind: 'rect', rotation: angle })
      expect(onGrid(grid, footprintPolygon(f))).toBe(true)
    }
    // its area within a module's strip of the brief's: 1,200 m² at 2:1 is 49 × 24.5, on 2.5 m modules 50 × 25
    const f = addNode(setGrid(demoProject(), { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }), 'o1', 'l1', 'office')!
    expect(f.project.masses.find((m) => m.id === f.id)!.footprint).toMatchObject({ width: 50, depth: 25 })
  })

  it('no room that meets the rules: none', () => {
    const p = addRule({ ...demoProject(), rules: undefined }, { kind: 'apart', a: 'guardhouse', b: 'warehouse', min: 500 })!.project
    expect(addNode(p, 'o1', 'l1', 'guardhouse')).toBeNull()
  })
})

describe('the Brief tab’s − and + (Decision "Brief steppers")', () => {
  const count = (p: ReturnType<typeof demoProject>, id: string) => p.masses.filter((m) => m.programId === id).length
  const asks = (p: ReturnType<typeof demoProject>, id: string) => p.programs.find((g) => g.id === id)!.target?.count ?? null

  it('+ places one more where its rules ask, and the brief asks for what the option has', () => {
    const r = addProgramMass(demoProject(), 'o1', 'l1', 'office')!
    expect(count(r.project, 'office')).toBe(2)
    expect(asks(r.project, 'office')).toBe(2)
    expect(r.project.programs.find((g) => g.id === 'office')!.target!.area).toBe(1200) // its area stays
    // (a street drawn before is where it was: the office stands on it, a warning (Decision "Streets": buildings first, then the streets))
    expect(derive(r.project).issues.filter((i) => i.massIds.includes(r.id) && i.code !== 'road')).toEqual([])
    // the guard house the brief asks for and has not: one placed, 1 of 1
    const g = addProgramMass(demoProject(), 'o1', 'l1', 'guardhouse')!
    expect([count(g.project, 'guardhouse'), asks(g.project, 'guardhouse')]).toEqual([1, 1])
  })

  it('+ with no room changes nothing', () => {
    const p = addRule({ ...demoProject(), rules: undefined }, { kind: 'apart', a: 'guardhouse', b: 'warehouse', min: 500 })!.project
    expect(addProgramMass(p, 'o1', 'l1', 'guardhouse')).toBeNull()
  })

  it('− takes the last-drawn mass that is not locked; none left: the brief stops counting it', () => {
    const p = demoProject()
    const [m1, m2] = p.masses.filter((m) => m.programId === 'warehouse').map((m) => m.id)
    const q = removeProgramMass(p, 'o1', 'warehouse')
    expect(q.masses.map((m) => m.id)).not.toContain(m2)
    expect(asks(q, 'warehouse')).toBe(1)
    const locked = removeProgramMass(lockMasses(p, [m2], true), 'o1', 'warehouse')
    expect(locked.masses.map((m) => m.id)).toContain(m2)
    expect(locked.masses.map((m) => m.id)).not.toContain(m1)
    expect(asks(removeProgramMass(q, 'o1', 'warehouse'), 'warehouse')).toBeNull()
  })

  it('− on what the brief asks for and has none of: the brief stops asking; all locked and agreed: the same project', () => {
    const p = demoProject()
    const q = removeProgramMass(p, 'o1', 'guardhouse')
    expect(q.masses).toBe(p.masses)
    expect(asks(q, 'guardhouse')).toBeNull()
    const all = lockMasses(p, p.masses.filter((m) => m.programId === 'warehouse').map((m) => m.id), true)
    expect(removeProgramMass(all, 'o1', 'warehouse')).toBe(all)
  })
})
