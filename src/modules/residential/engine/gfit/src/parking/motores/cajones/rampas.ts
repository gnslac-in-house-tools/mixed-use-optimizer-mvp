// (app) Medidas de cada rampa y su alineación a un pasillo (spec circulaciones §6.1 y §6.2). El motor portado usa
// una sola medida para todas las rampas; aquí cada una trae la suya y, si su largo es null, se calcula con la
// pendiente y las transiciones.
import type { FlechaAcceso, Rampa } from '../../modelo/tipos.ts'
import { aristas, rampa, type Lazo, type Punto2 } from './acomodo.ts'

/** Pendiente de la parte central por omisión (fracción): parámetro, no norma. */
export const PENDIENTE_RAMPA = 0.15
/** Largo de cada transición de una rampa nueva (m), a la mitad de la pendiente. */
export const TRANSICION_RAMPA = 3.6
/** Largo de una rampa sin largo ni altura con qué calcularlo. */
const LARGO_SIN_ALTURA = 20

export interface MedidaRampa {
  ancho: number
  largo: number
  paralela: boolean
  /** Pendiente de la parte central (%). */
  pendiente: number
  /** Pendiente de las transiciones (%): la mitad de la central; igual a la central si no hay transiciones. */
  pendienteTransicion: number
  /** Largo de cada transición (m), ya recortado a la mitad de la rampa. */
  transicion: number
  /** ¿El largo se calculó (largo null, o uno guardado que no sirve)? */
  calculado: boolean
  /** El desnivel que salva (m). */
  desnivel: number
}

/**
 * Largo de una rampa que sube `h` con pendiente central `p` (fracción) y dos transiciones de largo `t` a `p/2`:
 * `2t + (h − t·p)/p`. Si las transiciones ya suben todo (h ≤ t·p), la rampa son solo ellas: `2h/p`.
 */
export function largoCalculado(h: number, p: number, t: number): number {
  const alto = Math.abs(h)
  if (!(p > 0)) return LARGO_SIN_ALTURA
  if (alto <= t * p) return (2 * alto) / p
  return 2 * t + (alto - t * p) / p
}

const redondear = (x: number) => Math.round(x * 100) / 100

/**
 * Medidas de una rampa que sube `h`. Sin transición guardada (rampas de antes) la pendiente es h / largo, como en
 * el motor portado. Con transiciones de largo t a la mitad de la pendiente central pc: h = pc·(largo − t).
 */
export function medidaDeRampa(r: Rampa, h: number): MedidaRampa {
  const t0 = Math.max(0, r.transicion ?? 0)
  const p = r.pendiente ?? PENDIENTE_RAMPA
  const calculado = r.largo === null || r.largo === undefined || !(r.largo > 0)
  const largo = calculado ? Math.ceil(largoCalculado(h, p, t0) * 10 - 1e-9) / 10 : (r.largo as number)
  const t = Math.min(t0, largo / 2)
  const alto = Math.abs(h)
  const central = largo - t > 0 ? alto / (largo - t) : Infinity
  return {
    ancho: r.ancho,
    largo,
    paralela: r.paralela,
    pendiente: redondear(central * 100),
    pendienteTransicion: redondear((t > 0 ? central / 2 : central) * 100),
    transicion: t,
    calculado,
    desnivel: Math.abs(h),
  }
}

/**
 * El pasillo que pide una rampa alineada (spec circulaciones §6.2): el ángulo de las filas (grados, 0..180) para
 * que los pasillos corran en la dirección de la rampa, y el borde inferior `v0` de ese pasillo.
 * - Perpendicular a la orilla: el pasillo va centrado en el eje de la rampa y la boca desemboca de frente en él.
 * - Paralela: el pasillo cubre la franja de la rampa desde la orilla; centrado en el eje quedaría medio pasillo
 *   fuera de la masa.
 */
export function pasilloDeRampa(
  borde: Lazo[],
  punto: Punto2,
  m: Pick<MedidaRampa, 'ancho' | 'largo' | 'paralela'>,
  A: number,
  fija?: Lazo,
): { angulo: number; v0: number } {
  const poli = fija ?? rampa(aristas(borde), punto[0], punto[1], m.ancho, m.largo, A, m.paralela)[0]
  const [c0, c1, c2, c3] = poli
  // paralela: 0→1 es el largo y 0→3 entra a la masa; perpendicular: 0→1 es el ancho y 1→2 el largo
  const [a, b] = m.paralela ? [c0, c1] : [c1, c2]
  const angulo = anguloDeDireccion([b[0] - a[0], b[1] - a[1]])
  if (m.paralela) {
    const vOrilla = coordenadaV(c0, angulo)
    return { angulo, v0: coordenadaV(c3, angulo) > vOrilla ? vOrilla : vOrilla - A }
  }
  const cx = poli.reduce((s, q) => s + q[0], 0) / poli.length
  const cy = poli.reduce((s, q) => s + q[1], 0) / poli.length
  return { angulo, v0: coordenadaV([cx, cy], angulo) - A / 2 }
}

/**
 * La huella de una rampa sobre el polígono (en sus coordenadas) y la boca de su extremo alto: la que en el nivel
 * de llegada da a los pasillos (spec circulaciones §6.3). Paralela: la boca que sigue a la rampa en su extremo
 * alto; perpendicular: el extremo alto queda en la orilla y la boca sale hacia afuera de la masa.
 */
export function geometriaDeRampa(
  poligono: Lazo,
  punto: Punto2,
  m: Pick<MedidaRampa, 'ancho' | 'largo' | 'paralela'>,
  A: number,
): { huella: Lazo; bocaAlta: Lazo } {
  const [poli, bocas] = rampaSobre(poligono, punto, m, A)
  if (m.paralela) return { huella: poli, bocaAlta: bocas[1] }
  const [c0, c1, , c3] = poli
  const l = Math.hypot(c3[0] - c0[0], c3[1] - c0[1]) || 1
  const n: Punto2 = [(c3[0] - c0[0]) / l, (c3[1] - c0[1]) / l]
  const fuera = (q: Punto2): Punto2 => [q[0] - n[0] * A, q[1] - n[1] * A]
  return { huella: poli, bocaAlta: [fuera(c0), fuera(c1), c1, c0] }
}

/**
 * La rampa armada sobre el polígono de la masa: rectángulo, bocas y alto de cada esquina, como en `acomodar`. Con
 * zonas se arma aquí, sobre la masa entera, para que la rampa de cada zona y su llegada en otro nivel coincidan.
 */
export function rampaSobre(
  poligono: Lazo,
  punto: Punto2,
  m: Pick<MedidaRampa, 'ancho' | 'largo' | 'paralela'>,
  A: number,
): [Lazo, Lazo[], number[]] {
  return rampa(aristas([poligono]), punto[0], punto[1], m.ancho, m.largo, A, m.paralela)
}

/** Largo de un auto en la fila de espera de un acceso (m). */
export const LARGO_AUTO_FILA = 6
const CASETA = { ancho: 2, fondo: 3, separacion: 0.3, retiro: 1 }

/** La flecha de un acceso, si es válida y no es la de siempre (entra); cualquier otro dato cuenta como entra. */
export function flechaDeAcceso(a: { flecha?: unknown }): { flecha?: FlechaAcceso } {
  return a.flecha === 'sale' || a.flecha === 'ambos' || a.flecha === 'ninguna' ? { flecha: a.flecha } : {}
}

/**
 * La fila de espera de un acceso desde la calle (spec circulaciones §6.4): un carril de su ancho que entra desde la
 * orilla `fila` × 6 m (al menos un pasillo), sin cajones; su extremo interior conecta con los pasillos. La caseta
 * va junto al carril, a un metro de la orilla.
 */
export function filaDeAcceso(
  borde: Lazo[],
  punto: Punto2,
  a: { ancho: number; fila: number; caseta: boolean },
  A: number,
): { fila: Lazo; caseta: Lazo | null } {
  const fondo = Math.max(A, a.fila * LARGO_AUTO_FILA)
  const [fila] = rampa(aristas(borde), punto[0], punto[1], a.ancho, fondo, A, false)
  if (!a.caseta) return { fila, caseta: null }
  const [c0, c1, , c3] = fila
  const lt = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1
  const t: Punto2 = [(c1[0] - c0[0]) / lt, (c1[1] - c0[1]) / lt]
  const ln = Math.hypot(c3[0] - c0[0], c3[1] - c0[1]) || 1
  const n: Punto2 = [(c3[0] - c0[0]) / ln, (c3[1] - c0[1]) / ln]
  const q = (s: number, r: number): Punto2 => [c1[0] + t[0] * s + n[0] * r, c1[1] + t[1] * s + n[1] * r]
  const s0 = CASETA.separacion
  const s1 = CASETA.separacion + CASETA.ancho
  const r0 = CASETA.retiro
  const r1 = CASETA.retiro + CASETA.fondo
  return { fila, caseta: [q(s0, r0), q(s1, r0), q(s1, r1), q(s0, r1)] }
}

/** Ángulo (grados, 0..180) de las filas cuyos pasillos corren en la dirección `dir`. */
export function anguloDeDireccion(dir: Punto2): number {
  const a = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI
  return ((a % 180) + 180) % 180
}

/**
 * Desfase de las bandas (0..1) para que un pasillo, cuyo borde inferior (en v) es `v0`, caiga ahí. Las bandas de
 * `acomodar` empiezan en vmin − P con fila, pasillo, fila (P = 2L + A).
 */
export function faseParaPasillo(borde: Lazo[], anguloGrados: number, v0: number, L: number, A: number): number {
  const a = (anguloGrados * Math.PI) / 180
  const v = ([x, y]: Punto2) => -x * Math.sin(a) + y * Math.cos(a)
  const vmin = Math.min(...borde[0].map(v))
  const P = 2 * L + A
  return ((((v0 - L - (vmin - P)) % P) + P) % P) / P
}

/** Coordenada v (perpendicular a las filas) de un punto. */
export function coordenadaV([x, y]: Punto2, anguloGrados: number): number {
  const a = (anguloGrados * Math.PI) / 180
  return -x * Math.sin(a) + y * Math.cos(a)
}
