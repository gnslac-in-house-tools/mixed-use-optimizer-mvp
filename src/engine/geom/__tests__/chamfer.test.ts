// The chamfer (Phase D.1): a corner cut by two ends, each set back along its own wall. Kept on the corner
// (`Vertex.chamfer = [a, b]`: a along the incoming wall, b along the outgoing one), as the radius is.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../model/schema.ts'
import { chamferEnds, maxChamfer } from '../chamfer.ts'
import { contourToPolygon, normalize, rawPolygon } from '../contour.ts'
import { moveVertex, moveWall, pushWall, setChamfer, setCornerRadius } from '../edit.ts'
import { area } from '../polygon.ts'
import { reflectContour } from '../reflect.ts'
import { contourSegments, isArc, reversed } from '../segments.ts'

/** A square from (0, 0), counter-clockwise: corners 0 (0,0), 1 (10,0), 2 (10,10), 3 (0,10); wall i runs from corner i. */
const square = (s = 10): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: s, y: 0, r: 0 },
    { x: s, y: s, r: 0 },
    { x: 0, y: s, r: 0 },
  ],
})

const near = (a: Point, b: Point, digits = 9) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
}
const has = (poly: Point[], p: Point) => expect(poly.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true)

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  expect(r.ok).toBe(true)
  return r as Extract<T, { ok: true }>
}

describe('setChamfer', () => {
  it('cuts a square’s corner: the polygon is the square less the triangle, s² − a·b/2', () => {
    const r = ok(setChamfer(square(), 2, 2, 3))
    expect(r.contour.vertices[2].chamfer).toEqual([2, 3])
    expect(area(contourToPolygon(r.contour))).toBeCloseTo(100 - 3, 9)
    const poly = rawPolygon(r.contour)
    expect(poly).toHaveLength(5)
    has(poly, { x: 10, y: 8 }) // 2 m down the incoming wall (the right one)
    has(poly, { x: 7, y: 10 }) // 3 m along the outgoing wall (the top one)
  })

  it('[0, 0] takes it away, and the field with it', () => {
    const cut = ok(setChamfer(square(), 2, 2, 3)).contour
    const r = ok(setChamfer(cut, 2, 0, 0))
    expect('chamfer' in r.contour.vertices[2]).toBe(false)
    expect(area(contourToPolygon(r.contour))).toBeCloseTo(100, 9)
  })

  it('is refused past maxChamfer, with the reason, and the contour stays', () => {
    const c = square()
    const r = setChamfer(c, 2, 11, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/does not fit at corner 3/)
    expect(r.contour).toBe(c)
    expect(setChamfer(c, 2, -1, 1).ok).toBe(false)
    expect(setChamfer(c, 2, Number.NaN, 1).ok).toBe(false)
  })

  it('a neighbour’s radius takes its room along the shared wall', () => {
    const c = square()
    c.vertices[1] = { ...c.vertices[1], r: 2 } // tangent length 2 along wall 1 (corner 1 → 2)
    expect(maxChamfer(c, 2)[0]).toBeCloseTo(8, 9)
    expect(setChamfer(c, 2, 8.5, 1).ok).toBe(false)
    expect(setChamfer(c, 2, 8, 1).ok).toBe(true)
  })

  it('takes the radius away, and a radius takes the chamfer away', () => {
    const rounded = ok(setCornerRadius(square(), 2, 1.5)).contour
    expect(rounded.vertices[2].r).toBe(1.5)
    const cut = ok(setChamfer(rounded, 2, 1, 1)).contour
    expect(cut.vertices[2].r).toBe(0)
    expect(cut.vertices[2].chamfer).toEqual([1, 1])
    const back = ok(setCornerRadius(cut, 2, 1.5)).contour
    expect(back.vertices[2].r).toBe(1.5)
    expect('chamfer' in back.vertices[2]).toBe(false)
    // a radius of 0 is no radius: the chamfer stays
    expect(ok(setCornerRadius(cut, 2, 0)).contour.vertices[2].chamfer).toEqual([1, 1])
  })

  it('does not apply next to an arc edge (as the radius does not)', () => {
    const c: Contour = { ...square(), arcs: { '1': -0.3 } }
    expect(maxChamfer(c, 2)).toEqual([0, 0])
    expect(setChamfer(c, 2, 1, 1).ok).toBe(false)
  })
})

describe('chamferEnds', () => {
  it('gives the two points on the walls', () => {
    const c = ok(setChamfer(square(), 2, 2, 3)).contour
    const e = chamferEnds(c, 2)!
    near(e.p1, { x: 10, y: 8 })
    near(e.p2, { x: 7, y: 10 })
    expect(chamferEnds(c, 0)).toBeNull()
  })
})

describe('a chamfer is a corner', () => {
  it('survives a wall pushed, as a radius does', () => {
    const c = ok(setChamfer(square(), 1, 2, 3)).contour
    const r = ok(pushWall(c, 1, 5)) // the right wall, 5 m out
    expect(r.contour.vertices[1].chamfer).toEqual([2, 3])
    expect(area(contourToPolygon(r.contour))).toBeCloseTo(150 - 3, 9)
    const m = ok(moveWall(c, 3, 5)) // the left wall, away from it
    expect(m.contour.vertices[1].chamfer).toEqual([2, 3])
  })

  it('shrinks, with a note, when the wall gets too short', () => {
    const c = ok(setChamfer(square(), 1, 2, 3)).contour // b = 3 along wall 1 (the right one)
    const r = ok(moveWall(c, 2, -8.5)) // the top wall down: the right wall is 1.5 m long
    expect(r.notes.join(' ')).toMatch(/chamfer reduced to 2\.00 × 1\.50 m at corner 2/)
    const [a, b] = r.contour.vertices[1].chamfer!
    expect(a).toBeCloseTo(2, 9)
    expect(b).toBeCloseTo(1.5, 9)
  })

  it('a wall that goes away is refused, chamfer or not', () => {
    expect(moveWall(ok(setChamfer(square(), 1, 2, 3)).contour, 2, -10).ok).toBe(false)
  })

  it('two chamfers and a radius share a wall’s length', () => {
    // wall 1 (corner 1 → 2) is 10 m: corner 1 takes 6 m of it with its chamfer, corner 2 takes 6 m with its radius (r 6, 90°)
    const c: Contour = square()
    c.vertices[1] = { ...c.vertices[1], chamfer: [1, 6] }
    c.vertices[2] = { ...c.vertices[2], r: 6 }
    const poly = rawPolygon(c)
    has(poly, { x: 10, y: 5 }) // both set back by 10 / 12 of what they asked
    const r = ok(moveVertex(c, 3, { x: 0, y: 10 })) // an edit that changes nothing: what does not fit is fitted
    expect(r.notes.join(' ')).toMatch(/radius reduced to 5\.00 m at corner 3/)
    expect(r.notes.join(' ')).toMatch(/chamfer reduced to 1\.00 × 5\.00 m at corner 2/)
    expect(r.contour.vertices[1].chamfer![1]).toBeCloseTo(5, 9)
    expect(r.contour.vertices[2].r).toBeCloseTo(5, 9)
    // two chamfers on one wall
    const d: Contour = square()
    d.vertices[1] = { ...d.vertices[1], chamfer: [1, 8] }
    d.vertices[2] = { ...d.vertices[2], chamfer: [8, 1] }
    const [p1, p2] = [chamferEnds(d, 1)!, chamferEnds(d, 2)!]
    near(p1.p2, { x: 10, y: 5 })
    near(p2.p1, { x: 10, y: 5 })
  })

  it('a corner with both a radius and a chamfer in its data draws the radius', () => {
    const c = square()
    c.vertices[2] = { ...c.vertices[2], r: 2, chamfer: [3, 3] }
    expect(chamferEnds(c, 2)).toBeNull()
    expect(Math.abs(area(contourToPolygon(c)) - (100 - (4 - Math.PI)))).toBeLessThan(0.05)
  })
})

describe('turned or mirrored, the ends swap', () => {
  it('normalize of a clockwise contour swaps a and b', () => {
    const cw: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 0, y: 10, r: 0 },
        { x: 10, y: 10, r: 0, chamfer: [2, 3] }, // 2 m along the top wall (incoming), 3 m down the right one
        { x: 10, y: 0, r: 0 },
      ],
    }
    const n = normalize(cw)
    const k = n.vertices.findIndex((v) => v.x === 10 && v.y === 10)
    expect(n.vertices[k].chamfer).toEqual([3, 2])
    // the same shape: the cut still ends 2 m along the top and 3 m down the right
    const poly = rawPolygon(n)
    has(poly, { x: 8, y: 10 })
    has(poly, { x: 10, y: 7 })
  })

  it('reversed() (the CAD plan’s other turn) swaps them too', () => {
    const c = ok(setChamfer(square(), 2, 2, 3)).contour
    const r = reversed(c)
    expect(r.vertices[1].chamfer).toEqual([3, 2])
    const poly = rawPolygon(r)
    has(poly, { x: 10, y: 8 })
    has(poly, { x: 7, y: 10 })
  })

  it('reflectContour keeps the cut where a mirror puts it, and twice is as it was', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 0, y: 10 } // the y axis
    const c = ok(setChamfer(square(), 2, 2, 3)).contour
    const m = reflectContour(c, a, b)
    const poly = rawPolygon(m)
    expect(area(poly)).toBeCloseTo(97, 9)
    has(poly, { x: -10, y: 8 })
    has(poly, { x: -7, y: 10 })
    const k = m.vertices.findIndex((v) => v.chamfer)
    expect(m.vertices[k].chamfer).toEqual([3, 2])
    expect(reflectContour(m, a, b)).toEqual(c)
  })
})

describe('contourSegments', () => {
  it('gives the chamfer as one line', () => {
    const segs = contourSegments(ok(setChamfer(square(), 2, 2, 3)).contour)
    expect(segs).toHaveLength(5)
    expect(segs.some(isArc)).toBe(false)
    const cut = segs.find((s) => Math.abs(s.a.x - 10) < 1e-9 && Math.abs(s.a.y - 8) < 1e-9)!
    near(cut.b, { x: 7, y: 10 })
  })
})
