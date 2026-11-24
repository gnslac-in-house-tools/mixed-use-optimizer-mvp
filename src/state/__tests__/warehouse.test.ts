// Warehouse type actions (Decision "Warehouse type", W.1): a type made, edited only at its open step, locked and
// reopened; a copy placed on the site as a building of its own, its masses made from the type and made again where
// it stands when the type changes (moved or turned meanwhile); a variant's overrides; a type removed lets its copies go.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Project } from '../../model/schema.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import { demoProject } from '../demo.ts'
import { derive } from '../../engine/derive.ts'
import { readKpi } from '../../modules/catalog.ts'
import { addMass, copyMass, moveMasses, rotateMasses } from '../actions/masses.ts'
import { problemOf } from '../../plugins/optimizer/engine/problem.ts'
import { MASSES } from '../../typologies/plans.ts'
import {
  addWarehouseType,
  blockWall,
  blockWalls,
  copyWithBlocks,
  duplicateWarehouseType,
  lockWarehouseStep,
  placeWarehouse,
  removeWarehouseType,
  reopenWarehouseStep,
  moveBlockEdge,
  setWarehouseOverrides,
  shapeWarehouse,
  stretchBlockWall,
  stretchWarehouseHall,
  updateWarehouseStep,
} from '../../modules/warehouse/actions.ts'
import { generate } from '../../modules/warehouse/engine/generate.ts'

const start = () => {
  const p = demoProject()
  const { project, id } = addWarehouseType(p)
  return { p: project, id, option: p.options[0].id }
}
const copyMasses = (p: Project, buildingId: string) => {
  const levels = new Set(p.buildings.find((b) => b.id === buildingId)!.levels.map((l) => l.id))
  return p.masses.filter((m) => levels.has(m.levelId))
}

describe('warehouse types', () => {
  it('a new type: Warehouse A, on the project’s grid, its hall the first built program with docks', () => {
    const { p, id } = start()
    expect(p.warehouseTypes).toHaveLength(1)
    expect(p.warehouseTypes![0]).toMatchObject({ id, name: 'Warehouse A', program: 'warehouse', grid: { x: 12, y: 12, modules: 4 } })
    expect(addWarehouseType(p).project.warehouseTypes![1].name).toBe('Warehouse B')
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('any step is edited, in any order (Decision "Free steps"); editing a locked one opens it, the later locked ones to lock again', () => {
    let { p, id } = start()
    // the hall before the grid is locked
    p = updateWarehouseStep(p, id, 'hall', { length: 150 })
    expect(p.warehouseTypes![0].hall.length).toBe(150)
    p = updateWarehouseStep(p, id, 'grid', { x: 10 })
    expect(p.warehouseTypes![0].grid.x).toBe(10)
    // a figure that is no figure changes nothing
    expect(updateWarehouseStep(p, id, 'grid', { modules: 0 })).toBe(p)
    p = lockWarehouseStep(lockWarehouseStep(p, id, 'grid'), id, 'hall')
    // the locked grid edited: opened, the hall to lock again
    p = updateWarehouseStep(p, id, 'grid', { x: 12 })
    expect(p.warehouseTypes![0].grid.x).toBe(12)
    expect(p.warehouseTypes![0].locks).toEqual({ hall: 'again' })
    p = lockWarehouseStep(p, id, 'hall')
    p = reopenWarehouseStep(p, id, 'grid')
    expect(p.warehouseTypes![0].locks).toEqual({ hall: 'again' })
  })

  it('a copy on the site: a building of its own, its hall where it was dropped; it follows its type where it stands', () => {
    let { p, id, option } = start()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = placed.project
    const b = p.buildings.find((x) => x.id === placed.id)!
    expect(b).toMatchObject({ name: 'Warehouse A 1', warehouse: { type: id, place: { x: 100, y: 102, angle: 0 } } })
    expect(p.options[0].buildingIds).toContain(b.id)
    let masses = copyMasses(p, b.id)
    expect(masses).toHaveLength(1)
    expect(masses[0]).toMatchObject({ part: 'hall', programId: 'warehouse', name: 'Warehouse A 1 · Hall', height: 12 })
    expect(masses[0].doorsAt![0].at).toHaveLength(60)
    const c = centroid(footprintPolygon(masses[0].footprint))
    expect(c.x).toBeCloseTo(200, 6)
    expect(c.y).toBeCloseTo(150, 6)
    expect(ProjectSchema.safeParse(p).success).toBe(true)

    // moved and turned on the plan, then the type's grid changes: remade where it stands, its id kept
    const hallId = masses[0].id
    p = rotateMasses(moveMasses(p, [hallId], { x: 10, y: 0 }), [hallId], 90)
    const before = footprintPolygon(p.masses.find((m) => m.id === hallId)!.footprint)
    p = updateWarehouseStep(p, id, 'grid', { modules: 3 })
    masses = copyMasses(p, b.id)
    expect(masses.map((m) => m.id)).toEqual([hallId])
    // the same outline (the grid moved no wall): where it was turned to
    footprintPolygon(masses[0].footprint).forEach((q, i) => {
      expect(q.x).toBeCloseTo(before[i].x, 6)
      expect(q.y).toBeCloseTo(before[i].y, 6)
    })
    expect(p.buildings.find((x) => x.id === b.id)!.warehouse!.place.angle).toBeCloseTo(90, 9)
    // each dock on the module whose centre is nearest where it stood (the ruling for Decision "Elements by module"),
    // the modules now 4 m: bay B–C's four docks (11.5, 14.5, 17.5, 20.5 m) on its three modules (12, 16, 20), two on
    // one one, no free module within a module of it (late review: none spills into the end bays); every interior bay
    // so, 45 docks
    expect(masses[0].doorsAt![0].at.slice(0, 3)).toEqual([12.3, 16.3, 20.3])
    expect(masses[0].doorsAt![0].at).toHaveLength(45)
  })

  it('a bump shallower than half a bay: the box grows by it, its wall keeps its column line, its columns and its docks', () => {
    let { p, id } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    const before = generate(p.warehouseTypes![0])
    // the back's modules 20 to 32, one module (3 m) out: a 3 m end bay of its own, not a 15 m one
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: 1 }).project
    const t = p.warehouseTypes![0]
    expect(t.hall).toMatchObject({ width: 99, shortEnds: { y: true } })
    const g = generate(t)
    expect(g.runs.y.lines.slice(-2)).toEqual([96, 99])
    expect(g.columns.length).toBeGreaterThanOrEqual(before.columns.length)
    expect(g.doors.length).toBe(before.doors.length)
    // pushed back flush: the box as it was, its end bays joined again when it grows by a whole bay
    const face = g.edges.find((e) => e.side === 'back' && e.outer)!
    p = shapeWarehouse(p, id, { kind: 'pull', edge: face.id, from: face.from.x, to: face.to.x, by: -1 }).project
    expect(p.warehouseTypes![0].hall.width).toBe(96)
    expect(generate(p.warehouseTypes![0]).columns).toHaveLength(before.columns.length)
  })

  it('a bump pulled out of a wall (Decision "Block shape"): one mass, the box grown with it; pushed back, the box again', () => {
    let { p, id, option } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    const area0 = derive(placed.project).masses[copyMasses(placed.project, placed.id)[0].id].area
    // the front's modules 20 to 32 (36 m), 3 modules (9 m) out: the box 9 m wider, its column line 1 that much lower
    const r = shapeWarehouse(placed.project, id, { kind: 'pull', edge: 'e1', from: 20, to: 32, by: 3 })
    expect(r.shift).toEqual({ x: 0, y: -9 })
    p = r.project
    const t = p.warehouseTypes![0]
    expect(t.hall.width).toBe(105)
    expect(t.morphology.outline).toHaveLength(8)
    const masses = copyMasses(p, placed.id)
    expect(masses.map((m) => [m.part, m.programId, m.group])).toEqual([['hall', 'warehouse', undefined]])
    // and its two side walls, 0.3 m each, out of its module lines
    expect(derive(p).masses[masses[0].id].area).toBeCloseTo(area0 + 36 * 9 + 0.6 * 9, 6)
    // its docks stay on the front either side of it, on their modules: the edge split, the rest of it another edge
    expect(new Set(t.elements.map((e) => e.edge)).size).toBe(2)
    // its face pushed back flush: the box as it was
    const face = generate(t).edges.find((e) => e.outer && e.side === 'front')!
    p = shapeWarehouse(p, id, { kind: 'pull', edge: face.id, from: face.from.x, to: face.to.x, by: -3 }).project
    expect(p.warehouseTypes![0].morphology.outline).toHaveLength(4)
    expect(p.warehouseTypes![0].hall.width).toBe(96)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('zones (Decision "Block shape"): information inside the one mass, its program and level; no mass, no platform step of their own', () => {
    let { p, id, option } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = updateWarehouseStep(placed.project, id, 'morphology', {
      zones: [
        { id: '1', x: [0, 20], y: [0, 32] },
        { id: 'z1', x: [20, 66], y: [0, 32], program: 'office', level: -1.2 },
      ],
    })
    const masses = copyMasses(p, placed.id)
    expect(masses.map((m) => [m.part, m.programId])).toEqual([['hall', 'warehouse']])
    expect(p.buildings.find((b) => b.id === placed.id)!.platform?.steps).toBeUndefined()
    expect(generate(p.warehouseTypes![0]).zones.map((z) => [z.id, z.program, z.level])).toEqual([
      ['1', 'warehouse', 0],
      ['z1', 'office', -1.2],
    ])
    expect(derive(p).metrics.massesByProgram.warehouse).toBe((derive(start().p).metrics.massesByProgram.warehouse ?? 0) + 1)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('a copy without its hall is a copy no more: deleted, the masses left are its own; nothing of the type comes back beside them (Decision "A copy without its hall")', () => {
    let { p, id, option } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    const a = placeWarehouse(p, id, { x: 150, y: 120 }, 0, option)!
    const b = placeWarehouse(a.project, id, { x: 250, y: 260 }, 0, option)!
    p = b.project
    // an older project: the copy kept its type, its masses all gone and others drawn in its building
    const level = p.buildings.find((x) => x.id === a.id)!.levels[0].id
    const gone = new Set(copyMasses(p, a.id).map((m) => m.id))
    const drawn = { ...p.masses.find((m) => !gone.has(m.id) && !m.part)!, id: 'drawn', name: 'Warehouse 1', levelId: level, group: undefined }
    const older: Project = { ...p, masses: [...p.masses.filter((m) => !gone.has(m.id)), drawn] }
    expect(copyMasses(setWarehouseOverrides(older, a.id, { hall: { length: 180 } }), a.id).map((m) => m.id)).toEqual(['drawn'])
    expect(copyMasses(updateWarehouseStep(older, id, 'hall', { length: 180 }), a.id).map((m) => m.id)).toEqual(['drawn'])
    // the optimizer varies the hall of the copy that has one; the specimen keeps three masses of the two, not more
    const t = problemOf(older, option, { ...MASSES, variables: [{ kind: 'warehouse.hall', step: 1 }] })
    const decoded = t.decode(t.variables.map((v) => (v.gene.kind === 'real' ? v.gene.min : 0)))
    expect(copyMasses(decoded, a.id).map((m) => m.id)).toEqual(['drawn'])
    expect(copyMasses(decoded, b.id).map((m) => m.part)).toEqual(['hall'])
  })

  it('a mass added on a copy’s level goes to a building of its own, in the options that show the copy; a copy of a part too', () => {
    const { p, id, option } = start()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    const level = placed.project.buildings.find((b) => b.id === placed.id)!.levels[0].id
    const r = addMass(placed.project, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 50, y: 50 }, width: 20, depth: 10, rotation: 0 }, levelId: level })
    const m = r.project.masses.find((x) => x.id === r.id)!
    expect(m.levelId).not.toBe(level)
    const own = r.project.buildings.at(-1)!
    expect(own).toMatchObject({ name: expect.stringMatching(/^Building \d+$/), levels: [{ id: m.levelId }] })
    expect(own.warehouse).toBeUndefined()
    expect(r.project.options.find((o) => o.id === option)!.buildingIds).toContain(own.id)
    // the copy keeps its type's masses alone
    expect(copyMasses(r.project, placed.id).every((x) => x.part !== undefined)).toBe(true)
    // a copy of its hall (Ctrl+D) is a mass of its own too
    const hall = copyMasses(placed.project, placed.id)[0]
    const dup = copyMass(placed.project, hall, { x: 5, y: 5 })
    expect(copyMasses(dup.project, placed.id).map((x) => x.id)).toEqual([hall.id])
    // any other level takes it
    const level1 = p.buildings[0].levels[0].id
    expect(addMass(placed.project, { programId: null, footprint: m.footprint, levelId: level1 }).project.buildings).toHaveLength(placed.project.buildings.length)
  })

  it('a variant: its overrides over the type, back to the type without them', () => {
    let { p, id, option } = start()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = setWarehouseOverrides(placed.project, placed.id, { hall: { length: 144 } })
    const hall = () => copyMasses(p, placed.id)[0].footprint as { width: number }
    expect(hall().width).toBeCloseTo(144.6, 6)
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides).toEqual({ hall: { length: 144 } })
    p = setWarehouseOverrides(p, placed.id, null)
    expect(hall().width).toBeCloseTo(200.6, 6)
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides).toBeUndefined()
  })

  it('copied (copy, paste, duplicate, Alt+drag): a block comes as a copy of its block, moved, its variant kept; other masses as masses', () => {
    let { p, id, option } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = shapeWarehouse(placed.project, id, { kind: 'pull', edge: 'e1', from: 20, to: 32, by: 3 }).project
    p = setWarehouseOverrides(p, placed.id, { hall: { length: 144 } })
    const block = copyMasses(p, placed.id)
    const plain = p.masses.find((m) => m.part === undefined)!
    const r = copyWithBlocks(p, [block[0], plain], { x: 0, y: 300 }, option)
    const made = r.project.buildings.at(-1)!
    expect(made).toMatchObject({ name: 'Warehouse A 2', warehouse: { type: id, overrides: { hall: { length: 144 } } } })
    expect(made.warehouse!.place.y).toBeCloseTo(p.buildings.find((b) => b.id === placed.id)!.warehouse!.place.y + 300, 6)
    expect(r.project.options[0].buildingIds).toContain(made.id)
    const mine = copyMasses(r.project, made.id)
    expect(mine.map((m) => m.part)).toEqual(['hall'])
    expect(r.ids).toEqual([...mine.map((m) => m.id), r.ids.at(-1)])
    expect(r.project.masses.find((m) => m.id === r.ids.at(-1))!.part).toBeUndefined()
    // no block among them: as copyMasses
    expect(copyWithBlocks(p, [plain], { x: 5, y: 0 }, option).ids).toHaveLength(1)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('a hall’s wall moved (B.2): by whole modules, past the block’s range too (Decision "Past the range by hand": an Issue); the low wall moves the place', () => {
    let { p, id, option } = start()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = placed.project
    const t = p.warehouseTypes![0]
    const place = () => p.buildings.find((b) => b.id === placed.id)!.warehouse!.place
    const hall = () => p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides?.hall
    // 12 m bays in 4 modules: 3 m; 7 m out is two modules
    let r = stretchWarehouseHall(p, placed.id, { axis: 'length', end: 1 }, 7)
    expect(r.applied).toBe(6)
    p = r.project
    expect(hall()).toEqual({ length: t.hall.length + 6 })
    expect(place()).toMatchObject({ x: 100, y: 102 })
    // far out: past its range (two bays either way of the block's length), no limit; an Issue says so, a warning
    r = stretchWarehouseHall(p, placed.id, { axis: 'length', end: 1 }, 100)
    expect(r.applied).toBe(99)
    const past = derive(r.project).issues.filter((i) => i.code === 'range')
    expect(past).toHaveLength(1)
    expect(past[0]).toMatchObject({ severity: 'warning', message: expect.stringContaining(`${t.hall.length + 105} m long, its range ${t.hall.length - 24}–${t.hall.length + 24} m`) })
    expect(derive(p).issues.some((i) => i.code === 'range')).toBe(false)
    // back to the block's size: no override
    p = stretchWarehouseHall(r.project, placed.id, { axis: 'length', end: 1 }, -105).project
    expect(hall()).toBeUndefined()
    // the low wall out by a module: the place goes back by it, the other wall stays
    p = stretchWarehouseHall(p, placed.id, { axis: 'width', end: 0 }, 3).project
    expect(hall()).toEqual({ width: t.hall.width + 3 })
    expect(place().y).toBeCloseTo(99, 6)
    // nothing to move: the same project
    expect(stretchWarehouseHall(p, placed.id, { axis: 'width', end: 0 }, 1).project).toBe(p)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('a placed block’s walls (Decision "Block shape"): the box’s past the range too, an inner one alone and without a limit, the variant’s own', () => {
    let { p, id, option } = start()
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
    // a notch in the back: its modules 20 to 32, 4 modules (12 m) in
    p = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    p = placed.project
    const hall = () => copyMasses(p, placed.id)[0]
    const kinds = blockWalls(p, hall().id)!
    expect(kinds.filter((k) => k === 'inner')).toHaveLength(3)
    expect(kinds.filter((k) => k === 'box')).toHaveLength(5)
    // the notch's bottom: the inner wall along x
    const v = footprintPolygon(hall().footprint)
    const bottom = kinds.findIndex((k, i) => k === 'inner' && Math.abs(v[i].y - v[(i + 1) % v.length].y) < 1e-6)
    expect(blockWall(p, hall().id, bottom)).toMatchObject({ kind: 'inner', module: 3, range: null })
    const area0 = derive(p).masses[hall().id].area
    // out a module: the notch 3 modules deep, this copy's own outline, its type's as it was
    let r = stretchBlockWall(p, hall().id, bottom, 3)!
    expect(r.applied).toBeCloseTo(3, 6)
    p = r.project
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!.morphology!.outline).toHaveLength(8)
    expect(p.warehouseTypes![0].morphology.outline).toHaveLength(8)
    // the notch 36 m on its module lines, its walls' faces 0.6 m less
    expect(derive(p).masses[hall().id].area).toBeCloseTo(area0 + (36 - 0.6) * 3, 6)
    // without a limit, but the box: far out, the notch closes, the box as it is
    r = stretchBlockWall(p, hall().id, bottom, 100)!
    expect(r.applied).toBeCloseTo(9, 6)
    p = r.project
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides!.morphology!.outline).toHaveLength(4)
    // a box's wall: its range (two bays either way of the block's length) said, and past it by hand (RB.1)
    const kinds2 = blockWalls(p, hall().id)!
    expect(kinds2.every((k) => k === 'box')).toBe(true)
    const w = footprintPolygon(hall().footprint)
    const mid = (i: number) => (w[i].x + w[(i + 1) % w.length].x) / 2
    const right = w.reduce((best, _a, i) => (mid(i) > mid(best) ? i : best), 0)
    expect(blockWall(p, hall().id, right)!.range).toMatchObject({ lo: 176, hi: 224, now: 200 })
    expect(stretchBlockWall(p, hall().id, right, 100)!.applied).toBe(99)
    // any other mass: none of this
    const plain = p.masses.find((m) => m.part === undefined)!
    expect(blockWalls(p, plain.id)).toBeNull()
    expect(stretchBlockWall(p, plain.id, 0, 3)).toBeNull()
    expect(moveBlockEdge(p, placed.id, 'e1', 1).applied).toBe(0)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('duplicated, then removed: its copies stay as masses, no longer linked', () => {
    let { p, id, option } = start()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!
    const dup = duplicateWarehouseType(placed.project, id)!
    expect(dup.project.warehouseTypes!.map((t) => t.name)).toEqual(['Warehouse A', 'Warehouse A copy'])
    p = removeWarehouseType(dup.project, id)
    expect(p.warehouseTypes!.map((t) => t.id)).toEqual([dup.id])
    expect(p.buildings.find((b) => b.id === placed.id)!.warehouse).toBeUndefined()
    expect(copyMasses(p, placed.id)[0].part).toBeUndefined()
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('the option’s columns and wall area: its copies’, as their types make them; none without copies', () => {
    let { p, id, option } = start()
    expect(readKpi('columns', p, derive(p))!.value).toBeNull()
    p = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!.project
    p = placeWarehouse(p, id, { x: 200, y: 400 }, 0, option)!.project
    const d = derive(p)
    expect(readKpi('columns', p, d)!.value).toBe(2 * 162)
    expect(readKpi('wall-area', p, d)!.value).toBeCloseTo(2 * 2 * (200.6 + 96.6) * 12, 3)
  })

  it('on the site a copy docks where its type’s elements put the doors: its own wall, its doors exactly', () => {
    let { p, id, option } = start()
    p = placeWarehouse(p, id, { x: 200, y: 150 }, 0, option)!.project
    const d = derive(p)
    const docks = d.circulation.docks.filter((x) => copyMasses(p, p.buildings.at(-1)!.id).some((m) => m.id === x.massId))
    expect(docks).toHaveLength(1)
    expect(docks[0].doors).toHaveLength(60)
    // the first door 11.8 m from the wall's start (the end bay's 10 m, half a bay, one and a half modules back, the wall's 0.3)
    const w = docks[0]
    expect(Math.hypot(w.doors[0].x - w.a.x, w.doors[0].y - w.a.y)).toBeCloseTo(11.8, 6)
  })
})
