// The On edge views in the block editor (Phase D.3 task 10): a slide of the docks picked is typed (the number typed after the drag slides them exactly, one undo step), the preview is the
// engine's, and a press on a wall that is not along the grid says why. (The site's presses: modules/warehouse/views/__tests__/blockSiteTools.test.tsx.)
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { screenAt } from '../../../../modules/warehouse/views/__tests__/planScreen.ts'
import { useWarehouse } from '../../../../modules/warehouse/views/warehouseState.ts'
import { useToast } from '../../../layout/toast.ts'
import { useUi } from '../../../layout/ui.ts'
import { resetTyped } from '../../dimension/typed.ts'

vi.mock('../../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../../../modules/warehouse/views/WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = actions.addWarehouseType(demoProject()).project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, option: p.options[0].id })
  useUi.setState({ dialog: 'program', view: 'plan', panels: { left: true, right: true }, sheet: null })
  useWarehouse.setState({ programId: null, typeId: null, shown: null, tool: 'select', picked: [] })
  useToast.setState({ toast: null })
  resetTyped()
})

const type = () => useApp.getState().project.warehouseTypes![0]
const plan = () => document.querySelector('[data-warehouse-plan]')!
const modules = () => type().elements.filter((e) => e.id === 'e59' || e.id === 'e60').map((e) => e.module)
const at = (x: number, y: number) => ({ ...screenAt({ x, y }), pointerId: 1 })

/** Picks e59 and e60 by a window, then presses e60 on its wall and drags it to `x`. */
function dragSlide(x: number) {
  fireEvent.pointerDown(plan(), { ...at(184, -5), button: 0 })
  fireEvent.pointerMove(plan(), at(189.5, 1))
  fireEvent.pointerUp(plan(), { ...at(189.5, 1), button: 0 })
  const line = document.querySelector('[data-handle="edge-line-e1"]')!
  fireEvent.pointerDown(line, { ...at(188.5, -0.3), button: 0 })
  fireEvent.pointerMove(plan(), at(x, -0.3))
  fireEvent.pointerUp(plan(), { ...at(x, -0.3), button: 0 })
}

describe('a slide of the docks picked', () => {
  it('drawn from the engine: both slid by the modules the pointer passed, one undo step', () => {
    render(<App />)
    const steps = useApp.getState().history.past.length
    dragSlide(197.5)
    expect(modules()).toEqual([64, 65])
    expect(useApp.getState().history.past.length).toBe(steps + 1)
  })

  it('a number typed after the drag slides them exactly, in the same one undo step', () => {
    render(<App />)
    const steps = useApp.getState().history.past.length
    dragSlide(197.5)
    expect(modules()).toEqual([64, 65])
    act(() => {
      fireEvent.keyDown(window, { key: '1' })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(modules()).toEqual([62, 63])
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(modules()).toEqual([61, 62])
  })

  it('a number typed during the drag ends it: the pointer’s release adds nothing', () => {
    render(<App />)
    fireEvent.pointerDown(plan(), { ...at(184, -5), button: 0 })
    fireEvent.pointerMove(plan(), at(189.5, 1))
    fireEvent.pointerUp(plan(), { ...at(189.5, 1), button: 0 })
    const line = document.querySelector('[data-handle="edge-line-e1"]')!
    fireEvent.pointerDown(line, { ...at(188.5, -0.3), button: 0 })
    fireEvent.pointerMove(plan(), at(197.5, -0.3))
    act(() => {
      fireEvent.keyDown(window, { key: '2' })
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    fireEvent.pointerUp(plan(), { ...at(197.5, -0.3), button: 0 })
    expect(modules()).toEqual([63, 64])
  })
})

describe('a press with a tool in hand', () => {
  it('Dock on a module of a wall puts one dock there, one undo step; the same press takes it away', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'dock' }))
    const steps = useApp.getState().history.past.length
    const count = () => type().elements.filter((e) => e.kind === 'dock').length
    const before = count()
    // the first wall's module with no dock yet: a press 0.3 m inside the face of the back wall (y = 0 is the front)
    const read = actions.edgeOf(useApp.getState().project, { kind: 'block-type', id: type().id })!
    const held = new Set(type().elements.filter((e) => e.kind === 'dock').map((e) => `${e.edge}:${e.module}`))
    const edge = read.edges.find((e) => e.slots.some((s) => !held.has(`${e.id}:${s.k}`)))!
    const slot = edge.slots.find((s) => !held.has(`${edge.id}:${s.k}`))!
    const mid = (slot.from + slot.to) / 2
    const q = { x: edge.origin.x + edge.dir.x * mid - edge.out.x * 0.3, y: edge.origin.y + edge.dir.y * mid - edge.out.y * 0.3 }
    fireEvent.pointerDown(plan(), { ...at(q.x, q.y), button: 0 })
    fireEvent.pointerUp(plan(), { ...at(q.x, q.y), button: 0 })
    expect(count()).toBe(before + 1)
    expect(useApp.getState().history.past.length).toBe(steps + 1)
    fireEvent.pointerDown(plan(), { ...at(q.x, q.y), button: 0 })
    fireEvent.pointerUp(plan(), { ...at(q.x, q.y), button: 0 })
    expect(count()).toBe(before)
  })
})

describe('the hover of an element tool in the block editor', () => {
  it('is drawn under the pointer and cleared when the pointer leaves the plan', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'dock' }))
    fireEvent.pointerMove(plan(), at(188.5, -0.3))
    const shown = () => Number(document.querySelector('[data-modules-shown]')?.getAttribute('data-modules-shown') ?? 0)
    expect(shown()).toBeGreaterThan(0)
    fireEvent.pointerLeave(plan())
    expect(shown()).toBe(0)
    expect(document.querySelector('[data-bay-preview]')).toBeNull()
  })

  it('a move over an element outside the plan, after leaving it, draws nothing', () => {
    render(<App />)
    act(() => useWarehouse.setState({ tool: 'dock' }))
    fireEvent.pointerMove(plan(), at(188.5, -0.3))
    fireEvent.pointerLeave(plan())
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    fireEvent.pointerMove(outside, at(188.5, -0.3))
    expect(document.querySelector('[data-modules-shown]')?.getAttribute('data-modules-shown') ?? '0').toBe('0')
    outside.remove()
  })
})
