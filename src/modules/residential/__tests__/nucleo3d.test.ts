import { describe, expect, it } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { nucleoColocado, type ElementoNucleo } from '../engine/nucleoDetalle.ts'
import { pisosEn, prismasNucleo } from '../engine/nucleo3d.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const con = (elementos: ElementoNucleo[], poly = rect(10, 20, 19, 26)) => nucleoColocado({ nucleo: { elementos } }, poly)!
const ELEV: ElementoNucleo = { id: 'elevador1', kind: 'elevador', x: 4, y: 4.9, w: 2.2, d: 2.2, rot: 0 }
const ESC: ElementoNucleo = { id: 'escalera', kind: 'escalera', x: 1.3, y: 2.8, w: 2.6, d: 5.6, rot: 0 }
const DUC: ElementoNucleo = { id: 'ducto', kind: 'ducto', x: 8.5, y: 5.25, w: 1, d: 1.5, rot: 0 }
const PISOS = [{ z: 0, h: 3 }, { z: 3, h: 3 }]
const dentro = (pts: Point[], poly: Point[]) => {
  const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y)
  return pts.every((q) => q.x >= Math.min(...xs) - 1e-6 && q.x <= Math.max(...xs) + 1e-6 && q.y >= Math.min(...ys) - 1e-6 && q.y <= Math.max(...ys) + 1e-6)
}

describe('el núcleo en 3D', () => {
  it('un elevador: su cubo (cuatro muros, el del frente partido por la puerta) a todo lo alto y su cabina abajo', () => {
    const ps = prismasNucleo(con([ELEV]), PISOS)
    const muros = ps.filter((p) => p.parte === 'cubo')
    expect(muros.length).toBe(5)
    expect(muros.every((p) => p.z0 === 0 && Math.abs(p.alto - 6) < 1e-9)).toBe(true)
    const cabina = ps.filter((p) => p.parte === 'cabina')
    expect(cabina.length).toBe(1)
    expect(cabina[0].z0).toBe(0)
  })

  it('una escalera: en cada piso dos tramos y su descanso; el último peralte sube a la losa de arriba', () => {
    const ps = prismasNucleo(con([ESC]), PISOS)
    const n = Math.round(3 / 0.175)
    // n peraltes: los escalones son n − 2 (el último de cada tramo es el descanso o la losa)
    const escalones = ps.filter((p) => p.parte === 'escalon')
    expect(escalones.length).toBe(2 * (n - 2))
    expect(ps.filter((p) => p.parte === 'descanso').length).toBe(2)
    const top = Math.max(...ps.map((p) => p.z0 + p.alto))
    expect(top).toBeCloseTo(6 - 3 / n, 6)
  })

  it('un ducto: sus cuatro muros a todo lo alto', () => {
    const ps = prismasNucleo(con([DUC]), PISOS)
    expect(ps.length).toBe(4)
    expect(ps.every((p) => p.parte === 'ducto')).toBe(true)
  })

  it('todo cae dentro del núcleo, también si está girado', () => {
    const poly = [{ x: 0, y: 0 }, { x: 0, y: 9 }, { x: -6, y: 9 }, { x: -6, y: 0 }]
    const ps = prismasNucleo(con([ELEV, ESC, DUC, { ...ELEV, id: 'e2', rot: 90, x: 6.5, y: 1.2 }], poly), PISOS)
    expect(ps.every((p) => dentro(p.pts, poly))).toBe(true)
  })

  it('los pisos de una masa: cada nivel (con su ×N) entre su piso y su tope', () => {
    const levels = [
      { id: 'a', name: 'P1', elevation: 0, height: 4.5, repeat: 1 },
      { id: 'b', name: 'P2', elevation: 4.5, height: 3, repeat: 2 },
      { id: 'c', name: 'P4', elevation: 10.5, height: 3, repeat: 1 },
    ]
    expect(pisosEn(levels, 4.5, 13.5)).toEqual([{ z: 4.5, h: 3 }, { z: 7.5, h: 3 }, { z: 10.5, h: 3 }])
    expect(pisosEn(levels, 10.5, 13.5)).toEqual([{ z: 10.5, h: 3 }])
  })
})
