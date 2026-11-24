// The roads in the Flow step (Decisions "Exterior circulation", 4.4–4.5, "Flow step" and "Streets"): the streets drawn
// over the courts (since ST.4 every road of the design is one: the demo's are the roads it derived before); a click
// picks one and Properties shows it; Delete removes it; a warning about a place (a gate) stands there as a chip. The
// Street tool draws one (`w 10` its width); dragged, a street moves, and so do its nodes.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { showLayer } from '../layers/show.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { issueMarkers } from '../plan/issueMarkers.ts'
import { readKpi } from '../../modules/catalog.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useCommand } from '../plan/command/commandState.ts'
import { m2 } from '../format.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null, also: [] })
})

const street = () => document.querySelectorAll('[data-road-kind="street"]')
// the site and its 15 m south street
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
/** A press and a release on the same spot: a click on a road picks it (a press alone starts a drag). */
const click = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1 })
}
// one of Flow's settings groups, opened unless it is open (Decision "Compact panel")
/** The settings of the Circulation or the Parking branch of Layers, in Properties (Phase AS.3: they were the Flow tab's groups). */
const tab = (name: 'Circulation' | 'Parking') => {
  act(() => showLayer(name.toLowerCase()))
  return screen.getByRole('tabpanel', { name: 'Properties' })
}
const rail = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
/** The rail's Properties, picked: the picked road's fields (Decision "Properties on the rail"). */
const properties = () => fireEvent.click(rail().getByRole('tab', { name: 'Properties' }))

describe('the roads', () => {
  it('the demo’s streets are drawn; a click picks one and Properties shows it', () => {
    render(<App />)
    expect(street().length).toBe(s().derived.circulation.roads.filter((r) => r.kind === 'street').length)
    act(() => s().select('m1'))
    click(street()[0])
    expect(useRoads.getState().picked).toBe(street()[0].getAttribute('data-road'))
    expect(s().selection.massIds).toEqual([]) // one thing at a time
    properties()
    const road = screen.getByRole('region', { name: 'Road' })
    expect(within(road).getByText('Street')).toBeInTheDocument()
    // a road derived before ST.4 keeps its sharp corners: a turning radius of its own
    expect(within(road).getByText('0 m (its own)')).toBeInTheDocument()
  })

  it('Delete removes the picked street; Escape lets it go', () => {
    render(<App />)
    click(street()[1])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useRoads.getState().picked).toBeNull()
    click(street()[1])
    const gone = s().derived.circulation.roads.find((r) => r.id === useRoads.getState().picked)!.segments!
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.options[0].streets!.segments.some((g) => gone.includes(g.id))).toBe(false)
    expect(s().project.masses).toHaveLength(3)
  })
})
describe('a warning about a place', () => {
  it('stands where it says, as a chip of its own', () => {
    const at = { x: 100, y: 0 }
    const [m] = issueMarkers([{ code: 'gate', severity: 'warning', massIds: [], at, message: 'Gate 1 leads nowhere: no road reaches it.' }], {}, 'l1')
    expect(m.key).toBe('at:100.0,0.0')
    expect(m.at).toEqual({ x: 100, y: -0 })
  })
})

describe('roads drawn by hand', () => {
  it('the Street tool (W): node by node, `w 10` a width of its own, Enter ends it; it is picked and the tool stays on', () => {
    useCommand.setState({ registration: null, angle: null, cursor: null })
    // the demo without its streets: the one drawn is the only one
    const bare = demoProject({ streets: false })
    useApp.setState({ project: bare, derived: derive(bare, 'o1') })
    render(<App />)
    fireEvent.keyDown(window, { key: 'w' })
    expect(useTool.getState().tool).toBe('street')
    // its type in the Streets group's ▾: the project's first, trucks
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Streets options' }))
    const chip = screen.getByRole('combobox', { name: 'Street type' }) as HTMLSelectElement
    expect(chip.value).toBe('trucks')
    // in the strip's panel, not on the drafting bar (it left the command line no room)
    expect(chip.closest('[role="dialog"]')).toHaveAccessibleName('New street')
    expect(useCommand.getState().registration!.apply({ kind: 'width', value: 10 })).toBe(true)
    const capture = document.querySelector('[data-capture]')!
    for (const q of [{ x: 60, y: 161 }, { x: 60, y: 230 }]) {
      fireEvent.pointerDown(capture, at(q, { shiftKey: true }))
      fireEvent.pointerUp(capture, at(q, { shiftKey: true }))
    }
    fireEvent.keyDown(window, { key: 'Enter' })
    const streets = s().project.options[0].streets!
    expect(streets.segments).toHaveLength(1)
    expect(streets.segments[0]).toMatchObject({ type: 'trucks', left: 5, right: 5 })
    expect(streets.nodes.map((q) => [Math.round(q.x), Math.round(q.y)])).toEqual([
      [60, 161],
      [60, 230],
    ])
    expect(useRoads.getState().picked).toBe(`street:${streets.segments[0].id}`)
    expect(useTool.getState().tool).toBe('street')
  })

  it('a street picked: its nodes are handles (dragged, its segment follows; clicked, Delete removes it); a double click adds one', () => {
    const p = demoProject()
    const streets = { nodes: [{ id: 'n1', x: 60, y: 161 }, { id: 'n2', x: 60, y: 230 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 }] }
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] } })
    useApp.setState({ derived: derive(s().project, 'o1') })
    render(<App />)
    const street = document.querySelector('[data-road="street:s1"]')!
    fireEvent.pointerDown(street, at({ x: 60, y: 200 }))
    fireEvent.pointerUp(street, at({ x: 60, y: 200 }))
    expect(useRoads.getState().picked).toBe('street:s1')
    const handle = document.querySelector('[data-path-node="n2"]')!
    fireEvent.pointerDown(handle, at({ x: 60, y: 230 }, { shiftKey: true }))
    fireEvent.pointerMove(handle, at({ x: 60, y: 250 }, { shiftKey: true }))
    fireEvent.pointerUp(handle, at({ x: 60, y: 250 }, { shiftKey: true }))
    expect(s().project.options[0].streets!.nodes[1].y).toBeCloseTo(250, 0)
    fireEvent.doubleClick(document.querySelector('[data-road="street:s1"]')!, at({ x: 60, y: 200 }))
    expect(s().project.options[0].streets!.nodes).toHaveLength(3)
    const added = useRoads.getState().node!
    expect(added).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(s().project.options[0].streets!.nodes).toHaveLength(2) // the street goes on past it
    expect(s().project.options[0].streets!.segments).toHaveLength(1)
  })

  it('a street’s node dropped near another of its nodes snaps onto it and they join (found in Chrome: it took a gate)', () => {
    const p = demoProject()
    const nodes = [{ id: 'n1', x: 60, y: 161 }, { id: 'n2', x: 60.37, y: 230.21 }, { id: 'n3', x: 100, y: 230 }] // n2 off the grid
    const segments = [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 }, { id: 's2', a: 'n2', b: 'n3', type: 'trucks', left: 4, right: 4 }]
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets: { nodes, segments } }] } })
    useApp.setState({ derived: derive(s().project, 'o1') })
    render(<App />)
    const street = document.querySelector('[data-road="street:s1"]')!
    fireEvent.pointerDown(street, at({ x: 60, y: 200 }))
    fireEvent.pointerUp(street, at({ x: 60, y: 200 }))
    const handle = document.querySelector('[data-path-node="n3"]')!
    fireEvent.pointerDown(handle, at({ x: 100, y: 230 }))
    fireEvent.pointerMove(handle, at({ x: 60.7, y: 230.6 })) // near n2, not on it: the snap puts it there
    fireEvent.pointerUp(handle, at({ x: 60.7, y: 230.6 }))
    const after = s().project.options[0].streets!
    expect(after.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(after.segments).toHaveLength(1)
  })

  it('a street moves when dragged by its body; its type in Properties', () => {
    const p = demoProject()
    const streets = { nodes: [{ id: 'n1', x: 60, y: 161 }, { id: 'n2', x: 60, y: 230 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 }] }
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] } })
    useApp.setState({ derived: derive(s().project, 'o1') })
    render(<App />)
    const street = document.querySelector('[data-road="street:s1"]')!
    fireEvent.pointerDown(street, at({ x: 60, y: 200 }, { shiftKey: true }))
    fireEvent.pointerMove(street, at({ x: 70, y: 200 }, { shiftKey: true }))
    fireEvent.pointerUp(street, at({ x: 70, y: 200 }, { shiftKey: true }))
    expect(s().project.options[0].streets!.nodes.map((n) => Math.round(n.x))).toEqual([70, 70])
    properties()
    const props = screen.getByRole('region', { name: 'Road' })
    fireEvent.change(within(props).getByRole('combobox', { name: /Type/ }), { target: { value: 'cars' } })
    expect(s().project.options[0].streets!.segments[0].type).toBe('cars')
  })
})

describe('the roads snap (Decision "Road snap")', () => {
  // the demo's streets: Warehouse 1 and Office 1 share one at y 170, with nodes at x 29, 89, 151 and 211; Office 1 is
  // x 100–140, y 190–210. withRoad: the demo without them, a street from (60, 170) north and one along y 170 to x 89
  const withRoad = () => {
    const p = demoProject({ streets: false })
    const nodes = [{ id: 'n1', x: 60, y: 170 }, { id: 'n2', x: 60, y: 240 }, { id: 'n3', x: 29, y: 170 }, { id: 'n4', x: 89, y: 170 }]
    const streets = { nodes, segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 4, right: 4 }, { id: 's2', a: 'n3', b: 'n4', type: 'trucks', left: 4, right: 4 }] }
    useApp.setState({ project: { ...p, options: [{ ...p.options[0], streets }] } })
    useApp.setState({ derived: derive(s().project, 'o1') })
  }
  const points = () => s().project.options[0].streets!.nodes.map((n) => ({ x: n.x, y: n.y }))

  it('the Street tool: a point near another road’s end goes onto it; with Shift it stays where it is pressed', () => {
    useCommand.setState({ registration: null, angle: null, cursor: null })
    render(<App />)
    fireEvent.keyDown(window, { key: 'w' })
    const capture = document.querySelector('[data-capture]')!
    for (const [q, shift] of [
      [{ x: 89.6, y: 170.5 }, false],
      [{ x: 95.3, y: 240.4 }, true],
    ] as const) {
      fireEvent.pointerDown(capture, at(q, { shiftKey: shift }))
      fireEvent.pointerUp(capture, at(q, { shiftKey: shift }))
    }
    fireEvent.keyDown(window, { key: 'Enter' })
    // its start on the end at (89, 170); its end where it was pressed (it crosses Office 1's street on its way: a node
    // there, so the street picked is the stretch up to it)
    const [a] = s().derived.circulation.roads.find((r) => r.id === useRoads.getState().picked)!.nodePoints!
    expect({ x: a.x, y: a.y }).toEqual({ x: 89, y: 170 })
    expect(s().project.options[0].streets!.nodes.find((n) => Math.abs(n.y - 240.4) < 0.2)!.x).toBeCloseTo(95.3, 1)
  })

  it('a node dragged goes onto a mass’s corner; a street dragged puts its end on another road’s', () => {
    withRoad()
    render(<App />)
    const road = document.querySelector('[data-road="street:s1"]')!
    fireEvent.pointerDown(road, at({ x: 60, y: 200 }))
    fireEvent.pointerUp(road, at({ x: 60, y: 200 }))
    const handle = document.querySelector('[data-path-node="n2"]')!
    fireEvent.pointerDown(handle, at({ x: 60, y: 240 }))
    fireEvent.pointerMove(handle, at({ x: 80, y: 220 }))
    fireEvent.pointerMove(handle, at({ x: 100.8, y: 210.6 }))
    fireEvent.pointerUp(handle, at({ x: 100.8, y: 210.6 }))
    expect(points()[1]).toEqual({ x: 100, y: 210 })
    // the whole road: its first point (60, 170) dropped by the end at x 89
    fireEvent.pointerDown(road, at({ x: 70, y: 180 }))
    fireEvent.pointerMove(road, at({ x: 85, y: 180 }))
    fireEvent.pointerMove(road, at({ x: 98.6, y: 180.4 }))
    fireEvent.pointerUp(road, at({ x: 98.6, y: 180.4 }))
    // dropped on the other street's end: one node there (Draft.knit)
    const st = s().project.options[0].streets!
    const start = st.nodes.find((n) => n.id === st.segments.find((g) => g.id === 's1')!.a)!
    expect({ x: start.x, y: start.y }).toEqual({ x: 89, y: 170 })
  })
})

describe('car parking', () => {
  it('the stalls along the roads on the plan; the Parking row’s Properties sets both sides, one or none; each total is a KPI', () => {
    render(<App />)
    const layer = () => document.querySelector('[data-layer="stalls"]')
    expect(Number(layer()!.getAttribute('data-stalls'))).toBe(s().derived.circulation.totals.stalls)
    expect(readKpi('stalls', s().project, s().derived)!.value).toBe(s().derived.circulation.totals.stalls)
    expect(readKpi('dock-doors', s().project, s().derived)!.value).toBe(35)
    const parking = tab('Parking')
    expect(within(parking).getByText('Car stalls').nextSibling).toHaveTextContent(s().derived.circulation.totals.stalls.toLocaleString('en-US'))
    // the option's, as the site's until set (Decision "Circulation layout")
    const along = screen.getByRole('combobox', { name: /Other streets/ })
    expect(along).toHaveValue('')
    expect(within(along).getByRole('option', { name: "Site's: both" })).toBeInTheDocument()
    fireEvent.change(along, { target: { value: 'none' } })
    expect(s().project.options[0].parking).toBe('none')
    expect(s().project.standards!.parking).toBe('double')
    expect(layer()).toBeNull()
  })

  it('a street picked has a P pill on each side: a click turns that side off along it; Shift+click picks more, Properties sets them (Decision "Street parking by side")', () => {
    render(<App />)
    const cars = s().derived.circulation.roads.filter((r) => r.kind === 'street' && r.vehicles !== 'trucks')
    expect(cars.length).toBeGreaterThan(1)
    const [a, b] = cars
    const road = (id: string) => s().derived.circulation.roads.find((r) => r.id === id)!
    const before = s().derived.circulation.totals.stalls
    click(document.querySelector(`[data-road="${a.id}"]`)!)
    const left = document.querySelector(`[data-parking-pill="${a.id}:left"]`)!
    expect(left.getAttribute('aria-pressed')).toBe('true') // both sides, as the demo's standard
    fireEvent.click(left)
    expect(road(a.id).parking!.every((x) => x === 'right')).toBe(true) // the left off, along the whole street
    expect(s().derived.circulation.totals.stalls).toBeLessThan(before)
    expect(document.querySelector(`[data-parking-pill="${a.id}:left"]`)!.getAttribute('aria-pressed')).toBe('false')
    // Shift+click: the second joins; both have their edge
    const second = document.querySelector(`[data-road="${b.id}"]`)!
    fireEvent.pointerDown(second, { button: 0, pointerId: 1, shiftKey: true })
    fireEvent.pointerUp(second, { button: 0, pointerId: 1, shiftKey: true })
    expect(useRoads.getState()).toMatchObject({ picked: a.id, also: [b.id] })
    expect(document.querySelector(`[data-parking-pill="${b.id}:right"]`)).not.toBeNull()
    properties()
    const props = screen.getByRole('region', { name: 'Road' })
    expect(within(props).getByText('Car stalls along 2 streets')).toBeInTheDocument()
    fireEvent.click(within(props).getByRole('button', { name: 'None' }))
    expect([a.id, b.id].every((id) => road(id).parking!.every((x) => x === 'none'))).toBe(true)
    expect(s().history.past.length).toBe(2) // the pill, then None for both: one step each
    // As the option: back to the option's
    fireEvent.click(within(props).getByRole('button', { name: 'As the option' }))
    expect(s().project.options[0].streets!.segments.some((g) => g.parking)).toBe(false)
    expect(s().derived.circulation.totals.stalls).toBe(before)
    // the Parking row's Properties counts the streets with their own side
    fireEvent.click(within(props).getByRole('button', { name: 'None' }))
    expect(within(tab('Parking')).getByText('Streets with their own side').nextSibling).toHaveTextContent('2')
  })

  it('the Circulation row’s totals: the truck roads and the car roads, together the roads', () => {
    render(<App />)
    tab('Circulation')
    const totals = screen.getByLabelText('Circulation totals')
    const t = s().derived.circulation.totals
    expect(t.carRoadArea).toBeGreaterThan(0)
    expect(within(totals).getByText('Car roads').nextSibling).toHaveTextContent(m2(t.carRoadArea))
    expect(within(totals).getByText('Truck roads').nextSibling).toHaveTextContent(m2(t.roadArea - t.carRoadArea))
  })
})
