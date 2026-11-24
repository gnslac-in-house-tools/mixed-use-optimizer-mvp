import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { datosCalificacion } from '../engine/calificacion/datos.ts'
import { potDe } from '../engine/defaults.ts'
import { derivar } from '../engine/derivar.ts'
import { setPot } from '../actions.ts'
import { PotResidencial } from '../views/PotResidencial.tsx'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 48.6, 16.2), 30), masa('m2', 'nucleo', rect(0, 5.4, 8.1, 10.8), 30)],
})

describe('el POT del proyecto', () => {
  it('por defecto: índice 9 y altura 90 m; la ocupación es la de las reglas del sitio', () => {
    const p = caso()
    expect(potDe(p)).toEqual({ indice: 9, altura: 90 })
    expect(derivar(p, 'b1')!.zoning).toEqual({ far: 9, height: 90, cov: 60 })
  })

  it('setPot cambia el índice y la altura que usan GFit y la calificación', () => {
    const p = setPot(caso(), { indice: 4.5 })
    expect(potDe(p)).toEqual({ indice: 4.5, altura: 90 })
    expect(derivar(p, 'b1')!.zoning.far).toBe(4.5)
    expect(datosCalificacion(p, p.options[0].id).indice_permitido).toBe(4.5)
  })

  it('una torre más alta que el POT da un aviso de altura', () => {
    const d = derivar(setPot(caso(), { altura: 20 }), 'b1')!
    expect(d.avisos.some((a) => /^POT: altura 30\.0 m \(máx\. 20 m\)$/.test(a))).toBe(true)
    expect(derivar(caso(), 'b1')!.avisos.some((a) => a.startsWith('POT:'))).toBe(false)
  })
})

describe('la sección POT', () => {
  beforeEach(() => {
    const p = caso()
    useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  })
  it('edita índice, altura y la ocupación máxima del sitio, cada uno un paso de deshacer', () => {
    render(<PotResidencial />)
    const s = screen.getByRole('region', { name: 'POT' })
    expect(s).toBeInTheDocument()
    const indice = screen.getByRole('textbox', { name: /Índice de edificabilidad/ })
    fireEvent.change(indice, { target: { value: '6' } }); fireEvent.blur(indice)
    expect(potDe(useApp.getState().project).indice).toBe(6)
    const ocup = screen.getByRole('textbox', { name: /Ocupación máxima/ })
    fireEvent.change(ocup, { target: { value: '45' } }); fireEvent.blur(ocup)
    expect(useApp.getState().project.site.rules.maxCoverage).toBeCloseTo(0.45, 6)
    useApp.getState().undo()
    expect(useApp.getState().project.site.rules.maxCoverage).toBeCloseTo(0.6, 6)
  })
})
