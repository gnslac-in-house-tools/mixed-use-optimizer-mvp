// GFit's door into the Plaza-Practiko stall engine (motores/cajones, copied unchanged from
// 202609_Plaza-Practiko@258a5b4, circuito.ts included). Shapes in meters in, stall rings out.
import { calcularCajones } from './motores/cajones'
import type { ResultadoCajones } from './motores/cajones'
import { AVISO_CIRCUITO_ANGOSTO, AVISO_CIRCUITO_OBSTACULOS, cajonesEnCircuito } from './motores/cajones/circuito'
import type { ParamsCajones, Punto } from './modelo/tipos'
import { signedArea } from '../model/geom'
import type { Ring, Shape } from '../model/geom'

/** Grid: parallel rows with cross aisles at the ends. Circuit: a ring aisle along the perimeter, the centre in grid. */
export type ParkingLayout = 'auto' | 'grid' | 'circuit'
export type ParkingFlow = 'two' | 'one'

export interface BasementLayout {
  stalls: Ring[]
  aisles: Ring[]
  /** flow arrows on the aisles: one head (7 points, tip first) for one-way, two heads (10 points) for two-way */
  arrows: Ring[]
  count: number
  warnings: string[]
  used: 'grid' | 'circuit'
  /** with Auto, the stalls each layout gives (the panel says why it chose) */
  compare?: { grid: number; circuit: number }
}

/** Auto keeps the circuit while it gives at least this share of the grid's stalls (the approved mockup). */
export const AUTO_CIRCUIT_MIN = 0.95
export const CIRCUIT_CORES_IN_AISLE = 'Cores sit in the circuit aisle: move them, or use the grid, which fits its rows between them'
export const CIRCUIT_TOO_NARROW = 'Circuit does not fit: the basement is too narrow for stalls on both sides of a ring aisle; using the grid'

const toP = (r: Ring): Punto[] => r.map(([x, y]) => ({ x, y }))
const toR = (p: Punto[]): Ring => p.map((q) => [q.x, q.y])

export function emptyLayout(): BasementLayout {
  return { stalls: [], aisles: [], arrows: [], count: 0, warnings: [], used: 'grid' }
}

/** Stalls on one basement: the outline's largest outer, with its holes and the cores as obstacles. */
export function layoutBasement(outline: Shape, cores: Shape, o: { angle: 90 | 60 | 45; aisle: number; layout?: ParkingLayout; flow?: ParkingFlow }): BasementLayout {
  const outers = outline.filter((r) => signedArea(r) > 0).sort((a, b) => signedArea(b) - signedArea(a))
  if (!outers.length) return emptyLayout()
  const layout = o.layout ?? 'auto', one = o.flow === 'one'
  const holes = outline.filter((r) => signedArea(r) < 0).map(toP)
  const obst = cores.filter((c) => signedArea(c) > 0).map(toP)
  const params = {
    angulo: null,
    anchoCajon: 2.5,
    largoCajon: 5.0,
    anchoPasillo: o.aisle,
    retiro: 0,
    cruceCada: 5,
    cabeceras: true,
    exigirAcceso: false,
    rampas: [],
    pisos: 1,
    anguloCajon: o.angle,
    ...(one ? { sentido: 'unico' } : {}),
  } as ParamsCajones
  const poly = toP(outers[0])
  const grid = () => calcularCajones(poly, [...holes, ...obst], params, 3.3, {})
  const circuit = () => cajonesEnCircuito(poly, holes, obst, { ...params, disposicion: 'circuito' }, 3.3, {})
  // the engine can shrink the ring on a narrow plate into long thin strips; short pieces (where cores cut the ring) are fine
  const fits = (c: ResultadoCajones) => c.conteoPorPiso > 0 && !c.avisos.includes(AVISO_CIRCUITO_ANGOSTO) && !c.pasillos.some((p) => thinStrip(p, Math.min(o.aisle, 6)))

  if (layout === 'grid') return out(grid(), 'grid', one)
  if (layout === 'circuit') {
    const c = circuit()
    if (fits(c)) return out(c, 'circuit', one)
    const g = out(grid(), 'grid', one)
    return { ...g, warnings: [CIRCUIT_TOO_NARROW, ...g.warnings] }
  }
  // Auto tries the circuit with 90° stalls and two-way aisles (as Plaza Practiko does), and keeps it when it loses
  // little against the grid
  const g = grid()
  if (o.angle !== 90 || one) return out(g, 'grid', one)
  const c = circuit()
  const compare = { grid: g.conteoPorPiso, circuit: fits(c) ? c.conteoPorPiso : 0 }
  return { ...(compare.circuit >= compare.grid * AUTO_CIRCUIT_MIN ? out(c, 'circuit', one) : out(g, 'grid', one)), compare }
}

function out(r: ResultadoCajones, used: 'grid' | 'circuit', one: boolean): BasementLayout {
  const arrows: Ring[] = []
  r.pasillos.forEach((p, i) => {
    const s = r.sentidos?.[i]
    if (one && !s) return // with one-way flow, cross aisles and links stay unmarked
    arrows.push(...arrowsOn(p, one ? s! : null))
  })
  // the engine speaks Spanish; the panel shows the warnings it knows in English
  const warnings = r.avisos.map((a) => (a === AVISO_CIRCUITO_OBSTACULOS ? CIRCUIT_CORES_IN_AISLE : a))
  return { stalls: r.cajones.map(toR), aisles: r.pasillos.map(toR), arrows, count: r.cajones.length, warnings, used }
}

/** An aisle piece much longer than the aisle is wide, and narrower than it: the ring squeezed on a narrow plate. */
function thinStrip(p: Punto[], aisle: number): boolean {
  const u = longSide(p)
  if (!u) return false
  const ts = p.map((q) => q.x * u.x + q.y * u.y), ss = p.map((q) => -q.x * u.y + q.y * u.x)
  return Math.max(...ss) - Math.min(...ss) < aisle - 0.05 && Math.max(...ts) - Math.min(...ts) > 2 * aisle
}

function longSide(p: Punto[]): Punto | null {
  let best = 0, d: Punto | null = null
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b.x - a.x, b.y - a.y)
    if (l > best) { best = l; d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }
  }
  return d
}

/** Arrow glyphs along an aisle, every 9 m: toward `dir` (one head) or both ways along the aisle's long side (two heads). */
function arrowsOn(p: Punto[], dir: Punto | null): Ring[] {
  const u = dir ?? longSide(p)
  if (!u) return []
  const n = { x: -u.y, y: u.x }
  const ts = p.map((q) => q.x * u.x + q.y * u.y), ss = p.map((q) => q.x * n.x + q.y * n.y)
  const t0 = Math.min(...ts), t1 = Math.max(...ts), s0 = Math.min(...ss), s1 = Math.max(...ss)
  const len = t1 - t0, sm = (s0 + s1) / 2
  if (len < 3 || s1 - s0 < 2) return []
  const at = (t: number, s: number): [number, number] => [u.x * t + n.x * s, u.y * t + n.y * s]
  const k = Math.max(1, Math.floor(len / 9))
  const L = 1.2, hl = 1.0, hw = 0.7, sw = 0.2 // half length, head length, head and shaft half widths
  const res: Ring[] = []
  for (let j = 0; j < k; j++) {
    const c = t0 + (len * (j + 0.5)) / k
    res.push(dir
      ? [at(c + L, sm), at(c + L - hl, sm - hw), at(c + L - hl, sm - sw), at(c - L, sm - sw), at(c - L, sm + sw), at(c + L - hl, sm + sw), at(c + L - hl, sm + hw)]
      : [at(c + L, sm), at(c + L - hl, sm - hw), at(c + L - hl, sm - sw), at(c - L + hl, sm - sw), at(c - L + hl, sm - hw), at(c - L, sm), at(c - L + hl, sm + hw), at(c - L + hl, sm + sw), at(c + L - hl, sm + sw), at(c + L - hl, sm + hw)])
  }
  return res
}
