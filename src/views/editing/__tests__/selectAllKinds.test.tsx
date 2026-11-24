// Select all <kind> (Phase AS.4 task 4, Decision "One menu"): the menu's row picks every object of that kind in the option in view that is neither locked nor hidden,
// through `pickRefs`; a street with only some segments locked is mixed and is picked. Several existing roads can be picked together (the access store
// holds them beside the first). Selection is not on Undo.
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Ref } from '../../../kinds/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { dimension, existingRoad, gate, lot, street } from '../../layers/keys.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { menuFor } from '../menu/build.ts'
import { leaf, rowKeyed } from '../menu/__tests__/helpers.ts'
import { type Fixture, fixture, lockGates, lockLots, lockStreets, s, start } from './kindsFixture.ts'

let f: Fixture
const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))
const selectAll = (ref: Ref) => {
  act(() => pickRefs([ref]))
  const before = s().history.past.length
  act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
  expect(s().history.past).toHaveLength(before)
  return pickedRefs()
}
const ids = (refs: Ref[], kind: string) => refs.filter((r) => r.kind === kind).map((r) => r.id).sort()

beforeEach(() => {
  f = fixture()
  start(f.project)
})

describe('Select all <kind>', () => {
  it('streets: every street of the option; one with all its segments locked, or hidden, is left out; a mixed one is in', () => {
    expect(ids(selectAll({ kind: 'street', id: 'street:s1' }), 'street')).toEqual(['street:s1', 'street:s4'])
    act(() => lockStreets(['s2']))
    expect(ids(selectAll({ kind: 'street', id: 'street:s4' }), 'street')).toEqual(['street:s1', 'street:s4'])
    act(() => lockStreets(['s4']))
    expect(ids(selectAll({ kind: 'street', id: 'street:s1' }), 'street')).toEqual(['street:s1'])
    hide(street('s1'), street('s2'), street('s3'))
    act(() => pickRefs([]))
    expect(rowKeyed(menuFor([{ kind: 'street', id: 'street:s1' }], 'plan', null), 'select-all')).toBeDefined()
    act(() => leaf(menuFor([{ kind: 'street', id: 'street:s1' }], 'plan', null), 'select-all').onSelect())
    expect(ids(pickedRefs(), 'street')).toEqual([])
  })

  it('lots: those not locked or hidden', () => {
    expect(ids(selectAll({ kind: 'lot', id: f.lots[0] }), 'lot')).toEqual([...f.lots].sort())
    act(() => lockLots([f.lots[0]]))
    expect(ids(selectAll({ kind: 'lot', id: f.lots[1] }), 'lot')).toEqual([f.lots[1]])
    hide(lot(f.lots[1]))
    act(() => pickRefs([]))
    act(() => leaf(menuFor([{ kind: 'lot', id: f.lots[1] }], 'plan', null), 'select-all').onSelect())
    expect(ids(pickedRefs(), 'lot')).toEqual([])
  })

  it('gates: those not locked or hidden', () => {
    expect(ids(selectAll({ kind: 'gate', id: f.gates[0] }), 'gate')).toEqual([...f.gates].sort())
    act(() => lockGates([f.gates[0]]))
    expect(ids(selectAll({ kind: 'gate', id: f.gates[1] }), 'gate')).toEqual([f.gates[1]])
    hide(gate(f.gates[1]))
    act(() => pickRefs([]))
    act(() => leaf(menuFor([{ kind: 'gate', id: f.gates[1] }], 'plan', null), 'select-all').onSelect())
    expect(ids(pickedRefs(), 'gate')).toEqual([])
  })

  it('dimensions: those of the level in view, not hidden', () => {
    expect(ids(selectAll({ kind: 'dimension', id: f.dim }), 'dimension')).toEqual([f.dim])
    hide(dimension(f.dim))
    act(() => pickRefs([]))
    act(() => leaf(menuFor([{ kind: 'dimension', id: f.dim }], 'plan', null), 'select-all').onSelect())
    expect(ids(pickedRefs(), 'dimension')).toEqual([])
  })

  it('existing roads: all of them together, not the hidden', () => {
    expect(ids(selectAll({ kind: 'existing-road', id: f.existing[0] }), 'existing-road')).toEqual([...f.existing, f.south].sort())
    hide(existingRoad(f.existing[1]))
    expect(ids(selectAll({ kind: 'existing-road', id: f.existing[0] }), 'existing-road')).toEqual([f.existing[0], f.south].sort())
  })

  it('existing roads: a locked one is left out too (review V2)', () => {
    act(() => s().apply((p) => actions.lockExistingRoads(p, [f.existing[1]], true)))
    expect(ids(selectAll({ kind: 'existing-road', id: f.existing[0] }), 'existing-road')).toEqual([f.existing[0], f.south].sort())
  })

  it('what it picks is one kind: nothing else stays picked', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'gate', id: f.gates[0] }]))
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }]))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'select-all').onSelect())
    expect(pickedRefs().every((r) => r.kind === 'lot')).toBe(true)
  })
})

describe('several existing roads picked', () => {
  it('pickRefs picks them all, the menu says how many, Delete removes them all in one step', () => {
    act(() => pickRefs(f.existing.map((id) => ({ kind: 'existing-road', id }))))
    expect(ids(pickedRefs(), 'existing-road')).toEqual([...f.existing].sort())
    const steps = s().history.past.length
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'delete').onSelect())
    expect(s().project.site.existingRoads!.map((r) => r.id)).toEqual([f.south])
    expect(s().history.past).toHaveLength(steps + 1)
    expect(pickedRefs()).toEqual([])
  })

  it('Hide hides every one picked', () => {
    act(() => pickRefs(f.existing.map((id) => ({ kind: 'existing-road', id }))))
    act(() => leaf(menuFor(pickedRefs(), 'plan', null), 'hide').onSelect())
    expect(useLayerView.getState().hidden.sort()).toEqual(f.existing.map(existingRoad).sort())
  })
})
