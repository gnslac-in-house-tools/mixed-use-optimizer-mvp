import { describe, expect, it } from 'vitest'
import type { Point, Polygon } from '../../../model/schema.ts'
import { difference, intersection, regionsArea } from '../../../engine/geom/boolean.ts'
import { interioresNave, MANIOBRAS } from '../engine/interiores.ts'
import { racks3d } from '../views/naves3d.ts'

const nave: Polygon = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }]
const sur = { a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, out: { x: 0, y: -1 } }
const caja = (p: Polygon) => {
  const xs = p.map((q: Point) => q.x), ys = p.map((q: Point) => q.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('el interior de una nave', () => {
  it('frente al muro con andenes, una franja de maniobras; el resto, almacenaje', () => {
    const r = interioresNave(nave, [sur], 0)
    expect(MANIOBRAS).toBe(15)
    expect(regionsArea(r.maniobras)).toBeCloseTo(120 * 15, 0)
    expect(regionsArea(r.almacen)).toBeCloseTo(120 * 65, 0)
  })

  it('los racks van en el almacenaje, perpendiculares al muro de andenes (sus pasillos llevan a los andenes)', () => {
    const r = interioresNave(nave, [sur], 0)
    expect(r.racks.length).toBeGreaterThan(10)
    for (const k of r.racks) {
      expect(regionsArea(difference([k], r.almacen.flat()))).toBeLessThan(0.01)
      expect(regionsArea(intersection([k], r.maniobras.flat()))).toBeLessThan(0.01)
      const { w, h } = caja(k)
      expect(w).toBeCloseTo(2.4, 1)
      expect(h).toBeGreaterThan(20)
    }
    // dobles de 2.4 con pasillos de 3: cerca de 2.4 / 5.4 del almacenaje
    const frac = r.racks.reduce((s, k) => s + regionsArea([[k]]), 0) / regionsArea(r.almacen)
    expect(frac).toBeGreaterThan(0.3)
    expect(frac).toBeLessThan(0.45)
  })

  it('en 3D, los racks son una sola geometría del piso de la nave a 1.5 m bajo su techo, con 10 m como máximo', () => {
    const r = interioresNave(nave, [sur], 0)
    const alturas = (g: ReturnType<typeof racks3d>) => {
      const a = g.getAttribute('position')
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < a.count; i++) { lo = Math.min(lo, a.getY(i)); hi = Math.max(hi, a.getY(i)) }
      return [lo, hi]
    }
    expect(alturas(racks3d(r.racks, 2, 14))).toEqual([2, 12])
    expect(alturas(racks3d(r.racks, 0, 8))[1]).toBeCloseTo(6.5, 6)
    expect(racks3d([], 0, 8).getAttribute('position').count).toBe(0)
  })

  it('sin andenes no hay maniobras, y los racks siguen el eje de la retícula', () => {
    const r = interioresNave(nave, [], 0)
    expect(r.maniobras).toEqual([])
    expect(regionsArea(r.almacen)).toBeCloseTo(120 * 80, 0)
    expect(caja(r.racks[0]).h).toBeCloseTo(2.4, 1)
  })
})
