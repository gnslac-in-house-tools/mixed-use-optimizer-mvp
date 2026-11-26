import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { updateMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { colocarDepto, deptoColocado } from '../engine/deptos.ts'
import { editarDepto } from '../engine/edicionDepto.ts'
import { ejes, girarMueble, moverEje, moverMueble } from '../engine/editor.ts'
import { agregarTipologias, planesReferencia } from '../engine/tipologias.ts'

const p85 = planesReferencia()[0]

/** Dos departamentos del plano de 85, uno al lado del otro. */
function dos(): { p: Project; a: string; b: string } {
  let p = agregarTipologias(newProject('mixed-use'))
  const ra = colocarDepto(p, 'ref-85', { x: 0, y: 0 }, 0)
  const rb = colocarDepto(ra.project, 'ref-85', { x: 20, y: 0 }, 0)
  p = rb.project
  return { p, a: ra.id, b: rb.id }
}
const visto = (p: Project, id: string) => { const m = p.masses.find((x) => x.id === id)!; return deptoColocado(p, m, footprintPolygon(m.footprint))!.plan }
const muroX = (pl: { rooms: unknown }) => ejes(pl as never).x

describe('editar un departamento dibujado', () => {
  it('para esta unidad: crea su variante; el tipo y las otras copias no cambian', () => {
    const { p, a, b } = dos()
    const de = muroX(p85)[0]
    const q = editarDepto(p, a, 'unidad', (pl) => moverEje(pl, 'x', de, de + 0.5))
    expect(q.masses.find((m) => m.id === a)!.depto!.variante).toBeDefined()
    expect(muroX(visto(q, a))[0]).toBeCloseTo(de + 0.5, 6)
    expect(muroX(visto(q, b))[0]).toBeCloseTo(de, 6)
    expect(muroX(q.residential!.catalogo!.find((c) => c.id === 'ref-85')!)[0]).toBeCloseTo(de, 6)
  })

  it('para el tipo: cambia el plano de Mi biblioteca y con él todas sus copias', () => {
    const { p, a, b } = dos()
    const de = muroX(p85)[0]
    const q = editarDepto(p, a, 'tipo', (pl) => moverEje(pl, 'x', de, de + 0.5))
    expect(q.masses.find((m) => m.id === a)!.depto!.variante).toBeUndefined()
    expect(muroX(visto(q, a))[0]).toBeCloseTo(de + 0.5, 6)
    expect(muroX(visto(q, b))[0]).toBeCloseTo(de + 0.5, 6)
  })

  it('para el tipo desde una unidad estirada: el plano del tipo conserva su medida', () => {
    const { p, a } = dos()
    const m = p.masses.find((x) => x.id === a)!
    if (m.footprint.kind !== 'contour') throw new Error('contorno')
    const estirada = updateMass(p, a, { footprint: { kind: 'contour', contour: { vertices: m.footprint.contour.vertices.map((v) => (v.x > 1 ? { ...v, x: v.x + 2 } : v)) } } })
    const de = muroX(visto(estirada, a))[0]
    const q = editarDepto(estirada, a, 'tipo', (pl) => moverEje(pl, 'x', de, de + 0.5))
    const tipo = q.residential!.catalogo!.find((c) => c.id === 'ref-85')!
    expect(tipo.w).toBeCloseTo(p85.w, 6)
    expect(muroX(tipo)[0]).toBeGreaterThan(muroX(p85)[0])
  })

  it('un mueble se mueve dentro de su recinto y gira de 90 en 90', () => {
    const f = p85.muebles[0]
    const q = moverMueble(p85, f.id, f.x + 0.3, f.y + 0.2)
    const g = q.muebles.find((x) => x.id === f.id)!
    expect([g.x, g.y]).toEqual([expect.closeTo(f.x + 0.3, 6), expect.closeTo(f.y + 0.2, 6)])
    expect(girarMueble(q, f.id).muebles.find((x) => x.id === f.id)!.rot).toBe((f.rot + 90) % 360)
  })
})
