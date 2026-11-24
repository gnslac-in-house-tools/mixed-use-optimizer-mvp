// (app) Cajones accesibles (spec circulaciones §5.6), un paso sobre el resultado final de la masa: después de las
// zonas y de la red entre masas, para que solo se elijan cajones contados y el mínimo se pida una vez por masa. Se
// eligen los más cercanos a un núcleo del nivel (o, si no hay, a una entrada: rampa, llegada o acceso). Cada
// accesible usa el cajón vecino de la misma fila como franja; dos accesibles comparten franja: dos ocupan tres
// cajones normales.
import type { ParamsAccesibles, ParamsCajones, Punto } from '../../modelo/tipos'
import { distanciaAPoligono } from '../nucleos'
import type { ResultadoCajones } from './index'

/** Por omisión: 1 de cada 25, al menos 1, franja de 1.5 m (provisionales, §12). */
export const ACCESIBLES_POR_OMISION: ParamsAccesibles = { cada: 25, minimo: 1, franja: 1.5 }

/** Cuántos accesibles pide un número de cajones contados. */
export function accesiblesRequeridos(contados: number, a: ParamsAccesibles): number {
  if (contados <= 0) return 0
  const cada = a.cada > 0 ? a.cada : Infinity
  return Math.min(contados, Math.max(Math.max(0, Math.trunc(a.minimo)), Math.ceil(contados / cada)))
}

const llaveVertice = (q: Punto) => `${Math.round(q.x * 1000)},${Math.round(q.y * 1000)}`

/**
 * Los vecinos de cada cajón en su fila: los que comparten con él un lado largo completo (dos cajones espalda con
 * espalda comparten el lado corto y no cuentan; los de otra zona no comparten lados exactos).
 */
function vecinosEnFila(cajones: Punto[][]): number[][] {
  const porLado = new Map<string, number[]>()
  cajones.forEach((c, i) => {
    const largos = c.map((a, k) => {
      const b = c[(k + 1) % c.length]
      return Math.hypot(b.x - a.x, b.y - a.y)
    })
    const max = Math.max(...largos)
    c.forEach((a, k) => {
      if (largos[k] < max - 1e-6) return
      const llave = [llaveVertice(a), llaveVertice(c[(k + 1) % c.length])].sort().join('|')
      porLado.set(llave, [...(porLado.get(llave) ?? []), i])
    })
  })
  const out = cajones.map((): number[] => [])
  for (const ids of porLado.values())
    for (const i of ids) for (const j of ids) if (i !== j && !out[i].includes(j)) out[i].push(j)
  return out
}

const centroide = (q: Punto[]): Punto => ({
  x: q.reduce((s, p) => s + p.x, 0) / q.length,
  y: q.reduce((s, p) => s + p.y, 0) / q.length,
})

/**
 * Elige los accesibles y sus franjas entre los cajones (todos contados). `distancia(i)` es la del cajón i a lo
 * que sirve (núcleo o entrada). Devuelve los índices de los accesibles y de las franjas, y cuántos se pedían.
 */
export function elegirAccesibles(
  cajones: Punto[][],
  distancia: (i: number) => number,
  a: ParamsAccesibles,
): { accesibles: Set<number>; franjas: Set<number>; requeridos: number } {
  const accesibles = new Set<number>()
  const franjas = new Set<number>()
  const requeridos = accesiblesRequeridos(cajones.length, a)
  if (requeridos === 0) return { accesibles, franjas, requeridos }
  const vecinos = vecinosEnFila(cajones)
  const libre = (j: number) => !accesibles.has(j) && !franjas.has(j)
  const orden = cajones.map((_, i) => [i, distancia(i)] as const).sort((x, y) => x[1] - y[1] || x[0] - y[0])
  for (const [i] of orden) {
    if (accesibles.size >= requeridos) break
    if (!libre(i)) continue
    const f = vecinos[i].find(libre)
    if (f === undefined) continue
    accesibles.add(i)
    franjas.add(f)
    if (accesibles.size >= requeridos) break
    // el otro lado de la franja comparte la franja
    const otro = vecinos[f].find((j) => j !== i && libre(j))
    if (otro !== undefined) accesibles.add(otro)
  }
  return { accesibles, franjas, requeridos }
}

/**
 * El resultado con sus cajones accesibles: las franjas salen de `cajones` (y del conteo) y la red se reindexa.
 * Sin `params.accesibles`, el mismo resultado. Si no caben todos los que se piden, agrega un aviso.
 */
export function conAccesibles(r: ResultadoCajones, params: ParamsCajones, peatonales: Punto[][] = []): ResultadoCajones {
  const a = params.accesibles
  if (!a) return r
  const nucleos = peatonales.filter((q) => q.length >= 3)
  const objetivos =
    nucleos.length > 0
      ? nucleos
      : [...r.rampas, ...(r.llegadas ?? []).map((l) => l.boca), ...(r.accesosCalle ?? []).map((c) => c.fila)]
  const centros = r.cajones.map(centroide)
  const distancia = (i: number) =>
    objetivos.length === 0 ? 0 : Math.min(...objetivos.map((o) => distanciaAPoligono(centros[i], o)))
  const e = elegirAccesibles(r.cajones, distancia, a)
  const nuevo = r.cajones.map((): number => -1)
  const cajones: Punto[][] = []
  r.cajones.forEach((c, i) => {
    if (!e.franjas.has(i)) nuevo[i] = cajones.push(c) - 1
  })
  const pisos = Math.max(1, Math.trunc(params.pisos))
  const avisos = [...r.avisos]
  if (e.accesibles.size < e.requeridos)
    avisos.push(
      `Se piden ${e.requeridos} cajones accesibles y solo caben ${e.accesibles.size}: ` +
        'hace falta un cajón vecino en la misma fila para la franja.',
    )
  return {
    ...r,
    cajones,
    conteoPorPiso: cajones.length,
    conteo: cajones.length * pisos,
    avisos,
    red: r.red?.map((g) => ({ ...g, cajones: g.cajones.map((i) => nuevo[i]).filter((i) => i >= 0) })),
    // con zonas, cada franja se descuenta de la zona en que cae
    zonas: r.zonas?.map((z) => ({
      ...z,
      conteo: z.conteo - [...e.franjas].filter((i) => distanciaAPoligono(centros[i], z.region[0]) === 0).length,
    })),
    accesibles: r.cajones.filter((_, i) => e.accesibles.has(i)),
    franjas: r.cajones.filter((_, i) => e.franjas.has(i)),
  }
}
