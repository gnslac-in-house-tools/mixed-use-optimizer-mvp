import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { readKpi } from '../../catalog.ts'
import { newProject } from '../../../typologies/index.ts'
import { calificacionDe } from '../engine/calificacion/datos.ts'
import { PALANCAS, PALANCA_ES, reglasDe } from '../engine/calificacion/reglas.ts'
import { JUEGO_CALIFICACION, KPIS_CALIFICACION, esKpiCalificacion, kpisCalificacion } from '../kpisCalificacion.ts'
import { residential } from '../module.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('m2', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
})
const valor = (id: string, p: Project) => readKpi(id, p, derive(p))?.value ?? null

describe('KPIs de la calificación', () => {
  it('leen el puntaje y el rating de cada palanca', () => {
    const p = caso()
    const c = calificacionDe(p)
    expect(c.puntaje).not.toBeNull()
    expect(valor('calif-puntaje', p)).toBe(c.puntaje)
    for (const x of c.palancas) expect(valor('calif-' + x.palanca, p), x.palanca).toBe(x.rating)
  })

  it('sin masas, todos dan null', () => {
    const p = newProject('mixed-use')
    for (const id of JUEGO_CALIFICACION.filter((i) => i !== 'issues')) expect(valor(id, p), id).toBeNull()
  })

  it('el juego tiene 7 ids en orden', () => {
    expect(JUEGO_CALIFICACION).toEqual(['calif-puntaje', ...PALANCAS.map((x) => 'calif-' + x), 'issues'])
    expect(JUEGO_CALIFICACION).toHaveLength(7)
  })

  it('etiquetas, ayuda y reconocimiento de ids', () => {
    const p = caso()
    const ks = kpisCalificacion(p)
    expect(ks.map((k) => k.id)).toEqual(KPIS_CALIFICACION.map((k) => k.id))
    expect(ks[0].label).toBe('Calificación')
    PALANCAS.forEach((x, i) => expect(ks[i + 1].label).toBe(PALANCA_ES[x]))
    for (const k of ks) { expect(k.help).toBe(reglasDe(p).source); expect(k.unit).toBe('count'); expect(k.area).toBe('massing'); expect(k.aim).toBe(false) }
    expect(esKpiCalificacion('calif-puntaje')).toBe(true)
    expect(esKpiCalificacion('res-gfa')).toBe(false)
  })

  it('el estado del puntaje: within si > 0, over si < 0, null si 0 o sin dato', () => {
    const p = caso()
    const d = derive(p)
    expect(readKpi('calif-puntaje', newProject('mixed-use'), derive(newProject('mixed-use')))?.status).toBeNull()
    const s = readKpi('calif-puntaje', p, d)!
    expect(s.status).toBe(s.value! > 0 ? 'within' : s.value! < 0 ? 'over' : null)
  })

  it('el módulo los suma a los de uso mixto', () => {
    const ids = residential.kpis(caso()).map((k) => k.id)
    expect(ids).toContain('calif-puntaje')
    expect(ids).toContain('res-gfa')
  })
})
