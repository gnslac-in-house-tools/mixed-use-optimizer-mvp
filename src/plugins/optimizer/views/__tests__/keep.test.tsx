// Keeping a specimen (Decision "Keep a specimen", O.6a): *Keep as option* on the preview's bar or the picked row makes
// a new option of copies (the design stays, one undo step) and goes to it; *Replace* in the row's ⋯ asks, then the
// option becomes the specimen and what it was stays as "<option> · before optimization"; *Discard run* asks, then
// takes away the run and the options kept from it, not the others. The run is made up (fixtures.ts).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import type { Project } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { useToast } from '../../../../views/layout/toast.ts'
import { useLook } from '../../../../views/viewport/look.ts'
import { usePluginModes } from '../../../settings.ts'
import { useWidePane } from '../../../slots.tsx'
import { useRun } from '../../run/store.ts'
import { useSpecimenView } from '../specimens/viewState.ts'
import { runOnDesign } from './fixtures.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

let p: Project
beforeEach(() => {
  localStorage.clear()
  p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'plugin:optimizer/specimens', panels: { left: true, right: true }, sheet: null, help: false })
  usePluginModes.setState({ modes: {} })
  useWidePane.setState({ tab: null })
  useToast.setState({ toast: null, confirmation: null })
  useRun.getState().clear()
  useRun.setState({ run: runOnDesign(p, 10) })
  useLook.setState({ look: null })
  useSpecimenView.setState({ follow: 'best' })
})

async function specimens() {
  render(<App />)
  return within(await screen.findByRole('tabpanel', { name: 'Specimens' }, { timeout: 5000 }))
}
const option = (name: string) => useApp.getState().project.options.find((o) => o.name === name)
const massesOf = (q: Project, optionId: string) => {
  const shown = new Set(q.options.find((o) => o.id === optionId)!.buildingIds)
  const levels = new Set(q.buildings.filter((b) => shown.has(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  return q.masses.filter((m) => levels.has(m.levelId))
}
const confirm = async (text: RegExp) => {
  const dialog = await screen.findByRole('alertdialog', { name: 'Confirm' })
  expect(dialog.querySelector('#confirmation-text')).toHaveTextContent(text)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
}

describe('keeping a specimen', () => {
  it('Keep as option on the bar: a new option with the specimen, the app goes to it; the design stays; one undo step', async () => {
    const tab = await specimens()
    fireEvent.click(await tab.findByRole('button', { name: 'Specimen #2' }, { timeout: 5000 }))
    const bar = await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
    const shown = useLook.getState().look!.project
    fireEvent.click(within(bar).getByRole('button', { name: 'Keep as option' }))
    await waitFor(() => expect(option('Option 1 · #2')).toBeDefined())
    const made = option('Option 1 · #2')!
    expect(useApp.getState().option).toBe(made.id)
    expect(useLook.getState().look).toBeNull()
    // the copies are the specimen's; Option 1 is as it was
    expect(massesOf(useApp.getState().project, made.id).map((m) => m.footprint)).toEqual(massesOf(shown, 'o1').map((m) => m.footprint))
    expect(massesOf(useApp.getState().project, 'o1')).toEqual(massesOf(p, 'o1'))
    expect(useRun.getState().run!.kept).toEqual([{ specimen: 2, optionId: made.id }])
    // picked again: it says it is kept
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #2' }))
    const again = await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
    expect(within(again).getByRole('button', { name: 'Kept' })).toBeDisabled()
    // the optimizer decided it (Decision "Decision log"); undone, the design is as it was and the log says so
    expect(useApp.getState().project.log?.at(-1)).toMatchObject({ by: 'optimizer' })
    act(() => useApp.getState().undo())
    expect({ ...useApp.getState().project, log: p.log }).toEqual(p)
    expect(useApp.getState().project.log?.at(-1)?.what).toMatch(/^Undid: /)
  })

  it('Keep from the picked row; Replace in its ⋯ asks, then the option is the specimen and what it was stays', async () => {
    const tab = await specimens()
    fireEvent.click(await tab.findByRole('button', { name: 'Specimen #3' }, { timeout: 5000 }))
    const detail = within(document.querySelector('[data-picked-detail="3"]') as HTMLElement)
    expect(detail.getByRole('button', { name: 'Keep as option' })).toBeEnabled()
    await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
    const shown = useLook.getState().look!.project
    fireEvent.click(detail.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace Option 1…' }))
    expect(useApp.getState().project).toBe(p)
    await confirm(/Replace Option 1 with specimen #3\? What it is now stays as “Option 1 · before optimization”/)
    const q = useApp.getState().project
    expect(q.options.map((o) => o.name)).toEqual(['Option 1', 'Option 1 · before optimization'])
    expect(massesOf(q, 'o1').map((m) => m.footprint)).toEqual(massesOf(shown, 'o1').map((m) => m.footprint))
    expect(option('Option 1 · before optimization')!.buildingIds).toEqual(['b1'])
    expect(useApp.getState().option).toBe('o1')
    // the optimizer decided it (Decision "Decision log"); undone, the design is as it was and the log says so
    expect(useApp.getState().project.log?.at(-1)).toMatchObject({ by: 'optimizer' })
    act(() => useApp.getState().undo())
    expect({ ...useApp.getState().project, log: p.log }).toEqual(p)
    expect(useApp.getState().project.log?.at(-1)?.what).toMatch(/^Undid: /)
  })

  it('Discard run asks, then the run goes with the options kept from it, not the others; one undo step', async () => {
    const tab = await specimens()
    fireEvent.click(await tab.findByRole('button', { name: 'Specimen #2' }, { timeout: 5000 }))
    fireEvent.click(within(await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })).getByRole('button', { name: 'Keep as option' }))
    await waitFor(() => expect(option('Option 1 · #2')).toBeDefined())
    act(() => useApp.getState().apply((q) => ({ ...q, options: [...q.options, { id: 'o9', name: 'Mine', buildingIds: ['b1'] }] })))
    fireEvent.click(tab.getByRole('button', { name: 'Discard run' }))
    await confirm(/Discard this run\? Its specimens go, and the option kept from it \(Ctrl\+Z brings it back\)/)
    const q = useApp.getState().project
    expect(q.options.map((o) => o.name)).toEqual(['Option 1', 'Mine'])
    expect(q.buildings.map((b) => b.id)).toEqual(['b1'])
    expect(q.masses).toEqual(p.masses)
    expect(useRun.getState().run).toBeNull()
    expect(await tab.findByText(/No run yet/)).toBeInTheDocument()
  })

  it('Discard run with nothing kept only asks about the specimens', async () => {
    const tab = await specimens()
    fireEvent.click(await tab.findByRole('button', { name: 'Discard run' }, { timeout: 5000 }))
    await confirm(/^Discard this run\? Its specimens go\.$/)
    expect(useRun.getState().run).toBeNull()
    expect(useApp.getState().project).toBe(p)
  })
})
