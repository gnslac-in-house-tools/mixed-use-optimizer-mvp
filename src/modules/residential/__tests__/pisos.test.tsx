import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Grid, Mass, Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { BarraPisos } from '../views/BarraPisos.tsx'
import { CapaResidencial } from '../views/CapaResidencial.tsx'
import { ResumenResidencial } from '../views/ResumenResidencial.tsx'
import { usePiso } from '../views/piso.ts'

const G0: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, programId: string, pts: Point[], height: number): Mass => ({
  id, name: id, levelId: 'l1', programId, height, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } },
})
const caso = (): Project => ({
  ...newProject('mixed-use'), grid: G0,
  masses: [masa('m1', 'vivienda', rect(0, 0, 48.6, 16.2), 30), masa('m2', 'nucleo', rect(0, 5.4, 8.1, 10.8), 30)],
})

beforeEach(() => {
  const p = caso()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: NO_SELECTION, level: 'l1', showAll: false, option: 'o1' })
  usePiso.setState({ piso: null })
})

describe('pisos y estacionamiento de uso mixto', () => {
  it('la barra lista Tipo, el sótano y cada nivel; un nivel elegido se dibuja en planta', () => {
    const d = derivar(caso(), 'b1')!
    render(<BarraPisos />)
    const barra = screen.getByRole('toolbar', { name: 'Pisos de uso mixto' })
    expect(within(barra).getByRole('button', { name: 'Tipo' })).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: /^S1/ })).toBeInTheDocument()
    fireEvent.click(within(barra).getByRole('button', { name: '4' }))
    expect(usePiso.getState().piso).toBe(3)
    expect(barra).toHaveTextContent(`${d.niveles[3].units} deptos`)
    const { container } = render(<svg><CapaResidencial /></svg>)
    expect(container.querySelectorAll('path[data-tipo]').length).toBe(d.niveles[3].layout!.units.length)
  })

  it('el sótano dibuja sus cajones en planta y la barra dice cuántos', () => {
    const d = derivar(caso(), 'b1')!
    act(() => usePiso.setState({ piso: 'sotano' }))
    render(<BarraPisos />)
    expect(screen.getByRole('toolbar', { name: 'Pisos de uso mixto' })).toHaveTextContent(`${d.estacionamiento.porSotano} cajones c/u`)
    const { container } = render(<svg><CapaResidencial /></svg>)
    expect(container.querySelectorAll('[data-sotano] path[data-cajon]').length).toBe(d.estacionamiento.porSotano)
    expect(container.querySelectorAll('path[data-tipo]').length).toBe(0)
    expect(container.querySelectorAll('[data-sotano] path[data-rampa]').length).toBe(d.estacionamiento.plano.rampas.length)
    expect(container.querySelectorAll('[data-sotano] path[data-nucleo-sotano]').length).toBe(1)
  })

  it('el Resumen trae los sótanos, los cajones y su costo', () => {
    render(<ResumenResidencial />)
    const s = screen.getByRole('region', { name: 'Uso mixto' })
    expect(s).toHaveTextContent('Sótanos')
    expect(s).toHaveTextContent('Cajones en sótanos')
    expect(s).toHaveTextContent('Costo del estacionamiento')
  })
})
