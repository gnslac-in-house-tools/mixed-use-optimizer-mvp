import { describe, expect, it } from 'vitest'
import { PlanCatalogoSchema } from '../engine/schema.ts'
import { agregarTipologias, areaPlan, contornoDe, planesReferencia, TIPOS_REFERENCIA } from '../engine/tipologias.ts'
import { estirar } from '../engine/pieza4.ts'
import { newProject } from '../../../typologies/index.ts'

const areaAnillo = (r: [number, number][]) => Math.abs(r.reduce((s, q, i) => { const n = r[(i + 1) % r.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0) / 2)

describe('las tipologías del proyecto de referencia', () => {
  const planes = planesReferencia()
  const de = (id: string) => planes.find((p) => p.typeId === id)!

  it('tres planos, de 85, 105 y 150 m² (la de esquina en L)', () => {
    expect(planes.map((p) => p.typeId)).toEqual(['t85', 't105', 't150'])
    expect(areaPlan(de('t85'))).toBeCloseTo(85.6, 0)
    expect(areaPlan(de('t105'))).toBeCloseTo(105.1, 0)
    expect(areaPlan(de('t150'))).toBeCloseTo(148, 0)
    expect(de('t150').contorno!.length).toBe(8)
    expect(de('t85').contorno).toBeUndefined()
  })

  it('sus recintos llenan el departamento, con los nombres de la lámina', () => {
    for (const p of planes) {
      const suma = p.rooms.reduce((s, r) => s + areaAnillo(r.shape), 0)
      expect(Math.abs(suma - areaPlan(p)) / areaPlan(p), p.name).toBeLessThan(0.01)
    }
    const nombres = new Set(planes.flatMap((p) => p.rooms.map((r) => r.name)))
    for (const n of ['Salón', 'Habitación principal', 'Habitación', 'Vestíbulo', 'Baño', 'Cuarto de lavado', 'Walk-in closet']) expect(nombres.has(n), n).toBe(true)
    expect(de('t150').rooms.filter((r) => r.kind === 'bath').length).toBe(4)
  })

  it('con puertas, ventanas en la fachada y muebles', () => {
    for (const p of planes) {
      expect((p.puertas ?? []).length, p.name).toBeGreaterThan(2)
      expect((p.ventanas ?? []).length, p.name).toBeGreaterThan(0)
      expect(p.muebles.length, p.name).toBeGreaterThan(3)
    }
  })

  it('el plano en L se guarda y se lee', () => {
    expect(PlanCatalogoSchema.parse(de('t150')).contorno).toEqual(de('t150').contorno)
  })

  it('sin contorno, el contorno es el rectángulo w × d', () => {
    expect(contornoDe({ w: 3, d: 2 })).toEqual([[0, 0], [3, 0], [3, 2], [0, 2]])
  })

  it('estirar lleva el contorno en L con los recintos', () => {
    const p = de('t150')
    const q = estirar(p, p.w + 1, p.d)
    expect(Math.max(...q.contorno!.map(([x]) => x))).toBeCloseTo(p.w + 1, 6)
    expect(areaPlan(q)).toBeGreaterThan(areaPlan(p))
  })

  it('agregarlas a un proyecto suma los tres tipos y sus planos, una sola vez', () => {
    const p0 = newProject('mixed-use')
    const p1 = agregarTipologias(agregarTipologias(p0))
    expect(p1.residential!.tipos.filter((t) => TIPOS_REFERENCIA.some((r) => r.id === t.id)).length).toBe(3)
    expect((p1.residential!.catalogo ?? []).filter((c) => c.typeId.startsWith('t1') || c.typeId === 't85').length).toBe(3)
  })
})
