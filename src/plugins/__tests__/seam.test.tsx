// The plugin seam in the frame (Decision "Optimizer plugin"): the optimizer's tabs at the end of the left panel's row of tabs
// (Phase AS.3) and of the Summary's rail, apart from the core's; a tab's view loads when it opens; not in the Site step; *View* hides them or turns the plugin off, per
// browser; a saved plugin tab that does not show opens the panel's own. Its data in the project: one undo step, saved
// in the .gft as it is, read through the plugin's own schema.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { setPluginData } from '../../state/actions/plugins.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { useApp } from '../../state/store.ts'
import { readSaved, STORAGE_KEY, useUi } from '../../views/layout/ui.ts'
import { pluginData, setPluginData as hostSet } from '../host.ts'
import { PLUGINS_KEY, usePluginModes } from '../settings.ts'

// WebGL does not run in jsdom
vi.mock('../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  usePluginModes.setState({ modes: {} })
})

// the left panel's row of tabs (Layers · Blocks · Properties, then the plugins'), the Summary's rail its tabs
const rail = (name: 'Panel tabs' | 'Summary') => within(screen.getByRole('tablist', { name }))
/** The left panel's row of tabs, the plugins' at its end (Phase AS.3). */
const leftRail = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
const names = (name: 'Panel tabs' | 'Summary') => rail(name).getAllByRole('tab').map((t) => t.getAttribute('aria-label') ?? t.textContent)

describe('the rails', () => {
  it("the Summary's rail holds the core's tabs only: a plugin's left tabs are Optimize and Agent, at the end of the left panel's row (Decision \"Panel tabs\")", () => {
    render(<App />)
    expect(names('Panel tabs')).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    expect(names('Summary')).not.toContain('Specimens')
    expect(names('Summary')).not.toContain('Revit')
    expect(leftRail().queryByRole('tab', { name: 'Revit' })).toBeNull()
  })

  it("opening a tab loads its view; the panel's header names it", async () => {
    render(<App />)
    fireEvent.click(leftRail().getByRole('tab', { name: 'Optimize' }))
    // Stages in the left panel, Specimens in the Summary's
    expect(useUi.getState().rail).toBe('plugin:optimizer/stages')
    expect(useUi.getState().summaryTab).toBe('plugin:optimizer/specimens')
    expect(await screen.findByText(/each specimen you keep becomes a new option/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Stages' })).toBeInTheDocument()
    expect(await screen.findByText(/No run yet/, undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Specimens' })).toBeInTheDocument()
  })

  it('are the same with the Properties tab open', () => {
    render(<App />)
    const before = [names('Panel tabs'), names('Summary')]
    act(() => useUi.getState().setRail('properties'))
    expect([names('Panel tabs'), names('Summary')]).toEqual(before)
  })
})

describe('View → the plugin', () => {
  const openView = () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    return within(screen.getByRole('menu', { name: 'View' }))
  }

  it('hides its tabs, and the open one gives way to the panel’s own; the choice is remembered', () => {
    useUi.setState({ rail: 'plugin:optimizer/stages', summaryTab: 'plugin:optimizer/specimens' })
    render(<App />)
    expect(screen.getByRole('tabpanel', { name: 'Stages' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Specimens' })).toBeInTheDocument()
    const tabs = openView().getByRole('menuitemcheckbox', { name: 'Optimizer tabs' })
    expect(tabs).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(tabs)
    expect(screen.queryByRole('tab', { name: 'Optimize' })).toBeNull()
    // each panel shows its own: Layers on the left, the Overview on the right
    expect(screen.getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(PLUGINS_KEY)!)).toEqual({ optimizer: 'hidden' })
    fireEvent.click(openView().getByRole('menuitemcheckbox', { name: 'Optimizer tabs' }))
    expect(screen.getByRole('tab', { name: 'Optimize' })).toBeInTheDocument()
  })

  it('turns it off (its check off too) and on again', () => {
    render(<App />)
    fireEvent.click(openView().getByRole('menuitem', { name: 'Turn the optimizer off' }))
    expect(usePluginModes.getState().modes.optimizer).toBe('off')
    expect(screen.queryByRole('tab', { name: 'Optimize' })).toBeNull()
    const menu = openView()
    expect(menu.getByRole('menuitemcheckbox', { name: 'Optimizer tabs' })).toBeDisabled()
    fireEvent.click(menu.getByRole('menuitem', { name: 'Turn the optimizer on' }))
    expect(screen.getByRole('tab', { name: 'Optimize' })).toBeInTheDocument()
  })

  it('a saved plugin tab is kept as it was saved; a malformed one is not', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'plugin:optimizer/optimize', summaryTab: 'plugin:' }))
    expect(readSaved().rail).toBe('plugin:optimizer/optimize')
    expect(readSaved().summaryTab).toBe('overview')
  })
})

describe("a plugin's data in the project", () => {
  const Settings = z.object({ seed: z.number() })

  it('is one undo step, and the same data changes nothing', () => {
    hostSet('optimizer', { seed: 3 })
    const p = useApp.getState().project
    expect(p.plugins).toEqual({ optimizer: { seed: 3 } })
    expect(setPluginData(p, 'optimizer', { seed: 3 })).toBe(p)
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.plugins).toBeUndefined()
  })

  it('removing the last one leaves no plugins field', () => {
    const p = setPluginData(demoProject(), 'optimizer', { seed: 1 })
    const q = setPluginData(setPluginData(p, 'other', 'x'), 'optimizer', undefined)
    expect(q.plugins).toEqual({ other: 'x' })
    expect('plugins' in setPluginData(q, 'other', undefined)).toBe(false)
  })

  it('travels in the .gft as it is, whatever the plugin wrote', () => {
    const p = setPluginData(demoProject(), 'optimizer', { seed: 2, templates: [{ id: 't1', anything: [1, 'a', null] }] })
    const r = readGft(writeGft(p))
    expect(r.ok && r.project.plugins).toEqual(p.plugins)
  })

  it("is read through the plugin's own schema: not valid, null", () => {
    const p = setPluginData(demoProject(), 'optimizer', { seed: 'not a number' })
    expect(pluginData(p, 'optimizer', Settings)).toBeNull()
    expect(pluginData(setPluginData(p, 'optimizer', { seed: 5 }), 'optimizer', Settings)).toEqual({ seed: 5 })
    expect(pluginData(demoProject(), 'optimizer', Settings)).toBeNull()
  })
})
