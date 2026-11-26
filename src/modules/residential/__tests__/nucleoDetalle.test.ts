import { describe, expect, it } from 'vitest'
import type { Mass, Point, Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { copyMass, moveMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { agregarElemento, elementosAuto, girarElemento, moverElemento, nucleoColocado, quitarElemento, reacomodarNucleo } from '../engine/nucleoDetalle.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const masa = (id: string, pts: Point[]): Mass => ({ id, name: id, levelId: 'l1', programId: 'nucleo', height: 30, footprint: { kind: 'contour', contour: { vertices: pts.map((q) => ({ ...q, r: 0 })) } } })
function conNucleo(pts = rect(10, 10, 18.1, 15.4)): Project {
  return { ...newProject('mixed-use'), masses: [masa('n', pts)] }
}
const n = (p: Project) => p.masses.find((m) => m.id === 'n')!
const col = (p: Project) => nucleoColocado(n(p), footprintPolygon(n(p).footprint))!
const dentro = (e: { x: number; y: number; w: number; d: number; rot: number }, W: number, D: number) => {
  const [w, d] = e.rot % 180 ? [e.d, e.w] : [e.w, e.d]
  return e.x - w / 2 >= -1e-6 && e.x + w / 2 <= W + 1e-6 && e.y - d / 2 >= -1e-6 && e.y + d / 2 <= D + 1e-6
}

describe('el núcleo con detalle', () => {
  it('sin elementos propios, se acomoda solo: escalera, elevadores, ducto y vestíbulo, dentro del núcleo', () => {
    const es = elementosAuto(8.1, 5.4)
    const kinds = es.map((e) => e.kind)
    expect(kinds).toContain('escalera')
    expect(kinds.filter((k) => k === 'elevador').length).toBe(2)
    expect(kinds).toContain('ducto')
    expect(kinds).toContain('vestibulo')
    for (const e of es) expect(dentro(e, 8.1, 5.4), e.kind).toBe(true)
  })

  it('un núcleo chico lleva un elevador; uno alargado a lo hondo se acomoda a lo hondo', () => {
    expect(elementosAuto(5.4, 5.4).filter((e) => e.kind === 'elevador').length).toBe(1)
    for (const e of elementosAuto(5.4, 9)) expect(dentro(e, 5.4, 9), e.kind).toBe(true)
  })

  it('colocado: su marco sale de su huella, y moverlo lleva sus elementos', () => {
    const p = conNucleo()
    const c = col(p)
    expect(c.W).toBeCloseTo(8.1, 6)
    expect(c.D).toBeCloseTo(5.4, 6)
    const e = c.elementos[0]
    const antes = c.aMundo(e.x, e.y)
    const q = moveMass(p, 'n', { x: 2, y: 1 })
    const d = col(q).aMundo(e.x, e.y)
    expect([d[0] - antes[0], d[1] - antes[1]]).toEqual([expect.closeTo(2, 6), expect.closeTo(1, 6)])
  })

  it('mover, girar, agregar y quitar un elemento lo guarda en la masa; Acomodar de nuevo lo deshace', () => {
    const p = conNucleo()
    const e = col(p).elementos.find((x) => x.kind === 'elevador')!
    const q = moverElemento(p, 'n', e.id, e.x + 0.5, e.y)
    expect(n(q).nucleo!.elementos.find((x) => x.id === e.id)!.x).toBeCloseTo(e.x + 0.5, 6)
    const r = girarElemento(q, 'n', e.id)
    expect(n(r).nucleo!.elementos.find((x) => x.id === e.id)!.rot).toBe(90)
    const s = agregarElemento(r, 'n', 'ducto')
    expect(n(s).nucleo!.elementos.filter((x) => x.kind === 'ducto').length).toBe(col(p).elementos.filter((x) => x.kind === 'ducto').length + 1)
    const t = quitarElemento(s, 'n', e.id)
    expect(n(t).nucleo!.elementos.some((x) => x.id === e.id)).toBe(false)
    expect(n(reacomodarNucleo(t, 'n')).nucleo).toBeUndefined()
  })

  it('copiar un núcleo lleva sus elementos', () => {
    const p = moverElemento(conNucleo(), 'n', col(conNucleo()).elementos[0].id, 1, 1)
    const r = copyMass(p, n(p), { x: 20, y: 0 })
    expect(r.project.masses.find((m) => m.id === r.id)!.nucleo).toEqual(n(p).nucleo)
  })
})
