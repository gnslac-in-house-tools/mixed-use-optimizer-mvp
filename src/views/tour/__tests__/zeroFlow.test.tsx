// From zero, chapter 6 — Streets and circulation (spec 2026-11-10-from-zero-tutorial): the Flow step, a street from
// the existing road into the site, a gate where it enters, Connect for the docks' courts, a parking lot.
import { act, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useLayerPick, pickLayer } from '../../layers/layerPick.ts'
import { useLayerView } from '../../layers/layerView.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { stepsOf, useTour } from '../tour.ts'
import { FLOW_STEPS } from '../zero/flow.ts'
import { startZero } from '../zero/run.ts'
import { setTutorialSiteSource } from '../zero/siteFile.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const bytes = () => {
  const b = readFileSync('public/tutorial/site.dxf')
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

beforeEach(() => {
  localStorage.clear()
  setTutorialSiteSource(() => Promise.resolve(bytes()))
  useScreen.setState({ home: true })
  useUi.setState({ dialog: null, view: 'plan', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useSiteImport.setState({ pending: null })
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})

describe('chapter 6, streets and circulation', { timeout: 90_000 }, () => {
  it('by Do it for me: a street, a gate, every truck court reached, a parking lot', async () => {
    render(<App />)
    await act(() => startZero('Streets and circulation'))
    const steps = stepsOf('zero')
    const from = steps.findIndex((s) => s.chapter === 'Streets and circulation')
    const to = steps.findIndex((s) => s.chapter === 'Earthwork and analysis')
    expect(useTour.getState().index).toBe(from)
    for (let i = from; i < (to < 0 ? steps.length : to); i++) {
      const step = steps[useTour.getState().index]
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    const { project: p, option } = useApp.getState()
    const o = p.options.find((x) => x.id === option)!
    expect(o.streets?.segments.length ?? 0).toBeGreaterThan(0)
    expect(gatesOf(p, option).length).toBeGreaterThan(0)
    expect(o.lots).toHaveLength(1)
    // nothing left for Connect: every truck court has its way to a truck gate
    expect(actions.connectStreets(p, option).left).toBe(0)
  })

  it('with the Tools strip hidden, each step that points at a tool shows it first', async () => {
    render(<App />)
    await act(() => startZero('Streets and circulation'))
    const steps = stepsOf('zero')
    for (const [i, step] of steps.entries()) {
      if (step.chapter !== 'Streets and circulation' || !step.anchor?.startsWith('tool-')) continue
      act(() => useUi.getState().setShow('tools', false))
      act(() => useTour.getState().goTo(i))
      await waitFor(() => expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull())
    }
  })
})

describe('chapter 6, the first step is done by what it asks', { timeout: 90_000 }, () => {
  it('Layers open is not enough: its Circulation row picked or its branch open is; Do it for me opens the branch', async () => {
    const step = FLOW_STEPS.find((s) => s.id === 'zero-flow')!
    render(<App />)
    await act(() => startZero('Streets and circulation'))
    // the person has only the tab open: nothing asked has been done
    act(() => {
      useUi.setState({ rail: 'layers' })
      useLayerView.setState({ hidden: [], onTop: [], folded: [] })
      useLayerPick.setState({ keys: [] })
    })
    expect(useUi.getState().rail).toBe('layers')
    expect(step.done!()).toBe(false)
    // the branch open
    act(() => useLayerView.getState().setFolded('circulation', true))
    expect(step.done!()).toBe(true)
    act(() => useLayerView.getState().setFolded('circulation', false))
    expect(step.done!()).toBe(false)
    // its row picked
    act(() => pickLayer('circulation'))
    expect(step.done!()).toBe(true)
    act(() => useLayerPick.setState({ keys: [] }))
    expect(step.done!()).toBe(false)
    // Do it for me
    await act(async () => void (await step.act!()))
    expect(step.done!()).toBe(true)
    expect(useUi.getState().rail).toBe('layers')
  })
})
