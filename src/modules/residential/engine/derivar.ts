// derivar: de las masas de un edificio de GIM al resultado de GFit (la versión GIM de `toGfit` + `calcOption` de
// mixed-use-optimizer/engine/adapter.ts). Las masas de Vivienda y Comercio son los sólidos del modo `mass` de GFit
// (prismas: su corte a cualquier altura de su `span` es su polígono con sus huecos); las de Núcleo, sus núcleos. La
// retícula de la opción pone el módulo de las unidades (`setUnitModule`, el parche de GFit). Puro y memoizado.
import type { Grid, Id, Point, Polygon, Project } from '../../../model/schema.ts'
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
import type { PlacedUnit } from './gfit/src/layout/level.ts'
import { layoutBasement } from './gfit/src/parking/adapter.ts'
import { flechasPorPasillo } from './flechas.ts'
import { intersection, signedArea, type Shape } from './gfit/src/model/geom.ts'
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
  /** excavación más cajones (sin indirectos) */
  costo: number
  /** el acomodo de un sótano tipo: su contorno, sus cajones, sus pasillos, su rampa y los núcleos que lo atraviesan */
  plano: { contorno: Shape; cajones: Ring[]; pasillos: Ring[]; rampas: Ring[]; nucleos: Ring[]; flechas: Ring[] }
}
/** Sótanos como máximo cuando el edificio no fija los suyos. */
export const SOTANOS_MAX = 5
/** m: el ancho de la rampa de cada edificio (doble sentido) */
export const RAMPA = 6
/** m: el pasillo de autos del sótano, que también es lo que mide cada boca de la rampa */
const PASILLO_SOTANO = 6
/** m: el entrepiso de sótano con que el motor de cajones mide la rampa (el de `layoutBasement`) */
const ENTREPISO_SOTANO = 3.3

type Uso = 'vivienda' | 'comercio' | 'nucleo'
const ring = (poly: Polygon): Ring => poly.map((q) => [q.x, q.y])

/**
 * Dónde arranca la rampa (0..1 del perímetro, como lo lee el motor de cajones) y si cabe con sus bocas. La rampa
 * paralela deja una boca de `boca` m antes del punto y otra después de su `largo`; el conjunto va centrado en el lado
 * más largo del contorno mayor. Pegada a una esquina, la boca de arranque se saldría del sótano.
 */
export function tRampa(contorno: Shape, boca: number, largo: number): { t: number; cabe: boolean; lado: number } {
  const mayor = contorno.filter((r) => signedArea(r) > 0).sort((a, b) => signedArea(b) - signedArea(a))[0]
  if (!mayor) return { t: 0, cabe: false, lado: 0 }
  const lados = mayor.map(([x, y], i) => { const [u, v] = mayor[(i + 1) % mayor.length]; return Math.hypot(u - x, v - y) })
  const total = lados.reduce((s, l) => s + l, 0)
  if (!(total > 0)) return { t: 0, cabe: false, lado: 0 }
  const k = lados.indexOf(Math.max(...lados))
  const antes = lados.slice(0, k).reduce((s, l) => s + l, 0)
  const L = lados[k]
  // centrado; el motor corre la rampa hacia el lado con más largo libre, así que el punto no pasa de la mitad
  const s = Math.min(Math.max(0, (L - largo) / 2), L / 2)
  return { t: (antes + s) / total, cabe: L >= largo + 2 * boca - 1e-6, lado: L }
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

export function derivar(p: Project, buildingId: Id, optionId?: Id | null): Derivado | null {
  const usos = p.residential?.usos
  if (!usos) return null
  const prog = new Map(p.masses.map((m) => [m.id, m.programId]))
  const usoDe = (dm: DerivedMass): Uso | undefined => {
    const id = prog.get(dm.id)
    return id ? usos[id]?.uso : undefined
  }
  const del = Object.values(massingDe(p, optionId).masses).filter((m) => m.buildingId === buildingId && !m.context && m.polygon.length >= 3)
  const solidos = del.filter((m) => usoDe(m) === 'vivienda' || usoDe(m) === 'comercio')
  if (!solidos.length) return null
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
    g, usos, params, p.residential!.tipos, norma,
  ])
  if (memo.has(firma)) return memo.get(firma)!
  const d = calcular(solidos, nucleos, usoDe, g, params, p, entrepiso('vivienda', ENTREPISO_VIVIENDA), entrepiso('comercio', ENTREPISO_COMERCIO), buildingId, norma)
  if (memo.size >= MAX) memo.delete(memo.keys().next().value!)
  memo.set(firma, d)
  return d
}

function calcular(
  solidos: DerivedMass[], nucleos: DerivedMass[], usoDe: (m: DerivedMass) => Uso | undefined, g: Grid | null,
  params: ReturnType<typeof paramsDe>, p: Project, fhViv: number, fhCom: number, buildingId: Id,
  norma: { far: number; height: number; cov: number; predio: number | null },
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
    const rings = [ring(m.polygon), ...m.holes.map(ring)]
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
  let plano: Estacionamiento['plano'] = { contorno: [], cajones: [], pasillos: [], rampas: [], nucleos: [], flechas: [] }
  let porSotano = 0, sotanos = 0
  let avisoRampa: string | null = null
  try {
    // un sótano para tener su contorno; el motor de cajones lo acomoda (los núcleos dibujados son obstáculos)
    const uno = calcOption({ id: 'o', name: 'o', buildings: [{ ...b, basements: 1 }] }, s, { geom, sections, siteArea: null })
    const bas = uno.bs[0].mass.basements[0]
    if (uno.bs[0].ok && bas) {
      // una rampa de doble sentido (6 m) sobre el lado más largo, con su boca dentro; los núcleos dibujados bajan
      const cores = nucleos.map((m) => ring(m.polygon))
      const largo = medidaDeRampa({ t: 0, ancho: RAMPA, largo: null, paralela: true }, ENTREPISO_SOTANO).largo
      const donde = tRampa(bas.shape, PASILLO_SOTANO, largo)
      const lay = layoutBasement(bas.shape, cores, { angle: 90, aisle: PASILLO_SOTANO, ramps: [{ t: donde.t, ancho: RAMPA }] })
      porSotano = lay.count
      // sin largo para las dos bocas, la rampa va entera y sus bocas (zona de maniobra) se recortan al sótano
      const [rp, ...bocas] = lay.ramps ?? []
      const rampas = rp ? [rp, ...(donde.cabe ? bocas : bocas.flatMap((b) => intersection([b], bas.shape)))] : []
      if (rp && !donde.cabe) avisoRampa = `La rampa (${largo.toFixed(1)} m) no cabe con sus dos bocas de ${PASILLO_SOTANO} m en el lado más largo del sótano (${donde.lado.toFixed(1)} m): las bocas quedan más cortas`
      plano = { contorno: bas.shape, cajones: lay.stalls, pasillos: lay.aisles, rampas, nucleos: cores, flechas: flechasPorPasillo(lay.aisles, lay.arrows) }
    }
    sotanos = params.sotanos ?? (porSotano > 0 ? Math.min(SOTANOS_MAX, Math.ceil(uno.req / porSotano)) : 0)
    totals = calcOption({ id: 'o', name: 'o', buildings: [{ ...b, basements: sotanos }] }, s, {
      geom, sections, siteArea: norma.predio, stalls: new Map([[buildingId, Array.from({ length: sotanos }, () => porSotano)]]),
    })
    modulo = avisosModulo()
  } finally {
    setUnitModule(null)
  }
  const r = totals.bs[0]
  const avisos0: string[] = avisoRampa ? [avisoRampa] : []
  const niveles = r.levels
  const precioM2 = new Map(s.unitTypes.map((t) => [t.id, t.price]))
  const unidades = niveles.flatMap((l) => (l.layout?.units ?? []).map((unidad) => ({ nivel: l.num, unidad, precio: unidad.area * (precioM2.get(unidad.type) ?? 0) })))
  const estacionamiento: Estacionamiento = { sotanos, porSotano, cajones: r.prov, requeridos: r.req, costo: r.costB.exc + r.costB.park, plano }
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
