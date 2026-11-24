// Ejes estructurales del proyecto (spec circulaciones §5.3): sus líneas con número y letra, las columnas en sus
// cruces y cómo caen las filas de cajones entre ellas. Los ejes numerados (1, 2, 3…) van a escuadra con `angulo`,
// uno cada `ex` desde el origen; los de letra (A, B, C…) van en la dirección de `angulo`, uno cada `ey`.
import type { EjesEstructurales, Punto } from '../../modelo/tipos.ts'
import { areaRegiones, interseccion } from '../geom/booleanos.ts'
import { puntoEnPoligono } from '../geom/poligono.ts'

/**
 * Medidas por omisión de unos ejes nuevos: 8.1 m a lo largo de las filas (3 cajones de 2.5 m y una columna de
 * 0.6 m) y 16 m a escuadra (dos filas de 5 m y su pasillo de 6 m).
 */
export const EJES_POR_OMISION = { angulo: 0, ex: 8.1, ey: 16, columna: [0.6, 0.6] as [number, number] }

/** Tolerancia (grados) para considerar que las filas de cajones corren con los ejes. */
const TOL_ANGULO = 0.5

/** Letra de un eje: A…Z, AA, AB… */
export function letraDeEje(j: number): string {
  let s = ''
  let k = j
  do {
    s = String.fromCharCode(65 + (k % 26)) + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

interface Direcciones {
  u: Punto
  v: Punto
}

function direcciones(angulo: number): Direcciones {
  const a = (angulo * Math.PI) / 180
  return { u: { x: Math.cos(a), y: Math.sin(a) }, v: { x: -Math.sin(a), y: Math.cos(a) } }
}

/** El punto a `s` m en la dirección de los ejes con letra y `t` m a escuadra, desde el origen. */
export function puntoDeEjes(e: EjesEstructurales, s: number, t: number): Punto {
  const { u, v } = direcciones(e.angulo)
  return { x: e.origen.x + u.x * s + v.x * t, y: e.origen.y + u.y * s + v.y * t }
}

/** Las coordenadas (s, t) de un punto en el marco de los ejes. */
function enEjes(e: EjesEstructurales, q: Punto): [number, number] {
  const { u, v } = direcciones(e.angulo)
  const dx = q.x - e.origen.x
  const dy = q.y - e.origen.y
  return [dx * u.x + dy * u.y, dx * v.x + dy * v.y]
}

export interface LineaDeEje {
  etiqueta: string
  a: Punto
  b: Punto
}

/** Las líneas de los ejes para dibujarlas, `sobra` m más allá del primero y del último del otro sentido. */
export function lineasDeEjes(e: EjesEstructurales, sobra = 3): { numerados: LineaDeEje[]; letras: LineaDeEje[] } {
  const largoS = (e.nx - 1) * e.ex
  const largoT = (e.ny - 1) * e.ey
  const numerados = Array.from({ length: e.nx }, (_, i) => ({
    etiqueta: String(i + 1),
    a: puntoDeEjes(e, i * e.ex, -sobra),
    b: puntoDeEjes(e, i * e.ex, largoT + sobra),
  }))
  const letras = Array.from({ length: e.ny }, (_, j) => ({
    etiqueta: letraDeEje(j),
    a: puntoDeEjes(e, -sobra, j * e.ey),
    b: puntoDeEjes(e, largoS + sobra, j * e.ey),
  }))
  return { numerados, letras }
}

/**
 * Las líneas de los ejes alargadas hasta cubrir el polígono, para pegar a ellas las divisiones de los locales
 * (spec circulaciones §4.5). Solo los ejes que cruzan la caja del polígono.
 */
export function ejesParaCortes(e: EjesEstructurales, poligono: Punto[]): Punto[][] {
  if (poligono.length < 3) return []
  const st = poligono.map((q) => enEjes(e, q))
  const s0 = Math.min(...st.map((q) => q[0])) - 1
  const s1 = Math.max(...st.map((q) => q[0])) + 1
  const t0 = Math.min(...st.map((q) => q[1])) - 1
  const t1 = Math.max(...st.map((q) => q[1])) + 1
  const out: Punto[][] = []
  for (let i = 0; i < e.nx; i++) {
    const s = i * e.ex
    if (s > s0 && s < s1) out.push([puntoDeEjes(e, s, t0), puntoDeEjes(e, s, t1)])
  }
  for (let j = 0; j < e.ny; j++) {
    const t = j * e.ey
    if (t > t0 && t < t1) out.push([puntoDeEjes(e, s0, t), puntoDeEjes(e, s1, t)])
  }
  return out
}

/** La columna del cruce (i, j): un rectángulo de `columna` girado con los ejes. */
export function columnaEn(e: EjesEstructurales, i: number, j: number): Punto[] {
  const s = i * e.ex
  const t = j * e.ey
  const [a, b] = [e.columna[0] / 2, e.columna[1] / 2]
  return [
    puntoDeEjes(e, s - a, t - b),
    puntoDeEjes(e, s + a, t - b),
    puntoDeEjes(e, s + a, t + b),
    puntoDeEjes(e, s - a, t + b),
  ]
}

/**
 * Las columnas que caen en el polígono, aunque sea en parte: con un eje sobre la orilla de la masa (así nacen los
 * ejes por omisión), media columna queda dentro y los cajones la deben esquivar.
 */
export function columnasEn(e: EjesEstructurales, poligono: Punto[]): Punto[][] {
  if (poligono.length < 3) return []
  const [x0, y0, x1, y1] = [
    Math.min(...poligono.map((q) => q.x)),
    Math.min(...poligono.map((q) => q.y)),
    Math.max(...poligono.map((q) => q.x)),
    Math.max(...poligono.map((q) => q.y)),
  ]
  const r = Math.hypot(e.columna[0], e.columna[1])
  const out: Punto[][] = []
  for (let i = 0; i < e.nx; i++)
    for (let j = 0; j < e.ny; j++) {
      const c = puntoDeEjes(e, i * e.ex, j * e.ey)
      if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue
      const col = columnaEn(e, i, j)
      if (puntoEnPoligono(c, poligono) || areaRegiones(interseccion([poligono], [col])) > 1e-6) out.push(col)
    }
  return out
}

/**
 * Si las filas de cajones a `angulo` corren con los ejes (±0.5°, en cualquiera de los dos sentidos): la separación
 * entre columnas a lo largo de la fila, el ancho de la columna en esa dirección y la separación a escuadra. Si no,
 * null.
 */
export function filasConEjes(
  e: EjesEstructurales,
  angulo: number,
): { paso: number; columna: number; otro: number } | null {
  const dif = (((angulo - e.angulo) % 180) + 180) % 180
  if (Math.min(dif, 180 - dif) <= TOL_ANGULO) return { paso: e.ex, columna: e.columna[0], otro: e.ey }
  if (Math.abs(dif - 90) <= TOL_ANGULO) return { paso: e.ey, columna: e.columna[1], otro: e.ex }
  return null
}

/**
 * Avisos de las filas de cajones a `angulo` frente a los ejes: si no corren con ellos, si a lo largo de la fila la
 * separación no es un múltiplo del cajón más la columna (8.1 m = 3 × 2.5 + 0.6) y si a escuadra no es un múltiplo
 * del módulo de dos filas y su pasillo (las columnas caerían en cajones o en el pasillo).
 */
export function avisosDeModulo(
  e: EjesEstructurales,
  angulo: number,
  anchoCajon: number,
  modulo: number,
  sesgo = 0, // (fase 8) en batería, los cajones de un tramo ocupan además el corrimiento de su fondo
): string[] {
  const f = filasConEjes(e, angulo)
  if (!f)
    return [
      `Las filas a ${angulo.toFixed(1)}° no corren con los ejes estructurales (${e.angulo.toFixed(1)}°): ` +
        'las columnas no quedan entre cajones.',
    ]
  const avisos: string[] = []
  const n = Math.max(0, Math.floor((f.paso - f.columna - sesgo) / anchoCajon + 1e-9))
  const sobra = f.paso - f.columna - sesgo - n * anchoCajon
  if (anchoCajon > 0 && n === 0)
    avisos.push(
      `Entre columnas a ${f.paso.toFixed(2)} m no cabe ningún cajón: con la columna de ${f.columna.toFixed(2)} m ` +
        `y el corrimiento de ${sesgo.toFixed(2)} m de los cajones inclinados, uno pide ` +
        `${(anchoCajon + sesgo + f.columna).toFixed(2)} m.`,
    )
  if (anchoCajon > 0 && n >= 1 && sobra >= 0.05)
    avisos.push(
      `Los ejes a ${f.paso.toFixed(2)} m dejan ${sobra.toFixed(2)} m sin usar entre columnas: ` +
        `${n} cajones de ${anchoCajon.toFixed(2)} m${sesgo > 0 ? ` (más ${sesgo.toFixed(2)} m de corrimiento)` : ''} ` +
        `y una columna de ${f.columna.toFixed(2)} m piden ${(n * anchoCajon + sesgo + f.columna).toFixed(2)} m.`,
    )
  const k = modulo > 0 ? f.otro / modulo : 0
  if (modulo > 0 && Math.abs(k - Math.round(k)) * modulo > 0.05)
    avisos.push(
      `Los ejes a ${f.otro.toFixed(2)} m a escuadra con las filas no siguen el módulo de dos filas y su pasillo ` +
        `(${modulo.toFixed(2)} m): algunas columnas caen en cajones o en el pasillo.`,
    )
  return avisos
}
