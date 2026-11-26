// Fijar acomodo (spec 2026-11-26-blocks-residenciales): lo que GFit acomoda en la vivienda de un nivel se vuelve
// dibujo. Cada departamento de su planta más baja pasa a ser una masa ligada a un plano de Mi biblioteca (el de su tipo
// que mejor le queda, o el que GFit le acomoda, que entra a Mi biblioteca una vez por tipo y medida); lo que queda de
// la planta, una masa de Circulación; la masa de vivienda se va. Los núcleos se quedan. Puro.
import type { Id, Point, Project } from '../../../model/schema.ts'
import { difference, union } from '../../../engine/geom/boolean.ts'
import { addMass, removeMass, updateMass } from '../../../state/actions/masses.ts'
import { deriveMassing } from '../../../engine/derive.ts'
import type { PlanCatalogo } from './catalogo.ts'
import { CIRCULACION, colocarDepto, conProgramasDepto } from './deptos.ts'
import { derivar } from './derivar.ts'
import { interiorDe } from './pieza4.ts'

const r2 = (v: number) => Math.round(v * 20) / 20

/** El proyecto con el acomodo de GFit de la vivienda del nivel `levelId` del edificio fijado en masas. */
export function fijarAcomodo(p: Project, buildingId: Id, levelId: Id): Project {
  const usos = p.residential?.usos ?? {}
  const viviendas = p.masses.filter((m) => m.levelId === levelId && m.programId && usos[m.programId]?.uso === 'vivienda')
  if (!viviendas.length) return p
  const d = derivar(p, buildingId)
  if (!d) return p
  const ids = new Set(viviendas.map((m) => m.id))
  let q = conProgramasDepto(p)
  const catalogo = [...((q.residential?.catalogo ?? []) as PlanCatalogo[])]
  const nombres = new Map((q.residential?.tipos ?? []).map((t) => [t.id, t.name]))
  const masas = deriveMassing(p).masses
  for (const v of viviendas) {
    // su planta más baja con departamentos
    const nivel = d.niveles.find((l) => l.block === v.id && (l.layout?.units.length ?? 0) > 0)
    if (!nivel) continue
    const piezas: Point[][] = []
    for (const u of nivel.layout!.units) {
      const it = interiorDe(u, catalogo)
      if (!it) continue
      let plan = it.plan
      if (it.fuente === 'gfit') {
        // uno por tipo y medida
        const id = `gfit-${u.type}-${r2(plan.w)}x${r2(plan.d)}`
        const ya = catalogo.find((c) => c.id === id)
        plan = ya ?? { ...plan, id, name: `${nombres.get(u.type) ?? u.type} ${r2(plan.w).toFixed(2)} × ${r2(plan.d).toFixed(2)}` }
        if (!ya) catalogo.push(plan)
      }
      const angulo = (Math.atan2(it.marco.u[1], it.marco.u[0]) * 180) / Math.PI
      const r = colocarDepto({ ...q, residential: { ...q.residential!, catalogo } }, plan.id, { x: it.marco.o[0], y: it.marco.o[1] }, angulo, false, levelId, it.plan)
      // al tamaño del departamento de GFit: el plano se estira a su huella
      q = updateMass(r.project, r.id, { ...(v.height !== undefined ? { height: v.height } : {}), name: plan.name })
      piezas.push(u.shape[0].map(([x, y]) => ({ x, y })))
    }
    // el pasillo: la planta menos sus departamentos
    const planta = masas[v.id]
    if (planta) {
      const resto = difference([planta.polygon, ...planta.holes], union(piezas, []).flat())
      for (const region of resto) {
        const [outer] = region
        if (!outer || outer.length < 3) continue
        const r = addMass(q, { programId: CIRCULACION, footprint: { kind: 'contour', contour: { vertices: outer.map((pt) => ({ x: pt.x, y: pt.y, r: 0 })) } }, levelId, ...(v.height !== undefined ? { height: v.height } : {}), name: 'Circulación' })
        q = r.project
      }
    }
  }
  for (const id of ids) q = removeMass(q, id)
  return { ...q, residential: { ...q.residential!, catalogo } }
}
