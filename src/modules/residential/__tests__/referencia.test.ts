import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { massSpan } from '../../../engine/levels.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { derivar } from '../engine/derivar.ts'
import { DEPARTAMENTO } from '../engine/deptos.ts'
import { esquinas, nucleoColocado } from '../engine/nucleoDetalle.ts'
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

  it('piso 2-3: dos barras de 105·105·105·85 | núcleo | 85·105·105·105, un pasillo a cada lado del núcleo y cuatro alas de 85', () => {
    expect(cuenta('Piso 2-3')).toEqual({ 'ref-105': 12, 'ref-85': 8 })
    const pasillos = p.masses.filter((m) => m.levelId === nivel('Piso 2-3').id && m.programId === 'circulacion')
    expect(pasillos.length).toBe(4)
  })

  it('piso 4: las barras con dos esquinas de 150 junto a cada núcleo, sus alas y sus pasillos', () => {
    expect(cuenta('Piso 4')).toEqual({ 'ref-105': 12, 'ref-150': 4, 'ref-85': 4 })
    const pasillos = p.masses.filter((m) => m.levelId === nivel('Piso 4').id && m.programId === 'circulacion')
    expect(pasillos.length).toBe(4)
  })

  it('piso 5: dos U de 105·105·85 con sus alas', () => {
    expect(cuenta('Piso 5')).toEqual({ 'ref-105': 8, 'ref-85': 8 })
  })

  it('dos núcleos que suben por todo el edificio (del piso 1 al tope del 5), con su detalle', () => {
    const nucleos = p.masses.filter((m) => m.programId === 'nucleo')
    expect(nucleos.length).toBe(2)
    for (const n of nucleos) {
      expect(n.levelId).toBe(nivel('Piso 1').id)
      expect(massSpan(p, n)).toEqual([0, 16.5])
      const kinds = n.nucleo!.elementos.map((e) => e.kind)
      expect(kinds).toEqual(expect.arrayContaining(['escalera', 'elevador', 'ducto', 'vestibulo']))
    }
  })

  it('cada núcleo: una escalera, dos elevadores, un ducto y su vestíbulo, sin encimarse y dentro del núcleo', () => {
    for (const n of p.masses.filter((m) => m.programId === 'nucleo')) {
      const c = nucleoColocado(n, footprintPolygon(n.footprint))!
      const es = c.elementos
      expect(es.filter((e) => e.kind === 'escalera').length).toBe(1)
      expect(es.filter((e) => e.kind === 'elevador').length).toBe(2)
      expect(es.filter((e) => e.kind === 'ducto').length).toBe(1)
      const cajas = es.map((e) => { const q = esquinas(e); return { x0: q[0][0], y0: q[0][1], x1: q[2][0], y1: q[2][1] } })
      for (const b of cajas) {
        expect(b.x0).toBeGreaterThanOrEqual(-1e-6)
        expect(b.y0).toBeGreaterThanOrEqual(-1e-6)
        expect(b.x1).toBeLessThanOrEqual(c.W + 1e-6)
        expect(b.y1).toBeLessThanOrEqual(c.D + 1e-6)
      }
      for (let i = 0; i < cajas.length; i++)
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i], b = cajas[j]
          const traslape = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
          expect(traslape).toBeLessThan(1e-6)
        }
    }
  })

  it('el marco de cada núcleo empieza en su fachada: la escalera da a la calle, el vestíbulo al patio', () => {
    for (const n of p.masses.filter((m) => m.programId === 'nucleo')) {
      const c = nucleoColocado(n, footprintPolygon(n.footprint))!
      const esc = c.elementos.find((e) => e.kind === 'escalera')!
      const [, yMundo] = c.aMundo(esc.x, esc.y)
      // la barra sur mira al sur (su fachada en y = 0), la norte al norte: la escalera, cerca de la fachada
      const fachada = yMundo < 15 ? 0 : 30
      expect(Math.abs(yMundo - fachada)).toBeLessThan(4)
    }
  })

  it('ningún departamento ni pasillo se mete en un núcleo, en ningún piso', () => {
    const caja = (pts: { x: number; y: number }[]) => ({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) })
    const nucleos = p.masses.filter((m) => m.programId === 'nucleo').map((m) => caja(footprintPolygon(m.footprint)))
    for (const m of p.masses.filter((x) => x.depto || x.programId === 'circulacion')) {
      const b = caja(footprintPolygon(m.footprint))
      for (const n of nucleos) {
        const t = Math.max(0, Math.min(b.x1, n.x1) - Math.max(b.x0, n.x0)) * Math.max(0, Math.min(b.y1, n.y1) - Math.max(b.y0, n.y0))
        expect(t).toBeLessThan(1e-6)
      }
    }
  })

  it('el piso 1 es comercio bajo las dos barras', () => {
    const com = p.masses.filter((m) => m.levelId === nivel('Piso 1').id && m.programId !== 'nucleo')
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

  it('GFit cuenta los departamentos dibujados, piso por piso (76 en total, 4 de 150)', () => {
    const d = derivar(p, 'b1')!
    expect(d).not.toBeNull()
    expect(d.unidades.length).toBe(20 * 2 + 20 + 16)
    expect(d.unidades.filter((u) => u.unidad.type === 't150').length).toBe(4)
  })

  it('todos los departamentos son del programa Departamento y nombran un plano de su Mi biblioteca', () => {
    const cat = new Set((p.residential!.catalogo ?? []).map((c) => c.id))
    const deptos = p.masses.filter((m) => m.depto)
    expect(deptos.length).toBe(20 + 20 + 16)
    expect(deptos.every((m) => m.programId === DEPARTAMENTO && cat.has(m.depto!.plan))).toBe(true)
  })
})
