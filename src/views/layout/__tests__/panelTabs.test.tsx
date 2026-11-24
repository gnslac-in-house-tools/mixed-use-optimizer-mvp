// The left panel's three tabs (Phase AS.3, Decision "Panel tabs"): Layers · Blocks · Properties, then the plugins' at the row's
// end; no rail, no Brief tiles, no Site / Levels / Flow tab, no Overlays ▾; a layout saved with a tab of before opens Layers; a plugin
// held back shows its tab dimmed with its notice; below 880 px and on a phone the tabs are the row at the top of the sheet.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { COMING_SOON, usePluginModes } from '../../../plugins/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { blank } from '../../../typologies/blank.ts'
import { TYPOLOGIES } from '../../../typologies/index.ts'
import { useLayerPick } from '../../layers/layerPick.ts'
import { showProperties } from '../../plan/massCommands.ts'
import { openMenu, pickMenu, rowOf } from '../../__tests__/pickMenu.ts'
import { readSaved, STORAGE_KEY, useUi } from '../ui.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const panel = () => screen.getByRole('complementary', { name: 'Layers and properties' })
const tabs = () => within(panel().querySelector<HTMLElement>('[data-panel-tabs]')!)
// a built-in tab's name is its text; a plugin's tab is an icon alone, its name the aria-label
const tabNames = () => tabs().getAllByRole('tab').map((t) => t.getAttribute('aria-label') ?? t.textContent)

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  useLayerPick.setState({ keys: [] })
  usePluginModes.setState({ modes: {}, locks: {}, soon: {} })
})

describe('the three tabs', () => {
  it('Layers · Blocks · Properties, then the plugins’ at the row’s end; the panel is named Layers and properties; Layers is open at first', () => {
    render(<App />)
    expect(panel()).toHaveAccessibleName('Layers and properties')
    expect(within(panel()).getByRole('heading', { name: 'Layers and properties' })).toBeInTheDocument()
    expect(panel().querySelector('[data-panel-tabs]')).toHaveAttribute('aria-label', 'Panel tabs')
    expect(screen.getByRole('tablist', { name: 'Panel tabs' })).toHaveAttribute('aria-orientation', 'horizontal')
    expect(tabNames()).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    expect(tabs().getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    expect(within(panel()).getByRole('tree', { name: 'Layers' })).toBeInTheDocument()
  })

  it('each tab opens its own view: Properties the fields of what is picked, Blocks the smart blocks, Layers the tree again', () => {
    render(<App />)
    fireEvent.click(tabs().getByRole('tab', { name: 'Properties' }))
    expect(useUi.getState().rail).toBe('properties')
    expect(tabs().getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).getByRole('tabpanel', { name: 'Properties' })).toBeInTheDocument()
    expect(within(panel()).queryByRole('tree', { name: 'Layers' })).toBeNull()
    // nothing picked: the building the plan is on
    expect(within(panel()).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
    fireEvent.click(tabs().getByRole('tab', { name: 'Blocks' }))
    expect(useUi.getState().rail).toBe('blocks')
    expect(within(panel()).getByRole('tabpanel', { name: 'Blocks' })).toBeInTheDocument()
    fireEvent.click(tabs().getByRole('tab', { name: 'Layers' }))
    expect(useUi.getState().rail).toBe('layers')
    expect(within(panel()).getByRole('tree', { name: 'Layers' })).toBeInTheDocument()
  })

  it('the anchors: tab-layers, tab-blocks, tab-properties and a plugin’s tab-<label>', () => {
    render(<App />)
    const anchors = tabs().getAllByRole('tab').map((t) => t.getAttribute('data-tour'))
    expect(anchors).toEqual(['tab-layers', 'tab-blocks', 'tab-properties', 'tab-optimize', 'tab-agent'])
  })

  it('there is no Blocks where the typology offers no warehouse', () => {
    // every typology the app knows offers it (Phase D.2): one that offers none is one it does not list
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain'] })
    try {
      const p = { ...useApp.getState().project, typology: 'bare', warehouseTypes: undefined }
      act(() => useApp.setState({ project: p, derived: derive(p) }))
      render(<App />)
      expect(tabNames()).toEqual(['Layers', 'Properties', 'Optimize', 'Agent'])
      // a saved Blocks tab gives way to Layers there
      act(() => useUi.setState({ rail: 'blocks' }))
      expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    } finally {
      TYPOLOGIES.pop()
    }
  })

  it('a selection never opens Properties by itself; Properties in a menu does, on a wide screen', () => {
    render(<App />)
    act(() => useApp.getState().select('m2'))
    expect(useUi.getState().rail).toBe('layers')
    expect(tabs().getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('review: the tabs as ARIA tabs', () => {
  it('each tab points at its tabpanel with aria-controls, and the tabpanel is labelled by its tab', () => {
    render(<App />)
    for (const name of ['Layers', 'Properties', 'Blocks'] as const) {
      fireEvent.click(tabs().getByRole('tab', { name }))
      const tab = tabs().getByRole('tab', { name })
      const body = within(panel()).getByRole('tabpanel', { name })
      expect(tab.id, name).not.toBe('')
      expect(tab.getAttribute('aria-controls'), name).toBe(body.id)
      expect(body.id, name).not.toBe('')
      expect(body.getAttribute('aria-labelledby'), name).toBe(tab.id)
    }
  })

  it('a plugin’s tab points at the panel its plugin opened', async () => {
    render(<App />)
    fireEvent.click(tabs().getByRole('tab', { name: 'Optimize' }))
    const body = await screen.findByRole('tabpanel', { name: 'Stages' })
    expect(tabs().getByRole('tab', { name: 'Optimize' }).getAttribute('aria-controls')).toBe(body.id)
  })

  it('← and → move between the tabs (and wrap), Home and End go to the first and the last; they only move focus', () => {
    render(<App />)
    const tab = (name: string) => tabs().getByRole('tab', { name })
    act(() => tab('Layers').focus())
    fireEvent.keyDown(tab('Layers'), { key: 'ArrowRight' })
    expect(tab('Blocks')).toHaveFocus()
    fireEvent.keyDown(tab('Blocks'), { key: 'ArrowRight' })
    expect(tab('Properties')).toHaveFocus()
    fireEvent.keyDown(tab('Properties'), { key: 'ArrowLeft' })
    expect(tab('Blocks')).toHaveFocus()
    fireEvent.keyDown(tab('Blocks'), { key: 'End' })
    expect(tab('Agent')).toHaveFocus()
    fireEvent.keyDown(tab('Agent'), { key: 'ArrowRight' })
    expect(tab('Layers')).toHaveFocus()
    fireEvent.keyDown(tab('Layers'), { key: 'ArrowLeft' })
    expect(tab('Agent')).toHaveFocus()
    fireEvent.keyDown(tab('Agent'), { key: 'Home' })
    expect(tab('Layers')).toHaveFocus()
    // focus moved, nothing opened: Enter or Space (the button's click) does that
    expect(useUi.getState().rail).toBe('layers')
  })

  it('a tab held back is skipped by the arrows', () => {
    usePluginModes.setState({ soon: COMING_SOON })
    render(<App />)
    const tab = (name: string) => tabs().getByRole('tab', { name })
    act(() => tab('Properties').focus())
    fireEvent.keyDown(tab('Properties'), { key: 'ArrowRight' })
    expect(tab('Layers')).toHaveFocus()
  })
})

describe('what is gone', () => {
  it('no rail of areas, no Brief tiles, no Site, Levels or Flow tab, no Parameters name, no Overlays ▾; the settings are Properties’ by what is picked in Layers', () => {
    render(<App />)
    expect(document.querySelector('[data-area-rail]')).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Settings' })).toBeNull()
    for (const name of ['Site', 'Levels', 'Flow', 'Brief']) expect(tabs().queryByRole('tab', { name })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Layers, properties and brief' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Parameters' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Brief and rules' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Programs' })).toBeNull()
    // the drafting bar keeps the Detail and the terrain's look; Overlays ▾ and Display ▾ are not there
    const drafting = screen.getByRole('region', { name: 'Drafting' })
    expect(within(drafting).queryByRole('button', { name: 'Overlays' })).toBeNull()
    expect(within(drafting).queryByRole('button', { name: 'Display' })).toBeNull()
    expect(within(drafting).getByRole('combobox', { name: 'Detail' })).toBeInTheDocument()
  })

  it('the View menu names the panel', () => {
    render(<App />)
    pickMenu('View')
    fireEvent.click(rowOf(openMenu()!, 'Panels'))
    expect(rowOf(openMenu()!, 'Layers and properties panel')).toHaveAttribute('aria-checked', 'true')
  })
})

describe('a layout saved before the three tabs', () => {
  it.each(['site', 'massing', 'flow', 'brief'])('a saved rail of %s opens Layers', (old) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: old }))
    expect(readSaved().rail).toBe('layers')
    // a store that still holds one (a session of before) draws Layers too
    act(() => useUi.setState({ rail: old as never }))
    render(<App />)
    expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    expect(tabs().getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
  })

  it('the three tabs and a plugin’s are read back as saved; the settings groups’ folds of before are ignored', () => {
    for (const rail of ['layers', 'blocks', 'properties', 'plugin:optimizer/stages']) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail, folded: ['site'] }))
      expect(readSaved().rail).toBe(rail)
      expect('folded' in readSaved()).toBe(false)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}))
    expect(readSaved().rail).toBe('layers')
    // the old openGroup of before is ignored too
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'layers', openGroup: 'parking' }))
    expect(readSaved()).not.toHaveProperty('openGroup')
  })
})

describe('the plugins’ tabs', () => {
  it('a plugin’s tab is an icon alone: no visible text, its label the accessible name, its title names it; the built-in tabs keep their names', () => {
    render(<App />)
    for (const label of ['Optimize', 'Agent']) {
      const tab = tabs().getByRole('tab', { name: label })
      expect(tab.textContent, label).toBe('')
      expect(tab.querySelector('svg'), label).not.toBeNull()
      expect(tab).toHaveAttribute('aria-label', label)
      expect(tab.getAttribute('title')?.toLowerCase(), label).toContain(label.toLowerCase())
      expect(tab.className, label).toContain('w-6')
      expect(tab.className.split(' '), label).toContain('shrink-0')
    }
    for (const name of ['Layers', 'Blocks', 'Properties']) expect(tabs().getByRole('tab', { name }).textContent).toBe(name)
  })

  it('a plugin’s tab says which plugin it is, held back or not: a title that does not hold the name gets it in front', () => {
    usePluginModes.setState({ soon: COMING_SOON })
    render(<App />)
    for (const label of ['Optimize', 'Agent']) expect(tabs().getByRole('tab', { name: label }).getAttribute('title')?.toLowerCase()).toContain(label.toLowerCase())
  })

  it('the row does not scroll sideways on a wide screen (only on a phone), and the built-in tabs may shrink', () => {
    render(<App />)
    const row = panel().querySelector<HTMLElement>('[data-panel-tabs]')!
    expect(row.className.split(' ')).not.toContain('overflow-x-auto')
    expect(row.className).toContain('phone:overflow-x-auto')
    const layers = tabs().getByRole('tab', { name: 'Layers' })
    expect(layers.className).toContain('min-w-0')
    expect(layers.className.split(' ')).not.toContain('shrink-0')
  })

  it('a plugin held back shows its tab dimmed, disabled, with the notice as its title; a click opens nothing', () => {
    usePluginModes.setState({ soon: COMING_SOON })
    render(<App />)
    for (const [name, id] of [['Optimize', 'optimizer'], ['Agent', 'agent']] as const) {
      const tab = tabs().getByRole('tab', { name })
      expect(tab).toBeDisabled()
      expect(tab).toHaveAttribute('title', COMING_SOON[id])
      expect(tab).toHaveAttribute('aria-selected', 'false')
      fireEvent.click(tab)
    }
    expect(useUi.getState().rail).toBe('layers')
    expect(useUi.getState().summaryTab).toBe('overview')
  })

  it('one not held back opens its tabs from its tab (Stages on the left, Specimens on the right) and, pressed again, gives them back', async () => {
    render(<App />)
    const optimize = () => tabs().getByRole('tab', { name: 'Optimize' })
    expect(optimize()).toBeEnabled()
    fireEvent.click(optimize())
    expect(useUi.getState().rail).toBe('plugin:optimizer/stages')
    expect(useUi.getState().summaryTab).toBe('plugin:optimizer/specimens')
    expect(optimize()).toHaveAttribute('aria-selected', 'true')
    expect(tabs().getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByRole('tabpanel', { name: 'Stages' })).toBeInTheDocument()
    fireEvent.click(optimize())
    expect(useUi.getState().rail).toBe('layers')
    expect(useUi.getState().summaryTab).toBe('overview')
    expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
  })

  it('a plugin turned off in View takes its tab with it', () => {
    render(<App />)
    act(() => usePluginModes.getState().setMode('agent', 'off'))
    expect(tabNames()).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize'])
  })
})

describe('on a phone', () => {
  it('the tabs are the row at the top of the sheet, with no plugins’ tabs; the tree’s rows are 44 px tall there', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      render(<App />)
      act(() => useUi.getState().setSheet('left'))
      const sheet = panel()
      const row = sheet.querySelector<HTMLElement>('[data-panel-tabs]')!
      expect(tabNames()).toEqual(['Layers', 'Blocks', 'Properties'])
      // the row is above the sheet's header
      const header = within(sheet).getByRole('heading', { name: 'Layers and properties' })
      expect(row.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // touch-sized: 44 px a row and a tab (Tailwind's phone: variant)
      expect(within(row).getByRole('tab', { name: 'Layers' }).className).toContain('phone:h-11')
      expect(within(sheet).getAllByRole('treeitem')[0].className).toContain('phone:h-11')
      // Properties is reachable
      fireEvent.click(within(row).getByRole('tab', { name: 'Properties' }))
      expect(within(sheet).getByRole('tabpanel', { name: 'Properties' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a saved plugin’s tab, which no tab of the row draws there, opens Layers and not a body with no tab selected', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      act(() => useUi.setState({ rail: 'plugin:optimizer/stages' }))
      render(<App />)
      act(() => useUi.getState().setSheet('left'))
      expect(tabNames()).toEqual(['Layers', 'Blocks', 'Properties'])
      expect(tabs().getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
      expect(within(panel()).queryByRole('tabpanel', { name: 'Stages' })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('below 880 px, Properties in a menu opens the sheet on Properties, as on a wide screen', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 879'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      render(<App />)
      expect(useUi.getState().sheet).toBeNull()
      act(() => showProperties())
      expect(useUi.getState()).toMatchObject({ rail: 'properties', sheet: 'left' })
      expect(within(panel()).getByRole('tabpanel', { name: 'Properties' })).toBeInTheDocument()
      // and a selection alone does not
      act(() => useUi.setState({ rail: 'layers', sheet: null }))
      act(() => useApp.getState().select('m2'))
      expect(useUi.getState()).toMatchObject({ rail: 'layers', sheet: null })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
