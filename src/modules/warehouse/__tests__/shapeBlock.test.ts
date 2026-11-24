// A block's footprint through the shape engine (Phase D.1, Decision "Shape engine", "Block shape"; free since D.2): the reader
// (its face as a contour, its walls with their edge, tone, module, range and lines), the writer on a type (a push by the metres asked, a box wall that
// stretches the box, a bump where it is asked, a corner removed) and on a copy (its own outline when it is bumped
// or a corner goes, its place moved where its box grows at a low wall), and what a block refuses (a move). The free ops are in freeOutline.test.ts.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Project } from '../../../model/schema.ts'
import { footprintContour, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { editShape, shapeOf } from '../../../state/actions/shape.ts'
import { demoProject } from '../../../state/demo.ts'
import {
  addWarehouseType,
  copyBackToType,
  lockWarehouseStep,
  moveBlockEdge,
  placeWarehouse,
  setCopyEdgeCourt,
  shapeCopy,
  shapeWarehouse,
  stretchWarehouseHall,
} from '../actions.ts'
import type { ShapeRead } from '../../../engine/geom/shapeOp.ts'
import { generate, type Generated } from '../engine/generate.ts'
import { facePolygon } from '../engine/shape.ts'

function start() {
  const base = demoProject()
  const made = addWarehouseType(base)
  let p = made.project
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
  return { p, id: made.id, option: base.options[0].id }
}
const typeRef = (id: string) => ({ kind: 'block-type', id })
const typeIn = (p: Project, id: string) => p.warehouseTypes!.find((t) => t.id === id)!
const copyIn = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
const hallOf = (p: Project, buildingId: string) => {
  const levels = new Set(copyIn(p, buildingId).levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}
const massRef = (p: Project, buildingId: string) => ({ kind: 'mass', id: hallOf(p, buildingId).id })
/** A type with a notch in its back, 4 modules deep (its modules 20 to 32), and a copy of it placed at (200, 150) turned `angle`. */
function notched(angle = 0) {
  const s = start()
  const p = shapeWarehouse(s.p, s.id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
  const placed = placeWarehouse(p, s.id, { x: 200, y: 150 }, angle, s.option)!
  return { ...s, p: placed.project, copy: placed.id }
}
/** m from the start of edge `edgeId`'s wall to module line `line` of the run along it, in the type's frame (`read`: the type's own reading). */
function rel(read: ShapeRead, g: Generated, edgeId: string, line: number): number {
  const e = g.edges.find((x) => x.id === edgeId)!
  const poly = read.contour.vertices
  const a = poly[e.index]
  const b = poly[(e.index + 1) % poly.length]
  const m = (e.horizontal ? g.runs.x : g.runs.y).modules[line]
  return e.horizontal ? (m - a.x) * Math.sign(b.x - a.x) : (m - a.y) * Math.sign(b.y - a.y)
}
type Pt = { x: number; y: number }
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
const has = (poly: Pt[], q: Pt) => poly.some((v) => same(v, q))
/** The polygon as it is before and after a corner went, no frame moved: the corner asked is gone (what else moves with it is the step's, pinned where it is exact). */
function expectCornerGone(before: Pt[], after: Pt[], i: number, label: string) {
  expect(has(after, before[i]), `${label}: corner ${i} is still there`).toBe(false)
  expect(after.length, label).toBeLessThan(before.length)
}
const close = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))
}

describe('the reader of a block type', () => {
  it('its face polygon, in the type’s frame, in m', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const g = generate(typeIn(p, id))
    expect(read.contour.vertices.map(({ x, y }) => ({ x, y }))).toEqual(facePolygon(g.edges))
    expect(read.contour.vertices.every((v) => v.r === 0)).toBe(true)
    // the kind says what it refuses, not the object
    expect(read.without).toBeUndefined()
    expect(read.why).toBeUndefined()
  })

  it('each wall: its edge, box or inner, its module, a box wall’s range, its module and bay lines', () => {
    const { p, id } = start()
    const read = shapeOf(
      shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project,
      typeRef(id),
    )!
    const t = typeIn(shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project, id)
    const g = generate(t)
    expect(read.walls).toHaveLength(g.edges.length)
    expect(read.walls!.map((w) => w.id)).toEqual(g.edges.map((e) => e.id))
    expect(read.walls!.map((w) => w.tone)).toEqual(g.edges.map((e) => (e.outer ? 'box' : 'inner')))
    expect(read.walls!.every((w) => w.module === 3)).toBe(true)
    // a box wall along x (the front) tells its width's range; along y (the left) its length's
    const front = read.walls![g.edges.findIndex((e) => e.id === 'e1')]
    expect(front.range).toEqual({ lo: 72, hi: 120, now: 96 })
    const left = read.walls![g.edges.findIndex((e) => e.id === 'e4')]
    expect(left.range).toEqual({ lo: 176, hi: 224, now: 200 })
    // an inner wall has none
    expect(read.walls!.find((w) => w.tone === 'inner')!.range).toBeUndefined()
    // the front's lines: every module line of the length, counted from the wall's start (its face, a wall's thickness before the box)
    const i = g.edges.findIndex((e) => e.id === 'e1')
    expect(front.stops).toHaveLength(g.runs.x.modules.length)
    expect(front.stops![0]).toBeCloseTo(read.contour.vertices[i].x * -1, 6)
    front.stops!.forEach((v, k) => expect(v).toBeCloseTo(g.runs.x.modules[k] - read.contour.vertices[i].x, 2))
    expect(front.bays).toHaveLength(g.runs.x.lines.length)
  })
})

describe('the writer on a block type', () => {
  it('an inner wall moves by the metres asked (10.2 m, not whole modules)', () => {
    const { p, id } = start()
    const q = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    const g = generate(typeIn(q, id))
    const bottom = g.edges.find((e) => !e.outer && e.horizontal)!
    const r = editShape(q, typeRef(id), { op: 'push', wall: bottom.index, by: 10.2 })
    expect(r.reason).toBeUndefined()
    expect(r.applied).toBeCloseTo(10.2, 6)
    expect(r.project).not.toBe(q)
    const after = generate(typeIn(r.project, id))
    // the notch is deeper; the box and what stands on its edges are as they were
    expect(after.edges.find((e) => e.id === bottom.id)!.a.y).toBeCloseTo(bottom.a.y + 10.2, 6)
    expect(typeIn(r.project, id).hall).toEqual(typeIn(q, id).hall)
    expect(typeIn(r.project, id).elements).toEqual(typeIn(q, id).elements)
    expect(typeIn(r.project, id).courts).toEqual(typeIn(q, id).courts)
    expect(r.shift ?? { x: 0, y: 0 }).toEqual({ x: 0, y: 0 })
  })

  it('an inner wall asked for nothing stays; one asked for too much goes as far as it can, and says so', () => {
    const { p, id } = start()
    const q = shapeWarehouse(p, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    const bottom = generate(typeIn(q, id)).edges.find((e) => !e.outer && e.horizontal)!
    const none = editShape(q, typeRef(id), { op: 'push', wall: bottom.index, by: 0 })
    expect(none.project).toBe(q)
    expect(none.applied).toBe(0)
    const far = editShape(q, typeRef(id), { op: 'push', wall: bottom.index, by: -500 })
    expect(Math.abs(far.applied ?? 0)).toBeLessThan(500)
  })

  it('a box wall stretches the box (the hall step) by the metres asked, and says where what stays still went when it grows at a low wall', () => {
    const { p, id } = start()
    const g = generate(typeIn(p, id))
    const back = g.edges.find((e) => e.id === 'e3')!
    const front = g.edges.find((e) => e.id === 'e1')!
    const high = editShape(p, typeRef(id), { op: 'push', wall: back.index, by: 6 })
    expect(high.applied).toBeCloseTo(6, 6)
    expect(typeIn(high.project, id).hall.width).toBe(102)
    expect(high.shift ?? { x: 0, y: 0 }).toEqual({ x: 0, y: 0 })
    const low = editShape(p, typeRef(id), { op: 'push', wall: front.index, by: 3 })
    expect(low.applied).toBeCloseTo(3, 6)
    expect(typeIn(low.project, id).hall.width).toBe(99)
    expect(low.shift).toEqual({ x: 0, y: 3 })
    // in: a module less
    expect(editShape(p, typeRef(id), { op: 'push', wall: back.index, by: -3 }).applied).toBeCloseTo(-3, 6)
    // any metres, not whole modules
    const odd = editShape(p, typeRef(id), { op: 'push', wall: back.index, by: 1 })
    expect(odd.applied).toBeCloseTo(1, 6)
    expect(typeIn(odd.project, id).hall.width).toBe(97)
    // never under a module
    const tooMuch = editShape(p, typeRef(id), { op: 'push', wall: back.index, by: -500 })
    expect(typeIn(tooMuch.project, id).hall.width).toBe(3)
    // nothing asked: nothing
    expect(editShape(p, typeRef(id), { op: 'push', wall: back.index, by: 0 }).project).toBe(p)
  })

  it('a bump lands where it is asked, its depth in metres', () => {
    const { p, id } = start()
    const read = shapeOf(p, typeRef(id))!
    const g = generate(typeIn(p, id))
    const back = g.edges.find((e) => e.id === 'e3')!
    // modules 20 to 32 of the back's run, off the lines by a few cm
    const from = rel(read, g, 'e3', 32) + 0.1
    const to = rel(read, g, 'e3', 20) - 0.1
    const r = editShape(p, typeRef(id), { op: 'bump', wall: back.index, from, to, by: 9.4 })
    expect(r.reason).toBeUndefined()
    expect(r.applied).toBeCloseTo(9.4, 6)
    const t = typeIn(r.project, id)
    expect(t.hall.width).toBeCloseTo(105.4, 6)
    expect(t.morphology.outline).toHaveLength(8)
    // the sides stand a wall's thickness inside the face's: the reference bump is 0.6 m narrower than the face's, 0.1 m off the lines each way
    const xs = t.morphology.outline.filter((c) => c.y > 96).map((c) => c.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(to - from - 0.6, 6)
    // out of a low wall, the frame moved
    const front = g.edges.find((e) => e.id === 'e1')!
    const f = editShape(p, typeRef(id), { op: 'bump', wall: front.index, from: rel(read, g, 'e1', 20) + 0.1, to: rel(read, g, 'e1', 32) - 0.1, by: 9 })
    expect(f.shift).toEqual({ x: 0, y: 9 })
    // a bump with no depth: nothing; with no length: refused
    expect(editShape(p, typeRef(id), { op: 'bump', wall: back.index, from: 10, to: 10.2, by: 0 }).project).toBe(p)
    expect(editShape(p, typeRef(id), { op: 'bump', wall: back.index, from: 10, to: 10.004, by: 9 }).project).toBe(p)
  })

  it('a corner removed fills the step in or cuts it away', () => {
    const { p, id } = start()
    const bumped = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 20, to: 32, by: 3 }).project
    const n = shapeOf(bumped, typeRef(id))!.contour.vertices.length
    expect(n).toBe(8)
    const before = shapeOf(bumped, typeRef(id))!.contour.vertices
    let cut = 0
    for (let i = 0; i < n; i++) {
      const r = editShape(bumped, typeRef(id), { op: 'remove', vertex: i })
      if (r.project === bumped) continue
      cut++
      expect(typeIn(r.project, id).morphology.outline!.length).toBeLessThan(8)
      // the frame did not move: the corner asked is the one that went
      if (!r.shift) expectCornerGone(before, shapeOf(r.project, typeRef(id))!.contour.vertices, i, `corner ${i}`)
    }
    expect(cut).toBeGreaterThan(0)
    // the step's first corner: it and the step's other corner go, the wall before it drops to the step's line, the rest stays
    const one = editShape(bumped, typeRef(id), { op: 'remove', vertex: 1 })
    expect(one.shift).toBeUndefined()
    const after = shapeOf(one.project, typeRef(id))!.contour.vertices
    expect(after).toHaveLength(6)
    expect(has(after, before[1]) || has(after, before[2])).toBe(false)
    expect(has(after, { x: before[0].x, y: before[2].y })).toBe(true)
    for (const k of [3, 4, 5, 6, 7]) expect(has(after, before[k]), `corner ${k}`).toBe(true)
    // a corner of a plain box cannot go
    const plain = editShape(p, typeRef(id), { op: 'remove', vertex: 0 })
    expect(plain.project).toBe(p)
    expect(plain.reason).toBeTruthy()
  })

  it('a move is refused, with the reason; every other operation is taken', () => {
    const { p, id } = start()
    const moved = editShape(p, typeRef(id), { op: 'move', by: { x: 1, y: 1 } })
    expect(moved.project).toBe(p)
    expect(moved.reason).toBeTruthy()
    for (const op of [
      { op: 'vertex', vertex: 2, to: { x: 150.3, y: 96.3 } },
      { op: 'insert', wall: 0, at: { x: 50, y: -0.3 } },
      { op: 'radius', vertex: 0, r: 1 },
      { op: 'chamfer', vertex: 0, a: 1, b: 1 },
      { op: 'push', wall: 0, by: 3, free: true },
    ] as const) {
      const r = editShape(p, typeRef(id), op)
      expect(r.reason, op.op).toBeUndefined()
      expect(r.project, op.op).not.toBe(p)
    }
  })

  it('a type that is not there: the same project and why', () => {
    const { p } = start()
    expect(shapeOf(p, typeRef('nope'))).toBeNull()
    const r = editShape(p, typeRef('nope'), { op: 'push', wall: 0, by: 3 })
    expect(r.project).toBe(p)
    expect(r.reason).toBeTruthy()
  })
})

describe('the reader of a block’s mass', () => {
  it('its face where the copy stands (moved and turned), each wall with its edge', () => {
    const { p, copy } = notched(90)
    const m = hallOf(p, copy)
    const read = shapeOf(p, massRef(p, copy))!
    // its face where the copy stands: the corners of its footprint (to the millimetre)
    const foot = footprintContour(m.footprint).vertices
    expect(read.contour.vertices).toHaveLength(foot.length)
    read.contour.vertices.forEach((v, i) => {
      expect(v.x).toBeCloseTo(foot[i].x, 2)
      expect(v.y).toBeCloseTo(foot[i].y, 2)
    })
    expect(read.walls).toHaveLength(read.contour.vertices.length)
    expect(read.walls!.every((w) => w.id !== undefined && w.module === 3)).toBe(true)
    expect(read.walls!.filter((w) => w.tone === 'inner')).toHaveLength(3)
    expect(read.walls!.filter((w) => w.tone === 'box')).toHaveLength(5)
    // the block refuses nothing beyond its kind (a mass takes every op but a move)
    expect(read.without).toBeUndefined()
    expect(read.why).toBeUndefined()
    // the range of a box wall: its length's or width's
    const ranges = read.walls!.filter((w) => w.range).map((w) => w.range)
    expect(ranges).toContainEqual({ lo: 176, hi: 224, now: 200 })
    expect(ranges).toContainEqual({ lo: 72, hi: 120, now: 96 })
    // the module lines are the type's own, whichever way the copy is turned
    const type = shapeOf(p, typeRef(typeIn(p, copyIn(p, copy).warehouse!.type).id))!
    for (const w of read.walls!) {
      const same = type.walls!.find((x) => x.id === w.id)
      expect(same, w.id).toBeDefined()
      close(w.stops!, same!.stops!)
      close(w.bays!, same!.bays!)
    }
  })

  it('any other mass has no such reading', () => {
    const { p } = notched()
    const plain = p.masses.find((m) => m.part === undefined)!
    const read = shapeOf(p, { kind: 'mass', id: plain.id })!
    expect(read.walls).toBeUndefined()
    expect(read.without).toBeUndefined()
  })
})

describe('the writer on a block’s mass', () => {
  it('a box wall is stretchWarehouseHall’s by the metres asked (past the range by hand too), an inner one moves alone by them', () => {
    const { p, copy } = notched()
    const read = shapeOf(p, massRef(p, copy))!
    const mass = massRef(p, copy)
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    // which side that wall faces: the one at the highest x
    const right = poly.reduce((best, _a, i) => ((poly[i].x + poly[(i + 1) % poly.length].x > poly[best].x + poly[(best + 1) % poly.length].x) ? i : best), 0)
    expect(read.walls![right].tone).toBe('box')
    const r = editShape(p, mass, { op: 'push', wall: right, by: 100 })
    const was = stretchWarehouseHall(p, copy, { axis: 'length', end: 1 }, 100, true)
    expect(r.project).toEqual(was.project)
    expect(r.applied).toBe(was.applied)
    expect(r.applied).toBe(100)
    // the old rounding, to whole modules, is still the verb's own
    expect(stretchWarehouseHall(p, copy, { axis: 'length', end: 1 }, 100).applied).toBe(99)
    // an inner wall (the notch's bottom: along x)
    const inner = read.walls!.findIndex((w, i) => w.tone === 'inner' && Math.abs(poly[i].y - poly[(i + 1) % poly.length].y) < 1e-6)
    const e = read.walls![inner].id!
    const q = editShape(p, mass, { op: 'push', wall: inner, by: 3 })
    const moved = moveBlockEdge(p, copy, e, 1)
    // a module on the lines: what the module-line verb makes
    expect(copyIn(q.project, copy).warehouse!.overrides!.morphology!.outline).toEqual(copyIn(moved.project, copy).warehouse!.overrides!.morphology!.outline)
    expect(q.applied).toBeCloseTo(3, 6)
    // any metres
    const odd = editShape(p, mass, { op: 'push', wall: inner, by: 0.2 })
    expect(odd.reason).toBeUndefined()
    expect(odd.applied).toBeCloseTo(0.2, 6)
    // nothing asked: nothing
    expect(editShape(p, mass, { op: 'push', wall: inner, by: 0 }).project).toBe(p)
  })

  it('a bump makes it a variant: its own outline, holes, zones, elements and courts; its type untouched; Back to type clears it', () => {
    const { p, copy } = start2()
    const mass = massRef(p, copy)
    const read = shapeOf(p, mass)!
    const wall = read.walls!.findIndex((w) => w.id === 'e3')
    expect(wall).toBeGreaterThanOrEqual(0)
    // the back's own lines (it runs back towards the start of the box): its modules 20 to 32
    const n = generate(typeIn(p, copyIn(p, copy).warehouse!.type)).runs.x.modules.length - 1
    const stops = read.walls![wall].stops!
    const r = editShape(p, mass, { op: 'bump', wall, from: stops[n - 32] + 0.1, to: stops[n - 20] - 0.1, by: -9 })
    expect(r.reason).toBeUndefined()
    expect(r.applied).toBeCloseTo(-9, 6)
    const o = copyIn(r.project, copy).warehouse!.overrides!
    expect(o.morphology!.outline).toHaveLength(8)
    expect(o.morphology!.holes).toBeDefined()
    expect(o.elements).toBeDefined()
    expect(o.courts).toBeDefined()
    expect(r.project.warehouseTypes).toBe(p.warehouseTypes)
    expect(hallOf(r.project, copy).id).toBe(hallOf(p, copy).id)
    expect(footprintPolygon(hallOf(r.project, copy).footprint)).toHaveLength(8)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    const back = copyBackToType(r.project, copy)
    expect(copyIn(back, copy).warehouse!.overrides).toBeUndefined()
    // the type’s box where it stood: the same four corners and the same place (a high wall moved nothing of it)
    const was = footprintPolygon(hallOf(p, copy).footprint)
    const now = footprintPolygon(hallOf(back, copy).footprint)
    expect(now).toHaveLength(4)
    for (const v of was) expect(has(now, v)).toBe(true)
    expect(copyIn(back, copy).warehouse!.place).toEqual(copyIn(p, copy).warehouse!.place)
  })

  it('a corner removed on a copy makes it a variant too', () => {
    const { p, copy } = notched()
    const mass = massRef(p, copy)
    const n = shapeOf(p, mass)!.contour.vertices.length
    const before = footprintPolygon(hallOf(p, copy).footprint)
    const place = copyIn(p, copy).warehouse!.place
    let seen = 0
    for (let i = 0; i < n; i++) {
      const r = editShape(p, mass, { op: 'remove', vertex: i })
      if (r.project === p) continue
      seen++
      const after = footprintPolygon(hallOf(r.project, copy).footprint)
      expect(after.length).toBeLessThan(n)
      // the copy did not move on the site (its place stayed): the corner asked is the one that went
      if (JSON.stringify(copyIn(r.project, copy).warehouse!.place) === JSON.stringify(place)) expectCornerGone(before, after, i, `corner ${i}`)
      expect(copyIn(r.project, copy).warehouse!.overrides!.morphology!.outline!.length).toBeLessThan(n)
      expect(r.project.warehouseTypes).toBe(p.warehouseTypes)
    }
    expect(seen).toBeGreaterThan(0)
    // the notch's inner corner: the notch fills in, the box's four corners stay where they stand on the site
    const one = editShape(p, mass, { op: 'remove', vertex: 4 })
    expect(one.reason).toBeUndefined()
    const after = footprintPolygon(hallOf(one.project, copy).footprint)
    expect(after).toHaveLength(4)
    for (const k of [0, 1, 2, 7]) expect(has(after, before[k]), `corner ${k}`).toBe(true)
    for (const k of [3, 4, 5, 6]) expect(has(after, before[k]), `corner ${k}`).toBe(false)
    expect(copyIn(one.project, copy).warehouse!.place).toEqual(place)
  })

  it('a bump made and then taken out by removing its corners: the copy is plain again, and its type’s later edit reaches it', () => {
    const { p, id, copy } = start2()
    const mass = massRef(p, copy)
    const read = shapeOf(p, mass)!
    const wall = read.walls!.findIndex((w) => w.id === 'e3')
    const n = generate(typeIn(p, id)).runs.x.modules.length - 1
    const stops = read.walls![wall].stops!
    let q = editShape(p, mass, { op: 'bump', wall, from: stops[n - 32] + 0.1, to: stops[n - 20] - 0.1, by: -9 }).project
    expect(copyIn(q, copy).warehouse!.overrides).toBeDefined()
    // take the bump's corners out, one at a time, until the outline is the box again
    q = fillIn(q, copy)
    expect(footprintPolygon(hallOf(q, copy).footprint)).toHaveLength(4)
    // no variant: nothing of its own, whatever the bump left behind
    expect(copyIn(q, copy).warehouse!.overrides).toBeUndefined()
    // so its type's later edit reaches it
    const typed = shapeWarehouse(q, id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -3 }).project
    expect(footprintPolygon(hallOf(typed, copy).footprint)).toHaveLength(8)
    expect(copyIn(typed, copy).warehouse!.overrides).toBeUndefined()
  })

  it('a copy’s own courts stay when it is plain again in its outline', () => {
    const { p, id, copy } = start2()
    const mass = massRef(p, copy)
    const g = generate(typeIn(p, id))
    const edge = g.edges.find((e) => e.outer)!.id
    const withCourt = setCopyEdgeCourt(p, copy, edge, { depth: 21 })
    expect(copyIn(withCourt, copy).warehouse!.overrides?.courts).toBeDefined()
    const read = shapeOf(withCourt, mass)!
    const wall = read.walls!.findIndex((w) => w.id === 'e3')
    const n = g.runs.x.modules.length - 1
    const stops = read.walls![wall].stops!
    let q = editShape(withCourt, mass, { op: 'bump', wall, from: stops[n - 32] + 0.1, to: stops[n - 20] - 0.1, by: -9 }).project
    q = fillIn(q, copy)
    expect(footprintPolygon(hallOf(q, copy).footprint)).toHaveLength(4)
    const o = copyIn(q, copy).warehouse!.overrides
    expect(o?.morphology).toBeUndefined()
    expect(o?.elements).toBeUndefined()
    expect(o?.courts).toEqual(copyIn(withCourt, copy).warehouse!.overrides!.courts)
  })

  it('its box grown at a low wall moves its place: nothing else of it moves on the site', () => {
    for (const angle of [0, 90, 37]) {
      const { p, copy } = start2(angle)
      const mass = massRef(p, copy)
      const read = shapeOf(p, mass)!
      const before = footprintPolygon(hallOf(p, copy).footprint)
      const wall = read.walls!.findIndex((w) => w.id === 'e1')
      // the front's modules 20 to 32, three modules out: the box a strip wider at its low wall
      const stops = read.walls![wall].stops!
      const r = editShape(p, mass, { op: 'bump', wall, from: stops[20] + 0.1, to: stops[32] - 0.1, by: 9 })
      expect(r.reason, `angle ${angle}`).toBeUndefined()
      expect(r.applied).toBeCloseTo(9, 6)
      const after = footprintPolygon(hallOf(r.project, copy).footprint)
      // the back wall's corners (the box's high side) are where they were
      const w = copyIn(p, copy).warehouse!.place
      expect(copyIn(r.project, copy).warehouse!.place.angle).toBe(w.angle)
      const back = read.walls!.findIndex((x) => x.id === 'e3')
      for (const q of [before[back], before[(back + 1) % before.length]]) {
        expect(after.some((v) => Math.hypot(v.x - q.x, v.y - q.y) < 1e-6), `angle ${angle}`).toBe(true)
      }
      // and the place went back by what the box grew
      expect(Math.hypot(copyIn(r.project, copy).warehouse!.place.x - w.x, copyIn(r.project, copy).warehouse!.place.y - w.y)).toBeCloseTo(9, 6)
    }
  })

  it('shapeCopy: one call, one project; the copy’s own outline; the same project when nothing changes', () => {
    const { p, copy } = start2()
    const r = shapeCopy(p, copy, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -3 })
    expect(r.project).not.toBe(p)
    expect(r.shift).toEqual({ x: 0, y: 0 })
    expect(copyIn(r.project, copy).warehouse!.overrides!.morphology!.outline).toHaveLength(8)
    expect(r.project.warehouseTypes).toBe(p.warehouseTypes)
    expect(shapeCopy(p, copy, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: 0 }).project).toBe(p)
    expect(shapeCopy(p, copy, { kind: 'pull', edge: 'nope', from: 20, to: 32, by: 1 }).project).toBe(p)
    expect(shapeCopy(p, 'nobody', { kind: 'corner', edge: 'e1' }).project).toBe(p)
  })

  it('a block’s mass refuses a move, with the reason; the rest it takes', () => {
    const { p, copy } = notched()
    const mass = massRef(p, copy)
    const moved = editShape(p, mass, { op: 'move', by: { x: 1, y: 1 } })
    expect(moved.project).toBe(p)
    expect(moved.reason).toBeTruthy()
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    for (const op of [
      { op: 'vertex', vertex: 0, to: { x: poly[0].x + 1.3, y: poly[0].y + 0.7 } },
      { op: 'radius', vertex: 0, r: 1 },
      { op: 'chamfer', vertex: 0, a: 1, b: 1 },
      { op: 'push', wall: 0, by: 6, free: true },
    ] as const) {
      const r = editShape(p, mass, op)
      expect(r.reason, op.op).toBeUndefined()
      expect(r.project, op.op).not.toBe(p)
      expect(copyIn(r.project, copy).warehouse!.overrides, op.op).toBeDefined()
    }
  })
})

/** A copy's bump taken out by removing its corners, the one that fills the step in each time (the box stays) until the outline is four corners again. */
function fillIn(p: Project, copy: string): Project {
  const mass = massRef(p, copy)
  const area = (q: Project) => footprintPolygon(hallOf(q, copy).footprint).reduce((a, v, i, vs) => a + (v.x * vs[(i + 1) % vs.length].y - vs[(i + 1) % vs.length].x * v.y) / 2, 0)
  let q = p
  for (let guard = 0; guard < 8 && footprintPolygon(hallOf(q, copy).footprint).length > 4; guard++) {
    const m = shapeOf(q, mass)!.contour.vertices.length
    const tries = [...Array(m).keys()].map((i) => editShape(q, mass, { op: 'remove', vertex: i }).project).filter((x) => x !== q && !copyIn(x, copy).warehouse!.overrides?.hall)
    if (tries.length === 0) break
    q = tries.reduce((best, x) => (area(x) > area(best) ? x : best))
  }
  return q
}

/** A type with no notch and a copy of it turned `angle`. */
function start2(angle = 0) {
  const s = start()
  const placed = placeWarehouse(s.p, s.id, { x: 200, y: 150 }, angle, s.option)!
  return { ...s, p: placed.project, copy: placed.id }
}
