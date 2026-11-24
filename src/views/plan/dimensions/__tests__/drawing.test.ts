// Ported from Plaza-Practiko `vistas/planta/__tests__/acotaciones.test.ts` (en-US, without the annotation scale).
import { describe, expect, it } from 'vitest'
import { DIMENSION_TEXT_PX, dimensionDrawing, dimensionText, offsetFrom } from '../drawing.ts'

describe('a hand-drawn dimension', () => {
  it('the text with two decimals and no unit', () => {
    expect(dimensionText(12.345)).toBe('12.35')
    expect(dimensionText(3)).toBe('3.00')
    expect(dimensionText(1234.5)).toBe('1,234.50')
  })

  it('the signed offset: positive on the left of a→b', () => {
    expect(offsetFrom({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 3 })).toBeCloseTo(3)
    expect(offsetFrom({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: -2 })).toBeCloseTo(-2)
    expect(offsetFrom({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 3 })).toBe(0)
  })

  it('the line goes to its offset; extension lines start a gap from the point and pass the line', () => {
    const d = dimensionDrawing({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: 2 }, 0.01)!
    expect(d.length).toBe(10)
    expect(d.line).toEqual({ a: { x: 0, y: 2 }, b: { x: 10, y: 2 } })
    expect(d.extensions).toHaveLength(2)
    expect(d.extensions[0].a.y).toBeCloseTo(0.02)
    expect(d.extensions[0].b.y).toBeCloseTo(2.03)
    expect(d.ticks).toHaveLength(2)
    expect(d.text).toMatchObject({ content: '10.00', angle: 0, anchor: 'middle', q: { x: 5, y: 2 } })
    const below = dimensionDrawing({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: -2 }, 0.01)!
    expect(below.extensions[0].a.y).toBeCloseTo(-0.02)
    expect(below.extensions[0].b.y).toBeCloseTo(-2.03)
    expect(dimensionDrawing({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: 0 }, 0.01)!.extensions).toEqual([])
  })

  it('the text is never upside down', () => {
    expect(dimensionDrawing({ a: { x: 10, y: 0 }, b: { x: 0, y: 0 }, offset: 1 }, 0.01)!.text.angle).toBeCloseTo(0)
    expect(dimensionDrawing({ a: { x: 0, y: 10 }, b: { x: 0, y: 0 }, offset: 1 }, 0.01)!.text.angle).toBeCloseTo(90)
    expect(dimensionDrawing({ a: { x: 5, y: 5 }, b: { x: 0, y: 0 }, offset: 1 }, 0.01)!.text.angle).toBeCloseTo(45)
  })

  it('the lettering follows the screen scale; when it does not fit, it goes outside', () => {
    const c = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: 1 }
    expect(dimensionDrawing(c, 0.01)!.text.size).toBeCloseTo(DIMENSION_TEXT_PX * 0.01)
    const outside = dimensionDrawing(c, 1)!
    expect(outside.text.anchor).toBe('start')
    expect(outside.text.q.x).toBeGreaterThan(10)
    expect(dimensionDrawing({ ...c, b: c.a }, 0.01)).toBeNull()
  })
})
