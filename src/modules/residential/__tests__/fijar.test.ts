import { describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { CIRCULACION, DEPARTAMENTO } from '../engine/deptos.ts'
import { fijarAcomodo } from '../engine/fijar.ts'
import { agregarTipologias, areaPlan, planesReferencia } from '../engine/tipologias.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { area } from '../../../engine/geom/polygon.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
function barra(conBiblioteca: boolean): Project {
  const p = newProject('mixed-use')
  const q: Project = {
    ...p, grid: G0,
    masses: [masa('v', 'vivienda', rect(0, 0, 48.6, 16.2), 9), masa('n', 'nucleo', rect(0, 5.4, 8.1, 10.8), 9)],
    residential: { ...p.residential!, edificios: { b1: { fondo: 8.1, pasillo: 1.8, mezcla: { studio: 30, br1: 45, br2: 25 }, semilla: 1 } } },
  }
  return conBiblioteca ? agregarTipologias(q) : q
}

describe('Fijar acomodo', () => {
  it('cambia la vivienda del nivel por sus departamentos (masas ligadas a un plano) y su pasillo', () => {
    const p = barra(false)
    const antes = derivar(p, 'b1')!
    const porPiso = antes.niveles[0].layout!.units.length
    const q = fijarAcomodo(p, 'b1', 'l1')
    expect(q.masses.some((m) => m.id === 'v')).toBe(false)
    const deptos = q.masses.filter((m) => m.programId === DEPARTAMENTO)
    expect(deptos.length).toBe(porPiso)
    expect(deptos.every((m) => m.depto && q.residential!.catalogo!.some((c) => c.id === m.depto!.plan))).toBe(true)
    expect(deptos.every((m) => m.height === 9)).toBe(true)
    expect(q.masses.some((m) => m.programId === CIRCULACION)).toBe(true)
    expect(q.masses.some((m) => m.id === 'n')).toBe(true)
  })

  it('después, GFit cuenta los mismos departamentos por piso, con los mismos tipos', () => {
    const p = barra(false)
    const antes = derivar(p, 'b1')!
    const despues = derivar(fijarAcomodo(p, 'b1', 'l1'), 'b1')!
    const tipos = (d: typeof antes) => d.niveles[0].layout!.units.map((u) => u.type).sort()
    expect(tipos(despues)).toEqual(tipos(antes))
    expect(despues.unidades.length).toBe(antes.niveles[0].layout!.units.length * despues.niveles.length)
  })

  it('los planos de GFit entran a Mi biblioteca una vez por tipo y medida', () => {
    const q = fijarAcomodo(barra(false), 'b1', 'l1')
    const ids = q.masses.filter((m) => m.depto).map((m) => m.depto!.plan)
    expect(new Set(ids).size).toBe(q.residential!.catalogo!.length)
  })

  it('sin vivienda en ese nivel, el proyecto queda igual', () => {
    const p = barra(false)
    expect(fijarAcomodo(p, 'b1', 'nada')).toBe(p)
  })

  it('con un plano de Mi biblioteca de su tipo, cada huella toma la medida del departamento de GFit', () => {
    const p = barra(false)
    const mio = { ...planesReferencia()[0], id: 'mio-br1', typeId: 'br1', name: 'Mío 1 rec.' }
    const q0 = { ...p, residential: { ...p.residential!, catalogo: [mio] } }
    const antes = derivar(q0, 'b1')!
    const q = fijarAcomodo(q0, 'b1', 'l1')
    const mios = q.masses.filter((m) => m.depto?.plan === 'mio-br1')
    expect(mios.length).toBeGreaterThan(0)
    const br1 = antes.niveles[0].layout!.units.filter((u) => u.type === 'br1')
    const areas = mios.map((m) => area(footprintPolygon(m.footprint))).sort((a, b) => a - b)
    expect(areas).toEqual(br1.map((u) => u.area).sort((a, b) => a - b).map((a) => expect.closeTo(a, 1)))
    expect(areaPlan(mio)).not.toBeCloseTo(areas[0], 0)
  })
})
