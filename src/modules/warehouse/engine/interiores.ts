// mixed-use-mvp: el interior de una nave para Programs y Furniture (views/show/interiors.ts). Programs: la franja de
// maniobras frente a cada muro con andenes y el almacenaje en el resto. Furniture: racks selectivos dobles en el
// almacenaje, perpendiculares al muro de andenes (sus pasillos llevan a los andenes); sin andenes, con el eje de la
// retícula. Medidas típicas de un centro de distribución, no norma.
import type { Point, Polygon } from '../../../model/schema.ts'
import { difference, inset, intersection, type Region } from '../../../engine/geom/boolean.ts'
import { area } from '../../../engine/geom/polygon.ts'

/** m: fondo de la franja de maniobras frente a los andenes (montacargas, consolidación de tarimas) */
export const MANIOBRAS = 15
/** m: fondo de un rack doble (dos tarimas espalda con espalda) */
export const RACK = 2.4
/** m: pasillo entre racks (montacargas contrapesado angosto) */
export const PASILLO_RACKS = 3
/** m: lo que los racks se separan de los muros y de la franja de maniobras */
const RETIRO = 1
/** m: el rack más corto que vale la pena */
const RACK_MIN = 2.7

export interface InteriorNave {
  maniobras: Region[]
  almacen: Region[]
  racks: Polygon[]
}

/** Un andén: su muro (a → b) y la normal hacia afuera de la nave. */
export type Anden = { a: Point; b: Point; out: Point }

/** El rectángulo de origen `o`, a lo largo de `u` de s0 a s1 y de `v` de t0 a t1. */
function rect(o: Point, u: Point, v: Point, s0: number, s1: number, t0: number, t1: number): Polygon {
  const p = (s: number, t: number): Point => ({ x: o.x + u.x * s + v.x * t, y: o.y + u.y * s + v.y * t })
  return [p(s0, t0), p(s1, t0), p(s1, t1), p(s0, t1)]
}

/**
 * El interior de la nave `poligono`: maniobras frente a `andenes`, almacenaje y racks. `angulo` (grados) es el eje de
 * la retícula, que siguen los racks cuando no hay andenes.
 */
export function interioresNave(poligono: Polygon, andenes: Anden[], angulo: number): InteriorNave {
  // la planta se redibuja con cada cambio del proyecto; la nave, casi nunca
  const llave = JSON.stringify([poligono, andenes.map(({ a, b, out }) => [a, b, out]), angulo])
  const visto = memo.get(llave)
  if (visto) return visto
  const r = calcular(poligono, andenes, angulo)
  if (memo.size >= 64) memo.delete(memo.keys().next().value!)
  memo.set(llave, r)
  return r
}
const memo = new Map<string, InteriorNave>()

function calcular(poligono: Polygon, andenes: Anden[], angulo: number): InteriorNave {
  if (poligono.length < 3) return { maniobras: [], almacen: [], racks: [] }
  const franjas = andenes.map(({ a, b, out }) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    const adentro = { x: -out.x, y: -out.y }
    return rect(a, u, adentro, 0, l, 0, MANIOBRAS)
  })
  const maniobras = franjas.length ? intersection([poligono], franjas) : []
  const almacen = franjas.length ? difference([poligono], franjas) : [[poligono]]

  // los racks corren perpendiculares al primer muro de andenes; sin andenes, a lo largo del eje de la retícula
  let u: Point
  if (andenes.length) u = { x: -andenes[0].out.x, y: -andenes[0].out.y }
  else { const r = (angulo * Math.PI) / 180; u = { x: Math.cos(r), y: Math.sin(r) } }
  const v = { x: -u.y, y: u.x }
  const libre = inset(almacen.flat(), RETIRO)
  const pts = libre.flat(2)
  if (!pts.length) return { maniobras, almacen, racks: [] }
  const s = pts.map((q) => q.x * u.x + q.y * u.y), t = pts.map((q) => q.x * v.x + q.y * v.y)
  const [s0, s1, t0, t1] = [Math.min(...s) - 1, Math.max(...s) + 1, Math.min(...t), Math.max(...t)]
  const o = { x: 0, y: 0 }
  const racks: Polygon[] = []
  for (let tt = t0; tt + RACK <= t1 + 1e-6; tt += RACK + PASILLO_RACKS) {
    for (const reg of intersection(libre.flat(), [rect(o, u, v, s0, s1, tt, tt + RACK)])) {
      const k = reg[0]
      if (k && area(k) >= RACK * RACK_MIN) racks.push(k)
    }
  }
  return { maniobras, almacen, racks }
}
