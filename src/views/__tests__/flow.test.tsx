// The Flow step (Phase C.2, Decision "Flow step"; an area of the rail since Decision "Areas rail"; since Phase AS.3 its settings are Properties' for the Circulation and Parking rows of Layers): the third step, after Massing. Its tools bar Select │ Street · Gate │
// the analyses, off (which leave Massing's bar). Since Decision "Steps change the tools" the step changes those tools
// alone: the masses, the roads and the gates answer the same in every step. Leaving it lets its tools go.
// jsdom has no layout: the plan uses UNMEASURED_SIZE and `at` turns world metres into screen pixels.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { showLayer } from '../layers/show.ts'
import { toggleOverlay } from './overlays.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { fit, UNMEASURED_SIZE } from '../plan/camera.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { useToast } from '../layout/toast.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const s = () => useApp.getState()
const key = (k: string, extra: object = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const v = fit({ minX: 0, minY: -15, maxX: 440, maxY: 280 }, UNMEASURED_SIZE)
const at = (q: Point, extra: object = {}) => ({
  clientX: (q.x - v.cx) * v.scale + UNMEASURED_SIZE.w / 2,
  clientY: UNMEASURED_SIZE.h / 2 - (q.y - v.cy) * v.scale,
  button: 0,
  pointerId: 1,
  ...extra,
})
// the Tools strip, and the left panel (Layers, Properties)
const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
const tools = () => screen.getByRole('toolbar', { name: 'Tools' })
/** The rail's Properties, picked: the selection's fields (Decision "Properties on the rail"). */
const properties = () => fireEvent.click(within(left().querySelector<HTMLElement>('[data-panel-tabs]')!).getByRole('tab', { name: 'Properties' }))
const ring = () => document.querySelectorAll('[data-road-kind="street"]')
const click = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1 })
  fireEvent.pointerUp(el, { button: 0, pointerId: 1 })
}

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, help: false })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useRoads.setState({ picked: null })
  letGo()
  useAccess.setState({ picked: null })
})

describe('the step', () => {
  it('Circulation and Parking are branches of Layers: picked, Properties shows their settings (Decision "Panel tabs"); a project without roads and parking has neither', () => {
    render(<App />)
    const tree = () => within(left()).getByRole('tree', { name: 'Layers' })
    expect(within(tree()).getByRole('treeitem', { name: 'Circulation' })).toBeInTheDocument()
    expect(within(tree()).getByRole('treeitem', { name: 'Parking' })).toBeInTheDocument()
    act(() => showLayer('circulation'))
    expect(useUi.getState().rail).toBe('properties')
    expect(within(left()).getByLabelText('Circulation totals')).toBeInTheDocument()
    act(() => showLayer('parking'))
    expect(within(left()).getByRole('combobox', { name: 'Other streets' })).toBeInTheDocument()
    expect(within(left()).getByLabelText('Parking totals')).toBeInTheDocument()
  })

  it('its tools, in the strip: Streets (Street · Gate · Existing road · Connect) │ Parking (Lot); no analyses (not built, not shown); Dimension · Ruler · Reference line · Note in Annotations; View › Overlays’ Graph works here too, its bubbles still', () => {
    render(<App />)
    act(() => useUi.getState().setRail('layers'))
    const names = (group: string) => within(within(tools()).getByRole('group', { name: group })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names('Streets')).toEqual(['Street', 'Gate', 'Existing road', 'Connect'])
    expect(names('Parking')).toEqual(['Lot'])
    expect(within(within(tools()).getByRole('group', { name: 'Annotations' })).getAllByRole('button').map((b) => [b.getAttribute('aria-label'), (b as HTMLButtonElement).disabled])).toEqual([
      ['Dimension', false],
      ['Ruler', false],
      ['Reference line', false],
      ['Note', false],
    ])
    expect(screen.queryByRole('group', { name: 'Measure' })).toBeNull()
    // the analyses (Phase 6) are not drawn until they work
    expect(screen.queryByRole('group', { name: 'Flow tools' })).toBeNull()
    // the graph in every step (Decision "Show fixed"), its bubbles dragged as in Massing
    toggleOverlay('graph')
    const bubble = document.querySelector('[data-graph-bubble]')!
    expect(bubble).not.toBeNull()
    expect(bubble.getAttribute('class')).toBe('cursor-grab')
    act(() => useGraph.getState().setGraph(false))
  })

  it('the strip is the same with any panel tab open: its six groups, Street among them, and no analyses', () => {
    render(<App />)
    const groupNames = () => within(tools()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    const first = groupNames()
    expect(first).toEqual(['General', 'Massing', 'Elements', 'Streets', 'Parking', 'Annotations'])
    for (const rail of ['layers', 'properties', 'blocks'] as const) {
      act(() => useUi.getState().setRail(rail))
      expect(groupNames(), rail).toEqual(first)
      expect(within(tools()).getByRole('button', { name: 'Street' }), rail).toBeInTheDocument()
    }
    expect(screen.queryByRole('group', { name: 'Flow tools' })).toBeNull()
  })
})

describe('what answers in Flow (Decision "Steps change the tools")', () => {
  it('the masses answer as in Massing: picked, their handles, Shift+R turns them; the selection stays across steps', () => {
    render(<App />)
    act(() => s().select('m1'))
    act(() => useUi.getState().setRail('layers'))
    expect(s().selection.massIds).toEqual(['m1'])
    expect(document.querySelector('[data-mass="m1"]')).not.toHaveAttribute('pointer-events', 'none')
    expect(document.querySelector('[data-vertex], [data-handle^="mass-"]')).not.toBeNull()
    const before = s().project
    key('R', { shiftKey: true })
    expect(s().project).not.toBe(before)
    // a selection does not move the tab (Decision "Properties on the rail")
    expect(useUi.getState().rail).toBe('layers')
  })

  it('a road: a click picks it and Properties shows it; the roads are drawn in every step', () => {
    render(<App />)
    expect(ring().length).toBeGreaterThan(0)
    act(() => useUi.getState().setRail('layers'))
    click(ring()[0])
    expect(useRoads.getState().picked).toBe(ring()[0].getAttribute('data-road'))
    // the pick shows in the rail's Properties (Decision "Properties on the rail")
    properties()
    expect(screen.getByRole('region', { name: 'Road' })).toBeInTheDocument()
  })

  it('a gate: its handle picks it, Properties shows its fields, Delete removes it', () => {
    render(<App />)
    act(() => useUi.getState().setRail('layers'))
    const handle = screen.getByLabelText('Gate 1: drag it along its side')
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1 })
    expect(useAccess.getState().picked).toEqual({ kind: 'gate', id: 'g1' })
    properties()
    const gate = screen.getByRole('region', { name: 'Gate 1' })
    expect(within(gate).getByRole('textbox', { name: /Width/ })).toBeInTheDocument()
    key('Delete')
    expect(s().project.site.gates ?? []).toHaveLength(0)
  })

  it('the Gate tool places a gate on the boundary; Street gives it way; leaving the Flow tab lets neither go', () => {
    render(<App />)
    act(() => useUi.getState().setRail('layers'))
    fireEvent.click(within(tools()).getByRole('button', { name: 'Gate' }))
    expect(useAccess.getState().tool).toBe('gate')
    const capture = document.querySelector('[data-capture]')!
    fireEvent.pointerDown(capture, at({ x: 60, y: 0 }))
    fireEvent.pointerUp(capture, at({ x: 60, y: 0 }))
    expect(s().project.site.gates).toHaveLength(2)
    key('w')
    expect(useTool.getState().tool).toBe('street')
    expect(useAccess.getState().tool).toBeNull()
    act(() => useUi.getState().setRail('layers'))
    expect(useTool.getState().tool).toBe('street')
  })
})

describe('what each step tells (C.3, revised by Decision "Steps change the tools")', () => {
  it('every step tells every Issue and KPI: the circulation’s too', () => {
    const p = { ...demoProject(), kpis: ['built-footprint', 'road-area', 'issues'] }
    p.site = { ...p.site, gates: [] }
    act(() => s().open(p))
    render(<App />)
    const all = s().derived.issues
    const flowOnes = all.filter((i) => ['gate', 'access', 'road'].includes(i.code))
    expect(flowOnes.length).toBeGreaterThan(0)
    const strip = () => screen.getByRole('region', { name: 'Project figures' })
    const cells = () => within(strip()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    const count = () => within(within(strip()).getByRole('group', { name: 'Issues' })).getByText(/^\d+$/).textContent
    expect(cells()).toEqual(['Built footprint', 'Roads', 'Issues'])
    expect(Number(count())).toBe(all.length)
    act(() => useUi.getState().setRail('layers'))
    expect(cells()).toEqual(['Built footprint', 'Roads', 'Issues'])
    expect(Number(count())).toBe(all.length)
  })
})

describe('the standards are the brief’s (C.5, moved by K.4)', () => {
  it('the Brief’s Circulation tab: roads (and the ranges searched), gates, courts and stalls; each edit one undo step; a blank project has no court', () => {
    render(<App />)
    // the Circulation row of Layers, in Properties, leads to them
    act(() => showLayer('circulation'))
    fireEvent.click(screen.getByRole('button', { name: 'Brief › Circulation' }))
    expect(useUi.getState().dialog).toBe('brief')
    expect(within(screen.getByRole('tablist', { name: 'Brief parts' })).getByRole('tab', { name: 'Circulation' })).toHaveAttribute('aria-selected', 'true')
    const section = () => screen.getByRole('region', { name: 'Circulation standards' })
    const fields = () => within(section()).getAllByRole('textbox').map((f) => f.getAttribute('aria-label') ?? f.closest('label')?.textContent)
    // ten standards (a lot's aisle among them, Decision "Lot tool"; a street's lane width, PE.2), and from–to for the two road widths
    expect(within(section()).getAllByRole('textbox')).toHaveLength(14)
    const depth = within(section()).getByRole('textbox', { name: /Truck court depth/ })
    const steps = s().history.past.length
    fireEvent.change(depth, { target: { value: '35' } })
    fireEvent.blur(depth)
    expect(s().project.standards!.courtDepth).toBe(35)
    expect(s().history.past).toHaveLength(steps + 1)
    // a car road's width and the side an option parks on unless it says (Decision "Circulation layout")
    expect(within(section()).getByRole('textbox', { name: /^Car road width(?! search)/ })).toHaveValue('6')
    fireEvent.change(within(section()).getByRole('combobox', { name: /Parking along the roads/ }), { target: { value: 'single' } })
    expect(s().project.standards!.parking).toBe('single')
    act(() => s().open({ ...s().project, typology: 'blank' }))
    expect(within(section()).queryByRole('textbox', { name: /Truck court depth/ })).toBeNull()
    expect(fields()).toHaveLength(13)
    act(() => useUi.setState({ briefTab: 'programs', dialog: null }))
  })
})

describe('an issue of the masses in Flow (C.6, revised by Decision "Steps change the tools")', () => {
  it('has its own Solve, as in Massing: the step stays', () => {
    render(<App />)
    const issue = s().derived.issues.find((i) => i.code === 'relation')!
    expect(issue.massIds).toHaveLength(2)
    act(() => useUi.getState().setRail('layers'))
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: /Issues/ }))
    const item = screen.getByRole('button', { name: issue.message }).closest('li')!
    expect(within(item).getByRole('button', { name: 'Solve' })).toBeInTheDocument()
    expect(within(item).queryByRole('button', { name: '← Massing' })).toBeNull()
  })
})

describe('Connect (ST.7)', () => {
  it('one click: each court with no way to a truck gate gets one, as streets; a toast says it; one undo step', () => {
    const p = demoProject({ streets: false })
    useApp.setState({ project: p, derived: derive(p, 'o1') })
    render(<App />)
    act(() => useUi.getState().setRail('layers'))
    expect(s().derived.circulation.reached).toEqual([])
    const steps = s().history.past.length
    fireEvent.click(within(tools()).getByRole('button', { name: 'Connect' }))
    expect(s().derived.circulation.reached.sort()).toEqual(['m1', 'm2'])
    expect(useToast.getState().toast?.text).toMatch(/^Connect drew \d+ segments: 2 courts reached\. Ctrl\+Z undoes it\.$/)
    expect(s().history.past).toHaveLength(steps + 1)
    expect(ring().length).toBeGreaterThan(0)
    // again: nothing to do
    fireEvent.click(within(tools()).getByRole('button', { name: 'Connect' }))
    expect(useToast.getState().toast?.text).toBe('Every truck court already has its way to a truck gate.')
    expect(s().history.past).toHaveLength(steps + 1)
    act(() => s().undo())
    expect(s().project.options[0].streets).toBeUndefined()
  })
})
