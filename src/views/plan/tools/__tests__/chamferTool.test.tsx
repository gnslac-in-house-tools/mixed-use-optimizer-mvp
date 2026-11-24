// D.1 task 7: the Chamfer tool (Shift+F) beside Corner, through <App />: a click on a corner, the pointer sets both set-backs (0.1 m,
// Shift free), a click, Enter or a typed number sets them; one undo step a corner; Escape lets the corner go, then the tool. A block's
// corner is taken by both tools (D.2: its outline is free). jsdom has no layout: `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { chamferOf } from '../../../../engine/geom/contour.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import { placeCopy } from '../../../../modules/warehouse/views/commands.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { resetTyped } from '../../../editing/dimension/typed.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { letGo } from '../../../tools/hand.ts'
import { fit, UNMEASURED_SIZE } from '../../camera.ts'
import { useCommand } from '../../command/commandState.ts'
import { contentBounds } from '../../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../../snap/kinds.ts'
import { useSnapSettings } from '../../snap/settings.ts'
import { planPointer, useTool } from '../toolState.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

const s = () => useApp.getState()
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const capture = () => document.querySelector('[data-capture]')!
const masses = () => s().project.masses
const mass = (id: string) => masses().find((m) => m.id === id)!

let at = (q: Point, extra: object = {}): object => ({ ...q, ...extra })
function camera() {
  const v = fit(contentBounds(derive(s().project, 'o1')), UNMEASURED_SIZE)
  at = (q, extra = {}) => ({
    clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
    clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
    button: 0,
    pointerId: 1,
    ...extra,
  })
}
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}
const move = (q: Point, extra: object = {}) => fireEvent.pointerMove(capture(), at(q, extra))
const typeInLine = (text: string) => {
  const line = screen.getByRole('textbox', { name: 'Command line' })
  fireEvent.change(line, { target: { value: text } })
  fireEvent.keyDown(line, { key: 'Enter' })
}

// Warehouse 1's top-left corner (vertex 3): its bisector runs down and right, so the pointer at (45, 145) is the middle of a cut of 10 × 10
const CORNER: Point = { x: 40.5, y: 149.5 }
const chamfer3 = () => chamferOf(footprintContour(mass('m1').footprint), 3)

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, level: 'l1', option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: true })
  letGo()
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
  planPointer.point = null
})

describe('the Chamfer tool', () => {
  it('Shift+F takes the tool, again goes back to Select, and does not fire while typing', () => {
    render(<App />)
    key('F', { shiftKey: true })
    expect(useTool.getState().tool).toBe('chamfer')
    key('F', { shiftKey: true })
    expect(useTool.getState().tool).toBe('select')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'F', shiftKey: true })
    expect(useTool.getState().tool).toBe('select')
    input.remove()
  })

  it('a click on a corner picks it, the pointer sets both set-backs by 0.1 m, a click sets them: one undo step, the rect a contour', () => {
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    expect(s().selection).toEqual({ massId: 'm1', vertex: 3, massIds: ['m1'] })
    move({ x: 45.02, y: 144.98 })
    expect(screen.getByText('10.00 × 10.00 m')).toBeInTheDocument()
    fireEvent.pointerUp(capture(), at({ x: 45.02, y: 144.98 }))
    const k = chamfer3()!
    expect(mass('m1').footprint.kind).toBe('contour')
    expect(k[0]).toBeCloseTo(10, 6)
    expect(k[1]).toBeCloseTo(10, 6)
    expect(s().history.past).toHaveLength(1)
    act(() => s().undo())
    expect(mass('m1').footprint.kind).toBe('rect')
  })

  it('Shift leaves the set-back free, not rounded to 0.1 m', () => {
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    // the advance along the bisector is 1.745 m: a set-back of 2.468
    move({ x: 41.234, y: 148.766 }, { shiftKey: true })
    fireEvent.pointerUp(capture(), at({ x: 41.234, y: 148.766 }, { shiftKey: true }))
    expect(chamfer3()![0]).toBeCloseTo(2.468, 2)
  })

  it('Enter sets what the pointer showed', () => {
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    move({ x: 43, y: 147 })
    key('Enter')
    expect(chamfer3()![0]).toBeCloseTo(6, 6)
    expect(s().history.past).toHaveLength(1)
  })

  it('a typed 3 sets both set-backs to 3, one undo step', () => {
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    typeInLine('3')
    expect(chamfer3()).toEqual([3, 3])
    expect(s().history.past).toHaveLength(1)
  })

  it('a typed 0 takes the chamfer away; a radius on the corner goes when a chamfer comes', () => {
    act(() => s().apply((p) => actions.setCornerRadius(p, 'm1', 3, 4)))
    expect(footprintContour(mass('m1').footprint).vertices[3].r).toBe(4)
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    typeInLine('3')
    expect(footprintContour(mass('m1').footprint).vertices[3]).toMatchObject({ r: 0, chamfer: [3, 3] })
    click(CORNER)
    typeInLine('0')
    expect(chamfer3()).toBeNull()
  })

  it('Escape lets the corner go, then the tool', () => {
    render(<App />)
    camera()
    key('F', { shiftKey: true })
    click(CORNER)
    move({ x: 45, y: 145 })
    expect(document.querySelector('[data-chamfer-preview]')).not.toBeNull()
    key('Escape')
    expect(document.querySelector('[data-chamfer-preview]')).toBeNull()
    expect(useTool.getState().tool).toBe('chamfer')
    key('Escape')
    expect(useTool.getState().tool).toBe('select')
    expect(chamfer3()).toBeNull()
  })
})

describe('a block’s corner (its outline is free: Phase D.2)', () => {
  function placed() {
    const p = actions.addWarehouseType(demoProject()).project
    useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory() })
    // the plan frames what stood when it opened: the pointer is placed by that frame
    camera()
    render(<App />)
    act(() => placeCopy('wt1'))
    const hall = masses().find((m) => m.part === 'hall')!
    // the copy stands on its own level: the tools work on the active one
    act(() => s().setLevel(hall.levelId))
    return { hall, corner: footprintContour(hall.footprint).vertices[0] }
  }
  const own = (hall: { id: string }) => {
    const p = s().project
    const b = p.buildings.find((x) => x.warehouse && x.levels.some((l) => p.masses.some((m) => m.id === hall.id && m.levelId === l.id)))!
    return b.warehouse!.overrides?.morphology?.outline
  }

  it('the chamfer tool cuts it: the copy a variant, one undo step', () => {
    const { hall, corner } = placed()
    const steps = s().history.past.length
    key('F', { shiftKey: true })
    expect(useTool.getState().tool).toBe('chamfer')
    click({ x: corner.x, y: corner.y })
    typeInLine('3')
    expect(own(hall)![0].chamfer).toEqual([3, 3])
    expect(s().history.past).toHaveLength(steps + 1)
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => s().undo())
    expect(own(hall)).toBeUndefined()
  })

  it('a chamfered block’s other corners are picked on its face, not on the faceted footprint (the indices differ)', () => {
    const { hall } = placed()
    const ref = { kind: 'mass', id: hall.id }
    act(() => s().apply((p) => actions.editShape(p, ref, { op: 'chamfer', vertex: 0, a: 3, b: 3 }).project))
    const face = () => actions.shapeOf(s().project, ref)!.contour
    expect(face().vertices).toHaveLength(4)
    // the footprint has a point more than the face has corners: its corner numbers run ahead of the face's
    expect(footprintContour(mass(hall.id).footprint).vertices.length).toBeGreaterThan(4)
    const target = face().vertices[2]
    key('f')
    click({ x: target.x, y: target.y })
    typeInLine('2')
    expect(face().vertices[2].r).toBeCloseTo(2, 6)
    expect(face().vertices[3].r ?? 0).toBe(0)
    // and the chamfer tool reads the same corner
    key('F', { shiftKey: true })
    const other = face().vertices[1]
    click({ x: other.x, y: other.y })
    typeInLine('1.5')
    expect(face().vertices[1].chamfer).toEqual([1.5, 1.5])
  })

  it('the corner tool rounds it: the copy a variant, one undo step', () => {
    const { hall, corner } = placed()
    const steps = s().history.past.length
    key('f')
    expect(useTool.getState().tool).toBe('corner')
    click({ x: corner.x, y: corner.y })
    typeInLine('2')
    expect(own(hall)![0].r).toBeCloseTo(2, 6)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
