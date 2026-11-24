// The brief against the design (Decisions "Brief sync" and "Brief issues"): no modes; when the option has more or
// fewer masses of a program than the brief asks for, an Issue says so (counted with the rest: the KPI, the chip) and
// the Summary's Issues tab lists it with its own ▶ Solve (the design follows) and Update brief (the brief follows, for
// that program: Decision "Issues, one list"). Nothing floats over the viewport. The demo asks for a guard house it has
// not placed.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'issues', panels: { left: true, right: true }, sheet: null })
  useGraph.setState({ graph: false, rule: null, relation: null })
  useToast.setState({ toast: null, confirmation: null })
})

const s = () => useApp.getState()
const group = () => screen.queryByRole('region', { name: 'Brief and design' })
const briefIssues = () => s().derived.issues.filter((i) => i.code === 'brief').map((i) => i.message)

describe('the brief against the design', () => {
  it('the demo: a guard house asked for and none placed is an Issue, in the Summary’s Issues tab; its Solve places it alone', () => {
    render(<App />)
    expect(briefIssues()).toEqual(['Guard house: 0 of the 1 mass the brief asks for.'])
    // nothing over the viewport
    expect(within(screen.getByRole('region', { name: 'Viewport' })).queryByText(/brief/)).toBeNull()
    expect(group()).toHaveTextContent('Guard house: 0 of the 1 mass the brief asks for.')
    // counted with the rest, on the Issues icon
    expect(within(screen.getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: /^Issues, 2 issues/ })).toBeInTheDocument()
    fireEvent.click(within(group()!).getByRole('button', { name: 'Solve' }))
    expect(s().project.masses.filter((m) => m.programId === 'guardhouse')).toHaveLength(1)
    expect(useToast.getState().toast?.text).toBe('1 mass of Guard house placed by its rules.')
    expect(useUi.getState().rail).toBe('layers')
    expect(group()).toBeNull()
    // only that: the office's rule is still broken
    expect(s().derived.relations.find((r) => r.rule === 'rule1')!.met).toBe(false)
  })

  it('a deleted warehouse: one of the two; its Update brief makes the brief ask for one, that program alone, in one undo step', () => {
    render(<App />)
    act(() => s().select('m2'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(group()).toHaveTextContent('Warehouse: 1 of the 2 masses the brief asks for.')
    const steps = s().history.past.length
    const warehouse = within(group()!).getAllByRole('listitem').find((li) => li.textContent?.includes('Warehouse'))!
    fireEvent.click(within(warehouse).getByRole('button', { name: 'Update brief' }))
    expect(s().project.programs.find((g) => g.id === 'warehouse')!.target).toEqual({ area: 24000, count: 1 })
    // the guard house's gap is another issue: it stays
    expect(s().project.programs.find((g) => g.id === 'guardhouse')!.target).toEqual({ area: 24, count: 1 })
    expect(s().history.past).toHaveLength(steps + 1)
    expect(group()).not.toHaveTextContent('Warehouse')
    expect(useToast.getState().toast?.text).toBe('The brief now asks for 1 Warehouse mass.')
  })

  it('more than it asks for: about those masses (a click selects them), no Solve; one the brief does not count is no issue', () => {
    useApp.setState((st) => {
      const project = { ...st.project, masses: st.project.masses.map((m) => (m.id === 'm3' ? { ...m, programId: 'warehouse' } : m)) }
      // the guard house and the office no longer counted
      const p = { ...project, programs: project.programs.map((g) => (g.id === 'guardhouse' || g.id === 'office' ? { ...g, target: undefined } : g)) }
      return { project: p, derived: derive(p, 'o1') }
    })
    render(<App />)
    expect(s().derived.issues.filter((i) => i.code === 'brief')).toEqual([
      { code: 'brief', severity: 'warning', massIds: ['m1', 'm2', 'm3'], message: 'Warehouse: 3 masses, the brief asks for 2.', program: 'warehouse' },
    ])
    expect(within(group()!).queryByRole('button', { name: 'Solve' })).toBeNull()
    expect(within(group()!).getByRole('button', { name: 'Update brief' })).toBeInTheDocument()
    fireEvent.click(within(group()!).getByRole('button', { name: /Warehouse: 3 masses/ }))
    expect([...s().selection.massIds].sort()).toEqual(['m1', 'm2', 'm3'])
    // the programs the brief does not count: nothing about them
    expect(s().derived.issues.some((i) => i.program === 'office' || i.program === 'guardhouse')).toBe(false)
  })

  it('the plan marks no place for them', () => {
    render(<App />)
    expect(document.querySelectorAll('[data-issue-marker]')).toHaveLength(1) // the office's rule, not the brief
  })
})
