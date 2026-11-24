// The program as a rule set (Decision "Program rule set", K.1): its kind, its grid and range, a Warehouse program's
// warehouse type (one per program); a v6 file's types each moved onto a program of their own; the verbs that keep a
// program and its type together (added, copied, removed, its kind changed).
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Project } from '../../model/schema.ts'
import { migrate } from '../../model/migrate.ts'
import { definitionOf, kindOf, programGrid, programRange } from '../../engine/programs.ts'
import { newWarehouseType } from '../../modules/warehouse/engine/defaults.ts'
import { demoProject } from '../demo.ts'
import { copyProgram, removeProgram, setProgramKind, updateProgram } from '../actions/programs.ts'
import { addWarehouseType, duplicateWarehouseType, placeWarehouse, setWarehouseProgram } from '../../modules/warehouse/actions.ts'

const typeOn = (p: Project, programId: string) => definitionOf(p, programId)!

describe('a program’s kind, grid and range', () => {
  it('free unless it says; the typology’s warehouse and office say', () => {
    const p = demoProject()
    expect(p.programs.map((g) => [g.id, kindOf(g)])).toEqual([
      ['warehouse', 'warehouse'],
      ['office', 'office'],
      ['guardhouse', 'free'],
      ['outdoor-storage', 'free'],
    ])
  })

  it('its own grid and range while it has no type; a Warehouse program’s, its type’s', () => {
    let p = updateProgram(demoProject(), 'office', { grid: { x: 8, y: 8, modules: 1 }, range: { width: [30, 40] } })
    const office = p.programs.find((g) => g.id === 'office')!
    expect(programGrid(p, office)).toEqual({ x: 8, y: 8, modules: 1 })
    expect(programRange(p, office)).toEqual({ width: [30, 40] })
    p = addWarehouseType(p).project
    const t = typeOn(p, 'warehouse')
    const warehouse = p.programs.find((g) => g.id === 'warehouse')!
    expect(programGrid(p, warehouse)).toEqual(t.grid)
    expect(programRange(p, warehouse)).toBeUndefined()
  })
})

describe('one program, one type', () => {
  it('a new type defines the brief’s first Warehouse program without one, its grid and range moved onto it', () => {
    let p = updateProgram(demoProject(), 'warehouse', { grid: { x: 12, y: 24, modules: 4 }, range: { width: [180, 240], depth: [84, 108] } })
    const r = addWarehouseType(p)
    p = r.project
    const t = p.warehouseTypes!.find((x) => x.id === r.id)!
    expect(t.program).toBe('warehouse')
    expect(t.grid).toEqual({ x: 12, y: 24, modules: 4 })
    expect(t.hall.range).toEqual({ length: [180, 240], width: [84, 108] })
    const g = p.programs.find((x) => x.id === 'warehouse')!
    expect([g.grid, g.range, g.kind]).toEqual([undefined, undefined, 'warehouse'])
  })

  it('a second type: a Warehouse program of its own, named after it; or the program asked for', () => {
    let p = addWarehouseType(demoProject()).project
    const r = addWarehouseType(p)
    p = r.project
    const t = p.warehouseTypes!.find((x) => x.id === r.id)!
    const g = p.programs.find((x) => x.id === t.program)!
    expect([g.name, g.kind, g.built]).toEqual([t.name, 'warehouse', true])
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    const office = addWarehouseType(demoProject(), { program: 'office' }).project
    expect(typeOn(office, 'office').program).toBe('office')
  })

  it('no two types define one program: the schema says so, the hall’s program is not taken', () => {
    const p = addWarehouseType(addWarehouseType(demoProject()).project).project
    const [a, b] = p.warehouseTypes!
    const both = { ...p, warehouseTypes: [a, { ...b, program: a.program }] }
    expect(ProjectSchema.safeParse(both).error?.issues[0].message).toBe(`two warehouse types define program "${a.program}"`)
    expect(setWarehouseProgram(p, b.id, a.program!)).toBe(p)
    const q = setWarehouseProgram(p, b.id, 'office')
    expect(typeOn(q, 'office').id).toBe(b.id)
    expect(q.programs.find((g) => g.id === 'office')!.kind).toBe('warehouse')
  })

  it('a type duplicated comes on a copy of its program (its target stays); a program copied brings a copy of its type', () => {
    const p = addWarehouseType(demoProject()).project
    const t = typeOn(p, 'warehouse')
    const d = duplicateWarehouseType(p, t.id)!
    const copy = d.project.warehouseTypes!.find((x) => x.id === d.id)!
    const g = d.project.programs.find((x) => x.id === copy.program)!
    expect([g.kind, g.docks, g.target, copy.grid]).toEqual(['warehouse', p.programs[0].docks, undefined, t.grid])
    const c = copyProgram(p, 'warehouse')!
    expect(typeOn(c.project, c.id)).toMatchObject({ grid: t.grid, hall: t.hall })
    expect(ProjectSchema.safeParse(c.project).success).toBe(true)
  })

  it('a program removed takes its type; one that stops being a warehouse loses it, its copies unlinked', () => {
    let p = addWarehouseType(demoProject()).project
    const t = typeOn(p, 'warehouse')
    expect(removeProgram(p, 'warehouse', true).warehouseTypes).toBeUndefined()
    p = placeWarehouse(p, t.id, { x: 100, y: 100 }, 0, 'o1')!.project
    const office = setProgramKind(p, 'warehouse', 'office')
    expect(office.warehouseTypes).toBeUndefined()
    expect(office.buildings.some((b) => b.warehouse)).toBe(false)
    expect(office.programs[0].kind).toBe('office')
    expect(setProgramKind(p, 'warehouse', 'warehouse')).toBe(p)
  })
})

describe('a v6 file', () => {
  /** A v6 project: types A (on Warehouse) and B (on Warehouse too, a copy placed) and C (on none). */
  function v6(): Record<string, unknown> {
    let p = demoProject()
    const a = { ...newWarehouseType('wa', 'Warehouse A'), program: 'warehouse' }
    const b = { ...newWarehouseType('wb', 'Warehouse B'), program: 'warehouse' }
    const c = newWarehouseType('wc', 'Warehouse C')
    p = { ...p, warehouseTypes: [a, b, c] }
    p = placeWarehouse(p, 'wb', { x: 100, y: 100 }, 0, 'o1')!.project
    const { kind: _, ...warehouse } = p.programs[0]
    return { ...p, version: 6, programs: [warehouse, ...p.programs.slice(1).map(({ kind: __, ...g }) => g)] }
  }

  it('each type on a program of its own: the first keeps it, the others get one named after them', () => {
    const m = migrate(v6()) as Project
    expect(m.version).toBe(20)
    // the office mass is a block now, of a type of its own (Phase D.2)
    expect(m.warehouseTypes!.map((t) => t.program)).toEqual(['warehouse', 'p1', 'p2', 'office'])
    expect(m.programs.slice(4).map((g) => [g.id, g.name, g.kind, g.docks])).toEqual([
      ['p1', 'Warehouse B', 'warehouse', { per: 'm2', every: 700 }],
      ['p2', 'Warehouse C', 'warehouse', undefined],
    ])
    expect(m.programs[0].kind).toBe('warehouse')
    expect(ProjectSchema.safeParse(m).success).toBe(true)
  })

  it('B’s copy’s masses move onto its new program; the rest stay', () => {
    const before = v6() as unknown as Project
    const m = migrate(v6() as Record<string, unknown>) as Project
    const copy = m.buildings.find((b) => b.warehouse?.type === 'wb')!
    const levels = new Set(copy.levels.map((l) => l.id))
    const made = m.masses.filter((x) => levels.has(x.levelId))
    expect(made.length).toBeGreaterThan(0)
    expect(made.every((x) => x.programId === 'p1')).toBe(true)
    const others = m.masses.filter((x) => !levels.has(x.levelId))
    expect(others.map((x) => x.programId)).toEqual(before.masses.filter((x) => !levels.has(x.levelId)).map((x) => x.programId))
  })
})
