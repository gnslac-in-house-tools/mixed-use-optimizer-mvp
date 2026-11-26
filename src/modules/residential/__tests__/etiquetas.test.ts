import { describe, expect, it } from 'vitest'
import { newProject } from '../../../typologies/index.ts'
import { etiquetaOculta } from '../views/etiquetas.ts'

describe('las etiquetas de las masas residenciales', () => {
  const p = { ...newProject('mixed-use'), masses: [
    { id: 'v', name: 'Vivienda 1', levelId: 'l1', programId: 'vivienda', footprint: { kind: 'contour' as const, contour: { vertices: [] } } },
    { id: 'n', name: 'Núcleo 1', levelId: 'l1', programId: 'nucleo', footprint: { kind: 'contour' as const, contour: { vertices: [] } } },
    { id: 'c', name: 'Comercio 1', levelId: 'l1', programId: 'comercio', footprint: { kind: 'contour' as const, contour: { vertices: [] } } },
  ] }
  it('con Programs, la vivienda y el núcleo (que se dibujan por dentro) no llevan etiqueta; el comercio sí', () => {
    expect(etiquetaOculta(p, 'v', true)).toBe(true)
    expect(etiquetaOculta(p, 'n', true)).toBe(true)
    expect(etiquetaOculta(p, 'c', true)).toBe(false)
  })
  it('sin Programs, todas la llevan', () => {
    expect(etiquetaOculta(p, 'v', false)).toBe(false)
  })
})
