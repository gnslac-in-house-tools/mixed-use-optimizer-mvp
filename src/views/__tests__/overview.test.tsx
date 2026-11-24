// The Overview (Decision "Isolate in the Overview"): the option's figures in groups that fold; a program's or a
// building's row isolates it (the KPI strip and the groups read it alone, the plan draws the others faint); Expand
// opens a building into its programs and a program into its masses. The demo: Warehouse 1 and 2 (24,000 m²) and
// Office 1 (800 m²), all in Building 1.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { isolatedProject, useIsolate } from '../stats/isolate.ts'
import { useOverview } from '../stats/Overview.tsx'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ summaryTab: 'overview', panels: { left: true, right: true }, view: 'plan' })
  useIsolate.setState({ isolated: null })
  useOverview.setState({ expanded: false, folded: [] })
})

const overview = () => screen.getByRole('tabpanel', { name: 'Overview' })
/** The strip's Built footprint. */
const footprint = () => within(screen.getByRole('region', { name: 'Project figures' })).getByRole('group', { name: /Built footprint/ })

describe('isolating', () => {
  it('the project with only the isolated masses', () => {
    const p = demoProject()
    expect(isolatedProject(p, { kind: 'program', id: 'office' }).masses.map((m) => m.id)).toEqual(['m3'])
    expect(isolatedProject(p, { kind: 'building', id: 'b1' }).masses).toHaveLength(3)
    expect(isolatedProject(p, null)).toBe(p)
  })

  it('a program’s row: the strip reads it alone, the plan draws the others faint; again, or its ✕, lets it go', () => {
    render(<App />)
    expect(footprint()).toHaveTextContent('24,800')
    fireEvent.click(within(overview()).getByRole('button', { name: /Office/ }))
    expect(footprint()).not.toHaveTextContent('24,800')
    expect(footprint()).toHaveTextContent('800')
    expect(within(overview()).getByRole('status')).toHaveTextContent('Isolated: Office')
    expect(document.querySelector('[data-mass="m1"]')).toHaveAttribute('fill-opacity', '0.14')
    expect(document.querySelector('[data-mass="m3"]')).not.toHaveAttribute('fill-opacity', '0.14')
    fireEvent.click(within(overview()).getByRole('button', { name: 'Show everything' }))
    expect(useIsolate.getState().isolated).toBeNull()
    expect(footprint()).toHaveTextContent('24,800')
  })

  it('a building’s row isolates it; another option lets it go', () => {
    render(<App />)
    fireEvent.click(within(within(overview()).getByRole('table', { name: 'By building' })).getByRole('button', { name: /Building 1/ }))
    expect(useIsolate.getState().isolated).toEqual({ kind: 'building', id: 'b1' })
    act(() => useApp.setState({ option: 'o2' }))
    expect(useIsolate.getState().isolated).toBeNull()
  })
})

describe('the groups and Expand', () => {
  it('groups fold; Expand lists a program’s masses and a building’s programs', () => {
    render(<App />)
    const site = within(overview()).getByRole('region', { name: 'Site' })
    expect(within(site).getByText('Site area')).toBeInTheDocument()
    fireEvent.click(within(site).getByRole('button', { name: 'Site' }))
    expect(within(site).queryByText('Site area')).toBeNull()
    // no ground: no Topography
    expect(within(overview()).queryByRole('region', { name: 'Topography' })).toBeNull()
    fireEvent.click(within(overview()).getByRole('checkbox', { name: 'Expand' }))
    expect(within(overview()).getByRole('list', { name: "Warehouse's masses" })).toHaveTextContent('Warehouse 1')
    expect(document.querySelectorAll('[data-building-program]').length).toBe(2)
  })
})
