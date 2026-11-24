// Ported from Plaza-Practiko `motores/geom/__tests__/edicion.test.ts` (without fixed radii or shared walls),
// plus the rect resizing that GFit adds.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { contourToPolygon } from '../contour.ts'
import {
  insertVertex,
  moveRectCorner,
  moveRectWall,
  moveVertex,
  moveWall,
  moveWallLimited,
  pushWall,
  pushWallLimited,
  removeVertex,
  setCornerRadius,
  type RectFootprint,
} from '../edit.ts'
import { footprintContour } from '../footprint.ts'
import { area, isSimple } from '../polygon.ts'

function rect(x0: number, y0: number, w: number, h: number, r = 0): Contour {
  return {
    vertices: [
      { x: x0, y: y0, r },
      { x: x0 + w, y: y0, r },
      { x: x0 + w, y: y0 + h, r },
      { x: x0, y: y0 + h, r },
    ],
  }
}

// L: corner 3 (10, 8) is re-entrant and carries the radius
const ell: Contour = {
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 20, y: 0, r: 0 },
    { x: 20, y: 8, r: 0 },
    { x: 10, y: 8, r: 3 },
    { x: 10, y: 20, r: 0 },
    { x: 0, y: 20, r: 0 },
  ],
}

describe('moveWall', () => {
  it('moving the right wall of a 10 × 6 by 2 gives 12 × 6 and stretches the top and bottom walls', () => {
    const res = moveWall(rect(0, 0, 10, 6), 1, 2)
    expect(res.ok).toBe(true)
    const v = res.contour.vertices
    expect(v[1]).toMatchObject({ x: 12, y: 0 })
    expect(v[2]).toMatchObject({ x: 12, y: 6 })
    expect(v[0].x).toBeCloseTo(0, 6)
    expect(v[3].x).toBeCloseTo(0, 6)
    expect(area(contourToPolygon(res.contour))).toBeCloseTo(72, 6)
  })

  it('with radius 1 on all four corners the radii stay 1', () => {
    const res = moveWall(rect(0, 0, 10, 6, 1), 1, 2)
    expect(res.ok).toBe(true)
    for (const v of res.contour.vertices) expect(v.r).toBeCloseTo(1, 6)
    if (res.ok) expect(res.notes).toEqual([])
  })

  it('L with radius 3: when the neighbouring wall shrinks to 2 m the radius shrinks too, with a note', () => {
    const res = moveWall(ell, 1, -8)
    expect(res.ok).toBe(true)
    expect(res.contour.vertices[3].r).toBeCloseTo(2, 6)
    if (res.ok) expect(res.notes.some((a) => a.includes('radius reduced to 2.00 m'))).toBe(true)
  })

  it('moving 100 m inwards fails, and the limited move never flips the shape', () => {
    const r = rect(0, 0, 10, 6)
    expect(moveWall(r, 0, -100).ok).toBe(false)
    const lim = moveWallLimited(r, 0, -100)
    expect(lim.applied).toBeGreaterThan(-6)
    expect(lim.applied).toBeLessThan(-5.9)
    expect(area(contourToPolygon(lim.contour))).toBeGreaterThan(0)
    expect(lim.notes.length).toBeGreaterThan(0)
  })

  it('moveWallLimited applies the full d when it is valid', () => {
    const lim = moveWallLimited(rect(0, 0, 10, 6), 1, 2)
    expect(lim.applied).toBe(2)
    expect(lim.contour.vertices[1].x).toBeCloseTo(12, 6)
  })

  it('an arc edge keeps its bulge', () => {
    const res = moveWall({ ...rect(0, 0, 10, 6), arcs: { 2: 0.2 } }, 2, 1)
    expect(res.ok).toBe(true)
    expect(res.contour.arcs).toEqual({ 2: 0.2 })
    expect(res.contour.vertices[2].y).toBeCloseTo(7, 6)
  })
})

describe('pushWall (Decision "Square pull")', () => {
  // a 100 × 40 with a corner added on its bottom wall at x = 30 (a double-click there)
  const notched: Contour = {
    vertices: [
      { x: 0, y: 0, r: 0 },
      { x: 30, y: 0, r: 0 },
      { x: 100, y: 0, r: 0 },
      { x: 100, y: 40, r: 0 },
      { x: 0, y: 40, r: 0 },
    ],
  }
  const xy = (c: Contour) => c.vertices.map((v) => [Math.round(v.x * 1e6) / 1e6, Math.round(v.y * 1e6) / 1e6])

  it('the wall right of the added corner pushed in 10 m: the corner stays, a square step goes up from it (an L)', () => {
    const res = pushWall(notched, 1, -10)
    expect(res.ok).toBe(true)
    expect(xy(res.contour)).toEqual([[0, 0], [30, 0], [30, 10], [100, 10], [100, 40], [0, 40]])
    expect(area(contourToPolygon(res.contour))).toBeCloseTo(4000 - 700, 6)
  })

  it('out 10 m, the step goes down; the wall left of the corner the same way, its other end on the side wall', () => {
    expect(xy(pushWall(notched, 1, 10).contour)).toEqual([[0, 0], [30, 0], [30, -10], [100, -10], [100, 40], [0, 40]])
    expect(xy(pushWall(notched, 0, 10).contour)).toEqual([[0, -10], [30, -10], [30, 0], [100, 0], [100, 40], [0, 40]])
  })

  it('moveWall (the Ctrl drag) moves the added corner with the wall instead: the wall before it leans', () => {
    expect(xy(moveWall(notched, 1, -10).contour)).toEqual([[0, 0], [30, 10], [100, 10], [100, 40], [0, 40]])
  })

  it('a wall between square corners moves as moveWall does', () => {
    expect(pushWall(rect(0, 0, 10, 6), 1, 2)).toEqual(moveWall(rect(0, 0, 10, 6), 1, 2))
  })

  it('limited: a push under 1 cm cannot make its step; too far in, it stops where the shape still holds', () => {
    expect(pushWallLimited(notched, 1, -0.005).applied).toBe(0)
    const r = pushWallLimited(notched, 1, -60)
    expect(r.applied).toBeLessThan(-39)
    expect(r.applied).toBeGreaterThan(-40)
    expect(isSimple(contourToPolygon(r.contour))).toBe(true)
  })
})

describe('other edits', () => {
  it('insertVertex then removeVertex gives back the original', () => {
    const c = rect(0, 0, 10, 6, 1)
    const more = insertVertex(c, 0, { x: 4, y: 0 })
    expect(more.vertices).toHaveLength(5)
    expect(more.vertices[1]).toEqual({ x: 4, y: 0, r: 0 })
    const res = removeVertex(more, 1)
    expect(res.ok).toBe(true)
    expect(res.contour).toEqual(c)
  })

  it('removeVertex fails below 3 corners', () => {
    const five = insertVertex(rect(0, 0, 10, 6), 0, { x: 5, y: 0 })
    const res = removeVertex(removeVertex(five, 1).contour, 0)
    expect(res.ok).toBe(true)
    expect(res.contour.vertices).toHaveLength(3)
    expect(removeVertex(res.contour, 0).ok).toBe(false)
  })

  it('moveVertex rejects a shape that crosses itself', () => {
    expect(moveVertex(rect(0, 0, 10, 6), 2, { x: 12, y: 8 }).ok).toBe(true)
    expect(moveVertex(rect(0, 0, 10, 6), 2, { x: 5, y: -3 }).ok).toBe(false)
  })

  it('setCornerRadius rejects a radius that does not fit', () => {
    const ok = setCornerRadius(rect(0, 0, 10, 6), 0, 2)
    expect(ok.ok).toBe(true)
    expect(ok.contour.vertices[0]).toEqual({ x: 0, y: 0, r: 2 })
    expect(setCornerRadius(rect(0, 0, 10, 6, 3), 0, 4).ok).toBe(false)
  })

  it('a corner inserted near a rounded corner lands outside its tangent zone', () => {
    const more = insertVertex(rect(0, 0, 10, 10, 2), 0, { x: 1, y: 0 })
    expect(more.vertices[1].x).toBeGreaterThanOrEqual(2 - 1e-9)
    expect(more.vertices[1].y).toBeCloseTo(0, 9)
    const res = moveVertex(more, 1, { x: more.vertices[1].x, y: more.vertices[1].y })
    expect(res.ok).toBe(true)
    expect(res.contour.vertices[0].r).toBeCloseTo(2, 9)
    if (res.ok) expect(res.notes).toEqual([])
  })

  it('isSimple: a bow tie is not simple', () => {
    expect(isSimple(contourToPolygon(rect(0, 0, 10, 6)))).toBe(true)
    expect(isSimple([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false)
  })
})

describe('rect resizing (GFit)', () => {
  const box: RectFootprint = { kind: 'rect', center: { x: 50, y: 30 }, width: 100, depth: 60, rotation: 0 }

  it('the right wall moves out 10 m: 110 wide, the left wall stays', () => {
    const { footprint, applied } = moveRectWall(box, 1, 10)
    expect(applied).toBe(10)
    expect(footprint).toMatchObject({ width: 110, depth: 60, center: { x: 55, y: 30 } })
    expect(footprintContour(footprint).vertices[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('never thinner than 1 m: applied says how far it really went', () => {
    const { footprint, applied } = moveRectWall(box, 2, -100)
    expect(footprint.depth).toBe(1)
    expect(applied).toBe(-59)
  })

  it('rotated 90°: wall 1 faces north', () => {
    const { footprint } = moveRectWall({ ...box, rotation: 90 }, 1, 10)
    expect(footprint.center).toEqual({ x: 50, y: 35 })
  })

  it('a corner goes where it is dragged; the opposite corner stays', () => {
    // corner 2 (top-right, 100, 60) to (120, 70)
    const r = moveRectCorner(box, 2, { x: 120, y: 70 }, { x: 100, y: 60 })
    expect(r.exact).toBe(true)
    expect(r.footprint).toMatchObject({ width: 120, depth: 70, center: { x: 60, y: 35 } })
    expect(moveRectCorner(box, 2, { x: -50, y: 70 }, { x: 100, y: 60 }).exact).toBe(false)
  })
})
