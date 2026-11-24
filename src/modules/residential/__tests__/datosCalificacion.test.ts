import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { DATOS_CALIFICACION, calificacionDe, datosCalificacion, mixFit } from '../engine/calificacion/datos.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const contorno = (pts: Point[]) => ({ vertices: pts.map((q) => ({ ...q, r: 0 })) })
let n = 0
const masa = (programId: string, pts: Point[], height: number): Mass => ({
  id: 'm' + ++n, name: programId + ' ' + n, levelId: 'l1', programId, height,
  footprint: { kind: 'contour', contour: contorno(pts) },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('vivienda', rect(0, 0, 32.4, 16.2), 30), masa('nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
})
const conSegundaOpcion = (p: Project): Project => ({ ...p, options: [...p.options, { ...p.options[0], id: 'o2', name: 'Copia' }] })
const suma = (p: Project, c: 'nsa' | 'gfa' | 'units' | 'req' | 'revenue' | 'cost') => {
  const o = p.options[0]
  return o.buildingIds.reduce((a, b) => a + (derivar(p, b, o.id)?.totals[c] ?? 0), 0)
}

describe('datosCalificacion', () => {
  it('lista los 12 nombres en orden', () => {
    expect(DATOS_CALIFICACION.map((d) => d.k)).toEqual([
      'm2_vendibles', 'm2_brutos', 'indice_usado', 'indice_permitido', 'ajuste_mezcla', 'unidades', 'cajones', 'ingreso', 'costo',
      'unidades_bajo_tope', 'costo_parking', 'sotanos',
    ])
  })
  it('suma derivar sobre los edificios de la opción', () => {
    const p = caso()
    const d = datosCalificacion(p, p.options[0].id)
    expect(suma(p, 'nsa')).toBeGreaterThan(0)
    expect(d.m2_vendibles).toBeCloseTo(suma(p, 'nsa'))
    expect(d.m2_brutos).toBeCloseTo(suma(p, 'gfa'))
    expect(d.unidades).toBe(suma(p, 'units'))
    expect(d.cajones).toBeCloseTo(suma(p, 'req'))
    expect(d.ingreso).toBeCloseTo(suma(p, 'revenue'))
    expect(d.costo).toBeCloseTo(suma(p, 'cost'))
  })
  it('indice_permitido es la far de zonificación de derivar; indice_usado es GFA / predio', () => {
    const p = caso()
    const o = p.options[0]
    const d = datosCalificacion(p, o.id)
    expect(d.indice_permitido).toBe(derivar(p, o.buildingIds[0], o.id)!.zoning.far)
    expect(d.indice_usado).toBeNull() // sin contorno del predio
  })
  it('indice_usado es m2_brutos / área del predio cuando hay contorno', () => {
    const p0 = caso()
    const p: Project = { ...p0, site: { ...p0.site, boundary: contorno(rect(-10, -10, 50, 30)) } }
    const d = datosCalificacion(p, p.options[0].id)
    expect(d.m2_brutos).toBeGreaterThan(0)
    expect(d.indice_usado).toBeCloseTo(d.m2_brutos! / (60 * 40), 6)
  })
  it('los datos del estacionamiento y del tope salen de derivar', () => {
    const p = caso()
    const d = datosCalificacion(p, p.options[0].id)
    const r = derivar(p, 'b1')!
    expect(d.sotanos).toBe(r.estacionamiento.sotanos)
    expect(d.costo_parking).toBeCloseTo(r.estacionamiento.costo, 6)
    expect(d.unidades_bajo_tope).toBe(r.unidades.filter((u) => u.precio <= 250000).length)
    // con un tope más alto que todos los precios, cuentan todos
    const alto: Project = { ...p, residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1, tope: 1e9 } } } }
    expect(datosCalificacion(alto, alto.options[0].id).unidades_bajo_tope).toBe(r.unidades.length)
    expect(d.ajuste_mezcla).toBeGreaterThanOrEqual(0)
    expect(d.ajuste_mezcla).toBeLessThanOrEqual(1)
  })
  it('con una sola opción, las cinco palancas tienen calificación', () => {
    const p = caso()
    const c = calificacionDe(p, p.options[0].id)
    for (const x of c.palancas) expect(x.rating, x.palanca).not.toBeNull()
  })
  it('sin masas residenciales todo es null y calificacionDe no lanza', () => {
    const p = { ...newProject('mixed-use'), masses: [] }
    const d = datosCalificacion(p, p.options[0].id)
    for (const k of DATOS_CALIFICACION) expect(d[k.k]).toBeNull()
    expect(calificacionDe(p).puntaje).toBeNull()
  })
  it('una copia de la opción califica precio_m2 en 0', () => {
    const p = conSegundaOpcion(caso())
    const c = calificacionDe(p, p.options[0].id)
    const t = c.palancas.flatMap((x) => x.trazas).find((x) => x.variable.id === 'precio_m2')!
    expect(t.rating).toBe(0)
    expect(calificacionDe(p, p.options[0].id)).toBe(c)
  })
})

describe('mixFit', () => {
  it('1 si coinciden, 0 si son ajenas', () => {
    expect(mixFit({ a: 50, b: 50 }, { a: 0.5, b: 0.5 })).toBe(1)
    expect(mixFit({ a: 100 }, { b: 1 })).toBe(0)
  })
})
