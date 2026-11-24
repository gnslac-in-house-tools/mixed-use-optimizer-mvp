// A gate picked with its street's nodes (Phase PE.2, review E2 and E8): Move carries it with the street (the settle step keeps it on its side: placing it again would
// move it twice), Copy puts its copy on the street's copy, Rotate and Mirror say nothing of it (it rode with the street), a gate picked alone still stays.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { NOTHING_PICKED, type Picked } from '../../../model/picked.ts'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { settle } from '../../settle.ts'
import { actions } from '../index.ts'
import { copyPicked, mirrorPicked, movePicked, turnPicked } from '../selection.ts'

const O = 'o1'
const settled = (before: Project, after: Project): Project => {
  const r = settle(before, after)
  if (!('project' in r)) throw new Error(r.refused)
  return r.project
}
const pick = (x: Partial<Picked>): Picked => ({ ...NOTHING_PICKED, ...x })
const at = (p: Project, id: string) => derive(p, O).circulation.gates.find((g) => g.id === id)!.at

/** The demo with no streets but one: (100, 150) → (200, 150), 8 m, and a gate on its right side 30 m along. */
function world() {
  const base = demoProject({ streets: false, southStreet: false })
  const r = actions.drawStreet(base, O, [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
  const g = actions.addGateOn(r.project, O, { kind: 'street', id: r.segments[0], side: 'right', at: 30 })
  return { p: g.project, seg: r.segments[0], nodes: r.nodes, gate: g.id }
}

describe('a gate picked with its street’s nodes', () => {
  it('Move: the gate goes with the street once, by the step', () => {
    const w = world()
    const before = at(w.p, w.gate)
    const r = movePicked(w.p, O, pick({ nodes: w.nodes, gates: [w.gate] }), { x: 20, y: 0 })
    const q = settled(w.p, r.project)
    expect(at(q, w.gate).x).toBeCloseTo(before.x + 20, 6)
    expect(at(q, w.gate).y).toBeCloseTo(before.y, 6)
    expect(gatesOf(q, O).find((g) => g.id === w.gate)!.on).toMatchObject({ kind: 'street', id: w.seg, side: 'right', at: 30 })
  })

  it('Copy: its copy stands on the street’s copy, the same side and place; the original stays', () => {
    const w = world()
    const r = copyPicked(w.p, O, pick({ nodes: w.nodes, gates: [w.gate] }), { x: 0, y: 40 })
    const q = settled(w.p, r.project)
    const gates = gatesOf(q, O).filter((g) => g.on)
    expect(gates).toHaveLength(2)
    expect(gates.find((g) => g.id === w.gate)!.on).toMatchObject({ id: w.seg, side: 'right', at: 30 })
    const copy = gates.find((g) => g.id !== w.gate)!
    expect(copy.on).toMatchObject({ kind: 'street', side: 'right', at: 30 })
    expect(copy.on!.id).not.toBe(w.seg)
    expect(at(q, copy.id).x).toBeCloseTo(at(q, w.gate).x, 6)
    expect(at(q, copy.id).y).toBeCloseTo(at(q, w.gate).y + 40, 6)
    expect(r.skipped).toEqual([])
  })

  it('Mirror keeping the originals: the copy of the gate is on the other side of the street’s mirror image', () => {
    const w = world()
    const r = mirrorPicked(w.p, O, pick({ nodes: w.nodes, gates: [w.gate] }), { x: 0, y: 100 }, { x: 1, y: 100 }, true)
    const q = settled(w.p, r.project)
    const gates = gatesOf(q, O).filter((g) => g.on)
    expect(gates).toHaveLength(2)
    const copy = gates.find((g) => g.id !== w.gate)!
    expect(copy.on).toMatchObject({ kind: 'street', side: 'left', at: 30 })
    expect(copy.on!.id).not.toBe(w.seg)
    expect(at(q, copy.id).y).toBeCloseTo(100 - (at(q, w.gate).y - 100), 6)
    expect(r.skipped).not.toContain('Gates stay on their side: Mirror leaves them')
  })

  it('Rotate and Mirror do not say the gate stays: it rode with its street', () => {
    const w = world()
    const picked = pick({ nodes: w.nodes, gates: [w.gate] })
    expect(turnPicked(w.p, O, picked, { x: 150, y: 150 }, 30).skipped).toEqual([])
    expect(mirrorPicked(w.p, O, picked, { x: 0, y: 100 }, { x: 1, y: 100 }, false).skipped).toEqual([])
  })

  it('a gate picked alone, or with a street end only, still stays and says so', () => {
    const w = world()
    expect(turnPicked(w.p, O, pick({ gates: [w.gate] }), { x: 150, y: 150 }, 30).skipped).toContain('Gates stay on their side: Rotate leaves them')
    expect(turnPicked(w.p, O, pick({ nodes: [w.nodes[0]], gates: [w.gate] }), { x: 150, y: 150 }, 30).skipped).toContain('Gates stay on their side: Rotate leaves them')
  })
})

describe('a copied street that is split where it lands (review R2)', () => {
  /** The street (100, 150) → (200, 150) with a gate on its right 70 m along, and a street at x 150 from y 175 to 260, which the copies (by 40 m down, or mirrored across y 200) cross and split. */
  function crossing() {
    const w = world()
    // the gate 70 m along: past the middle, where the copy is split, so it belongs to the copy's second half
    const far = actions.updateGate(w.p, O, w.gate, { on: { kind: 'street', id: w.seg, side: 'right', at: 70 } })
    const across = actions.drawStreet(far, O, [{ x: 150, y: 175 }, { x: 150, y: 260 }], undefined, 8)!
    return { ...w, p: across.project }
  }

  it('Copy by (0, 40): the copy of the gate stands 40 m below the original, on the half of the copy it belongs to', () => {
    const w = crossing()
    const before = at(w.p, w.gate)
    const q = settled(w.p, copyPicked(w.p, O, pick({ nodes: w.nodes, gates: [w.gate] }), { x: 0, y: 40 }).project)
    const gates = gatesOf(q, O).filter((g) => g.on)
    expect(gates).toHaveLength(2)
    const copy = gates.find((g) => g.id !== w.gate)!
    expect(at(q, w.gate).x).toBeCloseTo(before.x, 6)
    expect(at(q, copy.id).x).toBeCloseTo(before.x, 6)
    expect(at(q, copy.id).y).toBeCloseTo(before.y + 40, 6)
    expect(copy.on).toMatchObject({ side: 'right' })
  })

  it('Mirror keeping the originals: the gate’s copy stands where the mirror image of the gate is, on the other side', () => {
    const w = crossing()
    const before = at(w.p, w.gate)
    const r = mirrorPicked(w.p, O, pick({ nodes: w.nodes, gates: [w.gate] }), { x: 0, y: 200 }, { x: 1, y: 200 }, true)
    const q = settled(w.p, r.project)
    const copy = gatesOf(q, O).find((g) => g.on && g.id !== w.gate)!
    expect(copy.on).toMatchObject({ side: 'left' })
    expect(at(q, copy.id).x).toBeCloseTo(before.x, 6)
    expect(at(q, copy.id).y).toBeCloseTo(400 - before.y, 6)
  })
})
