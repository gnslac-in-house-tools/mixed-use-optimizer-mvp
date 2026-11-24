// The left panel and the frame around it (Phases Q.7 to Q.9, Decisions "Areas rail", "Compact panel", "Only what works is shown"; Phase AS.3,
// Decision "Panel tabs": the rail of areas and the Site, Levels, Flow and Brief tabs went, the panel is Layers · Blocks · Properties, with
// the plugins' tabs at the row's end; the tabs themselves are in panelTabs.test.tsx). Since Phase Q.8 the ribbon is gone: Compare and
// Export are menu commands (the top bar has no middle), the plugins' actions are tabs at the end of the panel's row, and on a phone the
// row is at the sheet's top. Since Decision "Bottom bar" Plan · 3D · Split and the Detail are the drafting bar's; the overlays that were
// its Overlays menu are eyes of Layers and View > Overlays.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { useCompare } from '../../compare/compareView.ts'
import { useGraph } from '../../graph/graphState.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useTool } from '../../plan/tools/toolState.ts'
import { pickMenu } from '../../__tests__/pickMenu.ts'
import { readSaved, STORAGE_KEY, useUi } from '../ui.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const panel = () => screen.getByRole('complementary', { name: 'Layers and properties' })
/** The panel's row of tabs: Layers, Blocks, Properties, then the plugins'. */
const row = () => panel().querySelector<HTMLElement>('[data-panel-tabs]')!

function start(p: Project = demoProject(), ui: Partial<ReturnType<typeof useUi.getState>> = {}) {
  useApp.getState().open(p)
  useUi.setState({ rail: 'layers', dialog: null, view: 'plan', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null, help: false, ...ui })
  return render(<App />)
}

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ open: false, optionIds: [], mode: 'plan', plan: null, camera: null, framing: 0 })
  useGraph.setState({ graph: false, rule: null, relation: null })
  letGo()
  useAccess.setState({ picked: null })
  letGo()
})

describe('the frame', () => {
  it('there is no ribbon (Phase Q.8): the top bar keeps no tabs, no tools, no overlays and no view tabs; Plan · 3D · Split is the drafting bar’s', () => {
    start()
    expect(screen.queryByRole('region', { name: 'Ribbon' })).toBeNull()
    const banner = screen.getByRole('banner', { name: 'Top bar' })
    expect(within(banner).queryByRole('tablist', { name: 'Panel tabs' })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Select' })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Overlays' })).toBeNull()
    expect(within(banner).queryByRole('tablist', { name: 'View' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Drafting' })).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull()
  })
})

describe('the top bar’s middle (Phase Q.8; since Project C AS.1 Compare and Export are menu commands)', () => {
  it('holds no Compare nor Export button: File › Export lists the files, Design › Options › Compare… is the switch (the view tabs are the drafting bar’s)', () => {
    start()
    const banner = screen.getByRole('banner', { name: 'Top bar' })
    expect(within(banner).queryByRole('tablist', { name: 'View' })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Compare' })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Export' })).toBeNull()
    expect(banner.querySelector('[data-bar-middle]')).toBeNull()
    pickMenu('File', 'Export')
    expect(within(screen.getByRole('menu', { name: 'Export' })).getByRole('menuitem', { name: /^3D model…/ })).toBeInTheDocument()
    pickMenu('Design', 'Options')
    expect(within(screen.getByRole('menu', { name: 'Options' })).getByRole('menuitemcheckbox', { name: /^Compare…/ })).toBeInTheDocument()
    // after the menus and the history, the project (the left part is GFit and the menus; the right, the project)
    const menus = within(banner).getByRole('menubar')
    expect(menus.previousElementSibling).toBe(within(banner).getByRole('button', { name: 'GFit' }))
    expect(within(banner).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('short of room the menus keep one line and the project’s name gives way: it truncates', () => {
    start()
    const banner = screen.getByRole('banner', { name: 'Top bar' })
    const menus = within(banner).getByRole('menubar')
    expect(menus).toHaveClass('shrink-0', 'whitespace-nowrap')
    const name = within(banner).getByRole('button', { name: 'Demo site' })
    expect(name).toHaveClass('min-w-0', 'truncate')
    // every box between the name and the bar can shrink; the menus' and the history's cannot
    expect(name.closest('h1')!.parentElement).toHaveClass('min-w-0')
    expect(name.closest('h1')!.parentElement!.parentElement).toHaveClass('min-w-0')
    expect(within(banner).getByRole('button', { name: 'Undo' }).parentElement).toHaveClass('shrink-0')
  })
})

describe('the plugins’ tabs at the row’s end (Phase Q.8; tabs since Phase AS.3)', () => {
  it('after the core’s tabs: Optimize, Agent; no documentation’s (the Revit bridge went), and no rail', () => {
    start()
    expect(Array.from(row().querySelectorAll('button')).map((el) => el.getAttribute('aria-label') ?? el.textContent)).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    expect(within(row()).queryByRole('tab', { name: 'Sheets' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Documentation' })).toBeNull()
    expect(document.querySelector('[data-area-rail]')).toBeNull()
  })

  it('Optimize opens the Stages tab in the left panel and Specimens on the right', async () => {
    start()
    const optimize = within(row()).getByRole('tab', { name: 'Optimize' })
    expect(optimize).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(optimize)
    expect(useUi.getState()).toMatchObject({ rail: 'plugin:optimizer/stages', summaryTab: 'plugin:optimizer/specimens' })
    expect(await within(panel()).findByRole('tabpanel', { name: 'Stages' }, { timeout: 5000 })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Summary' })).getByRole('tabpanel', { name: 'Specimens' })).toBeInTheDocument()
    expect(optimize).toHaveAttribute('aria-selected', 'true')
  })

  it('Agent opens its chat in the left panel, selected in the row; again, back to the tab that was shown', () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    start(demoProject(), { rail: 'properties' })
    const agent = within(row()).getByRole('tab', { name: 'Agent' })
    fireEvent.click(agent)
    expect(useUi.getState().rail).toBe('plugin:agent/chat')
    expect(agent).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).getByRole('tabpanel', { name: 'Agent' })).toBeInTheDocument()
    expect(within(row()).getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(agent)
    expect(useUi.getState().rail).toBe('properties')
    expect(agent).toHaveAttribute('aria-selected', 'false')
  })
})

describe('a phone (Phase Q.8)', () => {
  it('the tabs are a row at the top of the sheet, no plugins; the top bar keeps the view switch, Export is in the ☰ sheet', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      start(demoProject(), { sheet: 'left' })
      const banner = screen.getByRole('banner', { name: 'Top bar' })
      expect(within(banner).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
      expect(within(banner).queryByRole('button', { name: 'Export' })).toBeNull()
      // a row over the sheet's heading
      expect(row().compareDocumentPosition(within(panel()).getAllByRole('heading', { level: 2 })[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(within(row()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Layers', 'Blocks', 'Properties'])
      // the tabs only: no plugins' actions, as the ribbon had none on a phone (spec "Phone")
      for (const name of ['Optimize', 'Agent', 'Sheets', 'Revit']) expect(within(row()).queryByRole('tab', { name })).toBeNull()
      fireEvent.click(within(row()).getByRole('tab', { name: 'Properties' }))
      expect(useUi.getState().rail).toBe('properties')
      // Export's files in the ☰ sheet (File › Export)
      fireEvent.click(within(banner).getByRole('button', { name: 'Menu' }))
      const sheet = screen.getByRole('dialog', { name: 'Menu' })
      const unfold = (label: string) => fireEvent.click(sheet.querySelector<HTMLElement>(`[data-sheet-label="${label}"]`)!)
      unfold('File')
      unfold('Export')
      expect(within(sheet).getByRole('button', { name: '3D model…' })).toBeInTheDocument()
      // the CAD plan downloads with the current 3D choice; the box is a tick row of its own
      expect(within(sheet).getByRole('button', { name: 'CAD plan (.dxf)' })).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: '3D box in the CAD plan' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByRole('checkbox', { name: '3D' })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('a sheet width (768–879 px)', () => {
  it('picking a tab in the sheet does not close it', () => {
    // a tablet: neither wide nor a phone, so the left column is a sheet over the plan
    const mm = vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      start(demoProject(), { rail: 'layers' })
      expect(useUi.getState().sheet).toBeNull()
      pickMenu('View', 'Panels', 'Layers and properties panel')
      expect(useUi.getState().sheet).toBe('left')
      fireEvent.click(within(row()).getByRole('tab', { name: 'Properties' }))
      expect(useUi.getState()).toMatchObject({ rail: 'properties', sheet: 'left' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('on a wide screen a tool of the strip does not touch the panel', () => {
    start(demoProject(), { rail: 'layers' })
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: 'Hole' }))
    expect(useTool.getState().tool).toBe('hole')
    expect(useUi.getState().panels.left).toBe(true)
    expect(panel()).toBeVisible()
  })
})

describe('the panel has no tools (they are the Tools strip’s)', () => {
  it('no tool buttons and no program or street type in any tab; the strip stands beside it, the 3D view and Compare resting its tools', () => {
    for (const area of ['layers', 'properties', 'blocks'] as const) {
      const view = start(demoProject(), { rail: area })
      expect(within(panel()).queryByRole('group', { name: 'Tools' })).toBeNull()
      for (const name of ['Import', 'Draw', 'Place', 'Existing road', 'Mass', 'Hole', 'Corner', 'Street', 'Gate', 'Connect', 'Lot']) {
        expect(within(panel()).queryByRole('button', { name }), `${area}: ${name}`).toBeNull()
      }
      expect(within(panel()).queryByRole('combobox', { name: 'New block’s program' })).toBeNull()
      view.unmount()
    }
    start()
    const strip = screen.getByRole('toolbar', { name: 'Tools' })
    act(() => useUi.getState().setView('3d'))
    expect(within(strip).getByRole('button', { name: 'Draw' })).toBeDisabled()
    act(() => useUi.getState().setView('plan'))
    act(() => useCompare.setState({ open: true, optionIds: useApp.getState().project.options.map((o) => o.id) }))
    expect(within(strip).getByRole('button', { name: 'Street' })).toBeDisabled()
  })
})

describe('the panel’s tabs and what is selected', () => {
  it('a selection opens nothing: the tab stays; Properties, once picked, shows it and follows the selection', () => {
    start()
    expect(within(panel()).getByRole('tabpanel', { name: 'Layers' })).toBeInTheDocument()
    act(() => useApp.getState().select('m1'))
    expect(useUi.getState()).toMatchObject({ rail: 'layers' })
    expect(within(row()).getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).queryByRole('region', { name: 'Properties' })).toBeNull()
    fireEvent.click(within(row()).getByRole('tab', { name: 'Properties' }))
    expect(within(within(panel()).getByRole('region', { name: 'Properties' })).getByRole('textbox', { name: 'Name' })).toHaveValue('Warehouse 1')
    // another selection: Properties follows it; Layers is its tree again
    act(() => useApp.getState().select('m2'))
    expect(within(within(panel()).getByRole('region', { name: 'Properties' })).getByRole('textbox', { name: 'Name' })).toHaveValue('Warehouse 2')
    fireEvent.click(within(row()).getByRole('tab', { name: 'Layers' }))
    expect(within(panel()).getByRole('tree', { name: 'Layers' })).toBeInTheDocument()
  })
})

describe('the drafting bar (Decision "Bottom bar")', () => {
  it('the snap, the Detail, then the view tabs; no Overlays menu (an eye of Layers now), no Layers section at the panel’s foot', () => {
    start()
    // no Layers section at the panel's foot (Show): the one tab of that name is the panel's, Layers' tree
    expect(within(panel()).getAllByRole('tab', { name: 'Layers' }).map((b) => b.closest('[data-panel-tabs]') !== null)).toEqual([true])
    const bar = screen.getByRole('region', { name: 'Drafting' })
    // left to right: the snap, the Detail, the view tabs
    const order = [within(bar).getByRole('toolbar', { name: 'Snap' }), within(bar).getByRole('combobox', { name: 'Detail' }), within(bar).getByRole('tablist', { name: 'View' })]
    order.slice(1).forEach((el, i) => expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy())
    expect(within(bar).queryByRole('button', { name: 'Overlays' })).toBeNull()
    expect(within(bar).queryByRole('button', { name: 'Display' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Overlays' })).toBeNull()
    // the grid's menu (parameters, pivot, look) is the bar's, beside its Grid chip
    expect(within(bar).queryByRole('button', { name: 'Grid look' })).toBeNull()
    expect(within(bar).getAllByRole('button', { name: 'Grid' }).filter((b) => b.getAttribute('aria-haspopup') === 'dialog')).toHaveLength(1)
  })
})

describe('a saved layout', () => {
  it('from before Phase Q (a Parameters tab, Interiors, Sheets) opens on Layers, with no throw', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paramsTab: 'circulation', view: 'sheets' }))
    const was = readSaved()
    expect(was).toMatchObject({ rail: 'layers' })
    expect(was).not.toHaveProperty('paramsTab')
    start(demoProject(), was)
    expect(within(row()).getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
  })

  it('remembers the tab; one that is not shown now falls back to Layers', () => {
    start(demoProject(), { rail: 'layers' })
    fireEvent.click(within(row()).getByRole('tab', { name: 'Properties' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ rail: 'properties' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'nope' }))
    expect(readSaved()).toMatchObject({ rail: 'layers' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rail: 'properties' }))
    expect(readSaved()).toMatchObject({ rail: 'properties' })
  })
})

describe('only what works is shown (Phase Q.9, Decision "Only what works is shown")', () => {
  const COMING = ['Interiors', 'Sheets', 'Clearance', 'Routes', 'Vehicle fit', 'Visibility', 'Versions…', 'New from a parcel…', 'Sign in', 'PDF plans', 'Slides (.pptx)', 'Live viewer link', 'IFC model', 'Dataset (JSON)']
  /** Nothing in the page names one of them, as a button, a tab or a menu row, or in a tooltip saying it arrives. */
  const absent = () => {
    for (const name of COMING) {
      expect(screen.queryByRole('button', { name }), name).toBeNull()
      expect(screen.queryByRole('tab', { name }), name).toBeNull()
      expect(screen.queryByRole('menuitem', { name: new RegExp('^' + name.replace(/[().]/g, (c) => `[${c}]`)) }), name).toBeNull()
      expect(screen.queryByText(name), name).toBeNull()
    }
    expect(document.querySelector('[title*="arrives with Phase"]')).toBeNull()
    expect(screen.queryByText(/arrives with Phase/i)).toBeNull()
  }

  it('the tabs, the top bar and the panel name none of them, in any tab', () => {
    start()
    for (const tab of ['Layers', 'Blocks', 'Properties']) {
      fireEvent.click(within(row()).getByRole('tab', { name: tab }))
      absent()
    }
    // the strip keeps its real tools, with no Analyses group
    expect(within(screen.getByRole('toolbar', { name: 'Tools' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Street', 'Gate']))
    expect(within(panel()).queryByText('Analyses')).toBeNull()
    // no documentation's group: no plugin offers one
    expect(screen.queryByRole('group', { name: 'Documentation' })).toBeNull()
  })

  it('GFit goes Home (Decision "Home")', () => {
    start()
    const bar = screen.getByRole('banner', { name: 'Top bar' })
    expect(within(bar).getByRole('button', { name: 'GFit' })).toHaveAttribute('title', 'Home: your projects, the sample and its tour')
  })

  it('the File menu, the View menu and File › Export offer only what works', () => {
    start()
    const bar = screen.getByRole('banner', { name: 'Top bar' })
    fireEvent.click(within(bar).getByRole('menuitem', { name: 'File' }))
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    absent()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(bar).getByRole('menuitem', { name: 'View' }))
    expect(within(screen.getByRole('menu')).getAllByRole('menuitemcheckbox', { name: /^(Plan|3D|Split)/ }).length).toBe(3)
    absent()
    fireEvent.keyDown(window, { key: 'Escape' })
    pickMenu('File', 'Export')
    expect(Array.from(screen.getByRole('menu', { name: 'Export' }).querySelectorAll('[data-menu-key]')).map((m) => m.textContent)).toEqual([
      expect.stringMatching(/^Project \(\.gft\)/),
      expect.stringMatching(/^3D model…/),
      expect.stringMatching(/^CAD plan \(\.dxf\)/),
      expect.stringMatching(/^3D box in the CAD plan/),
      expect.stringMatching(/^Image of the 3D view/),
      expect.stringMatching(/^Decision log \(\.csv\)/),
    ])
    absent()
  })

  it('the Summary has Overview, Against the brief and Issues: no Decision log tab', () => {
    start()
    const summary = screen.getByRole('tablist', { name: 'Summary' })
    expect(within(summary).getAllByRole('tab').map((t) => t.getAttribute('title'))).toEqual(['Overview', 'Against the brief', expect.stringMatching(/^Issues/), 'Calificación', 'Departamentos']) // mixed-use-mvp: the Calificación and Departamentos tabs
    expect(screen.queryByRole('tab', { name: 'Decision log' })).toBeNull()
    expect(screen.queryByRole('tabpanel', { name: 'Decision log' })).toBeNull()
  })

  it('a saved summaryTab of log opens Overview', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ summaryTab: 'log' }))
    const was = readSaved()
    expect(was.summaryTab).toBe('overview')
    start(demoProject(), was)
    expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument()
  })

  it('a view that is not built does nothing', () => {
    start()
    act(() => useUi.getState().setView('sheets' as never))
    expect(useUi.getState()).toMatchObject({ view: 'plan' })
  })
})
