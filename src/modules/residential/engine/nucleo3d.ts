// El núcleo en 3D (spec 2026-11-26-blocks-residenciales): cada elemento en prismas en la planta (x, y) con su cota y su
// alto. El elevador, su cubo de muros a todo lo alto (el del frente partido por la puerta) y su cabina en el piso más
// bajo; el ducto, sus cuatro muros; la escalera, en cada piso dos tramos de escalones (de ida a lo hondo por su mitad
// izquierda, de vuelta por la derecha) y el descanso al fondo, como la dibuja la planta. El vestíbulo es piso: nada.
// Puro.
import type { Level, Point } from '../../../model/schema.ts'
import { enNucleo, type ElementoNucleo, type NucleoColocado } from './nucleoDetalle.ts'

export type Parte = 'cubo' | 'cabina' | 'ducto' | 'escalon' | 'descanso'
export interface Prisma { parte: Parte; pts: Point[]; z0: number; alto: number }
export interface Piso { z: number; h: number }

/** m: muro del cubo, muro del ducto, peralte ideal, grueso de un escalón, alto de la cabina */
const MURO_CUBO = 0.15
const MURO_DUCTO = 0.1
const PERALTE = 0.175
const GRUESO = 0.2
const CABINA = 2.3

/** Los pisos (con los ×N desplegados) de esos niveles entre z0 y z1. */
export function pisosEn(levels: Level[], z0: number, z1: number): Piso[] {
  const out: Piso[] = []
  for (const l of [...levels].sort((a, b) => a.elevation - b.elevation))
    for (let k = 0; k < l.repeat; k++) {
      const z = Math.round((l.elevation + k * l.height) * 1000) / 1000
      if (z >= z0 - 1e-6 && z + l.height <= z1 + 1e-6) out.push({ z, h: l.height })
    }
  return out
}

export function prismasNucleo(c: NucleoColocado, pisos: Piso[]): Prisma[] {
  if (!pisos.length) return []
  const z0 = Math.min(...pisos.map((p) => p.z))
  const z1 = Math.max(...pisos.map((p) => p.z + p.h))
  const out: Prisma[] = []
  for (const e of c.elementos) {
    // un rectángulo del marco del elemento (u a lo largo de su w, v a lo hondo de su d) en la planta
    const caja = (u0: number, v0: number, u1: number, v1: number): Point[] =>
      ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as [number, number][]).map(([u, v]) => {
        const [x, y] = c.aMundo(...enNucleo(e, u, v))
        return { x, y }
      })
    const pon = (parte: Parte, pts: Point[], z: number, alto: number) => out.push({ parte, pts, z0: z, alto })
    if (e.kind === 'elevador') muros(e, MURO_CUBO, true).forEach((r) => pon('cubo', caja(...r), z0, z1 - z0))
    if (e.kind === 'elevador') pon('cabina', caja(0.3, 0.3, e.w - 0.3, e.d - 0.3), z0, Math.min(CABINA, pisos[0].h - 0.3))
    if (e.kind === 'ducto') muros(e, MURO_DUCTO, false).forEach((r) => pon('ducto', caja(...r), z0, z1 - z0))
    if (e.kind === 'escalera')
      for (const { z, h } of pisos) {
        const n = Math.max(4, Math.round(h / PERALTE))
        const p = h / n
        const n1 = Math.ceil(n / 2)
        const descanso = Math.min(1.2, e.d * 0.25)
        const largo = e.d - descanso
        const t1 = largo / (n1 - 1), t2 = largo / (n - n1 - 1)
        const mitad = e.w / 2
        // de ida: los escalones 1 … n1 − 1 suben a lo hondo; el n1 es el descanso
        for (let k = 1; k < n1; k++) pon('escalon', caja(0, (k - 1) * t1, mitad, k * t1), z + k * p - GRUESO, GRUESO)
        pon('descanso', caja(0, largo, e.w, e.d), z + n1 * p - GRUESO, GRUESO)
        // de vuelta: los escalones n1 + 1 … n − 1 bajan hacia el frente; el n es la losa de arriba
        for (let k = n1 + 1; k < n; k++) {
          const j = k - n1
          pon('escalon', caja(mitad, largo - j * t2, e.w, largo - (j - 1) * t2), z + k * p - GRUESO, GRUESO)
        }
      }
  }
  return out
}

/** Los muros de un cubo o un ducto en el marco del elemento: atrás, izquierda, derecha y el frente (con la puerta, en dos). */
function muros(e: ElementoNucleo, t: number, puerta: boolean): [number, number, number, number][] {
  const { w, d } = e
  const lados: [number, number, number, number][] = [[0, d - t, w, d], [0, t, t, d - t], [w - t, t, w, d - t]]
  if (!puerta) return [...lados, [0, 0, w, t]]
  return [...lados, [0, 0, w * 0.25, t], [w * 0.75, 0, w, t]]
}
