// Ported from Plaza-Practiko `vistas/mapa/__tests__/ajuste.test.ts` (giro, distanciaManija); its centroInicial is
// engine/geo/site.ts siteCenter's, tested here too.
import { describe, expect, it } from 'vitest'
import { contourFromPolygon } from '../../../../engine/geom/contour.ts'
import { siteCenter } from '../../../../engine/geo/site.ts'
import { setBoundary } from '../../../../state/actions/site.ts'
import { demoProject } from '../../../../state/demo.ts'
import { angleTo, handleDistance, turnedBy } from '../place.ts'

const rect = (x: number, y: number, w: number, h: number) => [
  { x: x - w / 2, y: y - h / 2 },
  { x: x + w / 2, y: y - h / 2 },
  { x: x + w / 2, y: y + h / 2 },
  { x: x - w / 2, y: y + h / 2 },
]

describe('siteCenter', () => {
  it('is the boundary’s box’s middle', () => {
    const p = setBoundary(demoProject(), contourFromPolygon(rect(60, 40, 100, 40)))
    expect(siteCenter(p)).toEqual({ x: 60, y: 40 })
  })
  it('without a boundary, the masses’; with nothing, the origin', () => {
    const p = setBoundary(demoProject(), null)
    const c = siteCenter(p)
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true)
    expect(siteCenter({ ...p, masses: [] })).toEqual({ x: 0, y: 0 })
  })
})

describe('turn', () => {
  it('adds how far the pointer went round the centre', () => {
    const a0 = angleTo({ x: 0, y: 0 }, { x: 10, y: 0 })
    const a1 = angleTo({ x: 0, y: 0 }, { x: 0, y: 10 })
    expect(turnedBy(20, a0, a1, null)).toBeCloseTo(110)
  })
  it('with Shift, steps of 15', () => {
    expect(turnedBy(0, 0, 22, 15)).toBe(15)
    expect(turnedBy(0, 0, 38, 15)).toBe(45)
    expect(turnedBy(10, 0, -30, 15)).toBe(-15)
  })
})

describe('handleDistance', () => {
  const view = { cx: 0, cy: 0, w: 100, h: 60 }
  it('above the edge if it fits in the view', () => {
    expect(handleDistance({ x: 0, y: 0 }, 0, 20, 4, view, 2)).toBe(20)
  })
  it('comes nearer along the axis if the edge is out of view', () => {
    // the axis points to +y; the view reaches y = 30; with a margin of 2, up to 28
    expect(handleDistance({ x: 0, y: 0 }, 0, 250, 4, view, 2)).toBeCloseTo(28)
    // turned 90°, the axis points to −x: the view reaches x = −50
    expect(handleDistance({ x: 0, y: 0 }, 90, 250, 4, view, 2)).toBeCloseTo(48)
  })
  it('never under the minimum', () => {
    expect(handleDistance({ x: 0, y: 29 }, 0, 250, 4, view, 2)).toBe(4)
  })
})
