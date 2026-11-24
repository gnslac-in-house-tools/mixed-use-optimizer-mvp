// Hide for one object (Phase AS.4 task 4, Decision "Hide for one object"): the keys `street:<segment id>` (a street hides all its segments' keys and is hidden when all
// are) and `dimension:<id>` beside the existing gate, lot and existing road keys; `isObjectHidden` is the one rule. Hidden, an object is not drawn in the plan
// or the 3D, not picked (click, window), not snapped to, its street parking is not drawn, and it still counts (the derived figures never read this store); the entry of
// an object that is gone is dropped; something hidden while picked is let go. `edit.hide` (Ctrl+H) and the menu's Hide are the same verb.
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { setStreetParking } from '../../../modules/parking/actions.ts'
import { actions } from '../../../state/actions/index.ts'
import { runCommand } from '../../commands/index.ts'
import { dimension, DIMENSIONS, gate, isObjectHidden, isStreetHidden, lot, roadHidden, shownStalls, STREETS, street } from '../../layers/keys.ts'
import { hiddenNow, useLayerView } from '../../layers/layerView.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { pickedNow, pickedRefs, pickRefs, selectBox } from '../../plan/mix.ts'
import { roadSources } from '../../plan/snap/sources.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { pavingOf } from '../../scene/Paving.tsx'
import { type Fixture, fixture, roadOf, s, start, WHOLE } from './kindsFixture.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
const hide = (...keys: string[]) => act(() => useLayerView.getState().setHidden(keys, true))
const q = (selector: string) => document.querySelectorAll(selector)
const run = (id: string) => act(() => void runCommand(id))

beforeEach(() => {
  f = fixture()
  start(f.project)
})

describe('the keys and the one rule', () => {
  it('street:<segment id> and dimension:<id>', () => {
    expect(street('s1')).toBe('street:s1')
    expect(dimension('d1')).toBe('dimension:d1')
  })

  it('isObjectHidden: a dimension by its kind’s key or its own; a street segment by Streets or its own key', () => {
    expect(isObjectHidden(new Set([DIMENSIONS]), 'dimension', 'd1')).toBe(true)
    expect(isObjectHidden(new Set([dimension('d1')]), 'dimension', 'd1')).toBe(true)
    expect(isObjectHidden(new Set([dimension('d1')]), 'dimension', 'd2')).toBe(false)
    expect(isObjectHidden(new Set([STREETS]), 'street', 's1')).toBe(true)
    expect(isObjectHidden(new Set([street('s1')]), 'street', 's1')).toBe(true)
    expect(isObjectHidden(new Set([street('s1')]), 'street', 's2')).toBe(false)
    expect(isObjectHidden(new Set([lot('s1'), gate('s1')]), 'street', 's1')).toBe(false)
  })

  it('a street is hidden when all its segments are, not when some are', () => {
    expect(isStreetHidden(new Set([street('s1'), street('s2'), street('s3')]), ['s1', 's2', 's3'])).toBe(true)
    expect(isStreetHidden(new Set([street('s1'), street('s3')]), ['s1', 's2', 's3'])).toBe(false)
    expect(isStreetHidden(new Set([STREETS]), ['s1', 's2', 's3'])).toBe(true)
    expect(isStreetHidden(new Set(), [])).toBe(false)
    expect(roadHidden(new Set([street('s4')]), roadOf('s4'))).toBe(true)
    expect(roadHidden(new Set([street('s4')]), roadOf('s1'))).toBe(false)
  })
})

describe('Hide from the menu’s verb and Ctrl+H', () => {
  it('a street hides all its segments’ keys; the second press shows it', () => {
    act(() => pickRefs([{ kind: 'street', id: 'street:s1' }]))
    run('edit.hide')
    expect([...hiddenNow()].sort()).toEqual(['street:s1', 'street:s2', 'street:s3'])
    // it was let go as it was hidden while picked
    expect(pickedRefs()).toEqual([])
    act(() => pickRefs([{ kind: 'street', id: 'street:s4' }]))
    run('edit.hide')
    expect(hiddenNow().has('street:s4')).toBe(true)
  })

  it('a gate, a lot, an existing road and a dimension take their own keys', () => {
    const keys = (kind: string, id: string) => {
      act(() => pickRefs([{ kind, id }]))
      run('edit.hide')
      return [...hiddenNow()]
    }
    expect(keys('gate', f.gates[0])).toContain(`gate:${f.gates[0]}`)
    expect(keys('lot', f.lots[0])).toContain(`lot:${f.lots[0]}`)
    expect(keys('existing-road', f.existing[0])).toContain(`existing-road:${f.existing[0]}`)
    expect(keys('dimension', f.dim)).toContain(`dimension:${f.dim}`)
  })

  it('what is hidden while it is picked is let go, of every kind', () => {
    act(() => pickRefs([{ kind: 'lot', id: f.lots[0] }, { kind: 'gate', id: f.gates[0] }, { kind: 'dimension', id: f.dim }]))
    run('edit.hide')
    expect(pickedRefs()).toEqual([])
    expect(useAccess.getState().picked).toBeNull()
    expect(useDimensions.getState().selected).toBeNull()
  })

  it('a hidden dimension on the picks: the window skips it, a show brings it back', () => {
    hide(dimension(f.dim))
    selectBox(WHOLE, false)
    expect(pickedNow().dimensions).toEqual([])
    act(() => useLayerView.getState().setHidden([dimension(f.dim)], false))
    selectBox(WHOLE, false)
    expect(pickedNow().dimensions).toEqual([f.dim])
  })
})

describe('what a hidden street, and a hidden dimension, are to every reader', () => {
  it('the plan does not draw the street or the dimension; a street with some segments hidden is still drawn', () => {
    render(<App />)
    expect(q('[data-road="street:s1"]')).toHaveLength(1)
    hide(street('s2'))
    expect(q('[data-road="street:s1"]')).toHaveLength(1)
    hide(street('s1'), street('s3'))
    expect(q('[data-road="street:s1"]')).toHaveLength(0)
    expect(q('[data-road="street:s4"]')).toHaveLength(1)
    expect(q(`[data-dimension="${f.dim}"]`)).toHaveLength(1)
    hide(dimension(f.dim))
    expect(q(`[data-dimension="${f.dim}"]`)).toHaveLength(0)
  })

  it('the window pick skips a hidden street; a click on where it was is the background’s', () => {
    hide(street('s4'))
    selectBox(WHOLE, false)
    expect(pickedNow().nodes.sort()).toEqual(['n1', 'n2', 'n3', 'n4'])
  })

  it('what is hidden and picked is let go (a street picked, then hidden)', () => {
    act(() => useRoads.getState().pick('street:s1'))
    hide(street('s1'), street('s2'), street('s3'))
    expect(useRoads.getState().picked).toBeNull()
  })

  it('the snap does not see a hidden street (its line, its edges, its nodes)', () => {
    const labels = () => roadSources(s().derived).filter((x) => x.label.startsWith('street')).length
    const all = labels()
    hide(street('s4'))
    expect(labels()).toBeLessThan(all)
    hide(street('s1'), street('s2'), street('s3'))
    expect(labels()).toBe(0)
  })

  it('the 3D’s paving leaves a hidden street out and keeps the others', () => {
    const c = s().derived.circulation
    const all = pavingOf(c, new Set()).byHand.length
    expect(pavingOf(c, new Set([street('s4')])).byHand.length).toBeLessThan(all)
    expect(pavingOf(c, new Set([street('s1'), street('s2'), street('s3'), street('s4')])).byHand.length).toBeLessThan(pavingOf(c, new Set([street('s4')])).byHand.length)
    // only some segments hidden: the street stays in the paving
    expect(pavingOf(c, new Set([street('s2')])).byHand.length).toBe(all)
  })

  it('it is still counted: the figures and the derived result do not read the eyes', () => {
    const before = s().derived
    hide(street('s1'), street('s2'), street('s3'), street('s4'), dimension(f.dim))
    expect(s().derived).toBe(before)
    expect(derive(s().project, 'o1').circulation.totals).toEqual(before.circulation.totals)
    expect(s().project.dimensions).toHaveLength(1)
    expect(s().project.options[0].streets!.segments).toHaveLength(4)
  })
})

describe('the street parking of a hidden street', () => {
  beforeEach(() => {
    // the second street for cars, stalls on both sides
    const p = actions.setStreetSegmentType(s().project, 'o1', ['s4'], 'cars')
    start(setStreetParking(p, 'o1', { s4: 'both' }))
  })

  it('each stall says which street it stands along, and a hidden street’s are not shown', () => {
    const c = s().derived.circulation
    expect(c.stalls.length).toBeGreaterThan(0)
    expect(c.stallRoads).toHaveLength(c.stalls.length)
    expect(new Set(c.stallRoads)).toEqual(new Set(['street:s4']))
    expect(shownStalls(c, new Set())).toHaveLength(c.stalls.length)
    expect(shownStalls(c, new Set([street('s4')]))).toHaveLength(0)
    expect(shownStalls(c, new Set([STREETS]))).toHaveLength(0)
  })

  it('the plan’s stalls and the 3D’s follow, and the count stays', () => {
    render(<App />)
    const n = s().derived.circulation.stalls.length
    expect(document.querySelector('[data-layer="stalls"]')?.getAttribute('data-stalls')).toBe(String(n))
    hide(street('s4'))
    expect(document.querySelector('[data-layer="stalls"]')).toBeNull()
    expect(pavingOf(s().derived.circulation, hiddenNow()).stalls).toHaveLength(0)
    expect(s().derived.circulation.stalls).toHaveLength(n)
  })
})

describe('an object that is gone drops its entry', () => {
  it('a street segment removed, a dimension removed', () => {
    hide(street('s4'), street('s1'), dimension(f.dim))
    act(() => s().apply((p) => actions.removeStreetSegment(p, 'o1', 's4')))
    expect(hiddenNow().has('street:s4')).toBe(false)
    expect(hiddenNow().has('street:s1')).toBe(true)
    act(() => s().apply((p) => actions.removeDimension(p, f.dim)))
    expect(hiddenNow().has(`dimension:${f.dim}`)).toBe(false)
  })

})
