// A truck court as a viewport reads it (Phase D.3, task 6): the wall's frame is a mirror of the plan, so a court that runs counter-clockwise in it runs
// clockwise on the plan; the shape engine's handles need counter-clockwise, so the court is re-wound on its way out and back.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../../model/schema.ts'
import { arcBox, rawPolygon } from '../../../../engine/geom/contour.ts'
import { signedArea } from '../../../../engine/geom/polygon.ts'
import { mirrored, wallSide } from '../courts.ts'

const reflect = (q: Point): Point => ({ x: q.x, y: -q.y })
const round = (q: Point) => `${Math.round(q.x * 1e6) / 1e6},${Math.round(q.y * 1e6) / 1e6}`

/** A court 20 × 10 with a chamfer on its corner on the wall at x 20 (3 back along the wall before it, 5 along the one after) and an arc on its far edge. */
const court: Contour = {
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 20, y: 0, r: 0, chamfer: [3, 5] },
    { x: 20, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
  arcs: { '2': 0.1 },
}

describe('a contour seen through a mirror', () => {
  it('runs counter-clockwise again: the same shape, its corners reversed', () => {
    const m = mirrored(court, reflect)
    expect(signedArea(rawPolygon(court))).toBeGreaterThan(0)
    expect(signedArea(rawPolygon(m))).toBeGreaterThan(0)
    expect(Math.abs(signedArea(rawPolygon(m)))).toBeCloseTo(Math.abs(signedArea(rawPolygon(court))), 6)
    // every point of the mirrored outline is a point of the original's, reflected
    const was = new Set(rawPolygon(court).map((q) => round(reflect(q))))
    expect(rawPolygon(m).every((q) => was.has(round(q)))).toBe(true)
    expect(m.vertices.map((v) => round(v))).toEqual([...court.vertices].reverse().map((v) => round(reflect(v))))
  })

  it('swaps a chamfer’s set-backs (the walls before and after swap) and re-keys its arcs', () => {
    const m = mirrored(court, reflect)
    // the chamfered corner is corner 1, which becomes corner 4 - 1 - 1 = 2
    expect(m.vertices[2].chamfer).toEqual([5, 3])
    // edge 2 becomes edge (4 - 2 - 2) = 0
    expect(m.arcs).toEqual({ '0': 0.1 })
  })

  it('keeps an arc’s extent: its box is the original box reflected', () => {
    const m = mirrored(court, reflect)
    const a = arcBox(court)
    const b = arcBox(m)
    expect(b.x0).toBeCloseTo(a.x0, 6)
    expect(b.x1).toBeCloseTo(a.x1, 6)
    expect(b.y0).toBeCloseTo(-a.y1, 6)
    expect(b.y1).toBeCloseTo(-a.y0, 6)
  })

  it('twice is the contour it was', () => {
    const back = mirrored(mirrored(court, reflect), reflect)
    expect(back.vertices.map((v) => [v.x, v.y, v.r, v.chamfer])).toEqual(court.vertices.map((v) => [v.x, Math.abs(v.y) === 0 ? 0 : v.y, v.r, v.chamfer]))
    expect(back.arcs).toEqual(court.arcs)
  })
})

describe('a court’s wall side', () => {
  it('the edges on the wall: both ends on y = 0, no arc, a centimetre long', () => {
    expect(wallSide(court)).toEqual([0])
    // an arc on the wall's edge makes it no wall side
    expect(wallSide({ ...court, arcs: { '0': 0.1 } })).toEqual([])
  })
})
