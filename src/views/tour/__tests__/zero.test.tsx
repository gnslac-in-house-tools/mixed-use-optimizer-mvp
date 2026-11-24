// From zero's guard (spec 2026-11-10-from-zero-tutorial; docs/tour.md): the whole tutorial runs from an empty Home to
// the CAD plan by Do it for me alone, every step showing what it points at; each chapter opened on its own starts where
// the one before ends; what a later chapter needs, gone, comes back when that chapter is opened again. An app change
// that breaks the tutorial fails here, not in front of a newcomer.
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { library } from '../../../io/library.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { exportDxf } from '../../layout/exporting.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { chapters, stepsOf, useTour } from '../tour.ts'
import { tutorialCopies } from '../zero/common.ts'
import { startZero, TUTORIAL_PROJECT } from '../zero/run.ts'
import { setTutorialSiteSource } from '../zero/siteFile.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))
vi.mock('../../layout/exporting.ts', async (load) => ({ ...(await load<typeof import('../../layout/exporting.ts')>()), exportDxf: vi.fn() }))

const bytes = () => {
  const b = readFileSync('public/tutorial/site.dxf')
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(exportDxf).mockClear()
  setTutorialSiteSource(() => Promise.resolve(bytes()))
  useScreen.setState({ home: true })
  useUi.setState({ dialog: null, view: 'plan', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useSiteImport.setState({ pending: null })
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})

/** Do it for me on every step from the one shown to the end of `chapter` (all: the end), each anchor there first. */
async function through(chapter?: string) {
  const steps = stepsOf('zero')
  const end = chapter ? steps.findLastIndex((s) => s.chapter === chapter) : steps.length - 1
  while (useTour.getState().active && useTour.getState().index <= end) {
    const step = steps[useTour.getState().index]
    await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
    if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
    const at = useTour.getState().index
    await act(() => useTour.getState().doIt())
    if (step.done) expect(step.done(), step.id).toBe(true)
    if (useTour.getState().index === at && useTour.getState().active) throw new Error(`${step.id} did not go on`)
  }
}

describe('From zero, the whole run', { timeout: 300_000 }, () => {
  it('from Home to the CAD plan by Do it for me alone', async () => {
    render(<App />)
    await act(() => startZero())
    await through()
    expect(useTour.getState().active).toBe(false)
    const { project: p, option } = useApp.getState()
    const o = p.options.find((x) => x.id === option)!
    expect(p.name).toBe(TUTORIAL_PROJECT)
    expect(library.list().filter((s) => s.name === TUTORIAL_PROJECT)).toHaveLength(1)
    expect(p.site.boundary).not.toBeNull()
    expect(p.site.terrain).toBeDefined()
    expect(tutorialCopies()).toHaveLength(2)
    expect(o.streets?.segments.length ?? 0).toBeGreaterThan(0)
    expect(gatesOf(p, option).length).toBeGreaterThan(0)
    expect(o.lots).toHaveLength(1)
    expect(exportDxf).toHaveBeenCalledTimes(1)
  })

  it('each chapter on its own starts on its first step, done as far as the replay leaves it', async () => {
    render(<App />)
    for (const c of chapters('zero').slice(1)) {
      localStorage.clear()
      await act(() => startZero(c))
      const step = stepsOf('zero')[useTour.getState().index]
      expect(step.chapter).toBe(c)
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), `${c}: ${step.id}`).not.toBeNull()
    }
  })

  it('the first block gone, Streets and circulation opened again brings it back', async () => {
    render(<App />)
    await act(() => startZero('Streets and circulation'))
    const first = tutorialCopies()[0]
    act(() => useApp.getState().apply((p) => actions.removeBuilding(p, first)))
    await act(() => startZero('Streets and circulation'))
    await act(async () => useToast.getState().confirmation?.onContinue())
    await screen.findByRole('dialog', { name: `Tour: ${stepsOf('zero')[useTour.getState().index].title}` })
    expect(tutorialCopies()).toHaveLength(2)
    await through('Streets and circulation')
  })
})
