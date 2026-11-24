// La pestaña «Calificación» del Resumen: el puntaje, las 5 palancas que se despliegan, la ayuda oculta (tarjeta al pasar
// el cursor o con el foco, en línea con el ? de GIM), el estado vacío y el botón que abre las reglas.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { calificacionDe } from '../engine/calificacion/datos.ts'
import { PALANCAS, PALANCA_ES } from '../engine/calificacion/reglas.ts'
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

const sgn = (r: number) => (r > 0 ? '+' + r : r < 0 ? '−' + Math.abs(r) : '0')
const openDialog = useUi.getState().openDialog

beforeEach(() => {
  localStorage.clear()
  abre(caso())
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, summaryTab: 'overview', help: false })
  usePalancasAbiertas.setState({ abiertas: [] })
})
afterEach(() => useUi.setState({ openDialog }))

const pestana = () => {
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Summary' })).getByRole('tab', { name: 'Calificación' }))
  return screen.getByRole('tabpanel', { name: 'Calificación' })
}
const palanca = (panel: HTMLElement, nombre: string) => within(panel).getByRole('button', { name: new RegExp('^' + nombre.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + ':') })

describe('la pestaña Calificación', () => {
  it('el riel del Resumen la tiene; muestra el puntaje y las 5 palancas con su calificación y peso', () => {
    render(<App />)
    const panel = pestana()
    const c = calificacionDe(useApp.getState().project, useApp.getState().derived.option)
    expect(c.puntaje).not.toBeNull()
    expect(within(panel).getByRole('group', { name: 'Puntaje' })).toHaveTextContent(sgn(c.puntaje!))
    expect(panel).toHaveTextContent('provisional')
    for (const x of c.palancas) {
      const b = palanca(panel, PALANCA_ES[x.palanca])
      expect(b).toHaveAttribute('aria-label', `${PALANCA_ES[x.palanca]}: ${x.rating == null ? 'sin datos' : sgn(x.rating)}, peso 1`)
    }
    expect(PALANCAS.map((p) => palanca(panel, PALANCA_ES[p]))).toHaveLength(5)
    expect(panel.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('un clic en una palanca alterna aria-expanded', () => {
    render(<App />)
    const b = palanca(pestana(), PALANCA_ES.m2_vendibles)
    expect(b).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'false')
  })

  it('sin ayuda, la fuente va oculta y sale en una tarjeta al pasar el cursor o con el foco', () => {
    render(<App />)
    const panel = pestana()
    fireEvent.click(palanca(panel, PALANCA_ES.m2_vendibles))
    expect(panel).not.toHaveTextContent('Fuente')
    const v = within(panel).getByRole('group', { name: /^Eficiencia vendible \/ bruta/ })
    fireEvent.mouseEnter(v)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Por qué')
    expect(tip).toHaveTextContent('Fórmula')
    expect(tip).toHaveTextContent('Fuente')
    expect(tip).toHaveTextContent('m2_vendibles / m2_brutos')
    expect(panel.contains(tip)).toBe(false) // un portal en document.body
    fireEvent.mouseLeave(v)
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => v.focus())
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fuente')
    act(() => v.blur())
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('con la ayuda encendida, la fuente va en línea y no sale la tarjeta', () => {
    useUi.setState({ help: true })
    render(<App />)
    const panel = pestana()
    fireEvent.click(palanca(panel, PALANCA_ES.m2_vendibles))
    expect(panel).toHaveTextContent('Fuente')
    expect(panel).toHaveTextContent('NRD-2 · núcleo y circulación')
    fireEvent.mouseEnter(within(panel).getByRole('group', { name: /^Eficiencia vendible \/ bruta/ }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('sin masas residenciales: «sin datos» en el puntaje y ningún error', () => {
    abre(newProject('mixed-use'))
    render(<App />)
    const panel = pestana()
    expect(within(panel).getByRole('group', { name: 'Puntaje' })).toHaveTextContent('sin datos')
    for (const p of PALANCAS) expect(palanca(panel, PALANCA_ES[p])).toHaveAttribute('aria-label', `${PALANCA_ES[p]}: sin datos, peso 1`)
    fireEvent.click(palanca(panel, PALANCA_ES.costo_obra))
    expect(panel.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('un proyecto industrial (sin el módulo) tampoco rompe la pestaña', () => {
    abre(newProject('industrial'))
    render(<App />)
    expect(within(pestana()).getByRole('group', { name: 'Puntaje' })).toHaveTextContent('sin datos')
  })

  it('«Editar reglas…» abre la ventana de reglas', () => {
    const spy = vi.fn()
    useUi.setState({ openDialog: spy })
    render(<App />)
    fireEvent.click(within(pestana()).getByRole('button', { name: 'Editar reglas…' }))
    expect(spy).toHaveBeenCalledWith('calificacion')
  })
})
