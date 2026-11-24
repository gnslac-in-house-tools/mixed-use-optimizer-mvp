// Which snap wins when a whole mass moves: point pair → walls → grid (Plaza-Practiko's order), and what attracts.
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { derive } from '../../../../engine/derive.ts'
import { addLevelAtEnd } from '../../../../state/actions/levels.ts'
import { addMass } from '../../../../state/actions/masses.ts'
import { demoProject } from '../../../../state/demo.ts'
import { DEFAULT_SNAP, type SnapSettings } from '../kinds.ts'
import { shapeOf, snapMove, targetsOf } from '../move.ts'
import { sourcesFor } from '../sources.ts'
import { addLot } from '../../../../modules/parking/actions.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rectC = (x0: number, y0: number, x1: number, y1: number) => contourFromPolygon([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)])
const tol = { point: 0.6, line: 0.5 }
const settings = (changes: Partial<SnapSettings>): SnapSettings => ({ ...DEFAULT_SNAP, ...changes })

describe('snapMove', () => {
  // A is 0..20 × 0..10; the moving 10 × 10 square starts at x = 40
  const targets = targetsOf([{ contour: rectC(0, 0, 20, 10), label: 'A', centroid: true }])
  const shape = shapeOf(rectC(40, 0, 50, 10))

  it('a point pair wins over walls and grid', () => {
    // the square's bottom-left corner arrives at (20.2, 0.1), next to A's corner (20, 0)
    const r = snapMove(p(-19.8, 0.1), shape, targets, DEFAULT_SNAP, tol)
    expect(r.delta.x).toBeCloseTo(-20)
    expect(r.delta.y).toBeCloseTo(0)
    expect(r.mark).toMatchObject({ kind: 'endpoint', at: p(20, 0), label: 'Endpoint → Endpoint · A' })
  })

  it('no pair near: the walls line up, and along them the grid decides', () => {
    // the square lands at 29.7..39.7 × 0.2..10.2: its bottom wall lines up with A's; its corner goes to x = 30
    const r = snapMove(p(-10.3, 0.2), shape, targets, DEFAULT_SNAP, tol)
    expect(r.delta.x).toBeCloseTo(-10)
    expect(r.delta.y).toBeCloseTo(0)
    expect(r.mark).toMatchObject({ kind: null, label: 'Aligned · A' })
    expect(r.mark?.guides).toHaveLength(1)
  })

  it('Align off, or snap off: only the grid', () => {
    for (const s of [settings({ align: false }), settings({ on: false })]) {
      const r = snapMove(p(-10.3, 0.4), shape, targets, s, tol)
      expect(r).toEqual({ delta: p(-10, 0), mark: null })
    }
  })

  it('snap and grid off: the raw offset', () => {
    expect(snapMove(p(-19.8, 0.1), shape, targets, settings({ on: false, grid: false }), tol)).toEqual({ delta: p(-19.8, 0.1), mark: null })
  })
})

describe('sourcesFor', () => {
  it('the other masses, the site and the setback; never the dragged mass', () => {
    const project = demoProject()
    const labels = sourcesFor(project, derive(project), 'm1').map((s) => s.label)
    expect(labels).not.toContain('Warehouse 1')
    expect(labels).toEqual(expect.arrayContaining(['Warehouse 2', 'Office 1', 'site', 'setback']))
  })

  it('with levels: the masses of the active level and of the reference (named with its level)', () => {
    let project = demoProject()
    const up = addLevelAtEnd(project, 'above')
    project = addMass(up.project, { programId: null, footprint: project.masses[0].footprint, name: 'Roof', levelId: up.id }).project
    const on1 = sourcesFor(project, derive(project), null, { level: 'l1', reference: [] }).map((s) => s.label)
    expect(on1).toEqual(expect.arrayContaining(['Warehouse 1', 'Warehouse 2', 'Office 1']))
    expect(on1).not.toContain('Roof')
    const withRef = sourcesFor(project, derive(project), null, { level: 'l1', reference: [up.id] }).map((s) => s.label)
    expect(withRef).toContain('Roof (L2)')
    const on2 = sourcesFor(project, derive(project), null, { level: up.id, reference: [] }).map((s) => s.label)
    expect(on2).toContain('Roof')
    expect(on2).not.toContain('Warehouse 1')
  })

  it('the truck courts and the parking lots as the plan shows them, but those of the masses dragged; the site and the setback do not track (Decision "Snap first to what is drawn")', () => {
    const project = addLot(demoProject(), 'o1', { anchor: { massId: 'm1', side: 't1' }, rows: 2 })!.project
    const d = derive(project, 'o1')
    const all = sourcesFor(project, d)
    const courts = (s: typeof all) => s.filter((x) => x.label === 'truck court').length
    expect(courts(all)).toBe(d.circulation.docks.length)
    expect(courts(all)).toBeGreaterThan(0)
    expect(all.map((s) => s.label)).toContain('Lot 1')
    // m1 dragged: its courts and its lot go with it
    const dragged = sourcesFor(project, d, 'm1')
    expect(courts(dragged)).toBe(d.circulation.docks.filter((k) => k.massId !== 'm1').length)
    expect(dragged.map((s) => s.label)).not.toContain('Lot 1')
    expect(all.filter((s) => s.label === 'site' || s.label === 'setback').every((s) => s.track === false)).toBe(true)
  })

  it('with no setback, the setback line is the boundary: not added twice', () => {
    const project = demoProject()
    project.site.rules.setback = 0
    expect(sourcesFor(project, derive(project)).map((s) => s.label)).not.toContain('setback')
  })
})
