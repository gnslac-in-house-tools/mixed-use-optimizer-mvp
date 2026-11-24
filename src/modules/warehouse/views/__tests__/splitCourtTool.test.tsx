// Phase D.3 task 8: the block editor's Split tool (key S) also cuts a truck court. A press on a zone splits it as before; a press outside every zone begins a line, and the second
// press splits each truck court the line crosses (the type's own courts, one undo step). A line across no court says *Split takes a truck court for now*. The block editor has no
// command line, so the second point is a click here (the site's tool takes it typed).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { commandForKey } from '../../../../views/commands/shortcuts.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { TYPOLOGIES } from '../../../../typologies/index.ts'
import { useWarehouse } from '../warehouseState.ts'
import { screenAt } from './planScreen.ts'
import type { Point } from '../../../../model/schema.ts'

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
const plan = () => screen.getByRole('img', { name: 'The warehouse type in plan' })
const click = (q: Point) => {
  fireEvent.pointerDown(plan(), { ...screenAt(q), pointerId: 1, button: 0 })
  fireEvent.pointerUp(plan(), { ...screenAt(q), pointerId: 1, button: 0 })
}
const toast = () => useToast.getState().toast?.text
/** The truck courts on the front wall (e1) the type keeps. */
const frontCourts = () => (type().courts ?? []).filter((c) => c.edge === 'e1')

describe('the Split tool in the block editor', () => {
  it('S takes it and again lets it go; the Rules window’s S is its own', () => {
    render(<App />)
    expect(commandForKey('S', 'block-editor')?.id).toBe('block.split')
    fireEvent.keyDown(window, { key: 's' })
    expect(useWarehouse.getState().tool).toBe('split')
    fireEvent.keyDown(window, { key: 's' })
    expect(useWarehouse.getState().tool).toBe('select')
    expect(within(screen.getByRole('group', { name: 'Edit' })).getByRole('button', { name: /^Split/ })).toBeInTheDocument()
  })

  it('a line begun outside the block and ended across the front court: two courts on the wall, one undo step', () => {
    render(<App />)
    act(() => useWarehouse.getState().setTool('split'))
    const before = useApp.getState().history.past.length
    // the front court lies in front of e1 (y below 0 on the plan); the line runs square across it from far out
    click({ x: 100, y: -60 })
    expect(useApp.getState().history.past.length).toBe(before)
    click({ x: 100, y: -2 })
    expect(frontCourts()).toHaveLength(2)
    expect(frontCourts().every((c) => c.shape)).toBe(true)
    expect(useApp.getState().history.past.length).toBe(before + 1)
    act(() => useApp.getState().undo())
    expect(frontCourts().length).toBeLessThanOrEqual(1)
  })

  it('a line across no court says so and writes nothing', () => {
    render(<App />)
    act(() => useWarehouse.getState().setTool('split'))
    const before = useApp.getState().history.past.length
    click({ x: -40, y: 20 })
    click({ x: -40, y: 80 })
    expect(toast()).toBe('Split takes a truck court for now')
    expect(useApp.getState().history.past.length).toBe(before)
  })

  it('a press on a zone still splits the zone (nothing begins a line)', () => {
    act(() => {
      for (const s of (['grid', 'hall', 'columns', 'envelope'] as const)) useApp.getState().apply((p) => actions.lockWarehouseStep(p, 'wt1', s))
    })
    render(<App />)
    act(() => useWarehouse.getState().setTool('split'))
    click({ x: 100, y: 48 })
    expect(type().morphology.zones!.map((z) => z.x)).toEqual([
      [0, 33],
      [33, 66],
    ])
    expect(frontCourts()).toHaveLength(0)
  })
})

describe('Backspace with a line begun (review S5)', () => {
  it('steps the line back and never deletes what is picked', () => {
    render(<App />)
    act(() => useWarehouse.setState({ picked: [{ kind: 'court', id: 'e1' }] }))
    act(() => useWarehouse.getState().setTool('split'))
    const before = useApp.getState().history.past.length
    click({ x: 100, y: -60 })
    fireEvent.pointerMove(plan(), { ...screenAt({ x: 100, y: -30 }), pointerId: 1 })
    expect(document.querySelector('[data-split-line]')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(document.querySelector('[data-split-line]')).toBeNull()
    expect(useWarehouse.getState().picked).toEqual([{ kind: 'court', id: 'e1' }])
    expect(useApp.getState().history.past.length).toBe(before)
  })
})

describe('Split without the docks module (review S7)', () => {
  it('a press outside every zone begins no line: there is no truck court to cut', () => {
    const bare = { ...TYPOLOGIES[0], id: 'bare-test', modules: ['warehouse'] as string[] }
    TYPOLOGIES.push(bare)
    try {
      act(() => useApp.setState({ project: { ...useApp.getState().project, typology: 'bare-test' } }))
      render(<App />)
      act(() => useWarehouse.getState().setTool('split'))
      click({ x: 100, y: -60 })
      fireEvent.pointerMove(plan(), { ...screenAt({ x: 100, y: -30 }), pointerId: 1 })
      expect(document.querySelector('[data-split-line]')).toBeNull()
    } finally {
      TYPOLOGIES.pop()
    }
  })
})
