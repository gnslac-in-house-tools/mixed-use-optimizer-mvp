// (app) Circuito de estacionamiento (spec interacción §16.1): una crujía de cajones a lo largo de cada orilla de la
// masa —la exterior y la de cada hueco—, un pasillo de circuito junto a cada crujía y, si entre los pasillos sobra
// lugar, otra crujía de frente al circuito (si es delgado) o la retícula de siempre (si es grueso). Es un paso
// aparte, encima de `acomodar`: el oro no cambia.
import type { FlechaAcceso, ParamsCajones, Punto } from '../../modelo/tipos.ts'
import { ejeDePasillo } from '../circulacion/ejePasillo.ts'
import type { Llegada } from '../circulacion/llegadas.ts'
import { areaRegiones, desplazar, diferencia, interseccion } from '../geom/booleanos.ts'
import {
  area,
  areaConSigno,
  caja,
  centroide,
  distanciaPuntoSegmento,
  puntoEnPoligono,
  puntoEnRegion,
} from '../geom/poligono.ts'
import type { Punto2 } from './acomodo.ts'
import {
  barrer,
  gruposDePasillos,
  gruposDeRed,
  ligaDeBoca,
  redDelCircuito,
  seTocan,
  type EntradaCircuito,
} from './entradasCircuito.ts'
import {
  calcularCajones,
  pendienteDeRampas,
  puntoEnPerimetro,
  type OpcionesCajones,
  type CalleDerivada,
  type ResultadoCajones,
} from './index.ts'
import { filaDeAcceso, flechaDeAcceso, medidaDeRampa, rampaSobre } from './rampas.ts'

/** Un tramo de orilla se parte en las esquinas que giran más que esto (grados): ahí no cabe un cajón de corrido. */
const QUIEBRE = 20
/** Lo que un cajón puede salirse de la masa (fracción de su área) por la discretización de las curvas. */
const TOLERANCIA = 0.02
/** En 'auto', el circuito se queda si da al menos esta fracción de los cajones de la retícula. */
export const CIRCUITO_MIN_RELATIVO = 0.85
/** Debajo de esto (m²) un resto en medio del circuito no se llena. */
const RESTO_MIN = 20
/** El pasillo de un tramo curvo va en piezas de este largo (en múltiplos del ancho): largas a lo largo de la curva. */
const PIEZA_CURVA = 2
/** El pasillo mínimo de un circuito con cajones a 90° (m). */
const PASILLO_90 = 6
/**
 * Una sola calle donde se encimaban (spec calles y cotas §4): el tramo de un hueco se une a una calle anterior si en al
 * menos esta fracción de su largo no cabe una crujía entre las dos. Se mide cada MUESTRA m.
 */
const FUSION = 0.5
const MUESTRA = 1

export const AVISO_CIRCUITO_ANGOSTO = 'No cabe un circuito: la masa es muy angosta para las crujías y el pasillo.'
export const AVISO_CIRCUITO_BATERIA =
  'En circuito los cajones van a 90° con un pasillo de al menos 6 m: la batería no aplica.'
export const AVISO_CIRCUITO_ZONAS = 'En circuito no aplican las zonas: los cortes se ignoran.'
export const AVISO_CIRCUITO_OBSTACULOS =
  'Hay columnas o núcleos en el pasillo del circuito: muévelos o usa la retícula, que acomoda las filas entre ellos.'

/**
 * ¿Se prueba el circuito? Forzado sí. En 'auto' (sin dato) solo si la masa tiene hueco y nada que el circuito aún no
 * resuelve: columnas, batería o sentido único. Las rampas, las llegadas y los accesos sí se ubican (§16.4). En 'auto'
 * quien llama compara con la retícula (CIRCUITO_MIN_RELATIVO): un hueco en una masa angosta no deja lugar.
 */
export function enCircuito(params: ParamsCajones, conHueco: boolean): boolean {
  const d = params.disposicion ?? 'auto'
  if (d !== 'auto') return d === 'circuito'
  return conHueco && !params.columnas && (params.anguloCajon ?? 90) === 90 && params.sentido !== 'unico'
}

const resta = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y })
const mas = (a: Punto, v: Punto, t: number): Punto => ({ x: a.x + v.x * t, y: a.y + v.y * t })
const largo = (v: Punto) => Math.hypot(v.x, v.y)
const izquierda = (d: Punto): Punto => {
  const l = largo(d) || 1
  return { x: -d.y / l, y: d.x / l }
}

/** El anillo partido en tramos (polilíneas abiertas) donde gira más de QUIEBRE grados. */
export function tramosDe(anillo: Punto[]): Punto[][] {
  const n = anillo.length
  if (n < 3) return []
  const quiebres = anillo.map((_, i) => i).filter((i) => giro(anillo, i) > QUIEBRE)
  // un anillo sin quiebres (un círculo) es un solo tramo cerrado
  if (quiebres.length === 0) return [[...anillo, anillo[0]]]
  const tramos: Punto[][] = []
  for (let k = 0; k < quiebres.length; k++) {
    const i0 = quiebres[k]
    const i1 = quiebres[(k + 1) % quiebres.length]
    const t: Punto[] = [anillo[i0]]
    for (let i = (i0 + 1) % n; ; i = (i + 1) % n) {
      t.push(anillo[i])
      if (i === i1) break
    }
    tramos.push(t)
  }
  return tramos
}

/** Cuánto gira el anillo en el vértice i (grados, sin signo). */
function giro(anillo: Punto[], i: number): number {
  const n = anillo.length
  const a = resta(anillo[i], anillo[(i - 1 + n) % n])
  const b = resta(anillo[(i + 1) % n], anillo[i])
  const la = largo(a)
  const lb = largo(b)
  if (la === 0 || lb === 0) return 0
  const c = (a.x * b.x + a.y * b.y) / (la * lb)
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

/** Los largos acumulados de una polilínea. */
function acumulados(t: Punto[]): number[] {
  const acum = [0]
  for (let i = 1; i < t.length; i++) acum.push(acum[i - 1] + largo(resta(t[i], t[i - 1])))
  return acum
}

/** El punto a `s` m del inicio de la polilínea (con sus largos acumulados). */
function enLargo(t: Punto[], acum: number[], s: number): Punto {
  let i = 1
  while (i < t.length - 1 && acum[i] < s) i++
  const l = acum[i] - acum[i - 1]
  return l > 0 ? mas(t[i - 1], resta(t[i], t[i - 1]), (s - acum[i - 1]) / l) : t[i]
}

/**
 * Los cajones de una crujía a lo largo de un tramo del frente: de ancho W, cada uno a escuadra con la cuerda que cubre y
 * de fondo L hacia la derecha del tramo (hacia afuera de la región de los frentes, donde está la orilla). En un tramo
 * recto van centrados y seguidos. En una curva que se cierra hacia los cajones (un hueco redondo) los cajones se
 * abren en abanico y se encimarían por el fondo: se recorren hasta que dejan de encimarse con el anterior.
 */
export function cajonesDeTramo(t: Punto[], W: number, L: number): Punto[][] {
  const acum = acumulados(t)
  const total = acum[acum.length - 1]
  const n = Math.floor(total / W + 1e-9)
  const cajon = (s: number): Punto[] | null => {
    const p0 = enLargo(t, acum, s)
    const p1 = enLargo(t, acum, s + W)
    const d = resta(p1, p0)
    const l = largo(d)
    if (l < W * 0.9) return null // la cuerda queda corta: una curva muy cerrada
    const normal = { x: d.y / l, y: -d.x / l } // a la derecha
    return [p0, p1, mas(p1, normal, L), mas(p0, normal, L)]
  }
  const out: Punto[][] = []
  const paso = W / 10
  let s = (total - n * W) / 2
  while (s + W <= total + 1e-9) {
    const c = cajon(s)
    const previo = out[out.length - 1]
    if (!c || (previo && areaRegiones(interseccion([previo], [c])) > 0.05)) {
      s += paso
      continue
    }
    out.push(c)
    s += W
  }
  return out
}

/**
 * El pasillo de un tramo: la franja de ancho A a su izquierda (del lado del circuito). Un tramo recto es una sola
 * pieza; uno curvo va en piezas largas a lo largo de la curva (para que su eje y sus flechas sigan la curva).
 */
function franjasDeTramo(t: Punto[], A: number): Punto[][] {
  const acum = acumulados(t)
  const total = acum[acum.length - 1]
  if (total < 1e-6) return []
  // los cortes: los extremos y, en una curva, cada PIEZA_CURVA·A
  const cortes = [0]
  if (t.length > 2) for (let s = PIEZA_CURVA * A; s < total - A / 2; s += PIEZA_CURVA * A) cortes.push(s)
  cortes.push(total)
  const tangente = (s: number) => resta(enLargo(t, acum, Math.min(total, s + 0.05)), enLargo(t, acum, Math.max(0, s - 0.05)))
  const out: Punto[][] = []
  for (let k = 0; k + 1 < cortes.length; k++) {
    const a = enLargo(t, acum, cortes[k])
    const b = enLargo(t, acum, cortes[k + 1])
    out.push([a, b, mas(b, izquierda(tangente(cortes[k + 1])), A), mas(a, izquierda(tangente(cortes[k])), A)])
  }
  return out
}

/**
 * ¿El tramo t del frente de un hueco ya no deja lugar a su propia calle (spec calles y cotas §4)? Sí si en al menos
 * FUSION de su largo, entre él y `A + L` hacia el circuito, ya hay una calle anterior (la de la orilla exterior u otro
 * hueco): ahí su calle quedaría pegada o encimada a esa, sin una crujía en medio.
 */
function sinLugar(t: Punto[], A: number, L: number, previas: { q: Punto[]; c: Caja }[]): boolean {
  if (previas.length === 0) return false
  const acum = acumulados(t)
  const total = acum[acum.length - 1]
  if (total < 1e-6) return false
  const n = Math.max(2, Math.ceil(total / MUESTRA))
  let bloqueadas = 0
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) * total) / n
    const p = enLargo(t, acum, s)
    const nu = izquierda(resta(enLargo(t, acum, Math.min(total, s + 0.05)), enLargo(t, acum, Math.max(0, s - 0.05))))
    for (let d = 0.25; d < A + L - 0.2; d += 0.5) {
      const q = mas(p, nu, d)
      const dentro = (x: { q: Punto[]; c: Caja }) =>
        q.x >= x.c.minX && q.x <= x.c.maxX && q.y >= x.c.minY && q.y <= x.c.maxY && puntoEnPoligono(q, x.q)
      if (previas.some(dentro)) {
        bloqueadas++
        break
      }
    }
  }
  return bloqueadas >= n * FUSION
}

const cajaCon = (c: Caja, tol: number): Caja => ({
  minX: c.minX - tol,
  minY: c.minY - tol,
  maxX: c.maxX + tol,
  maxY: c.maxY + tol,
})

/**
 * Los pedazos libres del segmento a–b (la orilla de una calle, con los cajones a su derecha): dentro de `base` y fuera
 * de las calles. Cada punto se prueba un poco hacia el lado de los cajones, porque el segmento corre sobre la orilla
 * de su propia calle.
 */
function libresDeOrilla(a: Punto, b: Punto, base: Punto[][][], calles: { q: Punto[]; c: Caja }[]): [Punto, Punto][] {
  const d = resta(b, a)
  const l = largo(d)
  if (l < 1e-6) return []
  const u = { x: d.x / l, y: d.y / l }
  const derecha = { x: u.y, y: -u.x }
  const cortes = [0, l]
  const lados = [...base.flat(), ...calles.map((x) => x.q)].flatMap((r) =>
    r.map((p, i) => [p, r[(i + 1) % r.length]] as const),
  )
  for (const [p, q] of lados) {
    const w = resta(q, p)
    const den = u.x * w.y - u.y * w.x
    if (Math.abs(den) < 1e-12) continue
    const s = ((p.x - a.x) * w.y - (p.y - a.y) * w.x) / den
    const v = ((p.x - a.x) * u.y - (p.y - a.y) * u.x) / den
    if (s > 0 && s < l && v >= 0 && v <= 1) cortes.push(s)
  }
  cortes.sort((x, y) => x - y)
  const libre = (s: number) => {
    const q = mas(mas(a, u, s), derecha, 0.05)
    return (
      base.some((rg) => puntoEnRegion(q, rg)) &&
      !calles.some((x) => q.x >= x.c.minX && q.x <= x.c.maxX && q.y >= x.c.minY && q.y <= x.c.maxY && puntoEnPoligono(q, x.q))
    )
  }
  const out: [Punto, Punto][] = []
  for (let k = 0; k + 1 < cortes.length; k++) {
    const s0 = cortes[k]
    const s1 = cortes[k + 1]
    if (s1 - s0 < 1e-6 || !libre((s0 + s1) / 2)) continue
    const previo = out[out.length - 1]
    if (previo && largo(resta(previo[1], mas(a, u, s0))) < 1e-9) previo[1] = mas(a, u, s1)
    else out.push([mas(a, u, s0), mas(a, u, s1)])
  }
  return out
}

/**
 * El eje de la calle de un tramo del anillo (spec calles y cotas §5): a `h` m a su izquierda (del lado del circuito),
 * con inglete en cada vértice, también en las puntas (con el vértice vecino del anillo): así los ejes de dos tramos
 * seguidos se encuentran en la esquina del eje.
 */
function ejeDeTramo(anillo: Punto[], t: Punto[], h: number): Punto[] {
  const n = anillo.length
  return t.map((p) => {
    const i = anillo.indexOf(p)
    if (i < 0) return p
    const n1 = izquierda(resta(p, anillo[(i - 1 + n) % n]))
    const n2 = izquierda(resta(anillo[(i + 1) % n], p))
    const k = 1 + n1.x * n2.x + n1.y * n2.y
    if (k < 0.2) return mas(p, n2, h)
    return { x: p.x + ((n1.x + n2.x) * h) / k, y: p.y + ((n1.y + n2.y) * h) / k }
  })
}

/** Las calles de unas piezas de pasillo (retícula, pasos): el eje de cada una y su ancho. */
export function callesDePasillos(pasillos: Punto[][]): CalleDerivada[] {
  const out: CalleDerivada[] = []
  for (const q of pasillos) {
    const e = ejeDePasillo(q)
    if (e && e.largo > 0.5 && e.ancho > 0.5) out.push({ puntos: [e.a, e.b], ancho: e.ancho })
  }
  return out
}

/**
 * La pieza de pasillo en un vértice del frente donde el anillo gira hacia la derecha (el pasillo, a la izquierda,
 * queda del lado de afuera de la vuelta): sin ella quedaría un cuadro de A × A sin pasillo.
 */
function esquinaDe(anillo: Punto[], i: number, A: number): Punto[] | null {
  const n = anillo.length
  const v = anillo[i]
  const d1 = resta(v, anillo[(i - 1 + n) % n])
  const d2 = resta(anillo[(i + 1) % n], v)
  if (d1.x * d2.y - d1.y * d2.x >= 0 || giro(anillo, i) <= QUIEBRE) return null
  const n1 = izquierda(d1)
  const n2 = izquierda(d2)
  return [v, mas(v, n2, A), mas(mas(v, n1, A), n2, A), mas(v, n1, A)]
}

/**
 * Las regiones desplazadas `d` m hacia adentro que de verdad quedan a `d` de la orilla: cuando la masa es más angosta
 * que 2·d, `desplazar` deja un lazo invertido de basura en medio (un cuadrito), que aquí se descarta.
 */
function adentro(region: Punto[][], d: number): Punto[][][] {
  const lados = region.flatMap((a) => a.map((q, i) => [q, a[(i + 1) % a.length]] as const))
  const lejos = (q: Punto) => lados.every(([a, b]) => distanciaPuntoSegmento(q, a, b) >= d - 0.01)
  return desplazar(region, -d).filter((rg) => rg.every((anillo) => anillo.every(lejos)))
}

type Caja = ReturnType<typeof caja>
const cajasSeTocan = (a: Caja, b: Caja) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/**
 * El paso que une el pasillo de un anillo (el de un hueco) con los `destinos`: una franja de ancho A a escuadra con el
 * tramo, desde su mitad, barrida hacia el lado del pasillo hasta tocarlos. Se prueban los tramos del más largo al
 * más corto. null si ninguno llega.
 */
function pasoDesde(anillo: Punto[], A: number, destinos: Punto[][], alcance: number): Punto[] | null {
  const tramos = tramosDe(anillo)
    .map((t) => ({ t, l: acumulados(t)[t.length - 1] }))
    .filter((x) => x.l >= A)
    .sort((a, b) => b.l - a.l)
  for (const { t, l } of tramos.slice(0, 4)) {
    const acum = acumulados(t)
    const m0 = enLargo(t, acum, (l - A) / 2)
    const m1 = enLargo(t, acum, (l + A) / 2)
    const n = izquierda(resta(m1, m0))
    const paso = barrer([m0, m1, mas(m1, n, A), mas(m0, n, A)], n, destinos, alcance)
    if (paso) return paso
  }
  return null
}

/** El nombre de una entrada para los avisos. */
export function nombreEntrada(llave: string, llegadas: Llegada[]): string {
  const n = Number(llave.slice(1))
  if (llave[0] === 'r') return `La rampa ${n + 1}`
  if (llave[0] === 'c') return `El acceso ${n + 1}`
  return `La rampa que llega de «${llegadas[n]?.desde ?? 'otro nivel'}»`
}

/**
 * Los cajones y pasillos en circuito de una masa con `huecos` (pueden no tener: entonces es el circuito perimetral).
 * `obstaculos` son los de siempre menos los huecos (masas vecinas, núcleos, columnas). Las rampas propias, las que
 * llegan de otros niveles (`opciones.llegadas`) y los accesos desde la calle ocupan su lugar (§16.4): quitan solo los
 * cajones que pisan, cortan el pasillo que cruzan y, si su boca no da al pasillo, una liga la lleva hasta él.
 */
export function cajonesEnCircuito(
  poligono: Punto[],
  huecos: Punto[][],
  obstaculos: Punto[][],
  params: ParamsCajones,
  altura: number,
  opciones: OpcionesCajones = {},
): ResultadoCajones {
  const W = params.anchoCajon
  const L = params.largoCajon
  const enBateria = (params.anguloCajon ?? 90) < 90
  const unico = params.sentido === 'unico'
  // los cajones del circuito son a 90°: con el pasillo angosto de una batería o de sentido único no se podría entrar
  const A = enBateria || unico ? Math.max(params.anchoPasillo, PASILLO_90) : params.anchoPasillo
  const r = Math.max(0, params.retiro)
  const llegadas = opciones.llegadas ?? []
  const avisos: string[] = []
  if (enBateria) avisos.push(AVISO_CIRCUITO_BATERIA)

  const region = [poligono, ...huecos]
  // dónde caben: la masa (con su retiro) menos los huecos; los obstáculos se revisan aparte, solo los cercanos
  const base = r > 0 ? desplazar(region, -r) : [region]
  const frentes = adentro(region, r + L)

  const ent = armarEntradas(poligono, region, params, altura, opciones, A, avisos)
  const { entradas, cortar } = ent

  // El anillo de pasillo, junto a cada crujía. Con sentido único se circula siempre en el mismo giro (antihorario):
  // por la orilla exterior a lo largo del tramo y alrededor de un hueco al revés (su anillo va en el otro sentido).
  const pasillos: Punto[][] = []
  const sentidos: (Punto | null)[] = []
  const fijos = obstaculos.map((o) => ({ o, c: caja(o) }))
  let obstaculosEnPasillo = false
  /** Las piezas de calle sin el corte de las entradas: con ellas se decide qué tramos se unen (spec calles y cotas §4). */
  const previasDe: Punto[][] = []
  const ponerPasillo = (f: Punto[], rg: Punto[][], sentido: Punto | null) => {
    for (const pieza of interseccion(rg, [f])) {
      if (!pieza[0] || area(pieza[0]) <= 0.01) continue
      previasDe.push(pieza[0])
      const cp = caja(pieza[0])
      const cerca = fijos.filter((e) => cajasSeTocan(e.c, cp)).map((e) => e.o)
      if (cerca.length > 0 && areaRegiones(interseccion([pieza[0]], cerca)) > 0.01) obstaculosEnPasillo = true
      for (const q of cortar(pieza[0])) {
        pasillos.push(q)
        sentidos.push(sentido)
      }
    }
  }
  /** Las piezas del pasillo de cada anillo de los frentes (por región y anillo): para unir los anillos al final. */
  const piezasDe: number[][][] = frentes.map((rg) => rg.map(() => []))
  /**
   * Los tramos de un hueco cuya calle se quitó porque quedaba pegada o encimada a una anterior (spec calles y cotas §4),
   * por `región-anillo-tramo`; y las franjas sin recortar de cada anillo, para poner la crujía del hueco junto a la calle
   * que se quedó.
   */
  const unidos = new Set<string>()
  const franjasDe: { f: Punto[]; fi: number; ai: number }[] = []
  /** Las calles del acomodo, para editarlas a mano (spec calles y cotas §5): las del anillo, la retícula y los pasos. */
  const callesDer: CalleDerivada[] = []
  for (const [fi, rg] of frentes.entries())
    for (const [ai, anillo] of rg.entries()) {
      const desde = pasillos.length
      const giroAnillo = areaConSigno(anillo) >= 0 ? 1 : -1
      const tramos = tramosDe(anillo)
      // en un hueco, los tramos que ya no dejan lugar a su calle (las de los anillos anteriores ya están puestas). Se
      // decide con la geometría sola, sin las entradas: poner o mover una rampa nunca rehace el acomodo (§16.4); la que
      // queda partida por una rampa se mide como si no la cortara
      if (ai > 0) {
        const previas = previasDe.map((q) => ({ q, c: caja(q) }))
        tramos.forEach((t, ti) => {
          if (sinLugar(t, A, L, previas)) unidos.add(`${fi}-${ai}-${ti}`)
        })
      }
      const unido = (ti: number) => unidos.has(`${fi}-${ai}-${(ti + tramos.length) % tramos.length}`)
      // el pasillo, recortado a lo que hay entre las crujías (en una masa angosta no se sale); la esquina entre dos
      // tramos unidos tampoco va
      const quiebres = anillo.map((_, i) => i).filter((i) => giro(anillo, i) > QUIEBRE)
      anillo.forEach((_, i) => {
        const k = quiebres.indexOf(i)
        if (k >= 0 && unido(k) && unido(k - 1)) return
        const e = esquinaDe(anillo, i, A)
        if (e) ponerPasillo(e, rg, null)
      })
      tramos.forEach((t, ti) => {
        if (unido(ti)) return
        callesDer.push({ puntos: ejeDeTramo(anillo, t, A / 2), ancho: A })
        for (const f of franjasDeTramo(t, A)) {
          franjasDe.push({ f, fi, ai })
          const d = resta(f[1], f[0])
          const l = largo(d) || 1
          ponerPasillo(f, rg, unico ? { x: (giroAnillo * d.x) / l, y: (giroAnillo * d.y) / l } : null)
        }
      })
      for (let i = desde; i < pasillos.length; i++) piezasDe[fi][ai].push(i)
    }
  if (obstaculosEnPasillo) avisos.push(AVISO_CIRCUITO_OBSTACULOS)

  // La liga de cada boca que no da al pasillo (una rampa paralela en la crujía, una corta): la boca barrida hasta él.
  const { ligas, conectadas, lejos } = ligarEntradas(ent, region, base, pasillos, r + L + A + 2)
  for (const q of ligas) {
    pasillos.push(q)
    sentidos.push(null)
  }

  // Los cajones no pisan obstáculos, entradas ni ligas.
  const estorbos = [...obstaculos, ...estorbosDeEntradas(ent), ...ligas].map((o) => ({ o, c: caja(o) }))
  const todos: Punto[][] = []
  const cajas: Caja[] = []
  /** Un cajón entra si cae en `en`, no pisa un estorbo (ni una calle, con `fueraDeCalles`) y no se encima con otro. */
  let callesConCaja: { o: Punto[]; c: Caja }[] | null = null
  const poner = (c: Punto[], en: Punto[][][] = base, fueraDeCalles = false): boolean => {
    const cc = caja(c)
    const dentro = en.reduce((s, rg) => s + areaRegiones(interseccion(rg, [c])), 0)
    if (dentro < area(c) * (1 - TOLERANCIA)) return false
    if (estorbos.some((e) => cajasSeTocan(e.c, cc) && areaRegiones(interseccion([e.o], [c])) > 0.01)) return false
    if (fueraDeCalles) {
      callesConCaja ??= pasillos.map((o) => ({ o, c: caja(o) }))
      if (callesConCaja.some((e) => cajasSeTocan(e.c, cc) && areaRegiones(interseccion([e.o], [c])) > 0.05)) return false
    }
    if (cajas.some((k, j) => cajasSeTocan(k, cc) && areaRegiones(interseccion([todos[j]], [c])) > 0.05)) return false
    todos.push(c)
    cajas.push(cc)
    return true
  }
  // las crujías de las orillas, de espaldas a la orilla y de frente al circuito (salvo la de un tramo unido)
  for (const [fi, rg] of frentes.entries())
    for (const [ai, anillo] of rg.entries())
      tramosDe(anillo).forEach((t, ti) => {
        if (unidos.has(`${fi}-${ai}-${ti}`)) return
        for (const c of cajonesDeTramo(t, W, L)) poner(c)
      })
  // Lo que sobra entre los pasillos: si es delgado (no cabe una banda de retícula), otra crujía de frente al
  // circuito; si es grueso, la retícula de siempre, que da directo al circuito.
  const sinRampas: ParamsCajones = { ...params, retiro: 0, rampas: [], accesos: undefined }
  let angulo = 0
  for (const rg of adentro(region, r + L + A)) {
    if (area(rg[0]) - rg.slice(1).reduce((s, h) => s + area(h), 0) < RESTO_MIN) continue
    if (adentro(rg, L + A / 2).length === 0) {
      // los tramos al revés: los cajones van hacia adentro de lo que sobra, sin salirse de ahí (ni pisar el pasillo)
      for (const anillo of rg)
        for (const t of tramosDe(anillo)) for (const c of cajonesDeTramo([...t].reverse(), W, L)) poner(c, [rg])
      continue
    }
    const cerca = estorbos.filter((e) => cajasSeTocan(e.c, caja(rg[0]))).map((e) => e.o)
    const sub = calcularCajones(rg[0], [...rg.slice(1), ...cerca], sinRampas, altura, {
      ejes: opciones.ejes,
      sinAccesibles: true,
    })
    // con su caja: `poner` compara `cajas[j]` con `todos[j]` (revisión del PR #52: sin ella los índices se corrían)
    for (const c of sub.cajones) {
      todos.push(c)
      cajas.push(caja(c))
    }
    sub.pasillos.forEach((q, i) => {
      pasillos.push(q)
      sentidos.push(sub.sentidos?.[i] ?? null)
    })
    callesDer.push(...callesDePasillos(sub.pasillos))
    previasDe.push(...sub.pasillos)
    angulo = sub.angulo
  }

  // La crujía de un tramo unido da a la calle que se quedó: a lo largo de la orilla interior de esa calle (la que mira
  // al hueco), de frente a ella; lo que sobra entre su fondo y el hueco queda libre. Va después de la retícula de en
  // medio, para no pisar sus pasillos (revisión del PR #52), y solo en lo libre de esa orilla (fuera de otras calles),
  // con los cajones repartidos desde donde empieza lo libre.
  if (unidos.size > 0) {
    const usadas = new Set<number>()
    for (const [fi, rg] of frentes.entries())
      for (const [ai, anillo] of rg.entries())
        tramosDe(anillo).forEach((t, ti) => {
          if (!unidos.has(`${fi}-${ai}-${ti}`)) return
          for (const banda of franjasDeTramo(t, A + L)) {
            const cb = caja(banda)
            franjasDe.forEach((x, k) => {
              if (usadas.has(k) || x.fi !== fi || x.ai >= ai) return
              if (!cajasSeTocan(caja(x.f), cb) || areaRegiones(interseccion([x.f], [banda])) < 0.5) return
              usadas.add(k)
            })
          }
        })
    // las calles sin el corte de las rampas (las del anillo y las de la retícula de en medio): con las cortadas, una
    // rampa cambiaría dónde va esta crujía
    const calles = previasDe.map((q) => ({ q, c: caja(q) }))
    for (const k of [...usadas].sort((a, b) => a - b)) {
      const f = franjasDe[k].f
      for (const [a, b] of libresDeOrilla(f[2], f[3], base, calles))
        for (const c of cajonesDeTramo([a, b], W, L)) {
          // un cajón que no da a ninguna calle (la calle se recortó antes de llegar a él) no sirve
          if (!calles.some((x) => cajasSeTocan(x.c, cajaCon(caja(c), 0.7)) && seTocan(c, x.q))) continue
          poner(c, base, true)
        }
    }
  }

  // El pasillo alrededor de cada hueco se une con el de la orilla. Si lo que hay entre los dos no tiene pasillos (una
  // crujía doble) o la retícula de en medio no los toca, un paso a escuadra desde el tramo más largo del anillo del
  // hueco cruza hasta el otro y quita los cajones que pisa. Sin él, a los cajones del hueco no se llegaría.
  const pasos: Punto[][] = []
  for (const [fi, rg] of frentes.entries())
    for (let ai = 1; ai < rg.length; ai++) {
      const grupo = gruposDePasillos(pasillos)
      const exterior = new Set(piezasDe[fi][0].map((i) => grupo[i]))
      if (exterior.size === 0 || piezasDe[fi][ai].length === 0) continue
      if (piezasDe[fi][ai].some((i) => exterior.has(grupo[i]))) continue
      const paso = pasoDesde(rg[ai], A, pasillos.filter((_, i) => exterior.has(grupo[i])), 2 * (L + A) + 2)
      if (!paso) continue
      for (const b of base)
        for (const pieza of interseccion(b, [paso]))
          if (pieza[0])
            for (const q of cortar(pieza[0])) {
              pasos.push(q)
              pasillos.push(q)
              sentidos.push(null)
            }
      callesDer.push(...callesDePasillos([paso]))
    }
  if (pasos.length > 0) {
    const cp = pasos.map((q) => caja(q))
    const pisa = (c: Punto[]) => {
      const cc = caja(c)
      return pasos.some((q, k) => cajasSeTocan(cp[k], cc) && areaRegiones(interseccion([q], [c])) > 0.01)
    }
    for (let i = todos.length - 1; i >= 0; i--) if (pisa(todos[i])) todos.splice(i, 1)
  }

  // Una boca que no alcanzaba el anillo puede tocar un pasillo de la retícula de en medio: entonces sí llega.
  for (const llave of lejos)
    if (!conectadas.has(llave) && !entradas.some((e) => e.llave === llave && pasillos.some((q) => seTocan(e.boca, q))))
      avisos.push(`${nombreEntrada(llave, llegadas)} no llega al pasillo del circuito.`)

  const resultado = cerrarAcomodo(ent, params, todos, pasillos, sentidos, avisos, angulo, {
    vacio: AVISO_CIRCUITO_ANGOSTO,
    cortado: 'una rampa corta el pasillo del circuito',
  })
  return { ...resultado, calles: callesDer }
}

/** Las entradas de la masa (rampas, llegadas y accesos), armadas como en la retícula; las comparten circuito y calles. */
export interface EntradasArmadas {
  armadas: { poli: Punto[]; bocas: Punto[][]; alto: number[] }[]
  filas: { fila: Punto[]; caseta: Punto[] | null; flecha?: FlechaAcceso }[]
  llegadas: Llegada[]
  /** Las bocas por donde se llega a los pasillos (las ligas se suman al ligarlas). */
  entradas: EntradaCircuito[]
  /** Un pasillo menos lo que lo corta (la rampa, el hueco de la losa de una llegada, la caseta). */
  cortar(q: Punto[]): Punto[][]
  medidas: ReturnType<typeof medidaDeRampa>[]
  desnivel(k: number): number
}

/**
 * Las entradas armadas sobre la masa (la boca de la rampa tiene el fondo del pasillo `A`); avisa de las rampas que se
 * salen de la superficie.
 */
export function armarEntradas(
  poligono: Punto[],
  region: Punto[][],
  params: ParamsCajones,
  altura: number,
  opciones: OpcionesCajones,
  A: number,
  avisos: string[],
): EntradasArmadas {
  const llegadas = opciones.llegadas ?? []
  const lazo = poligono.map((q): Punto2 => [q.x, q.y])
  const aPunto = ([x, y]: Punto2): Punto => ({ x, y })
  const desnivel = (k: number) => opciones.desniveles?.[k] ?? altura
  const medidas = params.rampas.map((rp, k) => medidaDeRampa(rp, desnivel(k)))
  const armadas = params.rampas.map((rp, k) => {
    const q = puntoEnPerimetro(poligono, rp.t)
    const [poli, bocas, alto] = rampaSobre(lazo, [q.x, q.y], medidas[k], A)
    return { poli: poli.map(aPunto), bocas: bocas.map((b) => b.map(aPunto)), alto }
  })
  const filas = (params.accesos ?? []).map((a) => {
    const q = puntoEnPerimetro(poligono, a.t)
    const f = filaDeAcceso([lazo], [q.x, q.y], a, A)
    return { fila: f.fila.map(aPunto), caseta: f.caseta?.map(aPunto) ?? null, ...flechaDeAcceso(a) }
  })
  const entradas: EntradaCircuito[] = [
    ...armadas.flatMap((g, k) => g.bocas.map((boca) => ({ llave: `r${k}`, boca }))),
    ...llegadas.map((l, j) => ({ llave: `l${j}`, boca: l.boca })),
    ...filas.map((f, j) => ({ llave: `c${j}`, boca: f.fila })),
  ]
  armadas.forEach((g, k) => {
    const c = centroide(g.poli)
    const fuera = [g.poli, ...g.bocas].flat().some((q) => !puntoEnRegion(mas(q, resta(c, q), 0.01), region))
    if (fuera) avisos.push(`La rampa ${k + 1} se sale de la superficie; muévela.`)
  })
  // lo que corta el pasillo (por ahí no se maneja): la rampa, el hueco de la losa de una llegada y la caseta
  const cortes = [
    ...armadas.map((g) => g.poli),
    ...llegadas.map((l) => l.huella),
    ...filas.flatMap((f) => (f.caseta ? [f.caseta] : [])),
  ].map((o) => ({ o, c: caja(o) }))
  const cortar = (q: Punto[]): Punto[][] => {
    const cq = caja(q)
    const cerca = cortes.filter((k) => cajasSeTocan(k.c, cq) && areaRegiones(interseccion([k.o], [q])) > 0.01)
    if (cerca.length === 0) return [q]
    return diferencia([q], cerca.map((k) => k.o))
      .map((rg) => rg[0])
      .filter((p): p is Punto[] => !!p && area(p) > 0.5)
  }
  return { armadas, filas, llegadas, entradas, cortar, medidas, desnivel }
}

/**
 * Las ligas de las bocas que no dan a un pasillo: cada boca barrida hasta él, recortada a `base` y sin lo que la corta.
 * Suma a `ent.entradas` una entrada por pieza de liga (la liga lleva a su entrada aunque la boca quede fuera de la
 * masa). `lejos`: las que no alcanzan un pasillo a `alcance`.
 */
export function ligarEntradas(
  ent: EntradasArmadas,
  region: Punto[][],
  base: Punto[][][],
  pasillos: Punto[][],
  alcance: number,
): { ligas: Punto[][]; conectadas: Set<string>; lejos: Set<string> } {
  const ligas: Punto[][] = []
  const porLiga: EntradaCircuito[] = []
  const conectadas = new Set<string>()
  const lejos = new Set<string>()
  for (const e of ent.entradas) {
    const liga = ligaDeBoca(e.boca, region, pasillos, alcance)
    if (liga === 'lejos') {
      lejos.add(e.llave)
      continue
    }
    conectadas.add(e.llave)
    if (!liga) continue
    for (const rg of base)
      for (const pieza of interseccion(rg, [liga]))
        if (pieza[0])
          for (const q of ent.cortar(pieza[0])) {
            ligas.push(q)
            porLiga.push({ llave: e.llave, boca: q })
          }
  }
  ent.entradas.push(...porLiga)
  return { ligas, conectadas, lejos }
}

/** Lo que ocupan las entradas: los cajones no lo pisan. */
export function estorbosDeEntradas(ent: EntradasArmadas): Punto[][] {
  return [
    ...ent.llegadas.flatMap((l) => [l.huella, l.boca]),
    ...ent.armadas.flatMap((g) => [g.poli, ...g.bocas]),
    ...ent.filas.flatMap((f) => (f.caseta ? [f.fila, f.caseta] : [f.fila])),
  ]
}

/**
 * La red y el resultado: con entradas y «Exigir acceso», un cajón cuenta si su pasillo llega a alguna. `textos.vacio`
 * es el aviso sin cajones; `textos.cortado`, la causa de los que no llegan.
 */
export function cerrarAcomodo(
  ent: EntradasArmadas,
  params: ParamsCajones,
  todos: Punto[][],
  pasillos: Punto[][],
  sentidos: (Punto | null)[],
  avisos: string[],
  angulo: number,
  textos: { vacio: string; cortado: string },
): ResultadoCajones {
  const { armadas, filas, llegadas, entradas, medidas, desnivel } = ent
  const pisos = Math.max(1, Math.trunc(params.pisos))
  const porCajon = redDelCircuito(pasillos, entradas, todos)
  const cuentaTodos = !(entradas.length > 0 && params.exigirAcceso)
  const contado = porCajon.map((e) => cuentaTodos || e.length > 0)
  const cajones = todos.filter((_, i) => contado[i])
  const sinAcceso = todos.filter((_, i) => !contado[i])
  if (todos.length === 0) avisos.push(textos.vacio)
  else if (cajones.length === 0)
    avisos.push('Ningún cajón llega a la rampa; están todos sin acceso. Mueve la rampa o desactiva «Exigir acceso».')
  else if (sinAcceso.length > 0)
    avisos.push(
      `${sinAcceso.length === 1 ? 'Un cajón no llega' : `${sinAcceso.length} cajones no llegan`} a una rampa ni a un ` +
        `acceso: ${textos.cortado}. Muévela o desactiva «Exigir acceso».`,
    )
  const pendiente = medidas.length > 0 ? pendienteDeRampas(medidas, desnivel, avisos) : null
  return {
    cajones,
    sinAcceso,
    pasillos,
    rampas: [...armadas.map((g) => g.poli), ...armadas.flatMap((g) => g.bocas)],
    // una rampa que baja llega al nivel de abajo: su extremo alto queda en este piso y el otro abajo
    rampas3d: armadas.map((g, k) => ({
      puntos: g.poli.map((q, i) => {
        const z = g.alto[i] * desnivel(k)
        return { x: q.x, y: q.y, z: params.rampas[k].destino === 'abajo' ? -z : z }
      }),
    })),
    conteoPorPiso: cajones.length,
    conteo: cajones.length * pisos,
    angulo,
    pendiente,
    avisos,
    medidasRampas: medidas,
    ...(llegadas.length > 0 ? { llegadas } : {}),
    ...(filas.length > 0 ? { accesosCalle: filas } : {}),
    red: gruposDeRed(porCajon, contado),
    ...(params.sentido === 'unico' ? { sentidos } : {}),
  }
}
