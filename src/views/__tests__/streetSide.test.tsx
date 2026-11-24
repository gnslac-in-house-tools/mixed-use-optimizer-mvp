// The Street tool's side (Phase SE.3, Decision "Street side when drawing"): the chips Left · Centre · Right beside the
// street type while the tool is on, the last one used kept for the session; Tab cycles them while a line is drawn; a
// street drawn with Left stores it, and the preview draws each segment by its side.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useRoads, useStreetSide } from '../plan/circulation/roadState.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useCommand } from '../plan/command/commandState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

beforeEach(() => {
  localStorage.clear()
  const p = demoProject({ streets: false })
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
  useStreetSide.setState({ side: 'centre' })
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
/** The chips, in the Streets group's ▾ of the Tools strip: opened when they are not (a press on the plan closes the panel). */
const chips = () => {
  if (!screen.queryByRole('dialog', { name: 'New street' })) fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Streets options' }))
  return within(screen.getByRole('group', { name: 'Street side' }))
}
const LABELS = ['Left', 'Centre', 'Right']
const pressed = () => LABELS.find((name) => chips().getByRole('button', { name }).getAttribute('aria-pressed') === 'true')

describe('the Street tool’s side', () => {
  it('the chips Left · Centre · Right are in the Streets group’s ▾, beside its type; a chip sets the side', () => {
    render(<App />)
    expect(screen.queryByRole('group', { name: 'Street side' })).toBeNull()
    fireEvent.keyDown(window, { key: 'w' })
    expect(useTool.getState().tool).toBe('street')
    expect(chips().getAllByRole('button')).toHaveLength(3)
    LABELS.forEach((name, i) => expect(chips().getAllByRole('button')[i]).toBe(chips().getByRole('button', { name })))
    expect(screen.getByRole('group', { name: 'Street side' }).closest('[role="dialog"]')).toHaveAccessibleName('New street')
    expect(pressed()).toBe('Centre')
    fireEvent.click(chips().getByRole('button', { name: 'Left' }))
    expect(useStreetSide.getState().side).toBe('left')
    expect(pressed()).toBe('Left')
    // the chips' titles tell the key
    expect(chips().getByRole('button', { name: 'Left' }).getAttribute('title')).toMatch(/Tab/)
  })

  it('Tab cycles the sides while a line is drawn (Shift+Tab back), not before its first point; the side is kept', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'w' })
    // no point yet: Tab is the page's (the focus moves), the side stays
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(useStreetSide.getState().side).toBe('centre')
    const capture = document.querySelector('[data-capture]')!
    fireEvent.pointerDown(capture, at({ x: 60, y: 161 }, { shiftKey: true }))
    fireEvent.pointerUp(capture, at({ x: 60, y: 161 }, { shiftKey: true }))
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(useStreetSide.getState().side).toBe('right')
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(useStreetSide.getState().side).toBe('left')
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(useStreetSide.getState().side).toBe('right')
    expect(pressed()).toBe('Right')
    // the line cancelled, the tool left and taken again: the side stays
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(useStreetSide.getState().side).toBe('right')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useTool.getState().tool).toBe('select')
    fireEvent.keyDown(window, { key: 'w' })
    expect(pressed()).toBe('Right')
  })

  it('a street drawn with Left stores side left; its preview is drawn by its side', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'w' })
    fireEvent.click(chips().getByRole('button', { name: 'Left' }))
    const capture = document.querySelector('[data-capture]')!
    // up x 60 from y 161 to 230, clear of the demo's masses: no side switched on its own
    fireEvent.pointerDown(capture, at({ x: 60, y: 161 }, { shiftKey: true }))
    fireEvent.pointerUp(capture, at({ x: 60, y: 161 }, { shiftKey: true }))
    fireEvent.pointerMove(capture, at({ x: 60, y: 230 }, { shiftKey: true }))
    // the paving previewed half a width to the right of the drawn line (walking north: east)
    const paving = document.querySelector('[data-tool="Street"] [data-preview-paving]')!
    const w = Number(paving.getAttribute('stroke-width'))
    const x = Number(paving.getAttribute('d')!.match(/^M(-?[\d.]+)/)![1])
    expect(x).toBeCloseTo(60 + w / 2, 6)
    fireEvent.pointerDown(capture, at({ x: 60, y: 230 }, { shiftKey: true }))
    fireEvent.pointerUp(capture, at({ x: 60, y: 230 }, { shiftKey: true }))
    fireEvent.keyDown(window, { key: 'Enter' })
    const streets = s().project.options[0].streets!
    expect(streets.segments).toHaveLength(1)
    expect(streets.segments[0].left).toBe(0)
  })
})
