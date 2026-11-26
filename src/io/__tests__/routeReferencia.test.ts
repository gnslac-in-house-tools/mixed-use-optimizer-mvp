import { describe, expect, it } from 'vitest'
import { direccionInicial } from '../route.ts'

describe('la dirección al entrar (mixed-use-mvp: abre el proyecto de referencia)', () => {
  it('sin dirección (el link de Pages, localhost) abre el proyecto de referencia', () => {
    expect(direccionInicial('', 'referencia')).toBe('#/p/referencia')
    expect(direccionInicial('#', 'referencia')).toBe('#/p/referencia')
  })
  it('una dirección dada se respeta: #/ es Home, #/p/<id> ese proyecto', () => {
    expect(direccionInicial('#/', 'referencia')).toBeNull()
    expect(direccionInicial('#/p/sample', 'referencia')).toBeNull()
  })
})
