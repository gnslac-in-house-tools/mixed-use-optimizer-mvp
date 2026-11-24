// From zero, chapter 4 — The block on the site (spec 2026-11-10-from-zero-tutorial): a copy placed inside the site,
// picked, and edited on the site as that copy alone — docks by the dock rule, a door, a pattern, a court of its own —
// while its type stays as it was.
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { centroid, pointInPolygon } from '../../../engine/geom/polygon.ts'
import { copyGenerated, copyOnPlan } from '../../../modules/warehouse/engine/copies.ts'
import { edgeModules } from '../../../modules/warehouse/engine/shape.ts'
import { onDockRule } from '../../../modules/warehouse/engine/dockRule.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { stepsOf, useTour } from '../tour.ts'
import { tutorialCopies, tutorialHall, tutorialType } from '../zero/common.ts'
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

describe('chapter 4, the block on the site', { timeout: 60_000 }, () => {
  it('by Do it for me: one copy inside the site, with its own docks by the rule, a door, a pattern and a court', async () => {
    render(<App />)
    await act(() => startZero('The block on the site'))
    const steps = stepsOf('zero')
    const from = steps.findIndex((s) => s.chapter === 'The block on the site')
    const to = steps.findIndex((s) => s.chapter === 'Moving it')
    expect(useTour.getState().index).toBe(from)
    const typeBefore = JSON.stringify(tutorialType())
    for (let i = from; i < (to < 0 ? steps.length : to); i++) {
      const step = steps[useTour.getState().index]
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    const p = useApp.getState().project
    expect(tutorialCopies()).toHaveLength(1)
    const hall = p.masses.find((m) => m.id === tutorialHall())!
    const site = useApp.getState().derived.site.polygon!
    expect(pointInPolygon(centroid(useApp.getState().derived.masses[hall.id].polygon), site)).toBe(true)
    // its type never changed
    expect(JSON.stringify(tutorialType())).toBe(typeBefore)
    const b = p.buildings.find((x) => x.id === tutorialCopies()[0])!
    const t = tutorialType()!
    const w = copyOnPlan(t, b.warehouse!, hall.footprint)
    const g = copyGenerated(t, w)
    const back = g.edges.find((e) => e.side === 'back')!
    const span = edgeModules(back)
    const all = Array.from({ length: span.hi - span.lo }, (_, i) => span.lo + i)
    const docks = g.doors.filter((d) => d.kind === 'dock' && d.edge === back.id).map((d) => d.module).sort((x, y) => x - y)
    expect(docks.length).toBeGreaterThan(0)
    expect(docks).toEqual(onDockRule(g, back, all))
    expect(g.doors.filter((d) => d.kind === 'door').length).toBe(t.elements.filter((e) => e.kind === 'door').length + 1)
    expect(g.doors.filter((d) => d.kind === 'pattern').length).toBe(t.elements.filter((e) => e.kind === 'pattern').length + 1)
    expect(b.warehouse!.overrides?.courts?.length).toBeGreaterThan(0)
  })
})
