// The tours' steps that point at a Tools strip button (`tool-…`; tour/anchors.ts, TourCard.tsx): with the strip hidden before,
// the step shows it (its `before`, in both tutorials), and the card scrolls the button into view once it is drawn.
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { openSample } from '../../layout/files.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { pointsAtTool } from '../anchors.ts'
import { STEPS } from '../steps.ts'
import { useTour } from '../tour.ts'
import { ZERO_STEPS } from '../zero/index.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const anchor = (a: string) => document.querySelector(`[data-tour="${a}"]`)
const hideTools = () => useUi.setState({ show: { ...useUi.getState().show, tools: false } })

beforeEach(() => {
  localStorage.clear()
  useScreen.setState({ home: false })
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null })
  useToast.setState({ toast: null, confirmation: null })
  useTour.setState({ offer: false, active: false, index: 0, tutorial: 'tour' })
})
afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe('a step that points at a tool shows the strip first', () => {
  for (const [name, steps] of [['the sample tour', STEPS], ['From zero', ZERO_STEPS]] as const) {
    it(`${name}: each tool-… step's before shows a hidden strip (and there is at least one)`, () => {
      const tool = steps.filter(pointsAtTool)
      expect(tool.length).toBeGreaterThan(0)
      for (const step of tool) {
        hideTools()
        // what the step sets after that needs its own project: only the strip is asked here
        try {
          step.before?.()
        } catch {
          // ignored: the strip is shown before anything else
        }
        expect(useUi.getState().show.tools, step.id).toBe(true)
      }
    })

    it(`${name}: a step with another anchor leaves the strip as it was`, () => {
      for (const step of steps.filter((s) => !pointsAtTool(s) && s.before)) {
        hideTools()
        try {
          step.before!()
        } catch {
          // ignored
        }
        expect(useUi.getState().show.tools, step.id).toBe(false)
      }
    })
  }
})

describe('on screen', { timeout: 20_000 }, () => {
  it('the sample tour: with the strip hidden, going to a tool step finds its button, and the card scrolls it into view', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<App />)
    act(() => openSample({ fresh: true, tour: true }))
    expect(useApp.getState().project.id).toBe('sample')
    const at = STEPS.findIndex(pointsAtTool)
    for (const [i, step] of STEPS.entries()) {
      if (!pointsAtTool(step)) continue
      act(() => hideTools())
      expect(anchor(step.anchor!), `${step.id} hidden`).toBeNull()
      act(() => useTour.getState().goTo(i))
      await waitFor(() => expect(anchor(step.anchor!), step.id).not.toBeNull())
    }
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' }))
    expect(at).toBeGreaterThanOrEqual(0)
  })

  it('a card in a window with no scrollIntoView (jsdom) does not throw', async () => {
    render(<App />)
    act(() => openSample({ fresh: true, tour: true }))
    const i = STEPS.findIndex(pointsAtTool)
    act(() => hideTools())
    act(() => useTour.getState().goTo(i))
    await waitFor(() => expect(anchor(STEPS[i].anchor!)).not.toBeNull())
  })
})
