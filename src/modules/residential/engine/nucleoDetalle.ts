// El núcleo con detalle (spec 2026-11-26-blocks-residenciales): sus escaleras, elevadores, ductos y vestíbulo, cada uno
// un rectángulo en el marco de la huella del núcleo (x a lo largo de su primer lado, y hacia adentro; centro, medida y
// giro). Sin elementos propios (`Mass.nucleo`), se acomodan solos por su tamaño (`elementosAuto`); moverlos, girarlos,
// agregar o quitar uno los vuelve propios de esa masa. Moverla la lleva con todo. Puro.
import type { Id, Mass, Point, Project } from '../../../model/schema.ts'
import { footprintPolygon } from '../../../engine/geom/footprint.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'
import { updateMass } from '../../../state/actions/masses.ts'
import type { Pt } from './gfit/src/model/geom.ts'

export type ElementoNucleo = NonNullable<Mass['nucleo']>['elementos'][number]
export type KindNucleo = ElementoNucleo['kind']

/** m: la escalera (dos tramos y su descanso), la cabina de un elevador con su cubo, un ducto */
export const ESCALERA = { w: 2.6, d: 5.6 }
export const ELEVADOR = 2.2
export const DUCTO = { w: 1.0, d: 1.5 }
export const NOMBRES: Record<KindNucleo, string> = { escalera: 'Escalera', elevador: 'Elevador', ducto: 'Ducto', vestibulo: 'Vestíbulo' }

const r3 = (n: number) => Math.round(n * 1000) / 1000
const el = (id: string, kind: KindNucleo, x0: number, y0: number, x1: number, y1: number): ElementoNucleo =>
  ({ id, kind, x: r3((x0 + x1) / 2), y: r3((y0 + y1) / 2), w: r3(x1 - x0), d: r3(y1 - y0), rot: 0 })

/**
 * El acomodo de inicio de un núcleo de W × D: a lo largo, la escalera (a todo lo hondo, hasta 5.6 m), uno o dos
 * elevadores contra el fondo, un ducto en la punta y el vestíbulo en lo que queda, frente a los elevadores. Un núcleo
 * más hondo que largo se acomoda igual, a lo hondo.
 */
export function elementosAuto(W: number, D: number): ElementoNucleo[] {
  if (D > W) return elementosAuto(D, W).map((e) => ({ ...e, x: e.y, y: e.x, w: e.d, d: e.w }))
  const esc = Math.min(ESCALERA.w, W * 0.45)
  const resto = W - esc
  const n = resto >= 2 * ELEVADOR + DUCTO.w ? 2 : 1
  const lado = Math.min(ELEVADOR, resto / (n + 0.5), D * 0.6)
  const out = [el('escalera', 'escalera', 0, 0, esc, Math.min(D, ESCALERA.d))]
  for (let k = 0; k < n; k++) out.push(el(`elevador${k + 1}`, 'elevador', esc + k * lado, D - lado, esc + (k + 1) * lado, D))
  const xd = esc + n * lado
  const dw = Math.min(DUCTO.w, Math.max(0, W - xd))
  if (dw > 0.4) out.push(el('ducto', 'ducto', W - dw, D - Math.min(DUCTO.d, lado), W, D))
  if (D - lado > 0.8) out.push(el('vestibulo', 'vestibulo', esc, 0, W, D - lado))
  return out
}

export interface NucleoColocado {
  W: number
  D: number
  elementos: ElementoNucleo[]
  /** propios de la masa (no los de inicio) */
  propios: boolean
  aMundo: (x: number, y: number) => Pt
  aLocal: (q: Point) => Pt
}

/** El marco de un núcleo leído de su huella (`poly`) y sus elementos. null si su huella no sirve. */
export function nucleoColocado(m: Pick<Mass, 'nucleo'>, poly: Point[]): NucleoColocado | null {
  if (poly.length < 3) return null
  const [a, b] = poly
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L < 1e-9) return null
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  const v = signedArea(poly) >= 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x }
  const xs = poly.map((q) => (q.x - a.x) * u.x + (q.y - a.y) * u.y)
  const ys = poly.map((q) => (q.x - a.x) * v.x + (q.y - a.y) * v.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const W = Math.max(...xs) - x0, D = Math.max(...ys) - y0
  const o = { x: a.x + u.x * x0 + v.x * y0, y: a.y + u.y * x0 + v.y * y0 }
  return {
    W, D,
    elementos: m.nucleo?.elementos ?? elementosAuto(W, D),
    propios: !!m.nucleo,
    aMundo: (x, y) => [o.x + u.x * x + v.x * y, o.y + u.y * x + v.y * y],
    aLocal: (q) => [(q.x - o.x) * u.x + (q.y - o.y) * u.y, (q.x - o.x) * v.x + (q.y - o.y) * v.y],
  }
}

/** Las cuatro esquinas de un elemento en el marco del núcleo (girado sobre su centro). */
export function esquinas(e: ElementoNucleo): [number, number][] {
  const [w, d] = e.rot % 180 ? [e.d, e.w] : [e.w, e.d]
  return [[e.x - w / 2, e.y - d / 2], [e.x + w / 2, e.y - d / 2], [e.x + w / 2, e.y + d / 2], [e.x - w / 2, e.y + d / 2]]
}

/** Un punto del marco del elemento (u a lo largo de su `w`, v a lo hondo de su `d`, desde su esquina) en el del núcleo. */
export function enNucleo(e: ElementoNucleo, u: number, v: number): [number, number] {
  const lu = u - e.w / 2, lv = v - e.d / 2
  switch (e.rot) {
    case 90: return [e.x - lv, e.y + lu]
    case 180: return [e.x - lu, e.y - lv]
    case 270: return [e.x + lv, e.y - lu]
    default: return [e.x + lu, e.y + lv]
  }
}

/** Los elementos de un núcleo cambiados (se vuelven propios de su masa). */
function conElementos(p: Project, massId: Id, cambia: (es: ElementoNucleo[], c: NucleoColocado) => ElementoNucleo[]): Project {
  const m = p.masses.find((x) => x.id === massId)
  const c = m ? nucleoColocado(m, footprintPolygon(m.footprint)) : null
  if (!m || !c) return p
  return updateMass(p, massId, { nucleo: { elementos: cambia(c.elementos, c) } })
}

/** Un elemento a (x, y) del marco, sin salirse del núcleo. */
export function moverElemento(p: Project, massId: Id, id: string, x: number, y: number): Project {
  return conElementos(p, massId, (es, c) => es.map((e) => {
    if (e.id !== id) return e
    const [w, d] = e.rot % 180 ? [e.d, e.w] : [e.w, e.d]
    return { ...e, x: r3(Math.max(w / 2, Math.min(c.W - w / 2, x))), y: r3(Math.max(d / 2, Math.min(c.D - d / 2, y))) }
  }))
}

/** Un elemento girado 90°. */
export function girarElemento(p: Project, massId: Id, id: string): Project {
  return conElementos(p, massId, (es) => es.map((e) => (e.id === id ? { ...e, rot: ((e.rot + 90) % 360) as ElementoNucleo['rot'] } : e)))
}

/** Un elemento más, al centro del núcleo. */
export function agregarElemento(p: Project, massId: Id, kind: KindNucleo): Project {
  return conElementos(p, massId, (es, c) => {
    const medida = kind === 'escalera' ? ESCALERA : kind === 'elevador' ? { w: ELEVADOR, d: ELEVADOR } : kind === 'ducto' ? DUCTO : { w: 2.4, d: 2.4 }
    let k = 1
    while (es.some((e) => e.id === `${kind}${k}`)) k++
    return [...es, { id: `${kind}${k}`, kind, x: r3(c.W / 2), y: r3(c.D / 2), w: Math.min(medida.w, c.W), d: Math.min(medida.d, c.D), rot: 0 }]
  })
}

/** Quita un elemento. */
export function quitarElemento(p: Project, massId: Id, id: string): Project {
  return conElementos(p, massId, (es) => es.filter((e) => e.id !== id))
}

/** Sus elementos vuelven a acomodarse solos. */
export function reacomodarNucleo(p: Project, massId: Id): Project {
  const m = p.masses.find((x) => x.id === massId)
  if (!m?.nucleo) return p
  const { nucleo: _, ...resto } = m
  return { ...p, masses: p.masses.map((x) => (x.id === massId ? resto : x)) }
}
