// El catálogo de unidades: planos de departamento (recintos y muebles) por tipo y tamaño. Viene de
// mixed-use-optimizer@e6b1a81 (`engine/muebles.ts`, `engine/plantaEditada.ts#recintos`, `ui/presets.ts`,
// `ui/marca.ts`), recortado a lo que usa el catálogo: sin planta, sin marco en el mundo, sin edición de muros.
//
// El marco de una unidad: x a lo largo de la fachada (las ventanas), y desde la fachada (0) hacia el pasillo (d).
// Todo es geometría pura; los recintos salen del WFC de cuartos de GFit (`gfit/src/layout/rooms.ts`).
import type { Pt, Ring } from './gfit/src/model/geom.ts'
import { intersection, signedArea } from './gfit/src/model/geom.ts'
import { generateRooms } from './gfit/src/layout/rooms.ts'
import { ROOMS0, UNIT_TEMPLATES } from './gfit/src/model/program.ts'
import type { RoomType, UnitType } from './gfit/src/model/program.ts'

export type { Pt, Ring, UnitType }

// ---- tipos ---------------------------------------------------------------------------------------------------

export interface PlanRecinto { name: string; kind: string; shape: Ring }
export type Rot = 0 | 90 | 180 | 270
/** un mueble en el marco de la unidad: su centro, su giro y el recinto al que pertenece (índice en `rooms`) */
export interface Mueble { id: string; kind: string; room: number; x: number; y: number; rot: Rot }
export interface ReglasUnidad {
  /** la cama principal */
  cama: 'matrimonial' | 'queen' | 'king'
  /** sillas del comedor */
  comedor: 4 | 6
  /** m: el paso libre junto a camas y frente a cubiertas */
  paso: number
  /** clósets en los dormitorios */
  closets: boolean
}
/** Un plano del catálogo, en el marco de una unidad de w × d. */
export interface PlanCatalogo {
  id: string
  name: string
  origen: 'generada' | 'manual'
  typeId: string
  w: number
  d: number
  rooms: PlanRecinto[]
  muebles: Mueble[]
  reglas: ReglasUnidad
  /** el plano de la Biblioteca GFit del que se copió */
  desde?: string
  /** pieza 3 (editor): puertas sobre los muros interiores, ventanas en la fachada y los tramos de cota fijos por eje */
  puertas?: Puerta[]
  ventanas?: Ventana[]
  fijas?: { x: number[]; y: number[] }
}
/** Una puerta en un muro interior: el eje del muro (x: un muro a x constante) y su centro. */
export interface Puerta { eje: 'x' | 'y'; x: number; y: number; ancho: number }
/** Una ventana en la fachada (y = 0): su centro a lo largo de x. */
export interface Ventana { x: number; ancho: number }

export const REGLAS0: ReglasUnidad = { cama: 'queen', comedor: 4, paso: 0.75, closets: true }

// ---- marca: tipos, colores y nombres (mixed-use-optimizer `ui/marca.ts`) ---------------------------------------

export const UNIT_COLORS: Record<string, string> = { studio: '#F4C3C5', br1: '#5BB58C', br2: '#A99BE6', br3: '#EE9362' }
export const TYPE_ES: Record<string, string> = { studio: 'Estudio', br1: '1 rec.', br2: '2 rec.', br3: '3 rec.' }
export const ROOM_FILL: Record<string, string> = { living: '#F6E9CF', dining: '#F4E4CC', kitchen: '#F3DCC0', bath: '#CFEBEA', halfbath: '#D9F0EF', master: '#D3E2F5', bed: '#DCE8F6', study: '#E6E0F3', laundry: '#E0EEEE', storage: '#E8E8E8', hall: '#EFEFEF', terrace: '#E3F1D9' }

/** Los tipos de unidad del catálogo: las plantillas de GFit (estudio a 3 rec.) con nombre y color en español. */
export const TIPOS: UnitType[] = UNIT_TEMPLATES().map((t) => ({ ...t, name: TYPE_ES[t.id] ?? t.name, color: UNIT_COLORS[t.id] ?? t.color }))
/** m: el fondo de unidad del proyecto demo */
export const FONDO0 = 8.1

/** muebles (m): w a lo largo de x y d a lo largo de y sin girar */
export const CATALOGO: Record<string, { name: string; w: number; d: number }> = {
  'cama-matrimonial': { name: 'Cama matrimonial', w: 1.4, d: 1.9 },
  'cama-queen': { name: 'Cama queen', w: 1.6, d: 2.0 },
  'cama-king': { name: 'Cama king', w: 1.9, d: 2.0 },
  'cama-individual': { name: 'Cama individual', w: 1.0, d: 1.9 },
  buro: { name: 'Buró', w: 0.45, d: 0.4 },
  closet: { name: 'Clóset', w: 1.6, d: 0.6 },
  sofa: { name: 'Sofá', w: 2.1, d: 0.9 },
  'mesa-centro': { name: 'Mesa de centro', w: 1.0, d: 0.5 },
  sillon: { name: 'Sillón', w: 0.8, d: 0.8 },
  tv: { name: 'Mueble de TV', w: 1.6, d: 0.4 },
  'comedor-4': { name: 'Comedor 4', w: 1.2, d: 0.9 },
  'comedor-6': { name: 'Comedor 6', w: 1.8, d: 0.9 },
  silla: { name: 'Silla', w: 0.45, d: 0.45 },
  cocina: { name: 'Cocineta', w: 2.4, d: 0.6 },
  refri: { name: 'Refrigerador', w: 0.75, d: 0.7 },
  wc: { name: 'Inodoro', w: 0.4, d: 0.7 },
  lavabo: { name: 'Lavabo', w: 0.55, d: 0.45 },
  regadera: { name: 'Regadera', w: 0.9, d: 0.9 },
  lavadora: { name: 'Lavadora', w: 0.6, d: 0.6 },
  escritorio: { name: 'Escritorio', w: 1.2, d: 0.6 },
  estante: { name: 'Estante', w: 1.2, d: 0.4 },
  'mesa-terraza': { name: 'Mesa de terraza', w: 0.7, d: 0.7 },
}

// ---- utilidades de anillos -------------------------------------------------------------------------------------

const r3 = (v: number) => Math.round(v * 1000) / 1000
const ringArea = (r: Ring) => Math.abs(signedArea(r))
const ccw = (r: Ring): Ring => (signedArea(r) < 0 ? [...r].reverse() : r)
export const areaDe = ringArea

/**
 * Un anillo sin esquinas repetidas ni esquinas sobre un tramo recto, antihorario, redondeado al milímetro. (En el
 * repo original lo hace `tidy` del kernel de GIM; aquí basta esta versión, que no arrastra los booleanos de GIM.)
 */
export function limpio(r: Ring): Ring {
  let p = ccw(r).map(([x, y]) => [r3(x), r3(y)] as Pt)
  for (let changed = true; changed && p.length > 3;) {
    changed = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3 || Math.abs(cross) < 1e-6) { p = p.filter((_, k) => k !== i); changed = true; break }
    }
  }
  return p
}

// ---- recintos (GFit, WFC de cuartos) -----------------------------------------------------------------------------

const ES: Record<string, string> = { living: 'Estar', dining: 'Comedor', kitchen: 'Cocina', bath: 'Baño', halfbath: 'Medio baño', master: 'Dormitorio principal', bed: 'Dormitorio', study: 'Estudio', laundry: 'Lavandería', storage: 'Bodega', hall: 'Vestíbulo', terrace: 'Terraza' }
export const nombreRecinto = (kind: string, name: string) => ES[kind] ?? name

const ROOMS = ROOMS0()
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100000 }

interface Fachada { a: Pt; b: Pt; len: number; n: Pt }
/** las aristas de un anillo que caen sobre el contorno de la planta, con su normal hacia afuera */
function fachadas(r: Ring, plate: Ring[]): Fachada[] {
  const segs = plate.flatMap((q) => q.map((a, i) => [a, q[(i + 1) % q.length]] as [Pt, Pt]))
  const near = (p: Pt, [a, b]: [Pt, Pt]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 0.05
  }
  const out: Fachada[] = []
  r.forEach((a, i) => {
    const b = r[(i + 1) % r.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 0.3) return
    if (!segs.some((s) => near(a, s) && near(b, s))) return
    out.push({ a, b, len, n: [(b[1] - a[1]) / len, -(b[0] - a[0]) / len] })
  })
  return out
}

/**
 * Recintos nuevos para una unidad (el WFC de cuartos de GFit): la fachada más larga de la unidad es el eje x del
 * marco y su fondo la profundidad hacia adentro; los cuartos del programa del tipo se acomodan en ese rectángulo
 * w × d y se recortan a la unidad.
 */
export function recintos(shape: Ring, t: UnitType | undefined, plate: Ring[], salt: string): PlanRecinto[] {
  if (!t) return []
  const prog = t.rooms.map((id) => ROOMS.find((r) => r.id === id)).filter((r): r is RoomType => !!r)
  if (!prog.length) return []
  const f = fachadas(shape, plate)
  const edges = f.length ? f : shape.map((a, i) => { const b = shape[(i + 1) % shape.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, b, len, n: [(b[1] - a[1]) / len, -(b[0] - a[0]) / len] as Pt } })
  const e = edges.reduce((x, y) => (y.len > x.len ? y : x))
  const u: Pt = [(e.b[0] - e.a[0]) / e.len, (e.b[1] - e.a[1]) / e.len]
  const nIn: Pt = [-e.n[0], -e.n[1]]
  const xs = shape.map((p) => (p[0] - e.a[0]) * u[0] + (p[1] - e.a[1]) * u[1])
  const ys = shape.map((p) => (p[0] - e.a[0]) * nIn[0] + (p[1] - e.a[1]) * nIn[1])
  const x0 = Math.min(...xs), w = Math.max(...xs) - x0, y0 = Math.min(...ys), d = Math.max(...ys) - y0
  if (w < 1 || d < 1) return []
  let g = generateRooms(w, d, prog, seedOf(salt))
  for (let k = 1; k < 5 && g.fail; k++) g = generateRooms(w, d, prog, seedOf(salt) + k * 7717)
  if (g.fail) return []
  // marco de cuartos: x a lo largo de la fachada, y = 0 pasillo … d fachada
  const at = (rx: number, ry: number): Pt => {
    const s = x0 + rx, t2 = y0 + (d - ry)
    return [e.a[0] + u[0] * s + nIn[0] * t2, e.a[1] + u[1] * s + nIn[1] * t2]
  }
  return g.rooms.flatMap((rm) => {
    const ring: Ring = ccw([at(rm.r[0], rm.r[1]), at(rm.r[2], rm.r[1]), at(rm.r[2], rm.r[3]), at(rm.r[0], rm.r[3])])
    return intersection([ring], [shape]).filter((r) => ringArea(r) > 0.05).map((r) => ({ name: nombreRecinto(rm.kind, rm.name), kind: rm.kind, shape: limpio(r) }))
  })
}

// ---- muebles por reglas ----------------------------------------------------------------------------------------

type Box = [number, number, number, number]
const bboxOf = (r: Ring): Box => { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
/** la huella de un mueble en el marco */
export function huella(m: Mueble): Box {
  const c = CATALOGO[m.kind] ?? { w: 0.5, d: 0.5 }
  const [w, d] = m.rot === 90 || m.rot === 270 ? [c.d, c.w] : [c.w, c.d]
  return [m.x - w / 2, m.y - d / 2, m.x + w / 2, m.y + d / 2]
}
const inBox = (b: Box, r: Box, tol = 0.02) => b[0] >= r[0] - tol && b[1] >= r[1] - tol && b[2] <= r[2] + tol && b[3] <= r[3] + tol
const overlap = (a: Box, b: Box) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.02 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.02

/**
 * Muebles para recintos en el marco de una unidad (y = 0 es el muro de ventanas). Cada tipo de recinto tiene su
 * juego: la pieza principal primero; la que no cabe en su recinto (o quedaría sobre otra) se omite y se dice por qué.
 */
export function amueblar(rooms: PlanRecinto[], reglas: ReglasUnidad): { muebles: Mueble[]; avisos: string[] } {
  const muebles: Mueble[] = []
  const avisos: string[] = []
  let k = 0
  rooms.forEach((rm, ri) => {
    const R = bboxOf(rm.shape)
    const [x0, y0, x1, y1] = R
    const W = x1 - x0, D = y1 - y0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2
    const placed: Box[] = []
    const put = (kind: string, x: number, y: number, rot: Rot = 0, main = false): boolean => {
      const m: Mueble = { id: 'm' + ++k, kind, room: ri, x: r3(x), y: r3(y), rot }
      const b = huella(m)
      if (!inBox(b, R) || placed.some((p) => overlap(p, b))) {
        if (main) avisos.push(`No cabe ${CATALOGO[kind]?.name.toLowerCase() ?? kind} en ${rm.name} (${W.toFixed(1)} × ${D.toFixed(1)} m).`)
        return false
      }
      placed.push(b)
      muebles.push(m)
      return true
    }
    const c = (kind: string) => CATALOGO[kind]
    const p = reglas.paso
    switch (rm.kind) {
      case 'master': {
        const bed = 'cama-' + reglas.cama
        const B = c(bed)
        // cabecera en el muro interior, la cama hacia la ventana; burós a cada lado
        if (put(bed, xm, y1 - B.d / 2, 0, true)) {
          put('buro', xm - B.w / 2 - 0.25, y1 - 0.22)
          put('buro', xm + B.w / 2 + 0.25, y1 - 0.22)
          if (D < B.d + p) avisos.push(`${rm.name}: quedan ${(D - B.d).toFixed(2)} m al pie de la cama (la regla pide ${p} m).`)
        }
        if (reglas.closets && W - B.w >= 2 * (0.6 + p) - 0.6) put('closet', x0 + 0.3, ym, 90)
        break
      }
      case 'bed': {
        const B = c('cama-individual')
        if (!put('cama-individual', x0 + B.w / 2 + 0.05, y1 - B.d / 2, 0, true)) put('cama-individual', xm, ym, 90, true)
        if (reglas.closets && W >= B.w + p + 0.6) put('closet', x1 - 0.3, ym, 90)
        break
      }
      case 'living': {
        const S = c('sofa')
        if (W >= S.w + 0.2 && D >= S.d + 1.6) {
          put('sofa', xm, y1 - S.d / 2 - 0.05, 0, true)
          put('mesa-centro', xm, y1 - S.d - 0.55)
          put('tv', xm, y0 + 0.25)
        } else if (D >= S.w + 0.2) {
          put('sofa', x0 + S.d / 2 + 0.05, ym, 90, true)
          put('mesa-centro', x0 + S.d + 0.5, ym, 90)
          put('tv', x1 - 0.25, ym, 90)
        } else put('sillon', xm, ym, 0, true)
        put('sillon', x1 - 0.5, y1 - 0.5)
        break
      }
      case 'dining': {
        const t = reglas.comedor === 6 ? 'comedor-6' : 'comedor-4'
        const T = c(t)
        if (put(t, xm, ym, W >= D ? 0 : 90, true)) {
          const along = W >= D
          const L = T.w
          const sides = reglas.comedor === 6 ? [-0.6, 0, 0.6] : [-0.3, 0.3]
          for (const s of sides) {
            if (along) { put('silla', xm + s * (L / 1.2), ym - T.d / 2 - 0.28); put('silla', xm + s * (L / 1.2), ym + T.d / 2 + 0.28) }
            else { put('silla', xm - T.d / 2 - 0.28, ym + s * (L / 1.2)); put('silla', xm + T.d / 2 + 0.28, ym + s * (L / 1.2)) }
          }
        }
        break
      }
      case 'kitchen': {
        const K = c('cocina')
        // la cubierta en el muro interior más largo, el refrigerador al final
        if (W >= D) {
          const len = Math.min(K.w, W - 0.8)
          if (len >= 1.2 && put('cocina', x0 + len / 2 + 0.02, y1 - K.d / 2, 0, true)) put('refri', x0 + len + 0.42, y1 - 0.36)
          else avisos.push(`No cabe la cocineta en ${rm.name}.`)
        } else {
          const len = Math.min(K.w, D - 0.8)
          if (len >= 1.2 && put('cocina', x0 + K.d / 2, y1 - len / 2 - 0.02, 90, true)) put('refri', x0 + 0.36, y1 - len - 0.42, 90)
          else avisos.push(`No cabe la cocineta en ${rm.name}.`)
        }
        if (W - 0.6 >= p + 1.2 && D >= 1.6) put('comedor-4', x1 - 0.65, ym, 90)
        break
      }
      case 'bath': {
        put('regadera', x1 - 0.47, y1 - 0.47, 0, true)
        put('wc', x0 + 0.27, y1 - 0.37, 0, true)
        if (!put('lavabo', x0 + 0.85, y1 - 0.24)) put('lavabo', x0 + 0.3, y0 + 0.3, 90)
        break
      }
      case 'halfbath': {
        put('wc', x0 + 0.27, y1 - 0.37, 0, true)
        put('lavabo', x1 - 0.3, y1 - 0.24)
        break
      }
      case 'laundry': put('lavadora', x0 + 0.32, y1 - 0.32, 0, true); break
      case 'study': put('escritorio', xm, y0 + 0.32, 0, true); put('silla', xm, y0 + 0.9); break
      case 'storage': if (W >= D) put('estante', xm, y1 - 0.22); else put('estante', x0 + 0.22, ym, 90); break
      case 'terrace': put('mesa-terraza', xm, ym); put('silla', xm - 0.65, ym); put('silla', xm + 0.65, ym); break
      case 'hall': if (reglas.closets && Math.max(W, D) >= 2.2 && Math.min(W, D) >= 0.6 + 1.0) put('closet', W >= D ? xm : x0 + 0.3, W >= D ? y1 - 0.3 : ym, W >= D ? 0 : 90); break
    }
  })
  return { muebles, avisos }
}

// ---- el catálogo -----------------------------------------------------------------------------------------------

const rectRing = (w: number, d: number): Ring => [[0, 0], [w, 0], [w, d], [0, d]]
export const siguienteId = (cat: { id: string }[]) => { let k = cat.length + 1; const used = new Set(cat.map((c) => c.id)); while (used.has('C' + k)) k++; return 'C' + k }

/** Un plano que GFit acomoda para un tipo a w × d (su WFC de cuartos), amueblado por las reglas; `vacio`: un solo recinto. */
export function planNuevo(type: UnitType, w: number, d: number, cat: { id: string }[], vacio: boolean): PlanCatalogo {
  const ring = rectRing(r3(w), r3(d))
  // la fachada es la orilla de abajo: una franja de planta bajo ella
  const plate: Ring[] = [[[0, 0], [r3(w), 0], [r3(w), -1], [0, -1]]]
  const rooms: PlanRecinto[] = vacio ? [{ kind: 'living', name: 'Estar', shape: ring }] : recintos(ring, type, plate, type.id + w + 'x' + d)
  const reglas = REGLAS0
  const final = rooms.length ? rooms : [{ kind: 'living', name: 'Estar', shape: ring }]
  return {
    id: siguienteId(cat), name: type.name + ' ' + w.toFixed(1) + ' × ' + d.toFixed(1) + (vacio ? ' (a mano)' : ''), origen: vacio ? 'manual' : 'generada',
    typeId: type.id, w: r3(w), d: r3(d), rooms: final, muebles: amueblar(final, reglas).muebles, reglas,
  }
}

/** Qué tan bien queda un plano en una unidad de w × d (1 = mismo tamaño): 1 − la diferencia relativa media de ancho y fondo. */
export function coincidencia(p: { w: number; d: number }, w: number, d: number): number {
  if (!(w > 0 && d > 0)) return 0
  return Math.max(0, 1 - (Math.abs(p.w - w) / w + Math.abs(p.d - d) / d) / 2)
}

// ---- Biblioteca GFit (mixed-use-optimizer `ui/presets.ts`) --------------------------------------------------------

const VARIANTES = [
  { id: 'compacto', label: 'compacto', at: 0 },
  { id: 'estandar', label: 'estándar', at: 0.5 },
  { id: 'amplio', label: 'amplio', at: 1 },
]
let memo: { key: string; out: PlanCatalogo[] } | null = null

/** Cada tipo en su fachada más angosta, media y más ancha, al fondo dado, con los recintos que acomoda el motor. */
export function bibliotecaGFit(types: UnitType[] = TIPOS, depth = FONDO0): PlanCatalogo[] {
  const key = depth + '|' + types.map((t) => [t.id, t.name, t.wMin, t.wMax].join(',')).join(';')
  if (memo?.key === key) return memo.out
  const out: PlanCatalogo[] = []
  for (const t of types) {
    for (const v of VARIANTES) {
      const w0 = Math.round((t.wMin + (t.wMax - t.wMin) * v.at) * 10) / 10
      // si el WFC no llena ese ancho, se prueba 30 y 60 cm más (dentro del rango del tipo); si no, queda fuera
      for (const dw of [0, 0.3, 0.6]) {
        const w = Math.round((w0 + dw) * 10) / 10
        if (dw && w > t.wMax) break
        if (!recintos(rectRing(w, depth), t, [[[0, 0], [w, 0], [w, -1], [0, -1]]], t.id + w + 'x' + depth).length) continue
        const p = planNuevo(t, w, depth, out, false)
        out.push({ ...p, id: `G-${t.id}-${v.id}`, name: `${t.name} ${v.label}` })
        break
      }
    }
  }
  memo = { key, out }
  return out
}

/** Copia un plano a Mi biblioteca con un id nuevo. */
export function copiaDe(p: PlanCatalogo, cat: PlanCatalogo[], name = p.name): PlanCatalogo {
  return { ...structuredClone(p), id: siguienteId(cat), name, desde: p.id.startsWith('G-') ? p.id : p.desde }
}
