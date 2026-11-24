// The exterior circulation's model and verbs (Decision "Exterior circulation", 4.1): gates on the site and an
// option's own copy, existing roads, docks per program and per mass, an option's streets and parking carried along, the
// standards. The demo: Option 1 (o1) shows Building 1 (b1) with m1, m2 (warehouses) and m3 (office).
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { ProjectSchema } from '../../model/schema.ts'
import { gatesOf, ownsGates } from '../../engine/circulation/gates.ts'
import { CIRCULATION_DEFAULTS, standardsOf } from '../../engine/circulation/standards.ts'
import { addOption, duplicateOption, importOption } from '../actions/buildings.ts'
import {
  addExistingRoad,
  addGate,
  dropOwnGates,
  ownGates,
  removeExistingRoad,
  updateExistingRoad,
  removeGate,
  setMassDocks,
  setProgramDocks,
  updateGate,
  updateStandards,
} from '../actions/circulation.ts'
import { setParking } from '../../modules/parking/actions.ts'
import { drawStreet } from '../actions/streets.ts'
import { demoProject } from '../demo.ts'

/** The demo without its access (no existing street, no gates): each test marks its own. */
const bareDemo = () => {
  const p = demoProject()
  return { ...p, site: { boundary: p.site.boundary, rules: p.site.rules } }
}

const option = (p: Project, id = 'o1') => p.options.find((o) => o.id === id)!
const valid = (p: Project) => expect(ProjectSchema.safeParse(p).success).toBe(true)

describe('the model', () => {
  it('an older file without circulation stays valid; the demo starts with the typology’s standards and docks', () => {
    const p = bareDemo()
    valid(p)
    expect(p.standards).toEqual(CIRCULATION_DEFAULTS)
    expect(p.programs.find((g) => g.id === 'warehouse')!.docks).toEqual({ per: 'm2', every: 700 })
    expect(p.programs.find((g) => g.id === 'office')!.docks).toBeUndefined()
    expect(standardsOf({})).toEqual(CIRCULATION_DEFAULTS) // a file without standards
    expect(standardsOf({ standards: { courtDepth: 36, roadWidth: undefined } })).toEqual({ ...CIRCULATION_DEFAULTS, courtDepth: 36 })
  })

  it('two gates with one id are refused; an option’s copy may repeat the site’s', () => {
    let p = addGate(bareDemo(), 'o1', 0.1).project
    p = ownGates(p, 'o1')
    valid(p)
    const twice = { ...p, site: { ...p.site, gates: [...p.site.gates!, ...p.site.gates!] } }
    expect(ProjectSchema.safeParse(twice).success).toBe(false)
  })
})

describe('gates', () => {
  it('a new gate has the standards’ width and radius, two-way for everyone, on the site', () => {
    const { project, id } = addGate(bareDemo(), 'o1', 0.25)
    expect(project.site.gates).toEqual([{ id, t: 0.25, width: 12, radius: 15, flow: 'both', vehicles: 'all' }])
    expect(gatesOf(project, 'o1')).toBe(project.site.gates)
    const edited = updateGate(project, 'o1', id, { flow: 'in', vehicles: 'trucks', guardHouse: true, queue: 36 })
    expect(edited.site.gates![0]).toMatchObject({ flow: 'in', vehicles: 'trucks', guardHouse: true, queue: 36 })
    expect(removeGate(edited, 'o1', id).site.gates).toBeUndefined()
  })

  it('an option’s own gates: a copy it edits, the site’s and other options’ untouched; *Use the site’s* drops it', () => {
    let p = addGate(bareDemo(), 'o1', 0.25).project
    p = addOption(p, { buildingIds: ['b1'] }).project // o2
    p = ownGates(p, 'o2')
    expect(ownsGates(p, 'o2')).toBe(true)
    expect(gatesOf(p, 'o2')).toEqual(p.site.gates)
    p = updateGate(p, 'o2', 'g1', { t: 0.5 })
    const added = addGate(p, 'o2', 0.6)
    p = added.project
    expect(added.id).toBe('g2')
    expect(gatesOf(p, 'o2').map((g) => g.t)).toEqual([0.5, 0.6])
    expect(gatesOf(p, 'o1').map((g) => g.t)).toEqual([0.25]) // the site's
    p = dropOwnGates(p, 'o2')
    expect(ownsGates(p, 'o2')).toBe(false)
    expect(gatesOf(p, 'o2').map((g) => g.t)).toEqual([0.25])
    valid(p)
  })
})

describe('existing roads', () => {
  it('a centreline and a width (the standards’ road width by default); fewer than two points is nothing', () => {
    expect(addExistingRoad(bareDemo(), [{ x: 0, y: 0 }])).toBeNull()
    const { project, id } = addExistingRoad(bareDemo(), [{ x: 0, y: 140 }, { x: 430, y: 120 }])!
    expect(project.site.existingRoads).toEqual([{ id, points: [{ x: 0, y: 140 }, { x: 430, y: 120 }], stretches: [{ left: 4, right: 4 }] }])
    expect(removeExistingRoad(project, id).site.existingRoads).toBeUndefined()
  })

  it('a width under 0.5 m is 0.5 m (PE.1 review)', () => {
    const { project } = addExistingRoad(bareDemo(), [{ x: 0, y: 140 }, { x: 430, y: 120 }], 0.2)!
    expect(project.site.existingRoads![0].stretches).toEqual([{ left: 0.25, right: 0.25 }])
  })

  it('stretches of another count than the points are padded with the last pair or trimmed (PE.1 review)', () => {
    const three = [{ x: 0, y: 140 }, { x: 200, y: 130 }, { x: 430, y: 120 }]
    const { project, id } = addExistingRoad(bareDemo(), three)!
    const seen = (q: Project) => q.site.existingRoads![0].stretches
    expect(seen(updateExistingRoad(project, id, { stretches: [{ left: 1, right: 2 }] }))).toEqual([{ left: 1, right: 2 }, { left: 1, right: 2 }])
    expect(seen(updateExistingRoad(project, id, { stretches: [{ left: 1, right: 2 }, { left: 3, right: 4 }, { left: 5, right: 6 }] }))).toEqual([{ left: 1, right: 2 }, { left: 3, right: 4 }])
    const four = [...three, { x: 500, y: 100 }]
    expect(seen(updateExistingRoad(project, id, { points: four, stretches: [{ left: 1, right: 2 }] }))).toEqual([{ left: 1, right: 2 }, { left: 1, right: 2 }, { left: 1, right: 2 }])
    expect(ProjectSchema.safeParse(updateExistingRoad(project, id, { points: four, stretches: [{ left: 1, right: 2 }] })).success).toBe(true)
  })
})

describe('docks', () => {
  it('a program’s default, or none; a mass’s own walls (sorted, no repeats), or back to its program’s', () => {
    let p = setProgramDocks(bareDemo(), 'office', { per: 'm', every: 10 })
    expect(p.programs.find((g) => g.id === 'office')!.docks).toEqual({ per: 'm', every: 10 })
    p = setProgramDocks(p, 'office', null)
    expect(p.programs.find((g) => g.id === 'office')!.docks).toBeUndefined()
    p = setMassDocks(p, 'm1', [0.6, 0.1, 0.6])
    expect(p.masses.find((m) => m.id === 'm1')!.docks).toEqual([0.1, 0.6])
    p = setMassDocks(p, 'm1', [])
    expect(p.masses.find((m) => m.id === 'm1')!.docks).toEqual([])
    p = setMassDocks(p, 'm1', null)
    expect(p.masses.find((m) => m.id === 'm1')!.docks).toBeUndefined()
    valid(p)
  })
})

describe('roads', () => {
  const line = [
    { x: 0, y: 20 },
    { x: 200, y: 20 },
  ]

  it('a duplicated option brings its circulation', () => {
    let p = ownGates(addGate(bareDemo(), 'o1', 0.3).project, 'o1')
    p = drawStreet(p, 'o1', line)!.project
    p = setParking(p, 'o1', 'single')
    const copy = duplicateOption(p, 'o1')!
    const o2 = option(copy.project, copy.id)
    expect(o2.gates).toEqual(option(p).gates)
    expect(o2.streets).toEqual(option(p).streets)
    expect(o2.parking).toBe('single')
    expect(o2.streets).not.toBe(option(p).streets) // a copy, not shared
  })

  it('the option’s parking, cleared back to the standard’s; an option imported from another project brings it', () => {
    const p = setParking(bareDemo(), 'o1', 'single')
    expect(option(p).parking).toBe('single')
    expect(setParking(p, 'o1', 'single')).toBe(p)
    expect(option(setParking(p, 'o1', null)).parking).toBeUndefined()
    const made = importOption(bareDemo(), p, 'o1', '#1')!
    expect(option(made.project, made.id).parking).toBe('single')
    valid(made.project)
  })
})
describe('standards', () => {
  it('a change is kept; the same values are the same project', () => {
    const p = bareDemo()
    expect(updateStandards(p, { courtDepth: 40 })).toBe(p)
    const q = updateStandards(p, { courtDepth: 36, parking: 'single' })
    expect(standardsOf(q)).toMatchObject({ courtDepth: 36, parking: 'single', roadWidth: 8 })
  })
})
