import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { toGrid, toPlan } from '../../../engine/grid/index.ts'
import { addBuilding } from '../../../state/actions/buildings.ts'
import { newProject } from '../../../typologies/index.ts'
import { area, difference, toShape } from '../engine/gfit/src/model/geom.ts'
import type { Pt, Shape } from '../engine/gfit/src/model/geom.ts'
import { derivar, type Derivado } from '../engine/derivar.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const contorno = (pts: Point[]) => ({ vertices: pts.map((q) => ({ ...q, r: 0 })) })
let n = 0
const masa = (programId: string, pts: Point[], height: number, levelId = 'l1', holes: Point[][] = []): Mass => ({
  id: 'm' + ++n, name: programId + ' ' + n, levelId, programId, height,
  footprint: { kind: 'contour', contour: contorno(pts) },
  ...(holes.length ? { holes: holes.map(contorno) } : {}),
})

function proyecto(masas: Mass[], grid: Grid = G0): Project {
  const p = newProject('mixed-use')
  return { ...p, grid, masses: masas }
}
const TORRE = rect(0, 0, 32.4, 16.2)
const NUCLEO = rect(12.15, 5.4, 20.25, 10.8)
const caso = (dx = 0, grid: Grid = G0) => {
  const mv = (pts: Point[]) => pts.map((q) => ({ x: q.x + dx, y: q.y }))
  return proyecto([masa('vivienda', mv(TORRE), 30), masa('nucleo', mv(NUCLEO), 30)], grid)
}

/** Los vértices de unidad sobre las orillas de la placa paralelas al eje x de la retícula, en el marco de la retícula. */
function enFachada(d: Derivado, placa: Point[], g: Grid): number[] {
  const out: number[] = []
  const u = { x: Math.cos((g.angle * Math.PI) / 180), y: Math.sin((g.angle * Math.PI) / 180) }
  for (const { unidad } of d.unidades) {
    for (const ring of unidad.shape) {
      for (const [x, y] of ring) {
        for (let i = 0; i < placa.length; i++) {
          const a = placa[i], b = placa[(i + 1) % placa.length]
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
          if (Math.abs(dx * u.x + dy * u.y) / len < 0.99) continue
          const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len)
          const off = Math.abs((x - a.x) * dy - (y - a.y) * dx) / len
          if (off > 0.01 || t < -1e-6 || t > 1 + 1e-6) continue
          out.push(toGrid(g, { x, y }).x)
        }
      }
    }
  }
  return out
}
const enModulos = (xs: number[], paso = 2.7, tol = 0.01) => xs.length > 0 && xs.every((x) => Math.abs(x / paso - Math.round(x / paso)) * paso < tol)
const forma = (pts: Point[], holes: Point[][] = []): Shape => difference(toShape([pts.map((q) => [q.x, q.y] as Pt)]), toShape(holes.map((h) => h.map((q) => [q.x, q.y] as Pt))))

describe('derivar', () => {
  it('(a) una torre de 30 m con su núcleo: 10 niveles, unidades con los muros en módulos de 2.7 m', () => {
    const p = caso()
    const t0 = performance.now()
    const d = derivar(p, 'b1')!
    const ms = performance.now() - t0
    if (ms > 30) console.info(`derivar (a): ${ms.toFixed(0)} ms (más de 30 ms)`)
    expect(d.niveles).toHaveLength(10)
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE, G0))).toBe(true)
  })

  it('(b) un podio de Comercio de 9 m da dos niveles de comercio abajo y la vivienda arriba', () => {
    const p0 = newProject('mixed-use')
    const b = p0.buildings[0]
    const p: Project = {
      ...p0, grid: G0,
      buildings: [{ ...b, levels: [...b.levels, { id: 'l2', name: 'L2', elevation: 9, height: 3, repeat: 1 }] }],
      masses: [masa('comercio', TORRE, 9), masa('vivienda', TORRE, 30, 'l2'), masa('nucleo', NUCLEO, 39)],
    }
    const d = derivar(p, 'b1')!
    expect(d.niveles.slice(0, 2).map((l) => l.prog)).toEqual(['ret', 'ret'])
    expect(d.niveles.slice(2).every((l) => l.prog === 'res')).toBe(true)
    expect(d.niveles.length).toBe(12)
  })

  it('(c) sin masa de núcleo avisa que usa un núcleo automático', () => {
    const d = derivar(proyecto([masa('vivienda', TORRE, 30)]), 'b1')!
    expect(d.avisos.some((a) => a.includes('núcleo automático'))).toBe(true)
  })

  it('(d) una masa de 6 × 30 m no da unidades y lo avisa, sin error', () => {
    const d = derivar(proyecto([masa('vivienda', rect(0, 0, 30, 6), 30)]), 'b1')!
    expect(d.totals.units).toBe(0)
    expect(d.avisos.length).toBeGreaterThan(0)
  })

  it('(e) una huella en L con un hueco: unidades solo dentro de la placa menos el hueco; el remanente se avisa', () => {
    const L = [{ x: 0, y: 0 }, { x: 32.4, y: 0 }, { x: 32.4, y: 16.2 }, { x: 16.2, y: 16.2 }, { x: 16.2, y: 32.4 }, { x: 0, y: 32.4 }]
    const hueco = rect(2, 2, 5, 5)
    const d = derivar(proyecto([masa('vivienda', L, 30, 'l1', [hueco]), masa('nucleo', rect(5.4, 18.9, 10.8, 24.3), 30)]), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    const placa = forma(L, [hueco])
    for (const { unidad } of d.unidades) expect(area(difference(unidad.shape, placa))).toBeLessThan(0.01)
    expect(d.avisos.some((a) => a.includes('remanente'))).toBe(true)
  })

  it('(f) con la retícula girada 30°, los muros caen en módulos en el marco de la retícula', () => {
    const g: Grid = { ...G0, origin: { x: 5, y: 3 }, angle: 30 }
    const placa = rect(0, 0, 32.4, 16.2).map((q) => toPlan(g, q))
    const nucleo = NUCLEO.map((q) => toPlan(g, q))
    const d = derivar(proyecto([masa('vivienda', placa, 30), masa('nucleo', nucleo, 30)], g), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, placa, g))).toBe(true)
  })

  it('(g) con dos edificios, cada uno ve solo sus masas', () => {
    const p1 = caso()
    const { project, levelId } = addBuilding(p1, { optionId: 'o1' })
    const b2 = project.buildings.find((b) => b.levels.some((l) => l.id === levelId))!.id
    const p = { ...project, masses: [...project.masses, masa('vivienda', rect(40.5, 0, 72.9, 16.2), 9, levelId)] }
    const d2 = derivar(p, b2)!
    expect(d2.niveles).toHaveLength(3)
    expect(derivar(p, 'b1')!.niveles).toHaveLength(10)
  })

  it('(h) mover la masa un módulo conserva la regla', () => {
    const d = derivar(caso(2.7), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE.map((q) => ({ x: q.x + 2.7, y: q.y })), G0))).toBe(true)
  })

  it('(i) el mismo proyecto da el mismo objeto (memo)', () => {
    const p = caso()
    expect(derivar(p, 'b1')).toBe(derivar(p, 'b1'))
  })

  it('(j) mover solo la retícula 1 m mueve los muros con ella (la placa no cambió)', () => {
    derivar(caso(), 'b1')
    const g: Grid = { ...G0, origin: { x: 1, y: 0 } }
    const d = derivar(caso(0, g), 'b1')!
    expect(d.totals.units).toBeGreaterThan(0)
    expect(enModulos(enFachada(d, TORRE, g))).toBe(true)
  })

  it('(k) una masa de Vivienda de un solo nivel en el suelo ya da departamentos (sin lobby)', () => {
    const d = derivar(proyecto([masa('vivienda', TORRE, 3), masa('nucleo', NUCLEO, 3)]), 'b1')!
    expect(d.niveles).toHaveLength(1)
    expect(d.niveles[0].lobby).toBeFalsy()
    expect(d.totals.units).toBeGreaterThan(0)
  })

  it('sin masas de vivienda ni de comercio da null', () => {
    expect(derivar(proyecto([masa('nucleo', NUCLEO, 30)]), 'b1')).toBeNull()
    expect(derivar(newProject('mixed-use'), 'b1')).toBeNull()
  })
})

