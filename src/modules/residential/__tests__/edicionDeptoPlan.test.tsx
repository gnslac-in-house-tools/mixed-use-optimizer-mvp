import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Point, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { emptyHistory } from '../../../state/history.ts'
import { NO_SELECTION, useApp } from '../../../state/store.ts'
import { newProject } from '../../../typologies/index.ts'
import { colocarDepto, deptoColocado } from '../engine/deptos.ts'
import { ejes, ejesMovibles } from '../engine/editor.ts'
import { agregarTipologias, planesReferencia } from '../engine/tipologias.ts'
import { EdicionDeptoPlan } from '../views/EdicionDeptoPlan.tsx'
import { useEdicionDepto } from '../views/edicionDepto.ts'

const p85 = planesReferencia()[0]
/** el mundo es la pantalla: un clic en (x, y) es el punto (x, y) del plano */
const toWorld = (e: { clientX: number; clientY: number }): Point => ({ x: e.clientX, y: e.clientY })
let id = ''
function abre(): void {
  const r = colocarDepto(agregarTipologias(newProject('mixed-use')), 'ref-85', { x: 0, y: 0 }, 0)
  id = r.id
  const p: Project = r.project
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, selection: { ...NO_SELECTION, massId: id, massIds: [id] }, level: 'l1', showAll: false, option: 'o1' })
}
const proyecto = () => useApp.getState().project
const visto = () => { const m = proyecto().masses.find((x) => x.id === id)!; return deptoColocado(proyecto(), m, footprintPolygon(m.footprint))!.plan }
const pinta = () => render(<svg><EdicionDeptoPlan toWorld={toWorld} px={0.05} /></svg>)

beforeEach(() => { abre(); useEdicionDepto.setState({ destino: 'tipo', modo: 'muros' }) })

describe('editar un departamento en la planta', () => {
  it('con uno elegido, cada muro interior movible tiene su manija', () => {
    const { container } = pinta()
    const n = ejesMovibles(p85).x.length + ejesMovibles(p85).y.length
    expect(container.querySelectorAll('[data-muro-depto]').length).toBe(n)
  })

  it('arrastrar un muro lo mueve en el tipo (un paso de deshacer)', () => {
    const { container } = pinta()
    const de = ejes(p85).x[0]
    const h = container.querySelector(`[data-muro-depto="x:${de}"]`)!
    fireEvent.pointerDown(h, { clientX: de, clientY: 2, pointerId: 1, button: 0 })
    fireEvent.pointerMove(h, { clientX: de + 0.5, clientY: 2, pointerId: 1 })
    fireEvent.pointerUp(h, { clientX: de + 0.5, clientY: 2, pointerId: 1 })
    expect(ejes(proyecto().residential!.catalogo!.find((c) => c.id === 'ref-85')!).x[0]).toBeCloseTo(de + 0.5, 2)
    useApp.getState().undo()
    expect(ejes(visto()).x[0]).toBeCloseTo(de, 6)
  })

  it('en «Esta unidad», el muro se mueve solo en su variante', () => {
    useEdicionDepto.setState({ destino: 'unidad' })
    const { container } = pinta()
    const de = ejes(p85).x[0]
    const h = container.querySelector(`[data-muro-depto="x:${de}"]`)!
    fireEvent.pointerDown(h, { clientX: de, clientY: 2, pointerId: 1, button: 0 })
    fireEvent.pointerUp(h, { clientX: de - 0.4, clientY: 2, pointerId: 1 })
    expect(proyecto().masses.find((m) => m.id === id)!.depto!.variante).toBeDefined()
    expect(ejes(proyecto().residential!.catalogo!.find((c) => c.id === 'ref-85')!).x[0]).toBeCloseTo(de, 6)
  })

  it('en Muebles: arrastrar uno lo mueve; doble clic lo gira', () => {
    useEdicionDepto.setState({ modo: 'muebles' })
    const { container } = pinta()
    const f = p85.muebles[0]
    const h = container.querySelector(`[data-mueble-depto="${f.id}"]`)!
    fireEvent.pointerDown(h, { clientX: f.x, clientY: f.y, pointerId: 1, button: 0 })
    fireEvent.pointerUp(h, { clientX: f.x + 0.3, clientY: f.y, pointerId: 1 })
    expect(visto().muebles.find((x) => x.id === f.id)!.x).toBeCloseTo(f.x + 0.3, 2)
    fireEvent.doubleClick(container.querySelector(`[data-mueble-depto="${f.id}"]`)!)
    expect(visto().muebles.find((x) => x.id === f.id)!.rot).toBe((f.rot + 90) % 360)
  })

  it('en Ventana: un clic junto a la fachada pone una', () => {
    useEdicionDepto.setState({ modo: 'ventana' })
    const { container } = pinta()
    const antes = (visto().ventanas ?? []).length
    fireEvent.click(container.querySelector('[data-zona-depto]')!, { clientX: 4, clientY: 0.2 })
    expect((visto().ventanas ?? []).length).toBe(antes + 1)
  })

  it('sin un departamento elegido, nada', () => {
    useApp.setState({ selection: NO_SELECTION })
    const { container } = pinta()
    expect(container.querySelector('[data-edicion-depto]')).toBeNull()
  })
})
