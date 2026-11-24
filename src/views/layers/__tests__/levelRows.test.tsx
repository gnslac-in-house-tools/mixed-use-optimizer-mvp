// The levels in the Layers tree (Phase AS.3, task 6): what the Levels tab's list did (Decisions "Levels tab", "Levels of the site",
// "Lists select in runs"; a Parameters rail tab until the tabs went) is the levels of a building's row now: highest first, each with
// its name, ×N floors and its elevation as the quiet word after it; a click goes to that level; Shift picks a run, Ctrl one more; the
// right-click menu acts on what is picked: Go to it, Delete level or *Delete N levels* (with their masses, after asking; a building
// keeps one level at least; one undo step). Let go on purpose: the tab's thumbnail of each level and its *Building* filter (the tree
// folds a building).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Project } from '../../../model/schema.ts'
import { addLevelAtEnd, updateLevel } from '../../../state/actions/levels.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { letGo } from '../../tools/hand.ts'
import { useLayerPick } from '../layerPick.ts'
import { useLayerView } from '../layerView.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
/** The demo's building: L1 (the demo's masses), L2 (m4), then L3 and L4, a mass each (a level stands where a mass does). */
function fourLevels(): Project {
  let p = demoProject()
  for (let i = 0; i < 3; i++) {
    const up = addLevelAtEnd(p, 'above')
    p = addMass(up.project, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 20 + i, depth: 20, rotation: 0 }, levelId: up.id }).project
  }
  return p
}
const levels = () => s().project.buildings[0].levels

const tree = () => screen.getByRole('tree', { name: 'Layers' })
const item = (name: string): HTMLElement => within(tree()).getByRole('treeitem', { name })
const click = (name: string, extra: object = {}) => fireEvent.click(item(name).querySelector<HTMLElement>('[data-row-pick]')!, extra)
const menuOf = (name: string) => {
  fireEvent.contextMenu(item(name))
  return screen.getByRole('menu')
}
const rowsOf = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((r) => r.textContent)
const picked = (name: string) => item(name).getAttribute('aria-selected') === 'true'

function start(p: Project) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  render(<App />)
  fireEvent.click(within(item('Building 1')).getByRole('button', { name: 'Unfold Building 1' }))
}

beforeEach(() => {
  localStorage.clear()
  letGo()
  useLayerView.setState({ hidden: [], onTop: [], folded: [] })
  useLayerPick.setState({ keys: [] })
  useToast.setState({ toast: null, confirmation: null })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
})

describe('a building’s levels', () => {
  it('each a row, highest first, with its elevation; a click goes to that level and marks it; no + anywhere (Decision "Levels follow the masses")', () => {
    start(fourLevels())
    const rows = within(item('Building 1').parentElement!)
      .getAllByRole('treeitem')
      .filter((r) => r.getAttribute('aria-level') === '3')
      .map((r) => r.getAttribute('aria-label'))
    expect(rows).toEqual(['L4', 'L3', 'L2', 'L1'])
    expect(item('L2')).toHaveTextContent('12 m')
    expect(item('L1')).toHaveTextContent('0 m')
    expect(item('L1')).toHaveAttribute('aria-current', 'true')
    click('L3')
    expect(s().level).toBe(levels().find((l) => l.name === 'L3')!.id)
    expect(item('L3')).toHaveAttribute('aria-current', 'true')
    expect(within(tree()).queryByRole('button', { name: /^\+ / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Levels…' })).toBeNull()
  })

  it('a ×N level says so in its name', () => {
    const p = fourLevels()
    start({ ...p, buildings: p.buildings.map((b) => ({ ...b, levels: b.levels.map((l) => (l.name === 'L2' ? { ...l, repeat: 4 } : l)) })) })
    expect(item('L2 ×4')).toBeInTheDocument()
  })
})

describe('several levels picked (Decision "Lists select in runs")', () => {
  it('Shift picks a run, Ctrl one more; the menu acts on what is picked: Delete N levels, their masses after asking; one undo step', () => {
    start(fourLevels())
    click('L4')
    expect(s().level).toBe(levels().find((l) => l.name === 'L4')!.id)
    click('L2', { shiftKey: true })
    expect(['L4', 'L3', 'L2'].map(picked)).toEqual([true, true, true])
    click('L3', { ctrlKey: true })
    expect(['L4', 'L3', 'L2'].map(picked)).toEqual([true, false, true])
    // the menu acts on what is picked: L4 and L2 (a mass each) — asks first, then both go with their masses
    const menu = menuOf('L4')
    // Delete, then Rename (one at a time: off), Lock and Properties; Go to is for one level
    expect(rowsOf(menu)).toEqual(['Delete 2 levels2 masses', 'RenameF2', 'LockCtrl+Shift+L', 'Properties'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete 2 levels/ }))
    expect(levels()).toHaveLength(4)
    expect(useToast.getState().confirmation?.text).toBe('Delete these 2 levels and their 2 masses?')
    act(() => useToast.getState().confirmation!.onContinue())
    expect(levels().map((l) => l.name)).toEqual(['L1', 'L3'])
    expect(s().project.masses.some((m) => m.id === 'm4')).toBe(false)
    // one undo step brings them back
    act(() => s().undo())
    expect(levels()).toHaveLength(4)
  })

  it('every level of the building: refused, with the reason; a right-click on one not picked picks it alone', () => {
    start(fourLevels())
    click('L1')
    click('L4', { shiftKey: true })
    const all = within(menuOf('L4')).getByRole('menuitem', { name: /Delete 4 levels/ })
    expect(all).toBeDisabled()
    expect(all).toHaveAttribute('title', 'Building 1 keeps one level at least')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(levels()).toHaveLength(4)
    // one that is not picked: the menu picks it alone (and it is its own menu: Go to · Delete level · Rename · Lock · Properties)
    click('L1')
    const solo = menuOf('L3')
    expect(rowsOf(solo)).toEqual(['Go to L3', 'Delete level1 mass', 'RenameF2', 'LockCtrl+Shift+L', 'Properties'])
    expect(picked('L3')).toBe(true)
    expect(picked('L1')).toBe(false)
    fireEvent.click(within(solo).getByRole('menuitem', { name: 'Go to L3' }))
    expect(s().level).toBe(levels().find((l) => l.name === 'L3')!.id)
  })

  it('a level with no masses goes at once, with no question', () => {
    const up = addLevelAtEnd(demoProject(), 'above')
    const p = updateLevel(up.project, up.id, { repeat: 2 })
    start(p)
    fireEvent.click(within(menuOf('L2 ×2')).getByRole('menuitem', { name: 'Delete level' }))
    expect(useToast.getState().confirmation).toBeNull()
    expect(levels().map((l) => l.name)).toEqual(['L1'])
  })
})
