// Los verbos del módulo residencial, puros: los views los llaman con apply((p) => actions.setParams(p, …)), así entran al
// historial de deshacer de GIM (state/actions/index.ts los trae).
import type { Id, Project } from '../../model/schema.ts'
import { paramsDe } from './engine/defaults.ts'
import type { Reglas } from './engine/calificacion/reglas.ts'
import type { ParamsEdificio } from './engine/schema.ts'

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
