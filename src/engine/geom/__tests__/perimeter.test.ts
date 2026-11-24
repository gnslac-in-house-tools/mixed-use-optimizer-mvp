// Positions on a perimeter as t (port of Plaza-Practiko `perimetro.test.ts`), plus the stretches frontage uses.
import { describe, expect, it } from 'vitest'
import { directionAt, edgeAt, inStretch, nearestT, perimeterPath, pointAt, stretchLength, vertexTs } from '../perimeter.ts'

// 40 × 20: perimeter 120. t = 0 at (0, 0); the bottom side ends at t = 1/3.
const rect = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
]

describe('perimeter', () => {
  it('pointAt walks the sides from vertex 0', () => {
    expect(pointAt(rect, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAt(rect, 20 / 120)).toEqual({ x: 20, y: 0 })
    expect(pointAt(rect, 50 / 120)).toEqual({ x: 40, y: 10 })
    const p = pointAt(rect, 110 / 120)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(10, 9)
  })

  it('nearestT projects the pointer to the nearest point of the perimeter', () => {
    expect(nearestT(rect, { x: 20, y: -5 })).toBeCloseTo(20 / 120, 9)
    expect(nearestT(rect, { x: 45, y: 10 })).toBeCloseTo(50 / 120, 9)
    expect(nearestT(rect, { x: 20, y: 18 })).toBeCloseTo(80 / 120, 9) // inside, near the top side
    expect(nearestT(rect, { x: -3, y: 10 })).toBeCloseTo(110 / 120, 9)
  })

  it('there and back: the point of t gives t', () => {
    for (const t of [0.05, 0.3, 0.5, 0.77, 0.95]) expect(nearestT(rect, pointAt(rect, t))).toBeCloseTo(t, 9)
  })

  it('the edge at t, its direction and the vertices’ t', () => {
    expect(edgeAt(rect, 50 / 120)).toEqual({ i: 1, f: 0.5 })
    expect(directionAt(rect, 50 / 120)).toEqual({ x: 0, y: 1 })
    expect(vertexTs(rect)).toEqual([0, 40 / 120, 60 / 120, 100 / 120])
  })

  it('a stretch from one t to another, passing vertex 0 when `to` is below `from`', () => {
    expect(inStretch(0.2, 0.1, 0.3)).toBe(true)
    expect(inStretch(0.05, 0.9, 0.1)).toBe(true)
    expect(inStretch(0.5, 0.9, 0.1)).toBe(false)
    expect(stretchLength(0.9, 0.1)).toBeCloseTo(0.2, 9)
    expect(perimeterPath(rect, 20 / 120, 50 / 120)).toEqual([
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
    ])
    const wrap = perimeterPath(rect, 110 / 120, 10 / 120)
    expect(wrap.map((q) => [Math.round(q.x), Math.round(q.y)])).toEqual([
      [0, 10],
      [0, 0],
      [10, 0],
    ])
  })
})
