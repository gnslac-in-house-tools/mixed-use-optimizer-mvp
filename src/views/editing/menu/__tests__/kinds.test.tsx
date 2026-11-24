// The menu of each of the plan's other kinds (Phase AS.4 task 4, Decision "One menu"): a street, an existing road, a gate, a lot, a dimension, a
// drawing (its file, a layer, its parcels) and the grid, each in the user's order (own · clipboard · base · Properties) with the base verbs of the plan's table
// and nothing else; several kinds only the verbs all of them take; and a right-click in the plan on a street, a lot, a gate or a dimension picks it first and
// opens it (today they have no menu of their own), the whole selection's when it was already picked.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../../../App.tsx'
import type { Ref } from '../../../../kinds/types.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useLots } from '../../../../modules/parking/views/lotState.ts'
import { vi } from 'vitest'
import { useAccess } from '../../../plan/access/accessState.ts'
import { useRoads } from '../../../plan/circulation/roadState.ts'
import { pickedRefs, pickRefs } from '../../../plan/mix.ts'
import { take } from '../../../tools/hand.ts'
import { useDrawingPick } from '../../../plan/site/drawingPick.ts'
import { useDimensions } from '../../../plan/tools/toolState.ts'
import { type Fixture, at, fixture, plan, s, start } from '../../__tests__/kindsFixture.ts'
import { menuFor } from '../build.ts'
import { leaf, rowKeyed, shape } from './helpers.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let f: Fixture
// the plan's menu has a point (where it was clicked), so Paste here is in it
const menu = (refs: Ref[]) => menuFor(refs, 'plan', { x: 0, y: 0 })
const street = (seg = 's1'): Ref => ({ kind: 'street', id: s().derived.circulation.roads.find((r) => r.kind === 'street' && r.segments?.includes(seg))!.id })

beforeEach(() => {
  f = fixture()
  start(f.project)
})

describe('each kind’s menu, in the user’s order', () => {
  it('a street: Group · Ungroup │ Equal sides │ Copy · Paste · Paste here · Delete │ Select all streets · Lock · Hide │ Properties', () => {
    expect(shape(menu([street()]))).toEqual(['Group', 'Ungroup', '|', 'Equal sides', 'Equal lanes', '|', 'Copy', 'Paste', 'Paste here', 'Delete', '|', 'Select all streets', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('an existing road: Group · Ungroup │ Equal sides · Equal lanes │ Copy · Delete │ Rename · Select all existing roads · Lock · Hide │ Properties (Phase PE.2)', () => {
    expect(shape(menu([{ kind: 'existing-road', id: f.existing[0] }]))).toEqual(['Group', 'Ungroup', '|', 'Equal sides', 'Equal lanes', '|', 'Copy', 'Paste', 'Paste here', 'Delete', '|', 'Rename', 'Select all existing roads', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a gate has no name: Delete │ Select all gates · Lock · Hide │ Properties', () => {
    expect(shape(menu([{ kind: 'gate', id: f.gates[0] }]))).toEqual(['Group', 'Ungroup', '|', 'Delete', '|', 'Select all gates', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a lot: Delete │ Rename · Select all lots · Lock · Hide │ Properties', () => {
    expect(shape(menu([{ kind: 'lot', id: f.lots[0] }]))).toEqual(['Group', 'Ungroup', '|', 'Delete', '|', 'Rename', 'Select all lots', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a dimension: Fixed length (ticked when fixed) │ Delete │ Select all dimensions · Hide │ Properties', () => {
    const one = menu([{ kind: 'dimension', id: f.dim }])
    expect(shape(one)).toEqual(['Fixed length', '|', 'Group', 'Ungroup', '|', 'Delete', '|', 'Select all dimensions', 'Hide', '|', 'Properties'])
    expect(leaf(one, 'fixed-length')).toMatchObject({ checked: false, disabled: false })
    act(() => s().apply((p) => actions.toggleDimensionLock(p, f.dim)))
    expect(leaf(menu([{ kind: 'dimension', id: f.dim }]), 'fixed-length')).toMatchObject({ checked: true })
  })

  it('Fixed length from the menu fixes the length and frees it again: one undo step each, and it is not the padlock', () => {
    const entries = menu([{ kind: 'dimension', id: f.dim }])
    act(() => leaf(entries, 'fixed-length').onSelect())
    expect(s().project.dimensions!.find((d) => d.id === f.dim)!.locked).toBe(true)
    act(() => leaf(menu([{ kind: 'dimension', id: f.dim }]), 'fixed-length').onSelect())
    expect(s().project.dimensions!.find((d) => d.id === f.dim)!.locked).toBeUndefined()
  })

  it('a drawing file: Separate layers · On top │ Remove │ Lock · Hide │ Properties; no Copy', () => {
    const file: Ref = { kind: 'drawing', id: 'a.dxf', file: 'a.dxf' }
    const p = s().project
    const withDrawing = { ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }] }] } }
    act(() => start(withDrawing))
    const entries = menu([file])
    expect(shape(entries)).toEqual(['Separate layers', 'On top', '|', 'Remove', '|', 'Lock', 'Hide', '|', 'Properties'])
    expect(rowKeyed(entries, 'copy')).toBeUndefined()
  })

  it('a drawing layer and a file’s parcels: Lock · Hide │ Properties', () => {
    const p = s().project
    start({ ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', split: true, layers: [{ name: 'WALLS', color: 1, lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }] }] } })
    expect(shape(menu([{ kind: 'drawing-layer', id: 'WALLS', file: 'a.dxf' }]))).toEqual(['Lock', 'Hide', '|', 'Properties'])
    expect(shape(menu([{ kind: 'parcels', id: 'a.dxf', file: 'a.dxf' }]))).toEqual(['Lock', 'Hide', '|', 'Properties'])
  })

  it('the grid: Restore original │ Hide │ Properties, with nothing picked', () => {
    const grid: Ref = { kind: 'grid', id: 'grid' }
    const entries = menu([grid])
    expect(shape(entries)).toEqual(['Restore original', '|', 'Hide', '|', 'Properties'])
    expect(leaf(entries, 'restore-original').disabled).toBe(false)
    expect(leaf(entries, 'hide').disabled).toBe(false)
    expect(leaf(entries, 'properties').disabled).toBe(false)
  })

  it('no leading, trailing or doubled separator, whatever kind', () => {
    const refs: Ref[][] = [
      [street()],
      [{ kind: 'existing-road', id: f.existing[0] }],
      [{ kind: 'gate', id: f.gates[0] }],
      [{ kind: 'lot', id: f.lots[0] }],
      [{ kind: 'dimension', id: f.dim }],
      [{ kind: 'grid', id: 'grid' }],
    ]
    for (const r of refs) {
      const entries = menu(r)
      expect(entries[0], r[0].kind).not.toBe('separator')
      expect(entries.at(-1), r[0].kind).not.toBe('separator')
      entries.forEach((e, i) => expect(e === 'separator' && entries[i - 1] === 'separator', r[0].kind).toBe(false))
    }
  })
})

describe('Lock and Hide read the state of what is picked', () => {
  it('Lock locks the street; its row then reads Unlock only when all its segments are locked, and Lock while some are not', () => {
    act(() => s().apply((p) => actions.lockStreets(p, ['s2'], true, 'o1')))
    // mixed: the row says Lock, and locks all
    expect(leaf(menu([street()]), 'lock')).toMatchObject({ label: 'Lock' })
    act(() => pickRefs([street()]))
    act(() => leaf(menu(pickedRefs()), 'lock').onSelect())
    expect(['s1', 's2', 's3'].every((id) => s().project.options[0].streets!.segments.find((g) => g.id === id)!.locked === true)).toBe(true)
    // the street is let go as it became locked while picked
    expect(pickedRefs()).toEqual([])
    expect(leaf(menu([street()]), 'lock')).toMatchObject({ label: 'Unlock' })
  })

  it('Hide reads Show when the street is hidden (all its segments’ keys), and Hide again shows it', () => {
    act(() => pickRefs([street()]))
    act(() => leaf(menu(pickedRefs()), 'hide').onSelect())
    expect(JSON.parse(localStorage.getItem('gfit.layers')!)[s().project.id].hidden.sort()).toEqual(['street:s1', 'street:s2', 'street:s3'])
    expect(leaf(menu([street()]), 'hide')).toMatchObject({ label: 'Show' })
    act(() => leaf(menu([street()]), 'hide').onSelect())
    expect(leaf(menu([street()]), 'hide')).toMatchObject({ label: 'Hide' })
  })
})

describe('several things picked', () => {
  it('a street and a lot: Group and Ungroup (the own verbs they share), Delete, Lock, Hide and Properties (Copy is the street’s, the lot has no Rename), no Select all', () => {
    const refs: Ref[] = [street(), { kind: 'lot', id: f.lots[0] }]
    expect(shape(menu(refs))).toEqual(['Group', 'Ungroup', '|', 'Delete 2 things', '|', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a gate and an existing road: Group, Ungroup, Delete, Lock, Hide and Properties (the road has a padlock since Phase PE.2)', () => {
    expect(shape(menu([{ kind: 'gate', id: f.gates[0] }, { kind: 'existing-road', id: f.existing[0] }]))).toEqual(['Group', 'Ungroup', '|', 'Delete 2 things', '|', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('two streets: one kind, so Select all streets stays and the clipboard is the street’s', () => {
    expect(shape(menu([street('s1'), street('s4')]))).toEqual(['Group', 'Ungroup', '|', 'Equal sides', 'Equal lanes', '|', 'Copy', 'Paste', 'Paste here', 'Delete 2 streets', '|', 'Select all streets', 'Lock', 'Hide', '|', 'Properties'])
  })

  it('a dimension and a lot: Group and Ungroup, Delete, Hide, Properties', () => {
    expect(shape(menu([{ kind: 'dimension', id: f.dim }, { kind: 'lot', id: f.lots[0] }]))).toEqual(['Group', 'Ungroup', '|', 'Delete 2 things', '|', 'Hide', '|', 'Properties'])
  })
})

describe('the plan’s right-click', () => {
  const lotPoint = () => {
    const c = s().derived.circulation.lots.find((l) => l.id === f.lots[0])!
    const xs = c.polygon.map((q) => q.x)
    const ys = c.polygon.map((q) => q.y)
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  }
  // a row with a tick (Fixed length, On top) is a menuitemcheckbox
  const labels = () => [...screen.getByRole('menu').querySelectorAll('[role^="menuitem"]')].map((b) => b.querySelector('span')!.textContent)

  it('on a street it picks the street and opens its menu', () => {
    render(<App />)
    const road = document.querySelector('[data-road="street:s1"]')!
    fireEvent.contextMenu(road, at({ x: 60, y: 235 }, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'street', id: 'street:s1' }])
    expect(labels()).toEqual(['Group', 'Ungroup', 'Equal sides', 'Equal lanes', 'Copy', 'Paste', 'Paste here', 'Delete', 'Select all streets', 'Lock', 'Hide', 'Properties'])
  })

  it('on a lot it picks the lot and opens its menu', () => {
    render(<App />)
    fireEvent.contextMenu(document.querySelector(`[data-lot="${f.lots[0]}"]`)!, at(lotPoint(), { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[0] }])
    expect(labels()).toEqual(['Group', 'Ungroup', 'Delete', 'Rename', 'Select all lots', 'Lock', 'Hide', 'Properties'])
  })

  it('on a gate it picks the gate and opens its menu', () => {
    render(<App />)
    const handle = document.querySelector(`[data-gate="${f.gates[0]}"] [data-handle]`)!
    const g = s().derived.circulation.gates.find((x) => x.id === f.gates[0])!
    fireEvent.contextMenu(handle, at(g.at, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'gate', id: f.gates[0] }])
    expect(labels()).toEqual(['Group', 'Ungroup', 'Delete', 'Select all gates', 'Lock', 'Hide', 'Properties'])
  })

  it('on a dimension it picks it and opens its menu', () => {
    render(<App />)
    fireEvent.contextMenu(document.querySelector(`[data-dimension="${f.dim}"]`)!, at({ x: 80, y: 68 }, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'dimension', id: f.dim }])
    expect(labels()).toEqual(['Fixed length', 'Group', 'Ungroup', 'Delete', 'Select all dimensions', 'Hide', 'Properties'])
  })

  it('with other things picked and the click on one of them, the menu is of the whole selection', () => {
    render(<App />)
    act(() => pickRefs([street(), { kind: 'lot', id: f.lots[0] }]))
    fireEvent.contextMenu(document.querySelector(`[data-lot="${f.lots[0]}"]`)!, at(lotPoint(), { button: 2 }))
    expect(pickedRefs()).toHaveLength(2)
    expect(labels()).toEqual(['Group', 'Ungroup', 'Delete 2 things', 'Lock', 'Hide', 'Properties'])
  })

  it('on a thing not picked while others are, it picks that one alone', () => {
    render(<App />)
    act(() => pickRefs([{ kind: 'gate', id: f.gates[0] }]))
    fireEvent.contextMenu(document.querySelector(`[data-lot="${f.lots[1]}"]`)!, at({ x: 300, y: 205 }, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'lot', id: f.lots[1] }])
  })

  it('on a drawing’s line it picks the file and opens its menu; on empty ground, the menu of what is picked', () => {
    const p = s().project
    act(() => start({ ...p, site: { ...p.site, drawings: [{ file: 'a.dxf', layers: [{ name: 'WALLS', color: 1, lines: [{ points: [{ x: 10, y: 190 }, { x: 90, y: 190 }] }] }] }] } }))
    render(<App />)
    fireEvent.contextMenu(plan(), at({ x: 50, y: 190 }, { button: 2 }))
    expect(pickedRefs()).toEqual([{ kind: 'drawing', id: 'a.dxf', file: 'a.dxf' }])
    expect(labels()).toEqual(['Separate layers', 'On top', 'Remove', 'Lock', 'Hide', 'Properties'])
  })

  it('the grid tool’s handle opens the grid’s menu: Restore original is its row, and it restores', () => {
    act(() => take('grid'))
    render(<App />)
    fireEvent.contextMenu(document.querySelector('[data-handle="grid-move"]')!, at({ x: 10, y: 10 }, { button: 2 }))
    expect(labels()).toEqual(['Restore original', 'Hide', 'Properties'])
  })
})

describe('pickRefs with the other kinds', () => {
  it('picks an existing road, a gate and a lot together as the stores hold them', () => {
    act(() => pickRefs([{ kind: 'existing-road', id: f.existing[0] }, { kind: 'existing-road', id: f.existing[1] }, { kind: 'lot', id: f.lots[0] }]))
    expect(pickedRefs().filter((r) => r.kind === 'existing-road').map((r) => r.id).sort()).toEqual([...f.existing].sort())
    expect(pickedRefs().filter((r) => r.kind === 'lot')).toHaveLength(1)
    expect(useAccess.getState().picked).not.toBeNull()
    expect(useRoads.getState().picked).toBeNull()
    expect(useLots.getState().picked).toBe(f.lots[0])
    expect(useDimensions.getState().selected).toBeNull()
    expect(useDrawingPick.getState().picked).toEqual([])
  })
})
