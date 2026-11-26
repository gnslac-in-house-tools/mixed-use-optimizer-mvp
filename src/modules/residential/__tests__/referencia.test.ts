import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { derivar } from '../engine/derivar.ts'
import { DEPARTAMENTO } from '../engine/deptos.ts'
import { proyectoReferencia, REFERENCIA_ID } from '../engine/referencia.ts'

const p = proyectoReferencia()
const nivel = (nombre: string) => p.buildings[0].levels.find((l) => l.name === nombre)!
const deptosEn = (nombre: string) => p.masses.filter((m) => m.levelId === nivel(nombre).id && m.depto)
const cuenta = (nombre: string) => {
  const out: Record<string, number> = {}
  for (const m of deptosEn(nombre)) out[m.depto!.plan] = (out[m.depto!.plan] ?? 0) + 1
  return out
}

describe('el proyecto de referencia (barras de departamentos del compañero)', () => {
  it('es un proyecto de uso mixto con su id fijo y sus cuatro niveles: piso 1, piso 2-3 (×2), piso 4 y piso 5', () => {
    expect(p.id).toBe(REFERENCIA_ID)
    expect(p.typology).toBe('mixed-use')
    const ls = p.buildings[0].levels.map((l) => [l.name, l.elevation, l.height, l.repeat])
    expect(ls).toEqual([
      ['Piso 1', 0, 4.5, 1],
      ['Piso 2-3', 4.5, 3, 2],
      ['Piso 4', 10.5, 3, 1],
      ['Piso 5', 13.5, 3, 1],
    ])
  })

  it('piso 2-3: dos barras de 105·105·105·85·85·85·105·105·105 y cuatro alas de 85 en el patio', () => {
    expect(cuenta('Piso 2-3')).toEqual({ 'ref-105': 12, 'ref-85': 10 })
  })

  it('piso 4: las barras con dos esquinas de 150 junto a cada núcleo, sus alas y sus pasillos', () => {
    expect(cuenta('Piso 4')).toEqual({ 'ref-105': 12, 'ref-150': 4, 'ref-85': 4 })
    const pasillos = p.masses.filter((m) => m.levelId === nivel('Piso 4').id && m.programId === 'circulacion')
    expect(pasillos.length).toBe(4)
  })

  it('piso 5: dos U de 105·105·85 con sus alas', () => {
    expect(cuenta('Piso 5')).toEqual({ 'ref-105': 8, 'ref-85': 8 })
  })

  it('el piso 4 tiene dos núcleos con su detalle: escalera, elevador, ducto y vestíbulo', () => {
    const nucleos = p.masses.filter((m) => m.programId === 'nucleo')
    expect(nucleos.length).toBe(2)
    for (const n of nucleos) {
      expect(n.levelId).toBe(nivel('Piso 4').id)
      const kinds = n.nucleo!.elementos.map((e) => e.kind)
      expect(kinds).toEqual(expect.arrayContaining(['escalera', 'elevador', 'ducto', 'vestibulo']))
    }
  })

  it('el piso 1 es comercio bajo las dos barras', () => {
    const com = p.masses.filter((m) => m.levelId === nivel('Piso 1').id)
    expect(com.length).toBe(2)
    expect(com.every((m) => m.programId === 'comercio')).toBe(true)
  })

  it('nada se encima y todo cae dentro del terreno', () => {
    const d = derive(p)
    expect(d.issues.filter((i) => i.code === 'overlap')).toEqual([])
    const b = footprintPolygon({ kind: 'contour', contour: p.site.boundary! })
    const xs = b.map((q) => q.x), ys = b.map((q) => q.y)
    for (const m of p.masses)
      for (const q of footprintPolygon(m.footprint)) {
        expect(q.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6)
        expect(q.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6)
        expect(q.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6)
        expect(q.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6)
      }
  })

  it('GFit cuenta los departamentos dibujados, piso por piso (80 en total, 4 de 150)', () => {
    const d = derivar(p, 'b1')!
    expect(d).not.toBeNull()
    expect(d.unidades.length).toBe(22 * 2 + 20 + 16)
    expect(d.unidades.filter((u) => u.unidad.type === 't150').length).toBe(4)
  })

  it('todos los departamentos son del programa Departamento y nombran un plano de su Mi biblioteca', () => {
    const cat = new Set((p.residential!.catalogo ?? []).map((c) => c.id))
    const deptos = p.masses.filter((m) => m.depto)
    expect(deptos.length).toBe(22 + 20 + 16)
    expect(deptos.every((m) => m.programId === DEPARTAMENTO && cat.has(m.depto!.plan))).toBe(true)
  })
})
