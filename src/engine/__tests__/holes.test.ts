// A mass's holes (Phase H.1, Decision "Holes and free geometry"; cases from Plaza-Practiko's `huecos.test.tsx`): cut out
// of its area and the figures, clipped to its outline (a warning when one leaves it), merged when they overlap; a mass
// in a court does not overlap the one round it; the verbs that move a mass carry its holes; a locked mass keeps them.
import { describe, expect, it } from 'vitest'
import { contourFromPolygon } from '../geom/contour.ts'
import { signedArea } from '../geom/polygon.ts'
import { derive } from '../derive.ts'
import type { Contour, Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { demoProject } from '../../state/demo.ts'
import { settle } from '../../state/settle.ts'

/** m1 of the demo: 160 × 80 m, x 40 → 200, y 70 → 150. */
const box = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ])
const withHoles = (p: Project, ...holes: Contour[]) => actions.updateMass(p, 'm1', { holes })
const holeIssues = (p: Project) => derive(p).issues.filter((i) => i.code === 'hole')

describe('holes in a mass', () => {
  const p = demoProject()
  const plain = derive(p)

  it('come out of its area, its footprint and its floor area; clockwise, as a region’s holes', () => {
    const q = withHoles(p, box(110, 100, 130, 120))
    const d = derive(q)
    expect(d.masses.m1.area).toBeCloseTo(12800 - 400, 6)
    expect(d.masses.m1.holes).toHaveLength(1)
    expect(signedArea(d.masses.m1.holes[0])).toBeLessThan(0)
    expect(d.metrics.builtFootprint).toBeCloseTo(plain.metrics.builtFootprint - 400, 6)
    expect(d.metrics.areaByProgram.warehouse).toBeCloseTo(plain.metrics.areaByProgram.warehouse - 400, 6)
    expect(holeIssues(q)).toEqual([])
  })

  it('one past the outline counts only inside it, and warns', () => {
    const q = withHoles(p, box(190, 100, 210, 120))
    expect(derive(q).masses.m1.area).toBeCloseTo(12800 - 200, 6)
    expect(holeIssues(q)).toEqual([expect.objectContaining({ severity: 'warning', massIds: ['m1'], message: 'Warehouse 1: a hole goes past its outline; only the part inside counts.' })])
  })

  it('two that overlap take the shared part out once; one under 1 m² does not count, without a word', () => {
    const q = withHoles(p, box(100, 100, 120, 120), box(110, 100, 130, 120), box(60, 80, 60.5, 80.5))
    const d = derive(q)
    expect(d.masses.m1.area).toBeCloseTo(12800 - 600, 6)
    expect(d.masses.m1.holes).toHaveLength(1)
    expect(holeIssues(q)).toEqual([])
  })

  it('a mass in a court does not overlap the mass round it', () => {
    const court = withHoles(p, box(90, 90, 150, 130))
    const q = actions.addMass(court, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 20, depth: 20, rotation: 0 } }).project
    expect(derive(q).issues.filter((i) => i.code === 'overlap' && i.massIds.includes('m1'))).toEqual([])
    const solid = actions.addMass(p, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 20, depth: 20, rotation: 0 } }).project
    expect(derive(solid).issues.some((i) => i.code === 'overlap' && i.massIds.includes('m1'))).toBe(true)
  })

  it('go with their mass when it moves, turns or is copied', () => {
    const q = withHoles(p, box(110, 100, 130, 120))
    const corner = (r: Project, id = 'm1') => r.masses.find((m) => m.id === id)!.holes![0].vertices[0]
    expect(corner(actions.moveMass(q, 'm1', { x: 10, y: -5 }))).toMatchObject({ x: 120, y: 95 })
    // a quarter turn round its centre (120, 110): (110, 100) goes to (130, 100)
    const turned = corner(actions.rotateMass(q, 'm1', 90))
    expect(turned.x).toBeCloseTo(130, 9)
    expect(turned.y).toBeCloseTo(100, 9)
    const copy = actions.copyMass(q, q.masses[0], { x: 0, y: 300 })
    expect(corner(copy.project, copy.id)).toMatchObject({ x: 110, y: 400 })
    expect(derive(copy.project).masses[copy.id].area).toBeCloseTo(12800 - 400, 6)
  })

  it('a locked mass keeps them', () => {
    const locked = actions.lockMasses(p, ['m1'], true)
    expect(settle(locked, withHoles(locked, box(110, 100, 130, 120)))).toEqual({ refused: 'Warehouse 1 is locked: unlock it to change its shape.' })
  })
})
