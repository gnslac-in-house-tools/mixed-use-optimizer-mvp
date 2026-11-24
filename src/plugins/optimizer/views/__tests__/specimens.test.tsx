// The Specimens tab (Decision "Specimens tab", O.5a): a run's front listed (the most balanced first, the design last),
// Show and Sort, a specimen picked from the list, the scatter or the lines and what it is against the design, a range
// dragged on an axis, ⤢ under the viewport and back (Escape), another run starting it over, and the one picked shown
// in the viewport (O.5b, Decision "Specimen preview"), the run followed while it goes (Decision "Following a run"). The
// run is made up (fixtures.ts); optimize.test.tsx runs one.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../../App.tsx'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../../state/store.ts'
import { useUi } from '../../../../views/layout/ui.ts'
import { usePluginModes } from '../../../settings.ts'
import { useWidePane } from '../../../slots.tsx'
import { useRun } from '../../run/store.ts'
import { useLook } from '../../../../views/viewport/look.ts'
import { useSpecimenView } from '../specimens/viewState.ts'
import { fakeRun, runOnDesign } from './fixtures.ts'

vi.mock('../../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p, 'o1'), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', summaryTab: 'plugin:optimizer/specimens', panels: { left: true, right: true }, sheet: null, help: false })
  usePluginModes.setState({ modes: {} })
  useWidePane.setState({ tab: null })
  useRun.getState().clear()
  useRun.setState({ run: fakeRun(p, 1) })
  useLook.setState({ look: null })
  // the viewport's mode is the designer's: a run does not reset it
  useSpecimenView.setState({ follow: 'best' })
})

async function specimens() {
  render(<App />)
  return within(await screen.findByRole('tabpanel', { name: 'Specimens' }, { timeout: 5000 }))
}
const listed = (tab: ReturnType<typeof within>) =>
  within(tab.getByRole('list', { name: 'Specimens' }))
    .getAllByRole('button', { name: /^Specimen #/ })
    .map((b) => b.getAttribute('aria-label'))

describe('the Specimens tab', () => {
  it('lists the front, the most balanced first (★), the design last; the scatter draws them', async () => {
    const tab = await specimens()
    expect(await tab.findByText('Done', undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(tab.getByText(/0:12 · 80 generations/)).toBeInTheDocument()
    expect(listed(tab)).toEqual(['Specimen #2', 'Specimen #3', 'Specimen #1'])
    expect(within(tab.getByRole('button', { name: 'Specimen #2' })).getByLabelText('the most balanced')).toBeInTheDocument()
    expect(within(tab.getByRole('listitem', { name: 'Your design' })).getByText('300')).toBeInTheDocument()
    const scatter = tab.getByRole('img', { name: /^Specimens on Dock → truck gate and Free ground/ })
    expect(scatter.querySelectorAll('[data-front]')).toHaveLength(3)
    expect(scatter.querySelector('[data-design]')).not.toBeNull()
    expect(tab.getByText(/1 break a must-hold/)).toBeInTheDocument()
  })

  it('shows the feasible ones or all, sorted by an objective', async () => {
    const tab = await specimens()
    fireEvent.change(tab.getByRole('combobox', { name: 'Show' }), { target: { value: 'all' } })
    expect(listed(tab)).toEqual(['Specimen #2', 'Specimen #3', 'Specimen #1', 'Specimen #4', 'Specimen #5'])
    expect(within(tab.getByRole('button', { name: 'Specimen #5' })).getByLabelText('breaks a must-hold')).toBeInTheDocument()
    fireEvent.change(tab.getByRole('combobox', { name: 'Sort' }), { target: { value: '1' } })
    // free ground, the most first; the one that breaks a must-hold last
    expect(listed(tab)).toEqual(['Specimen #3', 'Specimen #2', 'Specimen #1', 'Specimen #4', 'Specimen #5'])
  })

  it('a row picks a specimen: each objective against the design, whether it holds, its genes', async () => {
    const tab = await specimens()
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #1' }))
    const detail = within(document.querySelector<HTMLElement>('[data-picked-detail="1"]')!)
    expect(detail.getByText(/Born in generation 0 · on the front/)).toBeInTheDocument()
    expect(detail.getByText('▼ 200 m')).toHaveClass('text-status-within')
    expect(detail.getByText('▲ 18,000 m²')).toHaveClass('text-status-within')
    // brief Δ: 424.2 m² against 424 m², none as shown
    expect(detail.getByText('= yours')).toBeInTheDocument()
    expect(detail.getByText('Holds every must-hold')).toBeInTheDocument()
    expect(detail.getByText('Warehouse 1 · x')).toBeInTheDocument()
    // the scatter and the lines mark it; again, it lets go
    expect(tab.getByRole('img', { name: /^Specimens on/ }).querySelector('[data-picked="1"]')).not.toBeNull()
    expect(tab.getByRole('img', { name: /^Parallel coordinates/ }).querySelector('[data-picked="1"]')).not.toBeNull()
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #1' }))
    expect(document.querySelector('[data-picked-detail]')).toBeNull()
  })

  it('a click on the scatter picks the nearest specimen; on nothing, none', async () => {
    const tab = await specimens()
    const scatter = tab.getByRole('img', { name: /^Specimens on/ })
    const dot = scatter.querySelector('[data-front="3"]')!
    fireEvent.click(scatter, { clientX: Number(dot.getAttribute('cx')) + 2, clientY: Number(dot.getAttribute('cy')) - 2 })
    expect(useSpecimenView.getState().picked).toBe(3)
    expect(document.querySelector('[data-picked-detail="3"]')).not.toBeNull()
    fireEvent.click(scatter, { clientX: 1, clientY: 1 })
    expect(useSpecimenView.getState().picked).toBeNull()
  })

  it('a range dragged on an axis filters the list; a click on the axis, or Clear filters, lets it go', async () => {
    const tab = await specimens()
    const lines = tab.getByRole('img', { name: /^Parallel coordinates/ })
    // the dock axis, the first: 100 m (its best, the top) to 300 m (the design); the top third keeps 100 to about 160
    fireEvent.pointerDown(lines, { clientX: 16, clientY: 14, pointerId: 1 })
    fireEvent.pointerMove(lines, { clientX: 16, clientY: 42, pointerId: 1 })
    fireEvent.pointerUp(lines, { clientX: 16, clientY: 42, pointerId: 1 })
    expect(listed(tab)).toEqual(['Specimen #2', 'Specimen #1'])
    expect(lines.querySelector('[data-range="0"]')).not.toBeNull()
    fireEvent.click(tab.getByRole('button', { name: 'Clear filters' }))
    expect(listed(tab)).toHaveLength(3)
    fireEvent.pointerDown(lines, { clientX: 16, clientY: 14, pointerId: 1 })
    fireEvent.pointerMove(lines, { clientX: 16, clientY: 42, pointerId: 1 })
    fireEvent.pointerUp(lines, { clientX: 16, clientY: 42, pointerId: 1 })
    expect(listed(tab)).toHaveLength(2)
    fireEvent.pointerDown(lines, { clientX: 16, clientY: 60, pointerId: 1 })
    fireEvent.pointerUp(lines, { clientX: 16, clientY: 60, pointerId: 1 })
    expect(listed(tab)).toHaveLength(3)
  })

  it('⤢ puts it wide under the viewport, the panel says where it went; Escape brings it back as it was', async () => {
    const tab = await specimens()
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #3' }))
    fireEvent.click(tab.getByRole('button', { name: 'Wide, under the viewport' }))
    const wide = await screen.findByRole('region', { name: 'Specimens, wide' })
    expect(wide.closest('[data-dock-area]')).not.toBeNull()
    expect(screen.getByRole('separator', { name: 'Divider between the viewport and the Specimens' })).toBeInTheDocument()
    expect(within(screen.getByRole('tabpanel', { name: 'Specimens' })).getByText('The specimens stand under the viewport, wide.')).toBeInTheDocument()
    // what was picked stays picked
    expect(within(wide).getByRole('button', { name: 'Specimen #3' })).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(within(wide).getByRole('button', { name: 'Specimen #3' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Specimens, wide' })).toBeNull()
    expect(within(screen.getByRole('tabpanel', { name: 'Specimens' })).getByRole('button', { name: 'Specimen #3' })).toHaveAttribute('aria-current', 'true')
    // from the panel too
    fireEvent.click(screen.getByRole('button', { name: 'Wide, under the viewport' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back to this panel' }))
    expect(screen.queryByRole('region', { name: 'Specimens, wide' })).toBeNull()
  })

  it('not on a narrow screen: no ⤢', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({ media, matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      useUi.setState({ sheet: 'right' })
      const tab = await specimens()
      expect(tab.getByRole('button', { name: 'Specimen #2' })).toBeInTheDocument()
      expect(tab.queryByRole('button', { name: 'Wide, under the viewport' })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('another run starts it over: nothing picked, no ranges', async () => {
    const tab = await specimens()
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #1' }))
    act(() => useSpecimenView.getState().filter(0, [100, 200]))
    act(() => useRun.setState({ run: fakeRun(useApp.getState().project, 2) }))
    expect(useSpecimenView.getState()).toMatchObject({ picked: null, filters: {} })
    expect(listed(tab)).toHaveLength(3)
  })

  it('the one picked stands in the viewport, read only: › the next of the list, Back to my design lets it go', async () => {
    const p = useApp.getState().project
    act(() => useRun.setState({ run: runOnDesign(p, 3) }))
    const tab = await specimens()
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #2' }))
    const bar = await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
    expect(bar).toHaveTextContent('Specimen #2 · 1 of 3')
    expect(useLook.getState().look?.project).not.toBe(p)
    expect(useLook.getState().look?.better).toEqual({ 'dock-to-gate': 'min', 'free-ground': 'max', 'brief-gap': 'min' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(useSpecimenView.getState().picked).toBe(3)
    expect(await screen.findByText('Specimen #3 · 2 of 3')).toBeInTheDocument()
    // the list sorted otherwise: where it stands in it
    fireEvent.change(tab.getByRole('combobox', { name: 'Sort' }), { target: { value: '0' } })
    expect(await screen.findByText('Specimen #3 · 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to my design' }))
    expect(useLook.getState().look).toBeNull()
    expect(useSpecimenView.getState().picked).toBeNull()
    expect(useApp.getState().project).toBe(p)
  })

  it('wide and a preview: the first Escape goes back to the design, the next one brings the specimens back', async () => {
    act(() => useRun.setState({ run: runOnDesign(useApp.getState().project, 4) }))
    const tab = await specimens()
    fireEvent.click(tab.getByRole('button', { name: 'Wide, under the viewport' }))
    const wide = await screen.findByRole('region', { name: 'Specimens, wide' })
    fireEvent.click(within(wide).getByRole('button', { name: 'Specimen #2' }))
    await screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
    fireEvent.keyDown(within(wide).getByRole('button', { name: 'Specimen #2' }), { key: 'Escape' })
    expect(useLook.getState().look).toBeNull()
    expect(screen.getByRole('region', { name: 'Specimens, wide' })).toBeInTheDocument()
    fireEvent.keyDown(within(wide).getByRole('button', { name: 'Specimen #2' }), { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Specimens, wide' })).toBeNull()
  })
})

describe('following a run', () => {
  /** The run going on: a new generation (the same front, anew), or a genome being tried. */
  const going = () => {
    const run = { ...runOnDesign(useApp.getState().project, 5), status: 'running' as const }
    act(() => useRun.setState({ run }))
    return run
  }
  const generation = () => act(() => useRun.setState((s) => ({ run: { ...s.run!, front: [...s.run!.front] } })))
  const title = () => screen.findByRole('toolbar', { name: 'Preview' }, { timeout: 5000 })
  const modes = (tab: ReturnType<typeof within>) => within(tab.getByRole('group', { name: 'While running' })).getAllByRole('button')
  const mode = (tab: ReturnType<typeof within>, name: 'All' | 'Best' | 'None') => fireEvent.click(modes(tab)[['All', 'Best', 'None'].indexOf(name)])

  it('Best: the front’s ★ each generation, quiet; when the run ends it stays, picked', async () => {
    const tab = await specimens()
    going()
    generation()
    expect(await title()).toHaveTextContent('Following the run · ★ #2 · gen 3/80')
    expect(useLook.getState().look?.quiet).toBe(true)
    expect(useSpecimenView.getState().picked).toBeNull()
    expect(modes(tab).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    act(() => useRun.setState((s) => ({ run: { ...s.run!, status: 'done' } })))
    expect(useSpecimenView.getState().picked).toBe(2)
    expect(await screen.findByText('Specimen #2 · 1 of 3')).toBeInTheDocument()
  })

  it('All: the genome tried last; None: the design', async () => {
    const tab = await specimens()
    const run = going()
    mode(tab, 'All')
    act(() => useRun.setState((s) => ({ run: { ...s.run!, trying: run.specimens[0].genome } })))
    expect(await title()).toHaveTextContent('Following the run · trying · gen 3/80')
    mode(tab, 'None')
    expect(useLook.getState().look).toBeNull()
    generation()
    expect(useLook.getState().look).toBeNull()
  })

  it('a pick, Back to my design or a step without masses: the run does not take the viewport', async () => {
    const tab = await specimens()
    going()
    generation()
    await title()
    // a pick shows that one; the next generation does not take it away
    fireEvent.click(tab.getByRole('button', { name: 'Specimen #3' }))
    expect(await screen.findByText(/^Specimen #3 · /)).toBeInTheDocument()
    generation()
    expect(await screen.findByText(/^Specimen #3 · /)).toBeInTheDocument()
    // Back to my design: this run is not followed any more, until a mode is picked again
    fireEvent.click(screen.getByRole('button', { name: 'Back to my design' }))
    generation()
    expect(useLook.getState().look).toBeNull()
    mode(tab, 'Best')
    expect(await title()).toHaveTextContent('Following the run')
    // the Brief: it waits there, the designer stays
    act(() => useUi.getState().openDialog('brief'))
    expect(useLook.getState().look).toBeNull()
    generation()
    expect(useLook.getState().look).toBeNull()
    expect(useUi.getState().dialog).toBe('brief')
    act(() => useUi.getState().closeDialog())
    generation()
    expect(await title()).toHaveTextContent('Following the run')
  })
})
