// An existing street picked on the plan and transformed like any object (Phase PE.2 task 12; plan Decisions 21-22, Review Focus 5): a click on its paving picks it
// (its path handles show), Shift+click and the window pick it with other kinds, Move, Rotate and Mirror take it with a gate and a street, a body drag moves it
// (its linked street end follows), Alt+drag copies it, Ctrl+C and Ctrl+V copy it, the padlock keeps it where it is, and a group of it and a gate moves as one.
// The world: the demo with no south street, and one existing street "Cross street" (60,250) -> (160,250) -> (260,250), 8 m then 2 + 6 m; a street drawn from (160,170)
// whose end lands on its drawn line (linked), and a gate on its right side at 70 m. jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExistingRoad, Point, Project } from '../../../model/schema.ts'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { isRefLocked } from '../../layers/locks.ts'
import { LOCKED } from '../../../model/picked.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { leaf, planMenu } from '../../editing/menu/__tests__/helpers.ts'
import { closeMenu } from '../../editing/menu/open.tsx'
import { useLayerView } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { letGo } from '../../tools/hand.ts'
import { handleKey } from '../../useShortcuts.ts'
import { useAccess } from '../access/accessState.ts'
import { fit, UNMEASURED_SIZE, type View } from '../camera.ts'
import { useRoads } from '../circulation/roadState.ts'
import { useClipboard } from '../clipboard.ts'
import { useCommand } from '../command/commandState.ts'
import { addToMix, pickedNow, pickedRefs, pickRefs, selectBox } from '../mix.ts'
import { pickOnPlan } from '../massCommands.ts'
import { contentBounds } from '../PlanSvg.tsx'
import { DEFAULT_SNAP } from '../snap/kinds.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { useGeneralTools } from '../tools/generalSettings.ts'
import { holdNow, targetsWithout } from '../tools/standingPreview.ts'
import { planPointer, useDimensions, useTool } from '../tools/toolState.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const O = 'o1'
let v: View
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
const s = () => useApp.getState()
const free = { shiftKey: true }
const press = (el: Element, q: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(q, extra))
  fireEvent.pointerUp(el, at(q, extra))
}
const drag = (el: Element, from: Point, to: Point, extra: object = {}) => {
  fireEvent.pointerDown(el, at(from, extra))
  fireEvent.pointerMove(el, at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  fireEvent.pointerMove(el, at(to, extra))
  fireEvent.pointerUp(el, at(to, extra))
}
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const chord = (k: string, extra: object = {}) => act(() => handleKey(new KeyboardEvent('keydown', { key: k, ctrlKey: true, ...extra })))
/** Points equal to these, to a millimetre (the pointer's pixels are not whole metres). */
const near = (got: Point[], want: Point[]) => {
  expect(got).toHaveLength(want.length)
  got.forEach((q, i) => {
    expect(q.x).toBeCloseTo(want[i].x, 3)
    expect(q.y).toBeCloseTo(want[i].y, 3)
  })
}
const steps = () => s().history.past.length
const toast = () => useToast.getState().toast?.text
const capture = () => document.querySelector('[data-tool] > [data-capture]')!
const click = (q: Point, extra: object = {}) => {
  fireEvent.pointerMove(capture(), at(q, extra))
  fireEvent.pointerDown(capture(), at(q, extra))
  fireEvent.pointerUp(capture(), at(q, extra))
}

interface World {
  p: Project
  road: string
  end: string
  far: string
  gate: string
}
function world(): World {
  const base = demoProject({ streets: false, southStreet: false })
  const made = actions.addExistingRoad(base, [{ x: 60, y: 250 }, { x: 160, y: 250 }, { x: 260, y: 250 }], 8)!
  let p = actions.updateExistingRoad(made.project, made.id, { name: 'Cross street', stretches: [{ left: 4, right: 4 }, { left: 2, right: 6 }] })
  const drawn = actions.drawStreet(p, O, [{ x: 160, y: 170 }, { x: 160, y: 252 }])!
  p = drawn.project
  const gate = actions.addGateOn(p, O, { kind: 'existing-road', id: made.id, side: 'right', at: 70 })
  return { p: gate.project, road: made.id, end: drawn.nodes[1], far: drawn.nodes[0], gate: gate.id }
}
let w: World
const road = (): ExistingRoad => s().project.site.existingRoads!.find((r) => r.id === w.road)!
const nodes = () => s().project.options[0].streets!.nodes
const node = (id: string) => nodes().find((n) => n.id === id)!
const gate = () => derive(s().project, O).circulation.gates.find((g) => g.id === w.gate)!
const hit = (id = w.road) => document.querySelector(`[data-street-id="existing:${id}"]`)!
const BODY: Point = { x: 90, y: 250 }

function stand(p: Project = w.p) {
  v = fit(contentBounds(derive(p, O)), UNMEASURED_SIZE)
  act(() => useApp.setState({ project: p, derived: derive(p, O), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: O }))
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  letGo()
  useLayerView.setState({ hidden: [], onTop: [] })
  useDimensions.setState({ selected: null, also: [] })
  useRoads.setState({ picked: null, node: null, also: [] })
  useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
  useSnapSettings.setState({ settings: { ...DEFAULT_SNAP, on: false, grid: false } })
  useClipboard.setState({ masses: [], roads: [], existing: [] })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useGeneralTools.setState({ keep: false, count: 3, rows: 1, how: 'edges' })
  useToast.setState({ toast: null, confirmation: null })
  planPointer.point = null
  closeMenu()
  w = world()
})

describe('a click on the plan', () => {
  it('a press on the paving picks the existing street, and its path handles show', () => {
    stand()
    render(<App />)
    expect(document.querySelectorAll('[data-path-node]')).toHaveLength(0)
    press(hit(), BODY)
    expect(useAccess.getState().picked).toEqual({ kind: 'existing', id: w.road })
    expect(pickedRefs()).toEqual([{ kind: 'existing-road', id: w.road }])
    expect(pickedNow().existing).toEqual([w.road])
    expect(document.querySelectorAll('[data-path-node]')).toHaveLength(3)
    // a plain click on another thing lets it go
    act(() => pickOnPlan('m1'))
    expect(pickedNow().existing).toEqual([])
  })

  it('the hit stroke is the road layer’s: one per run, the street’s own id on it, nothing of it in the access layer', () => {
    stand()
    render(<App />)
    const strokes = document.querySelectorAll('[data-layer="roads"] [data-road-kind="existing"]')
    expect(strokes.length).toBeGreaterThan(0)
    expect(hit().getAttribute('data-road-kind')).toBe('existing')
    expect(document.querySelector('[data-layer="access"] [data-existing-road]')).toBeNull()
  })

  it('Shift+click adds it to what is picked, and takes it out again', () => {
    stand()
    render(<App />)
    act(() => pickOnPlan('m1'))
    press(hit(), BODY, { shiftKey: true })
    expect(pickedNow().masses).toEqual(['m1'])
    expect(pickedNow().existing).toEqual([w.road])
    press(hit(), BODY, { shiftKey: true })
    expect(pickedNow().existing).toEqual([])
    expect(pickedNow().masses).toEqual(['m1'])
  })

  it('a gate and an existing street are picked together: either one first', () => {
    stand()
    act(() => addToMix('gate', w.gate))
    act(() => addToMix('existing', w.road))
    expect(pickedNow()).toMatchObject({ gates: [w.gate], existing: [w.road] })
    act(() => addToMix('gate', w.gate))
    expect(pickedNow()).toMatchObject({ gates: [], existing: [w.road] })
    act(() => addToMix('gate', w.gate))
    expect(pickedNow()).toMatchObject({ gates: [w.gate], existing: [w.road] })
    expect(pickedRefs()).toEqual(expect.arrayContaining([{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }]))
  })

  it('a window picks it with a mass; a crossing window that only touches it picks it too; a hidden one stays out', () => {
    stand()
    render(<App />)
    act(() => selectBox({ a: { x: 30, y: 60 }, b: { x: 280, y: 270 } }, false))
    expect(pickedNow().existing).toEqual([w.road])
    expect(pickedNow().masses).toEqual(expect.arrayContaining(['m1', 'm3']))
    act(() => selectBox({ a: { x: 100, y: 240 }, b: { x: 90, y: 255 } }, false))
    expect(pickedNow().existing).toEqual([w.road])
    act(() => useLayerView.getState().setHidden([`existing-road:${w.road}`], true))
    act(() => selectBox({ a: { x: 30, y: 60 }, b: { x: 280, y: 270 } }, false))
    expect(pickedNow().existing).toEqual([])
  })
})

describe('Move, Rotate and Mirror take it', () => {
  it('Move with a gate and a street: all go by the vector, one undo step', () => {
    stand()
    render(<App />)
    const was = gate().at
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }, { kind: 'street', id: pickedStreet() }]))
    const before = steps()
    key('m')
    click({ x: 100, y: 250 }, free)
    click({ x: 130, y: 230 }, free)
    near(road().points, [{ x: 90, y: 230 }, { x: 190, y: 230 }, { x: 290, y: 230 }])
    expect(node(w.end)).toMatchObject({ x: 190, y: 230, road: w.road })
    expect(node(w.far)).toMatchObject({ x: 190, y: 150 })
    expect(gate().at.x).toBeCloseTo(was.x + 30, 6)
    expect(gate().at.y).toBeCloseTo(was.y - 20, 6)
    expect(steps()).toBe(before + 1)
    expect(pickedNow().existing).toEqual([w.road])
  })

  it('Move of the street alone: its linked end follows, the far end stays', () => {
    stand()
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    key('m')
    click({ x: 100, y: 250 }, free)
    click({ x: 110, y: 250 }, free)
    near(road().points.slice(0, 1), [{ x: 70, y: 250 }])
    expect(node(w.end)).toMatchObject({ x: 170, y: 250, road: w.road })
    expect(node(w.far)).toMatchObject({ x: 160, y: 170 })
  })

  it('Rotate turns it about the pivot, its stretches stay', () => {
    stand()
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    const stretches = road().stretches
    key('r')
    click({ x: 160, y: 250 }, free)
    click({ x: 200, y: 250 }, free)
    fireEvent.change(screen.getByRole('textbox', { name: 'Command line' }), { target: { value: '90' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Command line' }), { key: 'Enter' })
    const [a, b, c] = road().points
    expect(a.x).toBeCloseTo(160, 6)
    expect(a.y).toBeCloseTo(150, 6)
    near([b], [{ x: 160, y: 250 }])
    expect(c.x).toBeCloseTo(160, 6)
    expect(c.y).toBeCloseTo(350, 6)
    expect(road().stretches).toEqual(stretches)
  })

  it('Mirror about a vertical line swaps its sides and its gate’s side', () => {
    stand()
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }]))
    key('i')
    expect(useTool.getState().tool).toBe('mirror')
    click({ x: 230, y: 100 }, free)
    click({ x: 230, y: 300 }, free)
    near(road().points, [{ x: 400, y: 250 }, { x: 300, y: 250 }, { x: 200, y: 250 }])
    expect(road().stretches).toMatchObject([{ left: 4, right: 4 }, { left: 6, right: 2 }])
    expect(gatesOf(s().project, O).find((g) => g.id === w.gate)!.on).toMatchObject({ kind: 'existing-road', side: 'left' })
  })
})

describe('by its body', () => {
  it('a drag moves it, its linked end follows, one undo step, and it stays picked', () => {
    stand()
    render(<App />)
    const before = steps()
    drag(hit(), { x: 100, y: 250 }, { x: 120, y: 230 })
    near(road().points, [{ x: 80, y: 230 }, { x: 180, y: 230 }, { x: 280, y: 230 }])
    expect(node(w.end)).toMatchObject({ x: 180, y: 230, road: w.road })
    expect(node(w.far)).toMatchObject({ x: 160, y: 170 })
    expect(steps()).toBe(before + 1)
    expect(pickedNow().existing).toEqual([w.road])
    act(() => s().undo())
    near(road().points.slice(0, 1), [{ x: 60, y: 250 }])
  })

  it('a drag of it picked beside a mass moves both', () => {
    stand()
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }, { kind: 'mass', id: 'm3' }]))
    const office = (): Point => (s().project.masses.find((m) => m.id === 'm3')!.footprint as { center: Point }).center
    const was = office()
    drag(hit(), { x: 100, y: 250 }, { x: 110, y: 240 })
    near(road().points.slice(0, 1), [{ x: 70, y: 240 }])
    expect(office()).toEqual({ x: was.x + 10, y: was.y - 10 })
  })

  it('Alt+drag leaves it and draws a copy where it is dropped, picked then', () => {
    stand()
    render(<App />)
    const before = steps()
    drag(hit(), { x: 100, y: 250 }, { x: 100, y: 220 }, { altKey: true, shiftKey: false })
    const list = s().project.site.existingRoads!
    expect(list).toHaveLength(2)
    near(road().points.slice(0, 1), [{ x: 60, y: 250 }])
    const copy = list.find((r) => r.id !== w.road)!
    expect(copy.points[0].y).toBeCloseTo(220, 6)
    expect(copy.name).toBe('Cross street')
    expect(copy.stretches).toEqual(road().stretches)
    expect(steps()).toBe(before + 1)
    expect(pickedNow().existing).toEqual([copy.id])
  })
})

describe('Ctrl+C, Ctrl+V', () => {
  it('copies the picked existing street and pastes it in place, picked; at the pointer it is centred there', () => {
    stand()
    render(<App />)
    press(hit(), BODY)
    chord('c')
    expect(useClipboard.getState().existing).toHaveLength(1)
    expect(toast()).toMatch(/Copied/)
    const before = steps()
    chord('v')
    const list = s().project.site.existingRoads!
    expect(list).toHaveLength(2)
    const pasted = list.find((r) => r.id !== w.road)!
    expect(pasted.points).toEqual(road().points)
    expect(pasted.name).toBe('Cross street')
    expect(pasted.stretches).toEqual(road().stretches)
    expect(pasted.locked).toBeUndefined()
    expect(steps()).toBe(before + 1)
    expect(pickedNow().existing).toEqual([pasted.id])
    // at the pointer: the middle of its points on it
    planPointer.point = { x: 200, y: 100 }
    chord('v', { shiftKey: true })
    const again = s().project.site.existingRoads!
    expect(again).toHaveLength(3)
    const last = again[2]
    expect((last.points[0].x + last.points[2].x) / 2).toBeCloseTo(200, 6)
  })

  it('Copy is refused with nothing picked, and an existing street picked is no longer refused', () => {
    stand()
    render(<App />)
    chord('c')
    expect(useClipboard.getState().existing).toHaveLength(0)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    chord('c')
    expect(useClipboard.getState().existing).toHaveLength(1)
  })
})

describe('what attracts a moving existing street', () => {
  it('its own lines and edges do not attract it; a locked one, which stays, still does', () => {
    stand()
    const all = targetsWithout(holdNow())
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    const moving = targetsWithout(holdNow())
    expect(moving.walls.length).toBeLessThan(all.walls.length)
    expect(moving.edges.length).toBeLessThan(all.edges.length)
    stand(actions.lockExistingRoads(w.p, [w.road], true))
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    expect(targetsWithout(holdNow()).walls.length).toBe(all.walls.length)
  })
})

describe('locked', () => {
  it('locked from the menu: its body picks nothing and says so, its pills and lane pill start nothing, Move skips it with the toast', () => {
    stand()
    render(<App />)
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }]))
    act(() => leaf(planMenu(), 'lock').onSelect())
    expect(isRefLocked({ kind: 'existing-road', id: w.road })).toBe(true)
    expect(road().locked).toBe(true)
    // seen, not picked: a press on it says so
    act(() => useAccess.getState().pick(null))
    press(hit(), BODY)
    expect(pickedNow().existing).toEqual([])
    expect(toast()).toBe(LOCKED)
    expect(drag(hit(), { x: 100, y: 250 }, { x: 120, y: 230 })).toBeUndefined()
    near(road().points.slice(0, 1), [{ x: 60, y: 250 }])
    // picked from its Layers row: it has no handles, so nothing of theirs starts (its pills, its lane pill, its nodes)
    act(() => useAccess.getState().pick({ kind: 'existing', id: w.road }))
    expect(document.querySelectorAll('[data-path-node], [data-path-stretch], [data-path-side], [data-path-lanes]')).toHaveLength(0)
    // Move: the mass moves, the street stays
    act(() => pickRefs([{ kind: 'existing-road', id: w.road }, { kind: 'mass', id: 'm3' }]))
    useToast.setState({ toast: null })
    key('m')
    click({ x: 100, y: 190 }, free)
    click({ x: 110, y: 190 }, free)
    near(road().points.slice(0, 1), [{ x: 60, y: 250 }])
    expect((s().project.masses.find((m) => m.id === 'm3')!.footprint as { center: Point }).center.x).toBe(130)
    expect(toast()).toMatch(/1 existing street stayed: locked/)
  })

  it('a window and Shift+click leave a locked one out', () => {
    const p = actions.lockExistingRoads(w.p, [w.road], true)
    stand(p)
    render(<App />)
    act(() => selectBox({ a: { x: 30, y: 60 }, b: { x: 280, y: 270 } }, false))
    expect(pickedNow().existing).toEqual([])
    act(() => addToMix('existing', w.road))
    expect(pickedNow().existing).toEqual([])
  })
})

describe('grouped with a gate', () => {
  it('a click on the street picks the gate with it; a drag moves them as one', () => {
    const g = actions.groupRefs(w.p, O, [{ kind: 'existing-road', id: w.road }, { kind: 'gate', id: w.gate }])!
    stand(g.project)
    render(<App />)
    expect(s().project.site.existingRoads![0].group).toBeDefined()
    press(hit(), BODY)
    expect(pickedNow()).toMatchObject({ existing: [w.road], gates: [w.gate] })
    const was = gate().at
    const before = steps()
    drag(hit(), { x: 100, y: 250 }, { x: 110, y: 240 })
    near(road().points.slice(0, 1), [{ x: 70, y: 240 }])
    expect(gate().at.x).toBeCloseTo(was.x + 10, 6)
    expect(gate().at.y).toBeCloseTo(was.y - 10, 6)
    expect(steps()).toBe(before + 1)
  })
})

/** The street drawn in the world, as the picks name it. */
function pickedStreet(): string {
  return s().derived.circulation.roads.find((r) => r.kind === 'street')!.street!
}
