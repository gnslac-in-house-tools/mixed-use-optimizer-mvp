// The plan by level (Decision "Levels", 2.9b): the active level, the levels below faded, the reference dashed, All.
// Some cases are ported from Plaza-Practiko `vistas/paneles/__tests__/nivelesTodos.test.tsx`.
import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Footprint, Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { addLevelAtEnd } from '../../../state/actions/levels.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { copySelection, paste, useClipboard } from '../clipboard.ts'
import { useCommand } from '../command/commandState.ts'
import { resetTyped } from '../../editing/dimension/typed.ts'
import { REFERENCE_DEFAULT, useReference } from '../reference.ts'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { planPointer, useDimensions, useTool } from '../tools/toolState.ts'
import { letGo, take } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const rect = (cx: number, cy: number, width: number, depth: number): Footprint => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation: 0 })

/** The demo (m1, m2, m3 on L1), plus L2 above with m4 over Warehouse 1 and B1 below with m5. */
function project(): Project {
  let p = demoProject()
  const up = addLevelAtEnd(p, 'above') // l2, L2 at 12
  const down = addLevelAtEnd(up.project, 'below') // l3, B1 at −12
  p = addMass(down.project, { programId: 'office', footprint: rect(120, 110, 60, 40), levelId: up.id }).project
  return addMass(p, { programId: 'warehouse', footprint: rect(320, 110, 100, 60), levelId: down.id }).project
}

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
})
const click = (q: Point) => {
  const c = document.querySelector('[data-capture]')!
  fireEvent.pointerDown(c, at(q))
  fireEvent.pointerUp(c, at(q))
}
const key = (k: string) => fireEvent.keyDown(window, { key: k })
/** The ids on the plan's shapes with that attribute (the selected mass's handles carry `data-mass` too). */
const ids = (attr: string) => [...document.querySelectorAll(`path[${attr}], g[${attr}]:not([data-layer])`)].map((x) => x.getAttribute(attr))

beforeEach(() => {
  localStorage.clear()
  const p = project()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] }, level: 'l1', showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null })
  useSnapSettings.setState({ settings: DEFAULT_SNAP })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useReference.setState(REFERENCE_DEFAULT)
  planPointer.point = null
})

describe('the plan of a level', () => {
  it('draws the active level; the levels below faded, lowest first; the ones above not at all', () => {
    render(<App />)
    expect(ids('data-mass')).toEqual(['m1', 'm2', 'm3'])
    expect(ids('data-lower-mass')).toEqual(['m5'])
    act(() => useApp.getState().setLevel('l2'))
    expect(ids('data-mass')).toEqual(['m4'])
    expect(ids('data-lower-mass')).toEqual(['m5', 'm1', 'm2', 'm3'])
    act(() => useApp.getState().setLevel('l3'))
    expect(ids('data-mass')).toEqual(['m5'])
    expect(ids('data-lower-mass')).toEqual([])
  })

  it('Ref.: the levels within its reach, dashed on top, fainter the farther; off, nothing (Decision "Reference reach")', () => {
    render(<App />)
    const k = (id: string) => document.querySelector(`[data-reference="${id}"]`)?.getAttribute('data-reference-k')
    const opacity = (id: string) => Number(document.querySelector(`[data-reference="${id}"]`)!.getAttribute('stroke-opacity'))
    expect(ids('data-reference')).toEqual([])
    // on L1: one above is L2 (m4)
    act(() => useReference.getState().setReach({ below: 0, above: 1 }))
    expect(ids('data-reference')).toEqual(['m4'])
    // on L2, all below: L1 (m1–m3) and B1 (m5), the farther drawn first and fainter
    act(() => useApp.getState().setLevel('l2'))
    act(() => useReference.getState().setReach({ below: Infinity, above: 0 }))
    expect(ids('data-reference')).toEqual(['m5', 'm1', 'm2', 'm3'])
    expect([k('m1'), k('m5')]).toEqual(['1', '2'])
    expect(opacity('m5')).toBeLessThan(opacity('m1'))
    // one below only
    act(() => useReference.getState().setReach({ below: 1 }))
    expect(ids('data-reference')).toEqual(['m1', 'm2', 'm3'])
    // a click turns it off, keeping the reach; again, back
    act(() => useReference.getState().toggle())
    expect(ids('data-reference')).toEqual([])
    act(() => useReference.getState().toggle())
    expect(ids('data-reference')).toHaveLength(3)
    // none either way: off
    act(() => useReference.getState().setReach({ below: 0, above: 0 }))
    expect(useReference.getState().on).toBe(false)
  })

  it('changing level or showing All does not move the plan (port)', () => {
    const { container } = render(<App />)
    const box = () => container.querySelector('svg[aria-label="Site plan"]')!.getAttribute('viewBox')
    const before = box()
    act(() => useApp.getState().setLevel('l2'))
    expect(box()).toBe(before)
    act(() => useApp.getState().setShowAll(true))
    expect(box()).toBe(before)
  })
})

describe('All', () => {
  it('every level’s masses, lowest first; a click selects one and goes to its level (port)', () => {
    render(<App />)
    act(() => useApp.getState().setShowAll(true))
    expect(ids('data-all-mass')).toEqual(['m5', 'm1', 'm2', 'm3', 'm4'])
    expect(ids('data-mass')).toEqual([])
    expect(ids('data-lower-mass')).toEqual([])
    fireEvent.click(document.querySelector('[data-all-mass="m4"]')!)
    expect(useApp.getState()).toMatchObject({ showAll: false, level: 'l2', selection: { massId: 'm4' } })
    expect(ids('data-mass')).toEqual(['m4'])
  })

  it('Enter on a mass selects it and goes to its level (port)', () => {
    render(<App />)
    act(() => useApp.getState().setShowAll(true))
    fireEvent.keyDown(document.querySelector('[data-all-mass="m5"]')!, { key: 'Enter' })
    expect(useApp.getState()).toMatchObject({ showAll: false, level: 'l3', selection: { massId: 'm5' } })
  })

  it('is a view: it lets go of the selection and the tool; a drawing tool goes back to the level (port)', () => {
    render(<App />)
    act(() => {
      useApp.getState().select('m1')
      take('mass')
      useApp.getState().setShowAll(true)
    })
    expect(useApp.getState()).toMatchObject({ showAll: true, level: 'l1', selection: { massId: null } })
    expect(useTool.getState().tool).toBe('select')
    key('b')
    expect(useTool.getState().tool).toBe('mass')
    expect(useApp.getState().showAll).toBe(false)
  })
})

describe('what is made goes on the active level', () => {
  it('a pasted mass, and a dimension; a dimension shows on its level only', () => {
    render(<App />)
    act(() => {
      useApp.getState().select('m3')
      copySelection()
      useApp.getState().setLevel('l2')
      paste()
    })
    const pasted = useApp.getState().project.masses.at(-1)!
    expect(pasted.levelId).toBe('l2')
    expect(useApp.getState().selection.massId).toBe(pasted.id)

    key('d')
    click({ x: 250, y: 30 })
    click({ x: 390, y: 30 })
    click({ x: 320, y: 20 })
    expect(useApp.getState().project.dimensions).toMatchObject([{ id: 'd1', levelId: 'l2' }])
    expect(document.querySelector('[data-dimension="d1"]')).not.toBeNull()
    act(() => useApp.getState().setLevel('l1'))
    expect(document.querySelector('[data-dimension="d1"]')).toBeNull()
  })

  it('a dimension selected on a level is let go when the plan goes to another', () => {
    render(<App />)
    act(() => {
      useApp.getState().apply((p) => ({ ...p, dimensions: [{ id: 'd1', levelId: 'l1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: 2 }] }))
      useDimensions.getState().select('d1')
    })
    act(() => useApp.getState().setLevel('l2'))
    expect(useDimensions.getState().selected).toBeNull()
  })
})
