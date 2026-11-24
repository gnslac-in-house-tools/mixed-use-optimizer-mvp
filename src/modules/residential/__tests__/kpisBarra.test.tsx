// La barra de KPIs con el juego «Calificación» (spec §4): el interruptor «KPIs: Calificación · Proyecto», las 7 celdas
// del juego, la elección que se guarda en el navegador, el clic que abre la palanca y la barra de siempre sin el módulo.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../App.tsx'
import { derive } from '../../../engine/derive.ts'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { chosenKpis, kpiCatalog } from '../../catalog.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { useUi } from '../../../views/layout/ui.ts'
import { PALANCAS, PALANCA_ES } from '../engine/calificacion/reglas.ts'
import { JUEGO_CALIFICACION } from '../kpisCalificacion.ts'
import { JUEGO_KEY, useJuegoKpis } from '../views/calificacion/juegoKpis.ts'
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

const barra = () => screen.getByRole('region', { name: 'Project figures' })
const celdas = () => within(barra()).getAllByRole('group').filter((g) => g.getAttribute('aria-label') !== 'KPIs')
const nombres = () => celdas().map((g) => g.getAttribute('aria-label'))
const etiqueta = (p: Project, id: string) => kpiCatalog(p).find((k) => k.id === id)!.label

beforeEach(() => {
  localStorage.removeItem(JUEGO_KEY)
  useJuegoKpis.setState({ juego: 'calificacion' })
  abre(caso())
  useUi.setState({ dialog: null, view: 'plan', rail: 'layers', panels: { left: true, right: true }, sheet: null, summaryTab: 'overview', help: false, kpiSize: 'full' })
  usePalancasAbiertas.setState({ abiertas: [] })
})
afterEach(() => localStorage.removeItem(JUEGO_KEY))

describe('la barra de KPIs con el juego Calificación', () => {
  it('con el módulo residencial: el grupo «KPIs» con «Calificación» presionado y 7 celdas', () => {
    render(<App />)
    const grupo = within(barra()).getByRole('group', { name: 'KPIs' })
    expect(within(grupo).getByRole('button', { name: 'Calificación' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(grupo).getByRole('button', { name: 'Proyecto' })).toHaveAttribute('aria-pressed', 'false')
    const p = useApp.getState().project
    expect(nombres()).toEqual(JUEGO_CALIFICACION.map((id) => etiqueta(p, id)))
    expect(celdas()).toHaveLength(7)
    const puntaje = celdas()[0]
    expect(puntaje).toHaveTextContent(/de 5 palancas/)
    expect(puntaje).toHaveTextContent('provisional')
    expect(celdas()[1]).toHaveTextContent(/de \d+ variables · ×1/)
    expect(barra().textContent).not.toMatch(/NaN|Infinity/)
  })

  it('«Proyecto» muestra los KPIs del proyecto más el puntaje; la elección sobrevive a recargar el store', async () => {
    render(<App />)
    fireEvent.click(within(barra()).getByRole('button', { name: 'Proyecto' }))
    expect(within(barra()).getByRole('button', { name: 'Proyecto' })).toHaveAttribute('aria-pressed', 'true')
    const p = useApp.getState().project
    const ids = chosenKpis(p)
    expect(nombres()).toEqual([...ids.filter((id) => id !== 'issues'), 'calif-puntaje', ...ids.filter((id) => id === 'issues')].map((id) => etiqueta(p, id)))
    expect(localStorage.getItem(JUEGO_KEY)).toBe('proyecto')
    vi.resetModules()
    const otra = await import('../views/calificacion/juegoKpis.ts')
    expect(otra.useJuegoKpis.getState().juego).toBe('proyecto')
  })

  it('un clic en la celda de una palanca abre la pestaña Calificación con esa palanca', () => {
    render(<App />)
    const p = PALANCAS[2]
    const celda = within(barra()).getByRole('group', { name: PALANCA_ES[p] })
    fireEvent.click(within(celda).getByRole('button'))
    expect(useUi.getState().summaryTab).toBe('calificacion')
    expect(usePalancasAbiertas.getState().abiertas).toEqual([p])
  })

  it('sin masas residenciales: las celdas dicen «—» / «sin datos» y nada falla', () => {
    abre(newProject('mixed-use'))
    render(<App />)
    expect(celdas()).toHaveLength(7)
    expect(celdas()[0]).toHaveTextContent('—')
    expect(celdas()[0]).toHaveTextContent('sin datos')
    expect(celdas()[1]).toHaveTextContent('—')
    expect(barra().textContent).not.toMatch(/NaN|Infinity/)
  })

  it('en una tipología sin el módulo (Warehouse) no hay interruptor y la barra es la de siempre', () => {
    const p = newProject('industrial')
    abre(p)
    render(<App />)
    expect(within(barra()).queryByRole('group', { name: 'KPIs' })).toBeNull()
    expect(within(barra()).queryByRole('button', { name: 'Proyecto' })).toBeNull()
    expect(nombres()).toEqual(chosenKpis(p).map((id) => etiqueta(p, id)))
    expect(nombres()).not.toContain('Calificación')
  })
})
