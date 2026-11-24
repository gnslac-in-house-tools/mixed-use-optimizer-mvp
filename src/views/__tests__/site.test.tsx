// The Site step (Decision "Site step"): the first of the pipeline. Its settings are Properties' for the Site row of Layers since
// Phase AS.3 (the Site tab and its parts went): the site's figures and rules, setback and max coverage (no spacing: Decision "Spacing by
// rules"); the plan shows the site with the masses as ghosts that do not answer; Import reads a site's file (Phase 5.2); no Approve
// site (what moves shows already).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { NO_SELECTION, useApp } from '../../state/store.ts'
import { useGraph } from '../graph/graphState.ts'
import { useUi } from '../layout/ui.ts'
import { useTool } from '../plan/tools/toolState.ts'
import { showLayer } from '../layers/show.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { letGo } from '../tools/hand.ts'

vi.mock('../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  letGo()
  useAccess.setState({ picked: null })
})

const left = () => screen.getByRole('complementary', { name: 'Layers and properties' })
/** The Site row of Layers picked: its settings are shown open in Properties, with no fold (Decision "Settings by what is picked"). */
const openSite = () => act(() => showLayer('site'))

describe('the site’s settings by the row picked (Decision "Settings by what is picked")', () => {
  it('Site · Terrain · Gates: each its own settings, one at a time (no Grid part: the bottom bar’s Grid menu holds it); a tool taken leaves what is picked, what is picked on the plan does not open Properties', () => {
    // the Terrain row is there once the site has ground (Decision "What is not there is not shown")
    act(() => useApp.getState().apply((p) => setTerrain(p, { contours: [], points: [{ x: 10, y: 10, z: 100 }] })))
    render(<App />)
    openSite()
    expect(within(left()).getByText('Site area')).toBeInTheDocument()
    expect(within(left()).queryByRole('button', { name: 'Brief › Circulation' })).toBeNull()
    expect(within(left()).queryByLabelText('Terrain figures')).toBeNull()
    act(() => showLayer('terrain'))
    expect(within(left()).getByLabelText('Terrain figures')).toBeInTheDocument()
    expect(within(left()).queryByText('Site area')).toBeNull()
    // the access: the Gates row has the way to the standards, the Brief's Circulation tab (Phase K.4)
    act(() => showLayer('gates'))
    expect(within(left()).getByRole('button', { name: 'Brief › Circulation' })).toBeInTheDocument()
    expect(within(left()).queryByRole('region', { name: 'Circulation standards' })).toBeNull()
    expect(within(left()).queryByText('Site area')).toBeNull()
    act(() => showLayer('site'))
    // an access tool of the strip taken changes nothing in the panel
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Existing road' }))
    expect(useUi.getState().rail).toBe('properties')
    expect(within(left()).getByText('Site area')).toBeInTheDocument()
    // an existing road picked on the plan lets the row go; Properties (open) shows it, and nothing opens it by itself
    act(() => useAccess.getState().pick({ kind: 'existing', id: 'e1' }))
    expect(within(left()).queryByText('Site area')).toBeNull()
    act(() => useUi.getState().setRail('layers'))
    act(() => useAccess.getState().pick({ kind: 'existing', id: 'e1' }))
    expect(useUi.getState().rail).toBe('layers')
  })
})

describe('the Site step', () => {
  it('its panel: the figures and the rules, setback and max coverage, no spacing', () => {
    render(<App />)
    openSite()
    expect(within(left()).getByText('Site area').nextSibling).toHaveTextContent('109,600 m²')
    expect(within(left()).getByText('Buildable area')).toBeInTheDocument()
    expect(within(left()).getByText('Max. coverage')).toBeInTheDocument()
    expect(within(left()).queryByText('Min. spacing')).toBeNull()
    const setback = within(left()).getByRole('textbox', { name: /Setback/ })
    fireEvent.change(setback, { target: { value: '15' } })
    fireEvent.blur(setback)
    expect(useApp.getState().project.site.rules.setback).toBe(15)
  })

  it('the plan as in Massing: its masses answer Select, the drafting bar stays; a site tool at work lets the pointer through (Decision "Site with the viewport")', () => {
    render(<App />)
    openSite()
    const mass = () => document.querySelector('[data-mass="m1"]')!
    expect(mass()).not.toHaveAttribute('pointer-events', 'none')
    expect(mass()).not.toHaveAttribute('fill-opacity', '0.14')
    const tools = screen.getByRole('toolbar', { name: 'Tools' })
    expect(screen.getByRole('region', { name: 'Drafting' })).toBeInTheDocument()
    // Select is the strip's
    const select = within(tools).getByRole('button', { name: 'Select' })
    expect(select).toHaveAttribute('aria-pressed', 'true')
    // an access tool on: the masses let it be; Select leaves it
    fireEvent.click(within(tools).getByRole('button', { name: 'Existing road' }))
    expect(mass()).toHaveAttribute('pointer-events', 'none')
    fireEvent.click(select)
    expect(mass()).not.toHaveAttribute('pointer-events', 'none')
    // the masses' keys work: Delete removes the selected one (one undo step); B is Draw whatever tab is open, and the tab stays (AS.2 task 4)
    act(() => useApp.getState().select('m1'))
    fireEvent.keyDown(window, { key: 'b' })
    expect(useTool.getState().tool).toBe('mass')
    expect(useUi.getState().rail).toBe('properties')
    fireEvent.keyDown(window, { key: 'b' })
    expect(useTool.getState().tool).toBe('select')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useApp.getState().project.masses.some((m) => m.id === 'm1')).toBe(false)
  })

  it('no Approve site: what moves in Site shows already (Decision "No approve site")', () => {
    render(<App />)
    openSite()
    expect(within(left()).queryByRole('button', { name: /Approve site/ })).toBeNull()
  })
})
