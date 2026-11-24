// Ported from Plaza-Practiko `vistas/planta/edicion/__tests__/radioDeEsquina.test.ts`.
import { describe, expect, it } from 'vitest'
import type { Mass, Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { bisector, nearestCorner, radiusFromPointer, roundable } from '../cornerRadius.ts'

const rect = (w: number, h: number, x = 0, y = 0): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]
const c = contourFromPolygon(rect(10, 10)) // corner 0 is (0, 0), 90°
const mass = (id: string, pts: Point[]): Mass => ({ id, name: id, levelId: 'l1', programId: null, height: 10, footprint: { kind: 'contour', contour: contourFromPolygon(pts) } })

describe('bisector', () => {
  it('a 90° corner points at 45° and measures 90°', () => {
    const b = bisector(c, 0)!
    expect(b.u.x).toBeCloseTo(Math.SQRT1_2)
    expect(b.u.y).toBeCloseTo(Math.SQRT1_2)
    expect(b.angle).toBeCloseTo(Math.PI / 2)
  })
  it('a zero-length side gives none', () => {
    const broken = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 0, y: 0, r: 0 }, { x: 5, y: 5, r: 0 }] }
    expect(bisector(broken, 0)).toBeNull()
  })
})

describe('radiusFromPointer', () => {
  it('with the pointer at the arc’s centre it gives the radius (90° corner, centre (2, 2) → r = 2)', () => {
    expect(radiusFromPointer(c, 0, { x: 2, y: 2 })).toBeCloseTo(2)
    expect(radiusFromPointer(c, 0, { x: 3, y: 3 })).toBeCloseTo(3)
  })
  it('only the advance along the bisector counts', () => {
    expect(radiusFromPointer(c, 0, { x: 4, y: 0 })).toBeCloseTo(radiusFromPointer(c, 0, { x: 2, y: 2 }))
  })
  it('behind the vertex or on it, 0', () => {
    expect(radiusFromPointer(c, 0, { x: -3, y: -3 })).toBe(0)
    expect(radiusFromPointer(c, 0, { x: 0, y: 0 })).toBe(0)
  })
  it('never more than what fits in the corner', () => {
    expect(radiusFromPointer(c, 0, { x: 50, y: 50 })).toBeCloseTo(10)
  })
  it('rounded to a step (0.5 m)', () => {
    expect(radiusFromPointer(c, 0, { x: 2.2, y: 2.2 }, 0.5)).toBeCloseTo(2)
    expect(radiusFromPointer(c, 0, { x: 2.4, y: 2.4 }, 0.5)).toBeCloseTo(2.5)
  })
  it('a 60° corner (triangle) too', () => {
    const t = contourFromPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8.660254 }])
    // the centre of an arc of r = 1 is 1 / sin(30°) = 2 m from the vertex along the bisector (30°)
    const q = { x: 2 * Math.cos(Math.PI / 6), y: 2 * Math.sin(Math.PI / 6) }
    expect(radiusFromPointer(t, 0, q)).toBeCloseTo(1, 3)
  })
})

describe('nearestCorner', () => {
  const masses = [mass('a', rect(10, 10)), mass('b', rect(10, 10, 30, 0))]
  it('picks the nearest corner within the tolerance', () => {
    expect(nearestCorner(masses, { x: 0.3, y: 0.2 }, 1)).toEqual({ massId: 'a', i: 0 })
    expect(nearestCorner(masses, { x: 39.8, y: 10.1 }, 1)).toEqual({ massId: 'b', i: 2 })
  })
  it('far from every corner, none', () => {
    expect(nearestCorner(masses, { x: 20, y: 5 }, 1)).toBeNull()
  })
  it('a flat vertex (180°) is not roundable', () => {
    const flat = contourFromPolygon([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
    expect(roundable(flat, 1)).toBe(false)
    expect(roundable(flat, 2)).toBe(true)
  })
})
