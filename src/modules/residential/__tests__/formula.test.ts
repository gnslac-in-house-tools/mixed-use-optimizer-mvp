import { describe, expect, it } from 'vitest'
import { evaluarFormula, nombresDe } from '../engine/calificacion/formula'

describe('evaluarFormula', () => {
  it('divide dos datos', () => {
    const r = evaluarFormula('indice_usado / indice_permitido', { indice_usado: 3.52, indice_permitido: 4 })
    expect(r).toHaveProperty('v')
    expect((r as { v: number }).v).toBeCloseTo(0.88)
  })

  it('respeta precedencia, paréntesis y menos unario', () => {
    expect(evaluarFormula('2 + 3 * (4 - 1)', {})).toEqual({ v: 11 })
    expect(evaluarFormula('-a + 1', { a: 2 })).toEqual({ v: -1 })
  })

  it('rechaza nombres desconocidos', () => {
    expect(evaluarFormula('costo * foo', { costo: 1 })).toEqual({ err: '«foo» no es un dato del proyecto' })
  })

  it('el nombre desconocido gana sobre el dato nulo', () => {
    expect(evaluarFormula('costo * foo', { costo: null })).toEqual({ err: '«foo» no es un dato del proyecto' })
  })

  it('lista los datos faltantes una vez, en orden', () => {
    expect(evaluarFormula('costo_parking / unidades', { costo_parking: null, unidades: 28 })).toEqual({
      v: null,
      falta: ['costo_parking'],
    })
    expect(evaluarFormula('a + b + a', { a: null, b: null })).toEqual({ v: null, falta: ['a', 'b'] })
  })

  it('detecta fórmulas incompletas y vacías', () => {
    expect(evaluarFormula('a /', { a: 1 })).toEqual({ err: 'fórmula incompleta' })
    expect(evaluarFormula('(a + 1', { a: 1 })).toEqual({ err: 'fórmula incompleta' })
    expect(evaluarFormula('', {})).toEqual({ err: 'vacía' })
    expect(evaluarFormula('   ', {})).toEqual({ err: 'vacía' })
  })

  it('rechaza caracteres no permitidos', () => {
    expect(evaluarFormula('a; alert(1)', { a: 1 })).toEqual({ err: 'solo + − × ÷ ( ) y nombres' })
  })

  it('la división entre cero con los datos de hoy no da un número: sin dato, no error', () => {
    expect(evaluarFormula('a / b', { a: 1, b: 0 })).toEqual({ v: null, falta: [], motivo: 'no da un número' })
    expect(evaluarFormula('a / (b / c)', { a: 1, b: 2, c: 0 })).toEqual({ v: null, falta: [], motivo: 'no da un número' })
    expect(evaluarFormula('a / b', { a: 0, b: 0 })).toEqual({ v: null, falta: [], motivo: 'no da un número' })
  })

  it('sin datos de por medio, una fórmula que no da un número es un error de la fórmula', () => {
    expect(evaluarFormula('0 / 0', {})).toEqual({ err: 'no da un número' })
    expect(evaluarFormula('1 / (2 - 2)', {})).toEqual({ err: 'no da un número' })
  })
})

describe('nombresDe', () => {
  it('extrae los nombres en orden', () => {
    expect(nombresDe('ingreso / m2_vendibles')).toEqual(['ingreso', 'm2_vendibles'])
  })
})
