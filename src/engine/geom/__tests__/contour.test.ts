// Ported from Plaza-Practiko `motores/geom/__tests__/contorno.test.ts`: same inputs, same expected results.
// If these pass, the port behaves like the original.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { contourFromPolygon, contourFromSpans, contourToPolygon, cornerArc, maxRadius, tangentLength, turnAt, type Span } from '../contour.ts'
import { area, signedArea } from '../polygon.ts'

function rect(w: number, h: number, r = 0): Contour {
  return {
    vertices: [
      { x: 0, y: 0, r },
      { x: w, y: 0, r },
      { x: w, y: h, r },
      { x: 0, y: h, r },
    ],
  }
}

describe('contour', () => {
  it('a 10 × 10 square with radius 2 on all four corners has area 100 − 4·(4 − π)', () => {
    const c = rect(10, 10, 2)
    expect(Math.abs(area(contourToPolygon(c)) - (100 - 4 * (4 - Math.PI)))).toBeLessThan(0.05)
    expect(signedArea(contourToPolygon(c))).toBeGreaterThan(0)
  })

  it('chords stay within the sagitta tolerance of the arc', () => {
    const c = rect(10, 10, 2)
    const center = { x: 8, y: 8 }
    const p = contourToPolygon(c).filter((q) => q.x > 8 && q.y > 8)
    expect(p.length).toBeGreaterThan(1)
    for (const q of p) expect(Math.abs(Math.hypot(q.x - center.x, q.y - center.y) - 2)).toBeLessThanOrEqual(0.02)
  })

  it('bulge −1 on the bottom edge of a unit square bulges outwards (area 1 + π/8)', () => {
    const c: Contour = { ...rect(1, 1), arcs: { 0: -1 } }
    const p = contourToPolygon(c, 0.0005)
    expect(Math.min(...p.map((q) => q.y))).toBeCloseTo(-0.5, 3)
    expect(area(p)).toBeCloseTo(1 + Math.PI / 8, 6)
    // bulge +1 bulges inwards
    const d: Contour = { ...rect(1, 1), arcs: { 0: 1 } }
    expect(Math.min(...contourToPolygon(d).map((q) => q.y))).toBeCloseTo(0, 9)
  })

  it('turnAt, tangentLength and maxRadius', () => {
    const c = rect(10, 6, 1)
    expect(turnAt(c, 0)).toBeCloseTo(Math.PI / 2, 6)
    expect(tangentLength(c, 0)).toBeCloseTo(1, 6)
    // a 6 m edge with radius 1 at the other corner: 5 fits
    expect(maxRadius(c, 1)).toBeCloseTo(5, 6)
  })

  it('contourFromPolygon makes clockwise input counter-clockwise', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ]
    expect(signedArea(contourToPolygon(contourFromPolygon(cw)))).toBeGreaterThan(0)
  })
})

// Ported from Plaza-Practiko `vistas/planta/edicion/__tests__/geometria.test.ts` (esquinaRedondeada).
describe('cornerArc', () => {
  it('gives the tangent points, the middle of the arc and its centre', () => {
    const c: Contour = { vertices: rect(10, 6).vertices.map((v, i) => (i === 2 ? { ...v, r: 2 } : v)) }
    const e = cornerArc(c, 2)!
    expect(e.t1.x).toBeCloseTo(10)
    expect(e.t1.y).toBeCloseTo(4)
    expect(e.t2.x).toBeCloseTo(8)
    expect(e.t2.y).toBeCloseTo(6)
    expect(e.mid.x).toBeCloseTo(8 + Math.SQRT2)
    expect(e.mid.y).toBeCloseTo(4 + Math.SQRT2)
    expect(e.center).toEqual({ x: 8, y: 4 })
    expect(cornerArc(rect(10, 6), 0)).toBeNull() // sharp corner
  })
})

// Practiko's `desdeTramos` tests, for its port `contourFromSpans` (Phase 5.2)
describe('contourFromSpans', () => {
  const P = (x: number, y: number) => ({ x, y })

  it('an arc of radius 3 tangent at 90° becomes a corner with r 3', () => {
    const t: Span[] = [
      { kind: 'line', a: P(0, 0), b: P(7, 0) },
      { kind: 'arc', a: P(7, 0), b: P(10, 3), center: P(7, 3), radius: 3, ccw: true },
      { kind: 'line', a: P(10, 3), b: P(10, 10) },
      { kind: 'line', a: P(10, 10), b: P(0, 10) },
      { kind: 'line', a: P(0, 10), b: P(0, 0) },
    ]
    const { contour, warnings } = contourFromSpans(t)
    expect(warnings).toEqual([])
    expect(contour.vertices).toHaveLength(4)
    const corner = contour.vertices.find((v) => Math.abs(v.x - 10) < 1e-6 && Math.abs(v.y) < 1e-6)
    expect(corner).toBeDefined()
    expect(corner!.r).toBeCloseTo(3, 6)
    expect(contour.arcs ?? {}).toEqual({})
  })

  it('an arc that is not tangent makes an arc edge, no corner', () => {
    const t: Span[] = [
      { kind: 'line', a: P(0, 0), b: P(10, 0) },
      { kind: 'line', a: P(10, 0), b: P(10, 10) },
      { kind: 'arc', a: P(10, 10), b: P(0, 10), center: P(5, 5), radius: Math.sqrt(50), ccw: true },
      { kind: 'line', a: P(0, 10), b: P(0, 0) },
    ]
    const { contour } = contourFromSpans(t)
    expect(contour.vertices).toHaveLength(4)
    expect(contour.vertices.every((v) => v.r === 0)).toBe(true)
    const bs = Object.values(contour.arcs ?? {})
    expect(bs).toHaveLength(1)
    expect(bs[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 6)
    const p = contourToPolygon(contour)
    expect(Math.max(...p.map((q) => q.y))).toBeCloseTo(5 + Math.sqrt(50), 1)
  })

  it('joins consecutive collinear lines and turns the result counter-clockwise', () => {
    const t: Span[] = [
      { kind: 'line', a: P(0, 0), b: P(0, 10) },
      { kind: 'line', a: P(0, 10), b: P(10, 10) },
      { kind: 'line', a: P(10, 10), b: P(10, 0) },
      { kind: 'line', a: P(10, 0), b: P(5, 0) },
      { kind: 'line', a: P(5, 0), b: P(0, 0) },
    ]
    const { contour } = contourFromSpans(t)
    expect(contour.vertices).toHaveLength(4)
    expect(signedArea(contour.vertices)).toBeCloseTo(100, 6)
  })
})
