import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { readKpi } from '../../catalog.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('m2', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
})
const IDS = ['res-gfa', 'res-vendible', 'res-unidades', 'res-cajones', 'res-margen']
const valor = (id: string, p: Project) => readKpi(id, p, derive(p))?.value ?? null

describe('KPIs de uso mixto', () => {
  it('leen los totales de derivar', () => {
    const p = caso()
    const t = derivar(p, 'b1')!.totals
    expect(valor('res-gfa', p)).toBeCloseTo(t.gfa, 6)
    expect(valor('res-vendible', p)).toBeCloseTo(t.nsa, 6)
    expect(valor('res-unidades', p)).toBe(t.units)
    expect(valor('res-cajones', p)).toBe(t.req)
    expect(t.revenue).toBeGreaterThan(0)
    // los KPIs 'pct' de GIM son fracciones (0.6 se lee 60 %)
    expect(valor('res-margen', p)).toBeCloseTo((t.revenue - t.cost) / t.revenue, 6)
  })

  it('sin masas, todos dan null', () => {
    const p = newProject('mixed-use')
    for (const id of IDS) expect(valor(id, p), id).toBeNull()
  })

  it('un proyecto nuevo de uso mixto trae los cinco en la barra, en orden', () => {
    expect(newProject('mixed-use').kpis).toEqual(IDS)
  })
})
