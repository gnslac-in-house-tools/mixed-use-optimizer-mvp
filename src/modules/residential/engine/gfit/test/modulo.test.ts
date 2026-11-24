// mixed-use-mvp patch: los anchos de unidad y los tramos de banda sobre los módulos de la retícula (setUnitModule).
import { afterEach, describe, expect, test } from 'vitest'
import { area, intersection, toShape } from '../src/model/geom.ts'
import type { Pt, Ring, Shape } from '../src/model/geom.ts'
import { avisosModulo, golpesColumna, layoutLevel, ordenColumnas, setUnitModule, widthsOf } from '../src/layout/level.ts'
import type { LevelInput, LevelLayout } from '../src/layout/level.ts'
import { UNIT_TEMPLATES } from '../src/model/program.ts'
import type { UnitType } from '../src/model/program.ts'
import { fresh } from '../src/model/state.ts'

const tipo = (id: string) => UNIT_TEMPLATES().find((t) => t.id === id)!
const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
function input(plate: Shape, cores: Shape, patch: Partial<LevelInput> = {}): LevelInput {
  const s = fresh()
  return { plate, cores, d: 8.1, cw: 1.8, num: 3, seed: 1, types: UNIT_TEMPLATES(), rooms: s.rooms, rules: [], mix: { studio: 30, br1: 45, br2: 25 }, ...patch }
}

/** Cada vértice de unidad sobre una orilla de la placa paralela a `u` (una fachada a lo largo de la retícula), medido en
 *  `u` desde `o`: ahí caen los muros entre departamentos. */
function enFachada(L: LevelLayout, plate: Ring, o: Pt, u: Pt): number[] {
  const out: number[] = []
  for (const un of L.units) {
    for (const ring of un.shape) {
      for (const p of ring) {
        for (let i = 0; i < plate.length; i++) {
          const a = plate[i], b = plate[(i + 1) % plate.length]
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len)
          const off = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
          if (off > 0.01 || t < -1e-6 || t > 1 + 1e-6) continue
          if (Math.abs(dx * u[0] + dy * u[1]) / len < 0.99) continue
          out.push((p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1])
        }
      }
    }
  }
  return out
}
const enMultiplo = (xs: number[], paso: number, tol = 0.01) => xs.every((x) => Math.abs(x / paso - Math.round(x / paso)) * paso < tol)

afterEach(() => setUnitModule(null))

describe('setUnitModule', () => {
  test('con el módulo de 2.7 m, los anchos son sus múltiplos dentro del rango de cada tipo', () => {
    setUnitModule({ origin: [0, 0], u: [1, 0], step: 2.7 })
    expect(widthsOf(tipo('br2'))).toEqual([10.8])
    expect(widthsOf(tipo('studio'))).toEqual([5.4])
    expect(widthsOf(tipo('br3'))).toEqual([13.5])
  })

  test('un tipo sin múltiplo en su rango toma el menor múltiplo que no baja de wMin, y lo avisa', () => {
    setUnitModule({ origin: [0, 0], u: [1, 0], step: 2.5 })
    const t: UnitType = { ...tipo('br1'), id: 'x', name: 'Angosto', wMin: 6.0, wMax: 6.9 }
    expect(widthsOf(t)).toEqual([7.5])
    expect(avisosModulo().some((a) => a.includes('sin ancho en módulos'))).toBe(true)
  })

  test('sin módulo, los anchos son los de siempre, de 0.6 en 0.6', () => {
    setUnitModule(null)
    expect(widthsOf(tipo('br2'))).toEqual([9.6, 10.2, 10.8, 11.4])
  })

  test('en una placa de 32.4 × 16.2 con núcleo, los vértices de fachada caen en múltiplos de 2.7', () => {
    setUnitModule({ origin: [0, 0], u: [1, 0], step: 2.7 })
    const plate = sq(0, 0, 32.4, 16.2)
    const L = layoutLevel(input(toShape([plate]), toShape([sq(12.15, 5.4, 20.25, 10.8)])))
    expect(L.units.length).toBeGreaterThan(0)
    const xs = enFachada(L, plate, [0, 0], [1, 0])
    expect(xs.length).toBeGreaterThan(0)
    expect(enMultiplo(xs, 2.7)).toBe(true)
    // las unidades no se encimen
    for (let i = 0; i < L.units.length; i++) for (let j = i + 1; j < L.units.length; j++) expect(area(intersection(L.units[i].shape, L.units[j].shape))).toBeLessThan(0.01)
  })

  test('con la retícula movida 1.0 m en x, los vértices caen en 1.0 + k·2.7', () => {
    setUnitModule({ origin: [1, 0], u: [1, 0], step: 2.7 })
    const plate = sq(0, 0, 32.4, 16.2)
    const L = layoutLevel(input(toShape([plate]), toShape([sq(12.15, 5.4, 20.25, 10.8)])))
    expect(L.units.length).toBeGreaterThan(0)
    expect(enMultiplo(enFachada(L, plate, [1, 0], [1, 0]), 2.7)).toBe(true)
    expect(avisosModulo().some((a) => a.includes('remanente'))).toBe(true)
  })
})

// mixed-use-mvp patch: las columnas ajustan los anchos (el orden de los anchos de cada tramo, para que los muros caigan en las columnas)
describe('ordenColumnas', () => {
  test('reordena los anchos de un tramo para que más muros caigan en las líneas de columnas', () => {
    const ws = [5.4, 8.1, 10.8]
    expect(golpesColumna(ws, 0, 1, 8.1)).toBe(0)
    const orden = ordenColumnas(ws, 0, 1, 8.1)
    expect([...orden].sort()).toEqual([0, 1, 2])
    expect(golpesColumna(orden.map((k) => ws[k]), 0, 1, 8.1)).toBe(1)
  })

  test('si el orden ya es el mejor, no lo cambia', () => {
    expect(ordenColumnas([8.1, 5.4, 10.8], 0, 1, 8.1)).toEqual([0, 1, 2])
  })

  test('en la placa de 32.4 × 16.2, con la crujía, al menos tantos muros caen en columnas como sin ella', () => {
    const plate = sq(0, 0, 32.4, 16.2)
    const corre = (bay?: [number, number]) => {
      setUnitModule({ origin: [0, 0], u: [1, 0], step: 2.7, ...(bay ? { bay } : {}) })
      const L = layoutLevel(input(toShape([plate]), toShape([sq(12.15, 5.4, 20.25, 10.8)]), { mix: { studio: 40, br1: 30, br2: 30 } }))
      const xs = enFachada(L, plate, [0, 0], [1, 0])
      expect(enMultiplo(xs, 2.7)).toBe(true)
      return xs.filter((x) => enMultiplo([x], 8.1)).length
    }
    expect(corre([8.1, 8.1])).toBeGreaterThanOrEqual(corre())
  })
})

describe('ordenColumnas con las reglas del solver', () => {
  test('un orden nuevo deja en su lugar la unidad que su regla pide ahí (la esquina)', () => {
    const ws = [5.4, 8.1, 10.8]
    // la regla: la unidad 0 (5.4) quiere la punta del tramo (x < 6); 5.4 | 10.8 | 8.1 la deja ahí y gana un muro
    const peso = (k: number, xm: number) => (k === 0 && xm < 6 ? 10 : 1)
    const orden = ordenColumnas(ws, 0, 1, 8.1, peso)
    expect(orden[0]).toBe(0)
    expect(golpesColumna(orden.map((k) => ws[k]), 0, 1, 8.1)).toBe(1)
  })
  test('si todo orden mejor saca a una unidad de su lugar, no reordena', () => {
    const ws = [5.4, 8.1, 10.8]
    // las reglas: la 0 quiere la punta y la 1 su lugar de hoy (centro en 9.45); los órdenes con un muro en columna
    // sacan a una de las dos
    const peso = (k: number, xm: number) => (k === 0 && xm < 3 ? 10 : 1) * (k === 1 && xm > 8 && xm < 11 ? 10 : 1)
    expect(golpesColumna(ws, 0, 1, 8.1)).toBe(0)
    expect(ordenColumnas(ws, 0, 1, 8.1, peso)).toEqual([0, 1, 2])
  })
  test('reordena si las reglas quedan igual', () => {
    const ws = [5.4, 8.1, 10.8]
    const orden = ordenColumnas(ws, 0, 1, 8.1, () => 1)
    expect(golpesColumna(orden.map((k) => ws[k]), 0, 1, 8.1)).toBe(1)
  })
})
