// The tour's guard (Decision "Tour"; docs/tour.md): on the sample, every step shows what it points at, and Next — doing
// what a step asks when the user has not — leaves it done. An app change that breaks the tour fails here, not in front
// of an audience.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { COMING_SOON, usePluginModes } from '../../../plugins/index.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { openSample } from '../../layout/files.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { followSample } from '../../home/sample.ts'
import { STEPS } from '../steps.ts'
import { chapters, stepsOf, useTour } from '../tour.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

beforeEach(() => {
  localStorage.clear()
  useScreen.setState({ home: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useTour.setState({ offer: false, active: false, index: 0 })
})

// the sample's ground is contours (a surface made once, ~0.4 s): a full parallel run needs more than the default 5 s
describe('the tour', { timeout: 15_000 }, () => {
  it('opening the sample offers it and holds the agent back; Skip closes the offer', () => {
    const stop = followSample()
    render(<App />)
    act(() => openSample({ fresh: true }))
    expect(useApp.getState().project.id).toBe('sample')
    expect(usePluginModes.getState().locks.agent).toMatch(/not available in this demo/)
    expect(screen.getByRole('tab', { name: /Agent/ })).toBeDisabled()
    const offer = screen.getByRole('dialog', { name: 'Take the tour?' })
    fireEvent.click(within(offer).getByRole('button', { name: 'Skip' }))
    expect(useTour.getState().offer).toBe(false)
    stop()
  })

  it('every step shows its anchor; Next does what a step asks; Finish ends it', async () => {
    render(<App />)
    act(() => openSample({ fresh: true, tour: true }))
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i]
      expect(useTour.getState().index, step.id).toBe(i)
      if (step.anchor) await waitFor(() => expect(document.querySelector(`[data-tour="${step.anchor}"]`), `${step.id}: [data-tour="${step.anchor}"]`).not.toBeNull())
      const card = screen.getByRole('dialog', { name: `Tour: ${step.title}` })
      // what Next does for the user leaves the step done (the next step may then change the view)
      if (step.act) {
        expect(within(card).getByRole('button', { name: /^Next/ })).toHaveTextContent('do it for me')
        act(() => step.act!())
        await waitFor(() => expect(step.done?.() ?? true, `${step.id} done by its act`).toBe(true))
      }
      fireEvent.click(within(card).getByRole('button', { name: /^(Next|Finish)/ }))
    }
    expect(useTour.getState().active).toBe(false)
  }, 20_000) // every step through the real app, Home at the end: over 5 s when the whole suite runs at once

  it('Chapters skips ahead; Exit leaves', () => {
    render(<App />)
    act(() => openSample({ fresh: true, tour: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Chapters ▾' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Smart blocks/ }))
    expect(STEPS[useTour.getState().index].chapter).toBe('Smart blocks')
    expect(useUi.getState().rail).toBe('blocks')
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.queryByRole('dialog', { name: /^Tour:/ })).toBeNull()
  })

  it('the optimizer leaves a block’s docks alone (BE.3): no step says it varies them (final review, Minor 5)', () => {
    const optimizer = STEPS.find((s) => s.title === '2 · With the optimizer')!
    expect(optimizer.body.join(' ')).not.toMatch(/docks/i)
  })
})

describe('the tour while the optimizer and the agent are coming soon (Decision "Coming soon")', () => {
  const HELD = ['tab-optimize', 'optimizer-on', 'optimizer-run', 'tab-agent']

  it('leaves out their steps, no remaining step points at them or promises them, and no chapter is empty', () => {
    usePluginModes.setState({ soon: COMING_SOON })
    const steps = stepsOf('tour')
    expect(steps.length).toBeLessThan(STEPS.length)
    for (const s of steps) {
      expect(HELD, s.id).not.toContain(s.anchor)
      expect(`${s.title} ${s.body.join(' ')}`, s.id).not.toMatch(/optimi[sz]|\bagent\b/i)
    }
    for (const c of chapters('tour')) expect(steps.some((s) => s.chapter === c), c).toBe(true)
    expect(chapters('tour')).toEqual([...new Set(steps.map((s) => s.chapter))])
  })

  it('every step that remains still shows its anchor, with the app as shipped', async () => {
    usePluginModes.setState({ soon: COMING_SOON })
    render(<App />)
    act(() => openSample({ fresh: true, tour: true }))
    const steps = stepsOf('tour')
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      expect(useTour.getState().index, step.id).toBe(i)
      if (step.anchor) await waitFor(() => expect(document.querySelector(`[data-tour="${step.anchor}"]`), `${step.id}: [data-tour="${step.anchor}"]`).not.toBeNull())
      const card = screen.getByRole('dialog', { name: `Tour: ${step.title}` })
      fireEvent.click(within(card).getByRole('button', { name: /^(Next|Finish)/ }))
    }
    expect(useTour.getState().active).toBe(false)
  }, 20_000)

  it('the sample’s lock alone leaves the steps in; with `soon` empty they are all there', () => {
    usePluginModes.setState({ soon: {}, locks: { agent: 'demo' } })
    expect(stepsOf('tour').map((s) => s.id)).toEqual(STEPS.map((s) => s.id))
    usePluginModes.setState({ locks: {} })
  })
})
