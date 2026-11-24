// D.1 task 4 (the spec's *The typed dimension*), through <App />: every drag of the site's plan shows its number beside
// the handle, and digits typed during the drag, or right after it, set it exactly (Enter): one undo step. Escape, the
// things that end the correction, the command line mirroring the text, the court pills in both viewports.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../layout/ui.ts'
import { useToast } from '../../../layout/toast.ts'
import { fit, UNMEASURED_SIZE } from '../../../plan/camera.ts'
import { useCommand } from '../../../plan/command/commandState.ts'
import { rotateHandle } from '../../../plan/editing.ts'
import { contentBounds } from '../../../plan/PlanSvg.tsx'
import { useSnapSettings } from '../../../plan/snap/settings.ts'
import { DEFAULT_SNAP } from '../../../plan/snap/kinds.ts'
import { letGo, take } from '../../../tools/hand.ts'
import { resetTyped, useTyped } from '../typed.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const typeKeys = (text: string) => [...text].forEach((c) => key(c))
const enter = () => key('Enter')
const line = () => screen.getByRole('textbox', { name: 'Command line' })
const field = () => document.querySelector('[data-dimension-field]')
const rectOf = (id: string) => {
  const f = s().project.masses.find((m) => m.id === id)!.footprint
  if (f.kind !== 'rect') throw new Error('not a rect')
  return { left: f.center.x - f.width / 2, bottom: f.center.y - f.depth / 2, width: f.width, depth: f.depth, rotation: f.rotation }
}
const handle = (k: string) => document.querySelector(`[data-handle="${k}"]`)!
/** Warehouse 2 (turned round): its wall 3 is the right one, at x = 390, its normal +x. */
const WALL = { x: 390, y: 110 }

/** A press, a move and (unless `hold`) the release on a handle: the pointer goes `to`, with Shift (no snap). */
function drag(k: string, from: Point, to: Point, { hold = false }: { hold?: boolean } = {}) {
  fireEvent.pointerDown(handle(k), at(from))
  fireEvent.pointerMove(handle(k), at(to, { shiftKey: true }))
  if (!hold) fireEvent.pointerUp(handle(k), at(to))
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useToast.setState({ toast: null, confirmation: null })
  letGo()
  resetTyped()
})

describe('a wall dragged, a number typed during it', () => {
  it('replaces the drag: the wall is that far from where it was, the pointer no longer moves it, one undo step', () => {
    render(<App />)
    act(() => s().select('m2'))
    const steps = s().history.past.length
    drag('wall-3', WALL, { x: 400, y: 110 }, { hold: true })
    typeKeys('12')
    enter()
    expect(rectOf('m2')).toMatchObject({ left: 250, width: 152 })
    // the pointer goes on: it moves nothing now
    fireEvent.pointerMove(handle('wall-3'), at({ x: 440, y: 110 }, { shiftKey: true }))
    fireEvent.pointerUp(handle('wall-3'), at({ x: 440, y: 110 }))
    expect(rectOf('m2').width).toBe(152)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(rectOf('m2').width).toBe(140)
  })

  it('goes towards where it was dragged: dragged in, the number is inwards', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 380, y: 110 }, { hold: true })
    typeKeys('5')
    enter()
    expect(rectOf('m2').width).toBe(135)
  })
})

describe('a number typed right after the release', () => {
  it('corrects it: one undo step back to before the drag', () => {
    render(<App />)
    act(() => s().select('m2'))
    const steps = s().history.past.length
    drag('wall-3', WALL, { x: 400, y: 110 })
    expect(s().history.past).toHaveLength(steps + 1)
    expect(useTyped.getState().cur).not.toBeNull()
    typeKeys('5')
    enter()
    expect(rectOf('m2')).toMatchObject({ left: 250, width: 145 })
    expect(s().history.past).toHaveLength(steps + 1)
    typeKeys('8') // and again
    enter()
    expect(rectOf('m2').width).toBe(148)
    act(() => s().undo())
    expect(rectOf('m2').width).toBe(140)
  })

  it('a refused value says why, keeps the drag, and stays editable', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    const dragged = rectOf('m2').width
    typeKeys('0')
    enter()
    expect(rectOf('m2').width).toBe(dragged)
    expect(useTyped.getState().cur?.error).toMatch(/\S/)
    expect(field()!.textContent).toContain(useTyped.getState().cur!.error!)
    // editable: the text is still there, a new value corrects it
    key('Backspace')
    typeKeys('5')
    enter()
    expect(rectOf('m2').width).toBe(145)
    expect(useTyped.getState().cur?.error).toBeNull()
  })
})

describe('Escape', () => {
  it('during the drag it cancels it: back to before', () => {
    render(<App />)
    act(() => s().select('m2'))
    const steps = s().history.past.length
    drag('wall-3', WALL, { x: 400, y: 110 }, { hold: true })
    expect(rectOf('m2').width).toBeGreaterThan(140)
    key('Escape')
    expect(rectOf('m2').width).toBe(140)
    expect(s().history.past).toHaveLength(steps)
    expect(useTyped.getState().cur).toBeNull()
  })

  it('with typed text it clears the text; with none, after the release, it lets go', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    typeKeys('7')
    expect(useTyped.getState().cur?.text).toBe('7')
    key('Escape')
    expect(useTyped.getState().cur).not.toBeNull()
    expect(useTyped.getState().cur?.text).toBe('')
    key('Escape')
    expect(useTyped.getState().cur).toBeNull()
    // let go: a digit is no longer the dimension's
    key('3')
    expect(useTyped.getState().cur).toBeNull()
  })

  it('typed during the drag, it clears the text first; a second one cancels the drag', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 }, { hold: true })
    typeKeys('9')
    key('Escape')
    expect(useTyped.getState().cur?.text).toBe('')
    expect(rectOf('m2').width).toBeGreaterThan(140)
    key('Escape')
    expect(rectOf('m2').width).toBe(140)
  })
})

describe('what ends the correction', () => {
  const dragged = () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    expect(useTyped.getState().cur).not.toBeNull()
  }

  it('another edit', () => {
    dragged()
    act(() => s().apply((p) => actions.moveMasses(p, ['m1'], { x: 1, y: 0 })))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('an undo', () => {
    dragged()
    act(() => s().undo())
    expect(useTyped.getState().cur).toBeNull()
  })

  it('a new pick', () => {
    dragged()
    act(() => s().select('m1'))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('a tool taken', () => {
    dragged()
    act(() => take('dimension'))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('a window opened (or the block editor closed)', () => {
    dragged()
    expect(useTyped.getState().cur?.phase).toBe('kept')
    act(() => useUi.setState({ dialog: 'program' }))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('a press on the plan', () => {
    dragged()
    fireEvent.pointerDown(screen.getByRole('img', { name: 'Site plan' }), at({ x: 30, y: 30 }))
    expect(useTyped.getState().cur).toBeNull()
    fireEvent.pointerUp(screen.getByRole('img', { name: 'Site plan' }), at({ x: 30, y: 30 }))
  })
})

describe('the field and the command line', () => {
  it('the field stands beside the handle with the live number, then the typed text; the command line shows the same text', () => {
    render(<App />)
    act(() => s().select('m2'))
    expect(field()).toBeNull()
    drag('wall-3', WALL, { x: 400, y: 110 }, { hold: true })
    expect(field()!.textContent).toMatch(/\d\s?m/)
    typeKeys('12')
    expect(field()!.textContent).toContain('12')
    expect(line()).toHaveValue('12')
    key('Backspace')
    expect(field()!.textContent).toContain('1')
    expect(line()).toHaveValue('1')
    fireEvent.pointerUp(handle('wall-3'), at({ x: 400, y: 110 }))
    // after the release the field stays: it can be corrected
    expect(field()).not.toBeNull()
  })

  it('the field goes with the correction', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    // released, the number is gone but the correction stands: a digit brings the field back
    expect(field()).toBeNull()
    expect(useTyped.getState().cur).not.toBeNull()
    act(() => s().select('m1'))
    expect(useTyped.getState().cur).toBeNull()
  })

  it('the command line takes the number too: typed there, Enter applies it, as the keys', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    expect(screen.getByRole('group', { name: 'Command' })).toHaveTextContent('Move wallWarehouse 2 · wall 4')
    fireEvent.change(line(), { target: { value: '6' } })
    fireEvent.keyDown(line(), { key: 'Enter' })
    expect(rectOf('m2').width).toBe(146)
  })

  it('digits never reach a tool’s key (3 is the 3D view) nor a field being typed in', () => {
    render(<App />)
    act(() => s().select('m2'))
    drag('wall-3', WALL, { x: 400, y: 110 })
    key('3')
    expect(useUi.getState().view).toBe('plan')
    expect(useTyped.getState().cur?.text).toBe('3')
    key('Escape')
    // a field being typed in keeps its digits
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: '5' })
    expect(useTyped.getState().cur?.text).toBe('')
    input.remove()
  })

  it('nothing is taken without a drag: a digit is the app’s', () => {
    render(<App />)
    key('3')
    expect(useTyped.getState().cur).toBeNull()
  })
})

describe('the corner, the rotation handle', () => {
  it('a corner takes @2,0 (from where it was): a rect resizes', () => {
    render(<App />)
    act(() => s().select('m3'))
    const c = footprintContour(s().project.masses.find((m) => m.id === 'm3')!.footprint).vertices[2]
    const before = rectOf('m3')
    drag('vertex-2', c, { x: c.x + 6, y: c.y + 4 })
    typeKeys('@2,0')
    enter()
    expect(rectOf('m3')).toMatchObject({ left: before.left, bottom: before.bottom, width: before.width + 2, depth: before.depth })
    act(() => s().undo())
    expect(rectOf('m3')).toMatchObject({ width: before.width, depth: before.depth })
  })

  it('the rotation handle takes degrees', () => {
    render(<App />)
    act(() => s().select('m1'))
    const f = s().project.masses.find((m) => m.id === 'm1')!.footprint
    const turn = rotateHandle(f, 1 / v.scale).at
    const steps = s().history.past.length
    drag('rotate', turn, { x: turn.x - 20, y: turn.y - 4 })
    typeKeys('30')
    enter()
    expect(rectOf('m1').rotation).toBe(30)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(rectOf('m1').rotation).toBe(0)
  })
})

describe('the site’s court pill', () => {
  const pill = () => document.querySelector('[data-court-pill="m1:0"]')!
  const depth = () => s().derived.circulation.docks.find((d) => d.massId === 'm1')!.depth
  const pull = (hold = false) => {
    fireEvent.pointerDown(pill(), at({ x: 120, y: 30 }))
    fireEvent.pointerMove(pill(), at({ x: 120, y: 24.8 }))
    if (!hold) fireEvent.pointerUp(pill(), at({ x: 120, y: 24.8 }))
  }

  it('35 typed during the drag sets the depth to 35, one undo step', () => {
    render(<App />)
    act(() => s().select('m1'))
    const steps = s().history.past.length
    pull(true)
    typeKeys('35')
    enter()
    fireEvent.pointerUp(pill(), at({ x: 120, y: 20 }))
    expect(depth()).toBe(35)
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(depth()).toBe(40)
  })

  it('300 typed right after is held to 200, and said', () => {
    render(<App />)
    act(() => s().select('m1'))
    pull()
    typeKeys('300')
    enter()
    expect(depth()).toBe(200)
    expect(field()!.textContent).toMatch(/200 m/)
    expect(useTyped.getState().cur?.note).toMatch(/200/)
  })
})
