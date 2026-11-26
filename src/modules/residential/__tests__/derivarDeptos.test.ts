import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { addMass, updateMass } from '../../../state/actions/masses.ts'
import { newProject } from '../../../typologies/index.ts'
import { derivar } from '../engine/derivar.ts'
import { CIRCULACION, colocarDepto, conProgramasDepto } from '../engine/deptos.ts'
import { agregarTipologias, areaPlan, planesReferencia } from '../engine/tipologias.ts'

const [p85, p105] = planesReferencia()

/** Una barra de tres departamentos (105, 85, 105) de tres pisos, con un pasillo de 1.8 m detrás. */
function barra(conPasillo: boolean): Project {
  let p = agregarTipologias(newProject('mixed-use'))
  let x = 0
  for (const plan of [p105, p85, p105]) {
    const r = colocarDepto(p, plan.id, { x, y: 0 }, 0)
    p = updateMass(r.project, r.id, { height: 9 })
    x += plan.w
  }
  if (conPasillo) {
    p = conProgramasDepto(p)
    const verts = [{ x: 0, y: 7.9 }, { x, y: 7.9 }, { x, y: 9.7 }, { x: 0, y: 9.7 }].map((q) => ({ ...q, r: 0 }))
    const r = addMass(p, { programId: CIRCULACION, footprint: { kind: 'contour', contour: { vertices: verts } }, height: 9 })
    p = r.project
  }
  return p
}

describe('derivar con departamentos dibujados', () => {
  it('GFit cuenta los departamentos dibujados, piso por piso, con su tipo y su área', () => {
    const d = derivar(barra(false), 'b1')!
    expect(d).not.toBeNull()
    expect(d.unidades.length).toBe(9)
    const por = (t: string) => d.unidades.filter((u) => u.unidad.type === t)
    expect(por('t105').length).toBe(6)
    expect(por('t85').length).toBe(3)
    expect(por('t85')[0].unidad.area).toBeCloseTo(areaPlan(p85), 1)
    expect(d.niveles.length).toBe(3)
  })

  it('un pasillo dibujado (Circulación) suma a la planta pero no da departamentos', () => {
    const sin = derivar(barra(false), 'b1')!
    const con = derivar(barra(true), 'b1')!
    expect(con.unidades.length).toBe(9)
    expect(con.totals.gfa).toBeGreaterThan(sin.totals.gfa)
  })

  it('mover un departamento cambia el resultado (no se queda en caché)', () => {
    const p = barra(false)
    const a = derivar(p, 'b1')!
    const id = p.masses.find((m) => m.depto?.plan === p85.id)!.id
    const q = { ...p, masses: p.masses.filter((m) => m.id !== id) }
    const b = derivar(q, 'b1')!
    expect(b.unidades.length).toBe(a.unidades.length - 3)
  })

  it('departamentos sueltos (con huecos entre ellos) dan una sola planta por piso', () => {
    let p = agregarTipologias(newProject('mixed-use'))
    for (const [k, plan] of [p105, p85, p105].entries()) {
      const r = colocarDepto(p, plan.id, { x: k * 20, y: 0 }, 0)
      p = updateMass(r.project, r.id, { height: 6 })
    }
    const d = derivar(p, 'b1')!
    expect(d.niveles.length).toBe(2)
    expect(d.niveles[0].layout!.units.length).toBe(3)
    expect(d.unidades.length).toBe(6)
  })

  it('una planta de departamentos dibujados no recibe núcleo automático de GFit', () => {
    const d = derivar(barra(false), 'b1')!
    expect(d.niveles.every((l) => l.cores.length === 0)).toBe(true)
    expect(d.nucleos).toEqual([])
  })
})
