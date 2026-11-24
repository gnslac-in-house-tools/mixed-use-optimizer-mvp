// What a reference line brings to the snap (Phase AS.5 task 2, Decision "Reference lines"): an open line that attracts by its points, its middles, the nearest point on
// it, the square from it and its crossings with other straight edges, and (the drafting bar's *Align* on) whose stretches run on past their ends as tracking lines. Hidden
// (its own eye, the kind's) or with its Snap-to entry off it attracts nothing, and the line being drawn or dragged does not attract itself. The Snap ▾'s old entry for the
// imported drawings reads *Drawing lines* and keeps its stored key (`references`); *Reference lines* is the new kind's (`referenceLines`, on by default).
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { footprintContour } from '../../../../engine/geom/footprint.ts'
import type { Point, Project } from '../../../../model/schema.ts'
import { actions } from '../../../../state/actions/index.ts'
import { demoProject } from '../../../../state/demo.ts'
import { REFERENCE_LINES, referenceLine } from '../../../layers/keys.ts'
import { SnapBar } from '../../SnapBar.tsx'
import { DEFAULT_SNAP, SNAP_TO, SNAP_TO_NAMES, type SnapTo } from '../kinds.ts'
import { shapeOf, snapMove, targetsOf, tolerances } from '../move.ts'
import { resolveSnap } from '../resolve.ts'
import { readSaved, STORAGE_KEY, useSnapSettings } from '../settings.ts'
import { drawnSources, sourcesFor } from '../sources.ts'

/** Two guides far from the demo's masses: r1 runs (200, 500) → (300, 500), r2 (250, 450) → (250, 550); they cross at (250, 500), r1's middle. */
function withLines(): Project {
  let p = demoProject()
  p = actions.addReferenceLine(p, [{ x: 200, y: 500 }, { x: 300, y: 500 }])!.project
  p = actions.addReferenceLine(p, [{ x: 250, y: 450 }, { x: 250, y: 550 }])!.project
  return p
}
const on = (extra: Partial<Record<SnapTo, boolean>> = {}): Record<SnapTo, boolean> => ({ references: false, referenceLines: true, contours: false, ...extra })
const drawn = (hidden: string[] = [], to = on()) => ({ to, hidden })
const labels = (p: Project, hidden: string[] = [], to = on(), skip: string[] = []) => drawnSources(p, drawn(hidden, to), skip).map((s) => s.label)

beforeEach(() => {
  localStorage.clear()
  useSnapSettings.setState({ settings: readSaved() })
})

describe('what a line brings', () => {
  it('each line is an open source named by its place, with its tracking and its crossings (neither is left out)', () => {
    const sources = drawnSources(withLines(), drawn())
    expect(sources.map((s) => [s.label, !!s.open])).toEqual([
      ['Reference line 1', true],
      ['Reference line 2', true],
    ])
    expect(sources.every((s) => s.track !== false && s.crossings !== false && !s.edgesOnly)).toBe(true)
  })

  it('its points, its middles and its crossing with another line attract', () => {
    const t = targetsOf(drawnSources(withLines(), drawn()))
    const has = (kind: string, p: Point) => t.points.some((q) => q.kind === kind && Math.abs(q.p.x - p.x) < 1e-9 && Math.abs(q.p.y - p.y) < 1e-9)
    expect(has('endpoint', { x: 200, y: 500 })).toBe(true)
    expect(has('endpoint', { x: 250, y: 550 })).toBe(true)
    expect(has('midpoint', { x: 250, y: 500 })).toBe(true)
    expect(has('midpoint', { x: 250, y: 450 + 50 })).toBe(true)
    expect(t.points.find((q) => q.kind === 'intersection')).toMatchObject({ p: { x: 250, y: 500 }, label: 'Reference line 1 × Reference line 2' })
    expect(t.edges).toHaveLength(2)
    expect(t.walls.every((w) => w.track !== false)).toBe(true)
  })

  it('hidden, by its own eye or its kind’s, it attracts nothing; with its Snap-to entry off, nothing either', () => {
    const p = withLines()
    expect(labels(p, [referenceLine('r1')])).toEqual(['Reference line 2'])
    expect(labels(p, [REFERENCE_LINES])).toEqual([])
    expect(labels(p, [], on({ referenceLines: false }))).toEqual([])
  })

  it('the line being drawn or dragged does not attract itself', () => {
    expect(labels(withLines(), [], on(), ['r2'])).toEqual(['Reference line 1'])
  })

  it('what the plan asks of the snap carries them (sourcesFor): the line dragged is left out by its id', () => {
    const p = withLines()
    const d = derive(p, 'o1')
    const levels = { level: 'l1', reference: [], drawn: drawn() }
    expect(sourcesFor(p, d, [], levels).filter((s) => s.label.startsWith('Reference line')).map((s) => s.label)).toEqual(['Reference line 1', 'Reference line 2'])
    expect(sourcesFor(p, d, ['r1'], levels).filter((s) => s.label.startsWith('Reference line')).map((s) => s.label)).toEqual(['Reference line 2'])
    // the Snap-to entry of the imported drawings does not touch them
    expect(sourcesFor(p, d, [], { ...levels, drawn: drawn([], on({ references: true, referenceLines: false })) }).some((s) => s.label.startsWith('Reference line'))).toBe(false)
  })
})

describe('a shape dragged near them', () => {
  /** A 10 × 10 mass, its corner (0, 0) moved by `delta`. */
  const shape = () => shapeOf(footprintContour({ kind: 'rect', center: { x: 5, y: 5 }, width: 10, depth: 10, rotation: 0 }))
  const snap = (delta: Point) => snapMove(delta, shape(), targetsOf(drawnSources(withLines(), drawn())), { ...DEFAULT_SNAP, grid: false }, tolerances(1))

  it('its corner sticks to the line’s point, its middle, and their crossing', () => {
    // r1's start (200, 500): the corner near it lands on it
    expect(snap({ x: 201, y: 499 }).delta).toEqual({ x: 200, y: 500 })
    // r2's end (250, 550)
    const end = snap({ x: 249, y: 551 })
    expect(end.delta).toEqual({ x: 250, y: 550 })
    expect(end.mark?.label).toContain('Reference line 2')
    // the crossing (250, 500) is also r1's middle: the corner lands there, whichever wins
    expect(snap({ x: 251, y: 499 }).delta).toEqual({ x: 250, y: 500 })
  })
})

describe('with Align on, a stretch runs past its ends', () => {
  const targets = () => targetsOf(drawnSources(withLines(), drawn()))
  const at = (q: Point, align: boolean) =>
    resolveSnap(q, { targets: targets(), settings: { ...DEFAULT_SNAP, grid: false, align }, tolPoint: 1, tolLine: 1, step: 0 })

  it('a point level with r1 and far past its end tracks it; with Align off nothing', () => {
    const on = at({ x: 400, y: 500.4 }, true)
    expect(on.how).toBe('tracking')
    expect(on.point.y).toBeCloseTo(500, 6)
    expect(on.mark?.lines?.map((l) => l.label)).toContain('wall of Reference line 1')
    expect(at({ x: 400, y: 500.4 }, false).how).toBe('free')
  })

  it('and r2’s runs on above and below it', () => {
    expect(at({ x: 250.3, y: 700 }, true).point.x).toBeCloseTo(250, 6)
  })
})

describe('the Snap ▾’s entries', () => {
  it('the old entry reads Drawing lines (its key stays), the new one Reference lines, then Contours', () => {
    expect(SNAP_TO).toEqual(['references', 'referenceLines', 'contours'])
    expect(SNAP_TO.map((k) => SNAP_TO_NAMES[k])).toEqual(['Drawing lines', 'Reference lines', 'Contours'])
    expect(DEFAULT_SNAP.to).toEqual({ references: true, referenceLines: true, contours: false })
  })

  it('each a yes or no, kept in this browser under its own key', () => {
    render(<SnapBar />)
    fireEvent.click(screen.getByRole('button', { name: /Snap kinds/ }))
    const drawing = screen.getByRole('menuitemcheckbox', { name: 'Drawing lines' })
    const refs = screen.getByRole('menuitemcheckbox', { name: 'Reference lines' })
    expect([drawing.getAttribute('aria-checked'), refs.getAttribute('aria-checked')]).toEqual(['true', 'true'])
    fireEvent.click(refs)
    expect(useSnapSettings.getState().settings.to).toEqual({ references: true, referenceLines: false, contours: false })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).to).toEqual({ references: true, referenceLines: false, contours: false })
  })

  it('a choice saved before this phase keeps its key: Drawing lines off stays off, Reference lines starts on', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ on: true, to: { references: false, contours: true } }))
    expect(readSaved().to).toEqual({ references: false, referenceLines: true, contours: true })
  })
})
