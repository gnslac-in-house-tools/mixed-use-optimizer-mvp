// The Chamfer tool's pure part (D.1 task 7): which set-back a pointer position gives, which corner can be chamfered, and what a
// kind or an object that refuses a corner edit says.
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { chamferFromPointer, chamferable } from '../chamferSize.ts'
import { refusedBy } from '../cornerRadius.ts'

const rect = (w: number, h: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]
const c = contourFromPolygon(rect(10, 10)) // corner 0 is (0, 0), 90°

describe('chamferFromPointer', () => {
  it('the pointer is the middle of the cut: at (1, 1) of a 90° corner both set-backs are 2', () => {
    expect(chamferFromPointer(c, 0, { x: 1, y: 1 })).toBeCloseTo(2)
    expect(chamferFromPointer(c, 0, { x: 2.5, y: 2.5 })).toBeCloseTo(5)
  })
  it('only the advance along the bisector counts', () => {
    expect(chamferFromPointer(c, 0, { x: 2, y: 0 })).toBeCloseTo(chamferFromPointer(c, 0, { x: 1, y: 1 }))
  })
  it('rounded to the step; free when it is 0', () => {
    expect(chamferFromPointer(c, 0, { x: 0.8, y: 0.8 }, 0.1)).toBeCloseTo(1.6)
    expect(chamferFromPointer(c, 0, { x: 0.8123, y: 0.8123 }, 0.1)).toBeCloseTo(1.6, 6)
    expect(chamferFromPointer(c, 0, { x: 0.8123, y: 0.8123 })).toBeCloseTo(1.6246, 6)
  })
  it('never more than fits, never negative', () => {
    expect(chamferFromPointer(c, 0, { x: 40, y: 40 })).toBeCloseTo(10)
    expect(chamferFromPointer(c, 0, { x: -3, y: -3 })).toBe(0)
  })
})

describe('chamferable', () => {
  it('a straight corner with room can; so can one that has a chamfer already or a radius', () => {
    expect(chamferable(c, 0)).toBe(true)
    const rounded = { vertices: c.vertices.map((v, i) => (i === 0 ? { ...v, r: 2 } : v)) }
    expect(chamferable(rounded, 0)).toBe(true)
  })
  it('a flat corner (no bisector) cannot', () => {
    const flat = contourFromPolygon([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
    expect(chamferable(flat, 1)).toBe(false)
  })
})

describe('refusedBy', () => {
  it('says why when the object refuses the op, else null', () => {
    const read = { contour: c, without: ['radius' as const, 'chamfer' as const], why: 'because' }
    expect(refusedBy(read, 'chamfer')).toBe('because')
    expect(refusedBy(read, 'radius')).toBe('because')
    expect(refusedBy({ contour: c }, 'chamfer')).toBeNull()
    expect(refusedBy(null, 'chamfer')).toBeNull()
  })
})
