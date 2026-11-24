// Port 1:1 de "gh files/estacionamiento.py", líneas 85-667 (de _aristas a agrupar_areas).
// Mismos nombres sin el guion bajo inicial y en camelCase. Los puntos son [x, y]
// (tuplas) como en Python. Las funciones conservan el orden de iteración y las
// comparaciones del original para que el resultado coincida con el de Grasshopper.
//
// Ojo: igual que en Python, `acomodar` devuelve los cajones y pasillos como
// rectángulos [u1, u2, v1, v2, ...] en el marco girado del acomodo (la capa Rhino
// los pasa al plano con `aBase`); las rampas y bocas sí vienen en el marco original.

export type Punto2 = [number, number]
export type Lazo = Punto2[]
export type Arista = [number, number, number, number] // x1, y1, x2, y2
export type Intervalo = [number, number]
export type Grupo = [number, number, Arista[]] // (y mínima, y máxima, aristas)
export type Punto3 = [number, number, number]
export type Plano = [Punto3, Punto3, Punto3, Punto3] // origen, ex, ey, ez

// ---- utilidades que Python trae de fábrica ----------------------------------

/** `round(x)` de Python 3: redondeo bancario (la mitad va al entero par). */
function redondeaPar(x: number): number {
  const f = Math.floor(x)
  const d = x - f
  if (d < 0.5) return f
  if (d > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

/** `a % b` de Python en flotantes: el resultado lleva el signo de `b`. */
function modulo(a: number, b: number): number {
  let r = a % b
  if (r !== 0 && r < 0 !== b < 0) r += b
  return r
}

const RAD_A_GRADOS = 180.0 / Math.PI // math.degrees
const GRADOS_A_RAD = Math.PI / 180.0 // math.radians
const grados = (x: number) => x * RAD_A_GRADOS
const radianes = (x: number) => x * GRADOS_A_RAD

/** Comparación lexicográfica de tuplas de Python: a > b. */
function tuplaMayor(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

function minimo(xs: number[]): number {
  let m = xs[0]
  for (let i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i]
  return m
}

function maximo(xs: number[]): number {
  let m = xs[0]
  for (let i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i]
  return m
}

// =============================================================================
// NÚCLEO 2D
// =============================================================================

/** Lazos [[(x, y), ...], ...] -> aristas [(x1, y1, x2, y2), ...]. */
export function aristas(lazos: Lazo[]): Arista[] {
  const out: Arista[] = []
  for (const lp of lazos) {
    const n = lp.length
    for (let i = 0; i < n; i++) {
      const [x1, y1] = lp[i]
      const [x2, y2] = lp[(i + 1) % n]
      if (x1 !== x2 || y1 !== y2) {
        out.push([x1, y1, x2, y2])
      }
    }
  }
  return out
}

/** Pasa lazos al marco girado `ang` (radianes). */
export function rotar(lazos: Lazo[], ang: number): Lazo[] {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return lazos.map((lp) => lp.map(([x, y]): Punto2 => [x * c + y * s, -x * s + y * c]))
}

export function transponer(ars: Arista[]): Arista[] {
  return ars.map(([x1, y1, x2, y2]): Arista => [y1, x1, y2, x2])
}

/** Obstáculo con su rango en y, para descartarlo rápido por franja. */
export function grupo(ars: Arista[]): Grupo {
  const ys = ars.map((a) => a[1]).concat(ars.map((a) => a[3]))
  return [minimo(ys), maximo(ys), ars]
}

/** Intervalos en x dentro de la región (par-impar) sobre la recta y. */
export function dentro(ars: Arista[], y: number): Intervalo[] {
  const xs: number[] = []
  for (const [x1, y1, x2, y2] of ars) {
    if (y1 > y !== y2 > y) {
      xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
  }
  xs.sort((a, b) => a - b)
  const out: Intervalo[] = []
  for (let i = 0; i < xs.length - 1; i += 2) out.push([xs[i], xs[i + 1]])
  return out
}

/** Intervalos en x que ocupan las aristas dentro de la franja (ya, yb). */
export function proyeccion(ars: Arista[], ya: number, yb: number): Intervalo[] {
  const out: Intervalo[] = []
  for (const [x1, y1, x2, y2] of ars) {
    const lo = y1 < y2 ? y1 : y2
    const hi = y1 < y2 ? y2 : y1
    if (hi <= ya || lo >= yb) {
      continue
    }
    if (hi - lo < 1e-12) {
      out.push([Math.min(x1, x2), Math.max(x1, x2)])
      continue
    }
    const ta = (ya - y1) / (y2 - y1)
    const tb = (yb - y1) / (y2 - y1)
    const t0 = Math.max(0.0, Math.min(ta, tb))
    const t1 = Math.min(1.0, Math.max(ta, tb))
    const xa = x1 + t0 * (x2 - x1)
    const xb = x1 + t1 * (x2 - x1)
    out.push([Math.min(xa, xb), Math.max(xa, xb)])
  }
  return out
}

/** Unión de intervalos (sorted de tuplas: por inicio y luego por fin). */
export function union(ints: Intervalo[]): Intervalo[] {
  const out: Intervalo[] = []
  const orden = [...ints].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  for (const [a, b] of orden) {
    if (out.length > 0 && a <= out[out.length - 1][1]) {
      if (b > out[out.length - 1][1]) {
        out[out.length - 1] = [out[out.length - 1][0], b]
      }
    } else {
      out.push([a, b])
    }
  }
  return out
}

/** libres menos bloqueos (bloqueos ya unidos y ordenados). */
export function resta(libres: Intervalo[], bloqueos: Intervalo[]): Intervalo[] {
  const out: Intervalo[] = []
  for (const [a, b] of libres) {
    let cur = a
    for (const [c, d] of bloqueos) {
      if (d <= cur) {
        continue
      }
      if (c >= b) {
        break
      }
      if (c > cur) {
        out.push([cur, c])
      }
      cur = Math.max(cur, d)
      if (cur >= b) {
        break
      }
    }
    if (cur < b) {
      out.push([cur, b])
    }
  }
  return out
}

export function interseca(A: Intervalo[], B: Intervalo[]): Intervalo[] {
  const out: Intervalo[] = []
  let i = 0
  let j = 0
  while (i < A.length && j < B.length) {
    const a = Math.max(A[i][0], B[j][0])
    const b = Math.min(A[i][1], B[j][1])
    if (b > a) {
      out.push([a, b])
    }
    if (A[i][1] < B[j][1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return out
}

/** Intervalos en x donde el rectángulo [x] x [ya, yb] cabe completo
 * dentro de la región, fuera de los obstáculos y a `r` de todo. */
export function libre(
  borde: Arista[],
  obstaculos: Grupo[],
  ya: number,
  yb: number,
  r: number,
  eps: number,
): Intervalo[] {
  const lo = ya - r + eps
  const hi = yb + r - eps
  const ym = 0.5 * (ya + yb)
  let libres = dentro(borde, ym)
  if (libres.length === 0) {
    return []
  }
  const bloq = proyeccion(borde, lo, hi)
  for (const [gLo, gHi, g] of obstaculos) {
    if (gHi <= lo || gLo >= hi) {
      continue
    }
    bloq.push(...dentro(g, ym))
    bloq.push(...proyeccion(g, lo, hi))
  }
  libres = resta(libres, union(bloq))
  if (r > 0) {
    libres = libres.filter(([a, b]) => b - a > 2 * r).map(([a, b]): Intervalo => [a + r, b - r])
  }
  return libres.filter(([a, b]) => b - a > eps)
}

export function puntoDentro(ars: Arista[], x: number, y: number): boolean {
  let c = false
  for (const [x1, y1, x2, y2] of ars) {
    if (y1 > y !== y2 > y) {
      if (x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) {
        c = !c
      }
    }
  }
  return c
}

/** Rampa pegada a la orilla más cercana a (px, py).
 *
 * Devuelve (rampa, bocas, alto): el rectángulo de la rampa, las zonas de
 * maniobra que no llevan cajones y, por esquina de la rampa, 0 si queda a
 * nivel del piso o 1 si queda a la altura del otro nivel. */
export function rampa(
  aristasBorde: Arista[],
  px: number,
  py: number,
  ancho: number,
  largo: number,
  profBoca: number,
  paralela: boolean,
): [Lazo, Lazo[], number[]] {
  let mejor: [number, number, number, number, number, number, number] | null = null
  for (const [x1, y1, x2, y2] of aristasBorde) {
    const dx = x2 - x1
    const dy = y2 - y1
    const l2 = dx * dx + dy * dy
    const t = Math.max(0.0, Math.min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    const qx = x1 + t * dx
    const qy = y1 + t * dy
    const d = (px - qx) ** 2 + (py - qy) ** 2
    if (mejor === null || d < mejor[0]) {
      mejor = [d, qx, qy, x1, y1, x2, y2]
    }
  }
  const [, qx, qy, x1, y1, x2, y2] = mejor!
  const l = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  let tx = (x2 - x1) / l
  let ty = (y2 - y1) / l
  let [nx, ny] = [-ty, tx]
  const prueba = 0.01 * ancho
  if (!puntoDentro(aristasBorde, qx + nx * prueba, qy + ny * prueba)) {
    ;[nx, ny] = [-nx, -ny]
  }

  const rect = (
    o: Punto2,
    ex: number,
    ey: number,
    a0: number,
    a1: number,
    fx: number,
    fy: number,
    b0: number,
    b1: number,
  ): Lazo => [
    [o[0] + ex * a0 + fx * b0, o[1] + ey * a0 + fy * b0],
    [o[0] + ex * a1 + fx * b0, o[1] + ey * a1 + fy * b0],
    [o[0] + ex * a1 + fx * b1, o[1] + ey * a1 + fy * b1],
    [o[0] + ex * a0 + fx * b1, o[1] + ey * a0 + fy * b1],
  ]

  let rampaPol: Lazo
  let bocas: Lazo[]
  let alto: number[]
  if (paralela) {
    // corre hacia el lado de la orilla con más longitud libre
    const restoMas = Math.sqrt((x2 - qx) ** 2 + (y2 - qy) ** 2)
    if (restoMas < l * 0.5) {
      ;[tx, ty] = [-tx, -ty]
    }
    rampaPol = rect([qx, qy], tx, ty, 0.0, largo, nx, ny, 0.0, ancho)
    // sale en el punto; en el otro extremo llega la rampa del nivel vecino,
    // que en una planta repetida cae justo encima
    bocas = [
      rect([qx, qy], tx, ty, -profBoca, 0.0, nx, ny, 0.0, ancho),
      rect([qx, qy], tx, ty, largo, largo + profBoca, nx, ny, 0.0, ancho),
    ]
    alto = [0, 1, 1, 0]
  } else {
    const h = ancho * 0.5
    rampaPol = rect([qx, qy], tx, ty, -h, h, nx, ny, 0.0, largo)
    // entra desde la orilla (la calle) y desemboca en el extremo interior
    bocas = [rect([qx, qy], tx, ty, -h, h, nx, ny, largo, largo + profBoca)]
    alto = [1, 1, 0, 0]
  }
  return [rampaPol, bocas, alto]
}

export class UF {
  p: number[]

  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i)
  }

  raiz(i: number): number {
    const p = this.p
    while (p[i] !== i) {
      p[i] = p[p[i]]
      i = p[i]
    }
    return i
  }

  une(a: number, b: number): void {
    a = this.raiz(a)
    b = this.raiz(b)
    if (a !== b) {
      this.p[b] = a
    }
  }
}

/** Geometría girada al marco del acomodo. */
export interface Preparada {
  borde: Arista[]
  borde_T: Arista[]
  obst_todo: Grupo[]
  obst_todo_T: Grupo[]
  obst_fila: Grupo[]
  cajas_boca: [number, number, number, number][] // umin, umax, vmin, vmax
  umin: number
  umax: number
  vmin: number
  vmax: number
  eps: number
}

export function preparar(
  bordeLazos: Lazo[],
  obstLazos: Lazo[],
  rampas: Lazo[],
  bocas: Lazo[],
  ang: number,
  eps: number,
): Preparada {
  const borde = aristas(rotar(bordeLazos, ang))
  let todo = obstLazos.concat(rampas).map((lp) => aristas(rotar([lp], ang)))
  todo = todo.filter((g) => g.length > 0)
  const obstTodo = todo.map((g) => grupo(g))
  const obstCajon = bocas.map((lp) => grupo(aristas(rotar([lp], ang))))
  const cajasBoca: [number, number, number, number][] = []
  for (const lp of rotar(bocas, ang)) {
    const xs = lp.map((p) => p[0])
    const ys = lp.map((p) => p[1])
    cajasBoca.push([minimo(xs), maximo(xs), minimo(ys), maximo(ys)])
  }
  const xs = borde.map((a) => a[0]).concat(borde.map((a) => a[2]))
  const ys = borde.map((a) => a[1]).concat(borde.map((a) => a[3]))
  return {
    borde,
    borde_T: transponer(borde),
    obst_todo: obstTodo,
    obst_todo_T: todo.map((g) => grupo(transponer(g))),
    obst_fila: obstTodo.concat(obstCajon),
    cajas_boca: cajasBoca,
    umin: minimo(xs),
    umax: maximo(xs),
    vmin: minimo(ys),
    vmax: maximo(ys),
    eps,
  }
}

/** Un acomodo con desfases dados. Todo en el marco girado. */
export interface Distribucion {
  cajones: [number, number, number, number, number][] // u1, u2, v1, v2, id de pasillo
  acceso: boolean[]
  pasillos: [number, number, number, number][]
  cruces: [number, number, number, number][]
  componentes: number
  alcanzables?: number[][] // (app) por cajón, las bocas (índices de G.cajas_boca) de su componente
  /** (app) Con cajones en batería: el paralelogramo de cada cajón (en el marco girado). */
  formas?: Punto2[][]
  /** (app) Con sentido único: el sentido de cada pasillo de `pasillos` (+1 hacia u creciente, −1 al revés). */
  sentidos?: number[]
  /** (app) Con sentido único: pasillos con cajones y menos de dos conexiones (sin entrada y salida). */
  ciegos?: number
}

/**
 * (app) Cajones en batería y sentido de circulación (spec circulaciones §5.5). `angulo` es el del cajón con el
 * pasillo (90, 60 o 45). Con sentido único los pasillos vecinos alternan su sentido y los cajones de cada banda se
 * inclinan hacia el suyo.
 */
export interface Bateria {
  angulo: number
  unico: boolean
}

/** (app) Fondo de la fila y paso a lo largo del pasillo de un cajón W × L a `angulo` grados del pasillo. */
export function medidasBateria(W: number, L: number, angulo: number): { fondo: number; paso: number; sesgo: number } {
  if (!(angulo > 0) || angulo >= 90) return { fondo: L, paso: W, sesgo: 0 }
  const a = radianes(angulo)
  const fondo = L * Math.sin(a) + W * Math.cos(a)
  return { fondo, paso: W / Math.sin(a), sesgo: fondo / Math.tan(a) }
}

type Banda = [Intervalo, Intervalo, Intervalo, number[]] // fila1, pasillo, fila2, ids de pasillo
type Cruce = [number, number, number, number, number[]]

export function distribuir(
  G: Preparada,
  W: number,
  L: number,
  A: number,
  r: number,
  faseV: number,
  cruceN: number,
  faseU: number,
  cabeceras: boolean,
  crucesEn?: { inicio: number; paso: number }, // (app) cruces en u = inicio + k·paso (entre columnas)
  bateria?: Bateria, // (app) cajones inclinados y sentido único
): Distribucion {
  const eps = G.eps
  // (app) en batería la fila es más honda o menos y el paso a lo largo del pasillo es más largo; a 90°, lo de siempre
  const mb = medidasBateria(W, L, bateria?.angulo ?? 90)
  const unico = !!bateria?.unico
  W = mb.paso
  L = mb.fondo
  const P = 2 * L + A
  const pasillos: [number, number, number, number][] = [] // [u1, u2, v1, v2]
  const sentidoDe: number[] = [] // (app) por pasillo
  const bandas: Banda[] = []
  let base = G.vmin - P + faseV * P
  const largoMin = Math.min(W, A) - eps
  while (base < G.vmax) {
    const f1: Intervalo = [base, base + L]
    const ps: Intervalo = [base + L, base + L + A]
    const f2: Intervalo = [base + L + A, base + P]
    if (ps[1] > G.vmin && ps[0] < G.vmax) {
      const ids: number[] = []
      for (const [a, b] of libre(G.borde, G.obst_todo, ps[0], ps[1], r, eps)) {
        if (b - a >= largoMin) {
          ids.push(pasillos.length)
          pasillos.push([a, b, ps[0], ps[1]])
        }
      }
      if (ids.length > 0) {
        bandas.push([f1, ps, f2, ids])
        // (app) con sentido único, los pasillos vecinos alternan su sentido
        for (const i of ids) sentidoDe[i] = unico && bandas.length % 2 === 0 ? -1 : 1
      }
    }
    base += P
  }

  const nBocas = G.cajas_boca.length
  const uf = new UF(pasillos.length + nBocas)

  // cruces: unen pasillos consecutivos a través de las filas
  const cruces: Cruce[] = [] // [u1, u2, v1, v2, [ids]]
  if (cruceN > 0 && pasillos.length > 0) {
    // (app) en batería, los cruceN cajones de un tramo ocupan también el corrimiento de su fondo
    const pc = crucesEn ? crucesEn.paso : cruceN * W + mb.sesgo + A
    let uc = crucesEn
      ? crucesEn.inicio - Math.ceil((crucesEn.inicio - (G.umin - pc)) / pc) * pc
      : G.umin - pc + faseU * pc + cruceN * W + mb.sesgo
    while (uc < G.umax) {
      if (uc + A > G.umin) {
        for (const [va, vb] of libre(G.borde_T, G.obst_todo_T, uc, uc + A, r, eps)) {
          const con: number[] = []
          pasillos.forEach((p, i) => {
            if (
              p[2] >= va - eps &&
              p[3] <= vb + eps &&
              Math.min(p[1], uc + A) - Math.max(p[0], uc) >= 0.5 * A
            ) {
              con.push(i)
            }
          })
          if (con.length >= 2) {
            const v1 = minimo(con.map((i) => pasillos[i][2]))
            const v2 = maximo(con.map((i) => pasillos[i][3]))
            cruces.push([uc, uc + A, v1, v2, con])
            for (const i of con.slice(1)) {
              uf.une(con[0], i)
            }
          }
        }
      }
      uc += pc
    }
  }

  // cabeceras: une pasillos vecinos que siguen sueltos con un cruce en un extremo
  if (cabeceras) {
    for (let bi = 0; bi < bandas.length - 1; bi++) {
      if (Math.abs(bandas[bi + 1][1][0] - bandas[bi][1][0] - P) > eps) {
        continue
      }
      for (const i of bandas[bi][3]) {
        for (const j of bandas[bi + 1][3]) {
          if (uf.raiz(i) === uf.raiz(j)) {
            continue
          }
          const pa = pasillos[i]
          const pb = pasillos[j]
          const lo = Math.max(pa[0], pb[0])
          const hi = Math.min(pa[1], pb[1])
          if (hi - lo < A) {
            continue
          }
          // de los extremos hacia adentro, de cajón en cajón
          const pasos = Math.trunc((hi - lo - A) / W) + 1
          const cand: number[] = []
          for (let k = 0; k < Math.min(pasos, 6); k++) {
            cand.push(lo + k * W, hi - A - k * W)
          }
          for (const uc of cand) {
            const tramosV = libre(G.borde_T, G.obst_todo_T, uc, uc + A, r, eps)
            if (tramosV.some(([va, vb]) => va <= pa[2] + eps && vb >= pb[3] - eps)) {
              cruces.push([uc, uc + A, pa[2], pb[3], [i, j]])
              uf.une(i, j)
              break
            }
          }
        }
      }
    }
  }

  // cajones
  const cajones: [number, number, number, number, number][] = [] // (u1, u2, v1, v2, id de pasillo)
  const formas: Punto2[][] = [] // (app) en batería: el paralelogramo de cada cajón
  const h = mb.sesgo
  for (const [f1, ps, f2, ids] of bandas) {
    const tramos: Intervalo[] = ids.map((i) => [pasillos[i][0], pasillos[i][1]])
    const sb = sentidoDe[ids[0]] ?? 1 // el fondo de cada cajón se corre sb·h respecto a su frente
    for (const f of [f1, f2]) {
      let libres = libre(G.borde, G.obst_fila, f[0], f[1], r, eps)
      if (libres.length === 0) {
        continue
      }
      const bl: Intervalo[] = cruces
        .filter((c) => c[2] <= f[0] + eps && c[3] >= f[1] - eps)
        .map((c) => [c[0], c[1]])
      if (bl.length > 0) {
        libres = resta(libres, union(bl))
      }
      for (const [a, b] of interseca(libres, tramos)) {
        const n = Math.trunc(Math.floor((b - a - h) / W + 1e-9))
        if (n <= 0) {
          continue
        }
        let nodo = ids[0]
        for (const i of ids) {
          if (pasillos[i][0] <= a + eps && pasillos[i][1] >= b - eps) {
            nodo = i
            break
          }
        }
        // (app) en batería el frente va sobre el pasillo y el fondo corrido sb·h: los n cajones ocupan n·W + h
        const u = a + ((b - a) - n * W - h) * 0.5 + (sb < 0 ? h : 0)
        const frente = f === f1 ? ps[0] : ps[1]
        const fondo = f === f1 ? f[0] : f[1]
        for (let j = 0; j < n; j++) {
          const u1 = u + j * W
          cajones.push([u1, u1 + W, f[0], f[1], nodo])
          if (h > 0)
            formas.push([
              [u1, frente],
              [u1 + W, frente],
              [u1 + W + sb * h, fondo],
              [u1 + sb * h, fondo],
            ])
        }
      }
    }
  }

  // rampas: la boca conecta con los pasillos que tiene cerca
  const holgura = L + eps
  G.cajas_boca.forEach(([bu1, bu2, bv1, bv2], m) => {
    pasillos.forEach((p, i) => {
      if (
        p[0] < bu2 + holgura &&
        p[1] > bu1 - holgura &&
        p[2] < bv2 + holgura &&
        p[3] > bv1 - holgura
      ) {
        uf.une(pasillos.length + m, i)
      }
    })
  })

  let acceso: boolean[]
  if (nBocas > 0) {
    const raices = new Set<number>()
    for (let m = 0; m < nBocas; m++) raices.add(uf.raiz(pasillos.length + m))
    acceso = cajones.map((c) => raices.has(uf.raiz(c[4])))
  } else {
    acceso = cajones.map(() => true)
  }
  // (app) qué bocas alcanza cada cajón, para la red de conexión entre masas y niveles
  const bocasDeRaiz = new Map<number, number[]>()
  for (let m = 0; m < nBocas; m++) {
    const r = uf.raiz(pasillos.length + m)
    bocasDeRaiz.set(r, [...(bocasDeRaiz.get(r) ?? []), m])
  }
  const alcanzables = cajones.map((c) => bocasDeRaiz.get(uf.raiz(c[4])) ?? [])

  // pasillos recortados a lo que realmente sirven
  const alcance = new Map<number, Intervalo>()
  for (const c of cajones) {
    const [lo, hi] = alcance.get(c[4]) ?? [c[0], c[1]]
    alcance.set(c[4], [Math.min(lo, c[0]), Math.max(hi, c[1])])
  }
  for (const cr of cruces) {
    for (const i of cr[4]) {
      const [lo, hi] = alcance.get(i) ?? [cr[0], cr[1]]
      alcance.set(i, [Math.min(lo, cr[0]), Math.max(hi, cr[1])])
    }
  }
  G.cajas_boca.forEach(([bu1, bu2, bv1, bv2], m) => {
    pasillos.forEach((p, i) => {
      if (alcance.has(i) && uf.raiz(i) === uf.raiz(pasillos.length + m)) {
        if (p[2] < bv2 + holgura && p[3] > bv1 - holgura) {
          const [lo, hi] = alcance.get(i)!
          alcance.set(i, [Math.max(p[0], Math.min(lo, bu1)), Math.min(p[1], Math.max(hi, bu2))])
        }
      }
    })
  })
  const rectPasillos: [number, number, number, number][] = []
  const sentidos: number[] = []
  pasillos.forEach((p, i) => {
    if (alcance.has(i)) {
      rectPasillos.push([alcance.get(i)![0], alcance.get(i)![1], p[2], p[3]])
      sentidos.push(sentidoDe[i] ?? 1)
    }
  })
  // (app) con sentido único, un pasillo con cajones necesita entrada y salida: una conexión (cruce o boca) en cada
  // extremo de sus cajones; los de antes de la primera o después de la última quedan en un fondo ciego
  let ciegos = 0
  // un solo pasillo sin entradas no tiene con qué conectarse: no se cuenta
  if (unico && (pasillos.length > 1 || nBocas > 0)) {
    const conCajones = new Set(cajones.map((c) => c[4]))
    pasillos.forEach((p, i) => {
      if (!conCajones.has(i)) return
      const conexiones: Intervalo[] = cruces.filter((c) => c[4].includes(i)).map((c): Intervalo => [c[0], c[1]])
      G.cajas_boca.forEach(([bu1, bu2, bv1, bv2]) => {
        if (p[0] < bu2 + holgura && p[1] > bu1 - holgura && p[2] < bv2 + holgura && p[3] > bv1 - holgura)
          conexiones.push([bu1, bu2])
      })
      const suyos = cajones.filter((c) => c[4] === i)
      const lo = Math.min(...suyos.map((c) => c[0]))
      const hi = Math.max(...suyos.map((c) => c[1]))
      const tol = W + mb.sesgo + eps
      const primera = Math.min(...conexiones.map((c) => c[0]))
      const ultima = Math.max(...conexiones.map((c) => c[1]))
      if (conexiones.length < 2 || primera > lo + tol || ultima < hi - tol) ciegos++
    })
  }
  const rectCruces = cruces.map((c): [number, number, number, number] => [c[0], c[1], c[2], c[3]])

  const componentes = new Set(cajones.map((c) => uf.raiz(c[4]))).size
  return {
    cajones,
    acceso,
    pasillos: rectPasillos,
    cruces: rectCruces,
    componentes,
    alcanzables,
    ...(h > 0 ? { formas } : {}),
    ...(unico ? { sentidos, ciegos } : {}),
  }
}

/** Direcciones de las orillas más largas (y su perpendicular) + cada 15°. */
export function angulosCandidatos(bordeLazos: Lazo[]): number[] {
  const pesos = new Map<number, number>()
  for (const [x1, y1, x2, y2] of aristas(bordeLazos)) {
    const l = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    const a = redondeaPar(modulo(grados(Math.atan2(y2 - y1, x2 - x1)), 180.0) * 2) / 2.0
    const k = modulo(a, 180.0)
    pesos.set(k, (pesos.get(k) ?? 0.0) + l)
  }
  const top = [...pesos.entries()].sort((p, q) => -p[1] - -q[1]).slice(0, 5)
  const cand: number[] = []
  for (const [a] of top) {
    cand.push(a, modulo(a + 90.0, 180.0))
  }
  for (let i = 0; i < 12; i++) cand.push(15.0 * i)
  const out: number[] = []
  for (const a of cand) {
    if (out.every((b) => Math.min(Math.abs(a - b), 180.0 - Math.abs(a - b)) > 1.0)) {
      out.push(a)
    }
  }
  return out
}

export interface ResultadoAcomodo extends Distribucion {
  angulo: number
  rampas: Lazo[]
  rampas_alto: number[][]
  bocas: Lazo[]
  avisos: string[]
}

/** Busca el mejor acomodo. Coordenadas 2D en el plano de la superficie. */
export function acomodar(
  bordeLazos: Lazo[],
  obstLazos: Lazo[],
  rampaPts: Punto2[],
  W: number,
  L: number,
  A: number,
  r: number,
  cruceN: number,
  rampaAncho: number,
  rampaLargo: number,
  rampaParalela: boolean,
  angulo: number | null = null,
  cabeceras: boolean = true,
  accesos: Lazo[] = [], // (app) bocas sin rampa: pasillos de liga entre zonas; no se dibujan como rampa
  // (app) desfases fijos en lugar de la búsqueda; `cruces` fija dónde caen los cruces (u en el marco girado)
  fasesFijas: { v?: number[]; u?: number[]; cruces?: { inicio: number; paso: number } } = {},
  // (app) medidas de cada rampa; `fija` trae la rampa ya armada (con zonas, sobre la masa y no sobre la zona)
  medidas: { ancho: number; largo: number; paralela: boolean; fija?: [Lazo, Lazo[], number[]] }[] = [],
  bateria?: Bateria, // (app) cajones en batería y sentido único
): ResultadoAcomodo {
  const eps = 1e-6 * Math.max(W, L, A)
  const aristasBorde = aristas(bordeLazos)
  const rampas: Lazo[] = []
  const bocas: Lazo[] = []
  const altos: number[][] = []
  const avisos: string[] = []
  rampaPts.forEach(([px, py], n) => {
    const m = medidas[n]
    const [rp, bcs, alto] = m
      ? (m.fija ?? rampa(aristasBorde, px, py, m.ancho, m.largo, A, m.paralela))
      : rampa(aristasBorde, px, py, rampaAncho, rampaLargo, A, rampaParalela)
    rampas.push(rp)
    bocas.push(...bcs)
    altos.push(alto)
    const todo: Punto2[] = rp.concat(bcs.flat())
    let sx = 0
    let sy = 0
    for (const p of todo) sx += p[0]
    for (const p of todo) sy += p[1]
    const cx = sx / todo.length
    const cy = sy / todo.length
    for (const [x, y] of todo) {
      if (!puntoDentro(aristasBorde, x + (cx - x) * 0.01, y + (cy - y) * 0.01)) {
        avisos.push(`la rampa ${n + 1} se sale de la superficie; muévela`)
        break
      }
    }
  })

  const angulos = angulo !== null && angulo !== undefined ? [angulo] : angulosCandidatos(bordeLazos)
  const fasesV = fasesFijas.v ?? Array.from({ length: 8 }, (_, i) => i / 8.0)
  const fasesU = fasesFijas.cruces
    ? [0.0]
    : (fasesFijas.u ?? (cruceN > 0 ? Array.from({ length: 6 }, (_, i) => i / 6.0) : [0.0]))
  const bocasYAccesos = accesos.length ? bocas.concat(accesos) : bocas

  let mejor: [number[], Distribucion & { angulo?: number }] | null = null
  for (const ang of angulos) {
    const G = preparar(bordeLazos, obstLazos, rampas, bocasYAccesos, radianes(ang), eps)
    for (const fv of fasesV) {
      for (const fu of fasesU) {
        const res: Distribucion & { angulo?: number } = distribuir(
          G,
          W,
          L,
          A,
          r,
          fv,
          cruceN,
          fu,
          cabeceras,
          fasesFijas.cruces,
          bateria,
        )
        const nOk = res.acceso.filter((x) => x).length
        const clave = [nOk, res.cajones.length, -res.componentes]
        if (mejor === null || tuplaMayor(clave, mejor[0])) {
          res.angulo = ang
          mejor = [clave, res]
        }
      }
    }
  }
  const res = mejor![1]
  return {
    ...res,
    angulo: res.angulo!,
    rampas,
    rampas_alto: altos,
    bocas,
    avisos,
  }
}

/** Marco girado -> marco del plano de la superficie. */
export function aBase(u: number, v: number, angGrados: number): Punto2 {
  const a = radianes(angGrados)
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [u * c - v * s, u * s + v * c]
}

// ---- varias áreas: curvas / superficies en uno o varios planos ----------------

export function menos(a: Punto3, b: Punto3): Punto3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function punto(a: Punto3, b: Punto3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cruz(a: Punto3, b: Punto3): Punto3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function unitario(a: Punto3): Punto3 | null {
  const l = Math.sqrt(punto(a, a))
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null
}

/** Plano (origen, ex, ey, ez) de un lazo 3D (Newell). Si es horizontal,
 * usa los ejes del mundo para que Angulo sea respecto a X. */
export function planoDe(pts3: Punto3[]): Plano {
  let nx = 0.0
  let ny = 0.0
  let nz = 0.0
  const n = pts3.length
  for (let i = 0; i < n; i++) {
    const [x1, y1, z1] = pts3[i]
    const [x2, y2, z2] = pts3[(i + 1) % n]
    nx += (y1 - y2) * (z1 + z2)
    ny += (z1 - z2) * (x1 + x2)
    nz += (x1 - x2) * (y1 + y2)
  }
  const o: Punto3 = [
    pts3.reduce((s, p) => s + p[0], 0) / n,
    pts3.reduce((s, p) => s + p[1], 0) / n,
    pts3.reduce((s, p) => s + p[2], 0) / n,
  ]
  let ez: Punto3 = unitario([nx, ny, nz]) ?? [0.0, 0.0, 1.0]
  if (ez[2] < 0) {
    ez = [-ez[0], -ez[1], -ez[2]]
  }
  if (ez[2] > 0.999) {
    return [o, [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
  }
  const ex: Punto3 = unitario(cruz([0.0, 0.0, 1.0], ez)) ?? [1.0, 0.0, 0.0]
  return [o, ex, cruz(ez, ex), ez]
}

export function aPlano(p: Punto3, pl: Plano): Punto3 {
  const d = menos(p, pl[0])
  return [punto(d, pl[1]), punto(d, pl[2]), punto(d, pl[3])]
}

export function dePlano(u: number, v: number, pl: Plano): Punto3 {
  const [o, ex, ey] = [pl[0], pl[1], pl[2]]
  return [
    o[0] + u * ex[0] + v * ey[0],
    o[1] + u * ex[1] + v * ey[1],
    o[2] + u * ex[2] + v * ey[2],
  ]
}

export function areaConSigno(lp: Lazo): number {
  let s = 0.0
  const n = lp.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = lp[i]
    const [x2, y2] = lp[(i + 1) % n]
    s += x1 * y2 - x2 * y1
  }
  return 0.5 * s
}

export function centroide(lp: Lazo): Punto2 {
  const a = areaConSigno(lp)
  if (Math.abs(a) < 1e-12) {
    return [
      lp.reduce((s, p) => s + p[0], 0) / lp.length,
      lp.reduce((s, p) => s + p[1], 0) / lp.length,
    ]
  }
  let cx = 0.0
  let cy = 0.0
  const n = lp.length
  for (let i = 0; i < n; i++) {
    const [x1, y1] = lp[i]
    const [x2, y2] = lp[(i + 1) % n]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function distanciaABorde(lazos: Lazo[], x: number, y: number): number {
  let mejor: number | null = null
  for (const [x1, y1, x2, y2] of aristas(lazos)) {
    const dx = x2 - x1
    const dy = y2 - y1
    const t = Math.max(0.0, Math.min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    const d = Math.sqrt((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2)
    if (mejor === null || d < mejor) {
      mejor = d
    }
  }
  return mejor !== null ? mejor : 0.0
}

/** Un área: lazos cerrados 3D del mismo plano ya anidados. */
export interface Area {
  plano: Plano
  nivel: number // índice del plano
  lazos: Lazo[] // exterior primero, en 2D
  m2: number
}

/** Lazos cerrados 3D -> áreas. Los lazos del mismo plano se anidan:
 * uno dentro de otro es hueco, uno dentro de un hueco es otra área. */
export function agruparAreas(lazos3d: Punto3[][], tolPlano: number): Area[] {
  const grupos: [Plano, number[]][] = []
  lazos3d.forEach((lp, i) => {
    const pl = planoDe(lp)
    for (const g of grupos) {
      if (
        Math.abs(punto(g[0][3], pl[3])) > 0.999 &&
        Math.abs(punto(menos(pl[0], g[0][0]), g[0][3])) < tolPlano
      ) {
        g[1].push(i)
        return
      }
    }
    grupos.push([pl, [i]])
  })

  const areas: Area[] = []
  grupos.forEach(([pl, idx], nivel) => {
    const lz: Lazo[] = idx.map((i) => lazos3d[i].map((p): Punto2 => [aPlano(p, pl)[0], aPlano(p, pl)[1]]))
    const sup = lz.map((l) => Math.abs(areaConSigno(l)))
    const aris = lz.map((l) => aristas([l]))
    const n = lz.length
    const dentroDe: number[][] = []
    for (let i = 0; i < n; i++) {
      const d: number[] = []
      for (let j = 0; j < n; j++) {
        if (j !== i && sup[j] > sup[i] && puntoDentro(aris[j], lz[i][0][0], lz[i][0][1])) d.push(j)
      }
      dentroDe.push(d)
    }
    const prof = dentroDe.map((d) => d.length)
    for (let i = 0; i < n; i++) {
      if (prof[i] % 2 !== 0 || sup[i] <= 0) {
        continue
      }
      const huecos: number[] = []
      for (let k = 0; k < n; k++) {
        if (prof[k] === prof[i] + 1 && dentroDe[k].includes(i)) huecos.push(k)
      }
      areas.push({
        plano: pl,
        nivel,
        lazos: [lz[i], ...huecos.map((k) => lz[k])],
        m2: sup[i] - huecos.reduce((s, k) => s + sup[k], 0),
      })
    }
  })
  return areas
}
