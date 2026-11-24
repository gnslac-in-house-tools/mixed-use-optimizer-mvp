// The calculator (spec §6.4): units, stalls by program, areas, revenue, cost and zoning, per building and option.
import type { GeomObj, Ring } from '../host/protocol.ts'
import { area, difference, union } from './geom.ts'
import type { Shape } from './geom.ts'
import { massBuilding, parkingOutline } from './massing.ts'
import type { Massed, MassLevel } from './massing.ts'
import { layoutBuilding } from '../layout/building.ts'
import type { LevelLayout } from '../layout/level.ts'
import { priceFactor } from './rules.ts'
import type { Building, Option, State } from './state.ts'

export interface ProgResult { gfa: number; sell: number; circ: number; stallsRaw: number; rev: number; annual: number; cost: number; units: number; levels: number }
/** units and c (count per type, aligned with s.unitTypes) come from the WFC layout on residential levels */
export interface LevelResult extends MassLevel { program: string; units: number; c: number[]; layout?: LevelLayout }
export interface CostBreakdown { hard: number; exc: number; park: number; soft: number }

export interface BuildingResult {
  id: string
  name: string
  color: string
  ok: boolean
  issues: string[]
  mass: Massed
  levels: LevelResult[]
  gfa: number
  /** GFA of the plates above ground (FAR) */
  gfaAbove: number
  /** above-ground levels above the lobby */
  floors: number
  nsa: number
  circ: number
  units: number
  /** per unit type, aligned with s.unitTypes */
  counts: number[]
  revT: number[]
  areaT: number[]
  /** m² of the unit zones no unit took */
  unassigned: number
  revenue: number
  cost: number
  costB: CostBreakdown
  land: number
  prov: number
  perB: number
  pkShape: Shape
  pkA: number
  req: number
  reqRaw: number
  visitors: number
  prog: Record<string, ProgResult>
  height: number
  fpA: number
}

export interface Check { k: string; v: string; lim: string; ok: boolean }
export interface Totals {
  bs: BuildingResult[]
  gfa: number
  nsa: number
  circ: number
  units: number
  counts: number[]
  revT: number[]
  areaT: number[]
  unassigned: number
  revenue: number
  cost: number
  land: number
  prov: number
  req: number
  visitors: number
  fpA: number
  height: number
  floors: number
  prog: Record<string, ProgResult>
  siteA: number | null
  far: number | null
  cov: number | null
  checks: Check[]
}

export interface ModelCtx {
  geom: Map<string, GeomObj>
  /** sections per 3D mass object id, keyed by sectionZ */
  sections?: Map<string, Map<number, Ring[]>>
  /** stalls laid out on each basement, per building id (parking engine) */
  stalls?: Map<string, number[]>
  siteArea?: number | null
  /** mixed-use-mvp patch: obstacles on each building's street level (num 1), per building id: the parking ramp. They
   *  join the level's cores, so units avoid them and the net area drops; the plate, the footprint and the basements stay. */
  plantaBaja?: Map<string, Shape>
}

/** mixed-use-mvp patch: the street-level obstacles joined to the cores of every level num 1 (net and sell again). */
function conPlantaBaja(m: Massed, obst: Shape | undefined, progs: State['progs']): Massed {
  if (!m.ok || !obst?.length) return m
  const levels = m.levels.map((l) => {
    if (l.num !== 1) return l
    const cores = union([l.cores, obst])
    const net = l.lobby ? 0 : Math.max(0, area(difference(l.shape, cores)))
    const eff = progs.find((q) => q.id === l.prog)?.eff ?? 100
    return { ...l, cores, net, sell: (net * eff) / 100 }
  })
  return { ...m, levels }
}

const zeroProg = (): ProgResult => ({ gfa: 0, sell: 0, circ: 0, stallsRaw: 0, rev: 0, annual: 0, cost: 0, units: 0, levels: 0 })
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Stalls one basement holds when the parking engine has not run: the mockup's estimate. */
export function estimateStalls(pkA: number, angle: 90 | 60 | 45, aisle: number): number {
  const m2 = ({ 90: 27, 60: 29.5, 45: 32 } as const)[angle] + (aisle - 6) * 2.4
  return Math.floor((pkA * 0.88) / m2)
}

export function parkingShape(b: Building, m: Massed, geom: Map<string, GeomObj>): Shape {
  return m.basements[0]?.shape ?? parkingOutline(b, geom, m.fp)
}

/** `stalls`: per basement (the parking engine), or one count for every basement; missing = the estimate */
export function calcBuilding(m: Massed, b: Building, s: State, stalls?: number | number[], geom?: Map<string, GeomObj>): BuildingResult {
  const progs = s.progs, G = s.cg
  const res = progs.find((p) => p.id === 'res') ?? progs[0]
  const prog: Record<string, ProgResult> = {}
  progs.forEach((p) => (prog[p.id] = zeroProg()))
  const T = s.unitTypes
  const counts = T.map(() => 0), revT = T.map(() => 0), areaT = T.map(() => 0)
  let unassigned = 0
  const lay = m.ok ? layoutBuilding(m, b, s) : new Map<number, LevelLayout>()

  const levels: LevelResult[] = m.levels.map((l, i) => {
    const p = progs.find((x) => x.id === l.prog) ?? res
    const isRes = p.id === res.id
    const P = prog[p.id]
    const c = T.map(() => 0)
    const layout = isRes ? lay.get(i) : undefined
    const sell = layout ? layout.unitA : l.sell
    P.gfa += l.plateA; P.sell += sell; P.circ += l.plateA - sell; P.cost += l.plateA * p.cost; P.levels++
    if (layout) {
      for (const u of layout.units) {
        const k = T.findIndex((t) => t.id === u.type)
        if (k < 0) continue
        c[k]++
        const r = u.area * T[k].price * priceFactor(u, l.num, s.rules)
        revT[k] += r; areaT[k] += u.area; P.rev += r
        if (res.basis === 'unit') P.stallsRaw += T[k].stalls
      }
      c.forEach((n, k) => (counts[k] += n))
      if (res.basis === 'm2' && res.m2 > 0) P.stallsRaw += sell / res.m2
      P.units += layout.units.length
      unassigned += layout.leftover
    } else if (!isRes) {
      if (p.basis === 'm2' && p.m2 > 0) P.stallsRaw += sell / p.m2
      if (p.inc === 'rent') { const a = sell * p.rent * 12 * (G.occ / 100); P.annual += a; P.rev += G.cap > 0 ? a / (G.cap / 100) : 0 }
      else if (p.inc === 'sale') P.rev += sell * p.price
    }
    const program = isRes ? (l.lobby ? 'Lobby' : 'Residential') : p.n
    return { ...l, sell, program, units: layout ? layout.units.length : 0, c, ...(layout ? { layout } : {}) }
  })

  const pkShape = m.ok ? parkingShape(b, m, geom ?? new Map()) : []
  const pkA = Math.max(0, area(pkShape))
  // each basement cut holds its own stalls (spec blocks §5.6)
  const one = (a: number) => (typeof stalls === 'number' ? stalls : estimateStalls(a, b.angle, b.aisle))
  const per = m.ok ? m.basements.map((x, k) => (Array.isArray(stalls) ? stalls[k] ?? 0 : one(Math.max(0, area(x.shape))))) : []
  const perB = m.ok ? per[0] ?? one(pkA) : 0
  const prov = per.reduce((t, n) => t + n, 0)
  const exA = m.basements.reduce((t, x) => t + Math.max(0, area(x.shape)), 0)
  const visitors = (prog[res.id].stallsRaw * G.visitors) / 100
  const reqRaw = Object.values(prog).reduce((t, q) => t + q.stallsRaw, 0) + visitors
  const req = G.round === 'up' ? Math.ceil(reqRaw - 1e-9) : Math.round(reqRaw)
  const hard = Object.values(prog).reduce((t, q) => t + q.cost, 0)
  const costB: CostBreakdown = { hard, exc: exA * G.exc, park: prov * G.park, soft: 0 }
  costB.soft = ((costB.hard + costB.exc + costB.park) * G.soft) / 100
  const gfa = levels.reduce((t, l) => t + l.plateA, 0)
  const gfaAbove = levels.reduce((t, l) => t + (l.below ? 0 : l.plateA), 0)
  const floors = Math.max(0, new Set(levels.filter((l) => !l.below).map((l) => l.num)).size - 1)
  const nsa = levels.reduce((t, l) => t + l.sell, 0)
  return {
    id: b.id, name: b.name, color: b.color, ok: m.ok, issues: m.issues, mass: m, levels,
    gfa, gfaAbove, floors, nsa, circ: gfa - nsa, units: counts.reduce((a, n) => a + n, 0), counts, revT, areaT, unassigned,
    revenue: Object.values(prog).reduce((t, q) => t + q.rev, 0),
    cost: costB.hard + costB.exc + costB.park + costB.soft, costB, land: 0,
    prov, perB, pkShape, pkA, req: m.ok ? req : 0, reqRaw: m.ok ? reqRaw : 0, visitors: m.ok ? visitors : 0,
    prog, height: m.height, fpA: m.fpA,
  }
}

export function calcOption(o: Option, s: State, ctx: ModelCtx): Totals {
  const bs = o.buildings.map((b) => calcBuilding(conPlantaBaja(massBuilding(b, ctx.geom, s.progs, ctx.sections), ctx.plantaBaja?.get(b.id), s.progs), b, s, ctx.stalls?.get(b.id), ctx.geom))
  const sum = (k: 'gfa' | 'gfaAbove' | 'nsa' | 'circ' | 'units' | 'revenue' | 'cost' | 'prov' | 'req' | 'visitors' | 'fpA') => bs.reduce((t, r) => t + (r.ok ? r[k] : 0), 0)
  const fpA = sum('fpA')
  const land = s.cg.land * 1e6
  bs.forEach((r) => { if (r.ok) { r.land = fpA ? (land * r.fpA) / fpA : 0; r.cost += r.land } })
  const prog: Record<string, ProgResult> = {}
  s.progs.forEach((p) => {
    const q = zeroProg()
    bs.forEach((r) => { const x = r.prog[p.id]; if (x) (Object.keys(q) as (keyof ProgResult)[]).forEach((k) => (q[k] += x[k])) })
    prog[p.id] = q
  })
  const gfa = sum('gfa')
  const height = Math.max(0, ...bs.map((r) => (r.ok ? r.height : 0)))
  const siteA = ctx.siteArea ?? null
  const far = siteA ? sum('gfaAbove') / siteA : null
  const cov = siteA ? fpA / siteA : null
  const prov = sum('prov'), req = sum('req')
  const Z = s.zoning
  const checks: Check[] = []
  if (far != null) checks.push({ k: 'FAR', v: far.toFixed(2), lim: '≤ ' + Z.far.toFixed(2), ok: far <= Z.far })
  checks.push({ k: 'Height', v: height.toFixed(1) + ' m', lim: '≤ ' + Z.height + ' m', ok: height <= Z.height })
  if (cov != null) checks.push({ k: 'Coverage', v: Math.round(cov * 100) + '%', lim: '≤ ' + Z.cov + '%', ok: cov * 100 <= Z.cov })
  checks.push({ k: 'Parking', v: fmt(prov) + ' / ' + fmt(req), lim: 'provided ≥ required', ok: prov >= req })
  const per = (k: 'counts' | 'revT' | 'areaT') => s.unitTypes.map((_, i) => bs.reduce((t, r) => t + (r.ok ? r[k][i] ?? 0 : 0), 0))
  const counts = per('counts'), revT = per('revT'), areaT = per('areaT')
  return {
    bs, gfa, nsa: sum('nsa'), circ: sum('circ'), units: sum('units'), counts, revT, areaT, unassigned: bs.reduce((t, r) => t + (r.ok ? r.unassigned : 0), 0),
    revenue: sum('revenue'), cost: sum('cost') + (fpA ? 0 : 0), land: fpA ? land : 0, prov, req, visitors: sum('visitors'), fpA, height,
    floors: bs.reduce((t, r) => t + (r.ok ? r.floors : 0), 0),
    prog, siteA, far, cov, checks,
  }
}
