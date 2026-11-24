// D.1 task 4: the block editor's court pill on the typed dimension. Its plan has no command line, so the field beside the
// pill shows the number; digits typed during the drag or right after it set the depth (Enter); applied, one undo step.
// D.3 task 7: the pill is the shape handles' now (a `value` wall, `views/editing/shape/`): the same drags, the same keys, the one typed dimension.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { actions } from '../../../../state/actions/index.ts'
import { resetTyped, useTyped } from '../../../../views/editing/dimension/typed.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useWarehouse } from '../warehouseState.ts'
import { pxFor } from './planScreen.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../WarehouseScene.tsx', () => ({ WarehouseScene: () => <div data-testid="warehouse-scene" /> }))

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
const steps = () => useApp.getState().history.past.length
const key = (k: string) => fireEvent.keyDown(window, { key: k })
const keys = (text: string) => [...text].forEach((c) => key(c))
const pill = () => document.querySelector('[data-court-pill="wt1/e1"]')!
const field = () => document.querySelector('[data-warehouse-plan] [data-dimension-field]')
/** 10 m down the plan, out of the front: 40 → 50 m. */
const press = () => fireEvent.pointerDown(pill(), { clientX: 0, clientY: 0, pointerId: 1, button: 0 })
const pull = () => fireEvent.pointerMove(pill(), { clientX: 0, clientY: pxFor(10), pointerId: 1 })
const release = () => fireEvent.pointerUp(pill(), { clientX: 0, clientY: pxFor(10), pointerId: 1 })
/** The depth the pill says: what the ghost would make while it is dragged, the court's own once it is not. */
const depth = () => pill().getAttribute('aria-valuenow')

describe('a court’s pill, typed', () => {
  it('during the drag: the field beside the pill says the number, Enter applies the exact depth (no ghost left), one undo step', () => {
    render(<App />)
    const before = steps()
    press()
    pull()
    expect(depth()).toBe('50')
    expect(field()!.textContent).toMatch(/50\s?m/)
    keys('35')
    expect(field()!.textContent).toContain('35')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 35 }])
    // the pointer goes on and lets go: it changes nothing
    fireEvent.pointerMove(pill(), { clientX: 0, clientY: pxFor(30), pointerId: 1 })
    release()
    expect(type().courts).toEqual([{ edge: 'e1', depth: 35 }])
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })

  it('right after the release: corrects it, one undo step', () => {
    render(<App />)
    const before = steps()
    press()
    pull()
    release()
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }])
    keys('60')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 60 }])
    expect(steps()).toBe(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(type().courts).toBeUndefined()
  })

  it('300 is held to 200 and said; Escape during the drag cancels it (nothing applied)', () => {
    render(<App />)
    press()
    pull()
    keys('300')
    key('Enter')
    expect(type().courts).toEqual([{ edge: 'e1', depth: 200 }])
    expect(useTyped.getState().cur?.note).toMatch(/200/)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    press()
    pull()
    key('Escape')
    release()
    expect(type().courts).toBeUndefined()
    expect(useTyped.getState().cur).toBeNull()
    expect(field()).toBeNull()
  })

  it('a cancelled pointer (the system took it) drops the drag: nothing applied, the pointer going on moves nothing', () => {
    render(<App />)
    const before = steps()
    press()
    pull()
    expect(depth()).toBe('50')
    fireEvent.pointerCancel(pill(), { pointerId: 1 })
    expect(depth()).toBe('40')
    fireEvent.pointerMove(pill(), { clientX: 0, clientY: pxFor(30), pointerId: 1 })
    expect(depth()).toBe('40')
    expect(type().courts).toBeUndefined()
    expect(steps()).toBe(before)
    expect(useTyped.getState().cur).toBeNull()
    expect(field()).toBeNull()
  })

  it('a pointer capture lost with no release ends the drag as a release does: the depth it showed is applied', () => {
    render(<App />)
    const before = steps()
    press()
    pull()
    fireEvent.lostPointerCapture(pill(), { pointerId: 1 })
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }])
    expect(steps()).toBe(before + 1)
    fireEvent.pointerMove(pill(), { clientX: 0, clientY: pxFor(30), pointerId: 1 })
    expect(type().courts).toEqual([{ edge: 'e1', depth: 50 }])
    expect(useTyped.getState().cur?.phase).toBe('kept')
  })

  it('the label goes when the drag or the typed value ends; typing after the release brings the field back', () => {
    render(<App />)
    press()
    pull()
    keys('35')
    key('Enter')
    expect(field()).toBeNull()
    release()
    expect(field()).toBeNull()
    // a plain drag, released: no label lingers either, and a digit typed then is the field again
    press()
    pull()
    expect(field()).not.toBeNull()
    release()
    expect(field()).toBeNull()
    keys('4')
    expect(field()!.textContent).toContain('4')
  })

  it('no field without a drag', () => {
    render(<App />)
    expect(field()).toBeNull()
  })
})
