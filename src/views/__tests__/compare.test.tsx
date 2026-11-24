// B.5 Compare options (Decision "Compare options"): opened from the option switch, it takes the viewport's place with
// one pane per option (plan or 3D) under one camera, chips to choose the options, *Edit* to go back to one, Escape to
// close, and the KPI table by option and building. `project()`: the demo's Option 1 (Building 1: m1, m2, m3) and an
// Option 2 that shows Building 1 too (linked) and a Building 2 of its own with the Shed.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { App } from '../../App.tsx'
import { asOption, derive } from '../../engine/derive.ts'
import { readKpi } from '../../modules/catalog.ts'
import { addBuilding, addOption, updateBuilding } from '../../state/actions/buildings.ts'
import { addMass } from '../../state/actions/masses.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useBuildingView } from '../buildingView.ts'
import { closeMenus, openMenu as openMenu2, pickMenu, rowOf } from './pickMenu.ts'
import { useCompare } from '../compare/compareView.ts'
import { useDetail } from '../detail.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { formatFigure } from '../format.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: ({ option }: { option?: string }) => <div data-testid="scene" data-option={option ?? 'main'} /> }))

const rect = (x: number, y: number, w: number, d: number) => ({ kind: 'rect' as const, center: { x, y }, width: w, depth: d, rotation: 0 })

function project(): { p: Project; b2: string; shed: string; o2: string } {
  const o2 = addOption(demoProject(), { buildingIds: ['b1'] })
  const b = addBuilding(o2.project, { optionId: o2.id })
  const shed = addMass(b.project, { programId: 'warehouse', footprint: rect(300, 215, 40, 20), levelId: b.levelId, name: 'Shed' })
  return { p: shed.project, b2: b.id, shed: shed.id, o2: o2.id }
}

function start(p: Project) {
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}

beforeEach(() => {
  localStorage.clear()
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useBuildingView.setState({ colorBy: 'program' })
  useToast.setState({ toast: null, confirmation: null })
  useCompare.setState({ open: false, optionIds: [], mode: 'plan', plan: null, camera: null, framing: 0 })
})

const s = () => useApp.getState()
const compare = () => screen.getByRole('region', { name: 'Compare options' })
const pane = (name: string) => within(compare()).getByRole('group', { name })
const plan = (name: string) => within(compare()).getByRole('img', { name: `Plan of ${name}` })
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /^Design option:/ }))
function openCompare() {
  openMenu()
  fireEvent.click(within(screen.getByRole('menu', { name: 'Design options' })).getByRole('menuitem', { name: 'Compare…' }))
}

describe('opening and closing', () => {
  it('Design › Options › Compare… (the top bar’s Compare switch went into the menu): off with one option, saying why; picked it opens, ticked, and picked again goes back to the viewport', () => {
    start(demoProject())
    render(<App />)
    // the top bar has no Compare switch any more
    expect(within(screen.getByRole('banner', { name: 'Top bar' })).queryByRole('button', { name: 'Compare' })).toBeNull()
    const row = () => {
      closeMenus()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Design' }))
      fireEvent.click(rowOf(openMenu2()!, 'Options'))
      return rowOf(openMenu2()!, 'Compare…')
    }
    expect(row()).toBeDisabled()
    expect(row()).toHaveAttribute('title', 'Make a second option to compare')
    act(() => start(project().p))
    expect(row()).not.toBeDisabled()
    expect(row()).toHaveAttribute('aria-checked', 'false')
    pickMenu('Design', 'Options', 'Compare…')
    expect(compare()).toBeInTheDocument()
    expect(row()).toHaveAttribute('aria-checked', 'true')
    pickMenu('Design', 'Options', 'Compare…')
    expect(screen.queryByRole('region', { name: 'Compare options' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
  })

  it('Compare… needs two options; it takes the viewport, lets go of the selection, one pane per option', () => {
    start(demoProject())
    render(<App />)
    openMenu()
    expect(within(screen.getByRole('menu', { name: 'Design options' })).getByRole('menuitem', { name: 'Compare…' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    const { p, shed } = project()
    act(() => start(p))
    act(() => s().select('m1'))
    openCompare()
    expect(s().selection.massIds).toEqual([])
    expect(screen.queryByRole('img', { name: 'Site plan' })).toBeNull()
    // each pane draws its option's masses: Option 1 has no Shed, Option 2 has Building 1 (linked) and the Shed
    expect(plan('Option 1').querySelector(`[data-compare-mass="${shed}"]`)).toBeNull()
    expect(plan('Option 1').querySelector('[data-compare-mass="m1"]')).not.toBeNull()
    expect(plan('Option 2').querySelector(`[data-compare-mass="${shed}"]`)).not.toBeNull()
    expect(plan('Option 2').querySelector('[data-compare-mass="m1"]')).not.toBeNull()
    // Escape closes it: the plan is back
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useCompare.getState().open).toBe(false)
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
  })

  it('a menu open over it takes the Escape first; Close and Edit go back to editing', () => {
    const { p, o2 } = project()
    start(p)
    render(<App />)
    openCompare()
    openMenu()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Design options' })).toBeNull()
    expect(useCompare.getState().open).toBe(true)
    fireEvent.click(within(pane('Option 2')).getByRole('button', { name: 'Edit' }))
    expect(s().option).toBe(o2)
    expect(useCompare.getState().open).toBe(false)
    openCompare()
    fireEvent.click(within(compare()).getByRole('button', { name: 'Close compare' }))
    expect(useCompare.getState().open).toBe(false)
  })

  it('the chips choose the options; the last one stays', () => {
    const { p } = project()
    start(p)
    render(<App />)
    openCompare()
    const chips = within(compare()).getByRole('group', { name: 'Options compared' })
    fireEvent.click(within(chips).getByRole('button', { name: 'Option 1' }))
    expect(within(compare()).queryByRole('group', { name: 'Option 1' })).toBeNull()
    expect(within(chips).getByRole('button', { name: 'Option 2' })).toBeDisabled()
    fireEvent.click(within(chips).getByRole('button', { name: 'Option 1' }))
    expect(within(compare()).getAllByRole('img').map((x) => x.getAttribute('aria-label'))).toEqual(['Plan of Option 1', 'Plan of Option 2'])
  })
})

describe('as the viewport draws (Phase S.3)', () => {
  it('each pane draws its option’s roads, courts, docks, hatches and labels, by the Detail', () => {
    const { p } = project()
    start(p)
    useDetail.setState({ detail: 'presentation' })
    render(<App />)
    openCompare()
    const one = plan('Option 1')
    const d = asOption(derive(p), 'o1')
    // every road has its hit stroke, an existing street's too (Phase PE.2 task 12)
    expect(one.querySelectorAll('[data-layer="roads"] [data-road]')).toHaveLength(d.circulation.roads.length)
    expect(one.querySelectorAll('[data-court]')).toHaveLength(d.circulation.docks.length)
    expect(one.querySelector('[data-layer="docks"]')).not.toBeNull()
    expect(one.querySelector('[data-hatch]')).not.toBeNull()
    expect(one.querySelector('[data-compare-label="m1"]')).not.toBeNull()
    act(() => useDetail.getState().setDetail('schematic'))
    expect([one.querySelector('[data-court]'), one.querySelector('[data-hatch]'), one.querySelector('[data-compare-label]')]).toEqual([null, null, null])
    expect(one.querySelector('[data-road]')).not.toBeNull()
  })
})

describe('one camera for every pane', () => {
  it('the wheel on one plan zooms them all, a drag pans them all, a double-click fits them again', () => {
    const { p } = project()
    start(p)
    render(<App />)
    openCompare()
    const views = () => [plan('Option 1'), plan('Option 2')].map((x) => x.getAttribute('viewBox'))
    const fitted = views()
    expect(fitted[0]).toBe(fitted[1])
    fireEvent.wheel(plan('Option 1'), { deltaY: -300, clientX: 200, clientY: 150 })
    const zoomed = views()
    expect(zoomed[0]).not.toBe(fitted[0])
    expect(zoomed[1]).toBe(zoomed[0])
    const two = plan('Option 2')
    fireEvent.pointerDown(two, { button: 0, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(two, { pointerId: 1, clientX: 360, clientY: 320 })
    fireEvent.pointerUp(two, { pointerId: 1, clientX: 360, clientY: 320 })
    const panned = views()
    expect(panned[0]).not.toBe(zoomed[0])
    expect(panned[1]).toBe(panned[0])
    fireEvent.doubleClick(plan('Option 1'))
    expect(views()).toEqual(fitted)
  })

  it('3D: one scene per option (loaded lazily, as the main one)', async () => {
    const { p, o2 } = project()
    start(p)
    render(<App />)
    openCompare()
    fireEvent.click(within(compare()).getByRole('tab', { name: '3D' }))
    // each pane suspends until the 3D chunk arrives
    await waitFor(() => expect(within(compare()).getAllByTestId('scene').map((x) => x.getAttribute('data-option'))).toEqual(['o1', o2]))
  })
})

describe('the KPI table', () => {
  it('one column per option, every figure as the engine reads it for that option', () => {
    const { p, o2 } = project()
    start(p)
    render(<App />)
    openCompare()
    const table = within(compare()).getByRole('table', { name: 'Options compared' })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['KPI', 'Option 1 · active', 'Option 2'])
    const d = s().derived
    for (const id of ['built-footprint', 'coverage', 'gfa', 'buildings', 'issues']) {
      const row = table.querySelector(`[data-kpi-row="${id}"]`)!
      const cells = within(row as HTMLElement).getAllByRole('cell').map((c) => c.textContent)
      const want = ['o1', o2].map((o) => {
        const k = readKpi(id, s().project, asOption(d, o))!
        return formatFigure(k.value, k.unit)
      })
      expect(cells).toEqual(want)
    }
    // Option 2 adds the Shed (800 m²) to the same Building 1
    expect(within(table.querySelector('[data-kpi-row="gfa"]') as HTMLElement).getAllByRole('cell').map((c) => c.textContent)).toEqual(['24,800 m²', '25,600 m²'])
  })

  it('GFA by building: — where an option does not show it, linked marked, context not counted', () => {
    const { p, b2 } = project()
    start(updateBuilding(p, b2, { context: true }))
    render(<App />)
    openCompare()
    const table = within(compare()).getByRole('table', { name: 'Options compared' })
    const one = table.querySelector('tr[data-building-row="b1"]') as HTMLElement
    expect(within(one).getByRole('rowheader')).toHaveTextContent('Building 1, linked')
    expect(within(one).getAllByRole('cell').map((c) => c.textContent)).toEqual(['24,800 m²', '24,800 m²'])
    const two = table.querySelector(`tr[data-building-row="${b2}"]`) as HTMLElement
    expect(within(two).getAllByRole('cell').map((c) => c.textContent)).toEqual(['—', 'context'])
  })

  it('it follows an edit made while it is open (undo from the keyboard)', () => {
    const { p } = project()
    start(p)
    render(<App />)
    act(() => s().apply((q) => ({ ...q, masses: q.masses.filter((m) => m.id !== 'm3') })))
    openCompare()
    const gfa = () =>
      within(within(compare()).getByRole('table', { name: 'Options compared' }).querySelector('[data-kpi-row="gfa"]') as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    expect(gfa()).toEqual(['24,000 m²', '24,800 m²'])
    act(() => s().undo())
    expect(gfa()).toEqual(['24,800 m²', '25,600 m²'])
  })
})
