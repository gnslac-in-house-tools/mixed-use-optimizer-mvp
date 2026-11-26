// derivar: de las masas de un edificio de GIM al resultado de GFit (la versión GIM de `toGfit` + `calcOption` de
// mixed-use-optimizer/engine/adapter.ts). Las masas de Vivienda y Comercio son los sólidos del modo `mass` de GFit
// (prismas: su corte a cualquier altura de su `span` es su polígono con sus huecos); las de Núcleo, sus núcleos. La
// retícula de la opción pone el módulo de las unidades (`setUnitModule`, el parche de GFit). Puro y memoizado.
import type { Grid, Id, Mass, Point, Polygon, Project } from '../../../model/schema.ts'
import type { DerivedMass, MassingDerived } from '../../../engine/types.ts'
import { deriveMassing } from '../../../engine/derive.ts'
import { gridOf } from '../../../engine/grid/index.ts'
import { paramsDe, potDe } from './defaults.ts'
import type { GeomObj, Ring } from './gfit/src/host/protocol.ts'
import { calcOption } from './gfit/src/model/calc.ts'
import type { LevelResult, Totals } from './gfit/src/model/calc.ts'
import { massBuilding } from './gfit/src/model/massing.ts'
import { PROGS0 } from './gfit/src/model/programs.ts'
import { blankBuilding, fresh } from './gfit/src/model/state.ts'
import type { Building, Zoning } from './gfit/src/model/state.ts'
import { avisosModulo, setUnitModule } from './gfit/src/layout/level.ts'
import { setLevelOverride } from './gfit/src/layout/building.ts'
import { setBlocksWithoutAutoCore } from './gfit/src/model/blocks.ts'
import { unidadDeDepto } from './deptos.ts'
import { unionPieces } from '../../../engine/geom/boolean.ts'
import { signedArea as signedAreaPts } from '../../../engine/geom/polygon.ts'
import type { PlacedUnit } from './gfit/src/layout/level.ts'
import { layoutBasement } from './gfit/src/parking/adapter.ts'
import { flechasPorPasillo } from './flechas.ts'
import { intersection, signedArea, union, type Pt, type Shape } from './gfit/src/model/geom.ts'
import { medidaDeRampa } from './gfit/src/parking/motores/cajones/rampas.ts'
import { ENTREPISO_COMERCIO, ENTREPISO_VIVIENDA } from './defaults.ts'

export interface Derivado {
  totals: Totals
  /** los niveles de GFit, de abajo arriba (`prog`: 'res' vivienda, 'ret' comercio) */
  niveles: LevelResult[]
  /** cada departamento con su nivel y su precio (área × precio por m² de su tipo) */
  unidades: { nivel: number; unidad: PlacedUnit; precio: number }[]
  /** los sótanos de estacionamiento bajo la huella, con el motor de cajones de Praktico (el de GFit) */
  estacionamiento: Estacionamiento
  /** los núcleos dibujados; sin ninguno, los automáticos de GFit */
  nucleos: Polygon[]
  avisos: string[]
  /** la zonificación con que corrió GFit (`far` es el índice permitido) */
  zoning: Zoning
}

export interface Estacionamiento {
  sotanos: number
  /** cajones que el motor acomoda en un sótano */
  porSotano: number
  cajones: number
  requeridos: number
  /** el margen (ingreso menos costo) con la rampa centrada en su orilla, para comparar con el elegido */
  margenCentrada: number
  /** excavación más cajones (sin indirectos) */
  costo: number
  /** el acomodo de un sótano tipo: su contorno, sus cajones, sus pasillos, su rampa y los núcleos que lo atraviesan */
  plano: {
    contorno: Shape; cajones: Ring[]; pasillos: Ring[]; rampas: Ring[]; nucleos: Ring[]; flechas: Ring[]
    /** la rampa con la altura relativa (0..1) de cada vértice de su huella y la boca de su extremo alto; null sin rampa */
    rampa: { huella: Ring; alto: number[]; bocaAlta: Ring[] } | null
  }
}
/** Sótanos como máximo cuando el edificio no fija los suyos. */
export const SOTANOS_MAX = 5
/** m: el ancho de la rampa de cada edificio (doble sentido) */
export const RAMPA = 6
/** m: el pasillo de autos del sótano, que también es lo que mide cada boca de la rampa */
const PASILLO_SOTANO = 6
/** m: el entrepiso de sótano con que el motor de cajones mide la rampa (el de `layoutBasement`) */
export const ENTREPISO_SOTANO = 3.3

type Uso = 'vivienda' | 'comercio' | 'nucleo' | 'depto' | 'circulacion'
const ring = (poly: Polygon): Ring => poly.map((q) => [q.x, q.y])

/**
 * Dónde arranca la rampa (0..1 del perímetro, como lo lee el motor de cajones) y si cabe con sus bocas. La rampa
 * paralela deja una boca de `boca` m antes del punto y otra después de su `largo`; el conjunto va centrado en el lado
 * del contorno mayor que mira a la calle (la más cercana a alguna de `calles`, entre las que dan para la rampa y una
 * boca) o, sin calles, en el más largo. Pegada a una esquina, la boca de arranque se saldría del sótano.
 */
export function tRampa(contorno: Shape, boca: number, largo: number, calles: Pt[][] = []): { t: number; ts: number[]; cabe: boolean; lado: number; sinCalle: boolean } {
  const sinCalle = !calles.some((c) => c.length >= 2)
  const mayor = contorno.filter((r) => signedArea(r) > 0).sort((a, b) => signedArea(b) - signedArea(a))[0]
  if (!mayor) return { t: 0, ts: [0], cabe: false, lado: 0, sinCalle }
  const lados = mayor.map(([x, y], i) => { const [u, v] = mayor[(i + 1) % mayor.length]; return Math.hypot(u - x, v - y) })
  const total = lados.reduce((s, l) => s + l, 0)
  if (!(total > 0)) return { t: 0, ts: [0], cabe: false, lado: 0, sinCalle }
  let k = lados.indexOf(Math.max(...lados))
  if (!sinCalle) {
    const todas = lados.map((_, i) => i)
    const dan = todas.filter((i) => lados[i] >= largo + boca - 1e-6)
    const dist = (i: number) => distanciaACalle(mayor[i], mayor[(i + 1) % mayor.length], calles)
    // la más cercana; entre las que le quedan a 1 cm, la más larga
    const pool = dan.length ? dan : todas
    const min = Math.min(...pool.map(dist))
    k = pool.filter((i) => dist(i) <= min + 0.01).reduce((a, b) => (lados[b] > lados[a] ? b : a))
  }
  const antes = lados.slice(0, k).reduce((s, l) => s + l, 0)
  const L = lados[k]
  // centrado, pegado al inicio de la orilla o a su final (con las bocas dentro); el motor corre la rampa hacia el lado
  // con más largo libre, así que el punto no pasa de la mitad. Las que caen a menos de medio metro de otra, fuera.
  const mitad = L / 2
  const ss = [Math.min(Math.max(0, (L - largo) / 2), mitad), Math.min(boca, mitad), Math.max(0, Math.min(L - largo - boca, mitad))]
  const unicas = ss.filter((s, i) => ss.slice(0, i).every((o) => Math.abs(o - s) >= 0.5))
  const ts = unicas.map((s) => (antes + s) / total)
  return { t: ts[0], ts, cabe: L >= largo + 2 * boca - 1e-6, lado: L, sinCalle }
}

/** La boca que sigue al extremo alto de la rampa (sus vértices más altos), o null sin bocas. */
export function bocaAltaDe(huella: Ring, alto: number[], bocas: Ring[]): Ring | null {
  if (!bocas.length) return null
  const tope = Math.max(...alto)
  const arriba = huella.filter((_, i) => alto[i] >= tope - 1e-6)
  const centro = (r: Ring): Pt => [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length]
  const cerca = (r: Ring) => { const c = centro(r); return Math.min(...arriba.map((q) => Math.hypot(c[0] - q[0], c[1] - q[1]))) }
  return bocas.reduce((a, b) => (cerca(b) < cerca(a) ? b : a))
}

/** La distancia del punto medio de `ab` a la calle más cercana (polilíneas de su eje). */
export function distanciaACalle(a: Pt, b: Pt, calles: Pt[][]): number {
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let best = Infinity
  for (const c of calles) for (let i = 0; i + 1 < c.length; i++) {
    const [p, q] = [c[i], c[i + 1]]
    const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((m[0] - p[0]) * dx + (m[1] - p[1]) * dy) / l2)) : 0
    best = Math.min(best, Math.hypot(m[0] - (p[0] + t * dx), m[1] - (p[1] + t * dy)))
  }
  return best
}
const poly = (r: Ring): Polygon => r.map(([x, y]) => ({ x, y }))

/** Los avisos de GFit que se muestran, en español; los demás pasan como vienen. */
function enEspanol(a: string): string {
  if (a === 'No cores, using an automatic core') return 'Sin núcleo: se usa un núcleo automático'
  if (a === 'No unit fits this plate') return 'Ninguna unidad cabe en la placa'
  if (a === 'No solids assigned to a program') return 'No hay masas de vivienda ni de comercio'
  if (a === 'Core solids do not reach the residential levels, using an automatic core') return 'Los núcleos no llegan a la vivienda: se usa un núcleo automático'
  let m = /^(.+) does not fit a (\S+) m deep unit$/.exec(a)
  if (m) return `${m[1]} no cabe en una unidad de ${m[2]} m de fondo`
  m = /^Blocks overlap at (\S+) \((.+) over (.+)\)$/.exec(a)
  if (m) return `Las masas se enciman en ${m[1]}`
  m = /^(.+): (\S+) m is not a multiple of (\S+) m \(last level (\S+) m\)$/.exec(a)
  if (m) return `${m[1]}: ${m[2]} m no es múltiplo de ${m[3]} m (el último nivel mide ${m[4]} m)`
  return a
}

// ---- memo ------------------------------------------------------------------------------------------------------
const MAX = 50
const memo = new Map<string, Derivado | null>()
const masas = new WeakMap<Project, Map<string, MassingDerived>>()

function massingDe(p: Project, optionId: Id | null | undefined): MassingDerived {
  let porOpcion = masas.get(p)
  if (!porOpcion) masas.set(p, (porOpcion = new Map()))
  const k = optionId ?? ''
  let m = porOpcion.get(k)
  if (!m) porOpcion.set(k, (m = deriveMassing(p, optionId)))
  return m
}

/** El área del predio de la opción (m²), del sitio de GIM; null sin contorno. */
export function predioDe(p: Project, optionId: Id | null | undefined): number | null {
  const { site } = massingDe(p, optionId)
  return site.polygon ? site.area : null
}

/**
 * Las placas que dan los departamentos y pasillos dibujados: los de un mismo nivel y altura van a un solo sólido de
 * GFit (`deptos:<nivel>:<z>`), cuyo corte son sus pedazos unidos (aunque no se toquen: un piso, una planta), con los
 * departamentos de esa placa, su masa y su huella. Los núcleos dibujados que cruzan todo el piso de una placa van en
 * ella: son área construida de ese piso (no dan departamentos).
 */
function gruposDibujados(p: Project, ms: DerivedMass[], nucleos: DerivedMass[] = []): { solidos: DerivedMass[]; anillos: Map<string, Ring[]>; deptos: Map<string, { m: Mass; poly: Point[] }[]> } {
  const solidos: DerivedMass[] = []
  const anillos = new Map<string, Ring[]>()
  const deptos = new Map<string, { m: Mass; poly: Point[] }[]>()
  const masas = new Map(p.masses.map((m) => [m.id, m]))
  const grupos = new Map<string, DerivedMass[]>()
  for (const m of ms) {
    const k = `${m.levelId}|${m.span[0]}|${m.span[1]}`
    grupos.set(k, [...(grupos.get(k) ?? []), m])
  }
  for (const xs of grupos.values()) {
    const [a, b] = xs[0].span
    const cruzan = nucleos.filter((n) => n.span[0] <= a + 1e-6 && n.span[1] >= b - 1e-6).map((n) => n.polygon)
    const piezas = unionPieces([...xs.map((m) => m.polygon), ...cruzan]).filter((r) => r[0] && r[0].length >= 3)
    if (!piezas.length) continue
    const id = `deptos:${xs[0].levelId}:${xs[0].span[0]}`
    const todos = piezas.flatMap((r) => r[0])
    const [x0, x1] = [Math.min(...todos.map((q) => q.x)), Math.max(...todos.map((q) => q.x))]
    const [y0, y1] = [Math.min(...todos.map((q) => q.y)), Math.max(...todos.map((q) => q.y))]
    const caja = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
    const area = piezas.reduce((a, r) => a + Math.abs(signedAreaPts(r[0])) - r.slice(1).reduce((b, h) => b + Math.abs(signedAreaPts(h)), 0), 0)
    solidos.push({ ...xs[0], id, name: 'Departamentos', polygon: caja, holes: [], corridors: [], area })
    anillos.set(id, piezas.flatMap((r) => r.map(ring)))
    deptos.set(id, xs.filter((m) => masas.get(m.id)?.depto).map((m) => ({ m: masas.get(m.id)!, poly: m.polygon })))
  }
  return { solidos, anillos, deptos }
}

export function derivar(p: Project, buildingId: Id, optionId?: Id | null): Derivado | null {
  const usos = p.residential?.usos
  if (!usos) return null
  const prog = new Map(p.masses.map((m) => [m.id, m.programId]))
  const usoDe = (dm: DerivedMass): Uso | undefined => {
    const id = prog.get(dm.id)
    return id ? usos[id]?.uso : undefined
  }
  const del = Object.values(massingDe(p, optionId).masses).filter((m) => m.buildingId === buildingId && !m.context && m.polygon.length >= 3)
  // los departamentos y pasillos dibujados (spec 2026-11-26-blocks-residenciales): los de un nivel se unen en una placa
  // de vivienda (un bloque de GFit por pedazo) cuyos departamentos son los dibujados, no los que acomodaría GFit
  const dibujados = gruposDibujados(p, del.filter((m) => usoDe(m) === 'depto' || usoDe(m) === 'circulacion'), del.filter((m) => usoDe(m) === 'nucleo'))
  const solidos = [...del.filter((m) => usoDe(m) === 'vivienda' || usoDe(m) === 'comercio'), ...dibujados.solidos]
  if (!solidos.length) return null
  const usoDeVivienda = usoDe
  const usoFinal = (m: DerivedMass): Uso | undefined => (dibujados.deptos.has(m.id) ? 'vivienda' : usoDeVivienda(m))
  const nucleos = del.filter((m) => usoDe(m) === 'nucleo')
  const g = gridOf(p, optionId)
  const params = paramsDe(p, buildingId)
  const entrepiso = (u: Uso, d: number) => Object.values(usos).find((x) => x.uso === u)?.entrepiso ?? d
  // el POT del proyecto (índice y altura) y la ocupación máxima del sitio de GIM; el predio, para medirlos
  const pot = potDe(p)
  const norma = { far: pot.indice, height: pot.altura, cov: Math.round((p.site.rules.maxCoverage ?? 1) * 1000) / 10, predio: predioDe(p, optionId) }
  const firma = JSON.stringify([
    buildingId,
    [...solidos, ...nucleos].map((m) => [m.id, usoDe(m), m.polygon, m.holes, m.span]),
    g, usos, params, p.residential!.tipos, norma, (p.site.existingRoads ?? []).map((r) => r.points),
    [...dibujados.deptos.values()].map((xs) => xs.map(({ m, poly }) => [m.id, m.depto, poly])), dibujados.deptos.size ? p.residential!.catalogo : null,
  ])
  if (memo.has(firma)) return memo.get(firma)!
  // cada nivel de una placa dibujada toma sus departamentos (el parche setLevelOverride de GFit)
  setLevelOverride((lv) => {
    const xs = lv.block ? dibujados.deptos.get(lv.block) : undefined
    if (!xs) return undefined
    const units = xs.flatMap(({ m, poly }) => unidadDeDepto(p, m, poly) ?? [])
    return { units, unitA: units.reduce((a, u) => a + u.area, 0), leftover: 0, issues: [], attempts: 0 }
  })
  setBlocksWithoutAutoCore(new Set(dibujados.deptos.keys()))
  let d: Derivado
  try {
    d = calcular(solidos, nucleos, usoFinal, g, params, p, entrepiso('vivienda', ENTREPISO_VIVIENDA), entrepiso('comercio', ENTREPISO_COMERCIO), buildingId, norma, dibujados.anillos)
  } finally {
    setLevelOverride(null)
    setBlocksWithoutAutoCore(null)
  }
  if (memo.size >= MAX) memo.delete(memo.keys().next().value!)
  memo.set(firma, d)
  return d
}

function calcular(
  solidos: DerivedMass[], nucleos: DerivedMass[], usoDe: (m: DerivedMass) => Uso | undefined, g: Grid | null,
  params: ReturnType<typeof paramsDe>, p: Project, fhViv: number, fhCom: number, buildingId: Id,
  norma: { far: number; height: number; cov: number; predio: number | null },
  anillos: Map<string, Ring[]> = new Map(),
): Derivado {
  const s = fresh()
  s.progs = PROGS0().map((x) => (x.id === 'res' ? { ...x, fh: fhViv } : x.id === 'ret' ? { ...x, fh: fhCom } : x))
  s.unitTypes = p.residential!.tipos.map((t) => ({ ...t, rooms: [...t.rooms] }))
  // el terreno es del edificio (millones en GFit); sin él, 0 (GFit traía 10 M para cualquier predio)
  s.cg = { ...s.cg, land: params.terreno / 1e6 }
  s.zoning = { far: norma.far, height: norma.height, cov: norma.cov }
  const geom = new Map<string, GeomObj>()
  const obj = (m: DerivedMass, kind: GeomObj['kind'], rings: Ring[]): GeomObj => {
    const xs = m.polygon.map((q) => q.x), ys = m.polygon.map((q) => q.y)
    return { id: m.id, kind, name: m.name, layer: '', closed: true, planar: true, z: m.span[0], rings, bbox: [Math.min(...xs), Math.min(...ys), m.span[0], Math.max(...xs), Math.max(...ys), m.span[1]] }
  }
  const corte = new Map<string, Ring[]>()
  for (const m of solidos) {
    const rings = anillos.get(m.id) ?? [ring(m.polygon), ...m.holes.map(ring)]
    corte.set(m.id, rings)
    geom.set(m.id, obj(m, 'brep', rings))
  }
  for (const m of nucleos) geom.set(m.id, obj(m, 'curve', [ring(m.polygon)]))
  const b: Building = {
    ...blankBuilding(buildingId, 0),
    // sin lobby: cada placa de vivienda lleva departamentos (una masa de un nivel ya da unidades)
    mode: 'mass', typH: fhViv, lobbyH: 0,
    unitDepth: params.fondo, corridor: params.pasillo, mix: { ...params.mezcla }, seed: params.semilla,
    basements: 0, groundAt: null,
    links: { footprint: [], core: nucleos.map((m) => m.id), parking: [], mass: solidos.map((m) => m.id) },
    blocks: solidos.map((m) => ({ id: m.id, prog: usoDe(m) === 'vivienda' ? 'res' : 'ret' })),
  }
  // un prisma: su corte a cualquier altura es su polígono con sus huecos
  const sections = new Map<string, Map<number, Ring[]>>()
  for (const need of massBuilding(b, geom, s.progs).needs) {
    const rings = corte.get(need.id)
    if (rings) sections.set(need.id, new Map(need.zs.map((z) => [z, rings])))
  }
  let totals: Totals
  let modulo: string[] = []
  if (g) {
    const a = (g.angle * Math.PI) / 180
    setUnitModule({ origin: [g.origin.x, g.origin.y], u: [Math.cos(a), Math.sin(a)], step: g.x / g.modules, bay: [g.x, g.y] })
  }
  let plano: Estacionamiento['plano'] = { contorno: [], cajones: [], pasillos: [], rampas: [], rampa: null, nucleos: [], flechas: [] }
  let porSotano = 0, sotanos = 0
  let avisoRampa: string | null = null, sinCalle = false, margenCentrada = 0
  try {
    // un sótano para tener su contorno; el motor de cajones lo acomoda (los núcleos dibujados son obstáculos)
    const uno = calcOption({ id: 'o', name: 'o', buildings: [{ ...b, basements: 1 }] }, s, { geom, sections, siteArea: null })
    const bas = uno.bs[0].mass.basements[0]
    const calcula = (pl: Estacionamiento['plano'], n: number, cajones: number): Totals => {
      // sin sótanos no hay rampa; con ellos, la del S1 sube a la calle por la planta baja: su huella y su boca alta
      // le quitan el lugar a los departamentos y locales de ese nivel
      const rp = n > 0 ? pl.rampa : null
      return calcOption({ id: 'o', name: 'o', buildings: [{ ...b, basements: n }] }, s, {
        geom, sections, siteArea: norma.predio, stalls: new Map([[buildingId, Array.from({ length: n }, () => cajones)]]),
        ...(rp ? { plantaBaja: new Map([[buildingId, union([[rp.huella], rp.bocaAlta])]]) } : {}),
      })
    }
    const cuantos = (cajones: number) => params.sotanos ?? (cajones > 0 ? Math.min(SOTANOS_MAX, Math.ceil(uno.req / cajones)) : 0)
    let elegido: { totals: Totals; margen: number } | null = null
    if (uno.bs[0].ok && bas) {
      // una rampa de doble sentido (6 m) en la orilla que mira a la calle, con sus bocas dentro; los núcleos dibujados bajan
      const cores = nucleos.map((m) => ring(m.polygon))
      const largo = medidaDeRampa({ t: 0, ancho: RAMPA, largo: null, paralela: true }, ENTREPISO_SOTANO).largo
      const donde = tRampa(bas.shape, PASILLO_SOTANO, largo, (p.site.existingRoads ?? []).map((r) => r.points.map((q): Pt => [q.x, q.y])))
      sinCalle = donde.sinCalle
      // en esa orilla, centrada o pegada a un extremo: la que deja el mejor margen (cajones contra planta baja)
      donde.ts.forEach((t, k) => {
        const lay = layoutBasement(bas.shape, cores, { angle: 90, aisle: PASILLO_SOTANO, ramps: [{ t, ancho: RAMPA }] })
        // sin largo para las dos bocas, la rampa va entera y sus bocas (zona de maniobra) se recortan al sótano
        const [rp, ...bocas] = lay.ramps ?? []
        // cada boca recortada una vez, para que `rampa.bocaAlta` sean los mismos anillos que `rampas`
        const recortadas = bocas.map((bc): Ring[] => (donde.cabe ? [bc] : intersection([bc], bas.shape)))
        const rampas = rp ? [rp, ...recortadas.flat()] : []
        // el extremo que sube y la boca que lo sigue: por ahí sale el auto al nivel de arriba (en el S1, a la calle)
        const alto = lay.rampsHigh?.[0]
        let rampa: Estacionamiento['plano']['rampa'] = null
        if (rp && alto && alto.length === rp.length) {
          const boca = bocaAltaDe(rp, alto, bocas)
          rampa = { huella: rp, alto, bocaAlta: boca ? recortadas[bocas.indexOf(boca)] : [] }
        }
        const pl: Estacionamiento['plano'] = { contorno: bas.shape, cajones: lay.stalls, pasillos: lay.aisles, rampas, rampa, nucleos: cores, flechas: flechasPorPasillo(lay.aisles, lay.arrows) }
        const n = cuantos(lay.count)
        const tot = calcula(pl, n, lay.count)
        const margen = tot.revenue - tot.cost
        if (k === 0) margenCentrada = margen
        if (!elegido || margen > elegido.margen + 1e-6) {
          elegido = { totals: tot, margen }
          plano = pl; porSotano = lay.count; sotanos = n
          avisoRampa = rp && !donde.cabe ? `La rampa (${largo.toFixed(1)} m) no cabe con sus dos bocas de ${PASILLO_SOTANO} m en su lado del sótano (${donde.lado.toFixed(1)} m): las bocas quedan más cortas` : null
        }
      })
    }
    if (elegido) totals = (elegido as { totals: Totals }).totals
    else { sotanos = cuantos(0); totals = calcula(plano, sotanos, 0) }
    if (sotanos === 0) plano = { ...plano, rampa: null }
    modulo = avisosModulo()
  } finally {
    setUnitModule(null)
  }
  const r = totals.bs[0]
  const avisos0: string[] = avisoRampa ? [avisoRampa] : []
  if (sinCalle && sotanos > 0) avisos0.push('Dibuja la calle (Existing road) para orientar la entrada del estacionamiento')
  const niveles = r.levels
  const precioM2 = new Map(s.unitTypes.map((t) => [t.id, t.price]))
  const unidades = niveles.flatMap((l) => (l.layout?.units ?? []).map((unidad) => ({ nivel: l.num, unidad, precio: unidad.area * (precioM2.get(unidad.type) ?? 0) })))
  const estacionamiento: Estacionamiento = { sotanos, porSotano, cajones: r.prov, requeridos: r.req, costo: r.costB.exc + r.costB.park, plano, margenCentrada }
  if (sotanos > 0 && r.prov < r.req) avisos0.push(`Faltan ${r.req - r.prov} cajones: ${sotanos} sótanos dan ${r.prov} de ${r.req}`)
  // avisos: los de la masa, los de cada nivel (el remanente, agrupado por medida) y los del módulo
  // el POT: lo que GFit midió contra él y no cumple
  const POT: Record<string, (v: string) => string> = {
    FAR: (v) => `POT: índice ${v} (máx. ${norma.far})`,
    Height: (v) => `POT: altura ${v} (máx. ${norma.height} m)`,
    Coverage: (v) => `POT: ocupación ${v} (máx. ${norma.cov} %)`,
  }
  for (const c of totals.checks) if (!c.ok && POT[c.k]) avisos0.push(POT[c.k](c.v))
  const avisos: string[] = [...avisos0]
  const add = (a: string) => { const e = enEspanol(a); if (!avisos.includes(e)) avisos.push(e) }
  r.issues.forEach(add)
  r.mass.issues.forEach(add)
  const remanente = new Map<string, string[]>()
  for (const l of niveles) {
    for (const a of l.layout?.issues ?? []) {
      const m = /^remanente de (\S+) m en L\d+$/.exec(a)
      if (m) remanente.set(m[1], [...(remanente.get(m[1]) ?? []), l.name])
      else add(a)
    }
  }
  for (const a of modulo) if (!/^remanente de/.test(a)) add(a)
  for (const [x, ns] of remanente) add(`remanente de ${x} m en ${ns.length === 1 ? ns[0] : ns.length + ' niveles'}`)
  if (!totals.units && !avisos.length) add('Ninguna unidad cabe en la placa')
  const drawn = nucleos.map((m) => m.polygon)
  return { totals, niveles, unidades, estacionamiento, nucleos: drawn.length ? drawn : r.mass.cores.map(poly), avisos, zoning: { ...s.zoning } }
}

export type { Point }
