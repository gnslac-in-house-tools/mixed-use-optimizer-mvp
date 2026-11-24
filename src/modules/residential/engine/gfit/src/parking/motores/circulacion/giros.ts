// Revisión de radios de giro (spec circulaciones §5.4). Solo informa: no mueve cajones.
// - La circulación de la masa es la unión de pasillos, cruces, ligas, rampas, llegadas y filas de acceso (con 2 cm de
//   tolerancia para cerrar rendijas).
// - Cada esquina interior de esa unión con un ángulo cercano a 90° es una vuelta entre dos pasillos. Se mide el
//   ancho de cada uno (de la orilla de la esquina a la orilla de enfrente).
// - Un auto da la vuelta si hay un centro de giro con el que la corona entre el radio interior y el exterior
//   queda dentro de los dos pasillos y no pisa la esquina. En el marco de la esquina (X a lo largo de un pasillo,
//   Y a lo largo del otro, la esquina en el origen y lo que no es pasillo en X > 0, Y > 0), con anchos w1 (del
//   pasillo que corre en X) y w2 (del que corre en Y), p = Rext − w2 y q = Rext − w1, el centro (cx, cy) debe
//   cumplir cx ≥ p, cy ≥ q, cx ≤ Rint, cy ≤ Rint y, si los dos son positivos, cx² + cy² ≤ Rint² (el círculo
//   interior abraza la esquina). Hay centro si p ≤ Rint, q ≤ Rint y (p ≤ 0, q ≤ 0 o p² + q² ≤ Rint²).
//   Con pasillos de 6 m y radios de 7.5 / 4.5 m pasa; con dos de 4 m no.
import type { Punto } from '../../modelo/tipos.ts'
import { desplazar, unionDeExteriores } from '../geom/booleanos.ts'
import { puntoEnRegion } from '../geom/poligono.ts'

/** Radios de giro por omisión (m): provisionales, según parámetro y no norma (§12). */
export const GIRO_POR_OMISION = { exterior: 7.5, interior: 4.5 }

/** El aviso de la revisión: cuántas vueltas fallan con estos radios, o que los radios no sirven. */
export function mensajeGiro(fallan: number, exterior: number, interior: number): string | null {
  if (!(interior < exterior))
    return `El radio interior debe ser menor que el exterior (${interior} y ${exterior} m): no se revisan las vueltas.`
  if (fallan === 0) return null
  const una = fallan === 1
  return (
    `${una ? 'Una vuelta' : `${fallan} vueltas`} entre pasillos no ${una ? 'da' : 'dan'} el radio de giro ` +
    `(exterior ${exterior} m, interior ${interior} m; según parámetro, no norma). ` +
    `Con el detalle Diseño ${una ? 'se ve' : 'se ven'} en rojo.`
  )
}

/**
 * La unión de la circulación sin rendijas ni rebabas: cada pieza se infla 2 cm (con `desplazar`, no con
 * InflatePaths de clipper2-js, que deja vértices fuera de lugar), se unen como exteriores (una pieza dentro de
 * otra no abre un hueco) y se desinfla.
 */
function unionDeCirculacion(piezas: Punto[][]): Punto[][][] {
  const infladas = piezas.flatMap((q) => desplazar([q], 0.02).flat())
  return desplazar(unionDeExteriores(infladas).flat(), -0.02)
}

/** Una vuelta que no da el radio: la esquina, el centro de giro más holgado y la corona que barre el auto. */
export interface GiroFallido {
  esquina: Punto
  centro: Punto
  /** La corona entre los dos radios (el arco exterior y de regreso el interior), cerrada. */
  corona: Punto[]
  /** Ancho de los dos pasillos que se cruzan en la esquina (m). */
  anchos: [number, number]
}

/** Lado mínimo de una esquina para contarla como vuelta (los escalones menores no lo son). */
const LADO_MIN = 1
/** Tolerancia (grados) para una esquina a escuadra. */
const TOL_ESCUADRA = 10
const EPS = 0.05

const resta = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y })
const largo = (v: Punto) => Math.hypot(v.x, v.y)
const unit = (v: Punto): Punto => {
  const l = largo(v) || 1
  return { x: v.x / l, y: v.y / l }
}
const mas = (a: Punto, v: Punto, k: number): Punto => ({ x: a.x + v.x * k, y: a.y + v.y * k })

/**
 * Limpia un anillo de la unión: quita los lados de menos de 10 cm y los vértices que van casi en línea recta, hacia
 * adelante o de regreso (menos de 1°).
 */
function simplificar(anillo: Punto[]): Punto[] {
  let p = anillo
  let cambio = true
  while (cambio && p.length > 3) {
    cambio = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length]
      const b = p[i]
      const c = p[(i + 1) % p.length]
      const corto = largo(resta(c, b)) < 0.1
      const u = unit(resta(b, a))
      const v = unit(resta(c, b))
      if (corto || Math.abs(u.x * v.y - u.y * v.x) < Math.sin(Math.PI / 180)) {
        p = p.filter((_, k) => k !== i)
        cambio = true
        break
      }
    }
  }
  return p
}

/** Distancia desde `o` en la dirección `d` hasta la primera orilla de la región (Infinity si no hay). */
function rayo(o: Punto, d: Punto, anillos: Punto[][]): number {
  let mejor = Infinity
  for (const r of anillos)
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      const e = resta(b, a)
      const den = d.x * e.y - d.y * e.x
      if (Math.abs(den) < 1e-12) continue
      const w = resta(a, o)
      const t = (w.x * e.y - w.y * e.x) / den
      const s = (w.x * d.y - w.y * d.x) / den
      if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9 && t < mejor) mejor = t
    }
  return mejor
}

/**
 * El ancho del pasillo que corre a lo largo de la orilla que sale de la esquina `v` en la dirección `a` (de
 * largo `l`): la menor distancia hacia `n` (adentro del pasillo) desde unos puntos de esa orilla.
 */
function anchoDe(v: Punto, a: Punto, l: number, n: Punto, anillos: Punto[][]): number {
  const ds = [0.5, 1.5, 3].filter((d) => d < l)
  return Math.min(...(ds.length > 0 ? ds : [l / 2]).map((d) => rayo(mas(v, a, d), n, anillos)))
}

/** ¿Cabe la corona del giro en la esquina con pasillos de anchos w1 y w2? */
export function cabeGiro(w1: number, w2: number, interior: number, exterior: number): boolean {
  const p = exterior - w2
  const q = exterior - w1
  if (p > interior || q > interior) return false
  return p <= 0 || q <= 0 || p * p + q * q <= interior * interior
}

/** La corona del giro con centro `c` en el marco (ua, uc) de la esquina, de 0° a 90°. */
function corona(c: Punto, ua: Punto, uc: Punto, interior: number, exterior: number): Punto[] {
  const punto = (r: number, f: number) => mas(mas(c, ua, -r * Math.sin(f)), uc, -r * Math.cos(f))
  const fs = Array.from({ length: 13 }, (_, i) => (i / 12) * (Math.PI / 2))
  return [...fs.map((f) => punto(exterior, f)), ...[...fs].reverse().map((f) => punto(interior, f))]
}

/**
 * Las vueltas a escuadra de la circulación que no dan los radios de giro. `circulacion` son los polígonos por
 * donde se maneja (pasillos, cruces, ligas, rampas…); se unen con una tolerancia de 2 cm.
 */
export function revisarGiros(circulacion: Punto[][], interior: number, exterior: number): GiroFallido[] {
  const piezas = circulacion.filter((q) => q.length >= 3)
  if (piezas.length === 0 || !(exterior > 0) || !(interior >= 0) || interior >= exterior) return []
  const out: GiroFallido[] = []
  for (const region of unionDeCirculacion(piezas)) {
    const anillos = region.map(simplificar).filter((r) => r.length >= 3)
    for (const anillo of anillos) {
      const n = anillo.length
      for (let i = 0; i < n; i++) {
        const v = anillo[i]
        const ea = resta(anillo[(i - 1 + n) % n], v)
        const ec = resta(anillo[(i + 1) % n], v)
        const [la, lc] = [largo(ea), largo(ec)]
        if (la < LADO_MIN || lc < LADO_MIN) continue
        const ua = unit(ea)
        const uc = unit(ec)
        if (Math.abs(ua.x * uc.x + ua.y * uc.y) > Math.sin((TOL_ESCUADRA * Math.PI) / 180)) continue
        // esquina interior: lo que queda entre las dos orillas no es circulación y lo demás sí
        const b = unit({ x: ua.x + uc.x, y: ua.y + uc.y })
        const dentro = (q: Punto) => puntoEnRegion(q, anillos)
        if (dentro(mas(v, b, EPS)) || !dentro(mas(v, b, -EPS))) continue
        if (!dentro(mas(mas(v, ua, EPS), uc, -EPS)) || !dentro(mas(mas(v, uc, EPS), ua, -EPS))) continue
        const w1 = anchoDe(v, ua, la, { x: -uc.x, y: -uc.y }, anillos)
        const w2 = anchoDe(v, uc, lc, { x: -ua.x, y: -ua.y }, anillos)
        if (cabeGiro(w1, w2, interior, exterior)) continue
        const c = mas(mas(v, ua, Math.max(0, exterior - w2)), uc, Math.max(0, exterior - w1))
        out.push({ esquina: v, centro: c, corona: corona(c, ua, uc, interior, exterior), anchos: [w1, w2] })
      }
    }
  }
  return out
}
