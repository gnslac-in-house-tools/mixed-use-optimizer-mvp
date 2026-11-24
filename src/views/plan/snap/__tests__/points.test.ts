// Ported from Plaza-Practiko `vistas/planta/iman/__tests__/motor.test.ts`. Plaza checks the reference points through
// `resolverIman` (the single-point tool, which arrives in 1.3c); here they are read with `nearestPoint`.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { DEFAULT_SNAP, type SnapKind, type SnapSettings } from '../kinds.ts'
import { edgesOf, movePoints, nearestPoint, ownPoints, snapPointsOf, snapShape, type Source } from '../points.ts'
import { straightWalls } from '../walls.ts'

const p = (x: number, y: number): Point => ({ x, y })
const rectC = (x0: number, y0: number, x1: number, y1: number): Contour =>
  contourFromPolygon([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)])
const box = (x0: number, y0: number, x1: number, y1: number, label: string, centroid = false): Source => ({
  contour: rectC(x0, y0, x1, y1),
  label,
  centroid,
})
const A = box(0, 0, 20, 10, 'A')
const B = box(30, 0, 40, 10, 'B')

function withKinds(kinds: Partial<Record<SnapKind, boolean>> = {}, changes: Partial<SnapSettings> = {}): SnapSettings {
  return { ...DEFAULT_SNAP, ...changes, kinds: { ...DEFAULT_SNAP.kinds, ...kinds } }
}

const near = (q: Point, sources: Source[], s = DEFAULT_SNAP) => nearestPoint(q, snapPointsOf(sources), s, 0.6)

describe('reference points', () => {
  it('endpoint: sticks to the corner and says whose it is', () => {
    expect(near(p(20.3, 10.2), [A, B])).toMatchObject({ p: p(20, 10), kind: 'endpoint', label: 'A' })
  })

  it('midpoint: the middle of an edge', () => {
    expect(near(p(10.2, 10.1), [A])).toMatchObject({ p: p(10, 10), kind: 'midpoint' })
  })

  it('at the same distance, endpoint beats midpoint', () => {
    expect(near(p(0.1, 0), [box(0, 0, 0.4, 10, 'Z')])?.kind).toBe('endpoint')
  })

  it('intersection: where the edges of two masses cross', () => {
    const r = near(p(15.2, 10.1), [A, box(15, 4, 25, 14, 'C')])!
    expect(r.kind).toBe('intersection')
    expect(r.p.x).toBeCloseTo(15, 9)
    expect(r.p.y).toBeCloseTo(10, 9)
    expect(r.label).toBe('A × C')
  })

  it('center: the centroid of a mass', () => {
    expect(near(p(10.2, 5.1), [box(0, 0, 20, 10, 'A', true)])).toMatchObject({ p: p(10, 5), kind: 'center', label: 'A' })
  })

  it('a kind switched off does not stick', () => {
    expect(near(p(20.3, 10.2), [A], withKinds({ endpoint: false }))?.kind).not.toBe('endpoint')
  })
})

describe('arcs and rounded corners', () => {
  // a 10 m square whose bottom edge is a half circle outwards: centre (5, 0), radius 5
  const arc: Source = { contour: { ...rectC(0, 0, 10, 10), arcs: { 0: -1 } }, label: 'Arc' }

  it('the centre of an arc edge, and its middle on the arc (not on the chord)', () => {
    expect(near(p(5.1, 0.1), [arc])?.kind).toBe('center')
    const m = near(p(5.1, -5.1), [arc])!
    expect(m.kind).toBe('midpoint')
    expect(m.p.y).toBeCloseTo(-5, 9)
  })

  it('a rounded corner gives the middle of its arc and its centre', () => {
    const c = rectC(0, 0, 10, 6)
    const rounded: Contour = { vertices: c.vertices.map((v, i) => (i === 2 ? { ...v, r: 2 } : v)) }
    const pts = snapPointsOf([{ contour: rounded, label: 'R' }])
    expect(pts).toContainEqual({ p: { x: 8, y: 4 }, kind: 'center', label: 'R' })
    const mid = pts.find((q) => q.kind === 'midpoint' && Math.hypot(q.p.x - 8 - Math.SQRT2, q.p.y - 4 - Math.SQRT2) < 1e-9)
    expect(mid).toBeDefined()
  })
})

describe('a chamfered corner', () => {
  it('gives the two ends of its cut as endpoints and the middle of the cut', () => {
    const c = rectC(0, 0, 10, 6)
    const cut: Contour = { vertices: c.vertices.map((v, i) => (i === 2 ? { ...v, chamfer: [2, 3] as [number, number] } : v)) }
    const pts = snapPointsOf([{ contour: cut, label: 'K' }])
    expect(pts).toContainEqual({ p: { x: 10, y: 4 }, kind: 'endpoint', label: 'K' })
    expect(pts).toContainEqual({ p: { x: 7, y: 6 }, kind: 'endpoint', label: 'K' })
    expect(pts).toContainEqual({ p: { x: 8.5, y: 5 }, kind: 'midpoint', label: 'K' })
  })
})

describe('a moving shape sticks by its points', () => {
  const square = (x: number, y: number) => rectC(x, y, x + 10, y + 10)
  const targets = () => snapPointsOf([box(0, 0, 20, 10, 'A', true)])

  it('the own endpoint closest to an endpoint of A: the correction joins them', () => {
    const r = snapShape(ownPoints(square(20.2, 10.1)), targets(), DEFAULT_SNAP, 0.6)
    expect(r?.from.kind).toBe('endpoint')
    expect(r?.to).toMatchObject({ kind: 'endpoint', label: 'A', p: p(20, 10) })
    expect(r!.correction.x).toBeCloseTo(-0.2, 9)
    expect(r!.correction.y).toBeCloseTo(-0.1, 9)
  })

  it('movePoints shifts; with the kind off, that own point looks for no partner', () => {
    const own = movePoints(ownPoints(square(0, 0)), p(5.2, 10.1))
    // the middle of the bottom edge (10.2, 10.1) next to the middle of A's top edge (10, 10)
    expect(snapShape(own, targets(), DEFAULT_SNAP, 0.6)).toMatchObject({ from: { kind: 'midpoint' }, to: { kind: 'midpoint' } })
    expect(snapShape(own, targets(), withKinds({ midpoint: false }), 0.6)).toBeNull()
  })

  it('snap off, or nothing near: null', () => {
    expect(snapShape(ownPoints(square(20.2, 10.1)), targets(), withKinds({}, { on: false }), 0.6)).toBeNull()
    expect(snapShape(ownPoints(square(50, 50)), targets(), DEFAULT_SNAP, 0.6)).toBeNull()
  })

  it('the own centre sticks to the centroid of another mass', () => {
    const r = snapShape(ownPoints(square(5.2, 0.1)), targets(), withKinds({ endpoint: false, midpoint: false }), 0.6)
    expect(r).toMatchObject({ from: { kind: 'center' }, to: { kind: 'center', p: p(10, 5) } })
  })
})

describe('open lines (Decision "Road snap")', () => {
  it('a road’s centreline: its points and the middles of its segments, no edge back from its end; a gate: one point', () => {
    const road: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 0 }, { x: 10, y: 10, r: 0 }] }
    const src: Source = { contour: road, label: 'road', open: true }
    const mids = snapPointsOf([src]).filter((q) => q.kind === 'midpoint').map((q) => q.p)
    expect(mids).toEqual([
      { x: 5, y: 0 },
      { x: 10, y: 5 },
    ])
    expect(edgesOf([src])).toHaveLength(2)
    expect(straightWalls(road, true)).toHaveLength(2)
    // closed, the same three points make a triangle
    expect(edgesOf([{ ...src, open: false }])).toHaveLength(3)
    const gate: Source = { contour: { vertices: [{ x: 3, y: 4, r: 0 }] }, label: 'gate', open: true }
    expect(snapPointsOf([gate])).toEqual([{ p: { x: 3, y: 4 }, kind: 'endpoint', label: 'gate' }])
    expect(edgesOf([gate])).toEqual([])
  })
})
