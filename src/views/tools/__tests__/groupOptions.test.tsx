// The Tools strip's group options and the old places of the tools (Project C, AS.2, task 3): a small ▾ on Massing (what Draw makes) and on
// Streets (the next street's type and side), and on no other group; one panel open at a time, closed by a press outside, by Escape
// and when the strip lies down; a program or a street's type or side picked there is the next one's and takes Draw or Street. The tools bar over the viewport and the
// area panels' tool rows are gone; the drafting bar has Plan · 3D · Split and no Dimension or Ruler; a layout saved with the tools
// bar's dock opens.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { streetTypesOf } from '../../../engine/circulation/streets.ts'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { registerAll } from '../../commands/index.ts'
import { commands } from '../../commands/registry.ts'
import { useCompare } from '../../compare/compareView.ts'
import { readSaved, STORAGE_KEY, useUi } from '../../layout/ui.ts'
import { useStreetSide, useStreetType } from '../../plan/circulation/roadState.ts'
import { useMassProgram } from '../../plan/tools/toolState.ts'
import { GROUP_OPTIONS } from '../GroupOptions.tsx'
import { letGo, take, useHand } from '../hand.ts'
import { ToolStrip } from '../ToolStrip.tsx'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const strip = () => screen.getByRole('toolbar', { name: 'Tools' })
const button = (name: string) => within(strip()).getByRole('button', { name })
const dialog = (name: string) => screen.getByRole('dialog', { name })
const noDialog = (name: string) => expect(screen.queryByRole('dialog', { name })).toBeNull()

beforeEach(() => {
  localStorage.clear()
  registerAll()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    show: { kpis: true, drafting: true, tools: true },
  })
  useCompare.getState().close()
  useMassProgram.setState({ programId: undefined })
  useStreetType.setState({ type: null })
  useStreetSide.setState({ side: 'centre' })
  letGo()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the groups’ ▾', () => {
  it('General, Massing and Streets have one, small and quiet, and no other group', () => {
    render(<App />)
    expect(Object.keys(GROUP_OPTIONS).sort()).toEqual(['general', 'massing', 'streets'])
    const arrows = within(strip()).getAllByRole('button').filter((b) => b.hasAttribute('aria-haspopup'))
    expect(arrows.map((b) => b.getAttribute('aria-label'))).toEqual(['General options', 'Massing options', 'Streets options'])
    for (const a of arrows) {
      expect(a).toHaveAttribute('aria-haspopup', 'dialog')
      expect(a).toHaveAttribute('aria-expanded', 'false')
      expect(a.getAttribute('title')).toBeTruthy()
    }
    // each ▾ ends its own group, outside the group's tools
    for (const [group, arrow] of [['General', 'General options'], ['Massing', 'Massing options'], ['Streets', 'Streets options']]) {
      const g = within(strip()).getByRole('group', { name: group })
      expect(within(g).queryByRole('button', { name: arrow })).toBeNull()
      expect(g.nextElementSibling!.contains(button(arrow))).toBe(true)
    }
  })

  it('a ▾ opens its panel on the body, named for what it holds, with a heading; the strip does not hold it', () => {
    render(<App />)
    fireEvent.click(button('Massing options'))
    expect(button('Massing options')).toHaveAttribute('aria-expanded', 'true')
    const d = dialog('Draw makes')
    expect(d.parentElement).toBe(document.body)
    expect(strip().contains(d)).toBe(false)
    expect(d.className).toContain('panel')
    expect(within(d).getByRole('heading', { name: 'Draw makes' })).toBeInTheDocument()
    expect(within(d).getByRole('combobox', { name: 'New block’s program' })).toBeInTheDocument()
    fireEvent.click(button('Massing options'))
    noDialog('Draw makes')
    expect(button('Massing options')).toHaveAttribute('aria-expanded', 'false')
  })

  it('one panel at a time: a second ▾ closes the first', () => {
    render(<App />)
    fireEvent.click(button('Massing options'))
    fireEvent.click(button('Streets options'))
    noDialog('Draw makes')
    expect(dialog('New street')).toBeInTheDocument()
    expect(button('Massing options')).toHaveAttribute('aria-expanded', 'false')
    expect(button('Streets options')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('Escape closes it and the focus goes back to its ▾; a press outside closes it too; a press inside does not', () => {
    render(<App />)
    fireEvent.click(button('Streets options'))
    // inside: the chips, the type
    fireEvent.pointerDown(within(dialog('New street')).getByRole('combobox', { name: 'Street type' }))
    fireEvent.pointerDown(dialog('New street'))
    expect(dialog('New street')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    noDialog('New street')
    expect(button('Streets options')).toHaveFocus()
    // Escape did nothing else: no tool let go, nothing picked
    expect(useHand.getState().tool).toBe('select')

    fireEvent.click(button('Massing options'))
    fireEvent.pointerDown(document.body)
    noDialog('Draw makes')
    fireEvent.click(button('Massing options'))
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Viewport' }))
    noDialog('Draw makes')
  })

  it('a program picked there is the one Draw makes, and Draw is in hand', () => {
    render(<App />)
    const programs = useApp.getState().project.programs
    expect(programs.length).toBeGreaterThan(1)
    const other = programs[1]
    fireEvent.click(button('Massing options'))
    const select = within(dialog('Draw makes')).getByRole('combobox', { name: 'New block’s program' }) as HTMLSelectElement
    expect(useHand.getState().tool).toBe('select')
    fireEvent.change(select, { target: { value: other.id } })
    expect(useMassProgram.getState().programId).toBe(other.id)
    expect(useHand.getState().tool).toBe('mass')
    expect(button('Draw')).toHaveAttribute('aria-pressed', 'true')
    // choosing in the select did not close the panel
    expect(dialog('Draw makes')).toBeInTheDocument()
    expect((within(dialog('Draw makes')).getByRole('combobox', { name: 'New block’s program' }) as HTMLSelectElement).value).toBe(other.id)
  })

  it('the street’s type picked there is the next street’s, and Street is in hand, as the Massing ▾ takes Draw', () => {
    render(<App />)
    const types = streetTypesOf(useApp.getState().project, null)
    expect(types.length).toBeGreaterThan(1)
    fireEvent.click(button('Streets options'))
    const d = within(dialog('New street'))
    expect(useHand.getState().tool).toBe('select')
    const select = d.getByRole('combobox', { name: 'Street type' }) as HTMLSelectElement
    expect(select.value).toBe(types[0].id)
    fireEvent.change(select, { target: { value: types[1].id } })
    expect(useStreetType.getState().type).toBe(types[1].id)
    expect(useHand.getState().tool).toBe('street')
    expect(button('Street')).toHaveAttribute('aria-pressed', 'true')
    // choosing did not close the panel, and the chips show the pick
    expect((within(dialog('New street')).getByRole('combobox', { name: 'Street type' }) as HTMLSelectElement).value).toBe(types[1].id)
  })

  it('the street’s side picked there is the next street’s, and Street is in hand; another tool in hand gives way to it', () => {
    render(<App />)
    act(() => void take('lot'))
    fireEvent.click(button('Streets options'))
    const side = within(dialog('New street')).getByRole('group', { name: 'Street side' })
    fireEvent.click(within(side).getByRole('button', { name: 'Left' }))
    expect(useStreetSide.getState().side).toBe('left')
    expect(useHand.getState().tool).toBe('street')
    expect(dialog('New street')).toBeInTheDocument()
    // with Street already in hand a pick leaves it there
    fireEvent.click(within(side).getByRole('button', { name: 'Right' }))
    expect(useStreetSide.getState().side).toBe('right')
    expect(useHand.getState().tool).toBe('street')
  })

  it('where the plan cannot be drawn on (the 3D alone, Compare) the pick is kept and no tool is taken', () => {
    render(<App />)
    act(() => useUi.getState().setView('3d'))
    fireEvent.click(button('Streets options'))
    const side = within(dialog('New street')).getByRole('group', { name: 'Street side' })
    fireEvent.click(within(side).getByRole('button', { name: 'Left' }))
    expect(useStreetSide.getState().side).toBe('left')
    expect(useHand.getState().tool).toBe('select')
    const types = streetTypesOf(useApp.getState().project, null)
    fireEvent.change(within(dialog('New street')).getByRole('combobox', { name: 'Street type' }), { target: { value: types[1].id } })
    expect(useStreetType.getState().type).toBe(types[1].id)
    expect(useHand.getState().tool).toBe('select')
  })

  it('closes when the strip lies down (and when it stands up)', () => {
    const { rerender } = render(<ToolStrip flat={false} />)
    fireEvent.click(button('Massing options'))
    expect(dialog('Draw makes')).toBeInTheDocument()
    rerender(<ToolStrip flat />)
    noDialog('Draw makes')
    fireEvent.click(button('Massing options'))
    expect(dialog('Draw makes')).toBeInTheDocument()
    rerender(<ToolStrip flat={false} />)
    noDialog('Draw makes')
  })

  it('stands to the right of an upright strip and under a flat one, inside the window', () => {
    const rect = (r: Partial<DOMRect>) => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {}, ...r }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? rect({ width: 200, height: 80 }) : rect({ left: 10, right: 50, top: 100, bottom: 120, width: 40, height: 20 })
    })
    const { rerender } = render(<ToolStrip flat={false} />)
    fireEvent.click(button('Massing options'))
    expect(dialog('Draw makes')).toHaveStyle({ left: '54px', top: '100px' })
    rerender(<ToolStrip flat />)
    fireEvent.click(button('Massing options'))
    expect(dialog('Draw makes')).toHaveStyle({ left: '10px', top: '124px' })
    // no room under it: above
    vi.stubGlobal('innerHeight', 190)
    fireEvent.click(button('Massing options'))
    fireEvent.click(button('Massing options'))
    expect(dialog('Draw makes')).toHaveStyle({ top: '16px' })
  })
})

describe('the old places of the tools', () => {
  it('no tools bar on screen: the strip is the one place', () => {
    render(<App />)
    expect(document.querySelector('[data-bar="tools"]')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'General tools' })).toBeNull()
    expect(screen.getAllByRole('toolbar', { name: 'Tools' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull()
  })

  it('the panel has no tool buttons, whatever its tab', () => {
    render(<App />)
    const panel = () => screen.getByRole('complementary', { name: 'Layers and properties' })
    for (const area of ['layers', 'properties', 'blocks'] as const) {
      act(() => useUi.getState().setRail(area))
      expect(within(panel()).queryByRole('group', { name: 'Tools' })).toBeNull()
      expect(panel().querySelector('[data-area-tools]')).toBeNull()
      for (const name of ['Select', 'Move', 'Draw', 'Mass', 'Hole', 'Corner', 'Street', 'Gate', 'Connect', 'Lot', 'Import']) {
        expect(within(panel()).queryByRole('button', { name }), `${area}: ${name}`).toBeNull()
      }
      expect(within(panel()).queryByRole('combobox', { name: 'New block’s program' })).toBeNull()
      expect(within(panel()).queryByRole('combobox', { name: 'Street type' })).toBeNull()
    }
  })

  it('the drafting bar has Plan · 3D · Split after the Detail, and no Dimension, Ruler or Measure', () => {
    render(<App />)
    const drafting = screen.getByRole('region', { name: 'Drafting' })
    expect(within(drafting).queryByRole('button', { name: 'Dimension' })).toBeNull()
    expect(within(drafting).queryByRole('button', { name: 'Ruler' })).toBeNull()
    expect(within(drafting).queryByRole('group', { name: 'Measure' })).toBeNull()
    expect(within(drafting).queryByRole('button', { name: 'Measure' })).toBeNull()
    const tabs = within(drafting).getByRole('tablist', { name: 'View' })
    expect(within(tabs).getAllByRole('tab').map((t) => t.title)).toEqual(['Plan (Alt+1)', '3D view (Alt+2)', 'Plan and 3D side by side (Alt+3)'])
    const detail = within(drafting).getByRole('combobox', { name: 'Detail' })
    expect(detail.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(drafting).queryByRole('button', { name: 'Overlays' })).toBeNull()
    // the one place of the tabs on a wide screen
    expect(screen.getAllByRole('tablist', { name: 'View' })).toHaveLength(1)
    fireEvent.click(within(tabs).getByRole('tab', { name: '3D' }))
    expect(useUi.getState().view).toBe('3d')
    // and the drafting bar stays in the 3D view with the tabs
    expect(within(screen.getByRole('region', { name: 'Drafting' })).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
  })

  it('the Dimension, the Ruler, the Reference line and the Note are the strip’s Annotations', () => {
    render(<App />)
    const g = within(strip()).getByRole('group', { name: 'Annotations' })
    expect(within(g).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Dimension', 'Ruler', 'Reference line', 'Note'])
  })

  it('the view tabs show once on a phone too: the top bar’s, not the drafting bar’s', () => {
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: media.includes('max-width: 767'), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<App />)
    expect(screen.getAllByRole('tablist', { name: 'View' })).toHaveLength(1)
    expect(within(screen.getByRole('banner', { name: 'Top bar' })).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
  })

  it('the view tabs show once between 768 and 879 px: the drafting bar’s', () => {
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<App />)
    expect(screen.getAllByRole('tablist', { name: 'View' })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Drafting' })).getByRole('tablist', { name: 'View' })).toBeInTheDocument()
  })

  it('View › Bars has the drafting bar’s dock and none for the tools bar', () => {
    const ids = commands().map((c) => c.id)
    expect(ids).toContain('view.dock.drafting')
    expect(ids).not.toContain('view.dock.tools')
    expect(ids).not.toContain('view.bar.tools')
    expect(ids).toContain('view.panel.tools')
    expect(readSaved().docks).toEqual({ drafting: 'bottom' })
  })

  it('a layout saved with the tools bar’s dock opens: the dock is ignored, the rest is kept', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docks: { drafting: 'top', tools: 'bottom' }, show: { kpis: true, drafting: true, tools: false }, rail: 'layers' }))
    const saved = readSaved()
    expect(saved.docks).toEqual({ drafting: 'top' })
    // the strip is shown: `tools: false` hid the old bar
    expect(saved.show.tools).toBe(true)
    expect(saved.rail).toBe('layers')
    // and the app draws with such a state in the store
    useUi.setState({ docks: { drafting: 'top', tools: 'bottom' } as never, show: { kpis: true, drafting: true, tools: true } })
    render(<App />)
    expect(screen.getByRole('region', { name: 'Drafting' })).toHaveAttribute('data-dock', 'top')
    expect(strip()).toBeInTheDocument()
    expect(document.querySelector('[data-bar="tools"]')).toBeNull()
  })
})
