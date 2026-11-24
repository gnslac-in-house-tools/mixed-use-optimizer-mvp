// Elements by module (Decision "Elements by module", BE.1): a block's docks, doors and patterns one record per module,
// anchored on the module lines as the outline's corners are, so stretching a wall never slides them or changes their
// number; old rules ("bays 2, 3 and 5", "every nth bay") read into the modules they placed, every door where it stood.
import { describe, expect, it } from 'vitest'
import { BLOCK_VERSION, BlockSchema, type HallElement, type Project, type WarehouseType } from '../../../../model/schema.ts'
import { migrate } from '../../../../model/migrate.ts'
import { demoProject } from '../../../../state/demo.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { addWarehouseType, moveBlockEdge, placeWarehouse, setWarehouseOverrides, shapeWarehouse, stretchWarehouseHall, updateWarehouseStep } from '../../actions.ts'
import type { HallRuns, Run } from '../bays.ts'
import { boxOutline, anchorModule, elementsNearest, type ShapeEdge } from '../shape.ts'
import { copyGenerated, onPlace } from '../copies.ts'
import { generate, typeWith } from '../generate.ts'
import type { LegacyType } from '../legacy/types.ts'
import { inLines, projectInLines } from './inLines.ts'
import { blockOf } from '../library.ts'
import { elementsByModule, legacyDoorsAt, legacySpots, migrateBlock, oldElementsWith, typeByModule, typeOrNone, typeToMetres, type LegacyElement, type OldElementsType } from '../migrate.ts'

const dock = (module: number, edge = 'e1', id = `d${module}`): HallElement => ({ id, kind: 'dock', edge, module, width: 3 })
/** An old rule: every interior bay, `count` a bay, as the sample and a new type had them. */
const rule = (id: string, edge: string, count: number, pitch?: number): LegacyElement => ({ id, kind: 'dock', edge, bays: { every: 1, offset: 0, skip: 'ends' }, count, ...(pitch ? { pitch } : {}), width: 3 })
/** Two sets of doors standing in the same places, each within a few mm (a module's centre and a rule's piece on it
 *  differ by their rounding). */
function expectAt(a: { at: { x: number; y: number } }[], b: { at: { x: number; y: number } }[]) {
  const cm = (v: number) => Math.round(v * 100)
  const sorted = (l: { at: { x: number; y: number } }[]) => l.map((d) => d.at).sort((p, q) => cm(p.x) - cm(q.x) || cm(p.y) - cm(q.y))
  const [x, y] = [sorted(a), sorted(b)]
  expect(x).toHaveLength(y.length)
  x.forEach((p, i) => {
    expect(p.x).toBeCloseTo(y[i].x, 2)
    expect(p.y).toBeCloseTo(y[i].y, 2)
  })
}

/** A block 36 × 24 m on 12 m bays of 4 modules (12 × 8 modules), its outline drawn, docked on its front; in a project. */
function inProject(elements: HallElement[]): { p: Project; t: WarehouseType } {
  const { project, id } = addWarehouseType(demoProject())
  const was = project.warehouseTypes!.find((x) => x.id === id)!
  const t: WarehouseType = { ...was, grid: { x: 12, y: 12, modules: 4 }, hall: { length: 36, width: 24, ends: 'both' }, morphology: { outline: boxOutline(36, 24), holes: [] }, elements }
  return { p: { ...project, warehouseTypes: project.warehouseTypes!.map((x) => (x.id === id ? t : x)) }, t }
}
const small = (elements: HallElement[]) => inProject(elements).t
/** A block 36 × 24 m as the designer types it (no outline drawn), its docks put on these modules by the tools. */
function typed(modules: number[]): { p: Project; id: string } {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'grid', { x: 12, y: 12, modules: 4 })
  p = updateWarehouseStep(p, id, 'hall', { length: 36, width: 24, ends: 'both' })
  p = updateWarehouseStep(p, id, 'elements', modules.map((k) => dock(k)))
  return { p, id }
}

describe('anchorModule', () => {
  it('anchorModule keeps each half’s distance from its wall', () => {
    expect(anchorModule(2, 10, 12)).toBe(2)
    expect(anchorModule(8, 10, 12)).toBe(10)
    expect(anchorModule(8, 10, 8)).toBe(6)
    expect(anchorModule(2, 10, 8)).toBe(2)
  })
})

describe('the migration', () => {
  it('a rule of every module migrates exactly', () => {
    const t = small([])
    const old: OldElementsType = { ...inLines(t), elements: [{ id: 'd1', kind: 'dock', edge: 'e1', bays: [1, 2], count: t.grid.modules, width: 3 }] }
    const g = generate(t)
    const was = legacySpots(g.runs, g.edges.find((e) => e.id === 'e1')!, old.elements[0] as LegacyElement)
    const els = elementsByModule(old)
    expect(els.map((e) => e.module)).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
    expect(els.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
    const now = generate({ ...t, elements: els }).doors.map((d) => d.at.x)
    expect(now).toHaveLength(was.length)
    now.forEach((x, i) => expect(x).toBeCloseTo(was[i], 3))
  })

  it('a piece off a module centre goes to the nearest module', () => {
    // a bay of 3 modules (4 m): 2 docks 6 m apart go to its first and last modules; 3 m apart, both to its middle one
    const t = { ...small([]), grid: { x: 12, y: 12, modules: 3 }, morphology: { outline: boxOutline(36, 24), holes: [] } }
    const apart = elementsByModule({ ...inLines(t), elements: [{ id: 'd1', kind: 'dock', edge: 'e1', bays: [1], count: 2, pitch: 6, width: 3 }] })
    expect(apart.map((e) => e.module)).toEqual([3, 5])
    const close = elementsByModule({ ...inLines(t), elements: [{ id: 'd1', kind: 'dock', edge: 'e1', bays: [1], count: 2, pitch: 3, width: 3 }] })
    expect(close.map((e) => e.module)).toEqual([4])
  })

  it('migration keeps every door where it was', () => {
    // the sample's blocks as they were written: every interior bay, 2 docks a bay, on these edges
    const rules: Record<string, string[]> = { 'Cross-dock': ['e1', 'e3'], 'Rear-load': ['e1'] }
    const p = projectInLines(sampleProject())
    // the sample's drawn blocks (the guard house, the yard) have no elements to keep
    for (const t of (p.warehouseTypes! as unknown as LegacyType[]).filter((x) => rules[x.name])) {
      const old: OldElementsType = { ...t, elements: rules[t.name].map((edge, i) => rule(`e${i + 1}`, edge, 2)) }
      const was = legacyDoorsAt(old)
      expect(was.length).toBeGreaterThan(0)
      expectAt(generate(typeToMetres({ ...t, elements: elementsByModule(old) })).doors, was)
      // and the sample writes them so
      expectAt(generate(typeToMetres(t)).doors, was)
    }
  })

  it('a project of version 12: its blocks’ and its copies’ doors where they stood, a copy of another length too', () => {
    const p = projectInLines(sampleProject())
    const rules: Record<string, string[]> = { 'Cross-dock': ['e1', 'e3'], 'Rear-load': ['e1'] }
    const types = p.warehouseTypes!.map((t) => ({ ...t, elements: (rules[t.name] ?? []).map((edge, i) => rule(`e${i + 1}`, edge, 2)) }))
    const v12 = { ...p, version: 12, warehouseTypes: types } as unknown as Record<string, unknown>
    const read = migrate(v12) as unknown as Project
    expect(read.version).toBe(20)
    // the guard houses are drawn blocks of the sample, with no docks to keep
    for (const b of p.buildings.filter((x) => x.warehouse && rules[types.find((t) => t.id === x.warehouse!.type)!.name])) {
      const w = b.warehouse!
      const old = types.find((t) => t.id === w.type)!
      const was = legacyDoorsAt(oldElementsWith(old as unknown as OldElementsType, w.overrides as never))
      const t = read.warehouseTypes!.find((x) => x.id === w.type)!
      const copy = read.buildings.find((x) => x.id === b.id)!.warehouse!
      expect(was.length).toBeGreaterThan(0)
      expectAt(copyGenerated(t, copy).doors, was)
    }
  })

  it('a copy two bays longer of a block with no outline drawn: its rule’s docks in the new middle bays too, its own', () => {
    // a new block's rule (every module of every interior bay) and a copy 24 m longer: the rule filled its new bays
    let { project: p, id } = addWarehouseType(demoProject())
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = placed.project
    const t = p.warehouseTypes!.find((x) => x.id === id)!
    const old = { ...inLines(t), elements: [rule('e1', 'e1', t.grid.modules)] }
    const buildings = p.buildings.map((b) => (b.id === placed.id ? { ...b, warehouse: { ...b.warehouse!, overrides: { hall: { length: t.hall.length + 24 } } } } : b))
    const v12 = { ...p, version: 12, warehouseTypes: [old], buildings } as unknown as Record<string, unknown>
    const read = migrate(v12) as unknown as Project
    const copy = read.buildings.find((b) => b.id === placed.id)!.warehouse!
    const was = legacyDoorsAt(oldElementsWith(old as unknown as OldElementsType, { hall: { length: t.hall.length + 24 } }))
    expect(was).toHaveLength(68)
    expectAt(copyGenerated(read.warehouseTypes![0], copy).doors, was)
    expect(copy.overrides!.elements).toHaveLength(68)
    // the block itself as its rule had it
    expectAt(generate(read.warehouseTypes![0]).doors, legacyDoorsAt(old as unknown as OldElementsType))
  })

  it('a block’s file of format 3: format 4, its docks by module where they stood', () => {
    const { p, t } = inProject([])
    const old = { ...inLines(t), elements: [rule('d1', 'e1', 4)] }
    const file = { ...blockOf(p, t.id, 'b1', 1, 0)!, formatVersion: 3, type: old }
    const r = BlockSchema.safeParse(migrateBlock(file))
    expect(r.success).toBe(true)
    expect(r.data!.formatVersion).toBe(BLOCK_VERSION)
    expectAt(generate(r.data!.type).doors, legacyDoorsAt(old as unknown as OldElementsType))
  })
})

describe('anchored on the module lines', () => {
  it('a copy stretched at its low wall keeps its docks', () => {
    const t = small([dock(1), dock(2), dock(9), dock(10)])
    const module = t.grid.x / t.grid.modules
    const longer = generate(typeWith(t, { hall: { length: t.hall.length + 2 * module } }))
    expect(longer.doors.map((d) => d.module)).toEqual([1, 2, 11, 12])
    // on the site, the low wall pulled out 2 modules: the docks by it went out with it, the others stayed
    let { p } = inProject(t.elements)
    const placed = placeWarehouse(p, t.id, { x: 100, y: 100 }, 0, p.options[0].id)!
    p = placed.project
    const onSite = () => {
      const w = p.buildings.find((b) => b.id === placed.id)!.warehouse!
      return copyGenerated(t, w).doors.map((d) => ({ module: d.module, x: Math.round((w.place.x + d.at.x) * 1000) / 1000 }))
    }
    const before = onSite()
    p = stretchWarehouseHall(p, placed.id, { axis: 'length', end: 0 }, 2 * module).project
    const after = onSite()
    expect(after.map((d) => d.module)).toEqual([1, 2, 11, 12])
    expect(after.map((d) => d.x)).toEqual([before[0].x - 2 * module, before[1].x - 2 * module, before[2].x, before[3].x])
  })

  it('a shorter box takes the modules that go with their docks, and two on one module are one', () => {
    const t = small([dock(1), dock(5), dock(6), dock(10)])
    const module = t.grid.x / t.grid.modules
    const shorter = generate(typeWith(t, { hall: { length: t.hall.length - 2 * module } }))
    expect(shorter.doors.map((d) => d.module)).toEqual([1, 4, 8])
  })

  it('an edge split hands its elements to the piece they stand on', () => {
    let { p, id } = typed([1, 2, 9, 10])
    // a notch pushed 2 modules into the front, from module line 4 to 8: e1 keeps 0–4, the rest past it 8–12
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 4, to: 8, by: -2 }).project
    const t = p.warehouseTypes!.find((x) => x.id === id)!
    const g = generate(t)
    const rest = g.edges.find((e) => e.horizontal && e.outer && e.side === 'front' && e.id !== 'e1')!
    expect(g.doors.map((d) => [d.edge, d.module])).toEqual([
      ['e1', 1],
      ['e1', 2],
      [rest.id, 9],
      [rest.id, 10],
    ])
    expect(new Set(t.elements.map((e) => e.id)).size).toBe(4)
  })

  it('a bump out of the low wall moves the box’s line A: the docks stand where they stood', () => {
    const { p, id } = typed([1, 10])
    const before = generate(p.warehouseTypes!.find((x) => x.id === id)!)
    const r = shapeWarehouse(p, id, { kind: 'pull', edge: 'e4', from: 2, to: 6, by: 2 })
    const after = generate(r.project.warehouseTypes!.find((x) => x.id === id)!)
    expect(after.doors.map((d) => d.module)).toEqual([3, 12])
    expect(after.doors.map((d) => d.at.x + r.shift.x)).toEqual(before.doors.map((d) => d.at.x))
  })
})

describe('on the box as it is now (review round 1)', () => {
  const docksOf = (p: Project, id: string) => generate(p.warehouseTypes!.find((x) => x.id === id)!).doors.filter((d) => d.kind === 'dock')

  it('a block of 200 m made 120 m: its 34 docks stay 34 on a copy grown 2 modules at either wall; shrunk, the 2 middle modules take theirs', () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length: 120 })
    const t = p.warehouseTypes!.find((x) => x.id === id)!
    // stored on the box as it is: 40 modules, the docks on 3–36 (each half kept from its wall)
    expect(t.elements.map((e) => e.module)).toEqual(Array.from({ length: 34 }, (_, i) => 3 + i))
    expect(docksOf(p, id)).toHaveLength(34)
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    const docksAfter = (end: 0 | 1, d: number) => {
      const q = stretchWarehouseHall(placed.project, placed.id, { axis: 'length', end }, d).project
      return copyGenerated(t, q.buildings.find((b) => b.id === placed.id)!.warehouse!).doors.filter((x) => x.kind === 'dock').length
    }
    expect([docksAfter(0, 6), docksAfter(1, 6)]).toEqual([34, 34])
    // 2 modules fewer: the two in the middle go (Decision "Block shape": each half keeps its distance from its wall)
    expect([docksAfter(0, -6), docksAfter(1, -6)]).toEqual([32, 32])
  })

  it('a dock put on module 1 of a block made shorter stays on module 1 when step 2 makes it longer', () => {
    const { p, id } = typed([1, 10])
    const t = () => q.warehouseTypes!.find((x) => x.id === id)!
    let q = p
    // stored as put, on the box as it is
    expect(t().elements.map((e) => e.module)).toEqual([1, 10])
    q = updateWarehouseStep(q, id, 'hall', { length: 60 })
    expect(docksOf(q, id).map((d) => d.module)).toEqual([1, 18])
    q = updateWarehouseStep(q, id, 'hall', { length: 36 })
    expect(t().elements.map((e) => e.module)).toEqual([1, 10])
  })

  it('a copy’s own elements keep their meaning when its block is made longer and then notched', () => {
    let { p, id } = typed([1, 10])
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = placed.project
    // its own: one dock on its front's first module (given on its box now: its shape drawn there as its own)
    p = setWarehouseOverrides(p, placed.id, { elements: [dock(0)] })
    const copyDoors = () => {
      const w = p.buildings.find((b) => b.id === placed.id)!.warehouse!
      return copyGenerated(p.warehouseTypes!.find((x) => x.id === id)!, w).doors.filter((d) => d.edge === 'e1').map((d) => [d.module, d.at.x])
    }
    expect(copyDoors()).toEqual([[0, 1.5]])
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!.morphology!.outline).toHaveLength(4)
    p = updateWarehouseStep(p, id, 'hall', { length: 60 })
    expect(copyDoors()).toEqual([[0, 1.5]])
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 4, to: 8, by: -2 }).project
    expect(copyDoors()).toEqual([[0, 1.5]])
  })

  it('two patterns of other names on one module are two: on the plan and read from an older file', () => {
    const t = small([
      { id: 'p1', kind: 'pattern', name: 'Downpipe', edge: 'e1', module: 4, width: 0.3 },
      { id: 'p2', kind: 'pattern', name: 'Skylight', edge: 'e1', module: 4, width: 1 },
      { id: 'p3', kind: 'pattern', name: 'Skylight', edge: 'e1', module: 4, width: 1 },
    ])
    expect(generate(t).doors.map((d) => d.name)).toEqual(['Downpipe', 'Skylight'])
    const pattern = (id: string, name: string): LegacyElement => ({ id, kind: 'pattern', name, edge: 'e1', bays: [1], count: 1, width: 0.5 })
    const read = elementsByModule({ ...inLines(t), elements: [pattern('p1', 'Downpipe'), pattern('p2', 'Skylight')] })
    expect(read.map((e) => [e.name, e.module])).toEqual([
      ['Downpipe', 5],
      ['Skylight', 5],
    ])
  })

  it('a copy the engine cannot make keeps no rule: its file still reads', () => {
    const p = projectInLines(sampleProject())
    const b = p.buildings.find((x) => x.warehouse)!
    const broken = { ...b, warehouse: { ...b.warehouse!, overrides: { morphology: { holes: null }, elements: [rule('e1', 'e1', 2)] } } }
    const v12 = { ...p, version: 12, buildings: p.buildings.map((x) => (x.id === b.id ? broken : x)) } as unknown as Record<string, unknown>
    const read = migrate(v12) as unknown as Project
    const overrides = read.buildings.find((x) => x.id === b.id)!.warehouse!.overrides
    const elements = overrides?.elements ?? []
    expect(elements.some((e) => 'bays' in e)).toBe(false)
    // own elements only with an own shape
    expect(!elements.length || (overrides?.morphology?.outline?.length ?? 0) >= 4).toBe(true)
  })

  it('a copy whose masses cannot be made again: its rules by module where they stood, with its shape as its own', () => {
    const p = projectInLines(sampleProject())
    const b = p.buildings.find((x) => x.warehouse)!
    const levels = new Set(b.levels.map((l) => l.id))
    // one dock in the middle of each interior bay (on a module line: it moves half a module), its hall's footprint broken
    const pieces: LegacyElement = { id: 'e1', kind: 'dock', edge: 'e1', bays: { every: 1, offset: 0, skip: 'ends' }, count: 1, width: 3 }
    const masses = p.masses.map((m) => (levels.has(m.levelId) && m.part === 'hall' ? { ...m, footprint: { kind: 'contour' } } : m))
    const buildings = p.buildings.map((x) => (x.id === b.id ? { ...b, warehouse: { ...b.warehouse!, overrides: { elements: [pieces] } } } : x))
    const read = migrate({ ...p, version: 12, buildings, masses } as unknown as Record<string, unknown>) as unknown as Project
    const o = read.buildings.find((x) => x.id === b.id)!.warehouse!.overrides!
    expect(o.elements!.length).toBeGreaterThan(0)
    expect(o.elements!.some((e) => 'bays' in e)).toBe(false)
    expect(o.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
  })

  it('a block the engine cannot read never stops its file from opening: its rules by module, or none', () => {
    const t = small([])
    const old: OldElementsType = { ...inLines(t), elements: [rule('d1', 'e1', 4)] }
    const read = typeOrNone(old, () => {
      throw new Error('cannot')
    })
    expect(read.elements.some((e) => 'bays' in e)).toBe(false)
    expect(read.elements).toHaveLength(elementsByModule(old).length)
    expect(typeOrNone(old)).toEqual(typeByModule(old))
  })

  // Re-review: a block's corners, holes, zones and elements on one frame, the box as it is
  const notch = () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 40, to: 46, by: -1 }).project
    const g = generate(p.warehouseTypes!.find((x) => x.id === id)!)
    const face = g.edges.find((e) => e.horizontal && e.from.y === 1)!
    const lo = Math.min(face.from.x, face.to.x)
    p = updateWarehouseStep(p, id, 'elements', Array.from({ length: Math.max(face.from.x, face.to.x) - lo }, (_, i) => dock(lo + i, face.id)))
    return { p, id, face: face.id }
  }
  /** The notch's face: how many modules it spans, how many docks stand on it. */
  const onFace = (g: ReturnType<typeof generate>, face: string) => {
    const e = g.edges.find((x) => x.id === face)!
    return [Math.abs(e.to.x - e.from.x), g.doors.filter((d) => d.edge === face).length]
  }

  it('a notch with a dock on each of its modules: a dock on each still after step 2 makes the block 120, 126, 200 m', () => {
    let { p, id, face } = notch()
    const T = () => p.warehouseTypes!.find((x) => x.id === id)!
    expect(onFace(generate(T()), face)).toEqual([6, 6])
    for (const length of [120, 126, 200]) {
      p = updateWarehouseStep(p, id, 'hall', { length })
      const [modules, docks] = onFace(generate(T()), face)
      expect(docks).toBe(modules)
      // one frame: the outline drawn on the box as it is
      const g = generate(T())
      expect(Math.max(...T().morphology.outline.map((c) => c.x))).toBeCloseTo(g.runs.x.length, 6)
    }
  })

  it('a notch with a dock on each of its modules: a copy of the 120 m block stretched 6 m either way at either wall too', () => {
    let { p, id, face } = notch()
    p = updateWarehouseStep(p, id, 'hall', { length: 120 })
    const t = p.warehouseTypes!.find((x) => x.id === id)!
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    for (const end of [0, 1] as const)
      for (const d of [6, -6]) {
        const q = stretchWarehouseHall(placed.project, placed.id, { axis: 'length', end }, d).project
        const [modules, docks] = onFace(copyGenerated(t, q.buildings.find((b) => b.id === placed.id)!.warehouse!), face)
        expect(docks).toBe(modules)
      }
  })

  it('another grid reaches a copy’s own docks too: each on the module whose centre is nearest where it stood', () => {
    let { p, id } = typed([1, 2, 9, 10])
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = setWarehouseOverrides(placed.project, placed.id, { elements: [dock(2), dock(9)] })
    // 3 m modules → 4 m: 7.5 m nearest 6 (module 1), 28.5 m nearest 30 (module 7)
    p = updateWarehouseStep(p, id, 'grid', { modules: 3 })
    const w = p.buildings.find((b) => b.id === placed.id)!.warehouse!
    const doors = copyGenerated(p.warehouseTypes!.find((x) => x.id === id)!, w).doors.filter((d) => d.edge === 'e1')
    expect(doors.map((d) => [d.module, d.at.x])).toEqual([
      [1, 6],
      [7, 30],
    ])
  })

  it('a copy’s inner wall moved: its own outline with its holes and zones, drawn on its box now', () => {
    let { p, id } = typed([1, 10])
    // a hole and two zones, a bump on the back whose side wall the copy moves
    p = shapeWarehouse(p, id, { kind: 'hole', x: [2, 4], y: [2, 4] }).project
    p = updateWarehouseStep(p, id, 'morphology', { zones: [{ id: 'z1', x: [0, 6], y: [0, 8] }, { id: 'z2', x: [6, 12], y: [0, 8] }] })
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 6, to: 10, by: 1 }).project
    const t = p.warehouseTypes!.find((x) => x.id === id)!
    const side = generate(t).edges.find((e) => !e.outer && !e.horizontal && e.side === 'left')!
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = moveBlockEdge(placed.project, placed.id, side.id, 1).project
    const o = p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!
    expect(o.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    expect(o.morphology!.holes).toHaveLength(1)
    expect(o.morphology!.zones).toHaveLength(2)
  })

  it('another grid (step 1): each element on the module whose centre is nearest where it stood, two on one: the second on the nearest free one', () => {
    const { p, id } = typed([1, 2, 9, 10])
    // 3 m modules (4 a bay) → 4 m (3 a bay): 4.5 and 7.5 m both nearest 6 (module 1), 28.5 and 31.5 nearest 30 (7); the
    // second of each to the nearest free module (late review): 7.5 to 10 (module 2), 31.5 to 34 (module 8)
    const q = updateWarehouseStep(p, id, 'grid', { modules: 3 })
    expect(docksOf(q, id).map((d) => [d.module, d.at.x])).toEqual([
      [1, 6],
      [2, 10],
      [7, 30],
      [8, 34],
    ])
  })
})

describe('a copy’s own shape is one bundle (review round 3)', () => {
  /** A copy's docks on an edge: their modules, and whether each stands on the edge. */
  const copyDocks = (p: Project, type: string, building: string, edge: string) => {
    const g = copyGenerated(p.warehouseTypes!.find((x) => x.id === type)!, p.buildings.find((b) => b.id === building)!.warehouse!)
    const e = g.edges.find((x) => x.id === edge)!
    const [lo, hi] = [Math.min(e.from.x, e.to.x), Math.max(e.from.x, e.to.x)]
    const docks = g.doors.filter((d) => d.edge === edge).map((d) => d.module)
    expect(docks.every((k) => k >= lo && k < hi)).toBe(true)
    return docks
  }

  it('S4: a copy stretched 6 m, its notch’s wall moved: its own outline carries its own docks, the same through its type’s step 2', () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 40, to: 46, by: -1 }).project
    const face = generate(p.warehouseTypes!.find((x) => x.id === id)!).edges.find((x) => x.horizontal && x.from.y === 1)!
    p = updateWarehouseStep(p, id, 'elements', Array.from({ length: 6 }, (_, i) => dock(40 + i, face.id)))
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = stretchWarehouseHall(placed.project, placed.id, { axis: 'length', end: 1 }, 6).project
    const g = copyGenerated(p.warehouseTypes!.find((x) => x.id === id)!, p.buildings.find((b) => b.id === placed.id)!.warehouse!)
    const side = g.edges.find((x) => !x.horizontal && !x.outer && Math.min(x.from.y, x.to.y) === 0 && Math.max(x.from.y, x.to.y) === 1 && x.from.x < 50)!
    p = moveBlockEdge(p, placed.id, side.id, -1).project
    const o = p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!
    // one bundle: its outline with its elements, holes (and zones, the type having none)
    expect(o.morphology!.outline!.length).toBeGreaterThanOrEqual(4)
    expect(o.elements).toBeDefined()
    expect(o.morphology!.holes).toBeDefined()
    const before = copyDocks(p, id, placed.id, face.id)
    // the notch a module wider (the new module empty), its 6 docks
    expect(before).toHaveLength(6)
    for (const length of [120, 126, 200]) {
      p = updateWarehouseStep(p, id, 'hall', { length })
      expect(copyDocks(p, id, placed.id, face.id)).toEqual(before)
    }
  })

  it('S2: a copy with its own inner wall when its type’s box grows at its low wall: its shape, box and docks its own', () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length: 36 })
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 4, to: 8, by: -1 }).project
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = placed.project
    const side = copyGenerated(p.warehouseTypes!.find((x) => x.id === id)!, p.buildings.find((b) => b.id === placed.id)!.warehouse!).edges.find((e) => !e.outer && !e.horizontal)!
    p = moveBlockEdge(p, placed.id, side.id, 1).project
    const before = copyDocks(p, id, placed.id, 'e1')
    expect(before.length).toBeGreaterThan(0)
    const hallBefore = p.masses.find((m) => m.part === 'hall' && p.buildings.find((b) => b.id === placed.id)!.levels.some((l) => l.id === m.levelId))!.footprint
    // the type's left wall pulled out 2 modules over a stretch: its box 2 modules longer, its line A 6 m back
    const left = generate(p.warehouseTypes!.find((x) => x.id === id)!).edges.find((e) => !e.horizontal && e.from.x === 0 && e.to.x === 0)!
    const r = shapeWarehouse(p, id, { kind: 'pull', edge: left.id, from: 1, to: 3, by: 2 })
    expect(r.shift).toEqual({ x: -6, y: 0 })
    p = r.project
    expect(copyDocks(p, id, placed.id, 'e1')).toEqual(before)
    const hallAfter = p.masses.find((m) => m.part === 'hall' && p.buildings.find((b) => b.id === placed.id)!.levels.some((l) => l.id === m.levelId))!.footprint
    expect(hallAfter).toEqual(hallBefore)
  })

  it('one setWarehouseOverrides that changes the grid and gives its own docks keeps the docks given', () => {
    let { p, id } = typed([1, 10])
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    p = setWarehouseOverrides(placed.project, placed.id, { elements: [dock(2)] })
    const o = p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!
    // the grid of 4 m modules and, at once, a dock on module 5 (16.5 m on the 3 m grid it was given on)
    p = setWarehouseOverrides(p, placed.id, { ...o, grid: { modules: 3 }, elements: [dock(5)] })
    const w = p.buildings.find((b) => b.id === placed.id)!.warehouse!
    const doors = copyGenerated(p.warehouseTypes!.find((x) => x.id === id)!, w).doors.filter((d) => d.edge === 'e1')
    // 16.5 m nearest 18 (module 4 of 4 m)
    expect(doors.map((d) => [d.module, d.at.x])).toEqual([[4, 18]])
  })
})

describe('a type’s shape edit keeps an own-shape copy as a size variant (review round 4)', () => {
  const typeOfP = (p: Project, id: string) => p.warehouseTypes!.find((x) => x.id === id)!
  const copyOf = (p: Project, building: string) => p.buildings.find((b) => b.id === building)!.warehouse!
  /** A copy's docks: their edge, module and where each stands on the site (m). */
  const onSite = (p: Project, id: string, building: string) => {
    const w = copyOf(p, building)
    return copyGenerated(typeOfP(p, id), w).doors.map((d) => {
      const at = onPlace(w.place, d.at)
      return [d.edge, d.module, Math.round(at.x * 1000) / 1000, Math.round(at.y * 1000) / 1000]
    })
  }
  /** A block of 36 m notched on e3, a copy of it with the notch's side wall moved (its own shape), a plain copy. */
  function ownShapeCopy() {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length: 36 })
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 4, to: 8, by: -1 }).project
    const own = placeWarehouse(p, id, { x: 200, y: 150 }, 0, p.options[0].id)!
    const plain = placeWarehouse(own.project, id, { x: 200, y: 300 }, 0, p.options[0].id)!
    p = plain.project
    const side = copyGenerated(typeOfP(p, id), copyOf(p, own.id)).edges.find((e) => !e.outer && !e.horizontal)!
    p = moveBlockEdge(p, own.id, side.id, 1).project
    return { p, id, own: own.id, plain: plain.id }
  }
  /** The type's left wall pulled out 2 modules over y 1–3: its box 2 modules longer, its line A 6 m back. */
  function pullLeft(p: Project, id: string): Project {
    const left = generate(typeOfP(p, id)).edges.find((e) => !e.horizontal && e.from.x === 0 && e.to.x === 0)!
    const r = shapeWarehouse(p, id, { kind: 'pull', edge: left.id, from: 1, to: 3, by: 2 })
    expect(r.shift).toEqual({ x: -6, y: 0 })
    return r.project
  }

  it('its hall pinned as it was after its type’s left wall is pulled: its docks keep their number and their site x', () => {
    let { p, id, own } = ownShapeCopy()
    expect(copyOf(p, own).overrides!.hall).toBeUndefined()
    const before = onSite(p, id, own)
    expect(before).toHaveLength(9)
    p = pullLeft(p, id)
    expect(typeOfP(p, id).hall.length).toBe(42)
    // a size variant: its length (and the ends the refit changed) its own, as they were
    expect(copyOf(p, own).overrides!.hall).toMatchObject({ length: 36 })
    expect(onSite(p, id, own)).toEqual(before)
  })

  it('a later step 2 of its type does not reach it until Back to type; then it follows again', () => {
    let { p, id, own, plain } = ownShapeCopy()
    p = pullLeft(p, id)
    const pinned = onSite(p, id, own)
    p = updateWarehouseStep(p, id, 'hall', { length: 54 })
    // the plain copy follows its type, the variant keeps its size, its docks where they stood
    expect(copyGenerated(typeOfP(p, id), copyOf(p, plain)).runs.x.length).toBeCloseTo(54, 6)
    expect(copyGenerated(typeOfP(p, id), copyOf(p, own)).runs.x.length).toBeCloseTo(36, 6)
    expect(onSite(p, id, own)).toEqual(pinned)
    // Back to type: no overrides, its type's box and docks; a later step 2 reaches it
    p = setWarehouseOverrides(p, own, null)
    expect(copyOf(p, own).overrides).toBeUndefined()
    expect(copyGenerated(typeOfP(p, id), copyOf(p, own)).runs.x.length).toBeCloseTo(54, 6)
    expect(copyGenerated(typeOfP(p, id), copyOf(p, own)).doors).toHaveLength(copyGenerated(typeOfP(p, id), copyOf(p, plain)).doors.length)
    p = updateWarehouseStep(p, id, 'hall', { length: 60 })
    expect(copyGenerated(typeOfP(p, id), copyOf(p, own)).runs.x.length).toBeCloseTo(60, 6)
  })

  it('an own outline given without its elements and another grid at once: its docks as the whole bundle’s, mapped once', () => {
    const { p, id, own } = ownShapeCopy()
    const o = copyOf(p, own).overrides!
    const { elements: _, ...outlineOnly } = o
    const whole = setWarehouseOverrides(p, own, { ...o, grid: { modules: 3 } })
    const part = setWarehouseOverrides(p, own, { ...outlineOnly, grid: { modules: 3 } })
    const e1 = (q: Project) => copyGenerated(typeOfP(q, id), copyOf(q, own)).doors.filter((d) => d.edge === 'e1').map((d) => [d.module, d.at.x]).sort((a, b) => a[0] - b[0])
    // 9 docks at 3 m modules (1.5 … 25.5 m) on the nearest 4 m modules: 7.5 and 19.5 m fall on held ones and no free
    // module is within a module (4 m) of them, so they merge (late review): 7 docks, none past 25.5 m and a module
    expect(e1(whole)).toEqual([[0, 2], [1, 6], [2, 10], [3, 14], [4, 18], [5, 22], [6, 26]])
    expect(Math.max(...e1(whole).map((d) => d[1]))).toBeLessThanOrEqual(25.5 + 4)
    expect(e1(part)).toEqual(e1(whole))
  })
})

describe('elementsNearest: none merged while its edge has a free module (late review, the controller’s ruling)', () => {
  const run = (modules: number[]): Run => ({ length: modules[modules.length - 1], bay: 0, bays: [], lines: [], modules, start: 0, end: 0, module: modules[1] - modules[0] })
  const runs = (x: number[]): HallRuns => ({ x: run(x), y: run([0, 10]) })
  const edge = (n: number) => [{ id: 'e1', from: { x: 0, y: 0 }, to: { x: n, y: 0 }, horizontal: true }] as ShapeEdge[]
  const along = () => true
  const modules = (l: HallElement[]) => l.map((e) => [e.id, e.module])

  it('two that fall on one module: the second on the nearest free module of its edge', () => {
    // 3 m modules → 4 m: 4.5 and 7.5 m both nearest 6 (module 1); 7.5 m to 10 (module 2), nearer than 2 (module 0)
    const out = elementsNearest([dock(1), dock(2)], along, runs([0, 3, 6, 9, 12]), runs([0, 4, 8, 12]), edge(3))
    expect(modules(out)).toEqual([
      ['d1', 1],
      ['d2', 2],
    ])
  })

  it('the one nearer its module keeps it, whatever the order', () => {
    // 5.5 m (nearest 6, 0.5 off) and 7.5 m (1.5 off): the first keeps 6, the second goes to 10
    const before = runs([0, 3, 4, 7, 8, 11, 12])
    const out = elementsNearest([dock(3, 'e1', 'b'), dock(2, 'e1', 'a')], along, before, runs([0, 4, 8, 12]), edge(3))
    expect(Object.fromEntries(modules(out))).toEqual({ a: 1, b: 2 })
  })

  it('a free module farther than one new module from where it stood: merged', () => {
    // 4.5 and 7.5 m both nearest 6 (module 1 of 2–10 m); the free ones' centres, 1 and 11 m, are farther than their
    // 2 m width from 7.5 m: one dock
    const out = elementsNearest([dock(1), dock(2)], along, runs([0, 3, 6, 9, 12]), runs([0, 2, 10, 12]), edge(3))
    expect(modules(out)).toEqual([['d1', 1]])
  })

  it('docks with gaps between them keep their count: each displaced one has a free neighbour', () => {
    // 3 m → 4 m modules on 36 m: pairs on 1–2, 5–6, 9–10 (4.5 … 31.5 m); the second of each a module on
    const before = runs([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36])
    const out = elementsNearest([1, 2, 5, 6, 9, 10].map((k) => dock(k)), along, before, runs([0, 4, 8, 12, 16, 20, 24, 28, 32, 36]), edge(9))
    expect(out.map((e) => e.module)).toEqual([1, 2, 4, 5, 7, 8])
  })

  it('merged only when its edge has no free module; another kind never takes a module from a dock', () => {
    // 3 modules of 4 m → 2 of 6 m: three docks on two modules, two kept; a door on the first takes nothing from them
    const door: HallElement = { id: 'o', kind: 'door', edge: 'e1', module: 0, width: 3 }
    const out = elementsNearest([dock(0), dock(1), dock(2), door], along, runs([0, 4, 8, 12]), runs([0, 6, 12]), edge(2))
    expect(out.filter((e) => e.kind === 'dock').map((e) => e.module).sort()).toEqual([0, 1])
    expect(out.find((e) => e.id === 'o')!.module).toBe(0)
  })
})
