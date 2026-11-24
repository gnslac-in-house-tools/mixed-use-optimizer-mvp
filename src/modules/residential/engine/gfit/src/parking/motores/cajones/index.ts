// Adaptador del motor de cajones: reemplaza la capa Rhino / Grasshopper de
// "gh files/estacionamiento.py" (líneas 880-1103). Recibe el polígono de la masa,
// los obstáculos y ParamsCajones; llama a `acomodar` y arma las salidas de la app.
import type { EjesEstructurales, FlechaAcceso, ParamsCajones, Punto } from '../../modelo/tipos'
import type { GiroFallido } from '../circulacion/giros'
import type { Llegada } from '../circulacion/llegadas'
import { avisosDeModulo, filasConEjes } from '../circulacion/reticula'
import { aBase, acomodar, medidasBateria, type Bateria, type Lazo, type Punto2 } from './acomodo'
import { conAccesibles } from './accesibles'
import {
  coordenadaV,
  faseParaPasillo,
  filaDeAcceso,
  flechaDeAcceso,
  largoCalculado,
  medidaDeRampa,
  pasilloDeRampa,
  type MedidaRampa,
} from './rampas'

export interface Punto3D {
  x: number
  y: number
  z: number
}

/** (app) Una zona del acomodo por zonas (spec circulaciones §5.1). */
export interface ZonaCajones {
  indice: number
  centro: Punto
  region: Punto[][]
  angulo: number
  conteo: number // por piso
  conSalida: boolean // llega a una rampa por sus pasillos y ligas (o la masa no tiene rampas)
}

export interface ResultadoCajones {
  cajones: Punto[][]
  sinAcceso: Punto[][]
  pasillos: Punto[][]
  rampas: Punto[][]
  rampas3d: { puntos: Punto3D[] }[]
  conteoPorPiso: number
  conteo: number
  angulo: number
  pendiente: number | null
  avisos: string[]
  zonas?: ZonaCajones[] // solo si la masa tiene zonas
  /** (app) Con zonas: los cajones por piso de la masa entera sin partir, para comparar. */
  porPisoSinZonas?: number
  /** (app) Las medidas de cada rampa (en el orden de los parámetros), con su largo y sus pendientes. */
  medidasRampas?: MedidaRampa[]
  /** (app) Las rampas de otros niveles que llegan a esta masa (spec circulaciones §6.3). */
  llegadas?: Llegada[]
  /**
   * (app) Los accesos desde la calle: su fila de espera y su caseta (spec circulaciones §6.4), y su flecha si no es la
   * de siempre (spec flechas de los accesos).
   */
  accesosCalle?: { fila: Punto[]; caseta: Punto[] | null; flecha?: FlechaAcceso }[]
  /** (app) Los grupos de cajones que comparten pasillos y a qué entradas llegan, para la red entre masas. */
  red?: ComponenteRed[]
  /** (app) Cajones que la red global dejó sin salida a la calle (ya restados del conteo). */
  sinSalida?: number
  /** (app) Los cajones accesibles (ya contados en `cajones`) y las franjas que ocupan cajones normales. */
  accesibles?: Punto[][]
  franjas?: Punto[][]
  /** (app) Las columnas de los ejes estructurales dentro de la masa (ya son obstáculos). */
  columnas?: Punto[][]
  /** (app) Las vueltas entre pasillos que no dan los radios de giro (solo informa). */
  giros?: GiroFallido[]
  /**
   * (app) Con sentido único: hacia dónde se circula en cada pasillo de `pasillos` (vector unitario), o null si es
   * de doble sentido (cruces y ligas).
   */
  sentidos?: (Punto | null)[]
  /**
   * (app) Las calles del acomodo (spec calles y cotas §5): su eje y su ancho. En automático salen de los pasillos (para
   * editarlas: la primera edición las copia a `ParamsCajones.calles`); con calles a mano, son las de la masa.
   */
  calles?: CalleDerivada[]
}

/** (app) Una calle del acomodo: su eje (polilínea abierta) y su ancho. */
export interface CalleDerivada {
  puntos: Punto[]
  ancho: number
}

/**
 * (app) Un grupo de cajones conectados por pasillos y las entradas que toca: `r{k}` rampa k de la masa, `l{j}`
 * llegada j, `c{j}` acceso desde la calle j, `z{n}` liga n entre zonas (`a{j}` dentro de una sola zona).
 * `cajones` y `sinAcceso` son índices en las listas del resultado.
 */
export interface ComponenteRed {
  entradas: string[]
  cajones: number[]
  sinAcceso: number[]
}

const PENDIENTE_MAX = 15.0 // % recomendado para rampas rectas de autos

/** (app) Lo que cambia cuando el acomodo corre por zonas (spec circulaciones §5.1). */
export interface OpcionesCajones {
  /** Puntos de las rampas en lugar de los de `t` sobre este polígono (la zona no es la masa). */
  rampaPuntos?: Punto[]
  /** Bocas sin rampa: los pasillos de liga con otras zonas. */
  accesos?: Punto[][]
  /** Ángulo de la zona en lugar del de los parámetros (null = buscar). */
  angulo?: number | null
  /**
   * Una franja (dentro del polígono) donde debe caer un pasillo: la liga paralela a la zona. Fija el desfase de
   * las bandas para que un pasillo coincida con ella; solo con un ángulo fijo.
   */
  pasilloEn?: Punto[]
  /** El desnivel que salva cada rampa (por omisión, la altura): la del nivel de abajo si la rampa baja. */
  desniveles?: number[]
  /** Rampas de otros niveles que llegan aquí: su huella no lleva cajones y su boca es un acceso. */
  llegadas?: Llegada[]
  /** Puntos de los accesos desde la calle en lugar de los de `t` sobre este polígono (la zona no es la masa). */
  accesoPuntos?: Punto[]
  /** Los núcleos de circulación vertical del nivel: los cajones accesibles van junto a ellos. */
  peatonales?: Punto[][]
  /** Sin el paso de cajones accesibles: quien llama lo aplica sobre el resultado final (zonas, red global). */
  sinAccesibles?: boolean
  /**
   * Los ejes estructurales, cuando la masa pone columnas en sus cruces: las filas corren con los ejes (si el ángulo
   * es «buscar») y sus fondos caen en los ejes, para que las columnas queden entre cajones espalda con espalda.
   */
  ejes?: EjesEstructurales
  /** Las rampas ya armadas sobre la masa (con zonas): rectángulo, bocas y alto de cada esquina, por rampa. */
  rampasArmadas?: { poli: Punto[]; bocas: Punto[][]; alto: number[] }[]
}

/** Punto sobre el perímetro (cerrado, desde el vértice 0) a la fracción t de su longitud. */
export function puntoEnPerimetro(poligono: Punto[], t: number): Punto {
  const n = poligono.length
  const lados: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = poligono[i]
    const b = poligono[(i + 1) % n]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    lados.push(l)
    total += l
  }
  if (total <= 0) return { x: poligono[0].x, y: poligono[0].y }
  let s = Math.min(1, Math.max(0, t)) * total
  for (let i = 0; i < n; i++) {
    if (s <= lados[i] || i === n - 1) {
      const a = poligono[i]
      const b = poligono[(i + 1) % n]
      const f = lados[i] > 0 ? Math.min(1, s / lados[i]) : 0
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
    }
    s -= lados[i]
  }
  return { x: poligono[0].x, y: poligono[0].y }
}

/**
 * (app) La pendiente más alta de las rampas con largo (null si ninguna lo tiene) y, en `avisos`, la de cada rampa que
 * pasa de la recomendada con el largo que haría falta.
 */
export function pendienteDeRampas(
  medidas: MedidaRampa[],
  desnivel: (k: number) => number,
  avisos: string[],
): number | null {
  const conLargo = medidas.filter((m) => m.largo > 0)
  if (conLargo.length === 0) return null
  medidas.forEach((m, k) => {
    if (!(m.largo > 0) || m.pendiente <= PENDIENTE_MAX) return
    const cual = medidas.length > 1 ? `de la rampa ${k + 1}` : 'de la rampa'
    avisos.push(
      `La pendiente ${cual} es ${m.pendiente.toFixed(1)} % (más de ${PENDIENTE_MAX.toFixed(0)} %); ` +
        `con altura ${Math.abs(desnivel(k)).toFixed(2)} hace falta un largo de ` +
        `${largoCalculado(desnivel(k), PENDIENTE_MAX / 100.0, m.transicion).toFixed(1)}.`,
    )
  })
  return Math.max(...conLargo.map((m) => m.pendiente))
}

function vacio(avisos: string[]): ResultadoCajones {
  return {
    cajones: [],
    sinAcceso: [],
    pasillos: [],
    rampas: [],
    rampas3d: [],
    conteoPorPiso: 0,
    conteo: 0,
    angulo: 0,
    pendiente: null,
    avisos,
  }
}

export function calcularCajones(
  poligono: Punto[],
  obstaculos: Punto[][],
  params: ParamsCajones,
  altura: number,
  opciones: OpcionesCajones = {},
): ResultadoCajones {
  if (poligono.length < 3) {
    return vacio(['El contorno necesita al menos 3 vértices para acomodar cajones.'])
  }
  // (app) Con columnas y ángulo «buscar», las filas corren en una de las dos direcciones de los ejes: la que da más
  // cajones (sin una rampa alineada a pasillo, que manda su propio ángulo).
  const anguloPedido = opciones.angulo !== undefined ? opciones.angulo : params.angulo
  if (opciones.ejes && anguloPedido === null && !params.rampas.some((rp) => rp.alineacion === 'pasillo')) {
    const [a, b] = [opciones.ejes.angulo, opciones.ejes.angulo + 90].map((g) =>
      calcularCajones(poligono, obstaculos, params, altura, { ...opciones, angulo: ((g % 180) + 180) % 180 }),
    )
    return b.conteoPorPiso > a.conteoPorPiso ? b : a
  }

  const W = params.anchoCajon
  const L = params.largoCajon
  const A = params.anchoPasillo
  // (app) cajones en batería: el módulo de las bandas usa el fondo de la fila y el paso del cajón inclinado
  const bateria: Bateria | undefined =
    (params.anguloCajon ?? 90) < 90 || params.sentido === 'unico'
      ? { angulo: params.anguloCajon ?? 90, unico: params.sentido === 'unico' }
      : undefined
  const mb = medidasBateria(W, L, params.anguloCajon ?? 90)
  const Lf = mb.fondo
  const Wp = mb.paso
  const r = Math.max(0, params.retiro)
  const cruceN = Math.max(0, Math.trunc(params.cruceCada))
  const pisos = Math.max(1, Math.trunc(params.pisos))
  if (!(W > 0) || !(L > 0) || !(A > 0)) {
    return vacio(['El ancho del cajón, el largo del cajón y el pasillo deben ser mayores que cero.'])
  }

  // Como en la capa Rhino, se trabaja en un marco local centrado en el promedio
  // de los vértices (plano_de) y al final se regresa al marco del proyecto.
  const ox = poligono.reduce((s, p) => s + p.x, 0) / poligono.length
  const oy = poligono.reduce((s, p) => s + p.y, 0) / poligono.length
  const aLocal = (p: Punto): Punto2 => [p.x - ox, p.y - oy]
  const aProyecto = ([u, v]: Punto2): Punto => ({ x: u + ox, y: v + oy })

  const borde: Lazo[] = [poligono.map(aLocal)]
  const llegadas = opciones.llegadas ?? []
  const ligas = (opciones.accesos ?? []).filter((a) => a.length >= 3) // bocas sin rampa: ligas entre zonas
  const obst: Lazo[] = [...obstaculos, ...llegadas.map((l) => l.huella)]
    .filter((o) => o.length >= 3)
    .map((o) => o.map(aLocal))

  const rampasPrm = params.rampas
  const rampaPts = (opciones.rampaPuntos ?? rampasPrm.map((rp) => puntoEnPerimetro(poligono, rp.t))).map(aLocal)
  // (app) Cada rampa con su medida; el largo null se calcula con la pendiente, las transiciones y la altura.
  const desnivel = (k: number) => opciones.desniveles?.[k] ?? altura
  const medidas = rampasPrm.map((rp, k) => medidaDeRampa(rp, desnivel(k)))
  const primera = medidas[0]
  const rampaAncho = primera ? primera.ancho : 3.5
  const rampaLargo = primera ? primera.largo : 20.0
  const rampaParalela = primera ? primera.paralela : true
  const hayRampas = rampaPts.length > 0
  // con rampas propias o llegadas de otro nivel, el acceso se exige desde ellas
  const calle = params.accesos ?? []
  const callePts = (opciones.accesoPuntos ?? calle.map((a) => puntoEnPerimetro(poligono, a.t))).map(aLocal)
  const filas = calle.map((a, j) => filaDeAcceso(borde, callePts[j], a, A))
  for (const f of filas) if (f.caseta) obst.push(f.caseta)
  const hayEntradas = hayRampas || llegadas.length > 0 || calle.length > 0
  const avisos: string[] = []

  let angulo = opciones.angulo !== undefined ? opciones.angulo : params.angulo
  let fasesFijas: { v?: number[]; cruces?: { inicio: number; paso: number } } = {}
  // (app) Una rampa alineada a pasillo manda (spec circulaciones §6.2): las filas corren en su dirección y un
  // pasillo pasa por su eje, para que la boca dé de frente a un pasillo. Si hay varias, manda la primera.
  const armadas = (opciones.rampasArmadas ?? []).map(
    (g): [Lazo, Lazo[], number[]] => [g.poli.map(aLocal), g.bocas.map((b) => b.map(aLocal)), g.alto],
  )
  const alineadas = rampasPrm.flatMap((rp, k) => (rp.alineacion === 'pasillo' && rampaPts[k] ? [k] : []))
  if (alineadas.length > 0) {
    const k = alineadas[0]
    const pide = pasilloDeRampa(borde, rampaPts[k], medidas[k], A, armadas[k]?.[0])
    const ang = pide.angulo
    angulo = ang
    fasesFijas = { v: [faseParaPasillo(borde, ang, pide.v0, Lf, A)] }
    for (const j of alineadas.slice(1)) {
      const dif = Math.abs(pasilloDeRampa(borde, rampaPts[j], medidas[j], A, armadas[j]?.[0]).angulo - ang) % 180
      if (Math.min(dif, 180 - dif) > 1)
        avisos.push(`La rampa ${j + 1} no queda alineada a un pasillo: manda la rampa ${k + 1}.`)
    }
  } else if (opciones.pasilloEn && opciones.pasilloEn.length >= 3 && angulo !== null) {
    const v0 = Math.min(...opciones.pasilloEn.map(aLocal).map((q) => coordenadaV(q, angulo!)))
    fasesFijas = { v: [faseParaPasillo(borde, angulo, v0, Lf, A)] }
  } else if (opciones.ejes && angulo !== null && filasConEjes(opciones.ejes, angulo)) {
    // (app) Con columnas: primero se prueba el desfase con el fondo de una fila en un eje (el del origen, que es de
    // los dos sentidos), así las columnas quedan entre cajones espalda con espalda y gana en un empate; luego los
    // desfases de siempre, que esquivan las columnas como obstáculos.
    const v = coordenadaV(aLocal(opciones.ejes.origen), angulo)
    fasesFijas = { v: [faseParaPasillo(borde, angulo, v + Lf, Lf, A), ...Array.from({ length: 8 }, (_, i) => i / 8)] }
  }
  if (opciones.ejes && angulo !== null) {
    // (app) Con columnas, cada cruce entre pasillos cae dentro de una crujía (de columna a columna), cada tantas
    // crujías como pide «Cruce cada»: si no, la línea de columnas lo corta y no se crea.
    const e = opciones.ejes
    const f = filasConEjes(e, angulo)
    if (f && cruceN > 0) {
      if (A <= f.paso - f.columna + 1e-9) {
        const a = (angulo * Math.PI) / 180
        const o = aLocal(e.origen)
        const u0 = o[0] * Math.cos(a) + o[1] * Math.sin(a)
        const cada = Math.max(1, Math.round((cruceN * Wp + mb.sesgo + A) / f.paso))
        fasesFijas = { ...fasesFijas, cruces: { inicio: u0 + (f.paso - A) / 2, paso: cada * f.paso } }
      } else {
        avisos.push(
          `El pasillo de ${A.toFixed(2)} m no cabe entre columnas a ${f.paso.toFixed(2)} m: ` +
            'los cruces chocan con ellas y no se crean.',
        )
      }
    }
    avisos.push(...avisosDeModulo(e, angulo, Wp, 2 * Lf + A, mb.sesgo))
  }
  const res = acomodar(
    borde,
    obst,
    rampaPts,
    W,
    L,
    A,
    r,
    cruceN,
    rampaAncho,
    rampaLargo,
    rampaParalela,
    angulo,
    params.cabeceras,
    [
      ...ligas.map((a) => a.map(aLocal)),
      ...llegadas.map((l) => l.boca.map(aLocal)),
      ...filas.map((f) => f.fila),
    ],
    fasesFijas,
    medidas.map((m, k) => (armadas[k] ? { ...m, fija: armadas[k] } : m)),
    bateria,
  )
  const ang = res.angulo
  const rectangulo = (u1: number, u2: number, v1: number, v2: number): Punto[] =>
    ([[u1, v1], [u2, v1], [u2, v2], [u1, v2]] as Punto2[]).map(([u, v]) => aProyecto(aBase(u, v, ang)))

  const cuentaTodos = !(hayEntradas && params.exigirAcceso)
  const cajones: Punto[][] = []
  const sinAcceso: Punto[][] = []
  // la llave de cada boca, en el orden en que acomodar las recibe: rampas (la paralela tiene dos), ligas,
  // llegadas y accesos desde la calle
  const llaves = [
    ...medidas.flatMap((m, k) => (rampaPts[k] ? (m.paralela ? [`r${k}`, `r${k}`] : [`r${k}`]) : [])),
    ...ligas.map((_, j) => `a${j}`),
    ...llegadas.map((_, j) => `l${j}`),
    ...filas.map((_, j) => `c${j}`),
  ]
  const contados = res.cajones.map((_, i) => res.acceso[i] || cuentaTodos)
  const grupos = new Map<string, ComponenteRed>()
  res.cajones.forEach((c, i) => {
    const forma = res.formas?.[i]
    const crv = forma ? forma.map(([u, v]) => aProyecto(aBase(u, v, ang))) : rectangulo(c[0], c[1], c[2], c[3])
    const contado = contados[i]
    if (contado) cajones.push(crv)
    else sinAcceso.push(crv)
    const entradas = [...new Set((res.alcanzables?.[i] ?? []).map((m) => llaves[m]))].sort()
    const firma = entradas.join(' ')
    const g = grupos.get(firma) ?? { entradas, cajones: [], sinAcceso: [] }
    if (contado) g.cajones.push(cajones.length - 1)
    else g.sinAcceso.push(sinAcceso.length - 1)
    grupos.set(firma, g)
  })
  const pasillos = [...res.pasillos, ...res.cruces].map((p) => rectangulo(p[0], p[1], p[2], p[3]))
  // (app) el sentido de cada pasillo, como vector en el marco del proyecto; los cruces son de doble sentido
  const haciaU = (s: number): Punto => {
    const [a, b] = [aBase(0, 0, ang), aBase(s, 0, ang)]
    return { x: b[0] - a[0], y: b[1] - a[1] }
  }
  const sentidos = res.sentidos ? [...res.sentidos.map(haciaU), ...res.cruces.map(() => null)] : undefined
  if ((res.ciegos ?? 0) > 0)
    avisos.push(
      `${res.ciegos === 1 ? 'Un pasillo' : `${res.ciegos} pasillos`} de sentido único sin entrada y salida: ` +
        'hace falta un cruce o una boca en cada extremo de sus cajones («Cruce cada», «Cabeceras»).',
    )
  const rampas = [...res.rampas, ...res.bocas].map((lp) => lp.map(aProyecto))
  // una rampa que baja llega al nivel de abajo: su extremo alto queda en este piso y el otro abajo
  const rampas3d = res.rampas.map((rp, k) => ({
    puntos: rp.map(([u, v], i): Punto3D => {
      const p = aProyecto([u, v])
      const h = desnivel(k)
      const z = rampasPrm[k]?.destino === 'abajo' ? -res.rampas_alto[k][i] * h : res.rampas_alto[k][i] * h
      return { x: p.x, y: p.y, z }
    }),
  }))

  if (res.cajones.length === 0) {
    avisos.push('No cupo ningún cajón; revisa las medidas, el retiro y los obstáculos.')
  } else if (cajones.length === 0) {
    avisos.push(
      'Ningún cajón llega a la rampa; están todos sin acceso. Mueve la rampa o desactiva «Exigir acceso».',
    )
  }
  if (res.componentes > 1 && !hayEntradas) {
    avisos.push(`${res.componentes} grupos de pasillos sin conectar; prueba «Cruce cada».`)
  }
  avisos.push(...res.avisos)

  const pendiente = hayRampas ? pendienteDeRampas(medidas, desnivel, avisos) : null

  const resultado: ResultadoCajones = {
    cajones,
    sinAcceso,
    pasillos,
    rampas,
    rampas3d,
    conteoPorPiso: cajones.length,
    conteo: cajones.length * pisos,
    angulo: ang,
    pendiente,
    avisos,
    medidasRampas: medidas,
    ...(llegadas.length > 0 ? { llegadas } : {}),
    ...(filas.length > 0
      ? {
          accesosCalle: filas.map((f, j) => ({
            fila: f.fila.map(aProyecto),
            caseta: f.caseta?.map(aProyecto) ?? null,
            ...flechaDeAcceso(calle[j]),
          })),
        }
      : {}),
    red: [...grupos.values()],
    ...(sentidos ? { sentidos } : {}),
  }
  return opciones.sinAccesibles ? resultado : conAccesibles(resultado, params, opciones.peatonales)
}
