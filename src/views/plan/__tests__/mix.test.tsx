// GT.3 (Decision "Mixed selection"): Shift+click and the selection window pick every kind together on the plan; a plain
// click still picks one thing alone.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { addLot } from '../../../modules/parking/actions.ts'
import { useLots } from '../../../modules/parking/views/lotState.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { useToast } from '../../layout/toast.ts'
import { useAccess } from '../access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../camera.ts'
import { useRoads } from '../circulation/roadState.ts'
import { useClipboard } from '../clipboard.ts'
import { useCommand } from '../command/commandState.ts'
import { resetTyped } from '../../editing/dimension/typed.ts'
import { pickOnPlan } from '../massCommands.ts'
import { addToMix, nothingPicked, pickedNow, selectBox, setPicked } from '../mix.ts'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useDimensions } from '../tools/toolState.ts'
import { handleKey } from '../../useShortcuts.ts'
import { letGo, take } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const v = fit({ minX: 0, minY: 0, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const plan = () => screen.getByRole('img', { name: 'Site plan' })
const drag = (el: Element, from: Point, to: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}

/** The demo with a free lot and a dimension on the active level. Their ids. */
function withLotAndDimension() {
  let lot = ''
  let dim = ''
  act(() => {
    useApp.getState().apply((p) => {
      const l = addLot(p, 'o1', { rect: { center: { x: 220, y: 200 }, width: 40, depth: 30, rotation: 0 } })!
      lot = l.id
      const d = actions.addDimension(l.project, { x: 60, y: 60 }, { x: 100, y: 60 }, 8, 'l1')!
      dim = d.id
      return d.project
    })
  })
  return { lot, dim }
}
const gateId = () => useApp.getState().derived.circulation.gates[0].id

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  letGo()
  useDimensions.setState({ selected: null, also: [] })
  useRoads.setState({ picked: null, node: null, also: [] })
  useLots.setState({ picked: null, also: [] })
  letGo()
  useAccess.setState({ picked: null, alsoGates: [] })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  resetTyped()
  useToast.setState({ toast: null, confirmation: null })
})

describe('mixed selection', () => {
  it('Shift+click a lot, a dimension and a gate after a mass keeps them all picked', () => {
    const { lot, dim } = withLotAndDimension()
    pickOnPlan('m1')
    addToMix('lot', lot)
    addToMix('dimension', dim)
    addToMix('gate', gateId())
    expect(pickedNow()).toEqual({ masses: ['m1'], nodes: [], existing: [], lots: [lot], gates: [gateId()], dimensions: [dim], lines: [], notes: [], drawings: [] })
    expect(useApp.getState().selection.massIds).toEqual(['m1'])
    expect(nothingPicked()).toBe(false)
  })

  it('Shift+click a street and a mass joins what is picked', () => {
    const road = useApp.getState().derived.circulation.roads.find((r) => r.kind === 'street')!
    addToMix('road', road.id)
    addToMix('mass', 'm2')
    const now = pickedNow()
    expect(now.masses).toEqual(['m2'])
    expect(now.nodes).toEqual(road.nodes)
  })

  it('a plain click still picks one thing alone', () => {
    const { lot, dim } = withLotAndDimension()
    pickOnPlan('m1')
    addToMix('lot', lot)
    addToMix('dimension', dim)
    addToMix('gate', gateId())
    act(() => useLots.getState().pick(lot))
    expect(pickedNow()).toEqual({ masses: [], nodes: [], existing: [], lots: [lot], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
    addToMix('dimension', dim)
    act(() => pickOnPlan('m2'))
    expect(pickedNow()).toEqual({ masses: ['m2'], nodes: [], existing: [], lots: [], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
  })

  it('Shift+click on a picked one takes it out', () => {
    const { lot, dim } = withLotAndDimension()
    pickOnPlan('m1')
    addToMix('lot', lot)
    addToMix('dimension', dim)
    addToMix('lot', lot)
    expect(pickedNow().lots).toEqual([])
    expect(pickedNow().dimensions).toEqual([dim])
    addToMix('mass', 'm1')
    addToMix('dimension', dim)
    expect(nothingPicked()).toBe(true)
  })

  it('the window picks masses, streets, lots, gates and dimensions inside it', () => {
    withLotAndDimension()
    render(<App />)
    drag(plan(), { x: -5, y: 285 }, { x: 445, y: -5 })
    const now = pickedNow()
    expect(now.masses.length).toBeGreaterThan(0)
    expect(now.nodes.length).toBeGreaterThan(0)
    expect(now.lots.length).toBeGreaterThan(0)
    expect(now.gates.length).toBeGreaterThan(0)
    expect(now.dimensions.length).toBeGreaterThan(0)
  })

  it('a window without Shift replaces what was picked; with it, adds', () => {
    const { lot } = withLotAndDimension()
    act(() => useLots.getState().pick(lot))
    selectBox({ a: { x: 100, y: 90 }, b: { x: 140, y: 130 } }, false) // over no whole mass
    expect(pickedNow().lots).toEqual([])
    addToMix('lot', lot)
    selectBox({ a: { x: 30, y: 60 }, b: { x: 420, y: 170 } }, true)
    expect(pickedNow().lots).toEqual([lot])
    expect(pickedNow().masses.sort()).toEqual(['m1', 'm2'])
  })

  it('setPicked picks exactly this', () => {
    const { lot } = withLotAndDimension()
    const road = useApp.getState().derived.circulation.roads.find((r) => r.kind === 'street')!
    pickOnPlan('m1')
    setPicked([road.id], { masses: ['m2'], nodes: road.nodes ?? [], existing: [], lots: [lot], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
    expect(pickedNow()).toEqual({ masses: ['m2'], nodes: road.nodes, existing: [], lots: [lot], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
  })

  it('Shift+click on the plan adds a lot, a dimension and a gate to a mass; a plain click picks one alone', () => {
    const { lot, dim } = withLotAndDimension()
    render(<App />)
    const press = (el: Element, q: Point, extra: object = {}) => {
      fireEvent.pointerDown(el, at(q, extra))
      fireEvent.pointerUp(el, at(q, extra))
    }
    pickOnPlan('m1')
    press(document.querySelector(`[data-lot="${lot}"]`)!, { x: 220, y: 200 }, { shiftKey: true })
    press(document.querySelector(`[data-dimension="${dim}"] path`)!, { x: 80, y: 60 }, { shiftKey: true })
    press(document.querySelector(`[data-gate="${gateId()}"] circle`)!, { x: 225, y: 0 }, { shiftKey: true })
    expect(pickedNow()).toEqual({ masses: ['m1'], nodes: [], existing: [], lots: [lot], gates: [gateId()], dimensions: [dim], lines: [], notes: [], drawings: [] })
    press(document.querySelector(`[data-lot="${lot}"]`)!, { x: 220, y: 200 })
    expect(pickedNow()).toEqual({ masses: [], nodes: [], existing: [], lots: [lot], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
  })

  it('a plain click on the held mass of a mix picks it alone', () => {
    const { lot, dim } = withLotAndDimension()
    render(<App />)
    pickOnPlan('m1')
    addToMix('lot', lot)
    addToMix('dimension', dim)
    addToMix('gate', gateId())
    fireEvent.pointerDown(document.querySelector('[data-mass="m1"]')!, at({ x: 120, y: 110 }))
    fireEvent.pointerUp(document.querySelector('[data-mass="m1"]')!, at({ x: 120, y: 110 }))
    expect(pickedNow()).toEqual({ masses: ['m1'], nodes: [], existing: [], lots: [], gates: [], dimensions: [], lines: [], notes: [], drawings: [] })
  })

  it('one Escape lets go of everything picked, of every kind, lots too', () => {
    const { lot, dim } = withLotAndDimension()
    pickOnPlan('m1')
    addToMix('lot', lot)
    addToMix('gate', gateId())
    addToMix('dimension', dim)
    expect(pickedNow()).toEqual({ masses: ['m1'], nodes: [], existing: [], lots: [lot], gates: [gateId()], dimensions: [dim], lines: [], notes: [], drawings: [] })
    act(() => handleKey(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(nothingPicked()).toBe(true)
    expect(useLots.getState()).toMatchObject({ picked: null, also: [] })
    expect(useAccess.getState()).toMatchObject({ picked: null, alsoGates: [] })
  })

  it('with the access tool on, Escape leaves the tool first', () => {
    const { lot } = withLotAndDimension()
    addToMix('lot', lot)
    act(() => take('gate'))
    act(() => handleKey(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(useAccess.getState().tool).toBeNull()
    expect(pickedNow().lots).toEqual([lot])
  })

  it('a picked lot, dimension and gate of a mix are drawn marked', () => {
    const { lot, dim } = withLotAndDimension()
    render(<App />)
    act(() => {
      addToMix('lot', lot)
      addToMix('dimension', dim)
      addToMix('gate', gateId())
    })
    expect(document.querySelector(`[data-lot-shape="${lot}"]`)).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector(`[data-dimension="${dim}"]`)).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector(`[data-gate="${gateId()}"]`)).toHaveAttribute('aria-selected', 'true')
  })
})
