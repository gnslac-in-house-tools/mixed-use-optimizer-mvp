// The workspace layout of Decision "Workspace layout" (Phase L): the frame (the ribbon, Decision "Ribbon", took the tools
// bar's place; its steps, tools and Show went to the left column with Decisions "Areas rail" and "Compact panel", and
// with Phase Q.8 its view switch and Export went to the top bar and its plugins to the panel's row of tabs (Phase AS.3): areas.test.tsx; since
// Decision "Tools bar" Plan · 3D · Split is the tools bar's, Compare and Export the top bar's), the
// drafting bar docking above or below the viewport, the View menu (show and hide, Default layout) and the side panels'
// widths.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { openMenu, pickMenu, rowOf } from '../../__tests__/pickMenu.ts'
import { useCompare } from '../../compare/compareView.ts'
import { useCommand } from '../../plan/command/commandState.ts'
import { useTool } from '../../plan/tools/toolState.ts'
import { readSaved, STORAGE_KEY, useUi } from '../ui.ts'
import { letGo } from '../../tools/hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const bar = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    stripDock: 'left',
    show: { kpis: true, drafting: true, tools: true },
    widths: { left: null, right: null },
  })
  useCommand.setState({ registration: null, angle: null, cursor: null })
  useCompare.setState({ open: false, optionIds: [], mode: 'plan', plan: null, camera: null, framing: 0 })
  letGo()
})

describe('the frame without a ribbon (Phase Q.8, Decision "Areas rail")', () => {
  it('the top bar, then the KPI strip: the menus are the top bar’s (Compare and Export are menu commands), the view tabs the drafting bar’s, the plugins the rail’s; the settings tabs are the left column’s', () => {
    render(<App />)
    const banner = screen.getByRole('banner', { name: 'Top bar' })
    const frame = Array.from(banner.parentElement!.children).map((el) => (el.tagName === 'HEADER' ? 'top bar' : el.getAttribute('aria-label')))
    expect(frame.slice(0, 2)).toEqual(['top bar', 'Project figures'])
    expect(screen.queryByRole('region', { name: 'Ribbon' })).toBeNull()
    // the tabs are the left panel's row; the top bar has none of them
    expect(within(banner).queryByRole('tablist', { name: 'Panel tabs' })).toBeNull()
    expect(within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('tablist', { name: 'Panel tabs' })).toBeInTheDocument()
    // no captions in the top bar, no tools, no overlays
    expect(banner.querySelectorAll('[data-caption]')).toHaveLength(0)
    expect(within(banner).queryByRole('group', { name: 'Tools' })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Overlays' })).toBeNull()
    // the menus: no middle; the view tabs are the drafting bar's, Dimension and Ruler the strip's
    expect(banner.querySelector('[data-bar-middle]')).toBeNull()
    expect(within(banner).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['File', 'Edit', 'View', 'Site', 'Design', 'Tools', 'Help'])
    expect(within(bar('Drafting')).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Measure' })).toBeNull()
    expect(within(within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('group', { name: 'Annotations' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Dimension', 'Ruler', 'Reference line', 'Note'])
    // the plugins at the row's end
    const rail = screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!
    expect(within(rail).getAllByRole('tab').map((b) => b.getAttribute('aria-label') ?? b.textContent).slice(-2)).toEqual(['Optimize', 'Agent'])
    // Brief and Rules: each a window over the app, from the Design menu; the strip's tools left as they were
    const tools = () => screen.getByRole('toolbar', { name: 'Tools' })
    const names = () => within(tools()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    const before = names()
    pickMenu('Design', 'Rules…')
    expect(screen.getByRole('dialog', { name: 'Rules' })).toBeInTheDocument()
    expect(names()).toEqual(before)
    pickMenu('Design', 'Brief…')
    expect(screen.getByRole('dialog', { name: 'Brief' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Rules' })).toBeNull()
    expect(useUi.getState().summaryTab).toBe('brief')
  })

  it('while Compare is open the view switch rests: Compare has its own Plan · 3D', () => {
    render(<App />)
    act(() => useCompare.setState({ open: true, optionIds: useApp.getState().project.options.map((o) => o.id) }))
    const plan = within(bar('Drafting')).getByRole('tab', { name: 'Plan' })
    expect(plan).toBeDisabled()
    expect(plan).toHaveAttribute('title', 'Compare has its own Plan · 3D')
  })

  it('a phone has no tools nor Show: the top bar keeps the view switch, without Split; the tabs are a row at the top of the left sheet', () => {
    const mm = vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      render(<App />)
      const banner = screen.getByRole('banner', { name: 'Top bar' })
      expect(screen.queryByRole('group', { name: 'Tools' })).toBeNull()
      // the panel's foot has no Layers section (Show): the one Layers tab is the sheet's row's
      expect(screen.getAllByRole('tab', { name: 'Layers' }).map((b) => b.closest('[data-panel-tabs]') !== null)).toEqual([true])
      expect(within(banner).queryByRole('tablist', { name: 'Panel tabs' })).toBeNull()
      expect(within(within(banner).getByRole('tablist', { name: 'View' })).getAllByRole('tab').map((t) => t.title)).toEqual(['Plan (Alt+1)', '3D view (Alt+2)'])
      fireEvent.click(within(banner).getByRole('tab', { name: '3D' }))
      expect(useUi.getState().view).toBe('3d')
      // the left sheet (the ⋯ menu opens it on a phone): its row picks the tab
      act(() => useUi.getState().setSheet('left'))
      const tabs = within(screen.getByRole('complementary', { name: 'Layers and properties' })).getByRole('tablist', { name: 'Panel tabs' })
      fireEvent.click(within(tabs).getByRole('tab', { name: 'Properties' }))
      expect(useUi.getState().rail).toBe('properties')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('docking', () => {
  // the column's children, top to bottom, by their names
  const column = () =>
    Array.from(document.querySelector('[data-dock-area]')!.children).map((el) =>
      el.matches('section') ? el.getAttribute('aria-label') : el.querySelector('section')?.getAttribute('aria-label') ?? el.getAttribute('data-drop'),
    )

  it('a right-click on the bar docks it above or below the viewport', () => {
    render(<App />)
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    const menu = screen.getByRole('menu', { name: 'Drafting bar' })
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Dock below the viewport' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Dock above the viewport' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(column()).toEqual(['Drafting', 'Viewport'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).docks).toEqual({ drafting: 'top' })
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Dock below the viewport' }))
    expect(column()).toEqual(['Viewport', 'Drafting'])
  })

  it('a right-click in the command line keeps the browser’s menu', () => {
    render(<App />)
    const field = document.createElement('input')
    bar('Drafting').appendChild(field)
    fireEvent.contextMenu(field)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the grip drags the bar past the viewport’s middle; a line shows where it lands; ↑ ↓ on the grip too', () => {
    render(<App />)
    const area = document.querySelector('[data-dock-area]') as HTMLElement
    area.getBoundingClientRect = () => ({ top: 100, bottom: 900, height: 800, left: 0, right: 1000, width: 1000, x: 0, y: 100, toJSON: () => ({}) })
    const grip = screen.getByRole('button', { name: 'Move the drafting bar' })
    fireEvent.pointerDown(grip, { button: 0, clientY: 880, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientY: 878, pointerId: 1 })
    expect(document.querySelector('[data-drop]')).toBeNull()
    fireEvent.pointerMove(grip, { clientY: 300, pointerId: 1 })
    expect(column()[0]).toBe('top')
    expect(bar('Drafting').className).toContain('opacity-60')
    fireEvent.pointerUp(grip, { clientY: 300, pointerId: 1 })
    expect(useUi.getState().docks.drafting).toBe('top')
    expect(document.querySelector('[data-drop]')).toBeNull()
    expect(column()).toEqual(['Drafting', 'Viewport'])
    fireEvent.keyDown(grip, { key: 'ArrowDown' })
    expect(column()).toEqual(['Viewport', 'Drafting'])
  })

  it('moving a bar keeps its element: the viewport and the command line are not made again', () => {
    render(<App />)
    const viewport = screen.getByRole('region', { name: 'Viewport' })
    const drafting = bar('Drafting')
    act(() => useUi.getState().setDock('drafting', 'top'))
    expect(screen.getByRole('region', { name: 'Viewport' })).toBe(viewport)
    expect(bar('Drafting')).toBe(drafting)
  })

  it('a saved dock that is not above or below gives the default; a tools bar’s dock saved before the strip is ignored; the strip’s show.tools is kept when the layout has a stripDock, and shown when it has none (saved before the strip) or when absent', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docks: { tools: 'left', drafting: 'left' }, show: { tools: false } }))
    expect(readSaved().docks).toEqual({ drafting: 'bottom' })
    // saved before the strip: `show.tools` hid a small bar, it does not hide the strip
    expect(readSaved().show).toEqual({ kpis: true, drafting: true, tools: true })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stripDock: 'top', show: { tools: false } }))
    expect(readSaved().show).toEqual({ kpis: true, drafting: true, tools: false })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docks: { drafting: 'top', tools: 'bottom' }, show: { kpis: true, drafting: true } }))
    expect(readSaved().docks).toEqual({ drafting: 'top' })
    expect(readSaved().show).toEqual({ kpis: true, drafting: true, tools: true })
  })
})

describe('View menu', () => {
  const openView = () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    return screen.getByRole('menu', { name: 'View' })
  }
  /** A row of the menu that is open on top (a sub-menu's when one is open), by its label. */
  const item = (name: string) => rowOf(openMenu()!, name)
  const check = (name: string | RegExp) => within(openMenu()!).getByRole('menuitemcheckbox', { name })

  it('in the top menu: the views, Frame, the panels, bars, overlays, colours, detail, snap, where the bars dock, the plugins, the theme, Default layout', () => {
    render(<App />)
    const menu = openView()
    const names = Array.from(menu.querySelectorAll('[data-menu-key]')).map((b) => b.querySelector('span')!.textContent)
    expect(names).toEqual([
      'Plan',
      '3D',
      'Split',
      'Frame',
      'Panels',
      'Bars',
      'Overlays',
      'Colour by',
      'Detail',
      'Snap',
      'Snap kinds',
      'Snap to',
      'Align',
      'Ortho',
      'Grid',
      'Optimizer tabs',
      'Turn the optimizer off',
      'Agent tabs',
      'Turn the agent off',
      'Theme',
      'Full screen',
      'Default layout',
    ])
    // a view's key is its detail
    expect(check(/^Plan/)).toHaveAttribute('aria-checked', 'true')
    expect(item('Plan').textContent).toContain('Alt+1')
    fireEvent.click(item('Bars'))
    expect(Array.from(openMenu()!.querySelectorAll('[data-menu-key]')).map((b) => b.querySelector('span')!.textContent)).toEqual([
      'Drafting bar',
      'KPI strip',
      'KPI strip: Full',
      'KPI strip: Medium',
      'KPI strip: Compact',
      'Dock the drafting bar above',
      'Tools strip',
    ])
    expect(check('KPI strip')).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
    fireEvent.click(check(/^3D/))
    expect(useUi.getState().view).toBe('3d')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('hides and shows the panels, the KPI strip and the bars; the choice is remembered', () => {
    render(<App />)
    pickMenu('View', 'Bars', 'KPI strip')
    expect(screen.queryByRole('region', { name: 'Project figures' })).toBeNull()
    pickMenu('View', 'Bars', 'Drafting bar')
    expect(screen.queryByRole('region', { name: 'Drafting' })).toBeNull()
    pickMenu('View', 'Panels', 'Summary panel')
    expect(useUi.getState().panels.right).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).show).toEqual({ kpis: false, drafting: false, tools: true })
    openView()
    fireEvent.click(item('Bars'))
    expect(check('Drafting bar')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(check('Drafting bar'))
    expect(bar('Drafting')).toBeInTheDocument()
    // the top bar holds the menus and the history: it does not hide
    expect(within(screen.getByRole('banner', { name: 'Top bar' })).getByRole('menubar')).toBeInTheDocument()
  })

  it('a bar hides from its own menu too; a hidden drafting bar comes back while a drawing tool asks for typed values', () => {
    render(<App />)
    fireEvent.contextMenu(bar('Drafting'), { clientX: 200, clientY: 500 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide the drafting bar' }))
    expect(screen.queryByRole('region', { name: 'Drafting' })).toBeNull()
    fireEvent.keyDown(window, { key: 'b' })
    expect(useTool.getState().tool).toBe('mass')
    expect(bar('Drafting')).toBeInTheDocument()
    act(() => letGo())
    expect(screen.queryByRole('region', { name: 'Drafting' })).toBeNull()
    // a selection's typed move does not bring it back, or it would show at every pick
    act(() => useApp.getState().select('m1'))
    expect(useCommand.getState().registration).not.toBeNull()
    expect(screen.queryByRole('region', { name: 'Drafting' })).toBeNull()
  })

  it('moves the bars; Default layout puts every panel, bar, dock and width back, and keeps the tab', () => {
    render(<App />)
    pickMenu('View', 'Bars', 'Dock the drafting bar above')
    expect(useUi.getState().docks.drafting).toBe('top')
    act(() => {
      const ui = useUi.getState()
      ui.setKpiSize('compact')
      ui.setShow('kpis', false)
      ui.setShow('drafting', false)
      ui.setPanel('left', false)
      ui.setWidth('right', 500)
      ui.setRail('properties')
    })
    pickMenu('View', 'Default layout')
    const ui = useUi.getState()
    expect(ui.panels).toEqual({ left: true, right: true })
    expect(ui.show).toEqual({ kpis: true, drafting: true, tools: true })
    expect(ui.docks).toEqual({ drafting: 'bottom' })
    expect(ui.kpiSize).toBe('compact')
    expect(ui.widths).toEqual({ left: null, right: null })
    expect(ui.rail).toBe('properties')
    expect(readSaved().widths).toEqual({ left: null, right: null })
  })

  it('a press on View while it is open closes it', () => {
    render(<App />)
    openView()
    const button = screen.getByRole('menuitem', { name: 'View' })
    fireEvent.pointerDown(button)
    fireEvent.click(button)
    expect(screen.queryByRole('menu', { name: 'View' })).toBeNull()
  })
})

describe('panel widths', () => {
  const grid = () => screen.getByRole('main').style.gridTemplateColumns

  it('each panel’s inner edge drags its width, within its limits; a double-click gives the default back', () => {
    render(<App />)
    const edge = screen.getByRole('separator', { name: 'Summary width' })
    const summary = screen.getByRole('complementary', { name: 'Summary' })
    summary.getBoundingClientRect = () => ({ width: 320, height: 600, top: 0, left: 900, right: 1220, bottom: 600, x: 900, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(edge, { button: 0, clientX: 900, pointerId: 1 })
    fireEvent.pointerMove(edge, { clientX: 820, pointerId: 1 })
    fireEvent.pointerUp(edge, { pointerId: 1 })
    expect(useUi.getState().widths.right).toBe(400)
    expect(grid()).toMatch(/ 400px$/)
    expect(edge).toHaveAttribute('aria-valuenow', '400')
    fireEvent.pointerDown(edge, { button: 0, clientX: 900, pointerId: 1 })
    fireEvent.pointerMove(edge, { clientX: 2000, pointerId: 1 })
    expect(useUi.getState().widths.right).toBe(240)
    fireEvent.doubleClick(edge)
    expect(useUi.getState().widths.right).toBeNull()
    expect(grid()).toMatch(/calc\(var\(--side-panel-w\) \+ var\(--side-rail-w\)\)$/)
  })

  it('the arrow keys move the left edge; the width is the whole column', () => {
    render(<App />)
    const params = screen.getByRole('complementary', { name: 'Layers and properties' })
    params.getBoundingClientRect = () => ({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Layers and properties width' }), { key: 'ArrowRight' })
    expect(useUi.getState().widths.left).toBe(376)
    // the Tools strip's column (`auto`) comes first
    expect(grid()).toMatch(/^auto 376px /)
  })

  it('a saved width out of its limits is brought within them (40 rem, 40 % of the window); garbage gives the default', () => {
    const was = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widths: { left: 9000, right: 'wide' }, show: { kpis: false } }))
    const saved = readSaved()
    expect(saved.widths).toEqual({ left: 480, right: null })
    expect(saved.show).toEqual({ kpis: false, drafting: true, tools: true })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2400 })
    expect(readSaved().widths.left).toBe(640)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: was })
  })
})
