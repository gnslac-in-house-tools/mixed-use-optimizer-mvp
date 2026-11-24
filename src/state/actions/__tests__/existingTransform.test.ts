// Existing streets moved, turned, mirrored, copied, locked and grouped (Phase PE.2, task 11; plan Decisions 21 and 22, Review Focus 3 and 5): the verbs of
// `state/actions/circulation.ts` over an existing street, the mixed selection's (`selection.ts`: `Picked.existing`), the padlock (`kinds/locked.ts`, held by
// `settle`) and the group (`engine/groups.ts`). The street ends linked to it (`road: id`) and the gates standing on it follow (`followRoads`, `followGates`).
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { reflectPoint } from '../../../engine/geom/reflect.ts'
import { rotate } from '../../../engine/geom/footprint.ts'
import { refGroupMembers } from '../../../engine/groups.ts'
import { isLocked } from '../../../kinds/locked.ts'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import type { ExistingRoad, Point, Project } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { settle } from '../../settle.ts'
import { actions } from '../index.ts'
import { pathOf } from '../path.ts'

const O = 'o1'
const settled = (before: Project, after: Project): Project => {
  const r = settle(before, after)
  if (!('project' in r)) throw new Error(r.refused)
  return r.project
}
const road = (p: Project, id: string): ExistingRoad => p.site.existingRoads!.find((r) => r.id === id)!
const nodes = (p: Project) => p.options.find((o) => o.id === O)!.streets?.nodes ?? []
const gateAt = (p: Project, id: string) => derive(p, O).circulation.gates.find((g) => g.id === id)!.at
const pick = (x: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...x })

/**
 * The demo with no south street and one existing street of two stretches, (60,150) → (160,150) → (260,150): 2 + 6 m with lanes 2 + 3 + 3 on the first,
 * 4 + 4 on the second. A street end linked to it at (160,150) and a gate on its right side at 70 m.
 */
function world() {
  const base = demoProject({ streets: false, southStreet: false })
  const made = actions.addExistingRoad(base, [{ x: 60, y: 150 }, { x: 160, y: 150 }, { x: 260, y: 150 }], 8)!
  let p = actions.updateExistingRoad(made.project, made.id, {
    name: 'Cross street',
    stretches: [
      { left: 2, right: 6, lanes: [2, 3, 3] },
      { left: 4, right: 4 },
    ],
  })
  const drawn = actions.drawStreet(p, O, [{ x: 160, y: 60 }, { x: 160, y: 152 }])!
  p = drawn.project
  const gate = actions.addGateOn(p, O, { kind: 'existing-road', id: made.id, side: 'right', at: 70 })
  return { p: gate.project, road: made.id, end: drawn.nodes[1], far: drawn.nodes[0], gate: gate.id }
}

describe('moveExistingRoads', () => {
  it('moves its points and keeps its stretches; its linked end and its gate go with it', () => {
    const w = world()
    const before = gateAt(w.p, w.gate)
    const q = settled(w.p, actions.moveExistingRoads(w.p, [w.road], { x: 30, y: 10 }))
    expect(road(q, w.road).points).toEqual([{ x: 90, y: 160 }, { x: 190, y: 160 }, { x: 290, y: 160 }])
    expect(road(q, w.road).stretches).toEqual(road(w.p, w.road).stretches)
    expect(nodes(q).find((n) => n.id === w.end)).toMatchObject({ x: 190, y: 160, road: w.road })
    expect(nodes(q).find((n) => n.id === w.far)).toMatchObject({ x: 160, y: 60 })
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on).toMatchObject({ kind: 'existing-road', side: 'right', at: 70 })
    expect(gateAt(q, w.gate).x).toBeCloseTo(before.x + 30, 6)
    expect(gateAt(q, w.gate).y).toBeCloseTo(before.y + 10, 6)
  })

  it('a step of nothing, a road that is not there: the same project', () => {
    const w = world()
    expect(actions.moveExistingRoads(w.p, [w.road], { x: 0, y: 0 })).toBe(w.p)
    expect(actions.moveExistingRoads(w.p, ['nope'], { x: 5, y: 5 })).toBe(w.p)
  })
})

describe('turnExistingRoads', () => {
  it('turns its points about the pivot; a linked end and a gate follow', () => {
    const w = world()
    const pivot = { x: 100, y: 100 }
    const before = gateAt(w.p, w.gate)
    const q = settled(w.p, actions.turnExistingRoads(w.p, [w.road], pivot, 30))
    const turned = road(w.p, w.road).points.map((x) => rotate(x, pivot, 30))
    road(q, w.road).points.forEach((x, i) => {
      expect(x.x).toBeCloseTo(turned[i].x, 6)
      expect(x.y).toBeCloseTo(turned[i].y, 6)
    })
    expect(road(q, w.road).stretches).toEqual(road(w.p, w.road).stretches)
    const end = nodes(q).find((n) => n.id === w.end)!
    expect(end.road).toBe(w.road)
    expect(end.x).toBeCloseTo(turned[1].x, 6)
    expect(end.y).toBeCloseTo(turned[1].y, 6)
    const g = gateAt(q, w.gate)
    const want = rotate(before, pivot, 30)
    expect(g.x).toBeCloseTo(want.x, 6)
    expect(g.y).toBeCloseTo(want.y, 6)
  })

  it('no angle: the same project', () => {
    const w = world()
    expect(actions.turnExistingRoads(w.p, [w.road], { x: 0, y: 0 }, 0)).toBe(w.p)
  })
})

describe('mirrorExistingRoads', () => {
  const a: Point = { x: 0, y: 200 }
  const b: Point = { x: 100, y: 200 }

  it('reflects its points, swaps left and right, reverses its lanes and swaps the side of its gates', () => {
    const w = world()
    const before = gateAt(w.p, w.gate)
    const q = settled(w.p, actions.mirrorExistingRoads(w.p, [w.road], a, b))
    expect(road(q, w.road).points).toEqual([{ x: 60, y: 250 }, { x: 160, y: 250 }, { x: 260, y: 250 }])
    expect(road(q, w.road).stretches).toEqual([
      { left: 6, right: 2, lanes: [3, 3, 2] },
      { left: 4, right: 4 },
    ])
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on).toMatchObject({ side: 'left', at: 70 })
    const want = reflectPoint(before, a, b)
    expect(gateAt(q, w.gate).x).toBeCloseTo(want.x, 6)
    expect(gateAt(q, w.gate).y).toBeCloseTo(want.y, 6)
    expect(nodes(q).find((n) => n.id === w.end)).toMatchObject({ x: 160, y: 250, road: w.road })
  })

  it('mirrored twice it is as it was', () => {
    const w = world()
    const once = settled(w.p, actions.mirrorExistingRoads(w.p, [w.road], a, b))
    const twice = settled(once, actions.mirrorExistingRoads(once, [w.road], a, b))
    expect(road(twice, w.road)).toEqual(road(w.p, w.road))
    expect(gatesOf(twice, O).find((g) => g.id === w.gate)!.on).toEqual(gatesOf(w.p, O).find((g) => g.id === w.gate)!.on)
  })

  it('no line: the same project', () => {
    const w = world()
    expect(actions.mirrorExistingRoads(w.p, [w.road], a, a)).toBe(w.p)
  })
})

describe('copyExistingRoads', () => {
  it('a fresh id, no padlock, no group, its lanes; the linked end and the gate stay on the original', () => {
    const w = world()
    const locked = actions.lockExistingRoads(w.p, [w.road], true)
    const r = actions.copyExistingRoads(locked, [w.road], { x: 0, y: 100 })
    expect(r.ids).toHaveLength(1)
    expect(r.ids[0]).not.toBe(w.road)
    const copy = road(r.project, r.ids[0])
    expect(copy.points).toEqual([{ x: 60, y: 250 }, { x: 160, y: 250 }, { x: 260, y: 250 }])
    expect(copy.stretches).toEqual(road(w.p, w.road).stretches)
    expect(copy.locked).toBeUndefined()
    expect(copy.group).toBeUndefined()
    // the original keeps its padlock, its linked end and its gate
    expect(road(r.project, w.road).locked).toBe(true)
    const q = settled(locked, r.project)
    expect(nodes(q).find((n) => n.id === w.end)).toMatchObject({ x: 160, y: 150, road: w.road })
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on).toMatchObject({ id: w.road })
    // the copy is a street of its own: its stretches move apart from the original's
    expect(road(q, w.road).points[0]).toEqual({ x: 60, y: 150 })
  })

  it('a step of nothing copies in place, no step at all copies nothing, a road that is not there has no copy', () => {
    const w = world()
    const here = actions.copyExistingRoads(w.p, [w.road, 'nope', w.road], { x: 0, y: 0 })
    expect(here.ids).toHaveLength(1)
    expect(road(here.project, here.ids[0]).points).toEqual(road(w.p, w.road).points)
    expect(actions.copyExistingRoads(w.p, [w.road], { x: NaN, y: 0 })).toEqual({ project: w.p, ids: [] })
    expect(actions.copyExistingRoads(w.p, ['nope'], { x: 5, y: 0 })).toEqual({ project: w.p, ids: [] })
  })
})

describe('lockExistingRoads and the padlock', () => {
  it('sets and takes away `locked`; the same project when nothing changes', () => {
    const w = world()
    const on = actions.lockExistingRoads(w.p, [w.road], true)
    expect(road(on, w.road).locked).toBe(true)
    expect(actions.lockExistingRoads(on, [w.road], true)).toBe(on)
    const off = actions.lockExistingRoads(on, [w.road], false)
    expect('locked' in road(off, w.road)).toBe(false)
    expect(actions.lockExistingRoads(w.p, [w.road], false)).toBe(w.p)
  })

  it('isLocked answers for an existing road, and settle holds it', () => {
    const w = world()
    const on = actions.lockExistingRoads(w.p, [w.road], true)
    expect(isLocked(w.p, { kind: 'existing-road', id: w.road })).toBe(false)
    expect(isLocked(on, { kind: 'existing-road', id: w.road })).toBe(true)
    const moved = settle(on, actions.moveExistingRoads(on, [w.road], { x: 5, y: 5 }))
    expect('refused' in moved && moved.refused).toMatch(/Cross street is locked/)
    const gone = settle(on, actions.removeExistingRoad(on, w.road))
    expect('refused' in gone).toBe(true)
    // its lock itself is the one thing an edit may change
    expect('project' in settle(on, actions.lockExistingRoads(on, [w.road], false))).toBe(true)
  })

  it('pathOf says every stretch of a locked one is held', () => {
    const w = world()
    expect(pathOf(w.p, { kind: 'existing-road', id: w.road }, O)!.held).toEqual([false, false])
    const on = actions.lockExistingRoads(w.p, [w.road], true)
    expect(pathOf(on, { kind: 'existing-road', id: w.road }, O)!.held).toEqual([true, true])
    const r = actions.editPath(on, { kind: 'existing-road', id: w.road }, { op: 'node', i: 1, to: { x: 170, y: 150 } }, O)
    expect(r.project).toBe(on)
    expect(r.reason).toBe('That stretch is locked')
  })
})

describe('the mixed selection carries existing streets', () => {
  it('Move takes an existing street with the masses; a locked one stays and is said', () => {
    const w = world()
    const free = actions.movePicked(w.p, O, pick({ masses: ['m1'], existing: [w.road] }), { x: 10, y: 0 })
    expect(free.skipped).toEqual([])
    expect(road(free.project, w.road).points[0]).toEqual({ x: 70, y: 150 })
    expect(free.project.masses.find((m) => m.id === 'm1')!.footprint).not.toEqual(w.p.masses.find((m) => m.id === 'm1')!.footprint)

    const locked = actions.lockExistingRoads(w.p, [w.road], true)
    const held = actions.movePicked(locked, O, pick({ masses: ['m1'], existing: [w.road] }), { x: 10, y: 0 })
    expect(road(held.project, w.road).points[0]).toEqual({ x: 60, y: 150 })
    expect(held.project.masses.find((m) => m.id === 'm1')!.footprint).not.toEqual(locked.masses.find((m) => m.id === 'm1')!.footprint)
    expect(held.skipped).toEqual(['1 existing street stayed: locked'])
    // and the whole edit still settles: nothing locked changed
    expect('project' in settle(locked, held.project)).toBe(true)
  })

  it('Rotate and Mirror skip a locked one and say so', () => {
    const w = world()
    const locked = actions.lockExistingRoads(w.p, [w.road], true)
    const turned = actions.turnPicked(locked, O, pick({ masses: ['m1'], existing: [w.road] }), { x: 0, y: 0 }, 90)
    expect(road(turned.project, w.road)).toEqual(road(locked, w.road))
    expect(turned.skipped).toContain('1 existing street stayed: locked')
    const mirrored = actions.mirrorPicked(locked, O, pick({ existing: [w.road] }), { x: 0, y: 200 }, { x: 100, y: 200 }, false)
    expect(road(mirrored.project, w.road)).toEqual(road(locked, w.road))
    expect(mirrored.skipped).toEqual(['1 existing street stayed: locked'])
  })

  it('Copy copies a locked one (nothing locked changes) unlocked', () => {
    const w = world()
    const locked = actions.lockExistingRoads(w.p, [w.road], true)
    const r = actions.copyPicked(locked, O, pick({ existing: [w.road] }), { x: 0, y: 40 })
    expect(r.skipped).toEqual([])
    expect(r.project.site.existingRoads).toHaveLength(2)
    const copy = r.project.site.existingRoads!.find((x) => x.id !== w.road)!
    expect(copy.points[0]).toEqual({ x: 60, y: 190 })
    expect(copy.locked).toBeUndefined()
  })

  it('a gate picked with its street goes with it: no re-homing, nothing said', () => {
    const w = world()
    const before = gateAt(w.p, w.gate)
    const moved = actions.movePicked(w.p, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 3, y: 0 })
    expect(moved.skipped).toEqual([])
    const q = settled(w.p, moved.project)
    // along the street, 3 m: a gate re-homed too would have gone 6 m
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on!.at).toBe(70)
    expect(gateAt(q, w.gate).x).toBeCloseTo(before.x + 3, 6)

    const turned = actions.turnPicked(w.p, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 100, y: 100 }, 90)
    expect(turned.skipped).toEqual([])
    const mirrored = actions.mirrorPicked(w.p, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 0, y: 200 }, { x: 100, y: 200 }, false)
    expect(mirrored.skipped).toEqual([])
    expect(gatesOf(mirrored.project, O).find((g) => g.id === w.gate)!.on).toMatchObject({ side: 'left' })
  })

  it('a copy of a street and its gate: the gate copy stands on the street copy, mirrored copies swap its side', () => {
    const w = world()
    const copied = actions.copyPicked(w.p, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 0, y: 100 })
    const copy = copied.project.site.existingRoads!.find((x) => x.id !== w.road)!
    const gates = gatesOf(copied.project, O)
    expect(gates).toHaveLength(gatesOf(w.p, O).length + 1)
    expect(gates.find((g) => g.on?.id === copy.id)!.on).toMatchObject({ kind: 'existing-road', id: copy.id, side: 'right', at: 70 })
    const mirrored = actions.mirrorPicked(w.p, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 0, y: 200 }, { x: 100, y: 200 }, true)
    const mirrorCopy = mirrored.project.site.existingRoads!.find((x) => x.id !== w.road)!
    expect(mirrorCopy.stretches[0]).toEqual({ left: 6, right: 2, lanes: [3, 3, 2] })
    expect(gatesOf(mirrored.project, O).find((g) => g.on?.id === mirrorCopy.id)!.on).toMatchObject({ id: mirrorCopy.id, side: 'left', at: 70 })
    expect(gatesOf(mirrored.project, O).find((g) => g.id === w.gate)!.on).toMatchObject({ id: w.road, side: 'right' })
  })
})

describe('groups of existing streets', () => {
  it('an existing street and a gate grouped: one group, moved as one, copied as one', () => {
    const w = world()
    const refs = [{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }]
    const made = actions.groupRefs(w.p, O, refs)!
    expect(made).not.toBeNull()
    expect(road(made.project, w.road).group).toBe(made.id)
    expect(gatesOf(made.project, O).find((g) => g.id === w.gate)!.group).toBe(made.id)
    expect(refGroupMembers(made.project, O, refs[0])).toHaveLength(2)
    // the group moves as one (the view picks the whole group, the verb takes both)
    const moved = actions.movePicked(made.project, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 20, y: 0 })
    const q = settled(made.project, moved.project)
    expect(road(q, w.road).points[0]).toEqual({ x: 80, y: 150 })
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on!.at).toBe(70)
    // copied, the two copies are a group of their own
    const copied = actions.copyPicked(made.project, O, pick({ existing: [w.road], gates: [w.gate] }), { x: 0, y: 60 })
    const copy = copied.project.site.existingRoads!.find((x) => x.id !== w.road)!
    expect(copy.group).toBeDefined()
    expect(copy.group).not.toBe(made.id)
    expect(gatesOf(copied.project, O).find((g) => g.on?.id === copy.id)!.group).toBe(copy.group)
    // ungrouped, each on its own
    const free = actions.ungroupRefs(made.project, O, [refs[0]])
    expect('group' in road(free, w.road)).toBe(false)
  })

  it('a locked existing street keeps its group: Group and Ungroup refuse', () => {
    const w = world()
    const refs = [{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }]
    const locked = actions.lockExistingRoads(w.p, [w.road], true)
    expect(actions.groupRefs(locked, O, refs)).toBeNull()
    const made = actions.groupRefs(w.p, O, refs)!.project
    const held = actions.lockExistingRoads(made, [w.road], true)
    expect(actions.ungroupRefs(held, O, refs)).toBe(held)
  })

  it('a group of one is none: its street deleted leaves the gate in none', () => {
    const w = world()
    const made = actions.groupRefs(w.p, O, [{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }])!.project
    const q = settled(made, actions.removeExistingRoad(made, w.road))
    // the gate went with its street, nothing is left in a group
    expect(gatesOf(q, O).some((g) => g.group !== undefined)).toBe(false)
  })

  it('Align takes a group’s street with the rest of the group', () => {
    const w = world()
    const made = actions.groupRefs(w.p, O, [{ kind: 'mass', id: 'm1' }, { kind: 'existing-road', id: w.road }])!.project
    const aligned = actions.alignPicked(made, O, pick({ masses: ['m1'], existing: [w.road] }), { x: 0, y: 0 }, { x: 100, y: 0 }, 'edges')
    expect(aligned.skipped).toEqual([])
    expect(road(aligned.project, w.road).points[0].y).not.toBe(150)
  })
})
