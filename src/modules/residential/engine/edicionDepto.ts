// Editar un departamento dibujado desde la planta o el 3D (spec 2026-11-26-blocks-residenciales): la edición se hace
// sobre el plano como se ve en la unidad (a su medida) y se guarda en su tipo o en la unidad:
//   'tipo'    el plano de Mi biblioteca que copia (y con él todas sus copias sin variante). Si la unidad está estirada,
//             el plano editado se lleva de vuelta a la medida del tipo (`estirar`, que respeta sus cotas fijas);
//   'unidad'  su variante: el plano propio de esa unidad, a su medida (Volver al tipo la quita).
// Puro.
import type { Id, Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { updateMass } from '../../../state/actions/masses.ts'
import type { PlanCatalogo } from './catalogo.ts'
import { deptoColocado } from './deptos.ts'
import { estirar } from './pieza4.ts'

export type Destino = 'tipo' | 'unidad'

export function editarDepto(p: Project, massId: Id, destino: Destino, editar: (plan: PlanCatalogo) => PlanCatalogo): Project {
  const m = p.masses.find((x) => x.id === massId)
  const c = m?.depto ? deptoColocado(p, m, footprintPolygon(m.footprint)) : null
  if (!m?.depto || !c) return p
  const nuevo = editar(c.plan)
  if (nuevo === c.plan) return p
  if (destino === 'unidad') {
    const base = (p.residential?.catalogo ?? []).find((x) => x.id === m.depto!.plan)
    const variante: PlanCatalogo = { ...nuevo, id: `var-${massId}`, name: `${base?.name ?? nuevo.name} (variante)` }
    return updateMass(p, massId, { depto: { ...m.depto, variante } })
  }
  const r = p.residential!
  const tipo = (r.catalogo ?? []).find((x) => x.id === m.depto!.plan)
  if (!tipo) return p
  const mismo = Math.abs(nuevo.w - tipo.w) < 1e-3 && Math.abs(nuevo.d - tipo.d) < 1e-3
  const guardado: PlanCatalogo = { ...(mismo ? nuevo : estirar(nuevo, tipo.w, tipo.d)), id: tipo.id, name: tipo.name, typeId: tipo.typeId }
  return { ...p, residential: { ...r, catalogo: (r.catalogo ?? []).map((x) => (x.id === tipo.id ? guardado : x)) } }
}
