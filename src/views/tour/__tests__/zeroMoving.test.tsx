// From zero, chapter 5 — Moving it (spec 2026-11-10-from-zero-tutorial): the block turned a quarter, moved west and
// copied east, both copies inside the site.
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { centroid, pointInPolygon } from '../../../engine/geom/polygon.ts'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { useScreen } from '../../home/screen.ts'
import { useToast } from '../../layout/toast.ts'
import { useUi } from '../../layout/ui.ts'
import { useSiteImport } from '../../plan/site/importState.ts'
import { stepsOf, useTour } from '../tour.ts'
import { tutorialCopies } from '../zero/common.ts'
import { startZero } from '../zero/run.ts'
import { setTutorialSiteSource } from '../zero/siteFile.ts'

vi.mock('../../scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const bytes = () => {
  const b = readFileSync('public/tutorial/site.dxf')
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/** The angle of a polygon's longest edge, in degrees, 0–180. */
function axis(poly: Point[]): number {
  let best = { len: 0, deg: 0 }
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { len, deg: (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180 + 180) % 180 }
  })
  return best.deg
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

describe('chapter 5, moving it', { timeout: 60_000 }, () => {
  it('by Do it for me: turned a quarter, moved west, copied east; both inside the site', async () => {
    render(<App />)
    await act(() => startZero('Moving it'))
    const steps = stepsOf('zero')
    const from = steps.findIndex((s) => s.chapter === 'Moving it')
    const to = steps.findIndex((s) => s.chapter === 'Streets and circulation')
    expect(useTour.getState().index).toBe(from)
    for (let i = from; i < (to < 0 ? steps.length : to); i++) {
      const step = steps[useTour.getState().index]
      await screen.findByRole('dialog', { name: `Tour: ${step.title}` })
      if (step.anchor) expect(document.querySelector(`[data-tour="${step.anchor}"]`), step.id).not.toBeNull()
      await act(() => useTour.getState().doIt())
      if (step.done) expect(step.done(), step.id).toBe(true)
    }
    const { project: p, derived } = useApp.getState()
    const copies = tutorialCopies()
    expect(copies).toHaveLength(2)
    const halls = copies.map((id) => {
      const b = p.buildings.find((x) => x.id === id)!
      const levels = new Set(b.levels.map((l) => l.id))
      return derived.masses[p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))!.id].polygon
    })
    for (const h of halls) {
      expect(Math.abs(axis(h) - 90)).toBeLessThan(0.5)
      for (const v of h) expect(pointInPolygon(v, derived.site.polygon!)).toBe(true)
    }
    expect(centroid(halls[0]).x).toBeLessThan(centroid(halls[1]).x)
  })
})
