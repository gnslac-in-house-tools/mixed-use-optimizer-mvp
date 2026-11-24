import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { useUi } from '../../../views/layout/ui.ts'
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { Catalogo } from '../views/Catalogo.tsx'
import { useEditorUnidad } from '../views/editorUnidad.ts'
import { VentanaUnidad } from '../views/VentanaUnidad.tsx'

const r = (x0: number, x1: number) => [[x0, 0], [x1, 0], [x1, 8.1], [x0, 8.1]] as [number, number][]
const TRES: PlanCatalogo = {
  id: 'C1', name: 'Prueba', origen: 'manual', typeId: 'br1', w: 8.1, d: 8.1,
  rooms: [{ kind: 'living', name: 'Estar', shape: r(0, 3) }, { kind: 'bath', name: 'Baño', shape: r(3, 5.4) }, { kind: 'bed', name: 'Dormitorio', shape: r(5.4, 8.1) }],
  muebles: [], reglas: { cama: 'queen', comedor: 4, paso: 0.75, closets: true },
}
const abre = (catalogo: PlanCatalogo[] = []) => {
  const p0 = newProject('mixed-use')
  const p = { ...p0, residential: { ...p0.residential!, catalogo } }
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
}
const plan = () => useApp.getState().project.residential!.catalogo!.find((x) => x.id === useEditorUnidad.getState().id)!

beforeEach(() => { abre(); useUi.getState().closeDialog?.() })

describe('la pestaña Departamentos', () => {
  it('lista la Biblioteca GFit; ✎ copia el plano a Mi biblioteca y abre el editor (un paso de deshacer)', () => {
    render(<Catalogo />)
    const gfit = screen.getByRole('list', { name: 'Biblioteca GFit' })
    const lapices = within(gfit).getAllByRole('button', { name: /^Copiar y editar / })
    expect(lapices.length).toBeGreaterThan(3)
    fireEvent.click(lapices[0])
    expect(useApp.getState().project.residential!.catalogo).toHaveLength(1)
    expect(useUi.getState().dialog).toBe('unidad')
    expect(useEditorUnidad.getState().id).toBe(useApp.getState().project.residential!.catalogo![0].id)
    useApp.getState().undo()
    expect(useApp.getState().project.residential!.catalogo ?? []).toHaveLength(0)
  })
})

describe('la ventana Departamento', () => {
  beforeEach(() => { abre([TRES]); useEditorUnidad.getState().abrir('C1') })

  it('teclear una cota mueve su muro', () => {
    render(<VentanaUnidad />)
    const c = screen.getByRole('textbox', { name: 'Cota Frente 1' })
    fireEvent.change(c, { target: { value: '3.6' } })
    fireEvent.blur(c)
    expect(plan().rooms[0].shape.map((q) => q[0])).toContain(3.6)
  })

  it('el candado fija una cota: queda bloqueada y viaja con su muro', () => {
    render(<VentanaUnidad />)
    fireEvent.click(screen.getByRole('button', { name: 'Fijar Frente 2' }))
    expect(plan().fijas).toEqual({ x: [1], y: [] })
    expect(screen.getByRole('textbox', { name: 'Cota Frente 2' })).toBeDisabled()
    const c = screen.getByRole('textbox', { name: 'Cota Frente 1' })
    fireEvent.change(c, { target: { value: '2.4' } })
    fireEvent.blur(c)
    expect(plan().rooms[1].shape.map((q) => q[0]).sort()).toEqual([2.4, 2.4, 4.8, 4.8])
  })

  it('Recinto: un clic elige el recinto y su uso cambia a Pasillo', () => {
    const { container } = render(<VentanaUnidad />)
    fireEvent.click(screen.getByRole('button', { name: 'Recinto' }))
    fireEvent.click(container.querySelector('[data-recinto="1"]')!)
    fireEvent.change(screen.getByRole('combobox', { name: 'Uso del recinto' }), { target: { value: 'hall' } })
    expect(plan().rooms[1]).toMatchObject({ kind: 'hall', name: 'Pasillo' })
  })

  it('el grafo se prende y se apaga', () => {
    const { container } = render(<VentanaUnidad />)
    expect(container.querySelector('[data-grafo]')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grafo' }))
    expect(container.querySelectorAll('[data-grafo] circle')).toHaveLength(3)
  })
})
