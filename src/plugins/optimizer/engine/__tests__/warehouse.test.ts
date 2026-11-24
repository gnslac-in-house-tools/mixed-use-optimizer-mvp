// The optimizer on a warehouse type (W.7, Decisions "Warehouse type", "Block shape"): with copies of a type in the option,
// each copy's box's length and width go as a variant may take them by hand (B.4: whole modules from the block's size,
// within its range, else two bays either way), its inner walls keeping their distance from the nearer outer wall; its
// decoded, each copy is a variant of its type, remade where it stands. Its masses keep
// the type's shape (no proportion gene). With warehouse types, the typology's plan starts from the type: Warehouse type →
// Placement → Roads.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import {
  addWarehouseType,
  lockWarehouseStep,
  moveBlockEdge,
  placeWarehouse,
  shapeWarehouse,
  stretchWarehouseHall,
} from '../../../../modules/warehouse/actions.ts'
import { copyGenerated } from '../../../../modules/warehouse/engine/copies.ts'
import { cornersOnLinesOf } from '../../../../modules/warehouse/engine/shape.ts'
import { migrate } from '../../../../model/migrate.ts'
import { ProjectSchema } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { problemOf } from '../problem.ts'
import { stagesFor } from '../../data.ts'
import type { Template } from '../template.ts'
import { MASSES } from '../../../../typologies/plans.ts'

const only = (...kinds: { kind: string; step: number; range?: number }[]): Template => ({ ...MASSES, variables: kinds, objectives: [{ measure: 'brief-gap', sense: 'min' }] })

function withCopy(): { p: Project; type: string; copy: string } {
  const made = addWarehouseType(demoProject())
  const placed = placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
  return { p: placed.project, type: made.id, copy: placed.id }
}

describe('the optimizer on a warehouse type', () => {
  it('the hall: its length and width two bays either way in whole modules from the block’s size, a module a step; decoded, the copy a variant of its type', () => {
    const { p, copy } = withCopy()
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 1 }))
    const length = t.variables.find((v) => v.key === `${copy}.length`)!
    expect(length.gene).toMatchObject({ kind: 'real', min: 176, max: 224, step: 3 })
    expect(length.read(p)).toBe(200)
    const q = t.decode(t.variables.map((v) => (v.key === `${copy}.length` ? 180 : v.read(p))))
    const b = q.buildings.find((x) => x.id === copy)!
    expect(b.warehouse!.overrides!.hall!.length).toBe(180)
    const hall = q.masses.find((m) => m.part === 'hall' && b.levels.some((l) => l.id === m.levelId))!
    expect(hall.footprint).toMatchObject({ kind: 'rect', width: 180.6 })
  })

  it('a range of the type’s; its masses keep their shape', () => {
    const { p: p0, copy } = withCopy()
    // the type's range for its length; two modules a step
    const p = { ...p0, warehouseTypes: p0.warehouseTypes!.map((t) => ({ ...t, hall: { ...t.hall, range: { length: [150, 210] as [number, number] } } })) }
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 2 }, { kind: 'mass.proportion', step: 1 }))
    // from the block's 200 m by 3 m modules: 152 to 209, as a wall dragged by hand reaches (B.2)
    expect(t.variables.find((v) => v.key === `${copy}.length`)!.gene).toMatchObject({ min: 152, max: 209, step: 6 })
    expect(t.variables.some((v) => v.kind === 'mass.proportion' && p.masses.find((m) => m.id === v.target)?.part)).toBe(false)
  })

  it('each copy’s own hall (B.4): its genes read its variant, and a value goes to that copy alone; the block’s size is no change', () => {
    const { p: p0, copy: a } = withCopy()
    const placed = placeWarehouse(p0, p0.warehouseTypes![0].id, { x: 200, y: 330 }, 0, 'o1')!
    const b = placed.id
    // b's far wall out two modules by hand
    const p = stretchWarehouseHall(placed.project, b, { axis: 'length', end: 1 }, 6).project
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 1 }))
    expect(t.variables.map((v) => v.key)).toEqual([`${a}.length`, `${a}.width`, `${b}.length`, `${b}.width`])
    const read = (key: string) => t.variables.find((v) => v.key === key)!.read(p)
    expect([read(`${a}.length`), read(`${b}.length`)]).toEqual([200, 206])
    // the design as it is reads back the same
    const same = t.decode(t.variables.map((v) => v.read(p)))
    expect(same.buildings.find((x) => x.id === b)!.warehouse!.overrides).toEqual({ hall: { length: 206 } })
    // a's longer, b's back to its block's: each its own
    const q = t.decode(t.variables.map((v) => (v.key === `${a}.length` ? 212 : v.key === `${b}.length` ? 200 : v.read(p))))
    const hall = (id: string) => q.buildings.find((x) => x.id === id)!.warehouse!.overrides?.hall
    expect(hall(a)).toEqual({ length: 212 })
    expect(hall(b)).toBeUndefined()
  })

  it('the box (Decision "Block shape"): longer, a notch by the right wall stays its distance from it; no gene for the bumps', () => {
    let { p, type, copy } = withCopy()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, type, s)
    // a notch in the back by the right wall: modules 56 to 62 of 66, 4 in
    p = shapeWarehouse(p, type, { kind: 'pull', edge: 'e3', from: 56, to: 62, by: -4 }).project
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 1 }))
    expect(t.variables.map((v) => v.key)).toEqual([`${copy}.length`, `${copy}.width`])
    // the longest it may be: 24 m (8 modules) longer, the notch 8 modules on
    const q = t.decode(t.variables.map((v) => (v.key.endsWith('length') ? (v.gene as { max: number }).max : v.read(p))))
    const b = q.buildings.find((x) => x.id === copy)!
    expect(b.warehouse!.overrides).toEqual({ hall: { length: 224 } })
    // (its outline is in metres: read back onto its module lines)
    const g = copyGenerated(q.warehouseTypes![0], b.warehouse!)
    const xs = cornersOnLinesOf(g.outline, g.runs)!.filter((c) => c.y === 28).map((c) => c.x)
    expect(xs.sort((m, n) => m - n)).toEqual([64, 70])
  })

  it('a copy’s own outline (an inner wall moved by hand, BS.5) on a longer box: its notch keeps its distance; its docks its own, with its own outline (one bundle: Decision "Elements by module")', () => {
    let { p, type, copy } = withCopy()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, type, s)
    p = shapeWarehouse(p, type, { kind: 'pull', edge: 'e3', from: 56, to: 62, by: -4 }).project
    // this copy's notch a module shallower: its own outline
    const b0 = p.buildings.find((x) => x.id === copy)!
    const bottom = copyGenerated(p.warehouseTypes![0], b0.warehouse!).edges.find((e) => e.horizontal && !e.outer)!
    p = moveBlockEdge(p, copy, bottom.id, 1).project
    expect(p.buildings.find((x) => x.id === copy)!.warehouse!.overrides!.morphology!.outline).toHaveLength(8)
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 1 }))
    const q = t.decode(t.variables.map((v) => (v.key.endsWith('length') ? (v.gene as { max: number }).max : v.read(p))))
    const b = q.buildings.find((x) => x.id === copy)!
    // longer by 8 modules: its own notch (3 in, at y 29) 8 modules on, by the right wall still; its docks its own, the
    // type's as they stood when its inner wall was moved
    expect(b.warehouse!.overrides).toMatchObject({ hall: { length: 224 } })
    expect(b.warehouse!.overrides!.elements!.length).toBe(p.warehouseTypes![0].elements.length)
    const g = copyGenerated(q.warehouseTypes![0], b.warehouse!)
    expect(cornersOnLinesOf(g.outline, g.runs)!.filter((c) => c.y === 29).map((c) => c.x).sort((m, n) => m - n)).toEqual([64, 70])
    // the docks on the front, every bay but the ends, as the type's were
    expect(g.doors.filter((d) => d.edge === 'e1').length).toBeGreaterThan(0)
  })

  it('a saved run naming warehouse.elements reads without it (BE.3: the docks are the designer’s)', () => {
    const { p, type, copy } = withCopy()
    // a run saved before: its variables include the retired kind
    const t = problemOf(p, 'o1', only({ kind: 'warehouse.hall', step: 1 }, { kind: 'warehouse.elements', step: 1 }))
    expect(t.variables.map((v) => v.key)).toEqual([`${copy}.length`, `${copy}.width`])
    expect(t.variables.some((v) => v.key.startsWith(`${type}.`))).toBe(false)
    expect(t.missing).toContain('warehouse.elements')
    const q = t.decode(t.variables.map((v) => v.read(p)))
    expect(q.buildings.find((b) => b.id === copy)!.warehouse!.overrides?.elements).toBeUndefined()
  })

  it('with warehouse types, the typology’s plan starts from the type (its module on); without, from the grid', () => {
    expect(stagesFor(addWarehouseType(demoProject()).project).map((s) => s.name)).toEqual(['Warehouse type', 'Placement', 'Streets', 'Parking'])
    expect(stagesFor(demoProject()).map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    // a typology that does not offer the warehouse: its own plan, whatever the project holds
    const blank = { ...addWarehouseType(demoProject()).project, typology: 'blank' }
    expect(stagesFor(blank).map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
  })

  it('the masses’ template on a project whose masses migrated varies each block’s box, and no footprint (Phase D.2)', () => {
    const q = ProjectSchema.parse(migrate({ ...JSON.parse(JSON.stringify(demoProject())), version: 16 }))
    expect(q.masses.every((m) => m.part === 'hall')).toBe(true)
    const t = problemOf(q, 'o1', MASSES)
    expect(t.variables.some((v) => v.kind === 'warehouse.hall')).toBe(true)
    expect(t.variables.some((v) => v.kind === 'mass.proportion')).toBe(false)
    expect(MASSES.variables.map((v) => v.kind)).toEqual(['mass.position', 'mass.rotation', 'warehouse.hall'])
  })
})
