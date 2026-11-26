// Los verbos del módulo residencial, puros: los views los llaman con apply((p) => actions.setParams(p, …)), así entran al
// historial de deshacer de GIM (state/actions/index.ts los trae).
import type { Id, Project } from '../../model/schema.ts'
import { paramsDe, potDe } from './engine/defaults.ts'
import type { Reglas } from './engine/calificacion/reglas.ts'
import type { ParamsEdificio } from './engine/schema.ts'
import type { PlanCatalogo } from './engine/catalogo.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { mirrorMasses, updateMass } from '../../state/actions/masses.ts'
import { colocarDepto as colocar, deptoColocado, huellaDepto } from './engine/deptos.ts'
import { fijarAcomodo as fijar } from './engine/fijar.ts'
import { agregarTipologias as agregar } from './engine/tipologias.ts'

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

/** El POT del proyecto (índice de edificabilidad, altura máxima), con lo que se cambió. */
export function setPot(p: Project, parcial: Partial<{ indice: number; altura: number }>): Project {
  const r = p.residential
  if (!r) return p
  return { ...p, residential: { ...r, pot: { ...potDe(p), ...parcial } } }
}

// ---- departamentos dibujados (spec 2026-11-26-blocks-residenciales) ------------------------------------------------

/** Fija el acomodo de GFit de la vivienda de un nivel: sus departamentos pasan a ser masas ligadas a su plano. */
export function fijarAcomodo(p: Project, buildingId: Id, levelId: Id): Project {
  return fijar(p, buildingId, levelId)
}

/**
 * Un departamento más del plano `planId` en el nivel `levelId`: a 5 m a la derecha de lo que ya hay en ese nivel (o en
 * el origen), con la fachada hacia abajo de la planta; luego se mueve como cualquier masa.
 */
export function colocarDepto(p: Project, planId: string, levelId: Id): Project {
  const aqui = p.masses.filter((m) => m.levelId === levelId).flatMap((m) => footprintPolygon(m.footprint))
  const o = aqui.length ? { x: Math.max(...aqui.map((q) => q.x)) + 5, y: Math.min(...aqui.map((q) => q.y)) } : { x: 0, y: 0 }
  return colocar(p, planId, o, 0, false, levelId).project
}

/** Refleja un departamento en su lugar (sobre el eje que cruza su fachada por la mitad): su interior va en espejo. */
export function reflejarDepto(p: Project, massId: Id): Project {
  const m = p.masses.find((x) => x.id === massId)
  const c = m?.depto ? deptoColocado(p, m, footprintPolygon(m.footprint)) : null
  if (!c) return p
  const a = c.aMundo(c.plan.w / 2, 0), b = c.aMundo(c.plan.w / 2, c.plan.d)
  return mirrorMasses(p, [massId], { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, null, false)
}

/** Cambia el plano de un departamento: el nuevo, con su medida, en el mismo lugar, giro y espejo. */
export function cambiarPlanDepto(p: Project, massId: Id, planId: string): Project {
  const m = p.masses.find((x) => x.id === massId)
  const nuevo = (p.residential?.catalogo ?? []).find((c) => c.id === planId)
  const c = m?.depto ? deptoColocado(p, m, footprintPolygon(m.footprint)) : null
  if (!m || !nuevo || !c) return p
  const o = c.espejo ? c.aMundo(c.plan.w, 0) : c.aMundo(0, 0)
  const x1 = c.espejo ? c.aMundo(c.plan.w - 1, 0) : c.aMundo(1, 0)
  const angulo = (Math.atan2(x1[1] - o[1], x1[0] - o[0]) * 180) / Math.PI
  return updateMass(p, massId, {
    footprint: { kind: 'contour', contour: huellaDepto(nuevo as PlanCatalogo, { x: o[0], y: o[1] }, angulo, c.espejo) },
    depto: { plan: planId, ...(c.espejo ? { espejo: true } : {}) },
    name: nuevo.name,
  })
}

/** Lo que un departamento cambió solo para él (su variante) se va: vuelve a ser copia de su plano. */
export function volverAlTipo(p: Project, massId: Id): Project {
  const m = p.masses.find((x) => x.id === massId)
  if (!m?.depto?.variante) return p
  const { variante: _, ...depto } = m.depto
  return updateMass(p, massId, { depto })
}

/** Agrega a Mi biblioteca las tipologías del proyecto de referencia (85, 105 y 150 m² en esquina) y sus tipos. */
export function agregarTipologias(p: Project): Project {
  return agregar(p)
}
