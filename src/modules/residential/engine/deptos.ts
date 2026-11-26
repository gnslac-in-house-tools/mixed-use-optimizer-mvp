// Un departamento como masa de GIM (spec 2026-11-26-blocks-residenciales): una masa con `depto` es copia de un plano de
// Mi biblioteca (o de su variante). Su lugar, su giro, su espejo y su tamaño se leen de su huella, así que GIM la mueve,
// la gira, la refleja, la copia y la estira como cualquier masa:
//   - la huella sigue el orden del contorno del plano: su primer lado (vértice 0 → 1) es el lado del contorno que va
//     sobre la fachada (y = 0); en espejo empieza en la imagen del vértice 1 (como la deja `reflectContour(…, 0)`);
//   - u: la dirección de ese lado (en espejo, al revés); v: hacia adentro de la huella (a su izquierda);
//   - el plano se estira al ancho y fondo de la huella medidos en u y v (sus cotas fijas se respetan, pieza4.ts).
// Puro.
import type { Contour, Id, Mass, Point, Program, Project } from '../../../model/schema.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'
import { addMass, updateMass } from '../../../state/actions/masses.ts'
import type { PlacedUnit } from './gfit/src/layout/level.ts'
import type { RoomKind } from './gfit/src/model/program.ts'
import type { Pt } from './gfit/src/model/geom.ts'
import type { PlanCatalogo } from './catalogo.ts'
import { estirar, interiorDe } from './pieza4.ts'
import { contornoDe, fachadaDe } from './tipologias.ts'

/** Los programas que dan departamentos y pasillos dibujados (se agregan al proyecto la primera vez que hacen falta). */
export const DEPARTAMENTO = 'departamento'
export const CIRCULACION = 'circulacion'
const PROGRAMAS: Program[] = [
  { id: DEPARTAMENTO, name: 'Departamento', color: '#E7E1D6', built: true, nested: false, size: { width: 10.8, depth: 8.1 } },
  { id: CIRCULACION, name: 'Circulación', color: '#ECEAE5', built: true, nested: false, size: { width: 8.1, depth: 1.8 } },
] as Program[]

/** El proyecto con los programas Departamento y Circulación y sus usos residenciales. */
export function conProgramasDepto(p: Project): Project {
  const r = p.residential
  if (!r) return p
  const faltan = PROGRAMAS.filter((g) => !p.programs.some((x) => x.id === g.id))
  const entrepiso = Object.values(r.usos).find((u) => u.uso === 'vivienda')?.entrepiso ?? 3
  const usos = { ...r.usos }
  if (!usos[DEPARTAMENTO]) usos[DEPARTAMENTO] = { uso: 'depto', entrepiso }
  if (!usos[CIRCULACION]) usos[CIRCULACION] = { uso: 'circulacion', entrepiso }
  if (!faltan.length && usos === r.usos) return p
  return { ...p, programs: [...p.programs, ...faltan.map((g) => ({ ...g }))], residential: { ...r, usos } }
}

/** El plano de un departamento: su variante, o el de Mi biblioteca que nombra. */
export function planDeDepto(p: Project, m: Pick<Mass, 'depto'>): PlanCatalogo | null {
  if (!m.depto) return null
  return (m.depto.variante as PlanCatalogo | undefined) ?? (p.residential?.catalogo ?? []).find((c) => c.id === m.depto!.plan) ?? null
}

export interface Colocado {
  /** el plano a la medida de la huella */
  plan: PlanCatalogo
  espejo: boolean
  /** un punto del marco del plano en la planta */
  aMundo: (x: number, y: number) => Pt
  /** un punto de la planta en el marco del plano */
  aLocal: (q: Point) => Pt
}

/** Dónde y cómo está un departamento, leído de su huella (`poly`, como la deriva GIM). null si no es uno o no tiene plano. */
export function deptoColocado(p: Project, m: Pick<Mass, 'depto'>, poly: Point[]): Colocado | null {
  const base = planDeDepto(p, m)
  if (!base || poly.length < 3) return null
  const espejo = m.depto!.espejo === true
  const [a, b] = poly
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L < 1e-9) return null
  const lado = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  const ccw = signedArea(poly) >= 0
  const v = ccw ? { x: -lado.y, y: lado.x } : { x: lado.y, y: -lado.x }
  const xs = poly.map((q) => (q.x - a.x) * lado.x + (q.y - a.y) * lado.y)
  const ys = poly.map((q) => (q.x - a.x) * v.x + (q.y - a.y) * v.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys)
  const W = Math.max(...xs) - x0, D = Math.max(...ys) - y0
  const plan = Math.abs(W - base.w) > 1e-3 || Math.abs(D - base.d) > 1e-3 ? estirar(base, W, D) : base
  const o = { x: a.x + lado.x * x0 + v.x * y0, y: a.y + lado.y * x0 + v.y * y0 }
  const aMundo = (x: number, y: number): Pt => {
    const X = espejo ? W - x : x
    return [o.x + lado.x * X + v.x * y, o.y + lado.y * X + v.y * y]
  }
  const aLocal = (q: Point): Pt => {
    const X = (q.x - o.x) * lado.x + (q.y - o.y) * lado.y
    const y = (q.x - o.x) * v.x + (q.y - o.y) * v.y
    return [espejo ? W - X : X, y]
  }
  return { plan, espejo, aMundo, aLocal }
}

/** La huella de un plano puesto con su origen en `o`, su fachada girada `angulo` grados, en espejo o no. */
export function huellaDepto(plan: PlanCatalogo, o: Point, angulo: number, espejo: boolean): Contour {
  const a = (angulo * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const v = { x: -u.y, y: u.x }
  const w = plan.w
  const pts = contornoDe(plan).map(([x, y]) => {
    const X = espejo ? w - x : x
    return { x: o.x + u.x * X + v.x * y, y: o.y + u.y * X + v.y * y }
  })
  // en espejo el contorno queda al revés: se recorre al derecho empezando en la imagen del vértice 1
  const orden = espejo ? [pts[1], pts[0], ...pts.slice(2).reverse()] : pts
  return { vertices: orden.map((q) => ({ x: q.x, y: q.y, r: 0 })) }
}

/**
 * El proyecto con un departamento más (del plano `planId`, en el nivel `levelId` o el de planta baja). `forma`: el plano
 * a la medida que tendrá su huella (estirado); sin ella, el de Mi biblioteca.
 */
export function colocarDepto(p: Project, planId: string, o: Point, angulo = 0, espejo = false, levelId?: Id, forma?: PlanCatalogo): { project: Project; id: Id } {
  const q = conProgramasDepto(p)
  const plan = forma ?? (q.residential?.catalogo ?? []).find((c) => c.id === planId)
  if (!plan) return { project: p, id: '' }
  const r = addMass(q, { programId: DEPARTAMENTO, footprint: { kind: 'contour', contour: huellaDepto(plan, o, angulo, espejo) }, name: plan.name, ...(levelId ? { levelId } : {}) })
  return { project: updateMass(r.project, r.id, { depto: { plan: planId, ...(espejo ? { espejo: true } : {}) } }), id: r.id }
}

/** La unidad que GFit cuenta para un departamento: su tipo, su área, su huella, sus recintos y su entrada, en la planta. */
export function unidadDeDepto(p: Project, m: Pick<Mass, 'id' | 'depto'>, poly: Point[]): PlacedUnit | null {
  const c = deptoColocado(p, m, poly)
  if (!c) return null
  const anillo = (r: [number, number][]) => {
    const w = r.map(([x, y]) => c.aMundo(x, y))
    return signedArea(w.map(([x, y]) => ({ x, y }))) < 0 ? w.reverse() : w
  }
  const shape = [anillo(contornoDe(c.plan))]
  const area = Math.abs(signedArea(shape[0].map(([x, y]) => ({ x, y }))))
  const [f0, f1] = fachadaDe(c.plan)
  return {
    id: m.id,
    type: c.plan.typeId,
    shape,
    area,
    w: f1 - f0,
    corner: false,
    facing: [],
    rooms: c.plan.rooms.map((r) => ({ name: r.name, kind: r.kind as RoomKind, shape: [anillo(r.shape)] })),
    entry: c.aMundo(c.plan.w / 2, c.plan.d),
  }
}

/**
 * El interior de una unidad de la planta: si es un departamento dibujado, el de su plano (o su variante) puesto en su
 * huella; si no, el de Mi biblioteca o el de GFit (pieza4.ts). El marco es afín (en espejo, su u va al revés).
 */
type Interior = Omit<NonNullable<ReturnType<typeof interiorDe>>, 'fuente'> & { fuente: 'mi-biblioteca' | 'gfit' | 'depto' }
export function interiorParaUnidad(p: Project, masas: Record<Id, { polygon: Point[] }>, u: PlacedUnit, catalogo: PlanCatalogo[]): Interior | null {
  const m = p.masses.find((x) => x.id === u.id)
  const poly = masas[u.id]?.polygon
  if (m?.depto && poly) {
    const c = deptoColocado(p, m, poly)
    if (c) {
      const o = c.aMundo(0, 0), ux = c.aMundo(1, 0), vy = c.aMundo(0, 1)
      const marco = { o, u: [ux[0] - o[0], ux[1] - o[1]] as Pt, v: [vy[0] - o[0], vy[1] - o[1]] as Pt, w: c.plan.w, d: c.plan.d }
      return { plan: c.plan, marco, recintos: u.rooms.map((r) => ({ kind: r.kind, name: r.name, shape: r.shape })), fuente: 'depto' }
    }
  }
  return interiorDe(u, catalogo)
}
