// The block plan handles like the main plan (BE.9; Decision "Multi-selection"): its camera is the main plan's
// (views/plan/usePlanCamera.ts): the wheel zooms, the middle button pans, a double click on empty ground frames, a hand
// edit holds the camera (moved with the origin's shift); a left drag on empty ground draws a window (left → right,
// what is fully inside) or a crossing (right → left, what it touches), not a pan; Shift + click adds or removes one;
// several column lines dragged by a bubble move together, several docks slide along their wall together; Delete removes
// a mixed selection in one undo step.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import type { Point } from '../../../../model/schema.ts'
import { generate } from '../../engine/generate.ts'
import { lineModules } from '../../engine/bays.ts'
import { useWarehouse, type Picked } from '../warehouseState.ts'
import { pxFor, screenAt } from './planScreen.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
})

const type = () => useApp.getState().project.warehouseTypes![0]
const plan = () => document.querySelector('[data-warehouse-plan]')!
const viewBox = () => plan().getAttribute('viewBox')!.split(' ').map(Number)
const kinds = (ps: Picked[]) => ps.map((p) => `${p.kind}:${p.id}`).sort()
const picked = () => kinds(useWarehouse.getState().picked)
const linesX = () => lineModules(generate(type()).runs.x)
const docks = () => type().elements.filter((e) => e.kind === 'dock')

/** A left drag on the plan from world point `a` to `b`, the pointer let go there. */
function dragBox(a: Point, b: Point, shiftKey = false) {
  fireEvent.pointerDown(plan(), { ...screenAt(a), pointerId: 1, button: 0, shiftKey })
  fireEvent.pointerMove(plan(), { ...screenAt(b), pointerId: 1, shiftKey })
  fireEvent.pointerUp(plan(), { ...screenAt(b), pointerId: 1, button: 0, shiftKey })
}
/** A click on the plan at a world point. */
function click(at: Point, shiftKey = false) {
  fireEvent.pointerDown(plan(), { ...screenAt(at), pointerId: 1, button: 0, shiftKey })
  fireEvent.pointerUp(plan(), { ...screenAt(at), pointerId: 1, button: 0, shiftKey })
}
/** A click on a column line's bubble. */
function clickBubble(k: string, shiftKey = false) {
  fireEvent.pointerDown(document.querySelector(`[data-grid-line="${k}"]`)!, { clientX: 0, clientY: 0, pointerId: 1, button: 0, shiftKey })
  fireEvent.pointerUp(plan(), { clientX: 0, clientY: 0, pointerId: 1, button: 0, shiftKey })
}

// The new block: column lines B at 10 m and C at 22 m (modules 3 and 7), docks on the front's face (y = −0.3 m):
// e1 at x = 11.5 m, e2 14.5, e3 17.5, e4 20.5 … e59 185.5, e60 188.5; its bubbles stand some 10 m out of the box.
const win = { a: { x: 9, y: -13 }, b: { x: 23, y: 1 } }

describe('a window or a crossing (a left drag on empty ground)', () => {
  it('left → right: a solid window while dragged, no pan; what is fully inside it picked', () => {
    render(<App />)
    const before = viewBox()
    fireEvent.pointerDown(plan(), { ...screenAt(win.a), pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt(win.b), pointerId: 1 })
    expect(document.querySelector('[data-selection-window="window"]')).not.toBeNull()
    expect(viewBox()).toEqual(before)
    fireEvent.pointerUp(plan(), { ...screenAt(win.b), pointerId: 1, button: 0 })
    expect(document.querySelector('[data-selection-window]')).toBeNull()
    expect(picked()).toEqual(['element:e1', 'element:e2', 'element:e3', 'element:e4', 'line:x1', 'line:x2'])
    expect(document.querySelectorAll('[data-picked]')).toHaveLength(6)
  })

  it('right → left: a dashed crossing; also the zone and the court it touches', () => {
    render(<App />)
    fireEvent.pointerDown(plan(), { ...screenAt(win.b), pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt(win.a), pointerId: 1 })
    expect(document.querySelector('[data-selection-window="crossing"]')).not.toBeNull()
    fireEvent.pointerUp(plan(), { ...screenAt(win.a), pointerId: 1, button: 0 })
    expect(picked()).toEqual(['court:e1', 'element:e1', 'element:e2', 'element:e3', 'element:e4', 'line:x1', 'line:x2', 'zone:1'])
  })

  it('with Shift a window adds to what is picked', () => {
    render(<App />)
    click({ x: 188.5, y: -1 })
    expect(picked()).toEqual(['element:e60'])
    dragBox(win.a, win.b, true)
    expect(picked()).toEqual(['element:e1', 'element:e2', 'element:e3', 'element:e4', 'element:e60', 'line:x1', 'line:x2'])
  })
})

describe('Shift + click', () => {
  it('adds one, again takes it away; a click alone picks it alone; on empty ground lets all go', () => {
    render(<App />)
    click({ x: 11.5, y: -1 })
    expect(picked()).toEqual(['element:e1'])
    click({ x: 14.5, y: -1 }, true)
    expect(picked()).toEqual(['element:e1', 'element:e2'])
    clickBubble('x1', true)
    expect(picked()).toEqual(['element:e1', 'element:e2', 'line:x1'])
    click({ x: 11.5, y: -1 }, true)
    expect(picked()).toEqual(['element:e2', 'line:x1'])
    // Shift on empty ground keeps them
    click({ x: -60, y: -60 }, true)
    expect(picked()).toEqual(['element:e2', 'line:x1'])
    click({ x: 17.5, y: -1 })
    expect(picked()).toEqual(['element:e3'])
    click({ x: -60, y: -60 })
    expect(picked()).toEqual([])
  })
})

describe('several moved together', () => {
  it('two column lines dragged by a bubble: both by whole modules; blocked by a neighbour, none', () => {
    render(<App />)
    clickBubble('x1')
    clickBubble('x2', true)
    expect(picked()).toEqual(['line:x1', 'line:x2'])
    // C's bubble 3 m right: a module
    const bubble = document.querySelector('[data-grid-line="x2"]')!
    fireEvent.pointerDown(bubble, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 25, y: -10 }), pointerId: 1 })
    expect(document.querySelectorAll('[data-line-preview]')).toHaveLength(2)
    fireEvent.pointerUp(plan(), { ...screenAt({ x: 25, y: -10 }), pointerId: 1, button: 0 })
    expect(linesX().slice(0, 4)).toEqual([0, 4, 8, 11])
    expect(picked()).toEqual(['line:x1', 'line:x2'])
    // four modules more: C on D
    const before = type()
    fireEvent.pointerDown(bubble, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 37, y: -10 }), pointerId: 1 })
    fireEvent.pointerUp(plan(), { ...screenAt({ x: 37, y: -10 }), pointerId: 1, button: 0 })
    expect(type()).toBe(before)
  })

  it('two docks picked, one dragged along its wall: both slide by whole modules, one undo step', () => {
    render(<App />)
    dragBox({ x: 184, y: -5 }, { x: 189.5, y: 1 })
    expect(picked()).toEqual(['element:e59', 'element:e60'])
    // e60 pressed on its wall, 9 m right: three modules
    const line = document.querySelector('[data-handle="edge-line-e1"]')!
    fireEvent.pointerDown(line, { ...screenAt({ x: 188.5, y: -0.3 }), pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 197.5, y: -0.3 }), pointerId: 1 })
    expect(document.querySelectorAll('[data-slide-preview] path')).toHaveLength(2)
    fireEvent.pointerUp(plan(), { ...screenAt({ x: 197.5, y: -0.3 }), pointerId: 1, button: 0 })
    expect(docks().filter((e) => e.id === 'e59' || e.id === 'e60').map((e) => e.module)).toEqual([64, 65])
    // the walls did not move
    expect(type().hall.width).toBe(96)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docks().filter((e) => e.id === 'e59' || e.id === 'e60').map((e) => e.module)).toEqual([61, 62])
  })

  it('a slide that cannot be made shows no preview, and its release says why (final review, Minor 3)', () => {
    render(<App />)
    dragBox({ x: 184, y: -5 }, { x: 189.5, y: 1 })
    expect(picked()).toEqual(['element:e59', 'element:e60'])
    // 6 m left: onto e57 and e58, not slid with them
    const before = type()
    const line = document.querySelector('[data-handle="edge-line-e1"]')!
    fireEvent.pointerDown(line, { ...screenAt({ x: 188.5, y: -0.3 }), pointerId: 1, button: 0 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 182.5, y: -0.3 }), pointerId: 1 })
    expect(document.querySelectorAll('[data-slide-preview] path')).toHaveLength(0)
    fireEvent.pointerUp(plan(), { ...screenAt({ x: 182.5, y: -0.3 }), pointerId: 1, button: 0 })
    expect(type()).toBe(before)
    expect(useToast.getState().toast?.text).toMatch(/cannot slide that far/i)
  })
})

describe('Delete', () => {
  it('removes a mixed selection (docks and column lines) in one undo step', () => {
    render(<App />)
    dragBox(win.a, win.b)
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(docks()).toHaveLength(56)
    expect(linesX().slice(0, 3)).toEqual([0, 11, 15])
    expect(useWarehouse.getState().picked).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(docks()).toHaveLength(60)
    expect(linesX().slice(0, 3)).toEqual([0, 3, 7])
  })
})

describe('the camera (the main plan’s)', () => {
  it('the middle button pans; the wheel zooms; a double click on empty ground frames the block again', () => {
    render(<App />)
    const fitted = viewBox()
    fireEvent.pointerDown(plan(), { clientX: 400, clientY: 300, pointerId: 1, button: 1 })
    fireEvent.pointerMove(plan(), { clientX: 450, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(plan(), { clientX: 450, clientY: 300, pointerId: 1, button: 1 })
    const panned = viewBox()
    expect(panned[0]).toBeLessThan(fitted[0])
    expect(panned[2]).toBeCloseTo(fitted[2])
    expect(useWarehouse.getState().picked).toEqual([])
    act(() => {
      plan().dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 400, clientY: 300, bubbles: true, cancelable: true }))
    })
    expect(viewBox()[2]).toBeLessThan(panned[2])
    fireEvent.doubleClick(plan())
    expect(viewBox()).toEqual(fitted)
  })

  it('as framed (not zoomed, panned or held), it frames the block again when its box changes', () => {
    render(<App />)
    const before = viewBox()
    act(() => useApp.getState().apply((p) => actions.updateWarehouseStep(p, 'wt1', 'hall', { length: 400 })))
    expect(viewBox()[2]).toBeGreaterThan(before[2] * 1.5)
  })

  it('held after a hand edit, moved with the origin: the left wall dragged out two modules', () => {
    render(<App />)
    const before = viewBox()
    const pill = document.querySelector('[data-handle="edge-e4"]')!
    fireEvent.pointerDown(pill, { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
    fireEvent.pointerMove(pill, { clientX: -pxFor(7), clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(pill, { clientX: -pxFor(7), clientY: 0, pointerId: 1, button: 0 })
    expect(type().hall.length).toBe(206)
    const after = viewBox()
    // the box's line A moved 6 m: the camera with it, at the same zoom, not framed again
    expect(after[0]).toBeCloseTo(before[0] + 6)
    expect(after[1]).toBeCloseTo(before[1])
    expect(after[2]).toBeCloseTo(before[2])
  })
})
