import { describe, expect, it } from 'vitest'
import { cuenta, rotuloRecinto } from '../views/rotulos.ts'

describe('los textos del editor de departamentos', () => {
  it('cuenta en singular o plural', () => {
    expect(cuenta(1, 'puerta', 'puertas')).toBe('1 puerta')
    expect(cuenta(0, 'puerta', 'puertas')).toBe('0 puertas')
    expect(cuenta(3, 'ventana', 'ventanas')).toBe('3 ventanas')
  })

  it('el nombre de un recinto cabe en su ancho (con margen) y no pasa del tamaño de siempre', () => {
    // «Dormitorio principal» en 3 m: a 0.32 m de letra no cabe; se achica a lo que cabe en el 85 % del ancho
    const r = rotuloRecinto('Dormitorio principal', 3, 5.7)
    expect(r.fs * 'Dormitorio principal'.length * 0.55).toBeLessThanOrEqual(3 * 0.85 + 1e-9)
    expect(r.fs).toBeLessThan(0.32)
    // un nombre corto en un recinto grande queda en 0.32
    expect(rotuloRecinto('Baño', 3.3, 2.4).fs).toBe(0.32)
    // un recinto muy bajo también lo achica: dos renglones en el 70 % de su alto
    expect(rotuloRecinto('Baño', 3.3, 0.6).fs * 2.1).toBeLessThanOrEqual(0.6 * 0.7 + 1e-9)
  })

  it('demasiado chico para leerse, el área se calla y queda el nombre', () => {
    const r = rotuloRecinto('Vestíbulo', 1.2, 2.4)
    expect(r.conArea).toBe(r.fs >= 0.16)
    expect(rotuloRecinto('Estar', 3.3, 5.7).conArea).toBe(true)
  })
})
