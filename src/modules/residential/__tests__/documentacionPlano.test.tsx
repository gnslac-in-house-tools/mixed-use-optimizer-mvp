import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InteriorsControls } from '../../../views/show/InteriorsControls.tsx'
import { useInteriors } from '../../../views/show/interiors.ts'
import { DocumentacionDepto } from '../views/DocumentacionPlano.tsx'
import { planesReferencia } from '../engine/tipologias.ts'

const p105 = planesReferencia()[1]
const marco = { o: [0, 0] as [number, number], u: [1, 0] as [number, number], v: [0, 1] as [number, number] }

describe('la lámina de un departamento en la planta', () => {
  it('dibuja sus recintos, el poché, sus puertas con abatimiento, sus ventanas y un rótulo con área por recinto', () => {
    const { container } = render(<svg><DocumentacionDepto plan={p105} marco={marco} recintos={p105.rooms} muebles={false} /></svg>)
    expect(container.querySelectorAll('[data-recinto-doc]').length).toBe(p105.rooms.length)
    expect(container.querySelector('[data-poche]')!.getAttribute('d')!.length).toBeGreaterThan(100)
    expect(container.querySelectorAll('[data-puerta-doc]').length).toBe((p105.puertas ?? []).length)
    expect(container.querySelectorAll('[data-puerta-doc] path[d*="A"]').length).toBe((p105.puertas ?? []).length)
    expect(container.querySelectorAll('[data-ventana-doc]').length).toBe((p105.ventanas ?? []).length)
    const rotulos = [...container.querySelectorAll('[data-rotulo-doc]')].map((g) => g.textContent)
    expect(rotulos.some((t) => t?.startsWith('SALÓN') && t.includes('m²'))).toBe(true)
  })

  it('Documentación se prende y se apaga en la barra, aparte de Programas y Mobiliario', () => {
    useInteriors.setState({ documentation: false })
    render(<InteriorsControls />)
    fireEvent.click(screen.getByRole('button', { name: /Documentation|Documentación/ }))
    expect(useInteriors.getState().documentation).toBe(true)
    expect(useInteriors.getState().interiors).toBe(true)
  })
})
