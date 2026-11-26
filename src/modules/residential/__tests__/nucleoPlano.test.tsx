import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { elementosAuto, nucleoColocado } from '../engine/nucleoDetalle.ts'
import { NucleoSvg } from '../views/NucleoPlano.tsx'

const poly = [{ x: 0, y: 0 }, { x: 8.1, y: 0 }, { x: 8.1, y: 5.4 }, { x: 0, y: 5.4 }]

describe('el núcleo en la planta', () => {
  it('dibuja cada elemento por su tipo: la escalera con sus huellas, el elevador con su cruz, el ducto achurado', () => {
    const c = nucleoColocado({}, poly)!
    const { container } = render(<svg><NucleoSvg c={c} /></svg>)
    expect(container.querySelectorAll('[data-elemento-nucleo]').length).toBe(elementosAuto(8.1, 5.4).length)
    expect(container.querySelectorAll('[data-elemento-nucleo="escalera"] [data-huella]').length).toBeGreaterThan(8)
    expect(container.querySelectorAll('[data-elemento-nucleo="elevador"] [data-cruz]').length).toBe(2)
    expect(container.querySelectorAll('[data-elemento-nucleo="ducto"] [data-achurado]').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-elemento-nucleo="vestibulo"]')!.textContent).toContain('Vestíbulo')
  })
})
