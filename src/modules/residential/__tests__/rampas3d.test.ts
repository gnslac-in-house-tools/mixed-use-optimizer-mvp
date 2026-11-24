import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { rampas3d } from '../views/sotano3d.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
function torre(sotanos: number): Project {
  const p = newProject('mixed-use')
  return {
    ...p, grid: G0,
    masses: [masa('v', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('n', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
    residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, sotanos } } },
  }
}
/** La altura mínima y máxima de una geometría (la escena usa y hacia arriba). */
function alturas(g: { getAttribute(n: string): { count: number; getY(i: number): number } }): [number, number] {
  const a = g.getAttribute('position')
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < a.count; i++) { lo = Math.min(lo, a.getY(i)); hi = Math.max(hi, a.getY(i)) }
  return [lo, hi]
}

describe('rampas3d', () => {
  it('una rampa inclinada por sótano, del piso de cada uno al del de arriba', () => {
    const e = derivar(torre(3), 'b1')!.estacionamiento
    const rampas = rampas3d(e.plano, 0, 3).filter((x) => x.key.includes('rampa'))
    expect(rampas.length).toBe(3)
    rampas.forEach((x, i) => {
      const k = i + 1
      const [lo, hi] = alturas(x.geometry)
      expect(lo).toBeCloseTo(-3.3 * k, 2)
      expect(hi).toBeCloseTo(-3.3 * (k - 1) + 0.06, 2)
    })
  })

  it('la boca alta del S1 queda a nivel de calle; las de los demás, en el piso del sótano de arriba', () => {
    const e = derivar(torre(2), 'b1')!.estacionamiento
    const bocas = rampas3d(e.plano, 0, 2).filter((x) => x.key.includes('boca'))
    expect(bocas.length).toBe(2)
    expect(alturas(bocas[0].geometry)[0]).toBeCloseTo(0, 2)
    expect(alturas(bocas[1].geometry)[0]).toBeCloseTo(-3.3, 2)
  })

  it('sin rampa, nada', () => {
    const e = derivar(torre(0), 'b1')!.estacionamiento
    expect(rampas3d(e.plano, 0, 0)).toEqual([])
  })
})
