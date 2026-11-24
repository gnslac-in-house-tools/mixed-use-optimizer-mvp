// Los verbos del módulo residencial, puros: los views los llaman con apply((p) => actions.setParams(p, …)), así entran al
// historial de deshacer de GIM (state/actions/index.ts los trae).
import type { Id, Project } from '../../model/schema.ts'
import { paramsDe } from './engine/defaults.ts'
import type { Reglas } from './engine/calificacion/reglas.ts'
import type { ParamsEdificio } from './engine/schema.ts'
import type { PlanCatalogo } from './engine/catalogo.ts'

/** Los parámetros de GFit de un edificio, con lo que se cambió; lo demás, como estaba (o los valores por defecto). */
export function setParams(p: Project, buildingId: Id, parcial: Partial<ParamsEdificio>): Project {
  const r = p.residential
  if (!r) return p
  const antes = paramsDe(p, buildingId)
  const ahora: ParamsEdificio = { ...antes, ...parcial, mezcla: { ...antes.mezcla, ...(parcial.mezcla ?? {}) } }
  return { ...p, residential: { ...r, edificios: { ...r.edificios, [buildingId]: ahora } } }
}

/** Las reglas de la calificación por palancas del proyecto (la ventana «Reglas de calificación» las aplica de una vez). */
export function setCalificacion(p: Project, reglas: Reglas): Project {
  const r = p.residential
  if (!r) return p
  return { ...p, residential: { ...r, calificacion: reglas } }
}

/** Guarda un plano en Mi biblioteca (lo reemplaza si ya está, por id). */
export function guardarPlan(p: Project, plan: PlanCatalogo): Project {
  const r = p.residential
  if (!r) return p
  const cat = r.catalogo ?? []
  const i = cat.findIndex((x) => x.id === plan.id)
  return { ...p, residential: { ...r, catalogo: i < 0 ? [...cat, plan] : cat.map((x, k) => (k === i ? plan : x)) } }
}

/** Quita un plano de Mi biblioteca. */
export function borrarPlan(p: Project, id: string): Project {
  const r = p.residential
  if (!r?.catalogo) return p
  return { ...p, residential: { ...r, catalogo: r.catalogo.filter((x) => x.id !== id) } }
}
