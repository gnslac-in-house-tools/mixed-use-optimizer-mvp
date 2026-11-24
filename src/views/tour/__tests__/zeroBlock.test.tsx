// From zero, chapter 3 — A block (spec 2026-11-10-from-zero-tutorial): a new block's six steps typed and locked, its
// front's docks taken away and put back by the dock rule (the two middle modules of each bay), a level door and a
// pattern.
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { generate } from '../../../modules/warehouse/engine/generate.ts'
import { edgeModules } from '../../../modules/warehouse/engine/shape.ts'
import { onDockRule } from '../../../modules/warehouse/engine/dockRule.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { stepsOf, useTour } from '../tour.ts'
import { TUTORIAL_BLOCK, tutorialType } from '../zero/common.ts'
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

describe('chapter 3, a block', { timeout: 60_000 }, () => {
  it('by Do it for me: the block typed and locked, its docks by the dock rule, a door and a pattern', async () => {
    render(<App />)
    await act(() => startZero('A block'))
    const steps = stepsOf('zero')
    const from = steps.findIndex((s) => s.chapter === 'A block')
    const to = steps.findIndex((s) => s.chapter === 'The block on the site')
    expect(useTour.getState().index).toBe(from)
    for (let i = from; i < (to < 0 ? steps.length : to); i++) {
      const step = steps[useTour.getState().index]
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    const t = tutorialType()!
    expect(t.name).toBe(TUTORIAL_BLOCK)
    expect(t.grid).toMatchObject({ x: 12, y: 12, modules: 4 })
    expect(t.hall).toMatchObject({ length: 180, width: 96 })
    expect(t.envelope.height).toBe(12)
    for (const s of ['grid', 'hall', 'columns', 'envelope', 'morphology', 'elements'] as const) expect(t.locks?.[s], s).toBe('locked')
    const g = generate(t)
    const front = g.edges.find((e) => e.side === 'front')!
    const span = edgeModules(front)
    const all = Array.from({ length: span.hi - span.lo }, (_, i) => span.lo + i)
    const docks = t.elements.filter((e) => e.kind === 'dock' && e.edge === front.id).map((e) => e.module).sort((a, b) => a - b)
    expect(docks.length).toBeGreaterThan(0)
    expect(docks).toEqual(onDockRule(g, front, all))
    expect(docks.length).toBeLessThan(all.length)
    expect(t.elements.filter((e) => e.kind === 'door')).toHaveLength(1)
    expect(t.elements.filter((e) => e.kind === 'pattern')).toHaveLength(1)
    expect(useUi.getState().dialog).toBeNull()
    expect(useApp.getState().project.warehouseTypes).toHaveLength(1)
  })
})
