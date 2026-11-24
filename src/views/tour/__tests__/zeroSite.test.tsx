// From zero, chapters 1–2 (spec 2026-11-10-from-zero-tutorial): a new project, then the site from the tutorial's own
// drawing (public/tutorial/site.dxf, scripts/tutorial-site.mjs) — its layers guessed right, the scratch layer filtered
// out, the neighbours kept as a reference.
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { area } from '../../../engine/geom/polygon.ts'
import { readSiteFile } from '../../../io/site/siteFile.ts'
import { surveyLayers } from '../../../io/site/survey.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { stepsOf, useTour } from '../tour.ts'
import { startZero, TUTORIAL_PROJECT } from '../zero/run.ts'
import { openTutorialSite, setTutorialSiteSource } from '../zero/siteFile.ts'

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

describe('the tutorial’s site file', () => {
  it('its layers are guessed as the tutorial says', async () => {
    const f = await readSiteFile('site.dxf', bytes())
    if (f.kind !== 'drawing') throw new Error('a drawing')
    const guess = Object.fromEntries(surveyLayers(f.drawing).map((l) => [l.name, l.guess]))
    expect(guess).toMatchObject({
      BOUNDARY: 'boundary',
      CONTOURS: 'contours',
      'C-ROAD-CNTR': 'roads',
      NEIGHBOURS: 'reference',
      'TEXT-NOTES': 'ignore',
      'Z-SCRATCH': 'reference',
    })
  })

  it('a file that will not load says so, and nothing is imported', async () => {
    setTutorialSiteSource(() => Promise.reject(new Error('offline')))
    await act(() => openTutorialSite())
    expect(useToast.getState().toast?.text).toMatch(/Could not load the tutorial’s site file/)
    expect(useSiteImport.getState().pending).toBeNull()
  })
})

describe('chapters 1–2 by Do it for me', { timeout: 30_000 }, () => {
  it('from Home to My first project on its site; every step shows what it points at', async () => {
    render(<App />)
    await act(() => startZero())
    const steps = stepsOf('zero')
    const end = steps.findIndex((s) => s.chapter === 'A block')
    for (let i = 0; i < (end < 0 ? steps.length : end); i++) {
      const step = steps[useTour.getState().index]
      // the card and what it points at
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    const site = useApp.getState().project.site
    expect(useApp.getState().project.name).toBe(TUTORIAL_PROJECT)
    expect(area(site.boundary!.vertices) / 10_000).toBeGreaterThan(15)
    expect(area(site.boundary!.vertices) / 10_000).toBeLessThan(17)
    expect(site.terrain).toBeDefined()
    expect(site.existingRoads).toHaveLength(1)
    expect(JSON.stringify(site.drawings)).toContain('NEIGHBOURS')
    expect(JSON.stringify(site.drawings ?? [])).not.toContain('Z-SCRATCH')
  })

  it('the import step offers the tutorial’s own file', async () => {
    render(<App />)
    await act(() => startZero('The site from a drawing'))
    expect(await screen.findByRole('button', { name: 'Use the tutorial’s site file' })).toBeInTheDocument()
  })

  it('Import done for a site that came from another file: no throw', async () => {
    render(<App />)
    await act(() => startZero('The site from a drawing'))
    const commit = stepsOf('zero').find((s) => s.id === 'zero-commit')!
    await act(async () => {
      await commit.act?.()
    })
    expect(useApp.getState().project.site.boundary).not.toBeNull()
  })
})
