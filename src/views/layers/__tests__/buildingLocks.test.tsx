// A locked building holds its masses as locked masses everywhere (Phase AS.4 task 2, Decision "Padlocks by kind"): the plan does not pick
// them (a click, Shift+click, the window, Select all, a right-click show the notice and open no menu), a drag does not start, the
// helpers every view asks (`isMassLocked`, `lockedAmong`, `pickUnlocked`) say so, Properties reads it, and the Layers tree shows the
// masses and their rows locked. The building's own padlock and its row are task 5's; this is the masses.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useLayerView } from '../layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../../plan/camera.ts'
import { selectAllHere, pickOnPlan } from '../../plan/massCommands.ts'
import { pickedNow, selectBox } from '../../plan/mix.ts'
import { useDimensions } from '../../plan/tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'
import { isMassLocked, lockedAmong, pickUnlocked } from '../locks.ts'
import { flatRows, layerTree } from '../tree.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const toast = () => useToast.getState().toast?.text
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1, ...extra })
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const massEl = (id: string) => (document.querySelector(`[data-mass="${id}"]`) ?? document.querySelector(`[data-other-mass="${id}"]`))!
const centreOf = (id: string): Point => centroid(s().derived.masses[id].polygon)

/** The demo with m1 in a second building, "Annex", that is locked (m1 itself carries no flag). */
function start(): Project {
  let p = demoProject()
  const made = actions.addBuilding(p, { name: 'Annex', optionId: 'o1' })
  p = actions.assignMasses(made.project, ['m1'], made.id)
  p = actions.lockBuildings(p, [made.id], true)
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useToast.setState({ toast: null, confirmation: null })
  return p
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
})
afterEach(() => letGo())

describe('a mass in a locked building', () => {
  it('is locked for every view helper, with no flag of its own', () => {
    const p = start()
    expect(p.masses.find((m) => m.id === 'm1')!.locked).toBeUndefined()
    expect(isMassLocked('m1')).toBe(true)
    expect(isMassLocked('m2')).toBe(false)
    expect(lockedAmong(['m1', 'm2']).map((m) => m.id)).toEqual(['m1'])
    expect(pickUnlocked(['m1', 'm2'])).toEqual(['m2'])
    expect(pickUnlocked(['m1'])).toEqual([])
    expect(toast()).toBe(LOCKED)
  })

  it('on the plan: a click picks nothing and shows the notice; the others are picked as ever', () => {
    start()
    render(<App />)
    press(massEl('m1'), centreOf('m1'))
    expect(pickedNow().masses).toEqual([])
    expect(toast()).toBe(LOCKED)
    useToast.setState({ toast: null })
    press(massEl('m2'), centreOf('m2'))
    expect(pickedNow().masses).toEqual(['m2'])
  })

  it('Shift+click, the window and Select all skip it; a right-click opens no menu', () => {
    start()
    render(<App />)
    act(() => pickOnPlan('m2'))
    press(massEl('m1'), centreOf('m1'), { shiftKey: true })
    expect(pickedNow().masses).toEqual(['m2'])
    act(() => letGo())
    act(() => selectBox({ a: { x: -50, y: -50 }, b: { x: 500, y: 350 } }, false))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    act(() => letGo())
    act(() => selectAllHere())
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    act(() => letGo())
    fireEvent.contextMenu(massEl('m1'), at(centreOf('m1')))
    expect(pickedNow().masses.sort()).toEqual(['m2', 'm3'])
    expect(toast()).toBe(LOCKED)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('its verbs are held: updateMass skips its name, and settle refuses a move', () => {
    const p = start()
    expect(actions.updateMass(p, 'm1', { name: 'Other' })).toBe(p)
    const store = useApp.getState()
    const before = store.project
    store.apply((q) => actions.moveMass(q, 'm1', { x: 5, y: 0 }))
    expect(useApp.getState().project).toBe(before)
    expect(useApp.getState().refusal?.text).toMatch(/is locked/)
  })

  it('the Layers tree shows the masses locked, their level and the building', () => {
    const p = start()
    const rows = flatRows(layerTree(p, 'o1', derive(p, 'o1'), { terrain: true, parking: true }))
    expect(rows.find((r) => r.id === 'mass:m1')!.lock).toBe('locked')
    expect(rows.find((r) => r.id === 'mass:m2')!.lock).toBe('unlocked')
    const annex = p.buildings.find((b) => b.name === 'Annex')!
    expect(rows.find((r) => r.id === 'building:' + annex.id)!.lock).toBe('locked')
    expect(rows.find((r) => r.id === 'building:b1')!.lock).not.toBe('locked')
  })
})
