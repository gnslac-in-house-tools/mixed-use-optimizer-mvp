// Docks and truck courts in Massing (Decision "Exterior circulation", 4.3): drawn on the plan; a mass's Docks in
// Properties (its program's or its own, the wall marks on the plan: a click turns a wall on or off, a filled one dragged
// onto another wall moves them, Decision "Docks turn with the building"); the Brief's Docks column (docks by program,
// Phase C.4). The demo's warehouses dock on one long wall, a door per 700 m².
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { showLayer } from '../layers/show.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { moveMass } from '../../state/actions/masses.ts'
import { setMassDocks } from '../../state/actions/circulation.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { contentBounds } from '../plan/PlanSvg.tsx'
import type { Point } from '../../model/schema.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const v = fit(contentBounds(derive(demoProject())), UNMEASURED_SIZE)
const at = (q: Point) => ({ clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2, clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale, button: 0, pointerId: 1 })
/** A press and a release on a wall's mark: a click. */
const click = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1 })
}
const mark = (i: number) => document.querySelector(`[data-dock-mark="${i}"]`)!

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
})

const docksOf = (id: string) => s().derived.circulation.docks.filter((d) => d.massId === id)
const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
// the selection's fields, the Docks among them: the rail's Properties (Decision "Properties on the rail")
const properties = () => fireEvent.click(within(left().querySelector<HTMLElement>('[data-panel-tabs]')!).getByRole('tab', { name: 'Properties' }))

describe('on the plan', () => {
  it('each warehouse’s court under it and its docked wall with a tick per door; the office has none', () => {
    render(<App />)
    expect(document.querySelector('[data-court="m1:0"]')).not.toBeNull()
    expect(document.querySelector('[data-dock="m1:0"]')).toHaveAttribute('data-doors', '19')
    expect(document.querySelector('[data-dock="m2:0"]')).toHaveAttribute('data-doors', '16') // turned round: its north wall
    expect(document.querySelector('[data-dock^="m3"]')).toBeNull()
  })

  it('the Site tab draws them as Levels does: the viewport is the same whatever tab is open (Decision "Site with the viewport")', () => {
    useUi.setState({ rail: 'layers' })
    render(<App />)
    expect(document.querySelector('[data-court]')).not.toBeNull()
  })
})

describe('a mass’s Docks', () => {
  it('its program’s by default; *Own docks* keeps what it has, then a wall’s mark turns its docks on or off', () => {
    render(<App />)
    act(() => s().select('m1'))
    properties()
    const docks = screen.getByRole('region', { name: 'Docks' })
    expect(within(docks).getByText(/19 doors on 1 wall/)).toBeInTheDocument()
    fireEvent.click(within(docks).getByRole('button', { name: 'Own docks' }))
    expect(s().project.masses[0].docks).toEqual([80 / 480])
    expect(docksOf('m1').map((d) => d.wall)).toEqual([0])
    // the marks: one per wall, the south one on
    const marks = [...document.querySelectorAll('[data-dock-mark]')]
    expect(marks.map((m) => m.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    const steps = s().history.past.length
    click(marks[1]) // the east wall
    expect(docksOf('m1').map((d) => d.wall)).toEqual([0, 1])
    expect(s().history.past).toHaveLength(steps + 1)
    click(mark(0)) // the south one off
    expect(docksOf('m1').map((d) => d.wall)).toEqual([1])
    expect(s().selection.massIds).toEqual(['m1']) // still selected
    fireEvent.click(within(screen.getByRole('region', { name: 'Docks' })).getByRole('button', { name: 'Warehouse' }))
    expect(s().project.masses[0].docks).toBeUndefined()
    // the program's again: its marks say so
    expect([...document.querySelectorAll('[data-dock-mark]')].map((m) => m.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  })

  it('the program’s docked wall’s mark dragged onto another wall moves them there (its own now), one undo step; a click on an empty one adds it', () => {
    render(<App />)
    act(() => s().select('m1'))
    expect(document.querySelectorAll('[data-dock-mark]')).toHaveLength(4)
    const steps = s().history.past.length
    // Warehouse 1 (x 40–200, y 70–150) docks south; its mark dragged to the north wall
    fireEvent.pointerDown(mark(0), at({ x: 120, y: 60 }))
    fireEvent.pointerMove(mark(0), at({ x: 120, y: 110 }))
    fireEvent.pointerMove(mark(0), at({ x: 120, y: 160 }))
    expect(document.querySelector('[data-dock-target="2"]')).not.toBeNull() // where it lands
    fireEvent.pointerUp(mark(0), at({ x: 120, y: 160 }))
    expect(docksOf('m1').map((d) => [d.wall, d.own])).toEqual([[2, true]])
    expect(s().history.past).toHaveLength(steps + 1)
    expect(document.querySelector('[data-dock-target]')).toBeNull()
    act(() => s().undo())
    expect(docksOf('m1').map((d) => [d.wall, d.own])).toEqual([[0, false]])
    // a click on the east wall's empty mark: the south and the east, its own
    click(mark(1))
    expect(docksOf('m1').map((d) => [d.wall, d.own])).toEqual([
      [0, true],
      [1, true],
    ])
  })

  it('the office: built, on the ground, its program has none; a mass of open ground has no Docks section', () => {
    render(<App />)
    act(() => s().select('m3'))
    properties()
    expect(within(screen.getByRole('region', { name: 'Docks' })).getByText(/No docks/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /Program/ }), { target: { value: 'outdoor-storage' } })
    expect(screen.queryByRole('region', { name: 'Docks' })).toBeNull()
  })
})

/** The Brief's rows opened to their rule set (▸), where the docks are (Decision "Program rule set layout"). */
const openRules = (...names: string[]) => names.forEach((n) => fireEvent.click(screen.getByRole('button', { name: `${n}'s rule set` })))

describe('the Brief’s docks (Phase C.4; in a row’s rule set since K.2)', () => {
  it('docks by program: on or off, a door per m² or m; each edit one undo step; open ground has none', () => {
    act(() => useUi.getState().openDialog('brief'))
    render(<App />)
    openRules('Warehouse', 'Office', 'Outdoor storage')
    // a box per program (Decision "Docks on or off"): off, its masses have none; on again, its doors as they were
    const box = screen.getByRole('checkbox', { name: 'Warehouse has docks' })
    expect(box).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Warehouse: a door per' })).toHaveValue('700')
    fireEvent.click(box)
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.docks).toBeUndefined()
    expect(docksOf('m1')).toEqual([])
    expect(screen.queryByRole('textbox', { name: 'Warehouse: a door per' })).toBeNull()
    fireEvent.click(box)
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.docks).toEqual({ per: 'm2', every: 700 })
    expect(docksOf('m1').map((d) => d.wall)).toEqual([0])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Office has docks' }))
    expect(s().project.programs.find((g) => g.id === 'office')!.docks).toEqual({ per: 'm', every: 12 })
    fireEvent.change(screen.getByRole('combobox', { name: /^Office: doors per/ }), { target: { value: 'm2' } })
    expect(s().project.programs.find((g) => g.id === 'office')!.docks).toEqual({ per: 'm2', every: 12 })
    expect(s().history.past).toHaveLength(4)
    expect(screen.queryByRole('checkbox', { name: 'Outdoor storage has docks' })).toBeNull()
    // the Docks tab is gone from the panel
    expect(within(left()).queryByRole('treeitem', { name: 'Docks' })).toBeNull()
  })

  it('a typology without docks has no docks in the rule set', () => {
    act(() => useUi.getState().openDialog('brief'))
    act(() => s().open({ ...s().project, typology: 'blank' }))
    render(<App />)
    openRules('Warehouse')
    expect(screen.queryByRole('columnheader', { name: /Docks/ })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Warehouse has docks' })).toBeNull()
  })
})

describe('the tabs a project has (Decision "What is not there is not shown")', () => {
  it('Circulation has the road totals; Parking, the stalls; a blank project has no Docks section', () => {
    render(<App />)
    // each branch of Layers holds its own settings in Properties (Decision "Settings by what is picked")
    act(() => showLayer('circulation'))
    expect(screen.getByLabelText('Circulation totals')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Road width/ })).toBeNull()
    expect(within(left()).queryByRole('combobox', { name: /Other streets/ })).toBeNull()
    act(() => showLayer('parking'))
    expect(within(left()).getByRole('combobox', { name: /Other streets/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Stall width/ })).toBeNull()
    act(() => {
      const p = { ...s().project, typology: 'blank' }
      s().open(p)
    })
    act(() => useUi.getState().setRail('layers'))
    act(() => s().select('m3'))
    properties()
    expect(screen.queryByRole('region', { name: 'Docks' })).toBeNull()
    // nor over a warehouse whose program has docks: the typology does not offer them (the docks stay in the project)
    act(() => s().select('m1'))
    expect(screen.queryByRole('region', { name: 'Docks' })).toBeNull()
    act(() => s().apply((p) => ({ ...p, typology: 'industrial' })))
    expect(screen.getByRole('region', { name: 'Docks' })).toBeInTheDocument()
  })
})

describe('the truck court (Decision "Truck court")', () => {
  const pill = () => document.querySelector('[data-court-pill="m1:0"]')!
  const south = () => docksOf('m1')[0]

  it('the selected warehouse’s court has a pill on its outer edge: dragged out, deeper (its wall’s own), one undo step', () => {
    render(<App />)
    expect(document.querySelector('[data-court-pill]')).toBeNull() // nothing selected
    act(() => s().select('m1'))
    expect(pill()).toHaveAttribute('aria-valuenow', '40')
    expect(pill().querySelector('text')!.textContent).toBe('40 m')
    const steps = s().history.past.length
    // Warehouse 1's south wall at y 70: its court's outer edge at y 30; dragged 5.2 m further out, by the half metre
    fireEvent.pointerDown(pill(), at({ x: 120, y: 30 }))
    fireEvent.pointerMove(pill(), at({ x: 120, y: 27 }))
    fireEvent.pointerMove(pill(), at({ x: 120, y: 24.8 }))
    fireEvent.pointerUp(pill(), at({ x: 120, y: 24.8 }))
    expect(south()).toMatchObject({ depth: 45, ownDepth: true })
    expect(s().project.masses[0].courts).toEqual([{ t: 80 / 480, depth: 45 }])
    expect(s().history.past).toHaveLength(steps + 1)
    expect(pill().querySelector('text')!.textContent).toBe('45 m')
    act(() => s().undo())
    expect(south().depth).toBe(40)
  })

  it('Properties: each docked wall’s court depth, typed its own, *Reset* back to the standards’', () => {
    render(<App />)
    act(() => s().select('m1'))
    properties()
    const docks = screen.getByRole('region', { name: 'Docks' })
    const field = within(docks).getByLabelText(/^Court, wall 1m?$/)
    fireEvent.change(field, { target: { value: '36' } })
    fireEvent.blur(field)
    expect(south()).toMatchObject({ depth: 36, ownDepth: true })
    expect(within(docks).getByLabelText(/^Court, wall 1 \(its own\)/)).toHaveValue('36')
    fireEvent.click(within(docks).getByRole('button', { name: 'Reset' }))
    expect(south().depth).toBe(40)
    expect(s().project.masses[0].courts).toBeUndefined()
  })

  it('a court a warning names is drawn in the warning colour', () => {
    render(<App />)
    expect(document.querySelector('[data-court="m1:0"]')).not.toHaveAttribute('data-court-warned')
    // the office into Warehouse 1's court
    act(() => s().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm3' ? { ...m, footprint: { kind: 'rect', center: { x: 120, y: 50 }, width: 40, depth: 20, rotation: 0 } } : m)) })))
    act(() => s().apply((p) => ({ ...p, masses: p.masses.map((m) => (m.id === 'm1' ? { ...m, docks: [80 / 480] } : m)) })))
    expect(document.querySelector('[data-court="m1:0"]')).toHaveAttribute('data-court-warned', 'true')
  })
})

describe('the gap between warehouses (ST.6)', () => {
  /** Warehouse 2 under Warehouse 1, their docked walls facing each other 40 m apart (as courts.test.ts). */
  const facing = () => {
    let p = moveMass(demoProject(), 'm3', { x: 250, y: 0 })
    p = moveMass(p, 'm1', { x: 0, y: 60 })
    p = moveMass(p, 'm2', { x: -210, y: -60 })
    p = setMassDocks(setMassDocks(p, 'm1', [80 / 480]), 'm2', [70 / 440])
    act(() => useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory() }))
  }
  const gap = () => document.querySelector('[data-court-gap="m1:0|m2:0"]')!
  const figure = () => document.querySelector('[data-court-gap-figure="m1:0|m2:0"]')!
  const box = (id: string) => {
    const ys = s().derived.masses[id].polygon.map((q) => q.y)
    return [Math.min(...ys), Math.max(...ys)]
  }

  it('a dimension wall to wall; with one of the two picked, its figure typed moves the one picked; one undo step', () => {
    render(<App />)
    facing()
    expect(gap()).toHaveAttribute('data-gap', '40')
    expect(gap().textContent).toContain('40.0 m')
    // nothing picked: a click types nothing
    fireEvent.pointerDown(figure(), { button: 0, pointerId: 1 })
    expect(screen.queryByRole('textbox', { name: 'Gap between the warehouses' })).toBeNull()
    act(() => s().select('m1'))
    const steps = s().history.past.length
    fireEvent.pointerDown(figure(), { button: 0, pointerId: 1 })
    const field = screen.getByRole('textbox', { name: 'Gap between the warehouses' })
    expect(field).toHaveValue('40')
    fireEvent.change(field, { target: { value: '45' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(box('m1')[0]).toBeCloseTo(135, 6) // Warehouse 1 moved 5 m north
    expect(box('m2')[1]).toBeCloseTo(90, 6) // Warehouse 2 stayed
    expect(gap()).toHaveAttribute('data-gap', '45')
    expect(s().history.past).toHaveLength(steps + 1)
    // Warehouse 2 picked: it moves
    act(() => s().select('m2'))
    fireEvent.pointerDown(figure(), { button: 0, pointerId: 1 })
    const again = screen.getByRole('textbox', { name: 'Gap between the warehouses' })
    fireEvent.change(again, { target: { value: '42,5' } })
    fireEvent.keyDown(again, { key: 'Enter' })
    expect(box('m2')[1]).toBeCloseTo(92.5, 6)
    expect(box('m1')[0]).toBeCloseTo(135, 6)
  })

  it('under the deeper court’s depth: drawn in the warning colour; not a length: nothing moves', () => {
    render(<App />)
    facing()
    expect(gap()).not.toHaveAttribute('data-gap-short')
    act(() => s().select('m1'))
    fireEvent.pointerDown(figure(), { button: 0, pointerId: 1 })
    const field = screen.getByRole('textbox', { name: 'Gap between the warehouses' })
    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(gap()).toHaveAttribute('data-gap-short', 'true')
    const before = s().project
    fireEvent.pointerDown(figure(), { button: 0, pointerId: 1 })
    const bad = screen.getByRole('textbox', { name: 'Gap between the warehouses' })
    fireEvent.change(bad, { target: { value: 'far' } })
    fireEvent.keyDown(bad, { key: 'Enter' })
    expect(s().project).toBe(before)
  })
})
