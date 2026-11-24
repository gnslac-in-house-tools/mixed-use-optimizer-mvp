import { describe, expect, it } from 'vitest'
import type { ParamsCajones, Punto, Rampa } from '../../../modelo/tipos'
import { puntoEnRegion } from '../../geom/poligono'
import { calcularCajones } from '../index'
import { largoCalculado, medidaDeRampa } from '../rampas'

const rect = (w: number, h: number): Punto[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]

const base: ParamsCajones = {
  angulo: null,
  anchoCajon: 2.5,
  largoCajon: 5,
  anchoPasillo: 6,
  retiro: 0,
  cruceCada: 0,
  cabeceras: true,
  exigirAcceso: true,
  rampas: [],
  pisos: 1,
}

const centro = (pts: Punto[]): Punto => ({
  x: pts.reduce((s, q) => s + q.x, 0) / pts.length,
  y: pts.reduce((s, q) => s + q.y, 0) / pts.length,
})

describe('largo calculado de una rampa', () => {
  it('3.5 m al 15 % con transiciones de 3.6 m: 2t + (h − t·p)/p ≈ 26.9 m', () => {
    expect(largoCalculado(3.5, 0.15, 3.6)).toBeCloseTo(26.93, 2)
    expect(largoCalculado(3.5, 0.15, 0)).toBeCloseTo(23.33, 2)
  })

  it('si las transiciones ya suben todo, la rampa son solo ellas', () => {
    expect(largoCalculado(0.4, 0.15, 3.6)).toBeCloseTo((2 * 0.4) / 0.15, 6)
  })

  it('la medida de una rampa calculada no pasa de la pendiente y sus transiciones van a la mitad', () => {
    const m = medidaDeRampa({ t: 0, ancho: 3.5, largo: null, paralela: true, pendiente: 0.15, transicion: 3.6 }, 3.5)
    expect(m.calculado).toBe(true)
    expect(m.largo).toBeCloseTo(27, 6)
    expect(m.pendiente).toBeLessThanOrEqual(15)
    expect(m.pendiente).toBeGreaterThan(14.5)
    expect(m.pendienteTransicion).toBeCloseTo(m.pendiente / 2, 1)
  })

  it('una rampa de antes (largo fijo, sin transición) sigue con pendiente = altura / largo', () => {
    const m = medidaDeRampa({ t: 0, ancho: 3.5, largo: 20, paralela: true }, 3)
    expect(m).toMatchObject({ largo: 20, pendiente: 15, pendienteTransicion: 15, transicion: 0, calculado: false })
  })
})

describe('medidas por rampa en el acomodo', () => {
  it('cada rampa usa su ancho y su largo', () => {
    const rampas: Rampa[] = [
      { t: 0.05, ancho: 3.5, largo: 20, paralela: true },
      { t: 0.55, ancho: 6, largo: 25, paralela: true },
    ]
    const r = calcularCajones(rect(80, 50), [], { ...base, rampas }, 3)
    expect(r.medidasRampas!.map((m) => [m.ancho, m.largo])).toEqual([
      [3.5, 20],
      [6, 25],
    ])
    const lados = (k: number) => {
      const q = r.rampas[k]
      const l = (i: number) => Math.hypot(q[(i + 1) % 4].x - q[i].x, q[(i + 1) % 4].y - q[i].y)
      return [l(0), l(1)].sort((a, b) => a - b)
    }
    expect(lados(0)[0]).toBeCloseTo(3.5, 6)
    expect(lados(0)[1]).toBeCloseTo(20, 6)
    expect(lados(1)[0]).toBeCloseTo(6, 6)
    expect(lados(1)[1]).toBeCloseTo(25, 6)
    // la segunda es más empinada que la primera: la pendiente del resultado es la mayor
    expect(r.pendiente).toBe(15)
  })

  it('el aviso de pendiente dice qué rampa se pasa y el largo que necesita con sus transiciones', () => {
    const rampas: Rampa[] = [
      { t: 0.05, ancho: 3.5, largo: 30, paralela: true },
      { t: 0.55, ancho: 3.5, largo: 18, paralela: true, transicion: 3.6 },
    ]
    const r = calcularCajones(rect(80, 50), [], { ...base, rampas }, 3.5)
    const aviso = r.avisos.find((a) => a.includes('pendiente'))!
    expect(aviso).toContain('rampa 2')
    expect(aviso).toContain(largoCalculado(3.5, 0.15, 3.6).toFixed(1))
    expect(r.avisos.filter((a) => a.includes('pendiente'))).toHaveLength(1)
  })
})

describe('rampa alineada a pasillo', () => {
  it('perpendicular: las filas corren en la dirección de la rampa y su boca cae en un pasillo', () => {
    const rampas: Rampa[] = [{ t: 0.1, ancho: 3.5, largo: 15, paralela: false, alineacion: 'pasillo' }]
    const r = calcularCajones(rect(60, 40), [], { ...base, angulo: 0, rampas }, 3)
    expect(r.angulo).toBeCloseTo(90, 6)
    const boca = centro(r.rampas[1])
    expect(r.pasillos.some((p) => puntoEnRegion(boca, [p]))).toBe(true)
    // el pasillo está centrado en el eje de la rampa
    const eje = centro(r.rampas[0]).x
    const pasillo = r.pasillos.find((p) => puntoEnRegion(boca, [p]))!
    const xs = pasillo.map((q) => q.x)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(eje, 4)
  })

  it('sin alinear, la misma rampa con el ángulo de la masa no cambia el acomodo', () => {
    const rampas: Rampa[] = [{ t: 0.1, ancho: 3.5, largo: 15, paralela: false }]
    const r = calcularCajones(rect(60, 40), [], { ...base, angulo: 0, rampas }, 3)
    expect(r.angulo).toBe(0)
  })

  it('paralela: las filas corren a lo largo de la orilla', () => {
    const rampas: Rampa[] = [{ t: 0.6, ancho: 3.5, largo: 20, paralela: true, alineacion: 'pasillo' }]
    const r = calcularCajones(rect(60, 40), [], { ...base, rampas }, 3)
    expect(Math.min(r.angulo, 180 - r.angulo)).toBeCloseTo(0, 6)
    expect(r.conteoPorPiso).toBeGreaterThan(0)
    expect(r.sinAcceso).toHaveLength(0)
    const bocas = r.rampas.slice(1).map(centro)
    expect(bocas.some((b) => r.pasillos.some((p) => puntoEnRegion(b, [p])))).toBe(true)
  })

  it('dos rampas alineadas en direcciones distintas: manda la primera y se avisa', () => {
    const rampas: Rampa[] = [
      { t: 0.1, ancho: 3.5, largo: 15, paralela: false, alineacion: 'pasillo' },
      { t: 0.35, ancho: 3.5, largo: 15, paralela: false, alineacion: 'pasillo' },
    ]
    const r = calcularCajones(rect(60, 40), [], { ...base, rampas }, 3)
    expect(r.angulo).toBeCloseTo(90, 6)
    expect(r.avisos).toContain('La rampa 2 no queda alineada a un pasillo: manda la rampa 1.')
  })
})
