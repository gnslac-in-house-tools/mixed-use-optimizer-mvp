// The Tools strip on screen (AS.2, `tools/ToolStrip.tsx`): every command that carries `tool`, by group, as an icon button that
// reads its command (label, key, `enabled()`, `checked()`) and runs it. A press runs the command; the pressed button follows the
// hand; a tool that cannot be taken is greyed with the reason as its title; Union, Connect and Group are never pressed; it hides
// with View › Panels › Tools; on a wide screen it is a column at the window's left, below 880 px it lies flat under the viewport.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Footprint } from '../../../model/schema.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { actions } from '../../../state/actions/index.ts'
import { sampleProject } from '../../../state/sample.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { useCompare } from '../../compare/compareView.ts'
import { setKeys, resetKeys } from '../../commands/shortcuts.ts'
import { registerAll } from '../../commands/index.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { pickMenu } from '../../__tests__/pickMenu.ts'
import { letGo, take, useHand } from '../hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const strip = () => screen.getByRole('toolbar', { name: 'Tools' })
const button = (name: string) => within(strip()).getByRole('button', { name })
const pressed = () => within(strip()).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'))

function reset(p = demoProject()) {
  localStorage.clear()
  registerAll()
  resetKeys()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({
    dialog: null,
    view: 'plan',
    rail: 'layers',
    panels: { left: true, right: true },
    sheet: null,
    docks: { drafting: 'bottom' },
    stripDock: 'left',
    show: { kpis: true, drafting: true, tools: true },
  })
  useToast.setState({ toast: null, confirmation: null })
  useCompare.getState().close()
  useAccess.setState({ picked: null, alsoGates: [] })
  letGo()
}

beforeEach(() => reset())
afterEach(() => {
  vi.unstubAllGlobals()
  useCompare.getState().close()
  resetKeys()
})

describe('the strip', () => {
  it('a toolbar named Tools, upright, with a group for each of the six, named', () => {
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'vertical')
    expect(strip()).toHaveAttribute('data-tool-strip')
    const groups = within(strip()).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['General', 'Massing', 'Elements', 'Streets', 'Parking', 'Annotations'])
    expect(within(groups[0]).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Move', 'Copy', 'Rotate', 'Mirror', 'Array', 'Align', 'Group'])
    expect(within(groups[3]).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Street', 'Gate', 'Existing road', 'Connect'])
  })

  it('each button carries its tour anchor: the command’s id without “tool.”, Group’s tool-group', () => {
    render(<App />)
    // the grip and the groups' ▾ (General, Massing, Streets) are no tools: they carry no anchor
    const anchors = within(strip()).getAllByRole('button').filter((b) => b.hasAttribute('data-tour')).map((b) => b.getAttribute('data-tour'))
    expect(anchors).toEqual([
      'tool-select', 'tool-move', 'tool-copy', 'tool-rotate', 'tool-mirror', 'tool-array', 'tool-align', 'tool-group',
      'tool-mass', 'tool-hole', 'tool-corner', 'tool-chamfer', 'tool-split', 'tool-union',
      'tool-dock', 'tool-door', 'tool-pattern', 'tool-court',
      'tool-street', 'tool-gate', 'tool-existing-road', 'tool-connect',
      'tool-lot',
      'tool-dimension', 'tool-ruler', 'tool-referenceLine', 'tool-note',
    ])
  })

  it('a press runs the command: Street is taken, and pressed again it goes back to Select', () => {
    render(<App />)
    fireEvent.click(button('Street'))
    expect(useHand.getState().tool).toBe('street')
    expect(button('Street')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button('Street'))
    expect(useHand.getState().tool).toBe('select')
    expect(button('Select')).toHaveAttribute('aria-pressed', 'true')
  })

  it('the pressed button follows the hand: a tool taken by its key presses its button and lets Select go', () => {
    render(<App />)
    expect(pressed()).toEqual(['Select'])
    fireEvent.keyDown(window, { key: 'w' })
    expect(useHand.getState().tool).toBe('street')
    expect(button('Street')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Select')).toHaveAttribute('aria-pressed', 'false')
    expect(pressed()).toEqual(['Street'])
    act(() => void take('ruler'))
    expect(pressed()).toEqual(['Ruler'])
    fireEvent.keyDown(window, { key: 'v' })
    expect(pressed()).toEqual(['Select'])
  })

  it('a tool of the Site menu in hand presses no button', () => {
    render(<App />)
    act(() => void take('draw'))
    expect(pressed()).toEqual([])
  })

  it('the title is the hint with its key; a key the user gave shows at once', () => {
    render(<App />)
    expect(button('Street').getAttribute('title')).toMatch(/^Draw a street: .* \(W\)$/)
    expect(button('Select').getAttribute('title')).toMatch(/\(V\)$/)
    act(() => setKeys('tool.street', ['Q']))
    expect(button('Street').getAttribute('title')).toMatch(/\(Q\)$/)
    act(() => setKeys('tool.street', []))
    expect(button('Street').getAttribute('title')).not.toMatch(/\)$/)
  })

  it('a tool that cannot be taken is disabled, its reason the title: nothing picked, the 3D alone, Compare, no boundary', () => {
    render(<App />)
    expect(button('Move')).toBeDisabled()
    expect(button('Move')).toHaveAttribute('title', 'Pick something first')
    act(() => useApp.getState().select('m1'))
    expect(button('Move')).toBeEnabled()
    expect(button('Move').getAttribute('title')).toMatch(/^Move what is picked/)
    act(() => useUi.getState().setView('3d'))
    for (const name of ['Move', 'Street', 'Dimension', 'Ruler']) {
      expect(button(name), name).toBeDisabled()
      expect(button(name), name).toHaveAttribute('title', 'The plan is not on screen')
    }
    fireEvent.click(button('Street'))
    expect(useHand.getState().tool).toBe('select')
    act(() => useUi.getState().setView('plan'))
    act(() => useCompare.getState().start(['o1']))
    expect(button('Street')).toBeDisabled()
    expect(button('Street')).toHaveAttribute('title', 'Close Compare first')
    act(() => useCompare.getState().close())
    expect(button('Street')).toBeEnabled()
    act(() => useApp.getState().apply((p) => ({ ...p, site: { ...p.site, boundary: null } })))
    for (const name of ['Gate', 'Existing road', 'Connect']) {
      expect(button(name), name).toBeDisabled()
      expect(button(name), name).toHaveAttribute('title', 'The site needs a boundary first')
    }
    expect(button('Street')).toBeEnabled()
  })

  it('the Elements tools ask for a placed block (“Pick a placed block first”), and take it once one is picked', () => {
    const p = sampleProject()
    const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
    const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
    useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), selection: NO_SELECTION, option: option.id, level: copy.levels[0].id })
    render(<App />)
    for (const name of ['Dock', 'Door', 'Pattern', 'Court']) {
      expect(button(name), name).toBeDisabled()
      expect(button(name), name).toHaveAttribute('title', 'Pick a placed block first')
    }
    const levels = new Set(copy.levels.map((l) => l.id))
    const hall = p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!
    act(() => useApp.getState().select(hall.id))
    expect(button('Dock')).toBeEnabled()
    fireEvent.click(button('Dock'))
    expect(useHand.getState().tool).toBe('dock')
    expect(pressed()).toEqual(['Dock'])
    // the pick gone, the tool goes with it and the buttons rest again
    act(() => useApp.getState().select(null))
    expect(pressed()).toEqual(['Select'])
    expect(button('Dock')).toBeDisabled()
  })

  it('Union and Group go from greyed to enabled on screen as the selection changes: Group with two masses, Union with two that touch', () => {
    render(<App />)
    const state = () => [button('Group'), button('Union')].map((b) => (b as HTMLButtonElement).disabled)
    expect(state()).toEqual([true, true])
    // two masses that do not touch: they group, they do not merge
    act(() => useApp.getState().selectMany(['m1', 'm2']))
    expect(state()).toEqual([false, true])
    expect(button('Union').getAttribute('title')).toMatch(/do not all touch/)
    // two that share a wall: both work
    act(() => {
      const s = useApp.getState()
      s.apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 130 }, width: 30, depth: 40, rotation: 0 }, name: 'A', height: 14 }).project)
      s.apply((p) => actions.addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 225, y: 100 }, width: 30, depth: 20, rotation: 0 }, name: 'B', height: 14 }).project)
    })
    act(() => useApp.getState().selectMany(useApp.getState().project.masses.slice(-2).map((m) => m.id)))
    expect(state()).toEqual([false, false])
    // nothing picked: greyed again
    act(() => useApp.getState().select(null))
    expect(state()).toEqual([true, true])
  })

  it('Union with blocks of two types is not greyed: pressed, it says why in a toast, as U does (Phase D.3, task 1)', () => {
    const rect = (cx: number): Footprint => ({ kind: 'rect', center: { x: cx, y: 200 }, width: 40, depth: 20, rotation: 0 })
    const one = actions.drawBlock(demoProject(), { programId: 'office', footprint: rect(300), optionId: 'o1' })!
    const other = actions.drawBlock(one.project, { programId: 'warehouse', footprint: rect(340), optionId: 'o1' })!
    reset(other.project)
    render(<App />)
    act(() => useApp.getState().selectMany([one.id, other.id]))
    expect(button('Union')).toBeEnabled()
    fireEvent.click(button('Union'))
    expect(useToast.getState().toast?.text).toMatch(/^Blocks of different types do not join: give them one type first/)
    // nothing joined
    expect(useApp.getState().project.masses.some((m) => m.id === other.id)).toBe(true)
    // the key says the same
    useToast.setState({ toast: null })
    fireEvent.keyDown(window, { key: 'u' })
    expect(useToast.getState().toast?.text).toMatch(/^Blocks of different types do not join: give them one type first/)
    // what a click cannot explain stays greyed with its reason: nothing picked
    act(() => useApp.getState().select(null))
    expect(button('Union')).toBeDisabled()
  })

  it('Union, Connect and Group do something once: never pressed, no aria-pressed, never in hand', () => {
    render(<App />)
    for (const name of ['Union', 'Connect', 'Group']) expect(button(name), name).not.toHaveAttribute('aria-pressed')
    expect(button('Union')).toBeDisabled()
    expect(button('Group')).toBeDisabled()
    fireEvent.click(button('Connect'))
    expect(useHand.getState().tool).toBe('select')
    expect(useToast.getState().toast?.text).toMatch(/Connect|Every truck court/)
    expect(pressed()).toEqual(['Select'])
  })

  it('without the warehouse or the parking module the group is not there (the blank typology offers both)', () => {
    const p = demoProject()
    reset({ ...p, typology: 'blank' })
    render(<App />)
    expect(within(strip()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['General', 'Massing', 'Elements', 'Streets', 'Parking', 'Annotations'])
  })
})

describe('short of height', () => {
  it('goes to two columns while its content is taller than its room, and back once the one-column height fits; still short, it scrolls', () => {
    let room = 500
    const observers: (() => void)[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    // the strip's content is 700 px tall in one column, 380 in two; only the strip is measured
    const isStrip = (el: HTMLElement) => el.hasAttribute('data-tool-strip')
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return isStrip(this) ? (this.getAttribute('data-cols') === '2' ? 380 : 700) : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return isStrip(this) ? room : 0
    })
    render(<App />)
    expect(strip()).toHaveAttribute('data-cols', '2')
    expect(strip().className).toMatch(/overflow-y-auto/)
    // the room grows to the one-column height: back to one column
    room = 800
    act(() => observers[observers.length - 1]())
    expect(strip()).toHaveAttribute('data-cols', '1')
    // short again: two
    room = 400
    act(() => observers[observers.length - 1]())
    expect(strip()).toHaveAttribute('data-cols', '2')
    vi.restoreAllMocks()
  })

  it('with room enough it stays one column', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tool-strip') ? 700 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-tool-strip') ? 900 : 0
    })
    render(<App />)
    expect(strip()).toHaveAttribute('data-cols', '1')
    vi.restoreAllMocks()
  })
})

describe('where it stands', () => {
  it('on a wide screen a column at the window’s left, before the left panel and outside the viewport’s column', () => {
    render(<App />)
    expect(strip().closest('[data-dock-area]')).toBeNull()
    expect(strip().closest('main')).not.toBeNull()
    const left = screen.getByRole('complementary', { name: 'Layers and properties' })
    expect(strip().compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // its column is in the grid only while it shows
    const main = strip().closest('main') as HTMLElement
    expect(main.style.gridTemplateColumns.split(' ').length).toBeGreaterThanOrEqual(4)
  })

  it('View › Panels › Tools hides it and brings it back; the choice is the layout’s show.tools', () => {
    render(<App />)
    const before = (screen.getByRole('main') as HTMLElement).style.gridTemplateColumns
    pickMenu('View', 'Panels', 'Tools')
    expect(useUi.getState().show.tools).toBe(false)
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull()
    expect((screen.getByRole('main') as HTMLElement).style.gridTemplateColumns.split(' ').length).toBeLessThan(before.split(' ').length)
    pickMenu('View', 'Panels', 'Tools')
    expect(useUi.getState().show.tools).toBe(true)
    expect(strip()).toBeInTheDocument()
  })

  it('below 880 px it lies flat under the viewport, under the drafting bar: one row, scrolling sideways', () => {
    vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<App />)
    expect(strip()).toHaveAttribute('aria-orientation', 'horizontal')
    const area = strip().closest('[data-dock-area]') as HTMLElement
    expect(area).not.toBeNull()
    const drafting = within(area).getByRole('region', { name: 'Drafting' })
    // after the viewport, and after the drafting bar docked below it
    expect(drafting.compareDocumentPosition(strip()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(strip().className).toMatch(/overflow-x-auto/)
    // a tool is as reachable flat
    fireEvent.click(button('Street'))
    expect(useHand.getState().tool).toBe('street')
  })

  it('hidden with show.tools off in either place', () => {
    useUi.setState({ show: { kpis: true, drafting: true, tools: false } })
    render(<App />)
    expect(screen.queryByRole('toolbar', { name: 'Tools' })).toBeNull()
  })
})
