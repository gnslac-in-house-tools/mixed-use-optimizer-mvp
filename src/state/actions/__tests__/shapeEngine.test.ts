// The kinds' shape (Phase D.1): `shapeOf` reads an object's outline, `editShape` runs one operation on it, for a mass and a mass's
// hole alike; each kind has an adapter and refuses what its `shape` says; the old verbs are wrappers that give what they gave.
import { describe, expect, it } from 'vitest'
import type { Contour, Footprint, Project } from '../../../model/schema.ts'
import * as edit from '../../../engine/geom/edit.ts'
import { footprintContour } from '../../../engine/geom/footprint.ts'
import { translateHoles } from '../../../engine/geom/holes.ts'
import { kinds } from '../../../kinds/index.ts'
import { newProject } from '../../../typologies/index.ts'
import { sampleProject } from '../../sample.ts'
import { createAppStore } from '../../store.ts'
import { actions } from '../index.ts'
import { addHole, copyHole, dragHoleVertex, insertHoleVertex, moveHole, moveHoleVertex, moveHoleWall, removeHoleVertex } from '../holes.ts'
import { addMass, toggleMassLock } from '../masses.ts'
import { demoProject } from '../../demo.ts'
import { addWarehouseType, lockWarehouseStep, placeWarehouse } from '../../../modules/warehouse/actions.ts'
import { addDimension, setDimensionLength } from '../dimensions.ts'
import { SHAPE_ADAPTERS, dragVertex, editShape, insertVertex, moveVertex, moveWall, refusalOf, removeVertex, setCornerRadius, shapeOf, stretchMass, toContour } from '../shape.ts'

/** One 100 × 60 rect (m1) from the origin, a 10 × 10 hole in it (hole 0). */
function withRect(): Project {
  const footprint: Footprint = { kind: 'rect', center: { x: 50, y: 30 }, width: 100, depth: 60, rotation: 0 }
  const p = addMass(newProject('industrial'), { programId: 'warehouse', footprint }).project
  const hole: Contour = {
    vertices: [
      { x: 40, y: 20, r: 0 },
      { x: 50, y: 20, r: 0 },
      { x: 50, y: 30, r: 0 },
      { x: 40, y: 30, r: 0 },
    ],
  }
  return addHole(p, 'm1', hole)!.project
}
const mass = { kind: 'mass', id: 'm1' }
const hole = (k: number) => ({ kind: 'mass-hole', id: `m1/${k}` })
const fp = (p: Project) => p.masses[0].footprint

describe('shapeOf', () => {
  it('reads a rect mass as its four corners, in site coordinates', () => {
    const p = withRect()
    const r = shapeOf(p, mass)!
    expect(r.contour).toEqual(footprintContour(fp(p)))
    expect(r.contour.vertices).toHaveLength(4)
    expect(r.without).toBeUndefined()
  })

  it('reads a free mass, and a hole as <massId>/<k>, whose step is 0.1 m', () => {
    const p = toContour(withRect(), 'm1')
    const f = fp(p)
    expect(shapeOf(p, mass)!.contour).toBe(f.kind === 'contour' ? f.contour : null)
    const h = shapeOf(p, hole(0))!
    expect(h.contour.vertices[0]).toMatchObject({ x: 40, y: 20 })
    expect(h.step).toBe(0.1)
  })

  it('answers null for what is not there: a mass, a hole, a kind, an id that names none', () => {
    const p = withRect()
    expect(shapeOf(p, { kind: 'mass', id: 'nope' })).toBeNull()
    expect(shapeOf(p, hole(3))).toBeNull()
    expect(shapeOf(p, { kind: 'mass-hole', id: 'nope/0' })).toBeNull()
    expect(shapeOf(p, { kind: 'mass-hole', id: 'm1' })).toBeNull()
    expect(shapeOf(p, { kind: 'street', id: 'x' })).toBeNull()
  })
})

describe('editShape on a mass', () => {
  it('a rect stays a rect for push and vertex', () => {
    const p = withRect()
    const w = editShape(p, mass, { op: 'push', wall: 1, by: 20 })
    expect(w.applied).toBe(20)
    expect(fp(w.project)).toMatchObject({ kind: 'rect', width: 120, center: { x: 60, y: 30 } })
    const v = editShape(p, mass, { op: 'vertex', vertex: 2, to: { x: 110, y: 70 } })
    expect(fp(v.project)).toMatchObject({ kind: 'rect', width: 110, depth: 70 })
  })

  it('and becomes a contour for the rest: a corner, a radius, a chamfer, a bump', () => {
    const p = withRect()
    for (const op of [
      { op: 'insert', wall: 0, at: { x: 40, y: -3 } },
      { op: 'radius', vertex: 0, r: 5 },
      { op: 'chamfer', vertex: 0, a: 4, b: 6 },
      { op: 'bump', wall: 0, from: 20, to: 30, by: 3 },
    ] as const) {
      const r = editShape(p, mass, op)
      expect(r.reason, op.op).toBeUndefined()
      expect(fp(r.project).kind, op.op).toBe('contour')
    }
    const c = editShape(p, mass, { op: 'chamfer', vertex: 0, a: 4, b: 6 }).project.masses[0].footprint
    expect(c.kind === 'contour' && c.contour.vertices[0]).toMatchObject({ r: 0, chamfer: [4, 6] })
  })

  it('a chamfer that changes nothing is no undo step: a rect stays a rect, the same chamfer again is the same project', () => {
    const p = withRect()
    const none = editShape(p, mass, { op: 'chamfer', vertex: 0, a: 0, b: 0 })
    expect(none.project).toBe(p)
    expect(fp(none.project).kind).toBe('rect')
    const cut = editShape(p, mass, { op: 'chamfer', vertex: 0, a: 4, b: 6 }).project
    expect(editShape(cut, mass, { op: 'chamfer', vertex: 0, a: 4, b: 6 }).project).toBe(cut)
    // a radius 0 leaves a chamfer alone (a radius over 0 takes it away)
    expect(editShape(cut, mass, { op: 'radius', vertex: 0, r: 0 }).project).toBe(cut)
    expect(setCornerRadius(cut, 'm1', 0, 0)).toBe(cut)
  })

  it('a push of a free mass is limited and says how far', () => {
    const p = toContour(withRect(), 'm1')
    const r = editShape(p, mass, { op: 'push', wall: 1, by: -500 })
    expect(r.applied).toBeLessThan(0)
    expect(r.applied).toBeGreaterThan(-100)
    expect(r.notes?.join(' ')).toMatch(/limited/)
  })

  it('what the geometry rejects is the same project, with the reason', () => {
    const p = toContour(withRect(), 'm1')
    const r = editShape(p, mass, { op: 'vertex', vertex: 2, to: { x: 50, y: -30 } })
    expect(r.project).toBe(p)
    expect(r.reason).toMatch(/crosses|flips/)
  })

  it('a mass (a block, as the kind is called) takes no move: it moves by Transform', () => {
    const p = withRect()
    const r = editShape(p, mass, { op: 'move', by: { x: 5, y: 0 } })
    expect(r.project).toBe(p)
    expect(r.reason).toMatch(/block|mass/i)
  })

  it('an object that is not there, or a kind that has no shape: the same project and why', () => {
    const p = withRect()
    expect(editShape(p, { kind: 'mass', id: 'nope' }, { op: 'push', wall: 0, by: 1 })).toMatchObject({ project: p, reason: expect.any(String) })
    expect(editShape(p, { kind: 'street', id: 'x' }, { op: 'push', wall: 0, by: 1 })).toMatchObject({ project: p, reason: expect.any(String) })
  })

  it('a locked mass is refused by the store, as any edit of it is', () => {
    const s = createAppStore(toggleMassLock(withRect(), 'm1'))
    const before = s.getState().project
    s.getState().apply((p) => editShape(p, mass, { op: 'push', wall: 1, by: 5 }).project)
    expect(s.getState().project).toBe(before)
    expect(s.getState().refusal?.text).toMatch(/locked/)
  })
})

describe('split: only a truck court takes it (Phase D.3)', () => {
  const line = { op: 'split', a: { x: 45, y: 0 }, b: { x: 45, y: 100 } } as const

  it('a mass, a hole of a mass, a block’s mass, a block type and a hole of the block editor refuse it, with the kind named, the project the same', () => {
    const p = withRect()
    const mine = editShape(p, mass, line)
    expect(mine.project).toBe(p)
    expect(mine.reason).toMatch(/split/i)
    expect(editShape(p, hole(0), line).project).toBe(p)
    expect(editShape(p, hole(0), line).reason).toMatch(/hole.*split/i)
    const s = sampleProject()
    const b = s.buildings.find((x) => x.warehouse && s.options[0].buildingIds.includes(x.id))!
    const levels = new Set(b.levels.map((l) => l.id))
    const hall = s.masses.find((x) => levels.has(x.levelId) && x.part === 'hall')!
    expect(editShape(s, { kind: 'mass', id: hall.id }, line).project).toBe(s)
    const made = addWarehouseType(demoProject())
    const type = editShape(made.project, { kind: 'block-type', id: made.id }, line)
    expect(type.project).toBe(made.project)
    expect(type.reason).toMatch(/split/i)
    expect(editShape(made.project, { kind: 'hole', id: `${made.id}/h0` }, line).reason).toMatch(/split/i)
  })

  it('the kinds say it as data: split is in each one’s without', () => {
    for (const id of ['mass', 'mass-hole', 'block-type', 'hole']) expect(kinds(demoProject()).find((k) => k.id === id)!.shape!.without, id).toContain('split')
  })
})

describe('a truck court is a shape of its own (Phase D.3)', () => {
  it('the block editor’s `court` and a placed block’s `block-court` each have an adapter and take every op but a move (a split among them)', () => {
    for (const id of ['court', 'block-court']) {
      expect(SHAPE_ADAPTERS[id], id).toBeDefined()
      expect(kinds(demoProject()).find((k) => k.id === id)!.shape, id).toEqual({ without: ['move'] })
    }
    // the same writer serves both: a court that is not there says so, in the kind's words
    for (const [id, ref] of [['court', 'nope/e1'], ['block-court', 'nope/e1']] as const) {
      const r = editShape(demoProject(), { kind: id, id: ref }, { op: 'move', by: { x: 1, y: 0 } })
      expect(r.reason, id).toMatch(/does not take move/)
    }
  })
})

describe('editShape on a hole', () => {
  it('pushes a wall, moves a corner, adds and removes one, as the hole verbs do', () => {
    const p = withRect()
    const w = editShape(p, hole(0), { op: 'push', wall: 1, by: 5 })
    expect(w.applied).toBe(5)
    expect(p.masses[0].holes![0].vertices[1].x).toBe(50)
    expect(w.project.masses[0].holes![0].vertices[1].x).toBe(55)
    const v = editShape(p, hole(0), { op: 'vertex', vertex: 2, to: { x: 52, y: 33 } })
    expect(v.project.masses[0].holes![0].vertices[2]).toMatchObject({ x: 52, y: 33 })
    const i = editShape(p, hole(0), { op: 'insert', wall: 0, at: { x: 45, y: 20 } })
    expect(i.project.masses[0].holes![0].vertices).toHaveLength(5)
    const r = editShape(i.project, hole(0), { op: 'remove', vertex: 1 })
    expect(r.project.masses[0].holes![0].vertices).toHaveLength(4)
  })

  it('keeps its corridor', () => {
    const p = actions.setHoleCorridor(withRect(), 'm1', 0, 4)
    const w = editShape(p, hole(0), { op: 'push', wall: 1, by: 2 })
    expect(w.project.masses[0].holes![0].corridor).toBe(4)
  })

  it('a move shifts it; with copy it makes one more, and says which (the ref)', () => {
    const p = withRect()
    const m = editShape(p, hole(0), { op: 'move', by: { x: 3, y: 1 } })
    expect(m.project.masses[0].holes![0].vertices[0]).toMatchObject({ x: 43, y: 21 })
    const c = editShape(p, hole(0), { op: 'move', by: { x: 3, y: 1 }, copy: true })
    expect(c.project.masses[0].holes).toHaveLength(2)
    expect(c.project.masses[0].holes![0]).toEqual(p.masses[0].holes![0])
    expect(c.ref).toEqual(hole(1))
    expect(c.project).toEqual(copyHole(p, 'm1', 0, { x: 3, y: 1 })!.project)
  })

  it('refuses a bump, a radius and a chamfer: its kind does not take them', () => {
    const p = withRect()
    for (const op of [
      { op: 'bump', wall: 0, from: 2, to: 5, by: 1 },
      { op: 'radius', vertex: 0, r: 1 },
      { op: 'chamfer', vertex: 0, a: 1, b: 1 },
    ] as const) {
      const r = editShape(p, hole(0), op)
      expect(r.project, op.op).toBe(p)
      expect(r.reason, op.op).toMatch(/hole/i)
    }
  })

  it('a hole that is not there: the same project', () => {
    const p = withRect()
    expect(editShape(p, hole(4), { op: 'push', wall: 0, by: 1 }).project).toBe(p)
  })
})

describe('a block’s mass, its outline free (Phase D.2)', () => {
  const start = () => {
    const p = sampleProject()
    const b = p.buildings.find((x) => x.warehouse && p.options[0].buildingIds.includes(x.id))!
    const levels = new Set(b.levels.map((l) => l.id))
    const m = p.masses.find((x) => levels.has(x.levelId) && x.part === 'hall')!
    return { p, ref: { kind: 'mass', id: m.id } }
  }

  it('hands a push to stretchBlockWall', () => {
    const { p, ref } = start()
    const was = actions.stretchBlockWall(p, ref.id, 0, 6)!
    const r = editShape(p, ref, { op: 'push', wall: 0, by: 6 })
    expect(r.project).toEqual(was.project)
    expect(r.applied).toBe(was.applied)
  })

  it('refuses a move, with the reason, and reads nothing else refused: every other op is taken', () => {
    const { p, ref } = start()
    const read = shapeOf(p, ref)!
    expect(read.without).toBeUndefined()
    expect(read.why).toBeUndefined()
    const moved = editShape(p, ref, { op: 'move', by: { x: 1, y: 1 } })
    expect(moved.project).toBe(p)
    expect(moved.reason).toBeTruthy()
    const v = read.contour.vertices[0]
    for (const op of [
      { op: 'vertex', vertex: 0, to: { x: v.x + 1.3, y: v.y + 0.7 } },
      { op: 'radius', vertex: 0, r: 1 },
      { op: 'push', wall: 0, by: 6, free: true },
    ] as const) {
      const r = editShape(p, ref, op)
      expect(r.reason, op.op).toBeUndefined()
      expect(r.project, op.op).not.toBe(p)
    }
  })

  it('the old verbs reach its outline: a corner moved, added or rounded, a free push, a wall by the metres asked', () => {
    const { p, ref } = start()
    const [v, w] = footprintContour(p.masses.find((m) => m.id === ref.id)!.footprint).vertices
    const to = { x: v.x + 1.3, y: v.y + 0.7 }
    const free = moveWall(p, ref.id, 0, 1, true)
    expect(free.project).not.toBe(p)
    expect(free.applied).toBeCloseTo(1, 6)
    expect(free.reason).toBeUndefined()
    expect(dragVertex(p, ref.id, 0, to)).not.toBeNull()
    expect(moveVertex(p, ref.id, 0, to)).not.toBe(p)
    expect(insertVertex(p, ref.id, 0, { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 })).not.toBe(p)
    expect(setCornerRadius(p, ref.id, 0, 1)).not.toBe(p)
    // a wall by a push as editShape's: the metres asked
    const pushed = editShape(p, ref, { op: 'push', wall: 0, by: 6 })
    expect(pushed.applied).not.toBe(0)
    expect(moveWall(p, ref.id, 0, 6)).toMatchObject({ project: pushed.project, applied: pushed.applied })
    const small = moveWall(p, ref.id, 0, 0.2)
    expect(small.project).not.toBe(p)
    expect(small.applied).toBeCloseTo(0.2, 6)
  })

  it('a stretch by corners is still refused (its outline is the block’s: the shape verbs edit it); a block refuses nothing else, a plain mass neither', () => {
    const { p, ref } = start()
    expect(stretchMass(p, ref.id, { x: 1, y: 0 }, 0, 4.4)).toBe(p)
    expect(refusalOf(p, ref.id)).toBeUndefined()
    expect(refusalOf(withRect(), 'm1')).toBeUndefined()
  })

  it('a dimension’s length on a wall of a plain block goes through the block’s push, by the metres asked', () => {
    const base = demoProject()
    const made = addWarehouseType(base)
    let p = made.project
    for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, made.id, s)
    const placed = placeWarehouse(p, made.id, { x: 200, y: 150 }, 0, base.options[0].id)!
    p = placed.project
    const levels = new Set(p.buildings.find((x) => x.id === placed.id)!.levels.map((l) => l.id))
    const m = p.masses.find((x) => levels.has(x.levelId) && x.part === 'hall')!
    const vs = footprintContour(m.footprint).vertices
    expect(vs).toHaveLength(4)
    // a wall along x and its two ends: a dimension along it, and the wall at its far end is what a length moves
    const i = vs.findIndex((_, k) => Math.abs(vs[k].y - vs[(k + 1) % 4].y) < 1e-6)
    const a = vs[i]
    const b = vs[(i + 1) % 4]
    const q = addDimension(p, { x: a.x, y: a.y }, { x: b.x, y: b.y }, -3, m.levelId)!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const module = shapeOf(p, { kind: 'mass', id: m.id })!.walls![i].module!
    const off = setDimensionLength(q.project, q.id, len + 0.4 * module)
    expect(off.notice).toBeUndefined()
    expect(off.project).not.toBe(q.project)
    const on = setDimensionLength(q.project, q.id, len + module)
    expect(on.notice).toBeUndefined()
    expect(on.project).not.toBe(q.project)
  })
})

describe('the old verbs give what they gave', () => {
  it('moveWall: a rect, a free shape (square and free), and the dimension’s length', () => {
    const p = withRect()
    expect(moveWall(p, 'm1', 1, 20)).toMatchObject({ applied: 20 })
    const free = toContour(p, 'm1')
    const f = fp(free)
    const c = f.kind === 'contour' ? f.contour : null!
    expect(fp(moveWall(free, 'm1', 1, 8).project)).toEqual({ kind: 'contour', contour: edit.pushWallLimited(c, 1, 8).contour })
    expect(fp(moveWall(free, 'm1', 1, 8, true).project)).toEqual({ kind: 'contour', contour: edit.moveWallLimited(c, 1, 8).contour })
    expect(moveWall(free, 'm1', 1, 0)).toEqual({ project: free, applied: 0, notes: [] })
    expect(moveWall(free, 'nope', 1, 5)).toEqual({ project: free, applied: 0, notes: [] })
  })

  it('moveVertex and dragVertex: the same project, or null while dragging, when the shape would cross itself', () => {
    const free = toContour(withRect(), 'm1')
    expect(dragVertex(free, 'm1', 2, { x: 50, y: -30 })).toBeNull()
    expect(moveVertex(free, 'm1', 2, { x: 50, y: -30 })).toBe(free)
    expect(fp(moveVertex(withRect(), 'm1', 2, { x: 110, y: 70 }))).toMatchObject({ kind: 'rect', width: 110, depth: 70 })
    expect(dragVertex(withRect(), 'm1', 2, { x: 110, y: 70 })).not.toBeNull()
  })

  it('insertVertex, removeVertex and setCornerRadius', () => {
    const p = withRect()
    const added = insertVertex(p, 'm1', 0, { x: 40, y: -3 })
    expect(fp(added)).toEqual({ kind: 'contour', contour: edit.insertVertex(footprintContour(fp(p)), 0, { x: 40, y: -3 }) })
    expect(insertVertex(p, 'm1', 0, { x: 0, y: 0 })).toBe(p)
    expect(removeVertex(added, 'm1', 1)).not.toBe(added)
    const round = setCornerRadius(p, 'm1', 0, 10)
    expect(round.masses[0].footprint.kind === 'contour' && round.masses[0].footprint.contour.vertices[0].r).toBe(10)
    expect(setCornerRadius(round, 'm1', 0, 10)).toBe(round)
    expect(setCornerRadius(round, 'm1', 0, 500)).toBe(round)
  })

  it('the hole verbs: moveHoleWall, moveHoleVertex, dragHoleVertex, insertHoleVertex, removeHoleVertex, moveHole', () => {
    const p = withRect()
    const h = p.masses[0].holes![0]
    const w = moveHoleWall(p, 'm1', 0, 1, 5)
    expect(w.applied).toBe(5)
    expect(w.project.masses[0].holes![0]).toEqual({ ...edit.moveWallLimited(h, 1, 5).contour })
    expect(moveHoleWall(p, 'm1', 0, 1, 0)).toEqual({ project: p, applied: 0, notes: [] })
    expect(moveHoleWall(p, 'm1', 7, 1, 3)).toEqual({ project: p, applied: 0, notes: [] })
    expect(moveHoleVertex(p, 'm1', 0, 2, { x: 52, y: 33 }).masses[0].holes![0].vertices[2]).toMatchObject({ x: 52, y: 33 })
    expect(dragHoleVertex(p, 'm1', 0, 2, { x: 45, y: 15 })).toBeNull() // crosses itself
    expect(dragHoleVertex(p, 'm1', 5, 2, { x: 52, y: 33 })).toBeNull()
    expect(moveHoleVertex(p, 'm1', 0, 2, { x: 45, y: 15 })).toBe(p)
    const added = insertHoleVertex(p, 'm1', 0, 0, { x: 45, y: 18 })
    expect(added.masses[0].holes![0].vertices).toHaveLength(5)
    expect(insertHoleVertex(p, 'm1', 0, 0, { x: 40, y: 20 })).toBe(p)
    expect(removeHoleVertex(added, 'm1', 0, 1).project.masses[0].holes![0].vertices).toHaveLength(4)
    expect(removeHoleVertex(p, 'm1', 0, 9)).toEqual({ project: p })
    const tri = removeHoleVertex(removeHoleVertex(p, 'm1', 0, 0).project, 'm1', 0, 0)
    expect(tri.project.masses[0].holes![0].vertices).toHaveLength(3)
    expect(removeHoleVertex(tri.project, 'm1', 0, 0)).toMatchObject({ reason: expect.stringMatching(/3 corners/) })
    expect(moveHole(p, 'm1', 0, { x: 3, y: 1 }).masses[0].holes![0]).toEqual(translateHoles([h], { x: 3, y: 1 })[0])
    expect(moveHole(p, 'm1', 0, { x: 0, y: 0 })).toBe(p)
  })
})

describe('the adapters', () => {
  it('every kind with `shape` has an adapter, and no adapter is without its kind’s `shape`', () => {
    const withShape = kinds().filter((k) => k.shape).map((k) => k.id).sort()
    expect(Object.keys(SHAPE_ADAPTERS).sort()).toEqual(withShape)
    expect(withShape).toEqual(expect.arrayContaining(['mass', 'mass-hole', 'block-type', 'hole']))
  })

  it('the verbs are in the registry of actions', () => {
    expect(typeof actions.shapeOf).toBe('function')
    expect(typeof actions.editShape).toBe('function')
  })
})
