// No areas (AS.2, task 4): a tool works whatever the left panel shows, and taking one never changes what the panel shows. In a
// prepared project (a boundary, a placed block picked), every command that carries `tool` (and the Site menu's Draw boundary), run
// with the panel on Layers, Blocks or Properties, or hidden, puts its tool in hand and leaves `rail`, `panels` and `sheet` as they were
// (Phase AS.3: the settings groups' folds and the Site tab's parts went with the tabs). Street's key does the same from Layers. The UI
// state has no `workspace`; a new project opens on Layers; a plugin's tab closed goes back to the tab it had.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import { sampleProject } from '../../../state/sample.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { registerAll } from '../../commands/index.ts'
import { commandOf, commands } from '../../commands/registry.ts'
import { useCompare } from '../../compare/compareView.ts'
import { startProject } from '../../layout/files.ts'
import { useUi, type RailItem } from '../../layout/ui.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { letGo, useHand } from '../hand.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

/** The sample's first placed block's hall: picked, the Elements tools and Move, Copy and Rotate have something to work on. */
function pickBlockHall() {
  const { project: p, option } = useApp.getState()
  const ids = p.options.find((o) => o.id === option)!.buildingIds
  const b = p.buildings.find((x) => x.warehouse && ids.includes(x.id))!
  const levels = new Set(b.levels.map((l) => l.id))
  useApp.getState().select(p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!.id)
}

function reset() {
  localStorage.clear()
  registerAll()
  const p = sampleProject()
  const option = p.options.find((o) => p.buildings.some((b) => o.buildingIds.includes(b.id) && b.warehouse))!
  const copy = p.buildings.find((b) => option.buildingIds.includes(b.id) && b.warehouse)!
  useApp.setState({ project: p, derived: derive(p, option.id), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, option: option.id, level: copy.levels[0].id, showAll: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useCompare.getState().close()
  useAccess.setState({ picked: null, alsoGates: [] })
  useSiteImport.setState({ pending: null })
  letGo()
}

beforeEach(reset)

/** What the left panel shows: the fields a tool must not change. */
const frame = () => {
  const { rail, panels, sheet } = useUi.getState()
  return { rail, panels: { ...panels }, sheet }
}

/** The tools of the strip (the ones that stay in hand) and the Site menu's Draw boundary. */
const handTools = () => [...commands().filter((c) => c.tool && !c.tool.once), commandOf('site.draw')!]

/** Every such tool the fixture allows, run from `Select`: it is in hand, and the frame is as it was. Returns the ids taken. */
function takeEach(): string[] {
  const taken: string[] = []
  const before = frame()
  for (const c of handTools()) {
    letGo()
    pickBlockHall()
    if ((c.enabled?.() ?? true) !== true) continue
    const was = frame()
    act(() => void c.run())
    // Select is the hand's rest: it "takes" itself
    expect(useHand.getState().tool === 'select' ? c.id === 'tool.select' : c.checked!(), `${c.id} in hand`).toBe(true)
    expect(frame(), `${c.id} left the panel as it was`).toEqual(was)
    taken.push(c.id)
  }
  expect(frame()).toEqual(before)
  return taken
}

const MUST = ['tool.select', 'tool.move', 'tool.mass', 'tool.hole', 'tool.corner', 'tool.street', 'tool.gate', 'tool.existing-road', 'tool.lot', 'tool.dimension', 'tool.ruler']

describe('a tool works whatever the left panel shows', () => {
  const rails: RailItem[] = ['properties', 'blocks', 'layers']
  for (const rail of rails) {
    it(`with the rail on ${rail}: every tool is taken and the panel stays as it was`, () => {
      useUi.setState({ rail })
      const taken = takeEach()
      for (const id of MUST) expect(taken, id).toContain(id)
      expect(taken).toContain('site.draw')
    })
  }

  it('with the left panel hidden: every tool is taken and it stays hidden', () => {
    useUi.setState({ rail: 'layers', panels: { left: false, right: true } })
    const taken = takeEach()
    for (const id of MUST) expect(taken, id).toContain(id)
    expect(useUi.getState().panels.left).toBe(false)
  })

  it('with a sheet over the viewport: it stays', () => {
    useUi.setState({ rail: 'layers', sheet: 'left' })
    takeEach()
    expect(useUi.getState()).toMatchObject({ rail: 'layers', sheet: 'left' })
  })

  it('taking Gate or Existing road leaves what Layers has picked as it is; what is picked on the plan then shows in Properties, which is not opened', () => {
    useUi.setState({ rail: 'layers' })
    render(<App />)
    for (const id of ['tool.gate', 'tool.existing-road']) {
      act(() => void commandOf(id)!.run())
      expect(useHand.getState().tool, id).not.toBe('select')
      expect(useUi.getState().rail, id).toBe('layers')
    }
    // what is picked on the plan does not open Properties by itself
    act(() => useAccess.getState().pick({ kind: 'existing', id: 'e1' }))
    expect(useUi.getState().rail).toBe('layers')
  })

  it('Street’s key, with the rail on Layers, puts Street in hand and the rail stays', () => {
    useUi.setState({ rail: 'layers' })
    render(<App />)
    fireEvent.keyDown(window, { key: 'w' })
    expect(useHand.getState().tool).toBe('street')
    expect(useUi.getState().rail).toBe('layers')
  })

  it('a tool taken from the menu does not change the open tab either', () => {
    useUi.setState({ rail: 'layers' })
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tools' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Tools' })).getByRole('menuitemcheckbox', { name: /^Select/ }))
    expect(useUi.getState().rail).toBe('layers')
  })
})

describe('the workspace is gone', () => {
  it('the UI state has no workspace, and no setter for one', () => {
    expect('workspace' in useUi.getState()).toBe(false)
    expect('setWorkspace' in useUi.getState()).toBe(false)
  })

  it('the panel’s tabs are Layers, Blocks and Properties; the settings tabs and the rail are gone', () => {
    render(<App />)
    const tabs = within(screen.getByRole('tablist', { name: 'Panel tabs' })).getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-label') ?? t.textContent)).toEqual(['Layers', 'Blocks', 'Properties', 'Optimize', 'Agent'])
    expect(screen.queryByRole('tablist', { name: 'Settings' })).toBeNull()
    act(() => useUi.getState().setRail('properties'))
    expect(screen.getByRole('tabpanel', { name: 'Properties' })).toBeInTheDocument()
  })

  it('a new project opens on the Layers tab, from any tab', () => {
    useUi.setState({ rail: 'properties' })
    act(() => startProject('industrial'))
    expect(useUi.getState().rail).toBe('layers')
  })

  it('a plugin’s tab closed goes back to the tab it had', () => {
    render(<App />)
    const plugins = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)
    for (const rail of ['layers', 'properties', 'blocks'] as RailItem[]) {
      act(() => useUi.getState().setRail(rail))
      fireEvent.click(plugins().getByRole('tab', { name: 'Optimize' }))
      expect(useUi.getState().rail).toBe('plugin:optimizer/stages')
      fireEvent.click(plugins().getByRole('tab', { name: 'Optimize' }))
      expect(useUi.getState().rail, `back to ${rail}`).toBe(rail)
    }
  })
})
