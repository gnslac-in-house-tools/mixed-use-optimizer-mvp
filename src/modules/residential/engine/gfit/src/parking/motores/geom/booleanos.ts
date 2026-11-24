// Booleanos con clipper2-js. Coordenadas escaladas ×1e4 (0.1 mm) a enteros.
// Entrada: cada operando es una lista de anillos; exterior u hueco se decide por anidamiento (ver aPaths).
// Salida: regiones [exterior antihorario, ...huecos horarios]; una isla dentro de un hueco es su propia región.
//
// Nota: en clipper2-js 1.2.4 executePolyTree falla siempre (buildTree → checkBounds lee un arreglo sin crear y la
// excepción se traga), así que se usa execute (caminos sueltos) y el anidado se arma aquí: Clipper regresa los
// exteriores con área positiva y los huecos con área negativa; cada hueco va con el exterior más chico que lo
// contiene.
import { ClipType, Clipper, Clipper64, EndType, FillRule, JoinType, Path64, Paths64 } from 'clipper2-js'
import type { Punto } from '../../modelo/tipos.ts'
import { area, areaConSigno, caja, distanciaPuntoSegmento, puntoEnPoligono } from './poligono.ts'

const ESCALA = 1e4

/** x queda dentro de y: todos sus vértices dentro de y o sobre su borde, y x es más chico. */
function anidado(x: Punto[], y: Punto[]): boolean {
  if (area(x) >= area(y)) return false
  return x.every((q) => {
    if (puntoEnPoligono(q, y)) return true
    for (let i = 0; i < y.length; i++)
      if (distanciaPuntoSegmento(q, y[i], y[(i + 1) % y.length]) <= 1e-6) return true
    return false
  })
}

/**
 * El sentido de cada anillo se decide por anidamiento dentro del mismo operando: un anillo dentro de un número
 * impar de otros anillos es hueco (se fuerza a horario); si no, es exterior (se fuerza a antihorario). Así
 * [exterior, hueco] funciona aunque el hueco venga antihorario (tal como sale de aPoligono), y una lista de
 * polígonos sueltos (varias masas, o regiones aplanadas con .flat()) sigue siendo una lista de exteriores.
 */
function aPaths(anillos: Punto[][]): Paths64 {
  const rs = anillos.filter((r) => r.length >= 3)
  const ps = new Paths64()
  rs.forEach((anillo, k) => {
    let nivel = 0
    rs.forEach((otro, j) => {
      if (j !== k && anidado(anillo, otro)) nivel++
    })
    const hueco = nivel % 2 === 1
    const s = areaConSigno(anillo)
    const orden = (hueco ? s > 0 : s < 0) ? anillo.slice().reverse() : anillo
    const p = new Path64()
    for (const q of orden) p.push({ x: Math.round(q.x * ESCALA), y: Math.round(q.y * ESCALA) })
    ps.push(p)
  })
  return ps
}

function desdePath(p: Path64): Punto[] {
  const anillo: Punto[] = []
  for (const q of p) {
    const u = anillo[anillo.length - 1]
    const x = q.x / ESCALA
    const y = q.y / ESCALA
    if (!u || u.x !== x || u.y !== y) anillo.push({ x, y })
  }
  while (
    anillo.length > 1 &&
    anillo[0].x === anillo[anillo.length - 1].x &&
    anillo[0].y === anillo[anillo.length - 1].y
  )
    anillo.pop()
  return anillo
}

/**
 * El hueco cae en el exterior: la mayoría de sus vértices que no están sobre la orilla del exterior quedan dentro.
 * Los que tocan la orilla no cuentan (un hueco que toca su exterior en varios vértices se perdía y el área de la
 * región salía de más).
 */
function contiene(exterior: Punto[], hueco: Punto[]): boolean {
  let dentro = 0
  let fuera = 0
  for (const q of hueco) {
    let orilla = false
    for (let i = 0; i < exterior.length && !orilla; i++)
      orilla = distanciaPuntoSegmento(q, exterior[i], exterior[(i + 1) % exterior.length]) <= 1e-7
    if (orilla) continue
    if (puntoEnPoligono(q, exterior)) dentro++
    else fuera++
  }
  return dentro >= fuera
}

function operar(tipo: ClipType, a: Punto[][], b: Punto[][]): Punto[][][] {
  const c = new Clipper64()
  c.addSubjectPaths(aPaths(a))
  c.addClipPaths(aPaths(b))
  const sol = new Paths64()
  c.execute(tipo, FillRule.NonZero, sol)
  return regionesDe(sol)
}

/** Caminos sueltos de Clipper → regiones [exterior, ...huecos]. */
function regionesDe(sol: Paths64): Punto[][][] {
  const exteriores: { anillo: Punto[]; area: number; huecos: Punto[][] }[] = []
  const huecos: { anillo: Punto[]; area: number }[] = []
  for (const p of sol) {
    const anillo = desdePath(p)
    if (anillo.length < 3) continue
    const s = areaConSigno(anillo)
    if (s > 0) exteriores.push({ anillo, area: s, huecos: [] })
    else if (s < 0) huecos.push({ anillo, area: -s })
  }
  for (const h of huecos) {
    let mejor: (typeof exteriores)[number] | null = null
    for (const e of exteriores)
      if (e.area > h.area && (!mejor || e.area < mejor.area) && contiene(e.anillo, h.anillo)) mejor = e
    // sin exterior que lo contenga, el más chico cuya caja lo cubre: un hueco perdido suma área de más
    if (!mejor) {
      const c = caja(h.anillo)
      for (const e of exteriores) {
        const k = caja(e.anillo)
        const cubre = k.minX <= c.minX + 1e-7 && k.minY <= c.minY + 1e-7 && k.maxX >= c.maxX - 1e-7 && k.maxY >= c.maxY - 1e-7
        if (e.area > h.area && cubre && (!mejor || e.area < mejor.area)) mejor = e
      }
    }
    mejor?.huecos.push(h.anillo)
  }
  return exteriores.map((e) => [e.anillo, ...e.huecos])
}

export function interseccion(a: Punto[][], b: Punto[][]): Punto[][][] {
  return operar(ClipType.Intersection, a, b)
}

export function diferencia(a: Punto[][], b: Punto[][]): Punto[][][] {
  return operar(ClipType.Difference, a, b)
}

/**
 * `a` menos la unión de las tiras. Las tiras no pasan por el anidamiento de aPaths: todas son exteriores (una tira
 * dentro de otra no se vuelve hueco y no la cancela) y no se comparan entre sí, así que el costo es lineal en su
 * cantidad.
 */
export function restarTiras(a: Punto[][], tiras: Punto[][]): Punto[][][] {
  const clip = new Paths64()
  for (const t of tiras) {
    if (t.length < 3) continue
    const orden = areaConSigno(t) < 0 ? t.slice().reverse() : t
    const p = new Path64()
    for (const q of orden) p.push({ x: Math.round(q.x * ESCALA), y: Math.round(q.y * ESCALA) })
    clip.push(p)
  }
  const c = new Clipper64()
  c.addSubjectPaths(aPaths(a))
  c.addClipPaths(clip)
  const sol = new Paths64()
  c.execute(ClipType.Difference, FillRule.NonZero, sol)
  return regionesDe(sol)
}

/** Un vértice que sale de Clipper a menos de esto (m) de uno del trazo vuelve a ser ese (Clipper redondea a 1/ESCALA). */
const REGRESO = 2.5 / ESCALA
/** Dos vértices seguidos a menos de esto (m) son el mismo. */
const MISMO = 1e-3
/** Un vértice a menos de esto (m) de la recta de sus vecinos sobra. */
const COLINEAL = 2e-4

/** El anillo con un vértice más en cada lado donde otro de sus vértices cae encima (donde el trazo se toca). */
function conToques(r: Punto[]): Punto[] {
  const out: Punto[] = []
  r.forEach((a, i) => {
    const b = r[(i + 1) % r.length]
    out.push(a)
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l < MISMO) return
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
    const encima = r
      .map((q) => ({ q, t: (q.x - a.x) * u.x + (q.y - a.y) * u.y }))
      .filter(({ q, t }) => t > MISMO && t < l - MISMO && Math.abs((q.x - a.x) * u.y - (q.y - a.y) * u.x) < MISMO)
      .sort((x, y) => x.t - y.t)
    for (const { q } of encima) out.push(q)
  })
  return out
}

/** El anillo partido en sus lazos donde pasa dos veces por el mismo punto (un trazo que se toca en un vértice). */
function lazosDe(r: Punto[]): Punto[][] {
  const lazos: Punto[][] = []
  const pila: Punto[] = []
  for (const q of r) {
    const k = pila.findIndex((p) => Math.hypot(p.x - q.x, p.y - q.y) < MISMO)
    if (k >= 0) {
      lazos.push(pila.splice(k + 1))
    } else pila.push(q)
  }
  lazos.push(pila)
  return lazos.filter((l) => l.length >= 3)
}

/**
 * Lo que de verdad encierra un trazo que se cruza (o se toca) consigo mismo, al dibujar una masa: una punta que sale y
 * regresa cruzando un lado. Con la regla positiva sobre el anillo orientado como su área, los lazos que dan la vuelta
 * al revés (la punta) no cuentan; de lo que queda (partido donde se toca en un punto), el lazo más grande. Sus
 * vértices vuelven a ser los del trazo (Clipper los redondea a 0.1 mm) y no quedan colineales ni repetidos. null si no
 * queda nada.
 */
export function parteMayor(anillo: Punto[]): Punto[] | null {
  if (anillo.length < 3) return null
  const orden = areaConSigno(anillo) < 0 ? anillo.slice().reverse() : anillo
  const p = new Path64()
  for (const q of orden) p.push({ x: Math.round(q.x * ESCALA), y: Math.round(q.y * ESCALA) })
  const ps = new Paths64()
  ps.push(p)
  const sol = Clipper.Union(ps, undefined, FillRule.Positive)
  const original = (q: Punto) => anillo.find((o) => Math.hypot(o.x - q.x, o.y - q.y) < REGRESO) ?? q
  let mejor: Punto[] | null = null
  let aMejor = 0
  for (const s of sol)
    for (const lazo of lazosDe(conToques(desdePath(s).map(original)))) {
      const a = areaConSigno(lazo)
      if (a > aMejor) {
        aMejor = a
        mejor = lazo
      }
    }
  if (!mejor) return null
  // sin repetidos seguidos ni vértices sobre la recta de sus vecinos (el cruce parte un lado en dos); hasta que no cambie
  let r = mejor
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const sinRepetidos = r.filter((q, i) => Math.hypot(q.x - r[(i + 1) % r.length].x, q.y - r[(i + 1) % r.length].y) >= MISMO)
    const limpio = sinRepetidos.filter((q, i, t) => {
      const a = t[(i - 1 + t.length) % t.length]
      const b = t[(i + 1) % t.length]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      return l < 1e-12 || Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / l > COLINEAL
    })
    if (limpio.length === r.length) break
    r = limpio
  }
  return r.length >= 3 ? r : null
}

export function union(a: Punto[][], b: Punto[][]): Punto[][][] {
  return operar(ClipType.Union, a, b)
}

/**
 * Unión que cierra las rendijas: piezas vecinas cuyos bordes compartidos no coinciden exactamente (cortes
 * calculados por separado) quedan como una sola región. Se infla `tol` m, se une y se desinfla.
 */
export function unionCerrada(anillos: Punto[][], tol = 0.02): Punto[][][] {
  const d = tol * ESCALA
  const inflado = Clipper.InflatePaths(aPaths(anillos), d, JoinType.Miter, EndType.Polygon)
  const unido = Clipper.Union(inflado, undefined, FillRule.NonZero)
  return regionesDe(Clipper.InflatePaths(unido, -d, JoinType.Miter, EndType.Polygon))
}

/**
 * Los anillos desplazados `d` m hacia afuera de la región (negativo hacia adentro), con esquinas a inglete (y
 * chaflán si el inglete pasa de 2·|d|); regiones con huecos. No usa InflatePaths: en clipper2-js 1.2.4 regresa
 * vértices fuera de lugar (un rectángulo de 60 × 40 desplazado −1 m da un cuadrilátero torcido). Cada lado se
 * mueve por su normal y los lazos que se invierten (lados que desaparecen) se quitan con una unión de regla
 * positiva.
 */
export function desplazar(anillos: Punto[][], d: number): Punto[][][] {
  const dd = d * ESCALA
  const crudos = new Paths64()
  for (const camino of aPaths(anillos)) {
    // sin vértices repetidos; con los exteriores antihorarios y los huecos horarios, la normal a la derecha de
    // cada lado apunta afuera de la región
    const p = camino.filter((q, i) => {
      const r = camino[(i + 1) % camino.length]
      return q.x !== r.x || q.y !== r.y
    })
    const n = p.length
    if (n < 3) continue
    const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
    }
    const q = new Path64()
    for (let i = 0; i < n; i++) {
      const b = p[i]
      const n1 = normal(p[(i - 1 + n) % n], b)
      const n2 = normal(b, p[(i + 1) % n])
      const k = 1 + n1.x * n2.x + n1.y * n2.y
      if (k < 0.5) {
        q.push({ x: Math.round(b.x + dd * n1.x), y: Math.round(b.y + dd * n1.y) })
        q.push({ x: Math.round(b.x + dd * n2.x), y: Math.round(b.y + dd * n2.y) })
      } else {
        q.push({ x: Math.round(b.x + (dd * (n1.x + n2.x)) / k), y: Math.round(b.y + (dd * (n1.y + n2.y)) / k) })
      }
    }
    crudos.push(q)
  }
  const c = new Clipper64()
  c.addSubjectPaths(crudos)
  const sol = new Paths64()
  c.execute(ClipType.Union, FillRule.Positive, sol)
  return regionesDe(sol)
}

/** Anillos sueltos como caminos de Clipper, todos exteriores (antihorarios): sin decidir huecos por anidamiento. */
function exteriores(anillos: Punto[][]): Paths64 {
  const ps = new Paths64()
  for (const a of anillos) {
    if (a.length < 3) continue
    const orden = areaConSigno(a) < 0 ? a.slice().reverse() : a
    const p = new Path64()
    for (const q of orden) p.push({ x: Math.round(q.x * ESCALA), y: Math.round(q.y * ESCALA) })
    ps.push(p)
  }
  return ps
}

function operarExteriores(tipo: ClipType, a: Punto[][], b: Punto[][]): Punto[][][] {
  const c = new Clipper64()
  c.addSubjectPaths(exteriores(a))
  if (b.length > 0) c.addClipPaths(exteriores(b))
  const sol = new Paths64()
  // regla positiva: un anillo que se cruza a sí mismo (zigzags del núcleo portado) no resta con sus lazos al revés
  c.execute(tipo, FillRule.Positive, sol)
  return regionesDe(sol)
}

/**
 * Unión de polígonos sueltos, todos como exteriores: a diferencia de `union`, uno dentro de otro (o uno que solo
 * toca a otro) no se toma por hueco.
 */
export function unionDeExteriores(anillos: Punto[][]): Punto[][][] {
  return operarExteriores(ClipType.Union, anillos, [])
}

/** Suma de áreas: exterior menos huecos. */
export function areaRegiones(rs: Punto[][][]): number {
  let s = 0
  for (const [exterior, ...huecos] of rs) {
    if (!exterior) continue
    s += area(exterior)
    for (const h of huecos) s -= area(h)
  }
  return s
}
