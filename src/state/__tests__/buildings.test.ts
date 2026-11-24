// Building and option verbs (Decision "Buildings and options"), the v2 → v3 migration and the active option in the
// store. The demo: Building 1 (b1, levels 12 m) with m1, m2, m3 on L1 (l1), inside Option 1 (o1).
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { looseBuildings, optionBuildings } from '../../engine/buildings.ts'
import { asOption, derive } from '../../engine/derive.ts'
import { migrate } from '../../model/migrate.ts'
import { ProjectSchema } from '../../model/schema.ts'
import {
  addBuilding,
  addBuildingToOption,
  addOption,
  assignMasses,
  duplicateOption,
  importOption,
  makeBuildingUnique,
  moveBuildingInOption,
  removeBuilding,
  removeBuildingFromOption,
  removeOption,
  renameOption,
  updateBuilding,
  withoutEmptyBuildings,
} from '../actions/buildings.ts'
import { removeMasses } from '../actions/masses.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { addDimension } from '../actions/dimensions.ts'
import { addLevelAtEnd } from '../actions/levels.ts'
import { moveMasses } from '../actions/masses.ts'
import { demoProject } from '../demo.ts'
import { createAppStore } from '../store.ts'

const building = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
const option = (p: Project, id: string) => p.options.find((o) => o.id === id)!
const massesOf = (p: Project, buildingId: string) => {
  const levels = new Set(building(p, buildingId).levels.map((l) => l.id))
  return p.masses.filter((m) => levels.has(m.levelId)).map((m) => m.id)
}

describe('migration', () => {
  it('a version 2 file: its levels become Building 1’s, inside Option 1; level ids stay', () => {
    const { buildings, options: _o, ...rest } = demoProject()
    const levels = [{ id: 'l0', name: 'B1', elevation: -4, height: 4, repeat: 1 }, ...buildings[0].levels]
    const v3 = migrate({ ...rest, version: 2, levels }) as Project
    expect(v3.version).toBe(20)
    // its masses are blocks (Phase D.2): the first takes Building 1 over, each other has a building of its own beside it
    expect(v3.buildings[0]).toMatchObject({ id: 'b1', color: '#4e79a7', levelHeight: 12, levels })
    expect(v3.buildings).toHaveLength(v3.masses.length)
    // and the roads the app derived for it, drawn as its streets (v10 → v11)
    expect(v3.options).toEqual([{ id: 'o1', name: 'Option 1', buildingIds: v3.buildings.map((b) => b.id), streets: { nodes: expect.any(Array), segments: expect.any(Array) } }])
    expect(v3.options[0].buildingIds[0]).toBe('b1')
    expect(ProjectSchema.safeParse(v3).success).toBe(true)
  })
})

describe('migration v7 → v8', () => {
  it('a building no option shows goes, with its masses and its levels’ dimensions (Decision "No loose buildings")', () => {
    const a = addBuilding(demoProject())
    const loose = assignMasses(a.project, ['m3'], a.id)
    const dim = addDimension(loose, { x: 40, y: 70 }, { x: 250, y: 70 }, -5, building(loose, a.id).levels[0].id)!.project
    expect(looseBuildings(dim).map((b) => b.id)).toEqual([a.id])
    const v8 = migrate({ ...dim, version: 7 }) as Project
    expect(v8.version).toBe(20)
    // the loose building went; the two masses left are blocks, a building each (Phase D.2)
    expect(v8.buildings.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(v8.masses.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(v8.dimensions ?? []).toEqual([])
    expect(ProjectSchema.safeParse(v8).success).toBe(true)
  })
})

describe('buildings', () => {
  it('addBuilding: one level at the ground, the next colour; it joins an option only when asked', () => {
    const a = addBuilding(demoProject())
    expect(building(a.project, a.id)).toMatchObject({ name: 'Building 2', color: '#f28e2b', levelHeight: 12 })
    expect(building(a.project, a.id).levels).toEqual([{ id: a.levelId, name: 'L1', elevation: 0, height: 12, repeat: 1 }])
    expect(a.levelId).not.toBe('l1')
    expect(option(a.project, 'o1').buildingIds).toEqual(['b1'])
    const b = addBuilding(demoProject(), { name: 'Train station', optionId: 'o1' })
    expect(building(b.project, b.id).name).toBe('Train station')
    expect(option(b.project, 'o1').buildingIds).toEqual(['b1', b.id])
  })

  it('updateBuilding: name, colour, level height, Context; an empty name or nothing new changes nothing', () => {
    const p = demoProject()
    const q = updateBuilding(p, 'b1', { name: ' Context ', context: true, levelHeight: 9 })
    expect(building(q, 'b1')).toMatchObject({ name: 'Context', context: true, levelHeight: 9 })
    expect('context' in building(updateBuilding(q, 'b1', { context: false }), 'b1')).toBe(false)
    expect(updateBuilding(p, 'b1', { name: '  ' })).toBe(p)
    expect(updateBuilding(p, 'b1', { name: 'Building 1' })).toBe(p)
  })

  it('removeBuilding: only an empty one, not the last; options let go of it', () => {
    const p = demoProject()
    expect(removeBuilding(p, 'b1')).toBe(p)
    const a = addBuilding(p, { optionId: 'o1' })
    const q = removeBuilding(a.project, a.id)
    expect(q.buildings.map((b) => b.id)).toEqual(['b1'])
    expect(option(q, 'o1').buildingIds).toEqual(['b1'])
  })

  it('removeBuilding withMasses: its masses and its levels’ dimensions go too; without it, one with masses stays', () => {
    const d = addDimension(demoProject(), { x: 40, y: 70 }, { x: 250, y: 70 }, -5, 'l1')!.project
    const a = addBuilding(d, { optionId: 'o1' })
    expect(removeBuilding(a.project, 'b1')).toBe(a.project)
    const q = removeBuilding(a.project, 'b1', true)
    expect(q.buildings.map((b) => b.id)).toEqual([a.id])
    expect(q.masses).toEqual([])
    expect(q.dimensions).toEqual([])
    expect(option(q, 'o1').buildingIds).toEqual([a.id])
    expect(ProjectSchema.safeParse(q).success).toBe(true)
  })

  it('assignMasses: same-name level, else same elevation, else a copy of the level it leaves; it joins the option', () => {
    // Building 1 gets L2 (12 m); Building 2 has only L1; m3 goes up to L2
    let p = addLevelAtEnd(demoProject(), 'above').project
    const l2 = building(p, 'b1').levels[1]
    p = { ...p, masses: p.masses.map((m) => (m.id === 'm3' ? { ...m, levelId: l2.id } : m)) }
    const b = addBuilding(p)
    const q = assignMasses(b.project, ['m1', 'm3'], b.id, 'o1')
    expect(massesOf(q, b.id)).toEqual(['m1', 'm3'])
    expect(q.masses.find((m) => m.id === 'm1')!.levelId).toBe(b.levelId) // L1 by name
    const made = building(q, b.id).levels.find((l) => l.name === 'L2')!
    expect(made).toMatchObject({ elevation: 12, height: 12 })
    expect(q.masses.find((m) => m.id === 'm3')!.levelId).toBe(made.id)
    expect(option(q, 'o1').buildingIds).toEqual(['b1', b.id])
    // already there: nothing changes
    expect(assignMasses(q, ['m1'], b.id, 'o1')).toBe(q)
  })

  it('assignMasses lets go of the dimensions anchored to a mass it moves', () => {
    const d = addDimension(demoProject(), { x: 40, y: 70 }, { x: 250, y: 70 }, -5, 'l1')!
    expect(d.project.dimensions![0].anchorA?.massId).toBe('m1')
    const b = addBuilding(d.project)
    const q = assignMasses(b.project, ['m1'], b.id)
    expect(q.dimensions![0].anchorA).toBeUndefined()
    expect(q.dimensions![0].anchorB?.massId).toBe('m2')
  })
})

describe('options', () => {
  it('add, rename, duplicate (linked: the same buildings) and remove (not the last)', () => {
    const p = demoProject()
    const a = addOption(p)
    expect(option(a.project, a.id)).toEqual({ id: a.id, name: 'Option 2', buildingIds: [] })
    expect(option(renameOption(a.project, a.id, ' Scheme B '), a.id).name).toBe('Scheme B')
    const d = duplicateOption(p, 'o1')!
    expect(option(d.project, d.id).buildingIds).toEqual(['b1'])
    expect(removeOption(p, 'o1')).toBe(p)
    expect(removeOption(d.project, 'o1').options.map((o) => o.id)).toEqual([d.id])
  })

  it('a building into an option at a place, or to another place in it; the option’s order leads optionBuildings', () => {
    const a = addBuilding(demoProject(), { optionId: 'o1' })
    const b = addBuilding(a.project, { optionId: 'o1' })
    const c = addBuilding(b.project)
    expect(option(c.project, 'o1').buildingIds).toEqual(['b1', a.id, b.id])
    expect(looseBuildings(c.project).map((x) => x.id)).toEqual([c.id])
    const q = addBuildingToOption(c.project, 'o1', c.id, 1)
    expect(option(q, 'o1').buildingIds).toEqual(['b1', c.id, a.id, b.id])
    expect(looseBuildings(q)).toEqual([])
    const r = moveBuildingInOption(q, 'o1', b.id, 0)
    expect(option(r, 'o1').buildingIds).toEqual([b.id, 'b1', c.id, a.id])
    expect(optionBuildings(r, option(r, 'o1')).map((x) => x.name)).toEqual(['Building 3', 'Building 1', 'Building 4', 'Building 2'])
    expect(moveBuildingInOption(r, 'o1', b.id, 0)).toBe(r)
    expect(moveBuildingInOption(r, 'o1', 'nope', 0)).toBe(r)
    // off its building, the plan goes to the option's first building in that order
    const s = createAppStore(r)
    expect(s.getState().level).toBe('l1')
    s.getState().apply((p) => removeBuildingFromOption(p, 'o1', 'b1'))
    expect(s.getState().level).toBe(building(r, b.id).levels[0].id)
  })

  it('a building in or out of an option; out of its last one, it goes from the project with its masses (Decision "No loose buildings")', () => {
    const a = addBuilding(demoProject())
    const q = addBuildingToOption(a.project, 'o1', a.id)
    expect(option(q, 'o1').buildingIds).toEqual(['b1', a.id])
    expect(addBuildingToOption(q, 'o1', a.id)).toBe(q)
    const r = removeBuildingFromOption(q, 'o1', 'b1')
    expect(option(r, 'o1').buildingIds).toEqual([a.id])
    expect(r.buildings.map((b) => b.id)).toEqual([a.id])
    expect(r.masses).toEqual([])
    // shown by another option too: it stays, there
    const d = duplicateOption(demoProject(), 'o1')!
    const s = removeBuildingFromOption(d.project, 'o1', 'b1')
    expect(option(s, 'o1').buildingIds).toEqual([])
    expect(s.buildings.map((b) => b.id)).toEqual(['b1'])
    expect(s.masses).toHaveLength(3)
  })

  it('removeOption: the buildings no other option shows go too, with their masses and dimensions; a linked one stays', () => {
    const d = duplicateOption(demoProject(), 'o1')!
    // the copy shows b1 (linked) and a building of its own, with masses and a dimension
    const u = makeBuildingUnique(d.project, 'b1', d.id)!
    const q = addBuildingToOption(u.project, d.id, 'b1')
    const own = building(q, u.id).levels[0].id
    const withDim = addDimension(q, { x: 40, y: 70 }, { x: 250, y: 70 }, -5, own)!.project
    expect(massesOf(withDim, u.id)).toHaveLength(3)
    const r = removeOption(withDim, d.id)
    expect(r.options.map((o) => o.id)).toEqual(['o1'])
    expect(r.buildings.map((b) => b.id)).toEqual(['b1'])
    expect(r.masses.map((m) => m.id)).toEqual(massesOf(withDim, 'b1'))
    expect(r.dimensions ?? []).toEqual([])
    expect(looseBuildings(r)).toEqual([])
  })

  it('makeBuildingUnique: that option gets a copy (levels, masses, dimensions anchored to the copies); the others keep the original', () => {
    const withDim = addDimension(demoProject(), { x: 40, y: 70 }, { x: 250, y: 70 }, -5, 'l1')!.project
    const two = duplicateOption(withDim, 'o1')!
    const r = makeBuildingUnique(two.project, 'b1', two.id)!
    const copy = building(r.project, r.id)
    expect(copy.name).toBe('Building 1 · Option 2')
    expect(option(r.project, 'o1').buildingIds).toEqual(['b1'])
    expect(option(r.project, two.id).buildingIds).toEqual([r.id])
    expect(massesOf(r.project, r.id)).toHaveLength(3)
    expect(r.project.masses).toHaveLength(6)
    const dim = r.project.dimensions!.at(-1)!
    expect(dim.levelId).toBe(copy.levels[0].id)
    expect(massesOf(r.project, r.id)).toContain(dim.anchorA!.massId)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    // editing the copy leaves the original: they are no longer linked
    expect(makeBuildingUnique(r.project, r.id, two.id)).toBeNull() // only one option shows it now
    expect(makeBuildingUnique(withDim, 'b1', 'o1')).toBeNull()
  })

  it('importOption: another project’s option as a new one, its buildings copied as they are there (not linked)', () => {
    const p = addDimension(demoProject(), { x: 40, y: 70 }, { x: 250, y: 70 }, -5, 'l1')!.project
    // a specimen: the same project, a mass moved (its streets as they were)
    const from = moveMasses(p, ['m1'], { x: 5, y: 0 })
    const r = importOption(p, from, 'o1', '#23')!
    const made = option(r.project, r.id)
    expect(made.name).toBe('Option 1 · #23')
    expect(made.buildingIds).toHaveLength(1)
    const copy = building(r.project, made.buildingIds[0])
    expect(copy.name).toBe('Building 1 · #23')
    expect(made.streets).toEqual(from.options[0].streets)
    // the copy is the specimen's; the project's own option is as it was
    const mass = (q: Project, id: string) => q.masses.find((m) => m.id === id)!
    const copies = massesOf(r.project, copy.id)
    expect(copies).toHaveLength(3)
    expect(mass(r.project, copies[0]).footprint).toEqual(mass(from, 'm1').footprint)
    expect(mass(r.project, 'm1').footprint).toEqual(mass(p, 'm1').footprint)
    expect(option(r.project, 'o1')).toEqual(option(p, 'o1'))
    expect(r.project.dimensions!.at(-1)!.levelId).toBe(copy.levels[0].id)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    expect(importOption(p, from, 'nope', '#23')).toBeNull()
  })

  it('importOption into an option: it shows the copies instead, its name kept; its buildings no other option shows go', () => {
    const p = demoProject()
    const from = moveMasses(p, ['m1'], { x: 5, y: 0 })
    const r = importOption(p, from, 'o1', '#23', 'o1')!
    expect(r.id).toBe('o1')
    expect(r.project.options).toHaveLength(1)
    const made = option(r.project, 'o1')
    expect(made.name).toBe('Option 1')
    expect(made.buildingIds).not.toContain('b1')
    expect(r.project.buildings.map((b) => b.id)).toEqual(made.buildingIds)
    expect(massesOf(r.project, made.buildingIds[0])).toHaveLength(3)
    expect(r.project.masses).toHaveLength(3)
    // kept by a copy of the option first (the optimizer's Replace): b1 stays, there
    const d = duplicateOption(p, 'o1')!
    const s = importOption(d.project, from, 'o1', '#23', 'o1')!
    expect(option(s.project, d.id).buildingIds).toEqual(['b1'])
    expect(s.project.buildings.map((b) => b.id)).toContain('b1')
    expect(importOption(p, from, 'o1', '#23', 'nope')).toBeNull()
  })
})

describe('asOption', () => {
  it('the same Derived, with another option’s metrics and issues', () => {
    const a = addBuilding(demoProject())
    const two = addOption(a.project, { buildingIds: [a.id] })
    const d = derive(two.project, 'o1')
    const other = asOption(d, two.id)
    expect(other).toMatchObject({ option: two.id, metrics: d.options[two.id].metrics, issues: d.options[two.id].issues })
    expect(other.metrics.builtMasses).toBe(0)
    expect(other.masses).toBe(d.masses)
    expect(asOption(d, 'nope')).toBe(d)
  })
})

describe('the active option in the store', () => {
  it('starts on the first; setOption measures that one and, off its buildings, goes to its first building', () => {
    const a = addBuilding(demoProject())
    const two = addOption(a.project, { buildingIds: [a.id] })
    const s = createAppStore(two.project)
    expect(s.getState()).toMatchObject({ option: 'o1', level: 'l1' })
    expect(s.getState().derived.metrics.builtMasses).toBe(3)
    s.getState().select('m1')
    s.getState().setOption(two.id)
    expect(s.getState()).toMatchObject({ option: two.id, level: a.levelId, selection: { massIds: [] } })
    expect(s.getState().derived.option).toBe(two.id)
    expect(s.getState().derived.metrics.builtMasses).toBe(0)
    // an edit keeps measuring the active option
    s.getState().apply((p) => renameOption(p, 'o1', 'A'))
    expect(s.getState().derived.option).toBe(two.id)
    // removed (undo of its creation, another project): back to the first
    s.getState().apply((p) => removeOption(p, two.id))
    expect(s.getState().option).toBe('o1')
  })
})

describe('no empty buildings (Decision "No empty buildings")', () => {
  it('a building whose masses all went goes with them, in one undo step; one made empty stays; an option keeps its only one', () => {
    const s = createAppStore(demoProject())
    const p0 = s.getState().project
    // a second building in the option, with the demo's m3 assigned to it
    const added = addBuilding(p0, { name: 'Annex', optionId: 'o1' })
    s.getState().apply(() => assignMasses(added.project, ['m3'], added.id, 'o1'))
    expect(s.getState().project.buildings.map((b) => b.name)).toEqual(['Building 1', 'Annex'])
    // its only mass deleted: it goes
    s.getState().apply((p) => removeMasses(p, ['m3']))
    expect(s.getState().project.buildings.map((b) => b.name)).toEqual(['Building 1'])
    s.getState().undo()
    expect(s.getState().project.buildings.map((b) => b.name)).toEqual(['Building 1', 'Annex'])
    // + Building: empty from the start, it stays
    s.getState().apply((p) => addBuilding(p, { name: 'New', optionId: 'o1' }).project)
    expect(s.getState().project.buildings.map((b) => b.name)).toContain('New')
    // the option's only building, emptied: it stays
    const q = s.getState().project
    const alone = removeMasses(q, q.masses.map((m) => m.id))
    expect(withoutEmptyBuildings({ ...alone, options: alone.options.map((o) => ({ ...o, buildingIds: ['b1'] })) }, q).buildings.map((b) => b.id)).toContain('b1')
  })

  it('a project read lets its empty buildings go', () => {
    const p = addBuilding(demoProject(), { name: 'Empty', optionId: 'o1' }).project
    const r = readGft(writeGft(p))
    expect(r.ok && r.project.buildings.map((b) => b.name)).toEqual(['Building 1'])
  })
})
