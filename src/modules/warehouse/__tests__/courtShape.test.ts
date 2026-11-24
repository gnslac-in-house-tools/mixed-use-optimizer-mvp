// A truck court is a shape of its own on the shape engine (Phase D.3, task 6; Decisions "Court shape", "Shape engine"): kinds `court` (the block editor's,
// `<typeId>/<edgeId>[/<courtId>]`) and `block-court` (a placed block's on the site, `<hallMassId>/<edgeId>[/<courtId>]`), one writer. A rectangle stays
// a rectangle while only its depth moves; every other op writes a shape in the wall's frame; the wall side stays on the wall; on the site a court's
// shape is the copy's own (`overrides.courts`), *Back to type* clears it.
import { describe, expect, it } from 'vitest'
import type { Contour, CourtByEdge, Point, Project, WarehouseType } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'
import { rawPolygon } from '../../../engine/geom/contour.ts'
import type { ShapeRead } from '../../../engine/geom/shapeOp.ts'
import { editShape, shapeOf } from '../../../state/actions/shape.ts'
import { createAppStore } from '../../../state/store.ts'
import { demoProject } from '../../../state/demo.ts'
import { addWarehouseType, copyBackToType, courtToRectangle, lockWarehouseStep, placeWarehouse } from '../actions.ts'
import { fromPlace, onPlace } from '../engine/copies.ts'
import { STAYS_ON_WALL, courtDepth, fromWall, toWall, wallFrame, wentNote, type WallFrame } from '../engine/courts.ts'
import { generate } from '../engine/generate.ts'

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  vertices: [
    { x: x0, y: y0, r: 0 },
    { x: x1, y: y0, r: 0 },
    { x: x1, y: y1, r: 0 },
    { x: x0, y: y1, r: 0 },
  ],
})

/** The default block (200 × 96 m, 60 docks on its south wall e1: a court there at the block's depth) with these courts by edge. */
function start(courts?: CourtByEdge[]) {
  const base = demoProject()
  const made = addWarehouseType(base)
  let p = made.project
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
  if (courts) p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === made.id ? { ...t, courts } : t)) }
  return { p, id: made.id, option: base.options[0].id }
}
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!
const frameOf = (p: Project, id: string, edge = 'e1'): WallFrame => wallFrame(generate(typeIn(p, id)).edges.find((e) => e.id === edge)!)
const typeRef = (id: string, edge = 'e1', court?: string) => ({ kind: 'court', id: court ? `${id}/${edge}/${court}` : `${id}/${edge}` })
/** The court as the wall's frame has it: the corners of the contour a viewport reads, back in x along the wall and y out of it. */
const inWall = (read: ShapeRead, f: WallFrame, place?: { x: number; y: number; angle: number }): Point[] => read.contour.vertices.map((v) => toWall(f, place ? fromPlace(place, v) : v))
/** The index of the corner of a read at x along the wall, y out of it. */
const cornerAt = (read: ShapeRead, f: WallFrame, x: number, y: number, place?: { x: number; y: number; angle: number }): number => {
  const i = inWall(read, f, place).findIndex((q) => Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6)
  expect(i, `no corner at ${x}, ${y}`).toBeGreaterThanOrEqual(0)
  return i
}
/** The index of the edge of a read whose two ends are on y (a wall's far edge, the wall side at 0), or on x. */
const edgeAtY = (read: ShapeRead, f: WallFrame, y: number, place?: { x: number; y: number; angle: number }): number => {
  const q = inWall(read, f, place)
  return q.findIndex((a, i) => Math.abs(a.y - y) < 1e-6 && Math.abs(q[(i + 1) % q.length].y - y) < 1e-6)
}
const edgeAtX = (read: ShapeRead, f: WallFrame, x: number, place?: { x: number; y: number; angle: number }): number => {
  const q = inWall(read, f, place)
  return q.findIndex((a, i) => Math.abs(a.x - x) < 1e-6 && Math.abs(q[(i + 1) % q.length].x - x) < 1e-6)
}
/** The wall side of a court in its frame: its corners on the wall, x from lowest to highest. */
const wallSideOf = (c: Contour | undefined): [number, number] => {
  const on = c!.vertices.filter((v) => Math.abs(v.y) < 1e-9).map((v) => v.x)
  return [Math.min(...on), Math.max(...on)]
}
/** A project as the undo hands it back: the decision log, which undo adds to, aside. */
const sans = (p: Project) => {
  const { log: _, ...rest } = p
  return rest
}
const courtsOf = (p: Project, id: string, edge = 'e1') => (typeIn(p, id).courts ?? []).filter((c) => c.edge === edge)

describe('a truck court read by the shape engine, in the block editor', () => {
  it('a rectangle: the contour counter-clockwise in the type’s frame, the wall side fixed, the far edge’s value its depth 5–200 m, its corners on the wall on a line', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const depth = standardsOf(p).courtDepth
    expect(signedArea(rawPolygon(read.contour))).toBeGreaterThan(0)
    expect(read.contour.vertices).toHaveLength(4)
    const q = inWall(read, f)
    expect(Math.min(...q.map((v) => v.x))).toBeCloseTo(0, 6)
    expect(Math.max(...q.map((v) => v.x))).toBeCloseTo(200, 6)
    expect(Math.max(...q.map((v) => v.y))).toBeCloseTo(depth, 6)
    // the wall side: fixed; the far edge: the depth, as the pill typed it
    const fixed = read.walls!.flatMap((w, i) => (w.fixed ? [i] : []))
    expect(fixed).toEqual([edgeAtY(read, f, 0)])
    const far = edgeAtY(read, f, depth)
    expect(read.walls![far].value).toEqual({ now: depth, lo: 5, hi: 200 })
    expect(read.walls!.filter((w) => w.value)).toHaveLength(1)
    // the corners on the wall slide along it
    expect(read.onLine!.corners.slice().sort()).toEqual([cornerAt(read, f, 0, 0), cornerAt(read, f, 200, 0)].sort())
    const { a, b } = read.onLine!
    expect(toWall(f, a).y).toBeCloseTo(0, 6)
    expect(toWall(f, b).y).toBeCloseTo(0, 6)
  })

  it('a shaped court: its own shape, no value on any edge; a wall with no court and no docks, or one that is not there, reads null', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(10, 0, 60, 30) }])
    const read = shapeOf(p, typeRef(id, 'e1', 'c1'))!
    const f = frameOf(p, id)
    expect(read.walls!.some((w) => w.value)).toBe(false)
    expect(read.walls![edgeAtY(read, f, 0)].fixed).toBe(true)
    expect(courtDepth({ vertices: inWall(read, f).map((v) => ({ ...v, r: 0 })) })).toBeCloseTo(30, 6)
    // without its id, a wall with one court reads it
    expect(shapeOf(p, typeRef(id))!.contour).toEqual(read.contour)
    expect(shapeOf(p, typeRef(id, 'e3'))).toBeNull()
    expect(shapeOf(p, typeRef(id, 'e1', 'c9'))).toBeNull()
    expect(shapeOf(p, typeRef('nope'))).toBeNull()
  })
})

describe('a truck court edited on a type', () => {
  it('the far edge of a rectangle pushed 6 m: its depth 6 m more, no shape, one undo step', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const now = read.walls![edgeAtY(read, f, standardsOf(p).courtDepth)].value!.now
    const far = edgeAtY(read, f, now)
    const s = createAppStore(p)
    s.getState().apply((q) => editShape(q, typeRef(id), { op: 'push', wall: far, by: 6 }).project)
    expect(typeIn(s.getState().project, id).courts).toEqual([{ edge: 'e1', depth: now + 6 }])
    s.getState().undo()
    expect(sans(s.getState().project)).toEqual(sans(p))
    const w = editShape(p, typeRef(id), { op: 'push', wall: far, by: 6, free: true })
    expect(w.applied).toBe(6)
  })

  it('a rectangle with its own depth: its far edge pushed again changes the depth, a side pushed in makes a shape and drops the depth', () => {
    const { p, id } = start([{ edge: 'e1', depth: 30 }])
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const far = edgeAtY(read, f, 30)
    expect(read.walls![far].value!.now).toBe(30)
    expect(typeIn(editShape(p, typeRef(id), { op: 'push', wall: far, by: -10 }).project, id).courts).toEqual([{ edge: 'e1', depth: 20 }])
    const side = edgeAtX(read, f, 200)
    const q = editShape(p, typeRef(id), { op: 'push', wall: side, by: -4 }).project
    const [c] = typeIn(q, id).courts!
    expect(c).toMatchObject({ edge: 'e1', id: 'c1' })
    expect(c.depth).toBeUndefined()
    expect(wallSideOf(c.shape)).toEqual([0, 196])
    near(courtDepth(c.shape!), 30)
  })

  it('a side pushed in 4 m: a shape, its wall side 4 m shorter, an id, one undo step', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const s = createAppStore(p)
    s.getState().apply((q) => editShape(q, typeRef(id), { op: 'push', wall: edgeAtX(read, f, 200), by: -4 }).project)
    const [c] = typeIn(s.getState().project, id).courts!
    expect(c.id).toBe('c1')
    expect(wallSideOf(c.shape)).toEqual([0, 196])
    near(courtDepth(c.shape!), standardsOf(p).courtDepth)
    s.getState().undo()
    expect(sans(s.getState().project)).toEqual(sans(p))
  })

  it('a far corner chamfered 4 × 6 m: the court’s corner as the wall’s frame has it, its set-backs the other way round', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const d = standardsOf(p).courtDepth
    const w = editShape(p, typeRef(id), { op: 'chamfer', vertex: cornerAt(read, f, 200, d), a: 4, b: 6 })
    expect(w.reason).toBeUndefined()
    const [c] = typeIn(w.project, id).courts!
    const v = c.shape!.vertices.find((x) => x.x === 200 && x.y === d)!
    // 4 back along the viewport's incoming edge (the far edge), 6 along its outgoing one (the side): in the wall's frame the incoming edge is the side, so swapped
    expect(v.chamfer).toEqual([6, 4])
    // the shape engine reads it back as it wrote it
    const again = shapeOf(w.project, typeRef(id, 'e1', 'c1'))!
    expect(again.contour.vertices[cornerAt(again, f, 200, d)].chamfer).toEqual([4, 6])
  })

  it('a radius on a far corner', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const d = standardsOf(p).courtDepth
    const w = editShape(p, typeRef(id), { op: 'radius', vertex: cornerAt(read, f, 0, d), r: 5 })
    expect(w.reason).toBeUndefined()
    const [c] = typeIn(w.project, id).courts!
    expect(c.shape!.vertices.find((x) => x.x === 0 && x.y === d)!.r).toBe(5)
  })

  it('a far corner dragged in: an angled far edge, the depth the same', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const d = standardsOf(p).courtDepth
    const w = editShape(p, typeRef(id), { op: 'vertex', vertex: cornerAt(read, f, 200, d), to: fromWall(f, { x: 180, y: d }) })
    expect(w.reason).toBeUndefined()
    const [c] = typeIn(w.project, id).courts!
    expect(c.shape!.vertices.map((v) => [v.x, v.y])).toEqual(expect.arrayContaining([[180, d], [200, 0]]))
    near(courtDepth(c.shape!), d)
  })

  it('a wall-side corner dragged off the wall lands on it, along it', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const w = editShape(p, typeRef(id), { op: 'vertex', vertex: cornerAt(read, f, 0, 0), to: fromWall(f, { x: 5, y: 3 }) })
    expect(w.reason).toBeUndefined()
    const [c] = typeIn(w.project, id).courts!
    expect(wallSideOf(c.shape)).toEqual([5, 200])
    expect(c.shape!.vertices.every((v) => v.y >= 0)).toBe(true)
  })

  it('a bump on the far edge: a deeper stretch of it', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const d = standardsOf(p).courtDepth
    const w = editShape(p, typeRef(id), { op: 'bump', wall: edgeAtY(read, f, d), from: 50, to: 80, by: 8 })
    expect(w.reason).toBeUndefined()
    const [c] = typeIn(w.project, id).courts!
    expect(c.shape!.vertices).toHaveLength(8)
    near(courtDepth(c.shape!), d + 8)
  })

  it('the wall side pushed: refused, the same project, with its reason, in or out', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 30) }])
    const read = shapeOf(p, typeRef(id))!
    const wall = edgeAtY(read, frameOf(p, id), 0)
    for (const by of [3, -3]) {
      const w = editShape(p, typeRef(id), { op: 'push', wall, by })
      expect(w.project).toBe(p)
      expect(w.reason).toBe(STAYS_ON_WALL)
    }
    const b = editShape(p, typeRef(id), { op: 'bump', wall, from: 10, to: 20, by: 3 })
    expect(b.project).toBe(p)
    expect(b.reason).toBe(STAYS_ON_WALL)
  })

  it('deeper than 200 m: held, with its note (a rectangle’s depth, and a shape’s)', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const far = edgeAtY(read, f, standardsOf(p).courtDepth)
    const w = editShape(p, typeRef(id), { op: 'push', wall: far, by: 500 })
    expect(typeIn(w.project, id).courts).toEqual([{ edge: 'e1', depth: 200 }])
    expect(w.notes?.join(' ')).toMatch(/Held to 200 m: a court is 5–200 m deep/)
    // a shape pushed deeper
    const shaped = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 150, 40) }])
    const r2 = shapeOf(shaped.p, typeRef(shaped.id))!
    const v = editShape(shaped.p, typeRef(shaped.id), { op: 'push', wall: edgeAtY(r2, frameOf(shaped.p, shaped.id), 40), by: 500 })
    near(courtDepth(typeIn(v.project, shaped.id).courts![0].shape!), 200)
    expect(v.notes?.join(' ')).toMatch(/Held to 200 m/)
  })

  it('split square to the wall: two courts of the wall, each with an id, the first keeping the court’s own', () => {
    const { p, id } = start([
      { edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 40) },
      { edge: 'e3', id: 'c2', shape: rect(0, 0, 200, 40) },
    ])
    const f = frameOf(p, id)
    const w = editShape(p, typeRef(id, 'e1', 'c1'), { op: 'split', a: fromWall(f, { x: 100, y: -1 }), b: fromWall(f, { x: 100, y: 50 }) })
    expect(w.reason).toBeUndefined()
    const mine = courtsOf(w.project, id)
    expect(mine.map((c) => c.id).sort()).toEqual(['c1', 'c3'])
    expect(mine.map((c) => wallSideOf(c.shape)).sort((a, b) => a[0] - b[0])).toEqual([[0, 100], [100, 200]])
    // the other wall's court is as it was
    expect(courtsOf(w.project, id, 'e3')).toEqual([{ edge: 'e3', id: 'c2', shape: rect(0, 0, 200, 40) }])
    // each is reached by its id
    expect(shapeOf(w.project, typeRef(id, 'e1', 'c3'))).not.toBeNull()
    expect(w.notes ?? []).toEqual([])
  })

  it('a court with no id splits too: both pieces get one; a wall with a split reads its courts by id', () => {
    const { p, id } = start([{ edge: 'e1', depth: 40 }])
    const f = frameOf(p, id)
    const w = editShape(p, typeRef(id), { op: 'split', a: fromWall(f, { x: 60, y: -1 }), b: fromWall(f, { x: 60, y: 50 }) })
    expect(w.reason).toBeUndefined()
    expect(courtsOf(w.project, id).map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(courtsOf(w.project, id).every((c) => c.shape && c.depth === undefined)).toBe(true)
  })

  it('split parallel to the wall: the far piece goes, with its note', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 200, 40) }])
    const f = frameOf(p, id)
    const w = editShape(p, typeRef(id, 'e1', 'c1'), { op: 'split', a: fromWall(f, { x: -5, y: 20 }), b: fromWall(f, { x: 205, y: 20 }) })
    expect(w.reason).toBeUndefined()
    expect(w.notes).toContain(wentNote(1))
    const mine = courtsOf(w.project, id)
    expect(mine).toHaveLength(1)
    expect(mine[0].id).toBe('c1')
    near(courtDepth(mine[0].shape!), 20)
  })

  it('a line that does not cross the court is refused; so is a line of one point', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 100, 40) }])
    const f = frameOf(p, id)
    const miss = editShape(p, typeRef(id, 'e1', 'c1'), { op: 'split', a: fromWall(f, { x: 150, y: -1 }), b: fromWall(f, { x: 150, y: 50 }) })
    expect(miss.project).toBe(p)
    expect(miss.reason).toMatch(/does not cross/)
    const dot = editShape(p, typeRef(id, 'e1', 'c1'), { op: 'split', a: fromWall(f, { x: 50, y: 5 }), b: fromWall(f, { x: 50, y: 5 }) })
    expect(dot.project).toBe(p)
    expect(dot.reason).toMatch(/two different points/)
  })

  it('a court moves with its wall: a move is refused by its kind, and a court that is not there says so', () => {
    const { p, id } = start()
    const w = editShape(p, typeRef(id), { op: 'move', by: { x: 1, y: 0 } })
    expect(w.project).toBe(p)
    expect(w.reason).toMatch(/does not take move/)
    expect(editShape(p, typeRef(id, 'e3'), { op: 'radius', vertex: 0, r: 2 }).reason).toMatch(/not there/)
  })

  it('an edit that changes nothing is the same project: a rectangle stays one', () => {
    const { p, id } = start()
    expect(editShape(p, typeRef(id), { op: 'radius', vertex: 0, r: 0 }).project).toBe(p)
    expect(editShape(p, typeRef(id), { op: 'push', wall: 0, by: 0 }).project).toBe(p)
  })
})

describe('Back to a rectangle', () => {
  it('the shape gone, its depth the deepest point’s, its id with it', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const d = standardsOf(p).courtDepth
    const bumped = editShape(p, typeRef(id), { op: 'bump', wall: edgeAtY(read, f, d), from: 50, to: 80, by: 8 }).project
    const w = courtToRectangle(bumped, typeRef(id, 'e1', 'c1'))
    expect(w.reason).toBeUndefined()
    expect(typeIn(w.project, id).courts).toEqual([{ edge: 'e1', depth: d + 8 }])
  })

  it('a depth held to 5–200 m; a court that is a rectangle already: the same project', () => {
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape: rect(0, 0, 100, 2) }])
    expect(typeIn(courtToRectangle(p, typeRef(id)).project, id).courts).toEqual([{ edge: 'e1', depth: 5 }])
    const plain = start()
    expect(courtToRectangle(plain.p, typeRef(plain.id)).project).toBe(plain.p)
  })

  it('a wall with several courts: refused, the others stay', () => {
    const { p, id } = start([
      { edge: 'e1', id: 'c1', shape: rect(0, 0, 100, 40) },
      { edge: 'e1', id: 'c2', shape: rect(100, 0, 200, 40) },
    ])
    const w = courtToRectangle(p, typeRef(id, 'e1', 'c1'))
    expect(w.project).toBe(p)
    expect(w.reason).toMatch(/only court/)
  })
})

describe('the span of a court’s wall side (the plan’s call: the wall’s face, from corner to corner, in both viewports and when the outline changes)', () => {
  it('a rectangle in the block editor is as it is drawn, 0 to the reference line’s length; the rule lets its wall side reach the face’s end', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const f = frameOf(p, id)
    const q = inWall(read, f)
    near(Math.min(...q.map((v) => v.x)), 0)
    near(Math.max(...q.map((v) => v.x)), 200)
    // its low side pushed out by the wall's thickness: on the face's end, kept; pushed further: clipped there, said
    const lo = editShape(p, typeRef(id), { op: 'push', wall: edgeAtX(read, f, 0), by: 0.3 })
    expect(wallSideOf(typeIn(lo.project, id).courts![0].shape)[0]).toBeCloseTo(-0.3, 6)
    expect(lo.notes ?? []).toEqual([])
    const far = editShape(p, typeRef(id), { op: 'push', wall: edgeAtX(read, f, 0), by: 5 })
    expect(wallSideOf(typeIn(far.project, id).courts![0].shape)[0]).toBeCloseTo(-0.3, 6)
    expect(far.notes?.join(' ')).toMatch(/Clipped to its wall/)
  })

  it('an outline edit keeps a shape that reaches the face’s end: the wall pushed 3 m, the court’s shape the same', () => {
    const shape = rect(-0.3, 0, 200.3, 40)
    const { p, id } = start([{ edge: 'e1', id: 'c1', shape }])
    const w = editShape(p, { kind: 'block-type', id }, { op: 'push', wall: 0, by: 3, free: true })
    expect(w.reason).toBeUndefined()
    expect(typeIn(w.project, id).courts).toEqual([{ edge: 'e1', id: 'c1', shape }])
  })
})

/** The block placed on the site, turned 30°: the project, the building, its hall mass and where the copy stands. */
function onSite(courts?: CourtByEdge[], angle = 30) {
  const { p, id, option } = start(courts)
  const placed = placeWarehouse(p, id, { x: 200, y: 150 }, angle, option)!
  const b = placed.project.buildings.find((x) => x.id === placed.id)!
  const levels = new Set(b.levels.map((l) => l.id))
  const hall = placed.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
  return { p: placed.project, type: id, building: placed.id, hall: hall.id, place: b.warehouse!.place }
}
const siteRef = (hall: string, edge = 'e1', court?: string) => ({ kind: 'block-court', id: court ? `${hall}/${edge}/${court}` : `${hall}/${edge}` })
const hallIn = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const copyIn = (p: Project, building: string) => p.buildings.find((b) => b.id === building)!.warehouse!

describe('a truck court edited on the site', () => {
  it('read on the plan: the type’s frame through the copy’s place, counter-clockwise, a rectangle spanning the wall’s face', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    expect(signedArea(rawPolygon(read.contour))).toBeGreaterThan(0)
    const q = inWall(read, f, s.place)
    // the site derives a court across its wall's face (a wall's thickness past the reference line at each end)
    near(Math.min(...q.map((v) => v.x)), -0.3, 1e-5)
    near(Math.max(...q.map((v) => v.x)), 200.3, 1e-5)
    const depth = standardsOf(s.p).courtDepth
    const far = edgeAtY(read, f, depth, s.place)
    expect(read.walls![far].value).toEqual({ now: depth, lo: 5, hi: 200 })
    expect(read.walls![edgeAtY(read, f, 0, s.place)].fixed).toBe(true)
    // each corner is the type's, put on the plan
    const w = q.map((v) => onPlace(s.place, fromWall(f, v)))
    read.contour.vertices.forEach((v, i) => {
      near(v.x, w[i].x, 1e-5)
      near(v.y, w[i].y, 1e-5)
    })
  })

  it('the far edge of a rectangle writes the wall’s own depth (Mass.courts): no variant, the type untouched', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    const d = standardsOf(s.p).courtDepth
    const w = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtY(read, f, d, s.place), by: 6 })
    expect(w.reason).toBeUndefined()
    expect(w.applied).toBe(6)
    expect(hallIn(w.project, s.hall).courts).toEqual([{ t: expect.any(Number), depth: d + 6 }])
    expect(copyIn(w.project, s.building).overrides).toBeUndefined()
    expect(typeIn(w.project, s.type).courts).toBeUndefined()
  })

  it('a side pulled in: the copy’s own courts (a variant), its type unchanged; one undo step', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    const store = createAppStore(s.p)
    store.getState().apply((q) => editShape(q, siteRef(s.hall), { op: 'push', wall: edgeAtX(read, f, 200.3, s.place), by: -4 }).project)
    const q = store.getState().project
    const own = copyIn(q, s.building).overrides?.courts
    expect(own).toHaveLength(1)
    expect(own![0]).toMatchObject({ edge: 'e1', id: 'c1' })
    expect(own![0].depth).toBeUndefined()
    // the rectangle across the face (-0.3 to 200.3) less 4 m
    const [lo, hi] = wallSideOf(own![0].shape)
    near(lo, -0.3)
    near(hi, 196.3)
    expect(typeIn(q, s.type).courts).toBeUndefined()
    // the mass carries it to the circulation
    expect(hallIn(q, s.hall).blockCourts?.some((c) => c.shape && c.id === 'c1')).toBe(true)
    store.getState().undo()
    expect(sans(store.getState().project)).toEqual(sans(s.p))
  })

  it('a shape clears the wall’s own depth, and starts where the rectangle was (no jump)', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    const d = standardsOf(s.p).courtDepth
    const deeper = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtY(read, f, d, s.place), by: 6 }).project
    expect(hallIn(deeper, s.hall).courts).toHaveLength(1)
    const again = shapeOf(deeper, siteRef(s.hall))!
    const w = editShape(deeper, siteRef(s.hall), { op: 'push', wall: edgeAtX(again, f, 200.3, s.place), by: -4 })
    expect(w.reason).toBeUndefined()
    expect(hallIn(w.project, s.hall).courts ?? []).toEqual([])
    const [c] = copyIn(w.project, s.building).overrides!.courts!
    near(courtDepth(c.shape!), d + 6)
    near(wallSideOf(c.shape)[1], 196.3)
  })

  it('a split on the site: two courts of the copy’s own, with their ids', () => {
    const s = onSite()
    const f = frameOf(s.p, s.type)
    const at = (x: number, y: number) => onPlace(s.place, fromWall(f, { x, y }))
    const w = editShape(s.p, siteRef(s.hall), { op: 'split', a: at(100, -1), b: at(100, 60) })
    expect(w.reason).toBeUndefined()
    expect(copyIn(w.project, s.building).overrides!.courts!.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(hallIn(w.project, s.hall).blockCourts!.filter((c) => c.shape)).toHaveLength(2)
  })

  it('a shape made on the site that reaches the face’s end stays whole when the copy’s outline is edited (the block editor’s span and the site’s are one)', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    const a = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtX(read, f, 200.3, s.place), by: -4 }).project
    expect(wallSideOf(copyIn(a, s.building).overrides!.courts![0].shape)[0]).toBeCloseTo(-0.3, 6)
    // the copy’s south wall pushed out 3 m, free
    const b = editShape(a, { kind: 'mass', id: s.hall }, { op: 'push', wall: 0, by: 3, free: true })
    expect(b.reason).toBeUndefined()
    const [c] = copyIn(b.project, s.building).overrides!.courts!
    expect(c.id).toBe('c1')
    near(wallSideOf(c.shape)[0], -0.3)
    near(wallSideOf(c.shape)[1], 196.3)
  })

  it('a copy’s own court follows its type’s outline edit: the west wall pushed out 12 m, the copy’s court stays where it stood (review S1)', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    // the copy’s court pulled in 20 m from its west end: its own, on the type’s outline
    const a = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtX(read, f, -0.3, s.place), by: -20 }).project
    const [was] = copyIn(a, s.building).overrides!.courts!
    near(wallSideOf(was.shape)[0], 19.7)
    const w = editShape(a, { kind: 'block-type', id: s.type }, { op: 'push', wall: 3, by: 12, free: true })
    expect(w.reason).toBeUndefined()
    const [c] = copyIn(w.project, s.building).overrides!.courts!
    near(wallSideOf(c.shape)[0], 19.7 + 12)
  })

  it('Back to type clears them, with the wall’s own depth', () => {
    const s = onSite()
    const read = shapeOf(s.p, siteRef(s.hall))!
    const f = frameOf(s.p, s.type)
    const d = standardsOf(s.p).courtDepth
    const a = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtY(read, f, d, s.place), by: 6 }).project
    const again = shapeOf(a, siteRef(s.hall))!
    const b = editShape(a, siteRef(s.hall), { op: 'push', wall: edgeAtX(again, f, 200.3, s.place), by: -4 }).project
    const c = editShape(b, siteRef(s.hall), { op: 'radius', vertex: 0, r: 3 }).project
    expect(copyIn(c, s.building).overrides?.courts).toBeDefined()
    const back = copyBackToType(c, s.building)
    expect(copyIn(back, s.building).overrides).toBeUndefined()
    expect(hallIn(back, s.hall).blockCourts?.some((x) => x.shape) ?? false).toBe(false)
  })

  it('Back to a rectangle on a copy: its own courts say the depth', () => {
    const s = onSite()
    const f = frameOf(s.p, s.type)
    const read = shapeOf(s.p, siteRef(s.hall))!
    const q = editShape(s.p, siteRef(s.hall), { op: 'push', wall: edgeAtX(read, f, 200.3, s.place), by: -4 }).project
    const w = courtToRectangle(q, siteRef(s.hall, 'e1', 'c1'))
    expect(w.reason).toBeUndefined()
    expect(copyIn(w.project, s.building).overrides?.courts).toEqual([{ edge: 'e1', depth: standardsOf(s.p).courtDepth }])
  })

  it('a court on a wall that is not there, a mass that is no block’s, a move: refused', () => {
    const s = onSite()
    expect(shapeOf(s.p, siteRef(s.hall, 'e3'))).toBeNull()
    expect(shapeOf(s.p, siteRef('nope'))).toBeNull()
    const m = editShape(s.p, siteRef(s.hall), { op: 'move', by: { x: 1, y: 1 } })
    expect(m.project).toBe(s.p)
    expect(m.reason).toMatch(/does not take move/)
  })
})
