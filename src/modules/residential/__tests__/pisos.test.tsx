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
import { useInteriors } from '../../../views/show/interiors.ts'
import { InteriorsControls } from '../../../views/show/InteriorsControls.tsx'
import { bibliotecaGFit, TIPOS } from '../engine/catalogo.ts'

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
  useInteriors.setState({ interiors: false, furniture: false })
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

  it('Programs (barra inferior) dibuja los recintos de cada departamento del piso, con su nombre; Furniture, sus muebles', () => {
    const d = derivar(caso(), 'b1')!
    render(<BarraPisos />)
    const barra = screen.getByRole('toolbar', { name: 'Pisos de uso mixto' })
    fireEvent.click(within(barra).getByRole('button', { name: '4' }))
    const { container } = render(<svg><CapaResidencial /></svg>)
    render(<InteriorsControls />)
    const inferior = screen.getByRole('toolbar', { name: 'Interiors' })
    expect(container.querySelectorAll('path[data-recinto-unidad]').length).toBe(0)
    fireEvent.click(within(inferior).getByRole('button', { name: 'Programs' }))
    const n = d.niveles[3].layout!.units.reduce((s, u) => s + u.rooms.length, 0)
    expect(n).toBeGreaterThan(0)
    expect(container.querySelectorAll('path[data-recinto-unidad]').length).toBe(n)
    expect(container.querySelector('[data-capa="residencial"] text')).not.toBeNull()
    expect(container.querySelectorAll('[data-muebles]').length).toBe(0)
    fireEvent.click(within(inferior).getByRole('button', { name: 'Furniture' }))
    expect(container.querySelectorAll('[data-muebles] .mueble').length).toBeGreaterThan(0)
    // los muebles van también sin los recintos
    fireEvent.click(within(inferior).getByRole('button', { name: 'Programs' }))
    expect(container.querySelectorAll('path[data-recinto-unidad]').length).toBe(0)
    expect(container.querySelectorAll('[data-muebles] .mueble').length).toBeGreaterThan(0)
  })

  it('pieza 4: con un plano de 2 rec. en Mi biblioteca, los 2 rec. del piso lo usan (con muebles); los demás, el de GFit', () => {
    const p0 = caso()
    const mio = { ...bibliotecaGFit(TIPOS, 8.1).find((x) => x.typeId === 'br2')!, id: 'C1', name: 'Mi 2 rec.' }
    const p = { ...p0, residential: { ...p0.residential!, catalogo: [mio] } }
    useApp.setState({ project: p, derived: derive(p) })
    usePiso.setState({ piso: 3 })
    useInteriors.setState({ interiors: true, furniture: true })
    const d = derivar(p, 'b1')!
    const br2 = d.niveles[3].layout!.units.filter((u) => u.type === 'br2').length
    expect(br2).toBeGreaterThan(0)
    const { container } = render(<svg><CapaResidencial /></svg>)
    expect(container.querySelectorAll('[data-interior="mi-biblioteca"]').length).toBe(br2)
    expect(container.querySelectorAll('[data-interior="gfit"]').length).toBe(d.niveles[3].layout!.units.length - br2)
    expect(container.querySelectorAll('[data-interior="mi-biblioteca"] .mueble').length).toBeGreaterThan(0)
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
    // como Praktico: un número por cajón, una flecha de sentido por pasillo y el rótulo de la rampa
    expect(container.querySelectorAll('[data-sotano] text[data-cajon-n]').length).toBe(d.estacionamiento.porSotano)
    expect(container.querySelectorAll('[data-sotano] path[data-flecha]').length).toBe(d.estacionamiento.plano.flechas.length)
    expect(container.querySelector('[data-sotano] text[data-rampa-rotulo]')).toHaveTextContent('Rampa')
  })

  it('la planta del nivel de calle dibuja la rampa del S1 y su boca alta con «Rampa ↓»; los demás niveles no', () => {
    const d = derivar(caso(), 'b1')!
    const rp = d.estacionamiento.plano.rampa!
    const calle = d.niveles.findIndex((l) => l.num === 1)
    act(() => usePiso.setState({ piso: calle }))
    const { container, unmount } = render(<svg><CapaResidencial /></svg>)
    expect(container.querySelectorAll('path[data-rampa-calle]').length).toBe(1 + rp.bocaAlta.length)
    expect(container.querySelector('text[data-rampa-rotulo]')).toHaveTextContent('Rampa ↓')
    unmount()
    act(() => usePiso.setState({ piso: 3 }))
    const otro = render(<svg><CapaResidencial /></svg>).container
    expect(otro.querySelectorAll('path[data-rampa-calle]').length).toBe(0)
    expect(otro.querySelector('text[data-rampa-rotulo]')).toBeNull()
  })

  it('el Resumen trae los sótanos, los cajones y su costo', () => {
    render(<ResumenResidencial />)
    const s = screen.getByRole('region', { name: 'Uso mixto' })
    expect(s).toHaveTextContent('Sótanos')
    expect(s).toHaveTextContent('Cajones en sótanos')
    expect(s).toHaveTextContent('Costo del estacionamiento')
  })
})
