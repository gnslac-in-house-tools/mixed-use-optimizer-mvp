import { describe, expect, it } from 'vitest'
import { TIPOS, planNuevo, type PlanCatalogo } from '../engine/catalogo.ts'
import { agregarPuerta, agregarVentana, cambiarRecinto, cotas, ejes, grafo, moverEje, quitarPuerta, MIN_TRAMO } from '../engine/editor.ts'

/** Un plano de tres recintos en fila a lo largo de la fachada: 0 | 3 | 5.4 | 8.1, de 8.1 de fondo. */
const tres = (): PlanCatalogo => {
  const r = (x0: number, x1: number) => [[x0, 0], [x1, 0], [x1, 8.1], [x0, 8.1]] as [number, number][]
  return {
    id: 'C1', name: 'prueba', origen: 'manual', typeId: 'br1', w: 8.1, d: 8.1,
    rooms: [{ kind: 'living', name: 'Estar', shape: r(0, 3) }, { kind: 'bath', name: 'Baño', shape: r(3, 5.4) }, { kind: 'bed', name: 'Dormitorio', shape: r(5.4, 8.1) }],
    muebles: [], reglas: { cama: 'queen', comedor: 4, paso: 0.75, closets: true },
  }
}
const xs = (p: PlanCatalogo) => p.rooms.map((r) => [Math.min(...r.shape.map((q) => q[0])), Math.max(...r.shape.map((q) => q[0]))])

describe('el editor de departamentos', () => {
  it('los ejes de muro son las coordenadas interiores de los recintos', () => {
    expect(ejes(tres())).toEqual({ x: [3, 5.4], y: [] })
  })

  it('mover un muro mueve los recintos de los dos lados y vuelve a amueblar', () => {
    const p = moverEje(tres(), 'x', 3, 3.6)
    expect(xs(p)).toEqual([[0, 3.6], [3.6, 5.4], [5.4, 8.1]])
    expect(p.muebles.length).toBeGreaterThan(0)
  })

  it('un tramo no baja del mínimo: el muro se detiene', () => {
    const p = moverEje(tres(), 'x', 3, 5.2)
    expect(xs(p)[1][0]).toBeCloseTo(5.4 - MIN_TRAMO, 6)
  })

  it('una cota fija viaja entera: mover el muro de un lado arrastra el del otro', () => {
    const p0 = { ...tres(), fijas: { x: [1], y: [] } } // el tramo 3 → 5.4 (el baño) es fijo
    const p = moverEje(p0, 'x', 3, 2.4)
    expect(xs(p)).toEqual([[0, 2.4], [2.4, 4.8], [4.8, 8.1]])
    const c = cotas(p).x
    expect(c[1].fija).toBe(true)
    expect(c[1].largo).toBeCloseTo(2.4, 6)
  })

  it('una cota fija pegada a la orilla de la unidad no deja mover su muro', () => {
    const p0 = { ...tres(), fijas: { x: [0], y: [] } }
    expect(xs(moverEje(p0, 'x', 3, 3.6))).toEqual(xs(tres()))
  })

  it('una puerta sobre un muro se mueve con él; se quita por su índice', () => {
    let p = agregarPuerta(tres(), { x: 3, y: 4 })
    expect(p.puertas).toEqual([{ eje: 'x', x: 3, y: 4, ancho: 0.9 }])
    p = moverEje(p, 'x', 3, 3.3)
    expect(p.puertas![0].x).toBeCloseTo(3.3, 6)
    expect(quitarPuerta(p, 0).puertas).toEqual([])
  })

  it('una puerta fuera de un muro interior no se pone', () => {
    expect(agregarPuerta(tres(), { x: 1.5, y: 4 }).puertas ?? []).toEqual([])
  })

  it('una ventana va en la fachada, dentro de la unidad', () => {
    const p = agregarVentana(tres(), 1.5)
    expect(p.ventanas).toEqual([{ x: 1.5, ancho: 1.5 }])
    expect(agregarVentana(tres(), 7.9).ventanas![0].x).toBeCloseTo(8.1 - 0.75, 6)
  })

  it('un recinto cambia de uso (el pasillo es «hall»)', () => {
    const p = cambiarRecinto(tres(), 1, 'hall')
    expect(p.rooms[1].kind).toBe('hall')
    expect(p.rooms[1].name).toBe('Pasillo')
  })

  it('el grafo une los recintos que comparten muro; la puerta lo marca', () => {
    const g = grafo(agregarPuerta(tres(), { x: 3, y: 4 }))
    expect(g.nodos).toHaveLength(3)
    expect(g.aristas).toEqual([{ a: 0, b: 1, puerta: true }, { a: 1, b: 2, puerta: false }])
  })

  it('funciona sobre un plano que hace GFit', () => {
    const p = planNuevo(TIPOS.find((t) => t.id === 'br2')!, 10.8, 8.1, [], false)
    const e = ejes(p)
    expect(e.x.length + e.y.length).toBeGreaterThan(0)
    const eje = e.x.length ? 'x' : 'y'
    const v = e[eje][0]
    const q = moverEje(p, eje, v, v + 0.3)
    expect(ejes(q)[eje]).toContain(Math.round((v + 0.3) * 1000) / 1000)
  })
})
