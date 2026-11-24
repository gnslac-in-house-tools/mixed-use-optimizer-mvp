// The frame of Decisions "Layout" and "Side panels". Ported from Plaza-Practiko
// `vistas/paneles/__tests__/pantalla.test.tsx` (full screen, panel tabs, selection card) and
// `interfazIzquierda.test.tsx` (Export closes on Escape), plus what GFit adds: the settings tabs, the view switch
// in the viewport, and two side panels that hide and come back as they were. (Phase AS.3: the panel's tabs are Layers · Blocks · Properties.)
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { actions } from '../../../state/actions/index.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { showLayer } from '../../layers/show.ts'
import { pickMenu, openMenu, rowOf } from '../../__tests__/pickMenu.ts'
import { readSaved, STORAGE_KEY, useUi } from '../ui.ts'

// WebGL does not run in jsdom: here only where the 3D goes matters
vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
})

// even if a test fails halfway, the next one does not inherit a full screen API
afterEach(() => {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
})

describe('top bar', () => {
  it('the panel’s tabs: Layers · Blocks · Properties, an icon each, then Optimize and Agent; no rail, no Brief tiles; Interiors not shown; no ribbon', () => {
    useUi.setState({ rail: 'layers' })
    render(<App />)
    const bar = screen.getByRole('tablist', { name: 'Panel tabs' })
    const tabs = within(bar).getAllByRole('tab')
    // an icon and its name on the built-in tabs; a plugin's tab is its icon alone, its name the accessible name
    expect(tabs.map((t) => t.getAttribute('aria-label') ?? t.textContent)).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    expect(tabs.every((t) => t.querySelector('svg') !== null)).toBe(true)
    // at the top of the left panel; the ribbon that held Brief › Program › Rules went with Phase Q.8 (Decision "Program rule set
    // layout": the windows open from Design › Brief… and Rules…)
    const parameters = screen.getByRole('complementary', { name: 'Layers and properties' })
    expect(within(parameters).getByRole('tablist', { name: 'Panel tabs' })).toBe(bar)
    expect(screen.queryByRole('region', { name: 'Ribbon' })).toBeNull()
    expect(within(screen.getByRole('banner', { name: 'Top bar' })).queryByRole('tablist', { name: 'Panel tabs' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Brief, program and rules' })).toBeNull()
    expect(within(parameters).queryByRole('group', { name: 'Brief and rules' })).toBeNull()
    fireEvent.click(within(bar).getByRole('tab', { name: 'Properties' }))
    expect(tabs.every((t) => (t as HTMLButtonElement).disabled === false)).toBe(true)
    expect(within(bar).getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
    for (const gone of ['Brief', 'Site', 'Levels', 'Flow', 'Interiors']) expect(within(bar).queryByRole('tab', { name: gone })).toBeNull()
  })

  it('undo and redo follow the history', () => {
    render(<App />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeDisabled()
    act(() => useApp.getState().apply((p) => ({ ...p, name: 'Moved' })))
    expect(undo).toBeEnabled()
    fireEvent.click(undo)
    expect(useApp.getState().project.name).toBe('Demo site')
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
  })

  it('full screen: the same app, nothing removed; View › Full screen enters and leaves (it was the top bar’s button, Project C AS.1); Escape stays the app’s', async () => {
    const keyboard = { lock: vi.fn(async () => {}), unlock: vi.fn() }
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: keyboard })
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    const notify = () => document.dispatchEvent(new Event('fullscreenchange'))
    document.documentElement.requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })
      notify()
    })
    document.exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
      notify()
    })
    render(<App />)
    const controls = () =>
      [
        screen.queryByRole('tablist', { name: 'Panel tabs' }),
        screen.queryByRole('button', { name: 'Undo' }),
        screen.queryByRole('menuitem', { name: 'File' }),
        screen.queryByRole('toolbar', { name: 'Snap' }),
      ].map((el) => el !== null)
    expect(controls()).toEqual([true, true, true, true])
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    expect(rowOf(openMenu()!, 'Full screen')).toHaveAttribute('aria-checked', 'false')
    await act(async () => pickMenu('View', 'Full screen'))
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
    // the keyboard is locked on Escape: a press reaches the app (it cancels the tool), holding it leaves
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    expect(rowOf(openMenu()!, 'Full screen')).toHaveAttribute('aria-checked', 'true')
    expect(controls()).toEqual([true, true, true, true])
    await act(async () => pickMenu('View', 'Full screen'))
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(keyboard.unlock).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(navigator, 'keyboard')
  })

  it('without the full screen API (iPhone) the row is greyed and says so; File › Export opens its sub-menu', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    expect(rowOf(openMenu()!, 'Full screen')).toBeDisabled()
    expect(rowOf(openMenu()!, 'Full screen')).toHaveAttribute('title', 'Full screen is not available here')
    pickMenu('File', 'Export')
    expect(screen.getByRole('menu', { name: 'Export' })).toBeInTheDocument()
  })

  it('Escape closes the File menu and does not reach the plan (the mass stays selected)', () => {
    act(() => useApp.getState().select('m1'))
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull()
    expect(useApp.getState().selection.massId).toBe('m1')
  })
})

describe('side panels', () => {
  const panel = (name: string) => screen.getByRole('complementary', { name })
  /** The panel's tab of that name, picked. */
  const tab = (name: string) => fireEvent.click(within(panel('Layers and properties').querySelector<HTMLElement>('[data-panel-tabs]')!).getByRole('tab', { name }))
  const properties = () => tab('Properties')

  it('inputs on the left, outputs on the right: the left panel has its tabs, Layers first (its tree); the site’s settings are Properties’ once its row is picked; Summary lists the footprint by program', () => {
    render(<App />)
    const [left, right] = screen.getAllByRole('complementary')
    expect(left).toHaveAccessibleName('Layers and properties')
    expect(right).toHaveAccessibleName('Summary')
    expect(within(right).getByText('Footprint by program')).toBeInTheDocument()
    expect(within(left).getByRole('tree', { name: 'Layers' })).toBeInTheDocument()
    act(() => showLayer('site'))
    expect(useUi.getState().rail).toBe('properties')
    expect(within(left).getByText('Site rules')).toBeInTheDocument()
    expect(within(left).getByRole('tablist', { name: 'Panel tabs' })).toBeInTheDocument()
  })

  it('a hidden panel keeps its tab and comes back as it was; the choice is remembered in this browser', () => {
    render(<App />)
    properties()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Layers and properties' }))
    expect(panel('Layers and properties')).toHaveClass('hidden') // display: none, still mounted (jsdom loads no Tailwind)
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    fireEvent.click(rowOf(openMenu()!, 'Panels'))
    expect(rowOf(openMenu()!, 'Layers and properties panel')).toHaveAttribute('aria-checked', 'false')
    expect(readSaved()).toMatchObject({ panels: { left: false, right: true }, rail: 'properties' })
    pickMenu('View', 'Panels', 'Layers and properties panel')
    expect(panel('Layers and properties')).not.toHaveClass('hidden')
    // the panel's name stays; its tab is as it was
    expect(within(panel('Layers and properties')).getByRole('heading', { name: 'Layers and properties' })).toBeInTheDocument()
    expect(within(panel('Layers and properties')).getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
    pickMenu('View', 'Panels', 'Summary panel')
    expect(panel('Summary')).toHaveClass('hidden')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).panels).toEqual({ left: true, right: false })
  })

  it('a broken saved layout gives the defaults', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    expect(readSaved()).toMatchObject({ panels: { left: true, right: true }, rail: 'layers', summaryTab: 'overview' })
    // an old layout (the divider's share, a tab that no longer exists) keeps what still means something
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ panels: { right: false }, paramsTab: 'nope', summaryTab: 'nope', paramsSplit: 0.7 }))
    expect(readSaved()).toMatchObject({ panels: { left: true, right: false }, rail: 'layers', summaryTab: 'overview' })
    // the Parameters tab of before Phase Q is ignored: the default opens
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paramsTab: 'program' }))
    expect(readSaved()).toMatchObject({ rail: 'layers' })
    expect(readSaved()).not.toHaveProperty('paramsTab')
  })

  it('Summary has its own rail, down its outer edge: Overview, Against the brief, Issues (counted, red with an error); remembered', () => {
    render(<App />)
    const summary = panel('Summary')
    const rail = within(summary).getByRole('tablist', { name: 'Summary' })
    expect(within(rail).getAllByRole('tab').map((t) => t.getAttribute('title'))).toEqual(['Overview', 'Against the brief', expect.stringMatching(/^Issues/), 'Calificación']) // mixed-use-mvp: the Calificación tab
    expect(rail.nextElementSibling).toBeNull() // after the content: on the right edge
    expect(within(summary).getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(within(summary).getByText('By building')).toBeInTheDocument()
    expect(within(summary).queryByRole('region', { name: 'Against the brief' })).toBeNull() // on its own tab
    // a broken limit: an error, counted on the Issues icon in red; its tab lists it
    act(() => useApp.getState().apply((p) => actions.updateSiteRules(p, { maxCoverage: 0.1 })))
    const n = useApp.getState().derived.issues.length
    const issues = within(rail).getByRole('tab', { name: `Issues, ${n === 1 ? '1 issue' : `${n} issues`}` })
    expect(issues.querySelector('[data-badge]')).toHaveClass('bg-status-over')
    fireEvent.click(issues)
    expect(within(summary).getByRole('tabpanel', { name: 'Issues' })).toHaveTextContent(/coverage/i)
    expect(readSaved().summaryTab).toBe('issues')
    // the Brief (Design › Brief…) opens Against the brief; a panel tab changes no Summary tab (Decision "Steps change the tools")
    pickMenu('Design', 'Brief…')
    expect(useUi.getState().dialog).toBe('brief')
    expect(within(summary).getByRole('tabpanel', { name: 'Against the brief' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    tab('Layers')
    expect(within(summary).getByRole('tabpanel', { name: 'Against the brief' })).toBeInTheDocument()
  })

  it('Properties is a tab of the panel: the active building with nothing selected, × clears the selection; no divider', () => {
    render(<App />)
    const bar = screen.getByRole('tablist', { name: 'Panel tabs' })
    expect(bar).toHaveAttribute('aria-orientation', 'horizontal')
    expect(within(panel('Layers and properties')).getByRole('tree', { name: 'Layers' })).toBeInTheDocument()
    expect(within(panel('Layers and properties')).queryByRole('separator', { name: /divider/i })).toBeNull() // no divider any more
    properties()
    expect(useUi.getState().rail).toBe('properties')
    const props = within(panel('Layers and properties')).getByRole('region', { name: 'Properties' })
    // nothing selected: the active building (Decision "Workspace layout")
    expect(within(props).getByRole('region', { name: 'Active building' })).toHaveTextContent('Select a mass or a dimension to see it here instead.')
    act(() => useApp.getState().select('m1'))
    expect(within(props).getAllByText('Warehouse 1').length).toBeGreaterThan(0)
    expect(within(props).getByRole('textbox', { name: 'Name' })).toHaveValue('Warehouse 1')
    fireEvent.click(within(props).getByRole('button', { name: 'Clear selection' }))
    expect(useApp.getState().selection.massId).toBeNull()
    expect(within(props).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
  })

  it('below 880 px Properties is a tab of the panel too (Phase AS.3), and the selection is a card over the viewport as well', () => {
    // a tablet: neither wide nor a phone
    const mm = vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      useUi.setState({ rail: 'properties' })
      render(<App />)
      pickMenu('View', 'Panels', 'Layers and properties panel')
      expect(within(panel('Layers and properties')).getByRole('tablist', { name: 'Panel tabs' })).toBeInTheDocument()
      // the Properties tab shows on every width: the panel holds it
      expect(within(panel('Layers and properties')).getByRole('tabpanel', { name: 'Properties' })).toBeInTheDocument()
      expect(within(panel('Layers and properties')).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
      act(() => useApp.getState().select('m1'))
      const viewport = screen.getByRole('region', { name: 'Viewport' })
      expect(within(viewport).getByRole('region', { name: 'Properties' })).toBeInTheDocument()
      expect(within(panel('Layers and properties')).getByRole('textbox', { name: 'Name' })).toHaveValue('Warehouse 1')
      // the Summary's sheet has its rail too
      pickMenu('View', 'Panels', 'Summary panel')
      fireEvent.click(within(within(panel('Summary')).getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: 'Against the brief' }))
      expect(within(panel('Summary')).getByRole('table', { name: 'The option against the brief' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a selection does not move the tab: Properties shows it once picked; nothing selected, the active building', () => {
    render(<App />)
    act(() => useApp.getState().selectMany(['m1', 'm2']))
    expect(useUi.getState().rail).toBe('layers')
    properties()
    const props = within(panel('Layers and properties')).getByRole('region', { name: 'Properties' })
    expect(within(props).queryByRole('region', { name: 'Active building' })).toBeNull()
    act(() => useApp.getState().select(null))
    expect(within(props).getByRole('region', { name: 'Active building' })).toBeInTheDocument()
  })

  it('the Brief and the Rules are windows: Design › Brief… and Rules… open them; the panel has no tiles for them any more', () => {
    render(<App />)
    const tabPanel = panel('Layers and properties')
    expect(within(tabPanel).queryByRole('group', { name: 'Brief and rules' })).toBeNull()
    expect(within(tabPanel).queryByRole('list', { name: 'Programs' })).toBeNull()
    expect(within(tabPanel).queryByRole('list', { name: 'Options' })).toBeNull()
    pickMenu('Design', 'Brief…')
    expect(useUi.getState().dialog).toBe('brief')
    fireEvent.keyDown(window, { key: 'Escape' })
    pickMenu('Design', 'Rules…')
    expect(useUi.getState().dialog).toBe('rules')
  })
})

describe('viewport', () => {
  it('Plan · 3D · Split is at the drafting bar’s right end; 3D mounts the scene, Split both views with a divider; Alt+1 and Alt+2 switch', async () => {
    render(<App />)
    const views = screen.getByRole('tablist', { name: 'View' })
    expect(within(screen.getByRole('region', { name: 'Drafting' })).getByRole('tablist', { name: 'View' })).toBe(views)
    expect(within(screen.getByRole('banner', { name: 'Top bar' })).queryByRole('tablist', { name: 'View' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Viewport' })).queryByRole('tablist', { name: 'View' })).toBeNull()
    expect(within(views).getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('scene')).toBeNull()
    fireEvent.click(within(views).getByRole('tab', { name: '3D' }))
    expect(await screen.findByTestId('scene')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Site plan' })).toBeNull()
    fireEvent.click(within(views).getByRole('tab', { name: 'Split' }))
    expect(screen.getByRole('separator', { name: 'Divider between plan and 3D' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Site plan' })).toBeInTheDocument()
    expect(screen.getByTestId('scene')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '1', altKey: true, code: 'Digit1' })
    expect(useUi.getState().view).toBe('plan')
    fireEvent.keyDown(window, { key: '2', altKey: true, code: 'Digit2' })
    expect(useUi.getState().view).toBe('3d')
  })

  it('nothing floats on a wide plan but the levels and the warnings: no tools, no palette, no selection card', () => {
    render(<App />)
    act(() => useApp.getState().select('m1'))
    const viewport = screen.getByRole('region', { name: 'Viewport' })
    expect(within(viewport).queryByRole('group', { name: 'Tools' })).toBeNull()
    expect(within(viewport).queryByRole('region', { name: 'Properties' })).toBeNull()
    expect(within(viewport).queryByRole('toolbar', { name: 'Program palette' })).toBeNull()
    expect(within(viewport).queryByRole('toolbar', { name: 'Snap' })).toBeNull()
  })
})
