// (app) Las entradas del circuito de estacionamiento (spec interacción §16.4): rampas propias, rampas que llegan de
// otro nivel y accesos desde la calle. Cada una ocupa su lugar en la crujía (quita solo los cajones que pisa) y, si su
// boca no da al pasillo del circuito, una liga la lleva hasta él. Aquí también se arma la red del circuito: qué
// pasillos se tocan, a qué entradas llegan y qué cajones dan a cada pasillo.
import type { Punto } from '../../modelo/tipos'
import { distanciaPuntoSegmento, caja, puntoEnPoligono, puntoEnRegion } from '../geom/poligono'
import type { ComponenteRed } from './index'

/** Una entrada del circuito: su llave de red (`r{k}`, `l{j}`, `c{j}`) y la boca por donde se llega a los pasillos. */
export interface EntradaCircuito {
  llave: string
  boca: Punto[]
}

type Caja = ReturnType<typeof caja>

const resta = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y })
const mas = (a: Punto, v: Punto, t: number): Punto => ({ x: a.x + v.x * t, y: a.y + v.y * t })
const centro = (q: Punto[]): Punto => ({
  x: q.reduce((s, p) => s + p.x, 0) / q.length,
  y: q.reduce((s, p) => s + p.y, 0) / q.length,
})
const cajaCon = (c: Caja, tol: number): Caja => ({
  minX: c.minX - tol,
  minY: c.minY - tol,
  maxX: c.maxX + tol,
  maxY: c.maxY + tol,
})
const seCruzanCajas = (a: Caja, b: Caja) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY

/** Paso del barrido de una liga y lo que se pasa del pasillo para que de verdad lo pise (m). */
const PASO_LIGA = 0.25
const ENTRA_LIGA = 0.2
/** Separación con que se busca el pasillo junto a un lado de un cajón (m). */
const SONDA = 0.15
/**
 * La rendija que se cruza entre dos pasillos (m): la retícula de en medio deja unos centímetros antes del anillo, y
 * por ahí se pasa. Es mucho menos que un cajón, así que nunca se brinca una fila.
 */
const RENDIJA = 0.6

/** ¿Se cruzan (propiamente) los segmentos ab y cd? */
function seCruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const o = (p: Punto, q: Punto, r: Punto) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/**
 * ¿Se puede pasar de P a Q? Se enciman, se cruzan o comparten un tramo de lado, aunque haya una rendija (no basta una
 * esquina). Las piezas de pasillo que solo se tocan por un punto no se conectan: por un punto no pasa un auto.
 */
export function seTocan(P: Punto[], Q: Punto[], cp: Caja = caja(P), cq: Caja = caja(Q)): boolean {
  if (!seCruzanCajas(cajaCon(cp, RENDIJA), cq)) return false
  const cP = centro(P)
  const cQ = centro(Q)
  // un vértice de uno dentro del otro (un poco hacia su centro, para no depender de la orilla)
  const hacia = (v: Punto, c: Punto) => mas(v, resta(c, v), 0.01)
  if (P.some((v) => puntoEnPoligono(hacia(v, cP), Q)) || Q.some((v) => puntoEnPoligono(hacia(v, cQ), P))) return true
  for (let i = 0; i < P.length; i++)
    for (let j = 0; j < Q.length; j++)
      if (seCruzan(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length])) return true
  // un lado compartido (o a menos de una rendija): puntos a lo largo del lado, un poco hacia cada lado, que caen en uno
  // y en el otro
  const porLados = (A: Punto[], B: Punto[]) => {
    for (let i = 0; i < A.length; i++) {
      const a = A[i]
      const b = A[(i + 1) % A.length]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (l < 0.5) continue
      const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
      for (const f of [0.25, 0.5, 0.75]) {
        const m = mas(a, resta(b, a), f)
        for (const s of [SONDA, -SONDA, RENDIJA, -RENDIJA]) {
          const q = mas(m, n, s)
          if (puntoEnPoligono(q, B) && !puntoEnPoligono(q, A)) return true
        }
      }
    }
    return false
  }
  return porLados(P, Q) || porLados(Q, P)
}

/** La envolvente convexa (antihoraria) de unos puntos. */
function envolvente(pts: Punto[]): Punto[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const abajo: Punto[] = []
  for (const q of p) {
    while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], q) <= 0) abajo.pop()
    abajo.push(q)
  }
  const arriba: Punto[] = []
  for (const q of [...p].reverse()) {
    while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], q) <= 0) arriba.pop()
    arriba.push(q)
  }
  return [...abajo.slice(0, -1), ...arriba.slice(0, -1)]
}

/** La normal hacia adentro de la región en la orilla más cercana a `q`. */
function normalAdentro(region: Punto[][], q: Punto): Punto | null {
  let mejor: { d: number; a: Punto; b: Punto } | null = null
  for (const anillo of region)
    for (let i = 0; i < anillo.length; i++) {
      const a = anillo[i]
      const b = anillo[(i + 1) % anillo.length]
      const d = distanciaPuntoSegmento(q, a, b)
      if (!mejor || d < mejor.d) mejor = { d, a, b }
    }
  if (!mejor) return null
  const { a, b } = mejor
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  if (l === 0) return null
  const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
  const m = mas(a, resta(b, a), 0.5)
  return puntoEnRegion(mas(m, n, 0.05), region) ? n : { x: -n.x, y: -n.y }
}

/**
 * La liga de una boca con el pasillo: la boca barrida hacia adentro de la masa (a escuadra con la orilla más cercana)
 * hasta que pisa un pasillo. null si la boca ya da al pasillo o si no hay pasillo a menos de `alcance` m.
 */
export function ligaDeBoca(boca: Punto[], region: Punto[][], pasillos: Punto[][], alcance: number): Punto[] | null | 'lejos' {
  const n = normalAdentro(region, centro(boca))
  if (!n) return 'lejos'
  // null: ya toca (no hace falta liga); undefined: no alcanza ningún pasillo (revisión del PR #53)
  const b = barrer(boca, n, pasillos, alcance)
  return b === undefined ? 'lejos' : b
}

/**
 * La pieza `pieza` barrida en la dirección `n` hasta que toca alguno de los `destinos`: la envolvente de lo barrido
 * (un poco más, para que pise). null si ya los toca; undefined si no los alcanza en `alcance` m.
 */
export function barrer(pieza: Punto[], n: Punto, destinos: Punto[][], alcance: number): Punto[] | null | undefined {
  const cajas = destinos.map((q) => caja(q))
  const pisa = (s: number) => {
    const b = pieza.map((v) => mas(v, n, s))
    const cb = caja(b)
    return destinos.some((q, i) => seTocan(b, q, cb, cajas[i]))
  }
  if (pisa(0)) return null
  for (let s = PASO_LIGA; s <= alcance + 1e-9; s += PASO_LIGA)
    if (pisa(s)) return envolvente([...pieza, ...pieza.map((v) => mas(v, n, s + ENTRA_LIGA))])
  return undefined
}

/** El grupo (raíz) de cada pieza de pasillo: las que se tocan, aunque sea por otras, quedan en el mismo. */
export function gruposDePasillos(pasillos: Punto[][], cajas: Caja[] = pasillos.map((q) => caja(q))): number[] {
  const padre = pasillos.map((_, i) => i)
  const raiz = (i: number): number => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]]
      i = padre[i]
    }
    return i
  }
  for (let i = 0; i < pasillos.length; i++)
    for (let j = i + 1; j < pasillos.length; j++)
      if (raiz(i) !== raiz(j) && seTocan(pasillos[i], pasillos[j], cajas[i], cajas[j])) padre[raiz(i)] = raiz(j)
  return pasillos.map((_, i) => raiz(i))
}

/**
 * La red del circuito: las piezas de pasillo que se tocan forman grupos; un grupo llega a las entradas cuyas bocas
 * toca, y un cajón pertenece al grupo del pasillo al que da (por alguno de sus lados). Regresa, por cajón, las
 * llaves de las entradas a las que llega (vacío si ninguna).
 */
export function redDelCircuito(pasillos: Punto[][], entradas: EntradaCircuito[], cajones: Punto[][]): string[][] {
  const cajas = pasillos.map((q) => caja(q))
  const grupo = gruposDePasillos(pasillos, cajas)
  const raiz = (i: number) => grupo[i]
  const llaves = new Map<number, Set<string>>()
  for (const e of entradas) {
    const ce = caja(e.boca)
    pasillos.forEach((q, i) => {
      if (!seTocan(e.boca, q, ce, cajas[i])) return
      const r = raiz(i)
      const s = llaves.get(r) ?? new Set<string>()
      s.add(e.llave)
      llaves.set(r, s)
    })
  }
  return cajones.map((c) => {
    const cc = centro(c)
    const fuera = c.map((a, i) => {
      const m = mas(a, resta(c[(i + 1) % c.length], a), 0.5)
      const d = resta(m, cc)
      const l = Math.hypot(d.x, d.y) || 1
      return mas(m, d, SONDA / l)
    })
    const out = new Set<string>()
    for (const q of fuera)
      pasillos.forEach((p, i) => {
        const k = cajas[i]
        if (q.x < k.minX || q.x > k.maxX || q.y < k.minY || q.y > k.maxY || !puntoEnPoligono(q, p)) return
        for (const ll of llaves.get(raiz(i)) ?? []) out.add(ll)
      })
    return [...out].sort()
  })
}

/** Los grupos de la red por las entradas a las que llegan, con índices en `cajones` y `sinAcceso`. */
export function gruposDeRed(entradasPorCajon: string[][], contado: boolean[]): ComponenteRed[] {
  const grupos = new Map<string, ComponenteRed>()
  let nC = 0
  let nS = 0
  entradasPorCajon.forEach((entradas, i) => {
    const firma = entradas.join(' ')
    const g = grupos.get(firma) ?? { entradas, cajones: [], sinAcceso: [] }
    if (contado[i]) g.cajones.push(nC++)
    else g.sinAcceso.push(nS++)
    grupos.set(firma, g)
  })
  return [...grupos.values()]
}
