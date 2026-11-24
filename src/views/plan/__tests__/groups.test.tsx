// The plan's right-click menu and groups of masses (Decisions "Plan menu" and "Groups", then "One menu"): the menu is the kind's, in the
// user's order (its own verbs, the clipboard, Rename · Select all · Lock · Hide, Properties), what the selection cannot do greyed out with its reason; Group on two or more, Ungroup on a group; a
// click picks a group whole, Alt+click one of its masses; the window takes whole groups; Delete leaves no group of one;
// copies of a group are a group of their own; Ctrl+G and Ctrl+Shift+G.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { groupMembers, oneGroup, withGroups } from '../../../engine/groups.ts'
import { groupMasses, ungroupMasses } from '../../../state/actions/groups.ts'
import { removeMasses } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { useClipboard } from '../clipboard.ts'
import { contentBounds } from '../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const s = () => useApp.getState()
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const selected = () => [...s().selection.massIds].sort()
const groupOf = (id: string) => s().project.masses.find((m) => m.id === id)!.group
/** Right-click on an element (a mass, or the plan), as the browser sends it. */
const rightClick = (el: Element, q: Point, extra: object = {}) => fireEvent.contextMenu(el, { ...at(q, extra), button: 2 })
const menu = () => screen.getAllByRole('menu')[0]
/** A menu item by its label (its shortcut aside: Paste is not Paste here). */
const item = (name: string) => within(menu()).getAllByRole('menuitem').find((b) => b.querySelector('span')!.textContent === name)!
/** An item of a sub-menu that is open (*To building ▸*, *Program ▸*), by its label. */
const subItem = (menuName: string, name: string) => within(screen.getByRole('menu', { name: menuName })).getAllByRole('menuitem').find((b) => b.querySelector('span')!.textContent === name)!

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useToast.setState({ toast: null, confirmation: null })
})

describe('groups, as verbs (Decision "Groups")', () => {
  it('two or more become one; the groups they were in join it; ungroup undoes every member; a group of one is none', () => {
    const p = demoProject()
    expect(groupMasses(p, ['m1'])).toBeNull()
    const a = groupMasses(p, ['m1', 'm2'])!
    expect(a.id).toBe('g1')
    expect(groupMembers(a.project, 'm2')).toEqual(['m1', 'm2'])
    expect(oneGroup(a.project, ['m2', 'm1'])).toBe(true)
    expect(withGroups(a.project, ['m1', 'm3'])).toEqual(['m1', 'm2', 'm3'])
    // the office joins: the warehouses' group comes whole
    const b = groupMasses(a.project, ['m3', 'm1'])!
    expect(b.project.masses.map((m) => m.group)).toEqual(['g2', 'g2', 'g2'])
    expect(ungroupMasses(b.project, ['m3']).masses.every((m) => m.group === undefined)).toBe(true)
    expect(ungroupMasses(p, ['m1'])).toBe(p)
    // a member deleted leaves the other alone: no group of one
    expect(removeMasses(a.project, ['m2']).masses.find((m) => m.id === 'm1')!.group).toBeUndefined()
  })
})

describe('the plan’s right-click menu (Decision "Plan menu")', () => {
  it('on a mass: picks it; every item there, Group and Paste greyed out with their reasons', () => {
    render(<App />)
    rightClick(mass('m3'), { x: 120, y: 200 })
    expect(selected()).toEqual(['m3'])
    const names = within(menu())
      .getAllByRole('menuitem')
      .map((b) => b.querySelector('span')!.textContent)
    // the demo stands on its grid (Decision "Grid always"): bay line K runs through the office
    expect(names).toEqual(['Group', 'Ungroup', 'Union', 'Rotate 90°', 'Split at line K', 'To building', 'Program', 'Copy', 'Paste', 'Paste here', 'Duplicate', 'Delete', 'Rename', 'Select all blocks', 'Lock', 'Hide', 'Properties'])
    // the four parts: own verbs, the clipboard, Rename · Select all · Lock · Hide, Properties alone and last (a separator between them)
    expect(within(menu()).getAllByRole('separator').length).toBeGreaterThanOrEqual(5)
    expect(item('Group')).toBeDisabled()
    expect(item('Group')).toHaveAttribute('title', 'Select two or more masses to group them')
    expect(item('Ungroup')).toBeDisabled()
    expect(item('Union')).toHaveAttribute('title', 'Select two or more blocks that touch to merge them')
    expect(item('Paste')).toBeDisabled()
    expect(item('Paste here')).toBeDisabled()
    expect(item('Copy')).toBeEnabled()
    fireEvent.click(item('Lock'))
    expect(s().project.masses.find((m) => m.id === 'm3')!.locked).toBe(true)
    // locked: it is let go, and the plan does not pick it again; picked from its row (a tree), its menu says why
    expect(selected()).toEqual([])
    act(() => s().select('m3'))
    rightClick(mass('m3'), { x: 120, y: 200 })
    expect(item('Delete')).toBeDisabled()
    expect(item('Delete')).toHaveAttribute('title', 'A locked mass: unlock first')
    expect(item('Unlock')).toBeEnabled()
  })

  it('To a new building, then To <that building> for another mass (Decision "Masses to a building")', () => {
    render(<App />)
    const before = s().project.buildings.length
    rightClick(mass('m3'), { x: 120, y: 200 })
    fireEvent.click(item('To building'))
    fireEvent.click(subItem('To building', 'To a new building'))
    const p = s().project
    expect(p.buildings).toHaveLength(before + 1)
    const fresh = p.buildings.at(-1)!
    expect(fresh.levels.map((l) => l.id)).toContain(p.masses.find((m) => m.id === 'm3')!.levelId)
    expect(s().history.past).toHaveLength(1)
    // the plan went to the new building: back to m1's
    act(() => s().select('m1'))
    rightClick(mass('m1'), { x: 120, y: 200 })
    fireEvent.click(item('To building'))
    fireEvent.click(subItem('To building', `To ${fresh.name}`))
    const levels = s().project.buildings.find((b) => b.id === fresh.id)!.levels.map((l) => l.id)
    expect(levels).toContain(s().project.masses.find((m) => m.id === 'm1')!.levelId)
  })

  it('on empty ground with nothing selected: Paste, Paste here and Select all; the verbs of a kind are not offered to nothing', () => {
    render(<App />)
    rightClick(plan(), { x: 420, y: 20 })
    expect(within(menu()).getAllByRole('menuitem').map((b) => b.querySelector('span')!.textContent)).toEqual(['Paste', 'Paste here', 'Select all'])
    // nothing was copied: the reason is the command's
    expect(item('Paste')).toBeDisabled()
    expect(item('Paste')).toHaveAttribute('title', 'Copy something first')
    fireEvent.click(item('Select all'))
    expect(selected()).toEqual(['m1', 'm2', 'm3'])
  })

  it('two selected: Group, one undo step; then a click picks the group, Alt+click one of it, the window the whole group', () => {
    render(<App />)
    act(() => s().selectMany(['m1', 'm2']))
    rightClick(mass('m1'), { x: 120, y: 110 })
    // the selection stays: the mass right-clicked is in it
    expect(selected()).toEqual(['m1', 'm2'])
    expect(item('Group')).toBeEnabled()
    fireEvent.click(item('Group'))
    expect(groupOf('m1')).toBe('g1')
    expect(groupOf('m2')).toBe('g1')
    expect(s().history.past).toHaveLength(1)
    expect(useToast.getState().toast?.text).toBe('2 masses grouped: a click picks them all, Alt+click one alone.')
    expect(document.querySelector('[data-group-label]')).toHaveTextContent('Group · 2')
    rightClick(mass('m1'), { x: 120, y: 110 })
    expect(item('Group')).toBeDisabled()
    expect(item('Group')).toHaveAttribute('title', 'They are one group already')
    expect(item('Ungroup')).toBeEnabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => s().select(null))
    press(mass('m2'), { x: 320, y: 110 })
    expect(selected()).toEqual(['m1', 'm2'])
    act(() => s().select(null))
    press(mass('m2'), { x: 320, y: 110 }, { altKey: true })
    expect(selected()).toEqual(['m2'])
    // a window round Warehouse 1 alone brings Warehouse 2 too
    act(() => s().select(null))
    const from = at({ x: 30, y: 60 })
    const to = at({ x: 210, y: 160 })
    fireEvent.pointerDown(plan(), from)
    fireEvent.pointerMove(plan(), to)
    fireEvent.pointerUp(plan(), to)
    expect(selected()).toEqual(['m1', 'm2'])
  })

  it('a group dragged moves whole; Ctrl+Shift+G ungroups, Ctrl+G groups again', () => {
    render(<App />)
    act(() => s().apply((p) => groupMasses(p, ['m1', 'm2'])!.project))
    const before = s().project.masses.find((m) => m.id === 'm2')!.footprint
    fireEvent.pointerDown(mass('m1'), at({ x: 120, y: 110 }))
    fireEvent.pointerMove(mass('m1'), at({ x: 120, y: 105 }))
    fireEvent.pointerMove(mass('m1'), at({ x: 120, y: 100 }))
    fireEvent.pointerUp(mass('m1'), at({ x: 120, y: 100 }))
    const after = s().project.masses.find((m) => m.id === 'm2')!.footprint
    expect(after.kind === 'rect' && before.kind === 'rect' && after.center.y - before.center.y).toBeCloseTo(-10, 0)
    fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true })
    expect(groupOf('m1')).toBeUndefined()
    expect(groupOf('m2')).toBeUndefined()
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true })
    expect(groupOf('m1')).toBe('g1')
  })

  it('a duplicated group is a group of its own; a member deleted leaves no group of one', () => {
    render(<App />)
    act(() => s().apply((p) => groupMasses(p, ['m1', 'm3'])!.project))
    act(() => s().selectMany(['m1', 'm3']))
    rightClick(mass('m1'), { x: 120, y: 110 })
    fireEvent.click(item('Duplicate'))
    const copies = s().selection.massIds
    expect(copies).toHaveLength(2)
    const g = groupOf(copies[0])
    expect(g).toBeDefined()
    expect(g).not.toBe('g1')
    expect(groupOf(copies[1])).toBe(g)
    act(() => s().select('m3'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(groupOf('m1')).toBeUndefined()
  })
})
