// A block's outline free on the shape engine (Phase D.2, task 5; Decisions "Outline in metres", "Block shape"): every op runs on the
// wall's outer face and is inset back to the reference line, its edges named by lineage, its box refitted, its docks, doors, patterns and
// truck courts following their edges; only walls along the grid take them. On a type (the block editor) and on a copy (the site).
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type HallElement, type Project, type WarehouseType } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { editShape, shapeOf } from '../../../state/actions/shape.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { createAppStore } from '../../../state/store.ts'
import {
  addWarehouseType,
  copyBackToType,
  edgeRefusal,
  lockWarehouseStep,
  placeWarehouse,
  putCopyElements,
  putElements,
  setCopyEdgeCourt,
  setEdgeCourt,
  shapeWarehouse,
} from '../actions.ts'
import { generate, typeWith } from '../engine/generate.ts'
import { ANGLED_COURT, ANGLED_ELEMENTS } from '../engine/shape.ts'

function start() {
  const base = demoProject()
  const made = addWarehouseType(base)
  let p = made.project
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
  return { p, id: made.id, option: base.options[0].id }
}
const typeRef = (id: string) => ({ kind: 'block-type', id })
const typeIn = (p: Project, id: string): WarehouseType => p.warehouseTypes!.find((t) => t.id === id)!
const copyIn = (p: Project, id: string) => p.buildings.find((b) => b.id === id)!
const hallOf = (p: Project, buildingId: string) => {
  const levels = new Set(copyIn(p, buildingId).levels.map((l) => l.id))
  return p.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
}
const massRef = (p: Project, buildingId: string) => ({ kind: 'mass', id: hallOf(p, buildingId).id })
const wallOf = (p: Project, id: string, edge: string) => shapeOf(p, typeRef(id))!.walls!.findIndex((w) => w.id === edge)
const edgeOf = (t: WarehouseType, edge: string) => generate(t).edges.find((e) => e.id === edge)!
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
const corner = (t: WarehouseType, i: number) => t.morphology.outline[i]
/** The type with a dock-free front: its docks on e1 (default) are the elements the tests follow. */
const docksOn = (t: WarehouseType, edge: string) => t.elements.filter((x) => x.kind === 'dock' && x.edge === edge)
/** A type with a notch 4 modules deep in its back (its modules 20 to 32), as a bump of whole modules makes one. */
function notched() {
  const s = start()
  return { ...s, p: shapeWarehouse(s.p, s.id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project }
}
function start2(angle = 0) {
  const s = start()
  const placed = placeWarehouse(s.p, s.id, { x: 200, y: 150 }, angle, s.option)!
  return { ...s, p: placed.project, copy: placed.id }
}

describe('on a type: a free outline', () => {
  it('a corner dragged off the module lines makes an angled wall, the box refitted', () => {
    const { p, id } = start()
    // the front-right corner of the face, 6 m up its wall: the front now rises across the whole length
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 1, to: { x: 200.3, y: 5.7 } })
    expect(r.reason).toBeUndefined()
    const t = typeIn(r.project, id)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    const g = generate(t)
    // the front is angled now: no axis, no modules, and its docks are left out
    expect(edgeOf(t, 'e1').axis).toBeNull()
    expect(edgeOf(t, 'e2').axis).toBe('y')
    expect(docksOn(t, 'e1')).toHaveLength(0)
    expect(docksOn(typeIn(p, id), 'e1').length).toBeGreaterThan(0)
    expect(r.notes?.join(' ')).toMatch(new RegExp(`${docksOn(typeIn(p, id), 'e1').length} docks left out: docks, doors and patterns go on walls along the grid`))
    // the box is the outline's bounding box, its column line A / 1 at its low corner
    const xs = t.morphology.outline.map((c) => c.x)
    const ys = t.morphology.outline.map((c) => c.y)
    near(Math.min(...xs), 0)
    near(Math.min(...ys), 0)
    near(t.hall.length, Math.max(...xs), 1e-3)
    near(t.hall.width, Math.max(...ys), 1e-3)
    // the box's low wall moved up: what stays still went the other way (the frame's shift)
    expect(r.shift!.y).toBeLessThan(0)
    expect(g.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
  })

  it('a corner inserted on a wall, then dragged', () => {
    const { p, id } = start()
    const wall = wallOf(p, id, 'e3')
    const ins = editShape(p, typeRef(id), { op: 'insert', wall, at: { x: 100, y: 96.3 } })
    expect(ins.reason).toBeUndefined()
    const t1 = typeIn(ins.project, id)
    // a corner on the back, nothing else moved: five corners, the back in two pieces, the first keeping its id
    expect(t1.morphology.outline).toHaveLength(5)
    expect(t1.morphology.outline.map((c) => c.id).slice(0, 3)).toEqual(['e1', 'e2', 'e3'])
    expect(new Set(t1.morphology.outline.map((c) => c.id)).size).toBe(5)
    expect(t1.hall).toEqual(typeIn(p, id).hall)
    // now the corner dragged 10 m out and 7.7 along: two angled walls
    const read = shapeOf(ins.project, typeRef(id))!
    expect(read.contour.vertices).toHaveLength(5)
    const drag = editShape(ins.project, typeRef(id), { op: 'vertex', vertex: 3, to: { x: 92.3, y: 106.3 } })
    expect(drag.reason).toBeUndefined()
    const t2 = typeIn(drag.project, id)
    expect(t2.hall.width).toBeGreaterThan(100)
    const angled = generate(t2).edges.filter((e) => e.axis === null)
    expect(angled).toHaveLength(2)
  })

  it('a chamfer and a radius on a corner: the face is cut, the reference line stays sharp', () => {
    const { p, id } = start()
    const ch = editShape(p, typeRef(id), { op: 'chamfer', vertex: 2, a: 6, b: 6 })
    expect(ch.reason).toBeUndefined()
    const t = typeIn(ch.project, id)
    expect(corner(t, 2).chamfer).toEqual([6, 6])
    near(corner(t, 2).x, 200)
    near(corner(t, 2).y, 96)
    const g = generate(t)
    // the face is cut: a chamfer's wall and less floor than the box
    expect(g.walls.some((w) => w.corner)).toBe(true)
    expect(g.parts[0].polygon.length).toBeGreaterThan(4)
    const round = editShape(ch.project, typeRef(id), { op: 'radius', vertex: 3, r: 5 })
    expect(round.reason).toBeUndefined()
    expect(corner(typeIn(round.project, id), 3).r).toBe(5)
    near(corner(typeIn(round.project, id), 3).x, 0)
    // the reader hands the face back with its chamfer and its radius
    const read = shapeOf(round.project, typeRef(id))!
    expect(read.contour.vertices.some((v) => v.chamfer)).toBe(true)
    expect(read.contour.vertices.some((v) => v.r > 0)).toBe(true)
  })

  it('a free push (Ctrl) of an inner wall by 1.7 m, exactly', () => {
    const { p, id } = notched()
    const g = generate(typeIn(p, id))
    const bottom = g.edges.find((e) => !e.outer && e.horizontal)!
    const r = editShape(p, typeRef(id), { op: 'push', wall: bottom.index, by: 1.7, free: true })
    expect(r.reason).toBeUndefined()
    near(r.applied!, 1.7)
    near(edgeOf(typeIn(r.project, id), bottom.id).a.y, bottom.a.y + 1.7)
    // the box and what stands on the other edges are as they were
    expect(typeIn(r.project, id).hall).toEqual(typeIn(p, id).hall)
    expect(typeIn(r.project, id).elements).toEqual(typeIn(p, id).elements)
    // the square push is as exact
    const sq = editShape(p, typeRef(id), { op: 'push', wall: bottom.index, by: 1.7 })
    near(sq.applied!, 1.7)
  })

  it('a bump from 3.5 to 10.2 m along a wall, 4.3 m deep: the ids by lineage, the walls of the pieces', () => {
    const { p, id } = start()
    // the back's own wall: 0.6 m thick
    const q = shapeWarehouse(p, id, { kind: 'wall', edge: 'e3', thickness: 0.6 }).project
    const wall = wallOf(q, id, 'e3')
    const r = editShape(q, typeRef(id), { op: 'bump', wall, from: 3.5, to: 10.2, by: 4.3 })
    expect(r.reason).toBeUndefined()
    near(r.applied!, 4.3)
    const t = typeIn(r.project, id)
    expect(t.morphology.outline).toHaveLength(8)
    near(t.hall.width, 96 + 4.3, 1e-3)
    const o = t.morphology.outline
    // the first piece keeps its id and its wall; the others are new; the bump's face has the back's wall, its two sides the envelope's
    expect(o[2].id).toBe('e3')
    expect(o[2].thickness).toBe(0.6)
    expect(new Set(o.map((c) => c.id)).size).toBe(8)
    expect(o[3].thickness).toBeUndefined()
    expect(o[4].thickness).toBe(0.6)
    expect(o[5].thickness).toBeUndefined()
    expect(o[6].thickness).toBe(0.6)
    // the bump's face is 4.3 m beyond the back's own (0.6 m thick), its own wall as thick: the reference line 4.3 out
    near(o[4].y, 96 + 4.3, 1e-6)
    // (its two sides stand a wall's thickness inside the face: the face's bump is 6.7 m wide, the reference line's 6.1)
    near(o[3].x - o[5].x, 10.2 - 3.5 - 2 * 0.3, 1e-6)
  })

  it('the box refitted when it grows at a low wall: its shift, and the type’s dimensions with it', () => {
    const { p, id } = start()
    const withDim = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => ({ ...t, dimensions: [{ id: 'd1', levelId: t.id, a: { x: 0, y: 0 }, b: { x: 30, y: 0 }, offset: 3 }] })) }
    const wall = wallOf(withDim, id, 'e1')
    const r = editShape(withDim, typeRef(id), { op: 'bump', wall, from: 60.3, to: 90.3, by: 4.3 })
    expect(r.reason).toBeUndefined()
    const t = typeIn(r.project, id)
    near(t.hall.width, 96 + 4.3, 1e-3)
    // the column line A / 1 went 4.3 m: what stays still went the other way
    near(r.shift!.x, 0)
    near(r.shift!.y, 4.3, 1e-6)
    near(t.dimensions![0].a.y, 4.3, 1e-6)
    near(t.dimensions![0].b.y, 4.3, 1e-6)
    // the bump is on the new box's low wall
    expect(Math.min(...t.morphology.outline.map((c) => c.y))).toBe(0)
  })

  it('each of them is one undo step', () => {
    const { p, id } = notched()
    const g = generate(typeIn(p, id))
    const bottom = g.edges.find((e) => !e.outer && e.horizontal)!
    const ops = [
      { op: 'vertex', vertex: 1, to: { x: 200.3, y: 5.7 } },
      { op: 'insert', wall: 2, at: { x: 100, y: 96.3 } },
      { op: 'chamfer', vertex: 0, a: 4, b: 4 },
      { op: 'radius', vertex: 3, r: 3 },
      { op: 'push', wall: bottom.index, by: 1.7, free: true },
      { op: 'bump', wall: 0, from: 20.3, to: 50.3, by: 4.3 },
    ] as const
    for (const op of ops) {
      const store = createAppStore(p)
      store.getState().apply((q) => editShape(q, typeRef(id), op).project)
      expect(store.getState().history.past, op.op).toHaveLength(1)
      expect(store.getState().project, op.op).not.toBe(p)
      store.getState().undo()
      expect(typeIn(store.getState().project, id), op.op).toEqual(typeIn(p, id))
    }
  })

  it('an outline that crosses itself is refused: the same project and why', () => {
    const { p, id } = start()
    const r = editShape(p, typeRef(id), { op: 'vertex', vertex: 2, to: { x: -50, y: -50 } })
    expect(r.project).toBe(p)
    expect(r.reason).toBeTruthy()
    // a bump so deep that its far wall crosses the front
    const far = editShape(p, typeRef(id), { op: 'bump', wall: 2, from: 20, to: 40, by: -120 })
    expect(far.project).toBe(p)
    expect(far.reason).toBeTruthy()
  })
})

describe('the elements follow their edges', () => {
  it('a dock on a split wall stays on the piece it stands on', () => {
    const { p, id } = start()
    const docks = docksOn(typeIn(p, id), 'e1')
    expect(docks.length).toBeGreaterThan(4)
    // a corner on the front at 100 m: the front in two pieces; the first keeps e1
    const r = editShape(p, typeRef(id), { op: 'insert', wall: 0, at: { x: 100, y: -0.3 } })
    const t = typeIn(r.project, id)
    expect(t.morphology.outline).toHaveLength(5)
    const second = t.morphology.outline[1].id
    expect(second).not.toBe('e1')
    const g = generate(t)
    const first = g.edges.find((e) => e.id === 'e1')!
    const rest = g.edges.find((e) => e.id === second)!
    for (const x of t.elements) {
      const e = x.edge === 'e1' ? first : rest
      expect(x.edge === 'e1' || x.edge === second).toBe(true)
      const at = (g.runs.x.modules[x.module] + g.runs.x.modules[x.module + 1]) / 2
      expect(at).toBeGreaterThanOrEqual(Math.min(e.a.x, e.b.x) - 1e-6)
      expect(at).toBeLessThanOrEqual(Math.max(e.a.x, e.b.x) + 1e-6)
    }
    // none lost, some on each piece
    expect(t.elements).toHaveLength(typeIn(p, id).elements.length)
    expect(t.elements.some((x) => x.edge === 'e1')).toBe(true)
    expect(t.elements.some((x) => x.edge === second)).toBe(true)
  })

  it('a wall turned angled loses its docks and its court, and the note says how many', () => {
    const { p, id } = start()
    const withCourt = setEdgeCourt(p, id, 'e1', { depth: 30 })
    expect(typeIn(withCourt, id).courts).toEqual([{ edge: 'e1', depth: 30 }])
    const n = docksOn(typeIn(p, id), 'e1').length
    const r = editShape(withCourt, typeRef(id), { op: 'vertex', vertex: 1, to: { x: 200.3, y: 8.7 } })
    const t = typeIn(r.project, id)
    expect(docksOn(t, 'e1')).toHaveLength(0)
    expect(t.courts ?? []).toHaveLength(0)
    const note = (r.notes ?? []).join(' | ')
    expect(note).toContain(`${n} docks left out: docks, doors and patterns go on walls along the grid`)
    expect(note).toContain('1 truck court left out: a truck court goes on a wall along the grid')
  })

  it('docks, doors and patterns on an angled wall are refused with the reason; so is a court', () => {
    const { p, id } = start()
    const q = editShape(p, typeRef(id), { op: 'vertex', vertex: 2, to: { x: 150.3, y: 96.3 } }).project
    const angled = generate(typeIn(q, id)).edges.find((e) => e.axis === null)!
    for (const kind of ['dock', 'door', 'pattern'] as const) {
      const r = putElements(q, id, kind, angled.id, [0, 1, 2], true)
      expect(r, kind).toBe(q)
    }
    expect(edgeRefusal(q, { type: id }, angled.id, 'element')).toBe(ANGLED_ELEMENTS)
    expect(ANGLED_ELEMENTS).toBe('Docks, doors and patterns go on walls along the grid')
    expect(setEdgeCourt(q, id, angled.id, {})).toBe(q)
    expect(edgeRefusal(q, { type: id }, angled.id, 'court')).toBe(ANGLED_COURT)
    expect(ANGLED_COURT).toBe('A truck court goes on a wall along the grid')
    // a wall along the grid is fine
    expect(edgeRefusal(q, { type: id }, 'e4', 'element')).toBeUndefined()
    expect(edgeRefusal(q, { type: id }, 'e4', 'court')).toBeUndefined()
    expect(putElements(q, id, 'door', 'e4', [3], true)).not.toBe(q)
  })

  it('on a copy: the same refusals, with its own elements', () => {
    const { p, id, copy } = start2()
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    const q = editShape(p, massRef(p, copy), { op: 'vertex', vertex: 2, to: { x: poly[2].x - 50, y: poly[2].y } }).project
    expect(q).not.toBe(p)
    const made = typeWith(typeIn(q, id), copyIn(q, copy).warehouse!.overrides)
    const angled = generate(made).edges.find((e) => e.axis === null)!
    expect(putCopyElements(q, copy, 'dock', angled.id, [1], true)).toBe(q)
    expect(setCopyEdgeCourt(q, copy, angled.id, {})).toBe(q)
    expect(edgeRefusal(q, { copy }, angled.id, 'element')).toBe(ANGLED_ELEMENTS)
    expect(edgeRefusal(q, { copy }, angled.id, 'court')).toBe(ANGLED_COURT)
  })
})

describe('a box wall and an inner wall', () => {
  it('a box wall pushed 2.4 m stretches the box, a bump near the far wall moves with it', () => {
    const { p, id } = notched()
    const g = generate(typeIn(p, id))
    const front = g.edges.find((e) => e.id === 'e1')!
    const r = editShape(p, typeRef(id), { op: 'push', wall: front.index, by: 2.4 })
    expect(r.reason).toBeUndefined()
    near(r.applied!, 2.4)
    const t = typeIn(r.project, id)
    near(t.hall.width, 96 + 2.4, 1e-6)
    // the notch is in the back: its corners stay as far from the back wall as they were, in modules (the box's own end bays take the rest)
    const before = generate(typeIn(p, id)).outline
    const after = generate(t).outline
    expect(after).toHaveLength(before.length)
    const notchY = Math.min(...before.filter((c) => c.y < 96 && c.y > 80).map((c) => c.y))
    const notchAfter = Math.min(...after.filter((c) => c.y < 98.3 && c.y > 80).map((c) => c.y))
    expect(98.4 - notchAfter).toBeGreaterThan(11)
    expect(98.4 - notchAfter).toBeLessThan(14)
    expect(notchAfter).not.toBeCloseTo(notchY, 1)
    // grown at the low wall: where the column line A / 1 stood
    near(r.shift!.y, 2.4, 1e-6)
  })

  it('an inner wall moves alone', () => {
    const { p, id } = notched()
    const g = generate(typeIn(p, id))
    const bottom = g.edges.find((e) => !e.outer && e.horizontal)!
    const r = editShape(p, typeRef(id), { op: 'push', wall: bottom.index, by: -2.4 })
    near(r.applied!, -2.4)
    expect(typeIn(r.project, id).hall).toEqual(typeIn(p, id).hall)
  })
})

describe('a corner removed', () => {
  it('a square step’s corner fills the step; an angled corner goes as on any contour', () => {
    const { p, id } = start()
    const bumped = shapeWarehouse(p, id, { kind: 'pull', edge: 'e1', from: 20, to: 32, by: 3 }).project
    const n = typeIn(bumped, id).morphology.outline.length
    expect(n).toBe(8)
    const one = editShape(bumped, typeRef(id), { op: 'remove', vertex: 1 })
    expect(one.reason).toBeUndefined()
    expect(typeIn(one.project, id).morphology.outline.length).toBeLessThan(n)
    // a plain box's corner cannot go
    const plain = editShape(p, typeRef(id), { op: 'remove', vertex: 0 })
    expect(plain.project).toBe(p)
    expect(plain.reason).toBeTruthy()
    // an angled corner: the triangle's corner joins its two walls
    const angled = editShape(p, typeRef(id), { op: 'vertex', vertex: 2, to: { x: 150.3, y: 96.3 } }).project
    const m = typeIn(angled, id).morphology.outline.length
    const gone = editShape(angled, typeRef(id), { op: 'remove', vertex: 1 })
    expect(gone.reason).toBeUndefined()
    expect(typeIn(gone.project, id).morphology.outline.length).toBe(m - 1)
  })
})

describe('on a copy (the site)', () => {
  it('a corner dragged makes it a variant: its own outline, its type unchanged, Back to type clears it', () => {
    const { p, copy } = start2()
    const mass = massRef(p, copy)
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    const read = shapeOf(p, mass)!
    expect(read.contour.vertices).toHaveLength(4)
    expect(read.without).toBeUndefined()
    // the back-right corner of the face moved 8 m along the back: an angled right wall
    const to = { x: poly[2].x - 8, y: poly[2].y }
    const r = editShape(p, mass, { op: 'vertex', vertex: 2, to })
    expect(r.reason).toBeUndefined()
    const o = copyIn(r.project, copy).warehouse!.overrides!
    expect(o.morphology!.outline).toHaveLength(4)
    expect(r.project.warehouseTypes).toBe(p.warehouseTypes)
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
    expect(hallOf(r.project, copy).id).toBe(hallOf(p, copy).id)
    const back = copyBackToType(r.project, copy)
    expect(copyIn(back, copy).warehouse!.overrides).toBeUndefined()
    expect(footprintPolygon(hallOf(back, copy).footprint)).toHaveLength(4)
  })

  it('its box grown at a low wall moves its place: nothing else of it moves on the site', () => {
    for (const angle of [0, 90, 37]) {
      const { p, copy } = start2(angle)
      const mass = massRef(p, copy)
      const before = footprintPolygon(hallOf(p, copy).footprint)
      const read = shapeOf(p, mass)!
      const front = read.walls!.findIndex((w) => w.id === 'e1')
      const w = copyIn(p, copy).warehouse!.place
      const r = editShape(p, mass, { op: 'bump', wall: front, from: 50.3, to: 80.3, by: 4.3 })
      expect(r.reason, `angle ${angle}`).toBeUndefined()
      near(r.applied!, 4.3)
      const after = footprintPolygon(hallOf(r.project, copy).footprint)
      // the back wall's corners (the box's high side) are where they were
      const back = read.walls!.findIndex((x) => x.id === 'e3')
      for (const q of [before[back], before[(back + 1) % before.length]]) {
        expect(after.some((v) => Math.hypot(v.x - q.x, v.y - q.y) < 1e-6), `angle ${angle}`).toBe(true)
      }
      near(Math.hypot(copyIn(r.project, copy).warehouse!.place.x - w.x, copyIn(r.project, copy).warehouse!.place.y - w.y), 4.3, 1e-6)
      expect(copyIn(r.project, copy).warehouse!.place.angle).toBe(w.angle)
    }
  })

  it('a free push and a chamfer on a copy: no refusal; the reader says nothing is refused but a move', () => {
    const { p, copy } = start2()
    const mass = massRef(p, copy)
    const c = editShape(p, mass, { op: 'chamfer', vertex: 1, a: 5, b: 5 })
    expect(c.reason).toBeUndefined()
    expect(copyIn(c.project, copy).warehouse!.overrides!.morphology!.outline![1]!.chamfer).toEqual([5, 5])
    const f = editShape(p, mass, { op: 'push', wall: 1, by: 2.5, free: true })
    expect(f.reason).toBeUndefined()
    expect(editShape(p, mass, { op: 'move', by: { x: 1, y: 1 } }).reason).toBeTruthy()
  })

  it('an inner wall of a copy moves alone by any metres; a box wall stretches its box by any metres', () => {
    const base = start()
    const q = shapeWarehouse(base.p, base.id, { kind: 'pull', edge: 'e3', from: 20, to: 32, by: -4 }).project
    const placed = placeWarehouse(q, base.id, { x: 200, y: 150 }, 0, base.option)!
    const { p, id: copy } = { p: placed.project, id: placed.id }
    const mass = massRef(p, copy)
    const read = shapeOf(p, mass)!
    const inner = read.walls!.findIndex((w) => w.tone === 'inner' && w.module !== undefined)
    const r = editShape(p, mass, { op: 'push', wall: inner, by: 1.7 })
    expect(r.reason).toBeUndefined()
    near(r.applied!, 1.7)
    const box = read.walls!.findIndex((w) => w.id === 'e2')
    const s = editShape(p, mass, { op: 'push', wall: box, by: 2.4 })
    near(s.applied!, 2.4)
    near(copyIn(s.project, copy).warehouse!.overrides!.hall!.length!, 202.4, 1e-6)
  })
})

describe('the holes of a block', () => {
  const withHole = () => {
    const s = start()
    const p = shapeWarehouse(s.p, s.id, { kind: 'hole', x: [10, 20], y: [8, 16] }).project
    // a corridor round it (a migrated mass's)
    const t = typeIn(p, s.id)
    const q = { ...p, warehouseTypes: p.warehouseTypes!.map((x) => (x.id === t.id ? { ...x, morphology: { ...x.morphology, holes: x.morphology.holes.map((h) => ({ ...h, corridor: 4 })) } } : x)) }
    return { ...s, p: q, hole: t.morphology.holes[0].id }
  }

  it('in the block editor: moved, a corner dragged, a corner added; its corridor kept; one outside refused', () => {
    const { p, id, hole } = withHole()
    const ref = { kind: 'hole', id: `${id}/${hole}` }
    const read = shapeOf(p, ref)!
    expect(read.contour.vertices).toHaveLength(4)
    const h0 = typeIn(p, id).morphology.holes[0]
    const moved = editShape(p, ref, { op: 'move', by: { x: 3.5, y: 1.25 } })
    expect(moved.reason).toBeUndefined()
    const h1 = typeIn(moved.project, id).morphology.holes[0]
    near(h1.vertices[0].x, h0.vertices[0].x + 3.5)
    near(h1.vertices[0].y, h0.vertices[0].y + 1.25)
    expect(h1.corridor).toBe(4)
    expect(h1.id).toBe(h0.id)
    const dragged = editShape(p, ref, { op: 'vertex', vertex: 2, to: { x: h0.vertices[2].x + 2.2, y: h0.vertices[2].y + 1.1 } })
    expect(dragged.reason).toBeUndefined()
    near(typeIn(dragged.project, id).morphology.holes[0].vertices[2].x, h0.vertices[2].x + 2.2)
    const added = editShape(p, ref, { op: 'insert', wall: 0, at: { x: (h0.vertices[0].x + h0.vertices[1].x) / 2, y: h0.vertices[0].y } })
    expect(typeIn(added.project, id).morphology.holes[0].vertices).toHaveLength(5)
    // outside the block: refused, the same project
    const out = editShape(p, ref, { op: 'move', by: { x: 500, y: 0 } })
    expect(out.project).toBe(p)
    expect(out.reason).toMatch(/inside/i)
    // a hole takes no bump, radius or chamfer
    for (const op of [{ op: 'radius', vertex: 0, r: 1 }, { op: 'chamfer', vertex: 0, a: 1, b: 1 }] as const) expect(editShape(p, ref, op).project).toBe(p)
  })

  it('on the site: the copy’s own hole k, as <hall>/<k>: the copy becomes a variant, its type untouched', () => {
    const { p, id, option } = withHole()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 37, option)!
    const hall = hallOf(placed.project, placed.id)
    expect(hall.holes).toHaveLength(1)
    const ref = { kind: 'mass-hole', id: `${hall.id}/0` }
    const read = shapeOf(placed.project, ref)!
    expect(read.contour.vertices).toHaveLength(4)
    const r = editShape(placed.project, ref, { op: 'move', by: { x: 2, y: 3 } })
    expect(r.reason).toBeUndefined()
    const o = copyIn(r.project, placed.id).warehouse!.overrides!
    expect(o.morphology!.holes).toHaveLength(1)
    expect(o.morphology!.holes![0]!.corridor).toBe(4)
    expect(r.project.warehouseTypes).toBe(placed.project.warehouseTypes)
    // a corner dragged, a corner added
    const v = read.contour.vertices[1]
    const d = editShape(placed.project, ref, { op: 'vertex', vertex: 1, to: { x: v.x + 1, y: v.y + 1 } })
    expect(d.reason).toBeUndefined()
    const a = editShape(placed.project, ref, { op: 'insert', wall: 0, at: { x: (read.contour.vertices[0].x + v.x) / 2, y: (read.contour.vertices[0].y + v.y) / 2 } })
    expect(copyIn(a.project, placed.id).warehouse!.overrides!.morphology!.holes![0]!.vertices).toHaveLength(5)
    // outside its block: refused
    const out = editShape(placed.project, ref, { op: 'move', by: { x: 900, y: 0 } })
    expect(out.project).toBe(placed.project)
    expect(out.reason).toMatch(/inside/i)
  })
})

describe('the hole verbs on a block’s hall reach the copy’s own holes', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number) => ({ vertices: [{ x: x0, y: y0, r: 0 }, { x: x1, y: y0, r: 0 }, { x: x1, y: y1, r: 0 }, { x: x0, y: y1, r: 0 }] })
  it('addHole, setHole, setHoleCorridor, copyHole and removeHole on a hall: a variant, the type untouched; a hole outside it is refused', () => {
    const { p, copy } = start2(30)
    const hall = hallOf(p, copy)
    const c = footprintPolygon(hall.footprint)
    const mid = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
    const around = (r: number) => rect(mid.x - r, mid.y - r, mid.x + r, mid.y + r)
    const added = actions.addHole(p, hall.id, around(5))
    expect(added).not.toBeNull()
    expect(added!.k).toBe(0)
    const o = () => copyIn(added!.project, copy).warehouse!.overrides!.morphology!
    expect(o().holes).toHaveLength(1)
    expect(added!.project.warehouseTypes).toBe(p.warehouseTypes)
    expect(hallOf(added!.project, copy).holes).toHaveLength(1)
    // a corridor round it, then redrawn: the corridor stays
    const wide = actions.setHoleCorridor(added!.project, hall.id, 0, 4)
    expect(copyIn(wide, copy).warehouse!.overrides!.morphology!.holes![0]!.corridor).toBe(4)
    const redrawn = actions.setHole(wide, hall.id, 0, around(7))
    expect(copyIn(redrawn, copy).warehouse!.overrides!.morphology!.holes![0]!.corridor).toBe(4)
    expect(hallOf(redrawn, copy).holes).toHaveLength(1)
    // a copy of it moved by 20 m, then taken away
    const two = actions.copyHole(redrawn, hall.id, 0, { x: 20, y: 0 })
    expect(two!.k).toBe(1)
    expect(hallOf(two!.project, copy).holes).toHaveLength(2)
    const gone = actions.removeHole(two!.project, hall.id, 0)
    expect(hallOf(gone, copy).holes).toHaveLength(1)
    // outside the block: refused
    expect(actions.addHole(p, hall.id, rect(c[0].x - 400, c[0].y - 400, c[0].x - 380, c[0].y - 380))).toBeNull()
    expect(ProjectSchema.safeParse(two!.project).success).toBe(true)
  })
})

describe('setBlockOutline: a block redrawn from its face', () => {
  it('takes the walls and the elements of the walls it lies along; a wall that is not along the grid keeps none', () => {
    const { p, id, copy } = start2()
    const poly = footprintPolygon(hallOf(p, copy).footprint)
    expect(poly).toHaveLength(4)
    // the far end cut by a slant: the right wall (corner 1 to 2) leans in by 20 m
    const points = poly.map((q, i) => (i === 2 ? { x: q.x - 20, y: q.y } : q))
    const r = actions.setBlockOutline(p, hallOf(p, copy).id, points)!
    expect(r.reason).toBeUndefined()
    const o = copyIn(r.project, copy).warehouse!.overrides!
    expect(o.morphology!.outline).toHaveLength(4)
    // its ids: the front and the left wall keep theirs
    expect(o.morphology!.outline!.map((c) => c.id)).toEqual(expect.arrayContaining(['e1', 'e4']))
    // the docks on the front stay on it
    expect(o.elements!.filter((x) => x.edge === 'e1').length).toBe(typeIn(p, id).elements.filter((x) => x.edge === 'e1').length)
    expect(r.project.warehouseTypes).toBe(p.warehouseTypes)
    // not a block's: undefined; a bow tie: refused
    expect(actions.setBlockOutline(p, 'nope', points)).toBeUndefined()
    const bow = actions.setBlockOutline(p, hallOf(p, copy).id, [poly[0], poly[2], poly[1], poly[3]])!
    expect(bow.project).toBe(p)
    expect(bow.reason).toBeTruthy()
  })
})

describe('the kinds and the adapters', () => {
  it('the block’s kinds take every op but a move and a split (a hole: no bump, radius, chamfer or split)', async () => {
    const { kindOf } = await import('../../../kinds/index.ts')
    expect(kindOf('block-type')!.shape).toEqual({ without: ['move', 'split'] })
    expect(kindOf('hole')!.shape).toEqual({ without: ['bump', 'radius', 'chamfer', 'split'] })
  })

  it('a type that is not there: the same project and why', () => {
    const { p } = start()
    expect(shapeOf(p, typeRef('nope'))).toBeNull()
    expect(editShape(p, typeRef('nope'), { op: 'push', wall: 0, by: 3 }).project).toBe(p)
  })
})

// a dock put by hand on a wall along the grid still works after an edit
describe('what was put stays put', () => {
  it('a dock on the left wall of a block whose front became angled', () => {
    const { p, id } = start()
    const q = editShape(p, typeRef(id), { op: 'vertex', vertex: 1, to: { x: 200.3, y: 5.7 } }).project
    const r = putElements(q, id, 'dock', 'e4', [10], true)
    const docks = typeIn(r, id).elements.filter((x: HallElement) => x.edge === 'e4')
    expect(docks).toHaveLength(1)
  })
})
