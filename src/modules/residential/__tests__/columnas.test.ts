import { describe, expect, it } from 'vitest'
import type { Grid, Point, Polygon } from '../../../model/schema.ts'
import type { DerivedMass } from '../../../engine/types.ts'
import { toGrid, toPlan } from '../../../engine/grid/index.ts'
import { columnas } from '../engine/columnas.ts'

const G: Grid = { x: 8.1, y: 8.1, modules: 3, origin: { x: 0, y: 0 }, angle: 0 }
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (polygon: Polygon, holes: Polygon[] = []): DerivedMass => ({
  id: 'm1', name: 'Vivienda 1', levelId: 'l1', buildingId: 'b1', context: false, span: [0, 30], polygon, holes, corridors: [], area: 0, built: true,
})
const multiplo = (v: number, paso: number) => Math.abs(v / paso - Math.round(v / paso)) < 1e-6
const tiene = (cs: Point[], x: number, y: number) => cs.some((c) => Math.abs(c.x - x) < 1e-6 && Math.abs(c.y - y) < 1e-6)

describe('columnas', () => {
  it('da los 15 cruces de crujía de una huella de 32.4 × 16.2 desde el origen', () => {
    const cs = columnas(G, [masa(rect(0, 0, 32.4, 16.2))], [])
    expect(cs).toHaveLength(15)
    for (const c of cs) {
      expect(multiplo(c.x, 8.1)).toBe(true)
      expect(multiplo(c.y, 8.1)).toBe(true)
    }
  })

  it('no repite una columna que dos masas comparten', () => {
    const cs = columnas(G, [masa(rect(0, 0, 16.2, 16.2)), { ...masa(rect(16.2, 0, 32.4, 16.2)), id: 'm2' }], [])
    expect(cs).toHaveLength(15)
  })

  it('quita las que caen estrictamente dentro de un núcleo y conserva las de su borde', () => {
    // huella de 32.4 × 24.3: 5 × 4 cruces; un núcleo de 8.1 × 8.1 centrado en (16.2, 8.1) solo tiene dentro ese cruce
    const nucleo = rect(12.15, 4.05, 20.25, 12.15)
    const cs = columnas(G, [masa(rect(0, 0, 32.4, 24.3))], [nucleo])
    expect(cs).toHaveLength(19)
    expect(tiene(cs, 16.2, 8.1)).toBe(false)
    // un núcleo con sus esquinas en cruces conserva esas cuatro columnas
    const borde = columnas(G, [masa(rect(0, 0, 32.4, 24.3))], [rect(8.1, 8.1, 16.2, 16.2)])
    expect(borde).toHaveLength(20)
    expect(tiene(borde, 8.1, 8.1) && tiene(borde, 16.2, 16.2)).toBe(true)
  })

  it('quita las que caen dentro de un hueco', () => {
    const cs = columnas(G, [masa(rect(0, 0, 32.4, 16.2), [rect(12, 4, 20, 12)])], [])
    expect(cs).toHaveLength(14)
    expect(tiene(cs, 16.2, 8.1)).toBe(false)
  })

  it('sigue la retícula girada 30° y con el origen movido', () => {
    const g: Grid = { ...G, origin: { x: 3, y: -2 }, angle: 30 }
    const huella = [toPlan(g, { x: 0, y: 0 }), toPlan(g, { x: 32.4, y: 0 }), toPlan(g, { x: 32.4, y: 16.2 }), toPlan(g, { x: 0, y: 16.2 })]
    const cs = columnas(g, [masa(huella)], [])
    expect(cs).toHaveLength(15)
    for (const c of cs) {
      const q = toGrid(g, c)
      expect(multiplo(q.x, 8.1)).toBe(true)
      expect(multiplo(q.y, 8.1)).toBe(true)
    }
  })
})
