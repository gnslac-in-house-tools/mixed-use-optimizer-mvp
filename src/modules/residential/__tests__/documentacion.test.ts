import { describe, expect, it } from 'vitest'
import { dibujoDoc, MURO_EXT } from '../engine/documentacion.ts'
import { areaPlan, planesReferencia } from '../engine/tipologias.ts'

const [p85, , p150] = planesReferencia()
type R = [number, number][]
const caja = (r: R) => ({ x0: Math.min(...r.map((q) => q[0])), x1: Math.max(...r.map((q) => q[0])), y0: Math.min(...r.map((q) => q[1])), y1: Math.max(...r.map((q) => q[1])) })
/** ¿algún muro cubre el punto? */
const cubre = (muros: R[], x: number, y: number) => muros.some((r) => { const b = caja(r); return x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && y >= b.y0 - 1e-9 && y <= b.y1 + 1e-9 })

describe('la vista de documentación de un departamento', () => {
  it('los muros de fachada van por dentro del contorno, con su grueso', () => {
    const d = dibujoDoc(p85)
    // a la mitad del lado de atrás (y = d) y de un costado (x = 0), lejos de puertas y ventanas
    expect(cubre(d.muros, 3, p85.d - MURO_EXT / 2)).toBe(true)
    expect(cubre(d.muros, MURO_EXT / 2, 4)).toBe(true)
    // nada fuera del contorno
    for (const r of d.muros) {
      const b = caja(r)
      expect(b.x0).toBeGreaterThanOrEqual(-1e-9)
      expect(b.x1).toBeLessThanOrEqual(p85.w + 1e-9)
      expect(b.y0).toBeGreaterThanOrEqual(-1e-9)
      expect(b.y1).toBeLessThanOrEqual(p85.d + 1e-9)
    }
  })

  it('cada ventana abre la fachada y se dibuja con sus tres líneas', () => {
    const d = dibujoDoc(p85)
    for (const v of p85.ventanas ?? []) expect(cubre(d.muros, v.x, MURO_EXT / 2)).toBe(false)
    expect(d.ventanas.length).toBe((p85.ventanas ?? []).length)
    expect(d.ventanas.every((v) => v.length === 3)).toBe(true)
  })

  it('cada puerta abre su muro y lleva su hoja y su abatimiento (radio = su ancho)', () => {
    const d = dibujoDoc(p85)
    const puertas = p85.puertas ?? []
    expect(d.puertas.length).toBe(puertas.length)
    puertas.forEach((q, i) => {
      expect(cubre(d.muros, q.x, q.y)).toBe(false)
      const { bisagra, abierta, cerrada } = d.puertas[i]
      expect(Math.hypot(abierta[0] - bisagra[0], abierta[1] - bisagra[1])).toBeCloseTo(q.ancho, 6)
      expect(Math.hypot(cerrada[0] - bisagra[0], cerrada[1] - bisagra[1])).toBeCloseTo(q.ancho, 6)
    })
  })

  it('un rótulo por recinto con su nombre y su área; las áreas suman la del departamento', () => {
    const d = dibujoDoc(p150)
    expect(d.rotulos.length).toBe(p150.rooms.length)
    const suma = d.rotulos.reduce((s, r) => s + r.area, 0)
    expect(suma).toBeCloseTo(areaPlan(p150), 0)
    expect(d.rotulos.every((r) => r.nombre.length > 0)).toBe(true)
  })

  it('en la L, la esquina de adentro también lleva muro (sin huecos en el poché)', () => {
    const d = dibujoDoc(p150)
    // el vértice cóncavo de la L en (5.45, 9.01): su esquina interior del muro
    expect(cubre(d.muros, 5.45 + MURO_EXT / 2, 9.01 - MURO_EXT / 2)).toBe(true)
  })
})
