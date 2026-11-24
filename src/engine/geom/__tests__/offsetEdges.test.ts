// A contour's edges moved along their normals, each by its own distance (Phase D.2, task 1): the face of a block from its
// reference line, and back.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { arcOfEdge, bulges, contourToPolygon } from '../contour.ts'
import { insetEdges, offsetEdges } from '../offsetEdges.ts'
import { area } from '../polygon.ts'

const square = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 10, y: 0, r: 0 },
    { x: 10, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
})
/** Counter-clockwise: the bottom 20 m, the top 10 m, the right wall angled. */
const trapezoid = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 20, y: 0, r: 0 },
    { x: 14, y: 8, r: 0 },
    { x: 0, y: 8, r: 0 },
  ],
})

/** Distance of point p from the line through a and b. */
const lineDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / l
}
const same = (a: Contour, b: Contour, tol = 1e-9) => {
  expect(a.vertices).toHaveLength(b.vertices.length)
  a.vertices.forEach((v, i) => {
    expect(v.x).toBeCloseTo(b.vertices[i].x, -Math.log10(tol))
    expect(v.y).toBeCloseTo(b.vertices[i].y, -Math.log10(tol))
  })
  const ba = bulges(a)
  const bb = bulges(b)
  ba.forEach((x, i) => expect(Math.abs(x - bb[i])).toBeLessThan(tol * 10))
}

describe('offsetEdges', () => {
  it('a square by [1, 1, 1, 1] is the square grown by 1 m', () => {
    const o = offsetEdges(square(), [1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (!o) return
    same(o, { vertices: [{ x: -1, y: -1, r: 0 }, { x: 11, y: -1, r: 0 }, { x: 11, y: 11, r: 0 }, { x: -1, y: 11, r: 0 }] })
  })

  it('each edge by its own distance, negative goes in', () => {
    const o = offsetEdges(square(), [2, 0, -1, 3])
    expect(o).not.toBeNull()
    if (!o) return
    // bottom edge moved 2 down, right stays, top 1 down, left 3 out
    same(o, { vertices: [{ x: -3, y: -2, r: 0 }, { x: 10, y: -2, r: 0 }, { x: 10, y: 9, r: 0 }, { x: -3, y: 9, r: 0 }] })
  })

  it('a trapezoid with one angled edge: every new edge is parallel to its old one, at its distance', () => {
    const t = trapezoid()
    const d = [1, 0.5, 2, 1.5]
    const o = offsetEdges(t, d)
    expect(o).not.toBeNull()
    if (!o) return
    t.vertices.forEach((a, i) => {
      const b = t.vertices[(i + 1) % 4]
      const p = o.vertices[i]
      const q = o.vertices[(i + 1) % 4]
      // parallel: both new corners at the same distance from the old line, outwards by d[i]
      expect(lineDist(p, a, b)).toBeCloseTo(Math.abs(d[i]), 9)
      expect(lineDist(q, a, b)).toBeCloseTo(Math.abs(d[i]), 9)
    })
    expect(area(contourToPolygon(o))).toBeGreaterThan(area(contourToPolygon(t)))
  })

  it('an arc edge keeps its centre (its bulge follows)', () => {
    // the bottom wall bulges out, a shallow arc (not tangent to the sides)
    const c: Contour = { ...square(), arcs: { 0: -0.4 } }
    const before = arcOfEdge(c.vertices[0], c.vertices[1], -0.4)
    const o = offsetEdges(c, [1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (!o) return
    const after = arcOfEdge(o.vertices[0], o.vertices[1], bulges(o)[0])
    expect(after.center.x).toBeCloseTo(before.center.x, 9)
    expect(after.center.y).toBeCloseTo(before.center.y, 9)
    // an outward arc: its radius grows by the distance
    expect(after.radius).toBeCloseTo(before.radius + 1, 9)
    expect(bulges(o)[0]).toBeLessThan(0)
  })

  it('an arc that bulges in: its radius shrinks by the distance out', () => {
    const c: Contour = { ...square(), arcs: { 0: 0.4 } }
    const before = arcOfEdge(c.vertices[0], c.vertices[1], 0.4)
    const o = offsetEdges(c, [1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (!o) return
    const after = arcOfEdge(o.vertices[0], o.vertices[1], bulges(o)[0])
    expect(after.center.x).toBeCloseTo(before.center.x, 9)
    expect(after.radius).toBeCloseTo(before.radius - 1, 9)
    expect(bulges(o)[0]).toBeGreaterThan(0)
  })

  it('a half circle tangent to its neighbours stays tangent', () => {
    const c: Contour = { ...square(), arcs: { 0: -1 } }
    const o = offsetEdges(c, [0.5, 0.5, 0.5, 0.5])
    expect(o).not.toBeNull()
    if (!o) return
    expect(o.vertices[0].x).toBeCloseTo(-0.5, 6)
    expect(o.vertices[0].y).toBeCloseTo(0, 6)
    expect(o.vertices[1].x).toBeCloseTo(10.5, 6)
    expect(o.vertices[1].y).toBeCloseTo(0, 6)
    expect(bulges(o)[0]).toBeCloseTo(-1, 6)
  })

  it('a chamfer and a radius stay on their corners', () => {
    const c: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0, chamfer: [2, 3] },
        { x: 10, y: 0, r: 1.5 },
        { x: 10, y: 10, r: 0 },
        { x: 0, y: 10, r: 0 },
      ],
    }
    const o = offsetEdges(c, [1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (!o) return
    expect(o.vertices[0].chamfer).toEqual([2, 3])
    expect(o.vertices[1].r).toBe(1.5)
    expect(o.vertices[2].r).toBe(0)
  })

  it('parallel neighbours keep their corner (a corner on a straight wall)', () => {
    const c: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 5, y: 0, r: 0 },
        { x: 10, y: 0, r: 0 },
        { x: 10, y: 10, r: 0 },
        { x: 0, y: 10, r: 0 },
      ],
    }
    const o = offsetEdges(c, [1, 1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (!o) return
    expect(o.vertices[1].x).toBeCloseTo(5, 9)
    expect(o.vertices[1].y).toBeCloseTo(-1, 9)
  })

  it('an offset that makes no simple polygon answers null', () => {
    // the square shrunk by 6 on every side: every edge reversed
    expect(offsetEdges(square(), [-6, -6, -6, -6])).toBeNull()
    // a thin bar: one long side moved through the other
    expect(offsetEdges(square(), [-11, 0, 0, 0])).toBeNull()
    // a radius that vanishes
    expect(offsetEdges({ ...square(), arcs: { 0: 0.4 } }, [30, 0, 0, 0])).toBeNull()
  })

  it('a distance list of the wrong length answers null', () => {
    expect(offsetEdges(square(), [1, 1])).toBeNull()
  })
})

describe('insetEdges', () => {
  it('is the inverse of offsetEdges: a round trip is the contour within 1e-9', () => {
    const t = trapezoid()
    const d = [0.3, 0.5, 0.45, 0.3]
    const out = offsetEdges(t, d)
    expect(out).not.toBeNull()
    if (!out) return
    const back = insetEdges(out, d)
    expect(back).not.toBeNull()
    if (back) same(back, t)
  })

  it('round trip with an arc edge, a chamfer and a radius', () => {
    const c: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 24, y: 0, r: 0 },
        { x: 24, y: 12, r: 2 },
        { x: 8, y: 18, r: 0, chamfer: [1, 1] },
        { x: 0, y: 12, r: 0 },
      ],
      arcs: { 0: -0.3 },
    }
    const d = [0.3, 0.3, 0.5, 0.3, 0.4]
    const out = offsetEdges(c, d)
    expect(out).not.toBeNull()
    if (!out) return
    const back = insetEdges(out, d)
    expect(back).not.toBeNull()
    if (!back) return
    same(back, c)
    expect(back.vertices[2].r).toBe(2)
    expect(back.vertices[3].chamfer).toEqual([1, 1])
  })

  it('an inset is the negative offset: the square less 1 m', () => {
    const o = insetEdges(square(), [1, 1, 1, 1])
    expect(o).not.toBeNull()
    if (o) same(o, { vertices: [{ x: 1, y: 1, r: 0 }, { x: 9, y: 1, r: 0 }, { x: 9, y: 9, r: 0 }, { x: 1, y: 9, r: 0 }] })
    expect(insetEdges(square(), [6, 6, 6, 6])).toBeNull()
  })
})
