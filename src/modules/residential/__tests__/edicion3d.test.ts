import { describe, expect, it } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { newProject } from '../../../typologies/index.ts'
import { colocarDepto, deptoColocado } from '../engine/deptos.ts'
import { ejesMovibles } from '../engine/editor.ts'
import { manijasMuebles, manijasMuros, pasoDesde, tramoMuro } from '../engine/edicion3d.ts'
import { agregarTipologias } from '../engine/tipologias.ts'

/** un 105 girado 90° en (50, 10): su marco no es el del mundo */
const r = colocarDepto(agregarTipologias(newProject('mixed-use')), 'ref-105', { x: 50, y: 10 }, 90)
const m = r.project.masses.find((x) => x.id === r.id)!
const poly = footprintPolygon(m.footprint)
const c = deptoColocado(r.project, m, poly)!
const caja = (pts: Point[]) => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) })
const dentro = (pts: Point[]) => {
  const b = caja(poly), k = caja(pts)
  return k.x0 >= b.x0 - 0.2 && k.x1 <= b.x1 + 0.2 && k.y0 >= b.y0 - 0.2 && k.y1 <= b.y1 + 0.2
}

describe('editar un departamento en 3D: sus manijas sobre el piso', () => {
  it('una manija por muro interior movible, a lo largo de su tramo, dentro del departamento', () => {
    const ms = manijasMuros(c.plan, c.aMundo)
    const mov = ejesMovibles(c.plan)
    expect(ms.length).toBe(mov.x.filter((cc) => tramoMuro(c.plan, 'x', cc)).length + mov.y.filter((cc) => tramoMuro(c.plan, 'y', cc)).length)
    expect(ms.every((h) => h.pts.length === 4 && dentro(h.pts))).toBe(true)
  })

  it('el muro que se arrastra se dibuja donde va', () => {
    const [h] = manijasMuros(c.plan, c.aMundo)
    const [movida] = manijasMuros(c.plan, c.aMundo, { eje: h.eje, de: h.cc, a: h.cc + 1 })
    // el departamento está girado 90°: su x local va a lo largo del y del mundo
    const d = (a: Point[], b: Point[]) => Math.hypot(caja(a).x0 - caja(b).x0, caja(a).y0 - caja(b).y0)
    expect(d(h.pts, movida.pts)).toBeCloseTo(1, 6)
  })

  it('una manija por mueble, a su medida (girado, a lo ancho y hondo cambiados)', () => {
    const ms = manijasMuebles(c.plan, c.aMundo)
    expect(ms.length).toBe(c.plan.muebles.length)
    expect(ms.every((h) => dentro(h.pts))).toBe(true)
    const f = c.plan.muebles[0]
    const [movido] = manijasMuebles(c.plan, c.aMundo, { id: f.id, x: f.x + 0.5, y: f.y })
    expect(Math.hypot(caja(movido.pts).x0 - caja(ms[0].pts).x0, caja(movido.pts).y0 - caja(ms[0].pts).y0)).toBeCloseTo(0.5, 6)
  })

  it('los arrastres avanzan de 5 en 5 cm desde donde estaba', () => {
    expect(pasoDesde(3.37, 3.37 + 0.52)).toBeCloseTo(3.37 + 0.5, 9)
    expect(pasoDesde(3.37, 3.37 - 0.08)).toBeCloseTo(3.37 - 0.1, 9)
  })
})
