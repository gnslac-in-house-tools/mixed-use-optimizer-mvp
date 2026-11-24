// A gate stays on the side of the street it stands on while that street is edited (Phase PE.2, task 9; plan Decision 18, Review Focus 3):
// `followGates(before, after)` in `settle()`, after `followRoads`. Its segment split or merged, a node dragged, the street deleted,
// an existing street's node removed, a street mirrored whole.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import type { Project } from '../../../model/schema.ts'
import { settle } from '../../settle.ts'
import { demoProject } from '../../demo.ts'
import { addExistingRoad, addGateOn, followGates, updateGate } from '../circulation.ts'
import { editPath } from '../path.ts'
import { drawStreet, mirrorStreetNodes, moveStreetNodes, removeStreetNode, removeStreetSegment, turnStreetNodes } from '../streets.ts'

const settled = (before: Project, after: Project): Project => {
  const r = settle(before, after)
  if (!('project' in r)) throw new Error(r.refused)
  return r.project
}

/** A street of 8 m from (100, 150) to (200, 150) in o1 with a gate on its right side at 70 m (12 m wide), on the boundary one too. */
function fixture() {
  const base = demoProject({ streets: false })
  const r = drawStreet(base, 'o1', [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
  const seg = r.segments[0]
  const g = addGateOn(r.project, 'o1', { kind: 'street', id: seg, side: 'right', at: 70 })
  return { p: g.project, seg, gate: g.id, street: { kind: 'street', id: `street:${seg}` }, nodes: r.nodes }
}
const gateOf = (p: Project, id: string) => gatesOf(p, 'o1').find((g) => g.id === id)

describe('followGates: a street edited under its gate', () => {
  it('a segment split away from the gate: the gate stays on the half that holds it, its place along that half', () => {
    const { p, seg, gate, street } = fixture()
    const after = settled(p, editPath(p, street, { op: 'insert', k: 0, at: { x: 150, y: 150 } }, 'o1').project)
    const g = gateOf(after, gate)!
    // the first half keeps the id (100 → 150); the gate was at 70 m of 100: on the second half at 20 m
    expect(g.on!.id).not.toBe(seg)
    expect(g.on).toMatchObject({ kind: 'street', side: 'right', at: 20 })
  })

  it('the segment split on the gate’s other side: it stays on the first half', () => {
    const { p, seg, gate, street } = fixture()
    const after = settled(p, editPath(p, street, { op: 'insert', k: 0, at: { x: 190, y: 150 } }, 'o1').project)
    expect(gateOf(after, gate)!.on).toMatchObject({ id: seg, side: 'right', at: 70 })
  })

  it('merged again: the gate is on the merged segment, the same side, the same place', () => {
    const { p, seg, gate, street } = fixture()
    const split = settled(p, editPath(p, street, { op: 'insert', k: 0, at: { x: 150, y: 150 } }, 'o1').project)
    const merged = settled(split, editPath(split, street, { op: 'remove', i: 1 }, 'o1').project)
    expect(gateOf(merged, gate)!.on).toMatchObject({ id: seg, side: 'right', at: 70 })
    expect(derive(merged).circulation.gates.find((x) => x.id === gate)!.at.x).toBeCloseTo(170, 6)
  })

  it('a node dragged, the node count unchanged: its place along the side is kept, clamped half its width from the end', () => {
    const { p, gate, street } = fixture()
    const shorter = settled(p, editPath(p, street, { op: 'node', i: 1, to: { x: 160, y: 150 } }, 'o1').project)
    // the segment is 60 m now: 70 m clamps to 54 m
    expect(gateOf(shorter, gate)!.on!.at).toBe(54)
    const longer = settled(p, editPath(p, street, { op: 'node', i: 1, to: { x: 300, y: 150 } }, 'o1').project)
    expect(gateOf(longer, gate)!.on!.at).toBe(70)
  })

  it('a street shorter than its gate keeps the gate in the middle', () => {
    const { p, gate, street } = fixture()
    const tiny = settled(p, editPath(p, street, { op: 'node', i: 1, to: { x: 108, y: 150 } }, 'o1').project)
    expect(gateOf(tiny, gate)!.on!.at).toBeCloseTo(4, 6)
  })

  it('the street deleted: the gate is gone, the boundary gate stays', () => {
    const { p, seg, gate } = fixture()
    const after = settled(p, removeStreetSegment(p, 'o1', seg))
    expect(gateOf(after, gate)).toBeUndefined()
    expect(gatesOf(after, 'o1').length).toBe(gatesOf(p, 'o1').length - 1)
    expect(gatesOf(after, 'o1').every((g) => g.t !== undefined)).toBe(true)
  })

  it('a street mirrored whole: the gate’s side is swapped and it stays on the mirrored street', () => {
    const { p, gate, nodes } = fixture()
    const after = settled(p, mirrorStreetNodes(p, 'o1', nodes, { x: 0, y: 0 }, { x: 1, y: 0 }))
    const g = gateOf(after, gate)!
    expect(g.on).toMatchObject({ side: 'left', at: 70 })
    // the gate stood 4 m below the street on the right (y 146): mirrored, 146 above the axis
    const d = derive(after).circulation.gates.find((x) => x.id === gate)!
    expect(d.at.x).toBeCloseTo(170, 6)
    expect(d.at.y).toBeCloseTo(-146, 6)
  })

  it('a street mirrored by one of its nodes only is stretched, not turned over: the side stays', () => {
    const { p, gate, nodes } = fixture()
    const after = settled(p, mirrorStreetNodes(p, 'o1', [nodes[1]], { x: 250, y: 0 }, { x: 250, y: 1 }))
    expect(gateOf(after, gate)!.on!.side).toBe('right')
  })

  it('nothing changed: the same project', () => {
    const { p } = fixture()
    expect(followGates(p, p)).toBe(p)
  })

  it('a copy of the option owns its own gates: editing o1’s street leaves o2’s gate where it was', () => {
    const { p, gate, street } = fixture()
    const own = { ...p, options: [...p.options, { ...p.options[0], id: 'o2', name: 'Option 2', gates: structuredClone(gatesOf(p, 'o1')) }] }
    const after = settled(own, editPath(own, street, { op: 'node', i: 1, to: { x: 160, y: 150 } }, 'o1').project)
    expect(gatesOf(after, 'o1').find((g) => g.id === gate)!.on).toMatchObject({ at: 54 })
    // o2 has the same segment: its street moved too? no, only o1’s streets were edited
    expect(gatesOf(after, 'o2').find((g) => g.id === gate)!.on).toMatchObject({ at: 70 })
  })
})

describe('followGates: a street moved with its nodes and knit where it lands (review E1)', () => {
  /** The fixture street (100, 150) → (200, 150), its gate on the right 70 m along, and a street across at x 250 (y 100 to 200). */
  function crossed() {
    const f = fixture()
    const across = drawStreet(f.p, 'o1', [{ x: 250, y: 100 }, { x: 250, y: 200 }], undefined, 8)!
    return { ...f, p: across.project, across: across.segments[0] }
  }
  const atOf = (p: Project, id: string) => derive(p, 'o1').circulation.gates.find((g) => g.id === id)!.at

  it('dragged across another street: the gate is on the half the knit gave its place, where it stood moved by the drag', () => {
    const { p, gate, nodes } = crossed()
    const before = atOf(p, gate)
    const after = settled(p, moveStreetNodes(p, 'o1', nodes, { x: 120, y: 0 }))
    expect(gateOf(after, gate)).toBeDefined()
    expect(atOf(after, gate).x).toBeCloseTo(before.x + 120, 6)
    expect(atOf(after, gate).y).toBeCloseTo(before.y, 6)
    expect(gateOf(after, gate)!.on).toMatchObject({ kind: 'street', side: 'right' })
  })

  it('dragged so that its end lands on the other street’s paving: the gate stays on it', () => {
    const { p, gate, nodes } = crossed()
    const before = atOf(p, gate)
    const after = settled(p, moveStreetNodes(p, 'o1', nodes, { x: 48, y: 0 }))
    expect(gateOf(after, gate)).toBeDefined()
    expect(atOf(after, gate).x).toBeCloseTo(before.x + 48, 6)
    expect(atOf(after, gate).y).toBeCloseTo(before.y, 6)
  })

  it('turned across another street, and mirrored onto it: the gate is still there', () => {
    const { p, gate, nodes } = crossed()
    const turned = settled(p, turnStreetNodes(p, 'o1', nodes, { x: 225, y: 150 }, 100))
    expect(gateOf(turned, gate)).toBeDefined()
    const mirrored = settled(p, mirrorStreetNodes(p, 'o1', nodes, { x: 175, y: 0 }, { x: 175, y: 1 }))
    expect(gateOf(mirrored, gate)).toBeDefined()
  })
})

describe('followGates: a node at a bend removed (review R1)', () => {
  /** A street (100, 150) → (150, 150) → (200, 170), 8 m, a gate on the right of each of its two segments. */
  function bent() {
    const base = demoProject({ streets: false })
    const r = drawStreet(base, 'o1', [{ x: 100, y: 150 }, { x: 150, y: 150 }, { x: 200, y: 170 }], undefined, 8)!
    const [first, second] = r.segments
    const one = addGateOn(r.project, 'o1', { kind: 'street', id: first, side: 'right', at: 30 })
    const two = addGateOn(one.project, 'o1', { kind: 'street', id: second, side: 'right', at: 30 })
    return { p: two.project, first, second, a: one.id, b: two.id, node: r.nodes[1], street: { kind: 'street', id: `street:${first}` } }
  }

  it('Delete on the node (the path engine) keeps the gate of the later segment on the merged one, where it stood', () => {
    const { p, a, b, street } = bent()
    const before = derive(p, 'o1').circulation.gates.find((g) => g.id === b)!.at
    const after = settled(p, editPath(p, street, { op: 'remove', i: 1 }, 'o1').project)
    expect(after.options[0].streets!.segments).toHaveLength(1)
    expect(gateOf(after, a)).toBeDefined()
    expect(gateOf(after, b)).toBeDefined()
    expect(gateOf(after, b)!.on).toMatchObject({ kind: 'street', side: 'right' })
    // the merged segment cuts the corner: the gate stands within the host's reach (its widest side + 1 m) of where it was
    const now = derive(after, 'o1').circulation.gates.find((g) => g.id === b)!.at
    expect(Math.hypot(now.x - before.x, now.y - before.y)).toBeLessThan(5)
  })

  it('removeStreetNode too', () => {
    const { p, a, b, node } = bent()
    const after = settled(p, removeStreetNode(p, 'o1', node))
    expect(after.options[0].streets!.segments).toHaveLength(1)
    expect(gateOf(after, a)).toBeDefined()
    expect(gateOf(after, b)).toBeDefined()
  })

  it('a node that is no neighbour of the merged segment is no merge: the segment deleted takes its gate', () => {
    const { p, b, second } = bent()
    const after = settled(p, removeStreetSegment(p, 'o1', second))
    expect(gateOf(after, b)).toBeUndefined()
  })
})

describe('followGates: only the street’s own segments take its gate (review E4)', () => {
  /** A street (60, 150) → (300, 150), 12 m, a street across it at x 206 that splits it, and a narrow gate 2 m before the crossing. */
  function split() {
    const base = demoProject({ streets: false })
    const r = drawStreet(base, 'o1', [{ x: 60, y: 150 }, { x: 300, y: 150 }], undefined, 12)!
    const across = drawStreet(r.project, 'o1', [{ x: 206, y: 100 }, { x: 206, y: 200 }], undefined, 12)!
    const first = r.segments[0]
    const length = Math.hypot(206 - 60, 0)
    const g = addGateOn(across.project, 'o1', { kind: 'street', id: first, side: 'right', at: length - 2 }, { width: 4 })
    return { p: g.project, first, gate: g.id, across: across.segments[0] }
  }

  it('the street’s first piece deleted: the gate goes, not onto the street beyond the crossing', () => {
    const { p, first, gate } = split()
    expect(gateOf(p, gate)!.on).toMatchObject({ id: first })
    const after = settled(p, removeStreetSegment(p, 'o1', first))
    expect(gateOf(after, gate)).toBeUndefined()
  })
})

describe('a gate’s place along its street is kept inside it (review E5)', () => {
  it('addGateOn and updateGate clamp `at` half the gate’s width from the ends, on a street and on an existing street', () => {
    const { p, seg } = fixture()
    const half = (gatesOf(p, 'o1').find((g) => g.on)!.width ?? 12) / 2
    const low = addGateOn(p, 'o1', { kind: 'street', id: seg, side: 'left', at: 0 })
    expect(gateOf(low.project, low.id)!.on!.at).toBe(half)
    const high = addGateOn(p, 'o1', { kind: 'street', id: seg, side: 'left', at: 500 })
    expect(gateOf(high.project, high.id)!.on!.at).toBe(100 - half)
    const moved = updateGate(p, 'o1', gatesOf(p, 'o1').find((g) => g.on)!.id, { on: { kind: 'street', id: seg, side: 'right', at: 999 } })
    expect(gatesOf(moved, 'o1').find((g) => g.on)!.on!.at).toBe(100 - half)
    const road = addExistingRoad({ ...p, site: { ...p.site, existingRoads: undefined } }, [{ x: 0, y: -50 }, { x: 80, y: -50 }], 10)!
    const onRoad = addGateOn(road.project, 'o1', { kind: 'existing-road', id: road.id, side: 'right', at: 1 })
    expect(gateOf(onRoad.project, onRoad.id)!.on!.at).toBe(half)
  })

  it('a width change alone clamps `at` for the new width (review R6)', () => {
    const { p, seg, gate } = fixture()
    // the gate is 12 m wide at 70 of 100; at 94 it still fits (88 is the last), widened to 30 m it must come in to 85
    const near = updateGate(p, 'o1', gate, { on: { kind: 'street', id: seg, side: 'right', at: 90 } })
    expect(gateOf(near, gate)!.on!.at).toBe(90)
    const wider = updateGate(near, 'o1', gate, { width: 30 })
    expect(gateOf(wider, gate)!.width).toBe(30)
    expect(gateOf(wider, gate)!.on!.at).toBe(85)
    // a boundary gate widened is no concern of the street's
    const boundary = gatesOf(p, 'o1').find((g) => g.t !== undefined)!
    expect(gateOf(updateGate(p, 'o1', boundary.id, { width: 30 }), boundary.id)!.t).toBe(boundary.t)
  })

  it('a place a gate has been given outside its street is left alone by an unrelated edit (a locked one would refuse it)', () => {
    const { p, gate } = fixture()
    const bad = { ...p, options: p.options.map((o) => ({ ...o, gates: (o.gates ?? []).map((g) => (g.id === gate ? { ...g, locked: true, on: { ...g.on!, at: 0 } } : g)) })) } as Project
    expect(gateOf(bad, gate)!.on!.at).toBe(0)
    const elsewhere = drawStreet(bad, 'o1', [{ x: 100, y: 300 }, { x: 200, y: 300 }], undefined, 8)!.project
    const r = settle(bad, elsewhere)
    expect('project' in r, 'refused' in r ? r.refused : '').toBe(true)
    expect(gateOf((r as { project: Project }).project, gate)!.on!.at).toBe(0)
  })
})

describe('followGates: an existing street edited under its gate', () => {
  function onRoad() {
    const base = demoProject({ streets: false })
    const road = addExistingRoad({ ...base, site: { ...base.site, existingRoads: undefined } }, [{ x: 0, y: -50 }, { x: 100, y: -50 }, { x: 200, y: -50 }], 10)!
    const g = addGateOn(road.project, 'o1', { kind: 'existing-road', id: road.id, side: 'right', at: 150 })
    return { p: g.project, gate: g.id, ref: { kind: 'existing-road', id: road.id } }
  }

  it('its node removed (the stretches become one): the gate is re-homed to the same side, at the same place', () => {
    const { p, gate, ref } = onRoad()
    const after = settled(p, editPath(p, ref, { op: 'remove', i: 1 }, 'o1').project)
    expect(gateOf(after, gate)!.on).toMatchObject({ kind: 'existing-road', side: 'right', at: 150 })
  })

  it('its node dragged away: the point count is unchanged, the place along the line kept', () => {
    const { p, gate, ref } = onRoad()
    const after = settled(p, editPath(p, ref, { op: 'node', i: 2, to: { x: 250, y: -50 } }, 'o1').project)
    expect(gateOf(after, gate)!.on!.at).toBe(150)
  })

  it('the street deleted: the gate goes with it', () => {
    const { p, gate, ref } = onRoad()
    const after = settled(p, { ...p, site: { ...p.site, existingRoads: p.site.existingRoads!.filter((r) => r.id !== ref.id) } })
    expect(gateOf(after, gate)).toBeUndefined()
  })
})
