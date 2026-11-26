// Las manijas para editar un departamento en la planta y en el 3D (spec 2026-11-26-blocks-residenciales): dónde va la
// de cada muro interior movible (a lo largo de su tramo) y la de cada mueble (a su medida), en la planta del mundo,
// con el arrastre en curso ya aplicado. Los arrastres avanzan de 5 en 5 cm desde donde estaba. Puro.
import type { Point } from '../../../model/schema.ts'
import { CATALOGO, type PlanCatalogo } from './catalogo.ts'
import { ejesMovibles, type Eje } from './editor.ts'
import type { Pt } from './gfit/src/model/geom.ts'

export const PASO = 0.05
/** m: el ancho de la manija de un muro */
const GROSOR_MURO = 0.3

/** `valor` en pasos de 5 cm desde `de` (no se pega a una rejilla absoluta). */
export const pasoDesde = (de: number, valor: number) => de + Math.round((valor - de) / PASO) * PASO

/** Lo que abarca el muro del eje `e` en `c`: de la menor a la mayor coordenada de los lados de recinto sobre él. */
export function tramoMuro(plan: PlanCatalogo, e: Eje, c: number): [number, number] | null {
  const vs: number[] = []
  for (const r of plan.rooms) {
    const s = r.shape
    s.forEach((a, i) => {
      const b = s[(i + 1) % s.length]
      const [ca, cb, oa, ob] = e === 'x' ? [a[0], b[0], a[1], b[1]] : [a[1], b[1], a[0], b[0]]
      if (Math.abs(ca - c) < 1e-3 && Math.abs(cb - c) < 1e-3) vs.push(oa, ob)
    })
  }
  return vs.length ? [Math.min(...vs), Math.max(...vs)] : null
}

type AMundo = (x: number, y: number) => Pt
const enMundo = (aMundo: AMundo, r: [number, number][]): Point[] => r.map(([x, y]) => { const [X, Y] = aMundo(x, y); return { x: X, y: Y } })

export interface ManijaMuro { eje: Eje; cc: number; pts: Point[] }
export interface ManijaMueble { id: string; pts: Point[] }

/** La manija de cada muro interior movible; `mueve`: el que se arrastra, dibujado en `a`. */
export function manijasMuros(plan: PlanCatalogo, aMundo: AMundo, mueve?: { eje: Eje; de: number; a: number }): ManijaMuro[] {
  const mov = ejesMovibles(plan)
  const h = GROSOR_MURO / 2
  return (['x', 'y'] as Eje[]).flatMap((e) =>
    mov[e].flatMap((cc) => {
      const t = tramoMuro(plan, e, cc)
      if (!t) return []
      const en = mueve && mueve.eje === e && Math.abs(mueve.de - cc) < 1e-3 ? mueve.a : cc
      const r: [number, number][] = e === 'x'
        ? [[en - h, t[0]], [en + h, t[0]], [en + h, t[1]], [en - h, t[1]]]
        : [[t[0], en - h], [t[1], en - h], [t[1], en + h], [t[0], en + h]]
      return [{ eje: e, cc, pts: enMundo(aMundo, r) }]
    }),
  )
}

/** La manija de cada mueble, a su medida; `mueve`: el que se arrastra, dibujado en (x, y). */
export function manijasMuebles(plan: PlanCatalogo, aMundo: AMundo, mueve?: { id: string; x: number; y: number }): ManijaMueble[] {
  return plan.muebles.map((f) => {
    const k = CATALOGO[f.kind] ?? { w: 0.6, d: 0.6 }
    const [fw, fd] = f.rot === 90 || f.rot === 270 ? [k.d, k.w] : [k.w, k.d]
    const { x, y } = mueve && mueve.id === f.id ? mueve : f
    return { id: f.id, pts: enMundo(aMundo, [[x - fw / 2, y - fd / 2], [x + fw / 2, y - fd / 2], [x + fw / 2, y + fd / 2], [x - fw / 2, y + fd / 2]]) }
  })
}
