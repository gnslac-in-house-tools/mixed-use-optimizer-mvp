// Draw makes a block (Phase D.2 task 7; Decision "Draw makes a block"): a stroke on the site is the outer face of a block of its
// program's type, a type made from the typology's defaults when the program has none; the first block of a type is the type itself,
// the later ones its variants. Open programs are blocks too, drawn as open ground. The Union of blocks joins them into the first's own
// outline when they share a type.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { area } from '../../../engine/geom/polygon.ts'
import { ProjectSchema, type Contour, type Footprint, type Project } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { newProject } from '../../../typologies/index.ts'
import { kpiCatalog } from '../../catalog.ts'
import { blockTypeFor, drawBlock } from '../actions.ts'
import { copyGenerated } from '../engine/copies.ts'
import { generate } from '../engine/generate.ts'

const rect = (cx: number, cy: number, width: number, depth: number, rotation = 0): Footprint => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation })
const contour = (...pts: [number, number][]): Footprint => ({ kind: 'contour', contour: { vertices: pts.map(([x, y]) => ({ x, y, r: 0 })) } })
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
const areaOf = (f: Footprint) => Math.abs(area(footprintPolygon(f)))
const draw = (p: Project, init: Partial<Parameters<typeof drawBlock>[1]> & { footprint: Footprint }) => {
  const r = drawBlock(p, { optionId: p.options[0].id, ...init })
  if (!r) throw new Error('drawBlock refused')
  return r
}
const hallOf = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const buildingOf = (p: Project, massId: string) => p.buildings.find((b) => b.levels.some((l) => l.id === hallOf(p, massId).levelId))!
const typeOf = (p: Project, programId: string | null) => p.warehouseTypes?.find((t) => t.program === programId)

describe('drawBlock: a stroke makes a block of its program’s type', () => {
  it('a rectangle of an office with no type yet makes the type Office and a block that is the type itself, on a building of its own', () => {
    const p = demoProject()
    const level = p.buildings[0].levels[0]
    const r = draw(p, { programId: 'office', footprint: rect(300, 200, 60, 30), levelId: level.id })
    const t = typeOf(r.project, 'office')!
    expect(t.name).toBe('Office')
    // its program keeps its kind: an office stays an office
    expect(r.project.programs.find((g) => g.id === 'office')!.kind).toBe('office')
    // its grid the project's, its wall and column the defaults, its height the level's, no element: the stroke is its own
    expect(t.grid).toMatchObject({ x: p.grid!.x, y: p.grid!.y, modules: p.grid!.modules })
    expect(t.envelope).toEqual({ height: level.height, thickness: 0.3 })
    expect(t.elements).toEqual([])
    // the block is the type itself: no overrides; a building of its own, in the option
    const b = buildingOf(r.project, r.id)
    expect(b.warehouse).toEqual({ type: t.id, place: expect.any(Object) })
    expect(b.id).toBe(r.building)
    expect(r.project.options[0].buildingIds).toContain(b.id)
    expect(r.project.buildings).toHaveLength(p.buildings.length + 1)
    // its hall is the stroke: a rect of the same numbers, the office program
    expect(hallOf(r.project, r.id)).toMatchObject({ programId: 'office', part: 'hall', footprint: { kind: 'rect', width: 60, depth: 30, rotation: 0 } })
    near(areaOf(hallOf(r.project, r.id).footprint), 1800)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('a second stroke of the program makes a variant: its own outline, no elements, its type as it was', () => {
    const first = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 60, 30) })
    const type = typeOf(first.project, 'office')!
    const second = draw(first.project, { programId: 'office', footprint: rect(400, 100, 40, 20) })
    expect(typeOf(second.project, 'office')).toEqual(type)
    expect(second.project.warehouseTypes).toHaveLength(1)
    const b = buildingOf(second.project, second.id)
    expect(b.warehouse!.type).toBe(type.id)
    expect(b.warehouse!.overrides).toMatchObject({ elements: [], hall: { length: expect.any(Number), width: expect.any(Number) } })
    expect(b.warehouse!.overrides!.morphology!.outline!.length).toBeGreaterThanOrEqual(3)
    expect(hallOf(second.project, second.id).footprint).toMatchObject({ kind: 'rect', width: 40, depth: 20 })
    near(areaOf(hallOf(second.project, second.id).footprint), 800)
  })

  it('a polygon with an arc makes a free outline, its area the stroke’s', () => {
    const stroke: Footprint = {
      kind: 'contour',
      contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 60, y: 0, r: 0 }, { x: 60, y: 30, r: 0 }, { x: 0, y: 30, r: 0 }], arcs: { 1: -0.2 } } satisfies Contour,
    }
    const r = draw(demoProject(), { programId: 'office', footprint: stroke })
    const t = typeOf(r.project, 'office')!
    expect(Object.keys(t.morphology.arcs ?? {})).toEqual(['1'])
    expect(t.morphology.outline.length).toBeGreaterThanOrEqual(3)
    const was = areaOf(stroke)
    const now = areaOf(hallOf(r.project, r.id).footprint)
    expect(Math.abs(now - was) / was).toBeLessThan(2e-3)
  })

  it('a trapezoid: the footprint is the stroke, its grid turned to the longest wall', () => {
    const stroke = contour([200, 100], [260, 100], [248, 124], [206, 124])
    const r = draw(demoProject(), { programId: 'office', footprint: stroke })
    // the outline is stored to the millimetre (Phase D.3): the face is the stroke within a millimetre of its perimeter
    near(areaOf(hallOf(r.project, r.id).footprint), areaOf(stroke), 0.1)
    const b = buildingOf(r.project, r.id)
    expect(b.warehouse!.place.angle).toBe(0)
    // a type made from it is generated, one hall part, no docks
    const g = generate(typeOf(r.project, 'office')!)
    expect(g.parts).toHaveLength(1)
    expect(g.doors).toEqual([])
  })

  it('a rotated rectangle: the block’s angle is its rotation', () => {
    const r = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 48, 24, 30) })
    expect(buildingOf(r.project, r.id).warehouse!.place.angle).toBe(30)
    expect(hallOf(r.project, r.id).footprint).toMatchObject({ kind: 'rect', width: 48, depth: 24, rotation: 30 })
  })

  it('holes of the stroke are the block’s holes', () => {
    const hole: Contour = { vertices: [{ x: 290, y: 195, r: 0 }, { x: 310, y: 195, r: 0 }, { x: 310, y: 205, r: 0 }, { x: 290, y: 205, r: 0 }] }
    const r = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 60, 30), holes: [hole] })
    expect(hallOf(r.project, r.id).holes).toHaveLength(1)
    near(Math.abs(area(hallOf(r.project, r.id).holes![0].vertices)), 200, 1e-3)
  })

  it('No program shares one type, Block', () => {
    const a = draw(demoProject(), { programId: null, footprint: rect(300, 200, 60, 30) })
    const b = draw(a.project, { programId: null, footprint: rect(400, 100, 40, 20) })
    expect(b.project.warehouseTypes!.filter((t) => t.program === null)).toHaveLength(1)
    expect(typeOf(b.project, null)!.name).toBe('Block')
    expect(buildingOf(a.project, a.id).warehouse!.overrides).toBeUndefined()
    expect(buildingOf(b.project, b.id).warehouse!.overrides).toBeDefined()
    expect(hallOf(b.project, b.id).programId).toBeNull()
  })

  it('a new project’s empty Building 1 is taken over, not left empty', () => {
    const p = newProject('industrial')
    const r = draw(p, { programId: 'warehouse', footprint: rect(100, 100, 80, 40), levelId: 'l1' })
    expect(r.project.buildings).toHaveLength(1)
    expect(r.building).toBe('b1')
    expect(r.project.buildings[0].warehouse).toBeDefined()
    expect(r.project.options[0].buildingIds).toEqual(['b1'])
    expect(hallOf(r.project, r.id).levelId).toBe('l1')
  })

  it('the height asked is the type’s; the type’s own height is kept by a variant', () => {
    const r = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 60, 30), height: 8 })
    expect(typeOf(r.project, 'office')!.envelope.height).toBe(8)
    expect(hallOf(r.project, r.id).height).toBe(8)
    const v = draw(r.project, { programId: 'office', footprint: rect(400, 100, 40, 20) })
    expect(hallOf(v.project, v.id).height).toBe(8)
  })

  it('a program that has its type already: no new type', () => {
    const base = demoProject()
    const made = actions.addWarehouseType(base, { program: 'warehouse' })
    const r = draw(made.project, { programId: 'warehouse', footprint: rect(300, 200, 60, 30) })
    expect(r.project.warehouseTypes).toHaveLength(1)
    expect(buildingOf(r.project, r.id).warehouse!.type).toBe(made.id)
    // the type was made by hand with its docks: the stroke is its own and has none
    expect(copyGenerated(typeOf(r.project, 'warehouse')!, buildingOf(r.project, r.id).warehouse!).doors).toEqual([])
  })

  it('a block narrower than a module (a guard house) is not past its range: it is its type’s own size', () => {
    const r = draw(demoProject(), { programId: 'guardhouse', footprint: rect(100, 20, 6, 3) })
    expect(derive(r.project, 'o1').issues.filter((i) => i.code === 'range')).toEqual([])
    const again = draw(r.project, { programId: 'guardhouse', footprint: rect(140, 20, 6, 3) })
    expect(derive(again.project, 'o1').issues.filter((i) => i.code === 'range')).toEqual([])
  })

  it('a stroke too small for its walls makes nothing', () => {
    expect(drawBlock(demoProject(), { programId: 'office', footprint: rect(300, 200, 0.5, 0.5), optionId: 'o1' })).toBeNull()
  })

  it('an open program (not built) is a block too: no walls, columns or roof, its area as before', () => {
    const base = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 60, 30) }).project
    const columns = (p: Project) => kpiCatalog(p).find((k) => k.id === 'columns')!.read(p, derive(p, 'o1'))
    const walls = (p: Project) => kpiCatalog(p).find((k) => k.id === 'wall-area')!.read(p, derive(p, 'o1'))
    const yard = draw(base, { programId: 'outdoor-storage', footprint: rect(100, 50, 30, 80) })
    expect(typeOf(yard.project, 'outdoor-storage')!.name).toBe('Outdoor storage')
    expect(yard.project.programs.find((g) => g.id === 'outdoor-storage')!.built).toBe(false)
    expect(columns(yard.project)).toBe(columns(base))
    expect(walls(yard.project)).toBe(walls(base))
    // its area counts as it did for a mass
    expect(derive(yard.project, 'o1').metrics.areaByProgram['outdoor-storage']).toBeCloseTo(2400, 3)
    expect(derive(yard.project, 'o1').metrics.builtFootprint).toBeCloseTo(derive(base, 'o1').metrics.builtFootprint, 3)
  })

  it('the program keeps its kind and its settings; the typology keeps its docks off in a blank project', () => {
    const blank = newProject('blank')
    expect(blank.programs).toEqual([])
    const r = draw(blank, { programId: null, footprint: rect(50, 50, 40, 20), levelId: 'l1' })
    expect(typeOf(r.project, null)!.elements).toEqual([])
    expect(r.project.buildings[0].warehouse).toBeDefined()
  })
})

describe('blockTypeFor', () => {
  it('a program’s type, else a new one named after it; one per program', () => {
    const p = demoProject()
    const a = blockTypeFor(p, 'office')
    expect(a.fresh).toBe(true)
    expect(a.project.warehouseTypes!.find((t) => t.id === a.id)).toMatchObject({ name: 'Office', program: 'office', elements: [] })
    const b = blockTypeFor(a.project, 'office')
    expect(b).toMatchObject({ id: a.id, fresh: false })
    expect(b.project).toBe(a.project)
    const none = blockTypeFor(p, null)
    expect(none.project.warehouseTypes!.find((t) => t.id === none.id)).toMatchObject({ name: 'Block', program: null })
  })

  it('a program that is not in the brief is none', () => {
    const r = blockTypeFor(demoProject(), 'nope')
    expect(r.project.warehouseTypes!.find((t) => t.id === r.id)!.program).toBeNull()
  })
})

describe('Union of blocks', () => {
  const two = (a: string | null, b: string | null) => {
    const first = draw(demoProject(), { programId: a, footprint: rect(300, 200, 40, 20) })
    const second = draw(first.project, { programId: b, footprint: rect(340, 200, 40, 20) })
    return { project: second.project, ids: [first.id, second.id], first, second }
  }

  it('two touching blocks of one type join into the first’s own outline, the other goes', () => {
    const { project, ids, first } = two('office', 'office')
    const r = actions.mergeMasses(project, ids)!
    expect(r.id).toBe(ids[0])
    const hall = hallOf(r.project, ids[0])
    near(areaOf(hall.footprint), 1600, 1e-2)
    expect(r.project.masses.some((m) => m.id === ids[1])).toBe(false)
    expect(r.project.buildings).toHaveLength(project.buildings.length - 1)
    expect(buildingOf(r.project, ids[0]).id).toBe(first.building)
    // a variant of its type, whose own outline is the union
    expect(buildingOf(r.project, ids[0]).warehouse!.overrides!.morphology).toBeDefined()
    expect(r.project.warehouseTypes).toHaveLength(1)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('blocks of two types do not join: the reason says to give them one type first', () => {
    const { project, ids } = two('office', 'warehouse')
    expect(actions.mergeMasses(project, ids)).toBeNull()
    expect(actions.mergeBlocks(project, ids)).toEqual({ reason: 'Blocks of different types do not join: give them one type first' })
  })

  it('blocks that do not touch do not join, and say so', () => {
    const first = draw(demoProject(), { programId: 'office', footprint: rect(300, 200, 40, 20) })
    const far = draw(first.project, { programId: 'office', footprint: rect(400, 100, 40, 20) })
    expect(actions.mergeMasses(far.project, [first.id, far.id])).toBeNull()
    expect(actions.mergeBlocks(far.project, [first.id, far.id])).toEqual({ reason: expect.stringMatching(/touch/) })
  })

  it('masses that are not blocks are the plain union, as before', () => {
    expect(actions.mergeBlocks(demoProject(), ['m1', 'm2'])).toBeNull()
  })
})

describe('what is stored is rounded to the millimetre (Phase D.3, task 1)', () => {
  /** Whether every number has three decimals at most. */
  const mm = (v: number) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9
  const turned = (deg: number, ...pts: [number, number][]): [number, number][] => {
    const a = (deg * Math.PI) / 180
    return pts.map(([x, y]) => [300 + x * Math.cos(a) - y * Math.sin(a), 200 + x * Math.sin(a) + y * Math.cos(a)])
  }
  const trapezoid = () => draw(demoProject(), { programId: 'office', footprint: contour(...turned(17, [0, 0], [60, 0], [48, 24], [6, 24])) })

  it('a stroke at 17° stores every outline corner with three decimals at most', () => {
    const r = trapezoid()
    const t = typeOf(r.project, 'office')!
    expect(t.morphology.outline).toHaveLength(4)
    for (const c of t.morphology.outline) {
      expect(mm(c.x), `x ${c.x}`).toBe(true)
      expect(mm(c.y), `y ${c.y}`).toBe(true)
    }
  })

  it('a hole added and then edited on that block stores its corners with three decimals at most', () => {
    const r = trapezoid()
    const hall = hallOf(r.project, r.id)
    const c = footprintPolygon(hall.footprint)
    const mid = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
    const around = { vertices: [-4.123456, 4.987654].flatMap((x) => [-3.333333, 2.666666].map((y) => ({ x: mid.x + x, y: mid.y + y, r: 0 }))) }
    // the four corners in order round the rectangle (counter-clockwise)
    const ring: Contour = { vertices: [around.vertices[0], around.vertices[2], around.vertices[3], around.vertices[1]] }
    const added = actions.addHole(r.project, hall.id, ring)
    expect(added).not.toBeNull()
    const holes = (p: Project) => buildingOf(p, r.id).warehouse!.overrides!.morphology!.holes!
    expect(holes(added!.project)).toHaveLength(1)
    for (const v of holes(added!.project)[0].vertices) {
      expect(mm(v.x), `added x ${v.x}`).toBe(true)
      expect(mm(v.y), `added y ${v.y}`).toBe(true)
    }
    const ref = { kind: 'mass-hole', id: `${hall.id}/0` }
    const read = actions.shapeOf(added!.project, ref)!
    const v = read.contour.vertices[2]
    const dragged = actions.editShape(added!.project, ref, { op: 'vertex', vertex: 2, to: { x: v.x + 1.2345678, y: v.y + 0.7654321 } })
    expect(dragged.reason).toBeUndefined()
    for (const q of holes(dragged.project)[0].vertices) {
      expect(mm(q.x), `dragged x ${q.x}`).toBe(true)
      expect(mm(q.y), `dragged y ${q.y}`).toBe(true)
    }
  })
})
