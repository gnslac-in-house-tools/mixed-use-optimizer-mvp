import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { DEPARTAMENTO } from '../engine/deptos.ts'
import { agregarTipologias } from '../engine/tipologias.ts'
import { Catalogo } from '../views/Catalogo.tsx'
import { PropiedadesDepto } from '../views/PropiedadesDepto.tsx'
import { PropiedadesResidencial } from '../views/PropiedadesResidencial.tsx'

const abre = (p: Project) => useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
const proyecto = () => useApp.getState().project
const deptos = () => proyecto().masses.filter((m) => m.programId === DEPARTAMENTO)

beforeEach(() => abre(newProject('mixed-use')))

describe('departamentos dibujados: la interfaz', () => {
  it('sin las tipologías de referencia, un botón las agrega a Mi biblioteca', () => {
    render(<Catalogo />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tipologías de referencia' }))
    expect((proyecto().residential!.catalogo ?? []).map((c) => c.id)).toEqual(['ref-85', 'ref-105', 'ref-150'])
  })

  it('Colocar pone un departamento de ese plano en el nivel activo y lo elige (un paso de deshacer)', () => {
    abre(agregarTipologias(newProject('mixed-use')))
    render(<Catalogo />)
    const mia = screen.getByRole('list', { name: 'Mi biblioteca' })
    fireEvent.click(within(mia).getByRole('button', { name: 'Colocar Tipología 105 m²' }))
    expect(deptos()).toHaveLength(1)
    expect(deptos()[0].depto?.plan).toBe('ref-105')
    expect(deptos()[0].levelId).toBe('l1')
    expect(useApp.getState().selection.massIds).toEqual([deptos()[0].id])
    useApp.getState().undo()
    expect(deptos()).toHaveLength(0)
  })

  it('en sus Properties: su plano (se cambia), Reflejar y, con variante, Volver al tipo', () => {
    abre(agregarTipologias(newProject('mixed-use')))
    render(<Catalogo />)
    fireEvent.click(within(screen.getByRole('list', { name: 'Mi biblioteca' })).getByRole('button', { name: 'Colocar Tipología 85 m²' }))
    const id = deptos()[0].id
    render(<PropiedadesDepto id={id} />)
    const sel = screen.getByRole('combobox', { name: 'Plano' }) as HTMLSelectElement
    expect(sel.value).toBe('ref-85')
    fireEvent.change(sel, { target: { value: 'ref-150' } })
    expect(deptos()[0].depto?.plan).toBe('ref-150')
    fireEvent.click(screen.getByRole('button', { name: 'Reflejar' }))
    expect(deptos()[0].depto?.espejo).toBe(true)
    expect(screen.queryByRole('button', { name: 'Volver al tipo' })).toBeNull()
  })

  it('Fijar acomodo, en las Properties del edificio, cambia la vivienda del nivel por sus departamentos', () => {
    const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
    const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    const masa = (id: string, programId: string, pts: Point[]): Mass => ({ id, name: id, levelId: 'l1', programId, height: 6, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } } })
    const p0 = newProject('mixed-use')
    abre({ ...p0, grid: G0, masses: [masa('v', 'vivienda', rect(0, 0, 48.6, 16.2)), masa('n', 'nucleo', rect(0, 5.4, 8.1, 10.8))] })
    render(<PropiedadesResidencial buildingId="b1" />)
    fireEvent.click(screen.getByRole('button', { name: /^Fijar acomodo/ }))
    expect(proyecto().masses.some((m) => m.id === 'v')).toBe(false)
    expect(deptos().length).toBeGreaterThan(3)
  })
})
