// The rotation handle (Decision "Rotate handle"): a white dot on a stem beyond the selected mass; dragged round the
// mass it turns it by 15° steps (a rect to whole steps of its own angle), with Shift freely; one undo step; Escape
// puts it back. Demo: Office 1 (m3) is a 40 × 20 rect centred at (120, 200), not turned.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { ROTATE_GAP_PX, rotateHandle } from '../editing.ts'
import { contentBounds } from '../PlanSvg.tsx'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

// framed as the plan frames it: the site and the south street
const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const office = () => useApp.getState().project.masses.find((m) => m.id === 'm3')!.footprint
const handle = () => document.querySelector('[data-handle="rotate"]')!
/** The point at `deg` round the office's centre, as far as the handle. */
const round = (deg: number) => {
  const r = 10 + ROTATE_GAP_PX / v.scale
  return { x: 120 + r * Math.cos((deg * Math.PI) / 180), y: 200 + r * Math.sin((deg * Math.PI) / 180) }
}
const turn = (to: number, extra: object = {}) => {
  fireEvent.pointerDown(handle(), at(round(90), extra))
  fireEvent.pointerMove(handle(), at(round((90 + to) / 2), extra))
  fireEvent.pointerMove(handle(), at(round(to), extra))
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
})

describe('the rotation handle', () => {
  it('stands beyond the side a rect’s up faces, and turns with it; above a free shape', () => {
    const r = rotateHandle({ kind: 'rect', center: { x: 0, y: 0 }, width: 40, depth: 20, rotation: 90 }, 1)
    expect(r.stem.x).toBeCloseTo(-10)
    expect(r.at.x).toBeCloseTo(-10 - ROTATE_GAP_PX)
    const s = rotateHandle({ kind: 'contour', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 0 }, { x: 10, y: 4, r: 0 }, { x: 0, y: 4, r: 0 }] } }, 1)
    expect(s.pivot).toEqual({ x: 5, y: 2 })
    expect(s.at).toEqual({ x: 5, y: 4 + ROTATE_GAP_PX })
  })

  it('a selected mass has one; dragged a quarter round, it turns 90°, one undo step, the angle shown meanwhile', () => {
    const { container } = render(<App />)
    expect(container.querySelector('[data-handle="rotate"]')).toBeNull()
    act(() => useApp.getState().select('m3'))
    turn(180)
    expect(container).toHaveTextContent('90° (+90°)')
    fireEvent.pointerUp(handle(), at(round(180)))
    expect(office()).toMatchObject({ kind: 'rect', center: { x: 120, y: 200 }, rotation: 90 })
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(container).not.toHaveTextContent('(+90°)')
  })

  it('by 15° steps; with Shift freely; Escape puts it back', () => {
    render(<App />)
    act(() => useApp.getState().select('m3'))
    turn(90 + 37)
    expect(office()).toMatchObject({ rotation: 30 })
    fireEvent.pointerMove(handle(), at(round(90 + 37), { shiftKey: true }))
    const f = office()
    expect(f.kind === 'rect' && f.rotation).toBeCloseTo(37, 0)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(office()).toMatchObject({ rotation: 0 })
    expect(useApp.getState().history.past).toHaveLength(0)
  })

  it('two selected: a frame round them and one dot; dragged, they turn together about its centre, as one piece', () => {
    const { container } = render(<App />)
    act(() => useApp.getState().selectMany(['m1', 'm2']))
    // Warehouses 1 and 2 span x 40–390, y 70–150: they turn about (215, 110)
    expect(container.querySelector('[data-group-frame]')).not.toBeNull()
    const dot = () => document.querySelector('[data-handle="group-rotate"]')!
    const r = 40 + ROTATE_GAP_PX / v.scale
    const on = (deg: number) => ({ x: 215 + r * Math.cos((deg * Math.PI) / 180), y: 110 + r * Math.sin((deg * Math.PI) / 180) })
    fireEvent.pointerDown(dot(), at(on(90)))
    fireEvent.pointerMove(dot(), at(on(135)))
    fireEvent.pointerMove(dot(), at(on(182)))
    expect(container).toHaveTextContent('+90°')
    fireEvent.pointerUp(dot(), at(on(182)))
    const rect = (id: string) => useApp.getState().project.masses.find((m) => m.id === id)!.footprint
    expect(rect('m1')).toMatchObject({ center: { x: expect.closeTo(215, 6), y: expect.closeTo(15, 6) }, rotation: 90 })
    expect(rect('m2')).toMatchObject({ center: { x: expect.closeTo(215, 6), y: expect.closeTo(215, 6) }, rotation: 270 })
    expect(useApp.getState().history.past).toHaveLength(1)
    // one locked: no dot
    act(() => useApp.getState().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm1' ? { ...m, locked: true } : m)) })))
    expect(document.querySelector('[data-handle="group-rotate"]')).toBeNull()
  })

  it('a rect already turned goes to whole steps of its angle', () => {
    act(() => useApp.getState().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm3' && m.footprint.kind === 'rect' ? { ...m, footprint: { ...m.footprint, rotation: 7 } } : m)) })))
    render(<App />)
    act(() => useApp.getState().select('m3'))
    // its handle stands at 97°: a turn of 20° ends at 27°, which goes to 30°
    fireEvent.pointerDown(handle(), at(round(97)))
    fireEvent.pointerMove(handle(), at(round(117)))
    expect(office()).toMatchObject({ rotation: 30 })
  })
})
