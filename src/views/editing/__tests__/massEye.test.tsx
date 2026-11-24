// Hide for one mass (Phase AS.4, Decision "One menu"; the key `mass:<id>` of views/layers/keys.ts): hidden, a mass is not drawn in the plan or the 3D, not
// picked (a click, the window, a group), not snapped to, and still counted; the entry of a mass that is gone is dropped; a mass that becomes hidden
// while it is picked is let go. `edit.hide` (Ctrl+H) hides what is picked and reads Show when it is all hidden; Select all skips the hidden.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { massDrawn, massHiddenOnPlan } from '../../buildingView.ts'
import { commandOf, runCommand } from '../../commands/index.ts'
import { mass } from '../../layers/keys.ts'
import { hiddenNow, isHidden, useLayerView } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { selectAllHere } from '../../plan/massCommands.ts'
import { letGoAll, pickedRefs, selectBox } from '../../plan/mix.ts'
import { sourcesFor } from '../../plan/snap/sources.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const hide = (...ids: string[]) => act(() => useLayerView.getState().setHidden(ids.map(mass), true))
const label = () => {
  const l = commandOf('edit.hide')!.label
  return typeof l === 'function' ? l() : l
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  letGo()
  letGoAll()
  useToast.setState({ toast: null, confirmation: null })
})

describe('a mass’s own eye', () => {
  it('its key is mass:<id>; massDrawn and massHiddenOnPlan ask it, whatever its building says, the one the plan is on included', () => {
    expect(mass('m1')).toBe('mass:m1')
    const { project, derived, level } = s()
    expect(massDrawn(derived.masses, 'm1', hiddenNow())).toBe(true)
    hide('m1')
    expect(massDrawn(derived.masses, 'm1', hiddenNow())).toBe(false)
    // the building the plan is on stays drawn when its own eye is off, but not a mass with its own eye off
    expect(massDrawn(derived.masses, 'm1', hiddenNow(), derived.masses.m1.buildingId)).toBe(false)
    expect(massHiddenOnPlan(project, level, 'm1', hiddenNow())).toBe(true)
    expect(massHiddenOnPlan(project, level, 'm2', hiddenNow())).toBe(false)
  })

  it('the plan does not draw it, and it still counts in every figure', () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-mass="m1"]')).not.toBeNull()
    const area = s().derived.masses.m1.area
    hide('m1')
    expect(container.querySelector('[data-mass="m1"]')).toBeNull()
    expect(container.querySelector('[data-mass="m2"]')).not.toBeNull()
    expect(s().derived.masses.m1.area).toBe(area)
    expect(s().project.masses.some((m) => m.id === 'm1')).toBe(true)
    act(() => useLayerView.getState().setHidden([mass('m1')], false))
    expect(container.querySelector('[data-mass="m1"]')).not.toBeNull()
  })

  it('it is not picked by the window nor Select all, not snapped to', () => {
    hide('m1')
    act(() => selectBox({ a: { x: 0, y: 0 }, b: { x: 450, y: 300 } }, false))
    expect([...s().selection.massIds].sort()).toEqual(['m2', 'm3'])
    act(() => selectAllHere())
    expect([...s().selection.massIds].sort()).toEqual(['m2', 'm3'])
    const name = s().project.masses.find((m) => m.id === 'm1')!.name
    const shown = (hiddenKeys: string[]) => {
      useLayerView.setState({ hidden: hiddenKeys })
      return sourcesFor(s().project, s().derived, null, { level: 'l1', reference: [] }).map((x) => x.label)
    }
    expect(shown([])).toContain(name)
    expect(shown([mass('m1')])).not.toContain(name)
  })

  it('a mass that becomes hidden while it is picked is let go; the others stay', () => {
    act(() => s().selectMany(['m1', 'm2']))
    hide('m1')
    expect(s().selection.massIds).toEqual(['m2'])
  })

  it('the entry of a mass that is gone is dropped, so the next one is not born hidden', () => {
    hide('m3')
    expect(isHidden(mass('m3'))).toBe(true)
    act(() => s().apply((p) => actions.removeMasses(p, ['m3'])))
    expect(isHidden(mass('m3'))).toBe(false)
  })
})

describe('Hide (Ctrl+H, Edit › Hide)', () => {
  it('has a key, Ctrl+H, and is greyed with nothing picked', () => {
    expect(commandOf('edit.hide')).toMatchObject({ key: 'Ctrl+H', menu: ['Edit'] })
    expect(commandOf('edit.hide')!.enabled!()).toBe('Pick something first')
  })

  it('hides what is picked, in one go, and lets it go; picked again from its row it reads Show', () => {
    act(() => s().selectMany(['m1', 'm2']))
    expect(label()).toBe('Hide')
    act(() => void runCommand('edit.hide'))
    expect(isHidden(mass('m1')) && isHidden(mass('m2')) && !isHidden(mass('m3'))).toBe(true)
    expect(s().selection.massIds).toEqual([])
    // a row of Layers can pick a hidden mass: Hide then reads Show, and shows it
    act(() => s().selectMany(['m1']))
    expect(pickedRefs()).toEqual([{ kind: 'mass', id: 'm1' }])
    expect(s().selection.massIds).toEqual(['m1'])
    expect(label()).toBe('Show')
    act(() => void runCommand('edit.hide'))
    expect(isHidden(mass('m1'))).toBe(false)
  })

  it('Ctrl+H does it, and says why when there is nothing to hide', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true })
    expect(useToast.getState().toast?.text).toBe('Pick something first')
    act(() => s().select('m1'))
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true })
    expect(isHidden(mass('m1'))).toBe(true)
  })
})
