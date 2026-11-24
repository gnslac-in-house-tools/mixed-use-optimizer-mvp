import { describe, expect, it } from 'vitest'
import type { PlanCatalogo } from '../engine/catalogo.ts'
import { agregarPuerta, agregarVentana } from '../engine/editor.ts'
import { ALTO_PUERTA, ANTEPECHO, cajasMuro, MEDIO_MURO } from '../engine/muros3d.ts'

const r = (x0: number, x1: number) => [[x0, 0], [x1, 0], [x1, 8.1], [x0, 8.1]] as [number, number][]
const tres = (): PlanCatalogo => ({
  id: 'C1', name: 'prueba', origen: 'manual', typeId: 'br1', w: 8.1, d: 8.1,
  rooms: [{ kind: 'living', name: 'Estar', shape: r(0, 3) }, { kind: 'bath', name: 'Baño', shape: r(3, 5.4) }, { kind: 'bed', name: 'Dormitorio', shape: r(5.4, 8.1) }],
  muebles: [], reglas: { cama: 'queen', comedor: 4, paso: 0.75, closets: true },
})
const ALTO = 2.6, LOSA = 0.08
/** ¿Alguna caja tapa el punto (x, y, z)? */
const tapa = (cs: ReturnType<typeof cajasMuro>['cajas'], x: number, y: number, z: number) => cs.some((c) => x >= c.x0 - 1e-9 && x <= c.x1 + 1e-9 && y >= c.y0 - 1e-9 && y <= c.y1 + 1e-9 && z >= c.z0 && z <= c.z1)

describe('los muros 3D con huecos', () => {
  it('sin puertas ni ventanas, cada recinto pone medio muro a lo largo de su contorno, de la losa al alto', () => {
    const { cajas, vidrios } = cajasMuro(tres(), ALTO, LOSA)
    expect(tapa(cajas, 3 - MEDIO_MURO / 2, 4, 1)).toBe(true)
    expect(tapa(cajas, 3 + MEDIO_MURO / 2, 4, 1)).toBe(true)
    expect(tapa(cajas, 1.5, 4, 1)).toBe(false)
    expect(vidrios).toEqual([])
    for (const c of cajas) { expect(c.z0).toBeCloseTo(LOSA, 9); expect(c.z1).toBeCloseTo(ALTO, 9) }
  })

  it('una puerta abre su muro de los dos lados hasta 2.1 m y deja dintel arriba', () => {
    const { cajas } = cajasMuro(agregarPuerta(tres(), { x: 3, y: 4 }), ALTO, LOSA)
    for (const x of [3 - MEDIO_MURO / 2, 3 + MEDIO_MURO / 2]) {
      expect(tapa(cajas, x, 4, 1)).toBe(false)
      expect(tapa(cajas, x, 4, ALTO_PUERTA + 0.1)).toBe(true)
      expect(tapa(cajas, x, 5, 1)).toBe(true)
    }
  })

  it('una ventana abre la fachada entre el antepecho y 2.1 m, con su vidrio', () => {
    const { cajas, vidrios } = cajasMuro(agregarVentana(tres(), 1.5), ALTO, LOSA)
    const y = MEDIO_MURO / 2
    expect(tapa(cajas, 1.5, y, 1.5)).toBe(false)
    expect(tapa(cajas, 1.5, y, ANTEPECHO - 0.1)).toBe(true)
    expect(tapa(cajas, 1.5, y, ALTO_PUERTA + 0.1)).toBe(true)
    expect(tapa(cajas, 2.6, y, 1.5)).toBe(true)
    expect(vidrios).toHaveLength(1)
    expect(vidrios[0]).toMatchObject({ x0: 0.75, x1: 2.25, z0: ANTEPECHO, z1: ALTO_PUERTA })
  })
})
