import { describe, expect, it } from 'vitest'
import type { ParamsCajones, Punto } from '../../../modelo/tipos'
import { calcularCajones } from '../index'

const rect = (w: number, h: number, x = 0, y = 0): Punto[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const base: ParamsCajones = {
  angulo: null,
  anchoCajon: 2.5,
  largoCajon: 5,
  anchoPasillo: 6,
  retiro: 0,
  cruceCada: 5,
  cabeceras: true,
  exigirAcceso: true,
  rampas: [],
  pisos: 1,
}

const rampa = (t: number, largo = 20, paralela = true) => ({ t, ancho: 3.5, largo, paralela })

describe('calcularCajones (adaptador)', () => {
  it('conteo = conteoPorPiso x pisos', () => {
    const uno = calcularCajones(rect(60, 40), [], base, 3)
    const tres = calcularCajones(rect(60, 40), [], { ...base, pisos: 3 }, 3)
    expect(uno.conteoPorPiso).toBeGreaterThan(0)
    expect(uno.conteo).toBe(uno.conteoPorPiso)
    expect(tres.conteoPorPiso).toBe(uno.conteoPorPiso)
    expect(tres.conteo).toBe(3 * tres.conteoPorPiso)
    expect(uno.cajones).toHaveLength(uno.conteoPorPiso)
    expect(uno.cajones[0]).toHaveLength(4)
    expect(uno.pendiente).toBeNull()
  })

  it('con rampa: pendiente = altura / largo x 100 y aviso arriba de 15 %', () => {
    const p = { ...base, rampas: [rampa(0.1, 20)] }
    const r = calcularCajones(rect(60, 40), [], p, 4)
    expect(r.pendiente).toBe(20)
    expect(r.avisos.some((a) => a.includes('15'))).toBe(true)
    expect(r.rampas.length).toBeGreaterThan(0)
    expect(r.rampas3d).toHaveLength(1)
    const zs = r.rampas3d[0].puntos.map((q) => q.z).sort()
    expect(zs[0]).toBe(0)
    expect(zs[3]).toBe(4)

    const ok = calcularCajones(rect(60, 40), [], p, 3)
    expect(ok.pendiente).toBe(15)
    expect(ok.avisos.some((a) => a.includes('pendiente'))).toBe(false)
  })

  it('rect de 8 x 8: 0 cajones, un aviso y sin excepción', () => {
    const r = calcularCajones(rect(8, 8), [], base, 3)
    expect(r.conteo).toBe(0)
    expect(r.conteoPorPiso).toBe(0)
    expect(r.cajones).toEqual([])
    expect(r.avisos.length).toBeGreaterThanOrEqual(1)
  })

  it('polígono degenerado: sin excepción', () => {
    const r = calcularCajones([{ x: 0, y: 0 }, { x: 1, y: 0 }], [], base, 3)
    expect(r.conteo).toBe(0)
    expect(r.avisos.length).toBe(1)
  })

  it('los cajones quedan dentro del polígono y fuera de los obstáculos', () => {
    const obst = rect(6, 6, 20, 15)
    const r = calcularCajones(rect(60, 40), [obst], base, 3)
    const eps = 1e-6
    for (const c of r.cajones) {
      for (const q of c) {
        expect(q.x).toBeGreaterThanOrEqual(-eps)
        expect(q.x).toBeLessThanOrEqual(60 + eps)
        expect(q.y).toBeGreaterThanOrEqual(-eps)
        expect(q.y).toBeLessThanOrEqual(40 + eps)
      }
      const xs = c.map((q) => q.x)
      const ys = c.map((q) => q.y)
      const solapa =
        Math.min(...xs) < 26 - eps &&
        Math.max(...xs) > 20 + eps &&
        Math.min(...ys) < 21 - eps &&
        Math.max(...ys) > 15 + eps
      expect(solapa).toBe(false)
    }
  })

  it('traslada igual: el resultado no depende de dónde está el polígono', () => {
    const a = calcularCajones(rect(60, 40), [], base, 3)
    const b = calcularCajones(rect(60, 40, 5000, -3000), [], base, 3)
    expect(b.conteoPorPiso).toBe(a.conteoPorPiso)
    expect(b.angulo).toBeCloseTo(a.angulo, 9)
    expect(b.cajones[0][0].x).toBeCloseTo(a.cajones[0][0].x + 5000, 6)
    expect(b.cajones[0][0].y).toBeCloseTo(a.cajones[0][0].y - 3000, 6)
  })

  it('exigirAcceso: los cajones sin acceso no cuentan y salen aparte', () => {
    // un muro parte el rectángulo y la rampa queda en un lado
    const muro = rect(4, 42, 28, -1)
    const p = { ...base, angulo: 0, cruceCada: 0, rampas: [rampa(0.9)] }
    const exige = calcularCajones(rect(60, 40), [muro], p, 3)
    const libre = calcularCajones(rect(60, 40), [muro], { ...p, exigirAcceso: false }, 3)
    expect(exige.sinAcceso.length).toBeGreaterThan(0)
    expect(exige.conteoPorPiso).toBe(exige.cajones.length)
    expect(libre.sinAcceso).toEqual([])
    expect(libre.conteoPorPiso).toBe(exige.conteoPorPiso + exige.sinAcceso.length)
  })

  it('la rampa t se pega al perímetro por longitud de arco desde el vértice 0', () => {
    // t = 0.125 sobre el perímetro de 200 m cae en (25, 0)
    const r = calcularCajones(rect(60, 40), [], { ...base, rampas: [rampa(0.125, 10)] }, 3)
    const xs = r.rampas[0].map((q) => q.x)
    const ys = r.rampas[0].map((q) => q.y)
    expect(Math.min(...ys)).toBeCloseTo(0, 6)
    expect(xs.some((x) => Math.abs(x - 25) < 1e-6)).toBe(true)
  })
})
