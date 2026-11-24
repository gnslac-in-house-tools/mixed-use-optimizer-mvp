// The snap to the site's drawings (Phase DL.3, Decision "Drawing layers"): Snap ▾'s *Snap to* ▸ Drawing lines (called
// Reference lines until Phase AS.5; its stored key is still `references`; on by default) and Contours (off); a reference attracts by its corners, middles and edges and crosses nothing; a
// contour by its edges alone; what the tree hides attracts nothing; the choice is the viewer's, kept in this browser.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { drawingLayer as layerKey, parcel as parcelKey } from '../../../layers/keys.ts'
import { SnapBar } from '../../SnapBar.tsx'
import { DEFAULT_SNAP } from '../kinds.ts'
import { targetsOf } from '../move.ts'
import { readSaved, STORAGE_KEY, useSnapSettings } from '../settings.ts'
import { drawnSources } from '../sources.ts'

function site(): Project {
  const p = demoProject()
  return {
    ...p,
    site: {
      ...p.site,
      drawings: [
        {
          file: 'civil.dwg',
          layers: [
            // two lines that cross at (5, 0)
            { name: 'A-SITE', lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { points: [{ x: 5, y: -5 }, { x: 5, y: 5 }] }] },
            { name: 'ARBOLES', lines: [{ points: [{ x: 20, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 2 }], closed: true }] },
          ],
        },
      ],
      parcels: [{ name: 'AUX 1', contour: { vertices: [{ x: 0, y: 0, r: 0 }, { x: 4, y: 0, r: 0 }, { x: 4, y: 4, r: 0 }] } }],
      terrain: { contours: [{ points: [{ x: 0, y: 30 }, { x: 10, y: 30 }, { x: 20, y: 31 }], z: 100 }], points: [] },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useSnapSettings.setState({ settings: readSaved() })
})

describe('what the drawings bring to the snap', () => {
  it('Drawing lines: each layer’s lines and each parcel, by their points and edges, crossing nothing, no tracking', () => {
    const sources = drawnSources(site(), { to: { references: true, referenceLines: false, contours: false }, hidden: [] })
    expect(sources.map((s) => [s.label, !!s.open])).toEqual([
      ['A-SITE', true],
      ['A-SITE', true],
      ['ARBOLES', false],
      ['AUX 1', false],
    ])
    expect(sources.every((s) => s.track === false && s.crossings === false)).toBe(true)
    const t = targetsOf(sources)
    expect(t.points.some((q) => q.kind === 'endpoint' && q.p.x === 10 && q.p.y === 0)).toBe(true)
    // the two lines of A-SITE cross at (5, 0): no crossing is made of them
    expect(t.points.some((q) => q.kind === 'intersection')).toBe(false)
    expect(t.edges.length).toBe(1 + 1 + 3 + 3)
  })

  it('what the tree hides attracts nothing', () => {
    const sources = drawnSources(site(), { to: { references: true, referenceLines: false, contours: false }, hidden: [layerKey('civil.dwg', 'A-SITE'), parcelKey('AUX 1')] })
    expect(sources.map((s) => s.label)).toEqual(['ARBOLES'])
  })

  it('Contours: the ground’s contours by their edges alone, no points, no walls to line up with', () => {
    const sources = drawnSources(site(), { to: { references: false, referenceLines: false, contours: true }, hidden: [] })
    expect(sources.map((s) => [s.label, s.edgesOnly])).toEqual([['contour', true]])
    const t = targetsOf(sources)
    expect(t.points).toEqual([])
    expect(t.walls).toEqual([])
    expect(t.edges.length).toBe(2)
    expect(drawnSources(site(), { to: { references: false, referenceLines: false, contours: false }, hidden: [] })).toEqual([])
  })
})

describe('Snap to, in the Snap ▾ menu', () => {
  it('Drawing lines on and Contours off at first; each a yes or no, kept in this browser under the same key as before', () => {
    expect(DEFAULT_SNAP.to).toEqual({ references: true, referenceLines: true, contours: false })
    render(<SnapBar />)
    fireEvent.click(screen.getByRole('button', { name: /Snap kinds/ }))
    const refs = screen.getByRole('menuitemcheckbox', { name: 'Drawing lines' })
    const contours = screen.getByRole('menuitemcheckbox', { name: 'Contours' })
    expect([refs.getAttribute('aria-checked'), contours.getAttribute('aria-checked')]).toEqual(['true', 'false'])
    fireEvent.click(contours)
    fireEvent.click(refs)
    expect(useSnapSettings.getState().settings.to).toEqual({ references: false, referenceLines: true, contours: true })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).to).toEqual({ references: false, referenceLines: true, contours: true })
    // an older saved setting, with no Snap to, reads the defaults
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ on: true }))
    expect(readSaved().to).toEqual({ references: true, referenceLines: true, contours: false })
  })
})
