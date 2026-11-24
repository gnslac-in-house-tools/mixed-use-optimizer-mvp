// The Hole tool and the holes' handles (Phase H.3, Decision "Holes and free geometry"; cases from Plaza-Practiko's
// `huecos.test.tsx` and `huecosEdicion.test.ts`): H draws a hole as Mass draws a mass, into the mass it falls on (none:
// it says so); the hole's edge moves it (Alt+drag copies), a click picks it and Delete removes it; its corners and
// walls reshape it; a double click on its edge adds a corner. Demo: m1 x 40…200, y 70…150 (a warehouse, 12,800 m²).
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contour, Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { contourFromPolygon } from '../../../engine/geom/contour.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { useHoles } from '../holeState.ts'
import { contentBounds } from '../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useTool } from '../tools/toolState.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const box = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ])
const holes = (p: Project, id = 'm1') => p.masses.find((m) => m.id === id)?.holes ?? []
const s = () => useApp.getState()
/** A point where expected, to the micrometre (the pointer works in pixels). */
const near = (q: Point, x: number, y: number) => {
  expect(q.x).toBeCloseTo(x, 6)
  expect(q.y).toBeCloseTo(y, 6)
}

const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const capture = () => document.querySelector('[data-capture]')!
const drag = (el: Element, a: Point, b: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(a, extra))
  fireEvent.pointerMove(el, at({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(b, extra))
  fireEvent.pointerUp(el, at(b, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useToast.setState({ toast: null, confirmation: null })
  useHoles.setState({ pick: null })
})

describe('the hole verbs', () => {
  const p = demoProject()
  const one = actions.addHole(p, 'm1', box(100, 100, 120, 120))!

  it('add, move, copy, redraw and remove; the last one gone leaves no field', () => {
    expect(one.k).toBe(0)
    expect(holes(actions.moveHole(one.project, 'm1', 0, { x: 5, y: 0 }))[0].vertices[0]).toMatchObject({ x: 105, y: 100 })
    const copy = actions.copyHole(one.project, 'm1', 0, { x: 30, y: 0 })!
    expect(copy.k).toBe(1)
    expect(holes(copy.project)[1].vertices[0]).toMatchObject({ x: 130, y: 100 })
    expect(holes(actions.setHole(one.project, 'm1', 0, box(60, 80, 70, 90)))[0].vertices[0]).toMatchObject({ x: 60, y: 80 })
    expect('holes' in actions.removeHole(one.project, 'm1', 0).masses[0]).toBe(false)
  })

  it('corners and walls: move, add, remove (a hole keeps 3), push a wall out', () => {
    const q = one.project
    expect(holes(actions.moveHoleVertex(q, 'm1', 0, 2, { x: 125, y: 125 }))[0].vertices[2]).toMatchObject({ x: 125, y: 125 })
    expect(actions.dragHoleVertex(q, 'm1', 0, 2, { x: 100, y: 100 })).toBeNull()
    const five = actions.insertHoleVertex(q, 'm1', 0, 0, { x: 110, y: 99 })
    expect(holes(five)[0].vertices).toHaveLength(5)
    expect(holes(five)[0].vertices[1]).toMatchObject({ x: 110, y: 100 })
    expect(holes(actions.removeHoleVertex(five, 'm1', 0, 1).project)[0].vertices).toHaveLength(4)
    const three = actions.removeHoleVertex(q, 'm1', 0, 0).project
    expect(actions.removeHoleVertex(three, 'm1', 0, 0)).toEqual({ project: three, reason: 'the shape needs at least 3 corners' })
    const wider = actions.moveHoleWall(q, 'm1', 0, 0, 5)
    expect(wider.applied).toBe(5)
    expect(derive(wider.project).masses.m1.area).toBeCloseTo(12800 - 20 * 25, 6)
  })
})

describe('the Hole tool (H)', () => {
  it('a drag over a mass cuts a hole in it: the mass picked, the hole too, one undo step', () => {
    render(<App />)
    key('h')
    expect(useTool.getState().tool).toBe('hole')
    drag(capture(), { x: 100, y: 100 }, { x: 120, y: 120 })
    expect(holes(s().project)).toHaveLength(1)
    expect(s().derived.masses.m1.area).toBeCloseTo(12800 - 400, 0)
    expect(s().selection.massId).toBe('m1')
    expect(useHoles.getState().pick).toEqual({ massId: 'm1', k: 0, vertex: null })
    expect(useTool.getState().tool).toBe('select')
    act(() => s().undo())
    expect(holes(s().project)).toEqual([])
  })

  it('corner by corner, Enter closes; drawn where there is no mass, it says so', () => {
    render(<App />)
    key('h')
    for (const q of [
      { x: 60, y: 80 },
      { x: 90, y: 80 },
      { x: 75, y: 100 },
    ]) {
      fireEvent.pointerDown(capture(), at(q))
      fireEvent.pointerUp(capture(), at(q))
    }
    key('Enter')
    expect(holes(s().project)[0].vertices).toHaveLength(3)
    key('h')
    drag(capture(), { x: 210, y: 200 }, { x: 240, y: 230 })
    expect(useToast.getState().toast).toMatchObject({ text: 'A hole goes inside a block: draw it over one.' })
    expect(holes(s().project)).toHaveLength(1)
  })
})

describe('the hole’s handles', () => {
  const withHole = () => {
    act(() => {
      s().apply((p) => actions.addHole(p, 'm1', box(100, 100, 120, 120))!.project)
      s().select('m1')
    })
  }

  it('its edge drags it; Alt+drag copies it; a click picks it and Delete removes it, not the mass', () => {
    render(<App />)
    withHole()
    const edge = () => screen.getAllByRole('button', { name: 'Hole 1' })[0]
    drag(edge(), { x: 100, y: 110 }, { x: 110, y: 110 })
    near(holes(s().project)[0].vertices[0], 110, 100)
    drag(edge(), { x: 110, y: 110 }, { x: 110, y: 80 }, { altKey: true })
    expect(holes(s().project)).toHaveLength(2)
    expect(useHoles.getState().pick).toMatchObject({ k: 1 })
    key('Delete')
    expect(holes(s().project)).toHaveLength(1)
    expect(s().project.masses.some((m) => m.id === 'm1')).toBe(true)
  })

  it('a corner drags; picked, Delete takes it out; a double click on the edge adds one', () => {
    render(<App />)
    withHole()
    const dot = (i: number) => document.querySelector(`[data-hole="0"] [data-hole-vertex="${i}"]`)!
    drag(dot(2), { x: 120, y: 120 }, { x: 125, y: 130 })
    near(holes(s().project)[0].vertices[2], 125, 130)
    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Hole 1' })[0], at({ x: 110, y: 100 }))
    expect(holes(s().project)[0].vertices).toHaveLength(5)
    expect(useHoles.getState().pick).toEqual({ massId: 'm1', k: 0, vertex: 1 })
    key('Delete')
    expect(holes(s().project)[0].vertices).toHaveLength(4)
  })

  it('a locked mass shows none', () => {
    render(<App />)
    withHole()
    act(() => s().apply((p) => actions.lockMasses(p, ['m1'], true)))
    expect(screen.queryByRole('button', { name: 'Hole 1' })).toBeNull()
  })
})
