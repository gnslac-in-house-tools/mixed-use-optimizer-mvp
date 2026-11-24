import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { setParams } from '../actions.ts'
import { CapaResidencial } from '../views/CapaResidencial.tsx'
import { PropiedadesResidencial } from '../views/PropiedadesResidencial.tsx'
import { ResumenResidencial } from '../views/ResumenResidencial.tsx'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const COLORES: Record<string, string> = { studio: '#F4C3C5', br1: '#5BB58C', br2: '#A99BE6', br3: '#EE9362' }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('m2', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
})
const abre = (p: Project) => useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })

beforeEach(() => abre(caso()))

describe('vistas de uso mixto', () => {
  it('la capa de planta dibuja cada unidad de la planta tipo con el color de su tipo, y las columnas de 0.5 m', () => {
    const d = derivar(caso(), 'b1')!
    const tipo = d.niveles.find((l) => (l.layout?.units.length ?? 0) > 0)!
    const { container } = render(<svg><CapaResidencial /></svg>)
    const unidades = container.querySelectorAll('path[data-tipo]')
    expect(unidades.length).toBe(tipo.layout!.units.length)
    for (const u of unidades) expect(u.getAttribute('fill')).toBe(COLORES[u.getAttribute('data-tipo')!])
    const cols = container.querySelectorAll('rect[data-columna]')
    expect(cols.length).toBeGreaterThan(0)
    for (const c of cols) expect(Number(c.getAttribute('width'))).toBeCloseTo(0.5, 6)
  })

  it('el Resumen muestra niveles por uso, unidades por tipo, la mezcla contra la objetivo y el cálculo', () => {
    render(<ResumenResidencial />)
    const s = screen.getByRole('region', { name: 'Uso mixto' })
    expect(s).toHaveTextContent('Vivienda')
    expect(s).toHaveTextContent('2 rec.')
    expect(s).toHaveTextContent('Mezcla')
    expect(s).toHaveTextContent('objetivo')
    expect(s).toHaveTextContent('Margen')
  })

  it('las propiedades del edificio escriben con setParams, que entra al historial', () => {
    render(<PropiedadesResidencial buildingId="b1" />)
    expect(screen.getByRole('region', { name: 'Uso mixto del edificio' })).toHaveTextContent('Fondo de unidad')
    const p = setParams(caso(), 'b1', { fondo: 10.8 })
    expect(p.residential!.edificios.b1.fondo).toBe(10.8)
    expect(p.residential!.edificios.b1.pasillo).toBe(1.8)
  })

  it('en un proyecto industrial, ninguna vista dibuja nada', () => {
    abre(newProject('industrial'))
    const a = render(<svg><CapaResidencial /></svg>)
    expect(a.container.querySelector('svg')!.childElementCount).toBe(0)
    const b = render(<ResumenResidencial />)
    expect(b.container.childElementCount).toBe(0)
    const c = render(<PropiedadesResidencial buildingId="b1" />)
    expect(c.container.childElementCount).toBe(0)
  })
})
