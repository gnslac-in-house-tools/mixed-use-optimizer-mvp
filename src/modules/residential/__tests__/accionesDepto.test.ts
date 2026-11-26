import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { area } from '../../../engine/geom/polygon.ts'
import { updateMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { cambiarPlanDepto, colocarDepto, reflejarDepto, volverAlTipo } from '../actions.ts'
import { deptoColocado } from '../engine/deptos.ts'
import { agregarTipologias, planesReferencia } from '../engine/tipologias.ts'

const base = () => agregarTipologias(newProject('mixed-use'))
const nivel = (p: Project) => p.buildings[0].levels[0].id
const ultimo = (p: Project) => p.masses[p.masses.length - 1]
const col = (p: Project, id: string) => { const m = p.masses.find((x) => x.id === id)!; return deptoColocado(p, m, footprintPolygon(m.footprint))! }

describe('los verbos de un departamento dibujado', () => {
  it('colocar: uno más, en el nivel, a la derecha de lo que ya hay', () => {
    const p0 = base()
    const p1 = colocarDepto(p0, 'ref-85', nivel(p0))
    const p2 = colocarDepto(p1, 'ref-105', nivel(p0))
    const a = footprintPolygon(p2.masses[p2.masses.length - 2].footprint), b = footprintPolygon(ultimo(p2).footprint)
    expect(Math.min(...b.map((q) => q.x))).toBeGreaterThan(Math.max(...a.map((q) => q.x)))
    expect(ultimo(p2).depto?.plan).toBe('ref-105')
  })

  it('reflejar en su lugar: misma huella, interior en espejo', () => {
    const p1 = colocarDepto(base(), 'ref-85', nivel(base()))
    const id = ultimo(p1).id
    const p2 = reflejarDepto(p1, id)
    expect(ultimo(p2).depto?.espejo).toBe(true)
    const antes = col(p1, id).aMundo(1, 1), despues = col(p2, id).aMundo(planesReferencia()[0].w - 1, 1)
    expect(Math.hypot(antes[0] - despues[0], antes[1] - despues[1])).toBeLessThan(1e-6)
  })

  it('cambiar de plano: el nuevo con su medida, en el mismo origen', () => {
    const p1 = colocarDepto(base(), 'ref-85', nivel(base()))
    const id = ultimo(p1).id
    const o = col(p1, id).aMundo(0, 0)
    const p2 = cambiarPlanDepto(p1, id, 'ref-105')
    expect(ultimo(p2).depto?.plan).toBe('ref-105')
    expect(area(footprintPolygon(ultimo(p2).footprint))).toBeCloseTo(105.1, 0)
    const o2 = col(p2, id).aMundo(0, 0)
    expect(Math.hypot(o[0] - o2[0], o[1] - o2[1])).toBeLessThan(1e-6)
  })

  it('volver al tipo quita su variante', () => {
    const p1 = colocarDepto(base(), 'ref-85', nivel(base()))
    const id = ultimo(p1).id
    const p2 = updateMass(p1, id, { depto: { plan: 'ref-85', variante: { ...planesReferencia()[0], id: 'v' } } })
    expect(volverAlTipo(p2, id).masses.find((m) => m.id === id)!.depto).toEqual({ plan: 'ref-85' })
  })
})
