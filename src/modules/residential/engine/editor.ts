// El editor de departamentos (pieza 3, primera vuelta): operaciones puras sobre un plano del catálogo. Los muros
// interiores son ejes (una x o una y constante que comparten los recintos); moverlos estira los recintos de los dos
// lados. Cada tramo entre ejes (y las orillas de la unidad) es una cota, fija o movible: una fija viaja entera con su
// muro. Puertas en los muros interiores, ventanas en la fachada, el uso de cada recinto y el grafo de adyacencias.
import { amueblar, nombreRecinto, type PlanCatalogo, type Puerta, type Ring } from './catalogo.ts'

export type Eje = 'x' | 'y'
/** m: lo menos que mide un tramo entre dos muros */
export const MIN_TRAMO = 0.9
const EPS = 1e-3
const r3 = (n: number) => Math.round(n * 1000) / 1000
const coord = (q: [number, number], e: Eje) => (e === 'x' ? q[0] : q[1])
const largo = (p: PlanCatalogo, e: Eje) => (e === 'x' ? p.w : p.d)

/** Las coordenadas de los muros interiores por eje, de menor a mayor. */
export function ejes(p: PlanCatalogo): { x: number[]; y: number[] } {
  const de = (e: Eje) => {
    const L = largo(p, e)
    const s = new Set<number>()
    for (const r of p.rooms) for (const q of r.shape) { const c = coord(q as [number, number], e); if (c > EPS && c < L - EPS) s.add(r3(c)) }
    return [...s].sort((a, b) => a - b)
  }
  return { x: de('x'), y: de('y') }
}

const lineas = (p: PlanCatalogo, e: Eje) => [0, ...ejes(p)[e], largo(p, e)]

export interface Cota { de: number; a: number; largo: number; fija: boolean }
/** Las cotas encadenadas de cada eje: de orilla a orilla pasando por cada muro. */
export function cotas(p: PlanCatalogo): { x: Cota[]; y: Cota[] } {
  const de = (e: Eje) => {
    const L = lineas(p, e)
    const f = new Set(p.fijas?.[e] ?? [])
    return L.slice(1).map((a, i) => ({ de: L[i], a, largo: r3(a - L[i]), fija: f.has(i) }))
  }
  return { x: de('x'), y: de('y') }
}

/** Marca o libera el tramo i de un eje. */
export function alternarFija(p: PlanCatalogo, e: Eje, i: number): PlanCatalogo {
  const f = { x: [...(p.fijas?.x ?? [])], y: [...(p.fijas?.y ?? [])] }
  f[e] = f[e].includes(i) ? f[e].filter((k) => k !== i) : [...f[e], i].sort((a, b) => a - b)
  return { ...p, fijas: f }
}

const reamueblar = (p: PlanCatalogo): PlanCatalogo => ({ ...p, muebles: amueblar(p.rooms, p.reglas).muebles })

/** Mueve el muro del eje `e` que está en `de` hacia `a`. Los tramos fijos a sus lados viajan con él; los movibles de
 *  las puntas del grupo no bajan de MIN_TRAMO; un grupo que toca la orilla de la unidad no se mueve. */
export function moverEje(p: PlanCatalogo, e: Eje, de: number, a: number): PlanCatalogo {
  // un muro sobre un quiebre del contorno (la L) es parte de la huella: no se mueve desde adentro
  if (p.contorno?.some((q) => Math.abs(coord(q as [number, number], e) - de) < EPS)) return p
  const L = lineas(p, e)
  const k = L.findIndex((c) => Math.abs(c - de) < EPS)
  if (k <= 0 || k >= L.length - 1) return p
  const f = new Set(p.fijas?.[e] ?? [])
  let i0 = k, i1 = k
  while (i0 > 0 && f.has(i0 - 1)) i0--
  while (i1 < L.length - 1 && f.has(i1)) i1++
  if (i0 === 0 || i1 === L.length - 1) return p
  let d = a - de
  d = Math.max(d, MIN_TRAMO - (L[i0] - L[i0 - 1]))
  d = Math.min(d, L[i1 + 1] - L[i1] - MIN_TRAMO)
  if (Math.abs(d) < EPS) return p
  const grupo = L.slice(i0, i1 + 1)
  const mueve = (c: number) => (grupo.some((g) => Math.abs(g - c) < EPS) ? r3(c + d) : c)
  const rooms = p.rooms.map((r) => ({ ...r, shape: r.shape.map(([x, y]) => (e === 'x' ? [mueve(x), y] : [x, mueve(y)]) as [number, number]) as Ring }))
  const puertas = (p.puertas ?? []).map((q) => (q.eje === e ? (e === 'x' ? { ...q, x: mueve(q.x) } : { ...q, y: mueve(q.y) }) : q))
  return reamueblar({ ...p, rooms, ...(p.puertas ? { puertas } : {}) })
}

/** Pone una puerta de 0.9 m en el muro interior más cercano (a menos de 0.3 m del punto); si no hay, el plano sigue igual. */
export function agregarPuerta(p: PlanCatalogo, pt: { x: number; y: number }, ancho = 0.9): PlanCatalogo {
  const e = ejes(p)
  let mejor: { eje: Eje; c: number; dist: number } | null = null
  for (const eje of ['x', 'y'] as Eje[]) for (const c of e[eje]) {
    const dist = Math.abs((eje === 'x' ? pt.x : pt.y) - c)
    if (dist < 0.3 && (!mejor || dist < mejor.dist)) mejor = { eje, c, dist }
  }
  if (!mejor) return p
  const puerta: Puerta = { eje: mejor.eje, x: mejor.eje === 'x' ? mejor.c : r3(pt.x), y: mejor.eje === 'y' ? mejor.c : r3(pt.y), ancho }
  return { ...p, puertas: [...(p.puertas ?? []), puerta] }
}

export const quitarPuerta = (p: PlanCatalogo, i: number): PlanCatalogo => ({ ...p, puertas: (p.puertas ?? []).filter((_, k) => k !== i) })

/** Una ventana en la fachada (y = 0), centrada en x y dentro de la unidad. */
export function agregarVentana(p: PlanCatalogo, x: number, ancho = 1.5): PlanCatalogo {
  const c = r3(Math.max(ancho / 2, Math.min(p.w - ancho / 2, x)))
  return { ...p, ventanas: [...(p.ventanas ?? []), { x: c, ancho }] }
}
export const quitarVentana = (p: PlanCatalogo, i: number): PlanCatalogo => ({ ...p, ventanas: (p.ventanas ?? []).filter((_, k) => k !== i) })

/** Los usos que un recinto puede tomar en el editor, con su nombre. */
export const USOS_RECINTO: { kind: string; name: string }[] = [
  { kind: 'living', name: 'Estar' }, { kind: 'dining', name: 'Comedor' }, { kind: 'kitchen', name: 'Cocina' },
  { kind: 'master', name: 'Dormitorio principal' }, { kind: 'bed', name: 'Dormitorio' }, { kind: 'bath', name: 'Baño' },
  { kind: 'halfbath', name: 'Medio baño' }, { kind: 'study', name: 'Estudio' }, { kind: 'laundry', name: 'Lavandería' },
  { kind: 'storage', name: 'Bodega' }, { kind: 'hall', name: 'Pasillo' }, { kind: 'terrace', name: 'Terraza' },
]

export function cambiarRecinto(p: PlanCatalogo, k: number, kind: string): PlanCatalogo {
  const name = USOS_RECINTO.find((u) => u.kind === kind)?.name ?? nombreRecinto(kind, kind)
  return reamueblar({ ...p, rooms: p.rooms.map((r, i) => (i === k ? { ...r, kind, name } : r)) })
}

// ---- el grafo de adyacencias -------------------------------------------------------------------------------------

type Tramo = { eje: Eje; c: number; a: number; b: number }
function tramos(r: Ring): Tramo[] {
  const out: Tramo[] = []
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length]
    if (Math.abs(p[0] - q[0]) < EPS) out.push({ eje: 'x', c: p[0], a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) })
    else if (Math.abs(p[1] - q[1]) < EPS) out.push({ eje: 'y', c: p[1], a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) })
  }
  return out
}

/** Los recintos (su centro) y qué pares comparten muro (más de 0.3 m); `puerta` si una puerta está en ese muro. */
export function grafo(p: PlanCatalogo): { nodos: { x: number; y: number; nombre: string }[]; aristas: { a: number; b: number; puerta: boolean }[] } {
  const nodos = p.rooms.map((r) => {
    const xs = r.shape.map((q) => q[0]), ys = r.shape.map((q) => q[1])
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, nombre: r.name }
  })
  const T = p.rooms.map((r) => tramos(r.shape))
  const aristas: { a: number; b: number; puerta: boolean }[] = []
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    let comparte = false, puerta = false
    for (const s of T[i]) for (const t of T[j]) {
      if (s.eje !== t.eje || Math.abs(s.c - t.c) > EPS) continue
      const a = Math.max(s.a, t.a), b = Math.min(s.b, t.b)
      if (b - a <= 0.3) continue
      comparte = true
      for (const q of p.puertas ?? []) {
        if (q.eje !== s.eje) continue
        const sobre = s.eje === 'x' ? Math.abs(q.x - s.c) < EPS && q.y > a && q.y < b : Math.abs(q.y - s.c) < EPS && q.x > a && q.x < b
        if (sobre) puerta = true
      }
    }
    if (comparte) aristas.push({ a: i, b: j, puerta })
  }
  return { nodos, aristas }
}

/** Los muros interiores que se pueden arrastrar: los de `ejes` que no caen sobre un quiebre del contorno. */
export function ejesMovibles(p: PlanCatalogo): { x: number[]; y: number[] } {
  const e = ejes(p)
  const libre = (k: Eje) => e[k].filter((c) => !p.contorno?.some((q) => Math.abs(coord(q as [number, number], k) - c) < EPS))
  return { x: libre('x'), y: libre('y') }
}

/** Mueve un mueble a (x, y) del marco de la unidad. */
export function moverMueble(p: PlanCatalogo, id: string, x: number, y: number): PlanCatalogo {
  return { ...p, muebles: p.muebles.map((m) => (m.id === id ? { ...m, x: r3(x), y: r3(y) } : m)) }
}

/** Gira un mueble 90° a la izquierda. */
export function girarMueble(p: PlanCatalogo, id: string): PlanCatalogo {
  return { ...p, muebles: p.muebles.map((m) => (m.id === id ? { ...m, rot: ((m.rot + 90) % 360) as typeof m.rot } : m)) }
}
