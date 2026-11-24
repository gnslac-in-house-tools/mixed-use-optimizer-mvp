// 2.3 through the UI: the KPI strip shows the project's choice in order, with limits and status; Customize picks and
// orders them as undoable project edits; the Issues KPI opens the Summary's Issues and the warnings chip marks where
// they are in red (Decision "Issues, one list"). Adapted from Plaza-Practiko's pantalla / interfazIzquierda tests
// (Avisos, chip de avisos).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { readSaved, useUi } from '../../layout/ui.ts'
import { useIssueFocus } from '../../plan/issueMarkers.ts'
import { useGoTo } from '../../viewport/goTo.ts'
import { WARNINGS_KEY, useWarningsPref } from '../warningsPref.ts'
import { pickMenu } from '../../__tests__/pickMenu.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, kpiSize: 'full' })
  useWarningsPref.setState({ visible: true })
  useGoTo.setState({ target: null })
  useIssueFocus.setState({ key: null, n: 0, highlight: false })
})

const strip = () => screen.getByRole('region', { name: 'Project figures' })
const cells = () => within(strip()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))
const openPicker = () => fireEvent.click(within(strip()).getByRole('button', { name: 'Customize KPIs' }))
const picker = () => screen.getByRole('dialog', { name: 'Customize KPIs' })

describe('KPI strip', () => {
  it('shows the typology’s KPIs in order, with their figures', () => {
    render(<App />)
    expect(cells()).toEqual(['Built footprint', 'Warehouse footprint', 'Coverage', 'Built volume', 'Open area', 'Issues'])
    const coverage = within(strip()).getByRole('group', { name: 'Coverage' })
    expect(coverage).toHaveTextContent('22.6')
    expect(coverage).toHaveTextContent('Within the max 60.0 %')
    expect(coverage.querySelector('[data-status="within"]')).not.toBeNull()
    expect(within(strip()).getByRole('group', { name: 'Warehouse footprint' })).toHaveTextContent('24,000 m²')
  })

  it('a broken limit turns the dot and the line red', () => {
    render(<App />)
    act(() => useApp.getState().apply((p) => actions.updateSiteRules(p, { maxCoverage: 0.1 })))
    const coverage = within(strip()).getByRole('group', { name: 'Coverage' })
    expect(coverage).toHaveTextContent('Over the max 10.0 %')
    expect(coverage.querySelector('[data-status="over"]')).not.toBeNull()
    expect(within(strip()).getByRole('group', { name: 'Issues' })).toHaveTextContent('Has errors')
  })
})

describe('the Issues KPI (Decisions "Issues from the KPI" and "Issues, one list")', () => {
  it('a click opens the Summary on Issues, the panel shown, where they are listed', () => {
    useUi.setState({ summaryTab: 'overview', panels: { left: true, right: false } })
    render(<App />)
    act(() => useApp.getState().apply((p) => actions.updateSiteRules(p, { maxCoverage: 0.1 })))
    const cell = within(strip()).getByRole('group', { name: 'Issues' })
    fireEvent.click(within(cell).getByRole('button', { name: /^Issues/ }))
    expect(useUi.getState()).toMatchObject({ summaryTab: 'issues', panels: { right: true } })
    const tab = screen.getByRole('region', { name: 'Issues' })
    expect(tab).toHaveTextContent(/coverage/i)
    expect(within(tab).getAllByRole('listitem')).toHaveLength(useApp.getState().derived.issues.length)
    expect(screen.queryByRole('group', { name: 'Project issues' })).toBeNull()
  })

  it('with no issues it is a figure, not a button', () => {
    render(<App />)
    // the demo's issues: a rule (the office against its warehouse) and the guard house the brief asks for
    act(() => useApp.getState().apply((p) => ({ ...p, rules: [], programs: p.programs.map((g) => (g.id === 'guardhouse' ? { ...g, target: undefined } : g)) })))
    expect(useApp.getState().derived.issues).toEqual([])
    expect(within(within(strip()).getByRole('group', { name: 'Issues' })).queryByRole('button')).toBeNull()
  })
})

describe('Customize KPIs', () => {
  it('hide, show and move are project edits: saved in the Project, one undo step each', () => {
    render(<App />)
    openPicker()
    fireEvent.click(within(picker()).getByRole('button', { name: 'Hide Open area' }))
    expect(cells()).not.toContain('Open area')
    expect(useApp.getState().project.kpis).not.toContain('open-area')
    fireEvent.click(within(picker()).getByRole('button', { name: 'Show Site area' }))
    expect(cells().at(-1)).toBe('Site area')
    fireEvent.click(within(picker()).getByRole('button', { name: 'Move Coverage up' }))
    expect(cells().slice(0, 3)).toEqual(['Built footprint', 'Coverage', 'Warehouse footprint'])
    act(() => useApp.getState().undo())
    expect(cells().slice(0, 3)).toEqual(['Built footprint', 'Warehouse footprint', 'Coverage'])
    expect(useApp.getState().history.past).toHaveLength(2)
  })

  it('a dragged row lands where it is dropped', () => {
    render(<App />)
    openPicker()
    const rows = within(within(picker()).getByRole('list', { name: 'Shown KPIs' })).getAllByRole('listitem')
    fireEvent.dragStart(rows[5]) // Issues
    fireEvent.dragOver(rows[0])
    fireEvent.drop(rows[0])
    expect(cells()[0]).toBe('Issues')
  })

  it('back to the typology’s default', () => {
    render(<App />)
    openPicker()
    fireEvent.click(within(picker()).getByRole('button', { name: 'Hide Built volume' }))
    const back = within(picker()).getByRole('button', { name: 'Back to the typology’s default' })
    expect(back).toBeEnabled()
    fireEvent.click(back)
    expect(cells()).toContain('Built volume')
    expect(back).toBeDisabled()
  })
})

describe('warnings chip (Decision "Issues, one list")', () => {
  it('hidden without issues; with them, a count; a click marks where they are in red, no list; again, the marks go', () => {
    // without the example rules, nor the guard house it asks for, the demo has no issue
    act(() => useApp.getState().apply((p) => ({ ...p, rules: undefined, programs: p.programs.map((g) => (g.id === 'guardhouse' ? { ...g, target: undefined } : g)) })))
    render(<App />)
    const viewport = () => screen.getByRole('region', { name: 'Viewport' })
    expect(within(viewport()).queryByRole('button', { name: /issue/ })).toBeNull()
    act(() => useApp.getState().apply((p) => actions.moveMass(p, 'm2', { x: -150, y: 0 }))) // onto Warehouse 1
    const chip = within(viewport()).getByRole('button', { name: /issues?$/ })
    expect(document.querySelector('[data-issue-highlight]')).toBeNull()
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Project issues' })).toBeNull()
    const marked = [...document.querySelectorAll('[data-issue-mass]')].map((e) => e.getAttribute('data-issue-mass')).sort()
    expect(marked).toEqual(['m1', 'm2'])
    // nothing selected, nothing moved: it only marks
    expect(useApp.getState().selection.massIds).toEqual([])
    fireEvent.click(chip)
    expect(document.querySelector('[data-issue-highlight]')).toBeNull()
    // solved, the marks go with the chip
    fireEvent.click(chip)
    act(() => useApp.getState().undo())
    expect(within(viewport()).queryByRole('button', { name: /issues?$/ })).toBeNull()
    expect(useIssueFocus.getState().highlight).toBe(false)
  })

  it('its count can go (View › Overlays › Issue count on the chip); the preference is remembered', () => {
    render(<App />)
    act(() => useApp.getState().apply((p) => actions.moveMass(p, 'm2', { x: -150, y: 0 })))
    const chip = within(screen.getByRole('region', { name: 'Viewport' })).getByRole('button', { name: /issues?$/ })
    pickMenu('View', 'Overlays', 'Issue count on the chip')
    expect(localStorage.getItem(WARNINGS_KEY)).toBe('no')
    expect(chip.textContent).toBe('')
  })
})

describe('the KPI strip’s sizes (Phase U.1, Decision "Ribbon")', () => {
  const grip = () => screen.getByRole('separator', { name: 'KPI strip size' })
  const size = () => strip().getAttribute('data-kpi-size')

  it('its bottom edge, dragged up, shrinks it a size per jump; down, grows it; a double-click: Full', () => {
    useUi.setState({ kpiSize: 'full' })
    render(<App />)
    const coverage = () => within(strip()).getByRole('group', { name: 'Coverage' })
    expect(size()).toBe('full')
    expect(coverage()).toHaveTextContent(/max|Within|Over/)
    fireEvent.pointerDown(grip(), { clientY: 100, pointerId: 1, button: 0 })
    fireEvent.pointerMove(grip(), { clientY: 76, pointerId: 1 })
    expect(size()).toBe('medium')
    // the line under the figure goes; the figure stays
    expect(coverage()).toHaveTextContent('22.6')
    expect(coverage()).not.toHaveTextContent(/max|Within|Over/)
    fireEvent.pointerMove(grip(), { clientY: 20, pointerId: 1 })
    expect(size()).toBe('compact')
    fireEvent.pointerMove(grip(), { clientY: 112, pointerId: 1 })
    fireEvent.pointerUp(grip(), { pointerId: 1 })
    expect(size()).toBe('full')
    // not remembered: the app opens compact every time (Decision "Compact by default")
    expect(readSaved().kpiSize).toBe('compact')
    fireEvent.doubleClick(grip())
    expect(size()).toBe('full')
  })

  it('↑ ↓ on the grip, and the View menu’s three', () => {
    useUi.setState({ kpiSize: 'full' })
    render(<App />)
    fireEvent.keyDown(grip(), { key: 'ArrowUp' })
    expect(size()).toBe('medium')
    fireEvent.keyDown(grip(), { key: 'ArrowUp' })
    fireEvent.keyDown(grip(), { key: 'ArrowUp' })
    expect(size()).toBe('compact')
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    expect(size()).toBe('medium')
    pickMenu('View', 'Bars', 'KPI strip: Compact')
    expect(size()).toBe('compact')
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    act(() => useUi.getState().resetLayout())
    expect(size()).toBe('compact')
  })
})
