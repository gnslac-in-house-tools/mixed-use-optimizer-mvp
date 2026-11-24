// Space turns the Street's side (Decision "Street side when drawing", 2026-11-13): with Street in hand, before the first point
// and while drawing (Shift+Space back); the side is seen at the pointer before the first point, as a ghost of the paving
// (`data-street-side-ghost`) with the side's name beside it, and the name stays beside the pointer while drawing. Space is
// not heard in a field (the command line types a space), with another tool in hand, and it never presses the focused button.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { streetTypesOf } from '../../engine/circulation/streets.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads, useStreetSide, useStreetType } from '../plan/circulation/roadState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useCommand } from '../plan/command/commandState.ts'
import { letGo, take, useHand } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject({ streets: false })
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
  useStreetSide.setState({ side: 'centre' })
  useStreetType.setState({ type: null })
  useCommand.setState({ registration: null, angle: null, cursor: null })
})

const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const SPACE = { key: ' ', code: 'Space' }
/** Space pressed and let go: the side turns when the key comes up (held with a drag, it pans). */
const tap = (extra: object = {}) => {
  fireEvent.keyDown(window, { ...SPACE, ...extra })
  fireEvent.keyUp(window, { ...SPACE, ...extra })
}
const side = () => useStreetSide.getState().side
const capture = () => document.querySelector('[data-capture]')!
const ghost = () => document.querySelector<SVGElement>('[data-street-side-ghost]')
const label = () => document.querySelector('[data-street-side-label]')?.textContent ?? null
const width = () => streetTypesOf(useApp.getState().project, null)[0].width
/** The x's of a path's corners (`M x y L x y … Z`). */
const xs = (el: Element) => Array.from(el.getAttribute('d')!.matchAll(/[ML](-?[\d.]+) -?[\d.]+/g)).map((m) => Number(m[1]))
const pointer = (q: Point) => fireEvent.pointerMove(capture(), at(q, { shiftKey: true }))
const place = (q: Point) => {
  fireEvent.pointerDown(capture(), at(q, { shiftKey: true }))
  fireEvent.pointerUp(capture(), at(q, { shiftKey: true }))
}
const street = () => {
  render(<App />)
  act(() => void take('street'))
}

describe('the side seen before the first point', () => {
  it('a ghost of the paving at the pointer, at the street’s width, its drawn line the left edge, the centre or the right edge', () => {
    street()
    expect(ghost()).toBeNull()
    pointer({ x: 60, y: 161 })
    const w = width()
    expect(ghost()).toHaveAttribute('data-street-side-ghost', 'centre')
    let x = xs(ghost()!)
    expect(Math.min(...x)).toBeCloseTo(60 - w / 2, 6)
    expect(Math.max(...x)).toBeCloseTo(60 + w / 2, 6)
    act(() => useStreetSide.getState().setSide('left'))
    expect(ghost()).toHaveAttribute('data-street-side-ghost', 'left')
    x = xs(ghost()!)
    // walking up the screen, the paving of a left edge lies to its right
    expect(Math.min(...x)).toBeCloseTo(60, 6)
    expect(Math.max(...x)).toBeCloseTo(60 + w, 6)
    act(() => useStreetSide.getState().setSide('right'))
    x = xs(ghost()!)
    expect(Math.min(...x)).toBeCloseTo(60 - w, 6)
    expect(Math.max(...x)).toBeCloseTo(60, 6)
    // about one width long each way, from the pointer
    const ys = Array.from(ghost()!.getAttribute('d')!.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)).map((m) => -Number(m[1]))
    expect(Math.min(...ys)).toBeCloseTo(161 - w, 6)
    expect(Math.max(...ys)).toBeCloseTo(161 + w, 6)
  })

  it('a label names the side beside the pointer; it follows a change at once', () => {
    street()
    pointer({ x: 60, y: 161 })
    expect(label()).toBe('Centre')
    act(() => useStreetSide.getState().setSide('left'))
    expect(label()).toBe('Left')
  })

  it('it follows the pointer, and is gone when the pointer leaves the plan or the first point is placed', () => {
    street()
    pointer({ x: 60, y: 161 })
    pointer({ x: 90, y: 200 })
    expect(Math.min(...xs(ghost()!))).toBeCloseTo(90 - width() / 2, 6)
    fireEvent.pointerLeave(capture(), at({ x: 90, y: 200 }))
    expect(ghost()).toBeNull()
    pointer({ x: 90, y: 200 })
    place({ x: 90, y: 200 })
    expect(ghost()).toBeNull()
    // the label stays near the pointer while drawing
    pointer({ x: 90, y: 230 })
    expect(label()).toBe('Centre')
  })

  it('there is none without the Street tool', () => {
    render(<App />)
    expect(document.querySelector('[data-street-side-ghost]')).toBeNull()
    expect(document.querySelector('[data-street-side-label]')).toBeNull()
  })
})

describe('Space turns the side', () => {
  it('before the first point: Space cycles, Shift+Space goes back, and the ghost follows', () => {
    street()
    pointer({ x: 60, y: 161 })
    tap()
    expect(side()).toBe('right')
    expect(ghost()).toHaveAttribute('data-street-side-ghost', 'right')
    expect(label()).toBe('Right')
    tap()
    expect(side()).toBe('left')
    tap({ shiftKey: true })
    expect(side()).toBe('right')
    expect(ghost()).toHaveAttribute('data-street-side-ghost', 'right')
  })

  it('while drawing: Space cycles and the paving preview changes with it; Shift+Space goes back; the label names it', () => {
    street()
    place({ x: 60, y: 161 })
    pointer({ x: 60, y: 230 })
    const w = width()
    const paving = () => Number(document.querySelector('[data-tool="Street"] [data-preview-paving]')!.getAttribute('d')!.match(/^M(-?[\d.]+)/)![1])
    expect(paving()).toBeCloseTo(60, 6)
    tap()
    expect(side()).toBe('right')
    expect(paving()).toBeCloseTo(60 - w / 2, 6)
    expect(label()).toBe('Right')
    tap()
    expect(side()).toBe('left')
    expect(paving()).toBeCloseTo(60 + w / 2, 6)
    tap({ shiftKey: true })
    expect(side()).toBe('right')
    expect(label()).toBe('Right')
  })

  it('Tab still cycles while drawing', () => {
    street()
    place({ x: 60, y: 161 })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(side()).toBe('right')
  })

  it('a held key (auto-repeat) turns it once, and the page does not scroll', () => {
    street()
    fireEvent.keyDown(window, SPACE)
    expect(fireEvent.keyDown(window, { ...SPACE, repeat: true })).toBe(false)
    expect(side()).toBe('centre')
    fireEvent.keyUp(window, SPACE)
    expect(side()).toBe('right')
  })

  it('Space held while the plan is dragged pans it: the side does not turn', () => {
    street()
    pointer({ x: 60, y: 161 })
    fireEvent.keyDown(window, SPACE)
    fireEvent.pointerDown(document.body, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerUp(document.body, { button: 0, pointerId: 1, clientX: 340, clientY: 320 })
    fireEvent.keyUp(window, SPACE)
    expect(side()).toBe('centre')
    // the next tap turns it
    tap()
    expect(side()).toBe('right')
  })

  it('Space pressed in the command line types a space and does not turn the side', () => {
    street()
    pointer({ x: 60, y: 161 })
    const field = screen.getByRole('textbox', { name: 'Command line' })
    field.focus()
    expect(fireEvent.keyDown(field, SPACE)).toBe(true)
    expect(side()).toBe('centre')
  })

  it('with another tool in hand, or none, Space does nothing', () => {
    render(<App />)
    expect(fireEvent.keyDown(window, SPACE)).toBe(true)
    expect(side()).toBe('centre')
    for (const tool of ['mass', 'lot', 'move'] as const) {
      act(() => void take(tool))
      expect(fireEvent.keyDown(window, SPACE), tool).toBe(true)
      expect(side(), tool).toBe('centre')
    }
  })

  it('with the focus on the strip’s Street button, Space keeps Street in hand: it turns the side and does not press the button', () => {
    render(<App />)
    const button = within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Street' })
    fireEvent.click(button)
    button.focus()
    expect(useHand.getState().tool).toBe('street')
    expect(button).toHaveFocus()
    // keydown and keyup both refused: a browser clicks a focused button on Space's keyup
    expect(fireEvent.keyDown(button, SPACE)).toBe(false)
    expect(fireEvent.keyUp(button, SPACE)).toBe(false)
    expect(useHand.getState().tool).toBe('street')
    expect(side()).toBe('right')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('a Space keyup with nothing taken is left alone', () => {
    render(<App />)
    expect(fireEvent.keyUp(window, SPACE)).toBe(true)
  })

  it('Space is no command: it is told in the Street’s command-line help, before the first point and after it', () => {
    street()
    expect(useCommand.getState().registration!.help).toContain('Space: side')
    place({ x: 60, y: 161 })
    expect(useCommand.getState().registration!.help).toContain('Space: side')
  })

  it('the side chips’ titles say Space (or Tab) cycles them', () => {
    street()
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Streets options' }))
    const chip = within(screen.getByRole('group', { name: 'Street side' })).getByRole('button', { name: 'Left' })
    expect(chip.getAttribute('title')).toMatch(/Space \(or Tab\) cycles them/)
  })
})
