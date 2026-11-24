// B.0 through the UI (Decision "Multi-selection"): Shift+click, the window, dragging and typing a move for the group,
// Delete, R, Ctrl+A, Ctrl+D, and Properties with what the masses share.
// Demo masses: m1 x 40…200 y 70…150 and m2 x 250…390 y 70…150 (warehouses); m3 x 100…140 y 190…210 (office).
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useToast } from '../../layout/toast.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { useClipboard } from '../clipboard.ts'
import { resetTyped } from '../../editing/dimension/typed.ts'
import { useCommand } from '../command/commandState.ts'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useDimensions } from '../tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** Opens the Properties tab on the Parameters rail (Decision "Properties in the panel"). */
/** Massing's Properties group, open (Decision "Compact panel"). */
const openProperties = () => act(() => useUi.setState({ rail: 'properties' }))

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const mass = (id: string) => document.querySelector(`[data-mass="${id}"]`)!
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const drag = (el: Element, from: Point, to: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}
const selected = () => useApp.getState().selection.massIds
const pick = (ids: string[]) => act(() => useApp.getState().selectMany(ids))
/** A rect's centre, to the millimetre (a drag goes through screen pixels). */
const centre = (id: string) => {
  const f = useApp.getState().project.masses.find((m) => m.id === id)!.footprint
  return f.kind === 'rect' ? { x: Math.round(f.center.x * 1000) / 1000, y: Math.round(f.center.y * 1000) / 1000 } : null
}
const props = () => screen.getByRole('region', { name: 'Properties' })
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null })
  // snap off: a dragged group moves exactly with the pointer
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
})

describe('picking several masses', () => {
  it('Shift+click adds and takes out; a click alone picks one; Shift+click on empty ground keeps them', () => {
    render(<App />)
    press(mass('m1'), { x: 120, y: 110 })
    press(mass('m2'), { x: 320, y: 110 }, { shiftKey: true })
    expect(selected()).toEqual(['m1', 'm2'])
    press(plan(), { x: 420, y: 250 }, { shiftKey: true })
    expect(selected()).toEqual(['m1', 'm2'])
    press(mass('m1'), { x: 120, y: 110 }, { shiftKey: true })
    expect(selected()).toEqual(['m2'])
    press(mass('m3'), { x: 120, y: 200 })
    expect(selected()).toEqual(['m3'])
    press(plan(), { x: 420, y: 250 })
    expect(selected()).toEqual([])
  })

  it('a drag on empty ground: left to right takes what is inside, right to left what it touches; Shift adds', () => {
    render(<App />)
    drag(plan(), { x: 90, y: 180 }, { x: 150, y: 220 })
    expect(selected()).toEqual(['m3'])
    // right to left over the gap between m1 and m2: touches m1 only
    drag(plan(), { x: 210, y: 160 }, { x: 190, y: 100 })
    expect(selected()).toEqual(['m1'])
    drag(plan(), { x: 245, y: 60 }, { x: 400, y: 160 }, { shiftKey: true })
    expect(selected()).toEqual(['m1', 'm2'])
  })

  it('the window shows while it is dragged: solid for a window, dashed for a crossing', () => {
    render(<App />)
    fireEvent.pointerDown(plan(), at({ x: 90, y: 180 }))
    fireEvent.pointerMove(plan(), at({ x: 150, y: 220 }))
    expect(document.querySelector('[data-selection-window]')).toHaveAttribute('data-selection-window', 'window')
    fireEvent.pointerMove(plan(), at({ x: 20, y: 220 }))
    expect(document.querySelector('[data-selection-window]')).toHaveAttribute('data-selection-window', 'crossing')
    fireEvent.pointerUp(plan(), at({ x: 20, y: 220 }))
    expect(document.querySelector('[data-selection-window]')).toBeNull()
  })

  it('the pan moved to the middle button, Space + drag and touch: they pan and select nothing', () => {
    render(<App />)
    const box = () => plan().getAttribute('viewBox')
    const start = box()
    drag(plan(), { x: 90, y: 180 }, { x: 150, y: 220 }, { button: 1 })
    const panned = box()
    expect(panned).not.toBe(start)
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    drag(plan(), { x: 90, y: 180 }, { x: 150, y: 220 })
    fireEvent.keyUp(window, { key: ' ', code: 'Space' })
    expect(box()).not.toBe(panned)
    drag(plan(), { x: 90, y: 180 }, { x: 150, y: 220 }, { pointerType: 'touch' })
    expect(selected()).toEqual([])
  })

  it('Ctrl+A picks every mass of the level; Escape lets go', () => {
    render(<App />)
    key('a', { ctrlKey: true })
    expect(selected()).toEqual(['m1', 'm2', 'm3'])
    key('Escape')
    expect(selected()).toEqual([])
  })
})

describe('editing the group', () => {
  it('dragging one moves them all, as one undo step; a click on one of them picks it alone', () => {
    render(<App />)
    pick(['m1', 'm2'])
    drag(mass('m1'), { x: 120, y: 110 }, { x: 130, y: 105 })
    expect(centre('m1')).toEqual({ x: 130, y: 105 })
    expect(centre('m2')).toEqual({ x: 330, y: 105 })
    expect(centre('m3')).toEqual({ x: 120, y: 200 })
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(selected()).toEqual(['m1', 'm2'])
    press(mass('m2'), { x: 330, y: 105 })
    expect(selected()).toEqual(['m2'])
  })

  it('a typed move goes to all of them', () => {
    render(<App />)
    pick(['m1', 'm3'])
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('2 masses')
    const line = screen.getByRole('textbox', { name: 'Command line' })
    fireEvent.change(line, { target: { value: '@10,0' } })
    fireEvent.keyDown(line, { key: 'Enter' })
    expect(centre('m1')).toEqual({ x: 130, y: 110 })
    expect(centre('m3')).toEqual({ x: 130, y: 200 })
    expect(centre('m2')).toEqual({ x: 320, y: 110 })
  })

  it('Delete, Shift+R and Ctrl+D take them all', () => {
    render(<App />)
    pick(['m1', 'm2'])
    key('d', { ctrlKey: true })
    const copies = selected()
    expect(copies).toHaveLength(2)
    expect(copies).not.toContain('m1')
    key('R', { shiftKey: true })
    expect(useApp.getState().project.masses.filter((m) => copies.includes(m.id)).map((m) => m.footprint.kind === 'rect' && m.footprint.rotation)).toEqual([90, 270]) // Warehouse 2 stood turned round
    key('Delete')
    expect(useApp.getState().project.masses.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('Properties shows what they share and edits them all; — where they differ', () => {
    render(<App />)
    openProperties()
    pick(['m1', 'm3'])
    expect(within(props()).getByText('2 masses')).toBeInTheDocument()
    expect(within(props()).getByRole('combobox', { name: 'Program' })).toHaveValue('__mixed')
    const height = within(props()).getByRole('textbox', { name: /^Height/ })
    expect(height).toHaveValue('')
    expect(height).toHaveAttribute('placeholder', '—')
    fireEvent.change(within(props()).getByRole('combobox', { name: 'Program' }), { target: { value: 'office' } })
    fireEvent.change(height, { target: { value: '12' } })
    fireEvent.blur(height)
    const [m1, , m3] = useApp.getState().project.masses
    expect([m1.programId, m1.height, m3.programId, m3.height]).toEqual(['office', 12, 'office', 12])
    fireEvent.click(within(props()).getByRole('button', { name: 'Lock masses' }))
    expect(useApp.getState().project.masses.filter((m) => m.locked).map((m) => m.id)).toEqual(['m1', 'm3'])
  })
})
