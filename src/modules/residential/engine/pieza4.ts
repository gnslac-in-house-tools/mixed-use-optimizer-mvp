// Pieza 4, primera vuelta: el plano que se editó en Mi biblioteca toma el lugar del interior que GFit acomoda en cada
// departamento de su tipo. El plano se estira al ancho y fondo del departamento: las cotas fijas conservan su medida
// y las movibles se reparten la diferencia (en proporción a su largo); si lo fijo no cabe, todo escala parejo. Luego
// se lleva al marco del departamento en la planta: x a lo largo de la fachada, y de la fachada hacia su entrada. Puro.
import { amueblar, coincidencia, REGLAS0, type PlanCatalogo, type Ring } from './catalogo.ts'
import { ejes, type Eje } from './editor.ts'
import { signedArea, type Pt, type Shape } from './gfit/src/model/geom.ts'
import type { PlacedUnit } from './gfit/src/layout/level.ts'

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Las líneas nuevas de un eje (orillas y muros) para que la unidad mida `T`. */
function lineasNuevas(L: number[], fijas: Set<number>, T: number): number[] {
  const segs = L.slice(1).map((a, i) => a - L[i])
  const fijo = segs.reduce((s, x, i) => s + (fijas.has(i) ? x : 0), 0)
  const movible = segs.reduce((s, x, i) => s + (fijas.has(i) ? 0 : x), 0)
  const f = movible > 1e-9 && T - fijo > 1e-9 ? (T - fijo) / movible : null
  const total = L[L.length - 1]
  const nuevos = segs.map((x, i) => (f === null ? (x * T) / total : fijas.has(i) ? x : x * f))
  const out = [0]
  for (const x of nuevos) out.push(out[out.length - 1] + x)
  out[out.length - 1] = T
  return out
}

/** La coordenada c de un eje, de las líneas viejas a las nuevas (lineal por tramo). */
function mapa(L: number[], N: number[]): (c: number) => number {
  return (c) => {
    for (let i = 1; i < L.length; i++) {
      if (c <= L[i] + 1e-9 || i === L.length - 1) {
        const t = L[i] - L[i - 1] > 1e-9 ? (c - L[i - 1]) / (L[i] - L[i - 1]) : 0
        return r3(N[i - 1] + t * (N[i] - N[i - 1]))
      }
    }
    return c
  }
}

/** El plano a w × d, respetando sus cotas fijas; puertas y ventanas van con sus muros; se vuelve a amueblar. */
export function estirar(p: PlanCatalogo, w: number, d: number): PlanCatalogo {
  const e = ejes(p)
  const m = {} as Record<Eje, (c: number) => number>
  for (const [eje, T, W] of [['x', w, p.w], ['y', d, p.d]] as [Eje, number, number][]) {
    const L = [0, ...e[eje], W]
    m[eje] = mapa(L, lineasNuevas(L, new Set(p.fijas?.[eje] ?? []), T))
  }
  const rooms = p.rooms.map((q) => ({ ...q, shape: q.shape.map(([x, y]) => [m.x(x), m.y(y)] as [number, number]) as Ring }))
  return {
    ...p, w: r3(w), d: r3(d), rooms,
    ...(p.puertas ? { puertas: p.puertas.map((q) => ({ ...q, x: m.x(q.x), y: m.y(q.y) })) } : {}),
    ...(p.ventanas ? { ventanas: p.ventanas.map((v) => ({ ...v, x: m.x(v.x) })) } : {}),
    ...(p.contorno ? { contorno: p.contorno.map(([x, y]) => [m.x(x), m.y(y)] as [number, number]) } : {}),
    muebles: amueblar(rooms, p.reglas).muebles,
  }
}

/** El marco de un departamento en la planta: su fachada (el lado opuesto a la entrada) de `o` hacia `u`, y `v` hacia
 *  la entrada; `w` el largo de la fachada y `d` el fondo hasta la entrada. null si no tiene contorno. */
export function marcoDeUnidad(u: PlacedUnit): { o: Pt; u: Pt; v: Pt; w: number; d: number } | null {
  const ring = [...u.shape].filter((x) => x.length >= 3 && signedArea(x) > 0).sort((a, b) => signedArea(b) - signedArea(a))[0]
  if (!ring) return null
  const e = u.entry
  let mejor: { a: Pt; b: Pt; dist: number } | null = null
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const dist = Math.hypot(mid[0] - e[0], mid[1] - e[1])
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1 && (!mejor || dist > mejor.dist)) mejor = { a, b, dist }
  }
  if (!mejor) return null
  let { a, b } = mejor
  // un marco derecho (u × v > 0): así el 3D no sale reflejado; la fachada se recorre en el sentido que lo da
  const izq = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0])
  if (izq < 0) [a, b] = [b, a]
  const w = Math.hypot(b[0] - a[0], b[1] - a[1])
  const uu: Pt = [(b[0] - a[0]) / w, (b[1] - a[1]) / w]
  const v: Pt = [-uu[1], uu[0]]
  const d = (e[0] - a[0]) * v[0] + (e[1] - a[1]) * v[1]
  return { o: a, u: uu, v, w, d }
}

export type Marco = NonNullable<ReturnType<typeof marcoDeUnidad>>
export const aMundo = (m: Marco, x: number, y: number): Pt => [m.o[0] + m.u[0] * x + m.v[0] * y, m.o[1] + m.u[1] * x + m.v[1] * y]

/** El interior de un departamento con el plano de Mi biblioteca de su tipo que mejor le queda, estirado y en la planta;
 *  null si Mi biblioteca no tiene plano de su tipo. */
export function interiorUnidad(u: PlacedUnit, catalogo: PlanCatalogo[]): { plan: PlanCatalogo; marco: Marco; recintos: { kind: string; name: string; shape: Shape }[] } | null {
  const cand = catalogo.filter((p) => p.typeId === u.type)
  if (!cand.length) return null
  const marco = marcoDeUnidad(u)
  if (!marco || marco.d < 1) return null
  const base = cand.reduce((a, b) => (coincidencia(b, marco.w, marco.d) > coincidencia(a, marco.w, marco.d) ? b : a))
  const plan = estirar(base, marco.w, marco.d)
  const recintos = plan.rooms.map((q) => {
    const ring = q.shape.map(([x, y]) => aMundo(marco, x, y))
    return { kind: q.kind, name: q.name, shape: [signedArea(ring) < 0 ? ring.reverse() : ring] as Shape }
  })
  return { plan, marco, recintos }
}

/** El interior que GFit acomoda en el departamento, llevado a su marco y amueblado por las reglas de inicio; null si no
 *  tiene recintos. */
export function interiorGFit(u: PlacedUnit): { plan: PlanCatalogo; marco: Marco; recintos: { kind: string; name: string; shape: Shape }[] } | null {
  const marco = marcoDeUnidad(u)
  if (!marco || !u.rooms.length) return null
  const local = (p: Pt): [number, number] => {
    const dx = p[0] - marco.o[0], dy = p[1] - marco.o[1]
    return [r3(dx * marco.u[0] + dy * marco.u[1]), r3(dx * marco.v[0] + dy * marco.v[1])]
  }
  const rooms = u.rooms.map((q) => {
    const ring = [...q.shape].filter((x) => x.length >= 3).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0] ?? []
    return { kind: q.kind, name: q.name, shape: ring.map(local) as Ring }
  })
  const plan: PlanCatalogo = { id: 'gfit-' + u.id, name: u.type, origen: 'generada', typeId: u.type, w: r3(marco.w), d: r3(marco.d), rooms, muebles: amueblar(rooms, REGLAS0).muebles, reglas: REGLAS0 }
  return { plan, marco, recintos: u.rooms.map((q) => ({ kind: q.kind, name: q.name, shape: q.shape })) }
}

/** El interior de un departamento: el de Mi biblioteca si hay uno de su tipo, si no el de GFit; con su fuente. */
export function interiorDe(u: PlacedUnit, catalogo: PlanCatalogo[]): (NonNullable<ReturnType<typeof interiorGFit>> & { fuente: 'mi-biblioteca' | 'gfit' }) | null {
  const mio = interiorUnidad(u, catalogo)
  if (mio) return { ...mio, fuente: 'mi-biblioteca' }
  const g = interiorGFit(u)
  return g ? { ...g, fuente: 'gfit' } : null
}
