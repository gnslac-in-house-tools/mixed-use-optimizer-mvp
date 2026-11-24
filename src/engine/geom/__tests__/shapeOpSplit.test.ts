// The `split` op of the shape engine (Phase D.3, task 2): a contour cut by a line, every piece in `pieces`, the first as `contour`.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { rawPolygon } from '../contour.ts'
import { signedArea } from '../polygon.ts'
import { opName, runShapeOp } from '../shapeOp.ts'

const square = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 10, y: 0, r: 0 },
    { x: 10, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
})

describe('runShapeOp: split', () => {
  it('gives every piece, and the first as the contour with its lineage', () => {
    const r = runShapeOp(square(), { op: 'split', a: { x: 5, y: -1 }, b: { x: 5, y: 11 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pieces).toHaveLength(2)
    expect(r.contour).toBe(r.pieces![0].contour)
    expect(r.from).toBe(r.pieces![0].from)
    expect(r.from).toHaveLength(r.contour.vertices.length)
    for (const p of r.pieces!) expect(signedArea(rawPolygon(p.contour))).toBeCloseTo(50, 9)
    expect(r.notes).toEqual([])
  })

  it('a line that misses the contour is refused: The line does not cross it', () => {
    const c = square()
    for (const [a, b] of [
      [{ x: 20, y: 0 }, { x: 20, y: 5 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    ]) {
      const r = runShapeOp(c, { op: 'split', a, b })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.reason).toBe('The line does not cross it')
      expect(r.contour).toBe(c)
      expect(r.from).toEqual([0, 1, 2, 3])
    }
  })

  it('a line of one point, or of no number, is refused for what it is', () => {
    for (const [a, b] of [
      [{ x: 3, y: 3 }, { x: 3, y: 3 }],
      [{ x: Number.NaN, y: 3 }, { x: 3, y: 4 }],
    ]) {
      const r = runShapeOp(square(), { op: 'split', a, b })
      expect(r.ok).toBe(false)
      if (r.ok) return
      expect(r.reason).toBe('The line needs two different points')
    }
  })

  it('the other ops answer no pieces', () => {
    const r = runShapeOp(square(), { op: 'push', wall: 1, by: 2 })
    expect(r.ok && r.pieces).toBeFalsy()
  })

  it('is named split, for the kinds that refuse it', () => {
    expect(opName({ op: 'split', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } })).toBe('split')
  })
})
