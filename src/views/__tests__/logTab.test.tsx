// The Decision log tab (Decision "Decision log"): your name on top, how many changes each one decided (a chip filters),
// the changes newest first by day, Export CSV at the foot. Since Phase Q.9 the Summary does not show the tab (the user's
// mark `ui:right.log`), so these mount the tab alone, in a panel of its own; Export's row is still in the app.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { actions } from '../../state/actions/index.ts'
import { useAuthor } from '../../state/author.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { LogTab } from '../panels/LogTab.tsx'
import { pickMenu } from './pickMenu.ts'

// WebGL does not run in jsdom
vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let downloads: string[] = []
beforeEach(() => {
  localStorage.clear()
  useAuthor.setState({ name: '' })
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  downloads = []
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
})
afterEach(() => vi.restoreAllMocks())

/** The tab, alone in a panel (the Summary does not mount it), beside the app for Export's row. */
const mount = () =>
  render(
    <>
      <div role="tabpanel" aria-label="Decision log">
        <LogTab />
      </div>
      <App />
    </>,
  )
const panel = () => within(screen.getByRole('tabpanel', { name: 'Decision log' }))

describe('the Decision log tab', () => {
  it('is not in the Summary rail; empty, it says what it will hold and Export CSV waits', () => {
    mount()
    expect(screen.queryByRole('tab', { name: 'Decision log' })).toBeNull()
    expect(panel().getByText(/No changes yet/)).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('lists the changes newest first, by who decided; a chip shows only theirs', () => {
    mount()
    const { option, level } = useApp.getState()
    act(() => useApp.getState().apply((p) => actions.moveMass(p, 'm1', { x: 5, y: 0 })))
    act(() => useApp.getState().apply((p) => actions.solve(p, option, level).project))
    act(() => useApp.getState().undo())
    expect(panel().getByText('3')).toBeInTheDocument()
    const rows = () => within(panel().getByRole('list', { name: 'Changes' })).getAllByRole('listitem').filter((li) => li.title)
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Designer\s*Undid: Solve/),
      expect.stringMatching(/SolveSolve/),
      expect.stringMatching(/DesignerMove mass: Warehouse 1/),
    ])
    expect(panel().getByText('Today')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: /^Solve 1/ }))
    expect(rows()).toHaveLength(1)
    fireEvent.click(panel().getByRole('button', { name: /^Solve 1/ }))
    expect(rows()).toHaveLength(3)
  })

  it('your name, once per browser, goes on the changes you make next', () => {
    mount()
    const name = panel().getByRole('textbox', { name: 'Your name' })
    fireEvent.change(name, { target: { value: 'Ana' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(localStorage.getItem('gfit.author')).toBe('Ana')
    act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm2')))
    expect(useApp.getState().project.log!.at(-1)!.author).toBe('Ana')
    expect(within(panel().getByRole('list', { name: 'Changes' })).getByText('Ana')).toBeInTheDocument()
  })

  it('Export CSV downloads <project> decision log_<date>.csv, here and in File › Export', () => {
    mount()
    act(() => useApp.getState().apply((p) => actions.removeMass(p, 'm2')))
    fireEvent.click(panel().getByRole('button', { name: 'Export CSV' }))
    expect(downloads[0]).toMatch(/^Demo-site-decision-log_\d{4}-\d{2}-\d{2}\.csv$/)
    pickMenu('File', 'Export', 'Decision log (.csv)')
    expect(downloads).toHaveLength(2)
  })
})
