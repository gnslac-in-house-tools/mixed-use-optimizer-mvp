// What the plan's other kinds' menu rows do (Phase AS.4 task 4): the grid's Restore original, Hide and Properties (it is not picked: the handle's right-click opens the grid's own menu), a drawing
// file's Separate layers, On top, Lock, Hide and Remove, and Delete of several things in one undo step (a street's node picked alone still goes alone).
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gridOf } from '../../../engine/grid/index.ts'
import type { Ref } from '../../../kinds/types.ts'
import { actions } from '../../../state/actions/index.ts'
import { commandOf } from '../../commands/index.ts'
import { drawingLayer, parcel } from '../../layers/keys.ts'
import { hiddenNow, useLayerView } from '../../layers/layerView.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { useUi } from '../../layout/ui.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { pickedRefs, pickRefs } from '../../plan/mix.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import { DEFAULT_SNAP } from '../../plan/snap/kinds.ts'
import { menuFor } from '../menu/build.ts'
import { leaf } from '../menu/__tests__/helpers.ts'
import { type Fixture, fixture, lockStreets, s, start } from './kindsFixture.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
const menu = (refs: Ref[]) => menuFor(refs, 'plan', null)
const FILE: Ref = { kind: 'drawing', id: 'a.dxf', file: 'a.dxf' }
const line = { points: [{ x: 10, y: 190 }, { x: 90, y: 190 }] }

beforeEach(() => {
  f = fixture()
  start(f.project)
})

describe('the grid’s menu', () => {
  const grid: Ref = { kind: 'grid', id: 'grid' }

  it('Restore original puts the grid back along the site’s main axis, one undo step', () => {
    act(() => s().apply((p) => actions.updateGrid(p, 'o1', { angle: 33 })))
    expect(gridOf(s().project, 'o1')!.angle).toBe(33)
    const steps = s().history.past.length
    act(() => leaf(menu([grid]), 'restore-original').onSelect())
    expect(gridOf(s().project, 'o1')!.angle).not.toBe(33)
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('Hide is the snap’s Grid switch (its eye): the row reads Hide while the grid is on and Show while it is off', () => {
    act(() => useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, grid: true } }))
    expect(leaf(menu([grid]), 'hide').label).toBe('Hide')
    act(() => leaf(menu([grid]), 'hide').onSelect())
    expect(useSnapSettings.getState().settings.grid).toBe(false)
    expect(leaf(menu([grid]), 'hide').label).toBe('Show')
    act(() => leaf(menu([grid]), 'hide').onSelect())
    expect(useSnapSettings.getState().settings.grid).toBe(true)
  })

  it('Properties shows the Grid row of Layers in the Properties tab', () => {
    act(() => useUi.setState({ rail: 'layers' }))
    act(() => leaf(menu([grid]), 'properties').onSelect())
    expect(useUi.getState().rail).toBe('properties')
    expect(useLayerPick.getState().keys).toEqual(['grid'])
  })
})

describe('a drawing file’s menu', () => {
  beforeEach(() => {
    const p = s().project
    start({
      ...p,
      site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [line] }] }], parcels: [{ name: 'P1', file: 'a.dxf', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 20, y: 0, r: 0 }, { x: 20, y: 20, r: 0 }] } }] },
    })
    act(() => pickRefs([FILE]))
  })

  it('Separate layers and Join layers: the file is separated, and the row reads Join', () => {
    act(() => leaf(menu(pickedRefs()), 'split-layers').onSelect())
    expect(s().project.site.drawings![0].split).toBe(true)
    expect(leaf(menu([FILE]), 'split-layers').label).toBe('Join layers')
    act(() => leaf(menu([FILE]), 'split-layers').onSelect())
    expect(s().project.site.drawings![0].split).toBeFalsy()
  })

  it('On top draws its layers and parcels over the model, ticked while they are', () => {
    expect(leaf(menu([FILE]), 'on-top')).toMatchObject({ checked: false })
    act(() => leaf(menu([FILE]), 'on-top').onSelect())
    expect(useLayerView.getState().onTop.sort()).toEqual([drawingLayer('a.dxf', 'WALLS'), parcel('P1', 'a.dxf')].sort())
    expect(leaf(menu([FILE]), 'on-top')).toMatchObject({ checked: true })
  })

  it('Lock locks every layer and the parcels, and reads Unlock; Hide hides their keys', () => {
    act(() => leaf(menu([FILE]), 'lock').onSelect())
    expect(s().project.site.drawings![0].layers[0].locked).toBe(true)
    expect(leaf(menu([FILE]), 'lock').label).toBe('Unlock')
    act(() => leaf(menu([FILE]), 'hide').onSelect())
    expect([...hiddenNow()].sort()).toEqual([drawingLayer('a.dxf', 'WALLS'), parcel('P1', 'a.dxf')].sort())
    expect(leaf(menu([FILE]), 'hide').label).toBe('Show')
  })

  it('Remove, in Delete’s place, takes the file out of the site', () => {
    expect(leaf(menu([FILE]), 'delete')).toMatchObject({ label: 'Remove', disabled: false })
    act(() => leaf(menu([FILE]), 'delete').onSelect())
    expect(s().project.site.drawings ?? []).toHaveLength(0)
  })
})

describe('Delete of several things', () => {
  it('a lot, a gate and a dimension go in one undo step', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'gate', id: f.gates[1] }, { kind: 'dimension', id: f.dim }]))
    const steps = s().history.past.length
    act(() => leaf(menu(pickedRefs()), 'delete').onSelect())
    expect(s().project.options[0].lots!.map((l) => l.id)).toEqual([f.lots[1]])
    expect(s().derived.circulation.gates.map((g) => g.id)).not.toContain(f.gates[1])
    expect(s().project.dimensions ?? []).toHaveLength(0)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(pickedRefs()).toEqual([])
  })

  it('two existing roads and a lot go in one undo step (the access store holds the first and those beside it)', () => {
    act(() => pickRefs([{ kind: 'existing-road', id: f.existing[1] }, { kind: 'existing-road', id: f.existing[0] }, { kind: 'lot', id: f.lots[1] }]))
    expect(pickedRefs()).toHaveLength(3)
    const steps = s().history.past.length
    act(() => leaf(menu(pickedRefs()), 'delete').onSelect())
    expect(s().project.site.existingRoads!.map((x) => x.id)).toEqual([f.south])
    expect(s().project.options[0].lots!.map((l) => l.id)).toEqual([f.lots[0]])
    expect(s().history.past).toHaveLength(steps + 1)
  })

  it('every street picked goes, by all its segments', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }, { kind: 'street', id: 'street:s4' }]))
    act(() => leaf(menu(pickedRefs()), 'delete').onSelect())
    expect(s().project.options[0].streets?.segments ?? []).toHaveLength(0)
  })

  it('a street with a locked segment is held back whole, with the reason; a free node of it picked alone goes', () => {
    act(() => lockStreets(['s2']))
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    expect(String(commandOf('edit.delete')!.enabled!())).toBe('A street with a locked segment: unlock first')
    // the free end n4 picked alone (its dot clicked): it goes with the free stretch s3, the locked one stays
    act(() => useRoads.getState().pickNode('n4'))
    expect(commandOf('edit.delete')!.enabled!()).toBe(true)
    act(() => leaf(menu(pickedRefs()), 'delete').onSelect())
    expect(s().project.options[0].streets!.segments.map((g) => g.id).sort()).toEqual(['s1', 's2', 's4'])
  })
})
