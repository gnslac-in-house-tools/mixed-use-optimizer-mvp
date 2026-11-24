// La ventana «Reglas de calificación» (spec §6): se abre desde Design, edita un borrador y solo Aplicar lo escribe en el
// proyecto (un paso de deshacer); ✕, Esc, un clic afuera o Cancelar lo descartan. La lista de palancas y variables, la
// fórmula evaluada al teclear, los chips, los umbrales validados al salir, el peso, Restablecer e Importar Excel….
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { kpiCatalog } from '../../catalog.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { pickMenu } from '../../../views/__tests__/pickMenu.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { calificacionDe } from '../engine/calificacion/datos.ts'
import { PALANCAS, PALANCA_ES, REGLAS_INICIO, reglasDe } from '../engine/calificacion/reglas.ts'
import { usePalancasAbiertas } from '../views/calificacion/useCalificacion.ts'

vi.mock('../../../views/scene/Scene.tsx', () => ({ Scene: () => <div data-testid="scene" /> }))

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 32.4, 16.2), 30), masa('m2', 'nucleo', rect(12.15, 5.4, 20.25, 10.8), 30)],
})
const abre = (p: Project) =>
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: p.options[0].id })

beforeEach(() => {
  localStorage.clear()
  abre(caso())
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, summaryTab: 'overview', help: false })
  usePalancasAbiertas.setState({ abiertas: [] })
})

const ventana = () => screen.getByRole('dialog', { name: 'Reglas de calificación' })
const abrir = () => {
  render(<App />)
  pickMenu('Design', 'Reglas de calificación…')
  return ventana()
}
const lista = () => within(ventana()).getByRole('region', { name: 'Palancas y variables' })
const editor = () => within(ventana()).getByRole('region', { name: 'Variable elegida' })
const elegir = (nombre: string) => fireEvent.click(within(lista()).getByRole('button', { name: new RegExp('^' + nombre.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')) }))
const aplicar = () => within(ventana()).getByRole('button', { name: 'Aplicar' })
const salir = (el: HTMLElement, valor: string) => {
  fireEvent.change(el, { target: { value: valor } })
  fireEvent.blur(el)
}

describe('la ventana Reglas de calificación', () => {
  it('Design › Reglas de calificación… la abre; ✕, Escape y un clic en el fondo la cierran sin tocar el proyecto', () => {
    const antes = useApp.getState().project
    abrir()
    fireEvent.click(within(ventana()).getByRole('button', { name: 'Close the Reglas de calificación' }))
    expect(screen.queryByRole('dialog', { name: 'Reglas de calificación' })).toBeNull()
    pickMenu('Design', 'Reglas de calificación…')
    fireEvent.keyDown(ventana(), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Reglas de calificación' })).toBeNull()
    pickMenu('Design', 'Reglas de calificación…')
    const fondo = ventana().closest('[data-dialog-backdrop]')!
    fireEvent.mouseDown(fondo, { target: fondo })
    expect(screen.queryByRole('dialog', { name: 'Reglas de calificación' })).toBeNull()
    expect(useApp.getState().project).toBe(antes)
  })

  it('Cancelar tras editar un nombre descarta el borrador', () => {
    const antes = useApp.getState().project
    abrir()
    salir(within(editor()).getByRole('textbox', { name: 'Nombre de la variable' }), 'Otro nombre')
    expect(within(lista()).getByRole('button', { name: /^Otro nombre/ })).toBeInTheDocument()
    fireEvent.click(within(ventana()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Reglas de calificación' })).toBeNull()
    expect(useApp.getState().project).toBe(antes)
    expect(reglasDe(useApp.getState().project)).toBe(REGLAS_INICIO)
  })

  it('sin el módulo, la fila de Design está desactivada', () => {
    abre(newProject('industrial'))
    render(<App />)
    pickMenu('Design')
    const fila = within(screen.getAllByRole('menu').at(-1)!).getByText('Reglas de calificación…').closest('[data-menu-key]')!
    expect(fila).toBeDisabled()
    expect(fila).toHaveAttribute('title', 'Only with the Uso mixto typology')
  })

  it('la lista: 5 palancas y 8 variables; un clic lleva la variable al editor', () => {
    abrir()
    expect(within(lista()).getAllByRole('group')).toHaveLength(5)
    for (const p of PALANCAS) expect(within(lista()).getByRole('group', { name: PALANCA_ES[p] })).toBeInTheDocument()
    expect(lista().querySelectorAll('[data-variable]')).toHaveLength(8)
    elegir('Costo por m² vendible')
    expect(within(editor()).getByRole('textbox', { name: 'Nombre de la variable' })).toHaveValue('Costo por m² vendible')
  })

  it('la fórmula se evalúa al teclear: un nombre ajeno marca el error, la lista, el pie y Aplicar', () => {
    abrir()
    elegir('Costo por m² vendible')
    const fx = within(editor()).getByRole('textbox', { name: 'Fórmula' })
    fireEvent.change(fx, { target: { value: 'costo / m2_vendibles * foo' } })
    expect(editor()).toHaveTextContent('«foo» no es un dato del proyecto')
    expect(within(lista()).getByRole('button', { name: /^Costo por m² vendible/ })).toHaveTextContent('⚠')
    expect(aplicar()).toBeDisabled()
    expect(ventana()).toHaveTextContent('1 variable con error')
    fireEvent.change(fx, { target: { value: 'costo / m2_vendibles' } })
    expect(aplicar()).toBeEnabled()
  })

  it('un chip con el cursor al final inserta su nombre, con un espacio', () => {
    abrir()
    elegir('Costo por m² vendible')
    const fx = within(editor()).getByRole('textbox', { name: 'Fórmula' }) as HTMLInputElement
    act(() => {
      fx.focus()
      fx.setSelectionRange(fx.value.length, fx.value.length)
    })
    fireEvent.select(fx)
    fireEvent.click(within(editor()).getByRole('button', { name: 'm2_brutos' }))
    expect(fx).toHaveValue('costo / m2_vendibles m2_brutos')
  })

  it('umbrales fuera de orden, al salir del campo, ponen la frase en rojo; en mediana van en %', () => {
    abrir()
    elegir('Uso del índice de edificabilidad')
    salir(within(editor()).getByRole('textbox', { name: '+1 desde' }), '0.99')
    expect(editor()).toHaveTextContent('Los umbrales deben ir de mayor a menor (+2 → −1).')
    expect(aplicar()).toBeDisabled()
    // Ingreso por m² vendible: sobre la mediana, umbrales 0.05 0.02 −0.02 −0.05
    elegir('Ingreso por m² vendible')
    const mas2 = within(editor()).getByRole('textbox', { name: '+2 desde' })
    expect(mas2).toHaveValue('5')
    expect(mas2.parentElement).toHaveTextContent('%')
    salir(mas2, '8')
    elegir('Uso del índice de edificabilidad')
    salir(within(editor()).getByRole('textbox', { name: '+1 desde' }), '0.85')
    fireEvent.click(aplicar())
    const v = reglasDe(useApp.getState().project).variables.find((x) => x.id === 'precio_m2')!
    expect(v.steps[0]).toBeCloseTo(0.08)
  })

  it('el modo se elige entre los cuatro', () => {
    abrir()
    elegir('Número de sótanos')
    const modo = within(editor()).getByRole('group', { name: 'Modo' })
    expect(within(modo).getAllByRole('button').map((b) => b.textContent)).toEqual(['Mayor es mejor', 'Menor es mejor', 'Sobre la mediana', 'Bajo la mediana'])
    expect(within(modo).getByRole('button', { name: 'Menor es mejor' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(modo).getByRole('button', { name: 'Sobre la mediana' }))
    expect(within(modo).getByRole('button', { name: 'Sobre la mediana' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('«+» sube el peso de m² vendibles a 1.5 y su barra dice 27%', () => {
    abrir()
    const g = within(lista()).getByRole('group', { name: PALANCA_ES.m2_vendibles })
    fireEvent.click(within(g).getByRole('button', { name: `Subir el peso de ${PALANCA_ES.m2_vendibles}` }))
    expect(within(g).getByRole('textbox', { name: `Peso de ${PALANCA_ES.m2_vendibles}` })).toHaveValue('1.5')
    expect(g).toHaveTextContent('27%')
  })

  it('Aplicar escribe las reglas en un paso de deshacer y el puntaje se recalcula', () => {
    abrir()
    const p0 = useApp.getState().project
    const c0 = calificacionDe(p0, useApp.getState().derived.option)
    const r = c0.palancas.find((l) => l.palanca === 'm2_vendibles')!.rating ?? 0
    expect(r).not.toBe(0) // que el peso nuevo mueva el puntaje
    const g = within(lista()).getByRole('group', { name: PALANCA_ES.m2_vendibles })
    fireEvent.click(within(g).getByRole('button', { name: `Subir el peso de ${PALANCA_ES.m2_vendibles}` }))
    fireEvent.click(aplicar())
    expect(screen.queryByRole('dialog', { name: 'Reglas de calificación' })).toBeNull()
    const { project, derived } = useApp.getState()
    expect(project.residential!.calificacion!.weights.m2_vendibles).toBe(1.5)
    const kpi = kpiCatalog(project).find((k) => k.id === 'calif-puntaje')!
    expect(kpi.read(project, derived)).toBe(c0.puntaje! + 0.5 * r)
    act(() => useApp.getState().undo())
    expect(useApp.getState().project.residential!.calificacion).toBeUndefined()
    expect(reglasDe(useApp.getState().project)).toBe(REGLAS_INICIO)
  })

  it('Restablecer vuelve a las reglas de inicio; Importar Excel… está desactivado, «Por decidir»', () => {
    abrir()
    const g = within(lista()).getByRole('group', { name: PALANCA_ES.m2_vendibles })
    fireEvent.click(within(g).getByRole('button', { name: `Subir el peso de ${PALANCA_ES.m2_vendibles}` }))
    fireEvent.click(within(editor()).getByRole('button', { name: 'Quitar' }))
    expect(lista().querySelectorAll('[data-variable]')).toHaveLength(7)
    fireEvent.click(within(ventana()).getByRole('button', { name: 'Restablecer' }))
    expect(lista().querySelectorAll('[data-variable]')).toHaveLength(8)
    expect(within(g).getByRole('textbox', { name: `Peso de ${PALANCA_ES.m2_vendibles}` })).toHaveValue('1')
    const excel = within(ventana()).getByRole('button', { name: 'Importar Excel…' })
    expect(excel).toBeDisabled()
    expect(excel).toHaveAttribute('title', 'Por decidir')
  })

  it('«+ Variable» agrega una a su palanca y la lleva al editor', () => {
    abrir()
    const g = within(lista()).getByRole('group', { name: PALANCA_ES.plazo_riesgo })
    fireEvent.click(within(g).getByRole('button', { name: '+ Variable' }))
    expect(lista().querySelectorAll('[data-variable]')).toHaveLength(9)
    expect(within(editor()).getByRole('textbox', { name: 'Nombre de la variable' })).toHaveValue('Nueva variable')
    expect(within(editor()).getByRole('combobox', { name: 'Palanca' })).toHaveValue('plazo_riesgo')
  })
})
