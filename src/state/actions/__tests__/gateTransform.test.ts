// A gate standing on a street's side (`Gate.on`), moved or copied by Transform (Phase PE.2, task 9; plan Decision 17): it is re-homed to the nearest
// point of the same kind of host within 5 m of where the move puts it, else it stays; a copy with nowhere to go is not made.
import { describe, expect, it } from 'vitest'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { NOTHING_PICKED } from '../../../model/picked.ts'
import { demoProject } from '../../demo.ts'
import { addGateOn } from '../circulation.ts'
import { copyPicked, movePicked, turnPicked } from '../selection.ts'
import { drawStreet } from '../streets.ts'

function fixture() {
  const drawn = drawStreet(demoProject({ streets: false }), 'o1', [{ x: 100, y: 150 }, { x: 200, y: 150 }], undefined, 8)!
  const g = addGateOn(drawn.project, 'o1', { kind: 'street', id: drawn.segments[0], side: 'right', at: 30 })
  return { p: g.project, id: g.id, seg: drawn.segments[0], picked: { ...NOTHING_PICKED, gates: [g.id] } }
}
const gate = (p: ReturnType<typeof fixture>['p'], id: string) => gatesOf(p, 'o1').find((x) => x.id === id)!

describe('a gate on a street, moved', () => {
  it('along its side: the place along it follows', () => {
    const { p, id, picked, seg } = fixture()
    const r = movePicked(p, 'o1', picked, { x: 20, y: -3 })
    expect(r.skipped).toEqual([])
    expect(gate(r.project, id).on).toEqual({ kind: 'street', id: seg, side: 'right', at: 50 })
  })

  it('across the street, within 5 m of the other side: it takes that side', () => {
    const { p, id, picked, seg } = fixture()
    const r = movePicked(p, 'o1', picked, { x: 0, y: 8 })
    expect(gate(r.project, id).on).toEqual({ kind: 'street', id: seg, side: 'left', at: 30 })
  })

  it('farther than 5 m from any side of the same kind of host: it stays', () => {
    const { p, id, picked } = fixture()
    const r = movePicked(p, 'o1', picked, { x: 0, y: 40 })
    expect(gate(r.project, id)).toBe(gate(p, id))
  })

  it('a boundary gate moved with it still goes along the boundary', () => {
    const { p } = fixture()
    const boundaryGate = gatesOf(p, 'o1').find((g) => g.t !== undefined)!
    const r = movePicked(p, 'o1', { ...NOTHING_PICKED, gates: [boundaryGate.id] }, { x: 10, y: 0 })
    expect(gate(r.project, boundaryGate.id).t).not.toBe(boundaryGate.t)
    expect(gate(r.project, boundaryGate.id).on).toBeUndefined()
  })

  it('turned, a gate stays (as before), and says so', () => {
    const { p, picked } = fixture()
    const r = turnPicked(p, 'o1', picked, { x: 0, y: 0 }, 30)
    expect(r.skipped).toHaveLength(1)
  })
})

describe('a gate on a street, copied', () => {
  it('a copy re-homed the same way, in the option’s own gates, the original left where it was', () => {
    const { p, id, picked, seg } = fixture()
    const r = copyPicked(p, 'o1', picked, { x: 20, y: 0 })
    expect(r.skipped).toEqual([])
    const copy = gatesOf(r.project, 'o1').at(-1)!
    expect(copy.id).not.toBe(id)
    expect(copy.on).toEqual({ kind: 'street', id: seg, side: 'right', at: 50 })
    expect(gate(r.project, id).on!.at).toBe(30)
  })

  it('with nowhere to go (farther than 5 m from every side) no copy is made, and it says so', () => {
    const { p, picked } = fixture()
    const r = copyPicked(p, 'o1', picked, { x: 0, y: 60 })
    expect(gatesOf(r.project, 'o1')).toHaveLength(gatesOf(p, 'o1').length)
    expect(r.skipped).toHaveLength(1)
  })
})
