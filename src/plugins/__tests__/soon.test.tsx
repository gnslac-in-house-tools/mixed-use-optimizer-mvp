// "Coming soon" (Decision "Coming soon"): the optimizer and the agent are held back by COMING_SOON. Their buttons are
// dimmed and disabled with the notice as their title, no tab or tool of theirs is offered, the sample's unlock does
// not release them, View says so, and a project saved with the optimizer on opens and keeps its data as it was.
// The global test setup empties `soon`; here it is set as shipped.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../App.tsx'
import { derive } from '../../engine/derive.ts'
import { library } from '../../io/library.ts'
import { actions } from '../../state/actions/index.ts'
import { setPluginData } from '../../state/actions/plugins.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { useApp } from '../../state/store.ts'
import { keep } from '../../views/layout/saving.ts'
import { useUi } from '../../views/layout/ui.ts'
import { COMING_SOON, usePluginModes } from '../index.ts'

// WebGL does not run in jsdom
vi.mock('../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const OPTIMIZER_DATA = { on: true, seed: 7 }

beforeEach(() => {
  localStorage.clear()
  const p = setPluginData(demoProject(), 'optimizer', OPTIMIZER_DATA)
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { massId: null, vertex: null, massIds: [] } })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'overview', panels: { left: true, right: true }, sheet: null })
  usePluginModes.setState({ modes: {}, locks: {}, soon: COMING_SOON })
})

const leftRail = () => within(screen.getByRole('complementary', { name: 'Layers and properties' }).querySelector<HTMLElement>('[data-panel-tabs]')!)

describe('held back as coming soon', () => {
  it('lists the optimizer and the agent with a notice', () => {
    expect(Object.keys(COMING_SOON).sort()).toEqual(['agent', 'optimizer'])
  })

  it('dims the rail buttons, with the notice as their title; a click opens nothing', () => {
    render(<App />)
    for (const [name, id] of [['Optimize', 'optimizer'], ['Agent', 'agent']] as const) {
      const button = leftRail().getByRole('tab', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', COMING_SOON[id])
      fireEvent.click(button)
    }
    expect(useUi.getState().rail).toBe('layers')
    expect(useUi.getState().summaryTab).toBe('overview')
  })

  it('offers no plugin tab, and a saved plugin rail gives way to the panel’s own', () => {
    useUi.setState({ rail: 'plugin:optimizer/stages', summaryTab: 'plugin:optimizer/specimens' })
    render(<App />)
    expect(screen.queryByRole('tab', { name: 'Stages' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Specimens' })).toBeNull()
    expect(screen.queryByRole('tabpanel', { name: 'Stages' })).toBeNull()
    expect(screen.queryByRole('tabpanel', { name: 'Specimens' })).toBeNull()
  })

  it('opens a project saved with the optimizer on, shows none of it and keeps its data through a verb and a keep', () => {
    render(<App />)
    const before = useApp.getState().project.plugins
    expect(before).toEqual({ optimizer: OPTIMIZER_DATA })
    const o = useApp.getState().project.options[0]
    act(() => useApp.getState().apply((p) => actions.renameOption(p, o.id, 'Renamed')))
    expect(useApp.getState().project.plugins).toBe(before)
    act(() => {
      expect(keep()).toBe(true)
    })
    expect(useApp.getState().project.plugins).toBe(before)
    expect(useApp.getState().project.plugins).toEqual({ optimizer: OPTIMIZER_DATA })
    // and what this browser keeps carries them: read back from its copy, not the object in memory
    const kept = library.read(useApp.getState().project.id)!
    expect(kept.project.plugins).toEqual({ optimizer: OPTIMIZER_DATA })
  })

  it('stays held back when the sample unlocks the agent', () => {
    render(<App />)
    act(() => usePluginModes.getState().lock('agent', 'not in this demo'))
    // the standing notice shows, not the lock's reason
    expect(leftRail().getByRole('tab', { name: 'Agent' })).toHaveAttribute('title', COMING_SOON.agent)
    act(() => usePluginModes.getState().lock('agent', null))
    expect(usePluginModes.getState().soon.agent).toBe(COMING_SOON.agent)
    expect(leftRail().getByRole('tab', { name: 'Agent' })).toBeDisabled()
  })

  it('View says "coming soon" on both rows of each plugin, disabled', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    const menu = within(screen.getByRole('menu', { name: 'View' }))
    for (const name of ['optimizer', 'agent']) {
      expect(menu.getByRole('menuitemcheckbox', { name: new RegExp(`${name} tabs: coming soon`, 'i') })).toBeDisabled()
      expect(menu.getByRole('menuitem', { name: new RegExp(`${name} on: coming soon`, 'i') })).toBeDisabled()
    }
  })

  it('with `soon` empty, both buttons work as before', () => {
    usePluginModes.setState({ soon: {} })
    render(<App />)
    expect(leftRail().getByRole('tab', { name: 'Optimize' })).toBeEnabled()
    expect(leftRail().getByRole('tab', { name: 'Agent' })).toBeEnabled()
    fireEvent.click(leftRail().getByRole('tab', { name: 'Optimize' }))
    expect(useUi.getState().rail).toBe('plugin:optimizer/stages')
  })
})
