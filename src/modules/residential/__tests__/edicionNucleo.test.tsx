import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { addMass } from '../../../state/actions/masses.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { elementosAuto } from '../engine/nucleoDetalle.ts'
import { EdicionNucleoPlan } from '../views/EdicionNucleoPlan.tsx'
import { PropiedadesNucleo } from '../views/PropiedadesNucleo.tsx'
import { useEdicionNucleo } from '../views/edicionNucleo.ts'

/** el mundo es la pantalla: un clic en (x, y) es el punto (x, y) del núcleo (su marco es el del mundo) */
const toWorld = (e: { clientX: number; clientY: number }): Point => ({ x: e.clientX, y: e.clientY })
const rect = (x0: number, y0: number, x1: number, y1: number) => ({ vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((q) => ({ ...q, r: 0 })) })
let id = ''
function abre(locked = false): void {
  const r = addMass(newProject('mixed-use'), { programId: 'nucleo', footprint: { kind: 'contour', contour: rect(0, 0, 9, 6) } })
  id = r.id
  const p: Project = locked ? { ...r.project, masses: r.project.masses.map((m) => ({ ...m, locked: true })) } : r.project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { ...NO_SELECTION, massId: id, massIds: [id] }, level: 'l1', showAll: false, option: 'o1' })
}
const nucleo = () => useApp.getState().project.masses.find((m) => m.id === id)!
const elementos = () => nucleo().nucleo?.elementos ?? elementosAuto(9, 6)
const elemento = (eid: string) => elementos().find((e) => e.id === eid)!
const pinta = () => render(<svg><EdicionNucleoPlan toWorld={toWorld} px={0.05} /></svg>)

beforeEach(() => {
  abre()
  useEdicionNucleo.setState({ elegido: null })
})

describe('editar los elementos de un núcleo en la planta', () => {
  it('con un núcleo elegido, cada elemento tiene su manija', () => {
    const { container } = pinta()
    expect(container.querySelectorAll('[data-elemento-editable]').length).toBe(elementosAuto(9, 6).length)
  })

  it('arrastrar un elemento lo mueve (de 5 en 5 cm) y es un paso de deshacer', () => {
    const { container } = pinta()
    const e = elemento('elevador1')
    const h = container.querySelector('[data-elemento-editable="elevador1"]')!
    fireEvent.pointerDown(h, { clientX: e.x, clientY: e.y, pointerId: 1, button: 0 })
    fireEvent.pointerMove(h, { clientX: e.x - 1.02, clientY: e.y, pointerId: 1 })
    fireEvent.pointerUp(h, { clientX: e.x - 1.02, clientY: e.y, pointerId: 1 })
    expect(elemento('elevador1').x).toBeCloseTo(e.x - 1.0, 6)
    expect(nucleo().nucleo).toBeDefined()
    useApp.getState().undo()
    expect(nucleo().nucleo).toBeUndefined()
  })

  it('doble clic lo gira 90°', () => {
    const { container } = pinta()
    fireEvent.doubleClick(container.querySelector('[data-elemento-editable="escalera"]')!)
    expect(elemento('escalera').rot).toBe(90)
  })

  it('un clic lo elige (para sus propiedades)', () => {
    const { container } = pinta()
    const h = container.querySelector('[data-elemento-editable="ducto"]')!
    fireEvent.pointerDown(h, { clientX: 8.5, clientY: 5, pointerId: 1, button: 0 })
    fireEvent.pointerUp(h, { clientX: 8.5, clientY: 5, pointerId: 1 })
    expect(useEdicionNucleo.getState().elegido).toBe('ducto')
  })

  it('un núcleo bloqueado no se edita', () => {
    abre(true)
    const { container } = pinta()
    expect(container.querySelectorAll('[data-elemento-editable]').length).toBe(0)
  })
})

describe('las propiedades de un núcleo', () => {
  it('lista sus elementos; agregar un elevador suma uno', () => {
    render(<PropiedadesNucleo id={id} />)
    expect(screen.getAllByRole('listitem').length).toBe(elementosAuto(9, 6).length)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar elevador' }))
    expect(elementos().filter((e) => e.kind === 'elevador').length).toBe(elementosAuto(9, 6).filter((e) => e.kind === 'elevador').length + 1)
  })

  it('girar y quitar un elemento desde su fila', () => {
    render(<PropiedadesNucleo id={id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Girar Ducto' }))
    expect(elemento('ducto').rot).toBe(90)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Ducto' }))
    expect(elementos().some((e) => e.id === 'ducto')).toBe(false)
  })

  it('Reacomodar vuelve al acomodo automático', () => {
    render(<PropiedadesNucleo id={id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Ducto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reacomodar' }))
    expect(nucleo().nucleo).toBeUndefined()
  })

  it('no aparece para una masa que no es núcleo', () => {
    const r = addMass(useApp.getState().project, { programId: 'vivienda', footprint: { kind: 'contour', contour: rect(20, 0, 40, 10) } })
    useApp.setState({ project: r.project })
    const { container } = render(<PropiedadesNucleo id={r.id} />)
    expect(container.innerHTML).toBe('')
  })
})
