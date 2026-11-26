import { describe, expect, it } from 'vitest'
import type { Mass, Point, Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { copyMass, mirrorMasses, moveMass, rotateMass, updateMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { colocarDepto, deptoColocado, huellaDepto, unidadDeDepto } from '../engine/deptos.ts'
import { agregarTipologias, planesReferencia } from '../engine/tipologias.ts'

const plan85 = planesReferencia()[0]
const plan150 = planesReferencia()[2]
const cerca = (a: Point, b: { x: number; y: number }, tol = 1e-6) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(tol)
const en = (r: [number, number]) => ({ x: r[0], y: r[1] })

function conDepto(planId = 'ref-85', o = { x: 10, y: 20 }, angulo = 30, espejo = false): { p: Project; id: string } {
  const r = colocarDepto(agregarTipologias(newProject('mixed-use')), planId, o, angulo, espejo)
  return { p: r.project, id: r.id }
}
const masa = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const colocado = (p: Project, id: string) => deptoColocado(p, masa(p, id), footprintPolygon(masa(p, id).footprint))!

describe('un departamento como masa', () => {
  it('colocar uno: su masa es el contorno de su plano en el lugar y giro pedidos, ligada a su plano', () => {
    const { p, id } = conDepto()
    const m = masa(p, id)
    expect(m.depto).toEqual({ plan: 'ref-85' })
    const c = colocado(p, id)
    cerca(en(c.aMundo(0, 0)), { x: 10, y: 20 })
    const a = (30 * Math.PI) / 180
    cerca(en(c.aMundo(plan85.w, 0)), { x: 10 + plan85.w * Math.cos(a), y: 20 + plan85.w * Math.sin(a) })
    expect(c.plan.w).toBeCloseTo(plan85.w, 6)
    expect(c.plan.d).toBeCloseTo(plan85.d, 6)
  })

  it('en espejo, el origen de su plano queda al otro extremo de la fachada', () => {
    const { p, id } = conDepto('ref-85', { x: 0, y: 0 }, 0, true)
    const c = colocado(p, id)
    cerca(en(c.aMundo(0, 0)), { x: plan85.w, y: 0 })
    cerca(en(c.aMundo(plan85.w, plan85.d)), { x: 0, y: plan85.d })
  })

  it('la L de 150 se coloca y se lee igual', () => {
    const { p, id } = conDepto('ref-150', { x: 5, y: 5 }, 90)
    const c = colocado(p, id)
    cerca(en(c.aMundo(4.14, 0)), { x: 5, y: 5 + 4.14 })
    expect(footprintPolygon(masa(p, id).footprint).length).toBe(8)
  })

  it('moverla y girarla con GIM lleva su interior', () => {
    const { p, id } = conDepto('ref-85', { x: 0, y: 0 }, 0)
    const q = moveMass(p, id, { x: 3, y: 4 })
    cerca(en(colocado(q, id).aMundo(0, 0)), { x: 3, y: 4 })
    const r = rotateMass(q, id, 90)
    const c = colocado(r, id)
    const u = { x: c.aMundo(1, 0)[0] - c.aMundo(0, 0)[0], y: c.aMundo(1, 0)[1] - c.aMundo(0, 0)[1] }
    cerca(u, { x: 0, y: 1 })
  })

  it('reflejarla con GIM refleja su interior', () => {
    const { p, id } = conDepto('ref-150', { x: 0, y: 0 }, 0)
    const antes = colocado(p, id).aMundo(1, 2)
    const q = mirrorMasses(p, [id], { x: 20, y: 0 }, { x: 20, y: 1 }, null)
    expect(masa(q, id).depto?.espejo).toBe(true)
    cerca(en(colocado(q, id).aMundo(1, 2)), { x: 40 - antes[0], y: antes[1] }, 1e-6)
  })

  it('jalarle un lado la estira: su plano toma el nuevo ancho', () => {
    const { p, id } = conDepto('ref-85', { x: 0, y: 0 }, 0)
    const m = masa(p, id)
    if (m.footprint.kind !== 'contour') throw new Error('contorno')
    const vertices = m.footprint.contour.vertices.map((v) => (v.x > 1 ? { ...v, x: v.x + 1 } : v))
    const q = updateMass(p, id, { footprint: { kind: 'contour', contour: { ...m.footprint.contour, vertices } } })
    expect(colocado(q, id).plan.w).toBeCloseTo(plan85.w + 1, 6)
  })

  it('copiarla lleva su plano y su espejo', () => {
    const { p, id } = conDepto('ref-85', { x: 0, y: 0 }, 0, true)
    const r = copyMass(p, masa(p, id), { x: 20, y: 0 })
    expect(masa(r.project, r.id).depto).toEqual({ plan: 'ref-85', espejo: true })
  })

  it('su unidad para GFit: su tipo, su área, sus recintos en la planta', () => {
    const { p, id } = conDepto('ref-150', { x: 0, y: 0 }, 0)
    const u = unidadDeDepto(p, masa(p, id) as Mass, footprintPolygon(masa(p, id).footprint))!
    expect(u.type).toBe('t150')
    expect(u.area).toBeCloseTo(148, 0)
    expect(u.rooms.length).toBe(plan150.rooms.length)
    expect(u.id).toBe(id)
  })

  it('su huella sigue el orden de su contorno (el primer lado es la fachada)', () => {
    const h = huellaDepto(plan85, { x: 0, y: 0 }, 0, false)
    expect(h.vertices.slice(0, 2).map((v) => [v.x, v.y])).toEqual([[0, 0], [plan85.w, 0]])
  })
})
