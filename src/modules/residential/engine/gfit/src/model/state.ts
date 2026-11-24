// The panel's whole state. The plugin keeps it in the .3dm (plug-in document data) as JSON with schema 1.
import { CG0, PROGS0 } from './programs'
import type { Globals, Program } from './programs'
import { normMix, ROOM_KINDS, ROOMS0, RULE_KINDS, RULES0, UNIT_TEMPLATES, UNITS0 } from './program'
import type { RoomType, SRule, UnitType } from './program'
import { VIEWS } from '../host/protocol'
import type { View3D } from '../host/protocol'
import type { ParkingFlow, ParkingLayout } from '../parking/adapter'

export type Kind = 'footprint' | 'core' | 'parking' | 'mass'

export interface Building {
  id: string
  name: string
  color: string
  open: boolean
  /** Rhino object GUIDs by role */
  links: Record<Kind, string[]>
  mode: 'fp' | 'mass'
  levels: number
  lobbyH: number
  typH: number
  /** level number from which the plate is offset inward; > levels = no setback */
  setbackFrom: number
  setbackDist: number
  /** % per unit type id, summing to 100 */
  mix: Record<string, number>
  /** depth of the unit band from the facade, m */
  unitDepth: number
  /** corridor width, m */
  corridor: number
  seed: number
  basements: number
  angle: 90 | 60 | 45
  aisle: number
  /** how the stalls are laid out: Auto, Grid (parallel rows) or Circuit (a ring aisle along the perimeter) */
  pkLayout: ParkingLayout
  /** Two-way or One-way aisles */
  pkFlow: ParkingFlow
  /** podium levels per program id, from the ground in program order; the rest is residential (footprint mode) */
  stack: Record<string, number>
  /** 3D mass: Rhino solids in link order, each with one program (null = Unassigned) — spec blocks §5.1 */
  blocks: Block[]
  /** absolute elevation of L01, m; null = the lowest block (Auto) */
  groundAt: number | null
  /** floor-to-floor of a parking solid's basements, m */
  pfh: number
}

export interface Block { id: string; prog: string | null }

export interface Option { id: string; name: string; buildings: Building[] }

export interface CtxItem { id: string; name: string; kind: 'cbld' | 'trees' | 'other'; h: number; show: boolean }
export interface CtxLayer { id: string; name: string; open: boolean; show: boolean; items: CtxItem[] }

export type Rule = SRule

export interface Zoning { far: number; height: number; cov: number }

export interface Ui {
  step: number
  visited: number[]
  chips: string[]
  scope: string
  dscope: string
  cscope: string
  fold: Record<string, boolean>
  menu: string | null
  calcOpen: string | null
  renaming: string | null
  ctxLayer: string | null
  sel: string
  active: string
  info: boolean
  /** how the Rhino preview draws the towers */
  view: View3D
  /** the level Detail draws in full; 0 = the top residential level */
  vlevel: number
  /** Inputs fills the panel (the Tree button) */
  tree: boolean
}

export interface State {
  schema: 1
  options: Option[]
  activeOpt: string
  progs: Program[]
  cg: Globals
  rules: SRule[]
  rooms: RoomType[]
  unitTypes: UnitType[]
  zoning: Zoning
  site: string | null
  context: { open: boolean; layers: CtxLayer[] }
  ui: Ui
  seq: number
  /** the last client link (it holds the key: the .3dm is the only other place it lives) */
  share?: { url: string; at: string }
}

export const BCOL = ['#e07b39', '#2f9e6b', '#8b5cf6', '#d94f70', '#3b82c4', '#b08a2e']

export function blankBuilding(id: string, i: number): Building {
  return {
    id, name: 'Tower ' + id, color: BCOL[i % BCOL.length], open: true,
    links: { footprint: [], core: [], parking: [], mass: [] },
    mode: 'mass', levels: 24, lobbyH: 4.5, typH: 3.2, setbackFrom: 99, setbackDist: 3,
    mix: { studio: 30, br1: 45, br2: 25 }, unitDepth: 8.1, corridor: 1.6, seed: 1187, basements: 2, angle: 90, aisle: 6.0, pkLayout: 'auto', pkFlow: 'two', stack: {},
    blocks: [], groundAt: null, pfh: 3.3,
  }
}

export function fresh(): State {
  return {
    schema: 1,
    options: [{ id: 'o1', name: 'Option 1', buildings: [blankBuilding('A', 0)] }],
    activeOpt: 'o1',
    progs: PROGS0(),
    cg: { ...CG0 },
    rules: RULES0(),
    rooms: ROOMS0(),
    unitTypes: UNITS0(),
    zoning: { far: 9, height: 90, cov: 60 },
    site: null,
    context: { open: false, layers: [{ id: 'L1', name: 'Neighbours', open: true, show: true, items: [] }] },
    ui: { step: 3, visited: [0, 1, 2, 3], chips: ['gfa', 'units', 'parking', 'revenue'], scope: 'all', dscope: 'all', cscope: 'all', fold: {}, menu: null, calcOpen: null, renaming: null, ctxLayer: 'L1', sel: '', active: 'A', info: false, view: 'solid', vlevel: 0, tree: false },
    seq: 1,
  }
}

/** How Rhino tells layer names apart once Bake has made them (":" becomes "-", case ignored). */
export const layerKey = (n: string) => n.trim().replace(/:/g, '-').toLowerCase()

/** `want`, or `want (2)`, `want (3)`… so that no two options (or buildings in one option) bake to the same layer. */
export function uniqueName(want: string, taken: string[]): string {
  const used = new Set(taken.map(layerKey))
  if (!used.has(layerKey(want))) return want
  for (let k = 2; ; k++) if (!used.has(layerKey(want + ' (' + k + ')'))) return want + ' (' + k + ')'
}

/** A new building in the option, named by the first free letter A…Z. */
export function newBuilding(o: Option): Building {
  const used = new Set(o.buildings.map((b) => b.id))
  const id = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c)) ?? 'T' + (o.buildings.length + 1)
  const b = blankBuilding(id, o.buildings.length)
  b.name = uniqueName(b.name, o.buildings.map((x) => x.name))
  o.buildings.push(b)
  return b
}

/** The state saved in the document, or a fresh one with a warning when it cannot be used. */
export function parseSaved(json: string | null): { state: State; warning?: string } {
  if (json == null || json === '') return { state: fresh() }
  let v: unknown
  try { v = JSON.parse(json) } catch { return { state: fresh(), warning: 'Saved GFit data could not be read; starting fresh.' } }
  if (!isObj(v) || v.schema !== 1) return { state: fresh(), warning: 'Saved GFit data is from another version; starting fresh.' }
  const rooms = roomsOf((v as Record<string, any>).rooms)
  const unitTypes = unitTypesOf((v as Record<string, any>).unitTypes, (v as Record<string, any>).progs, rooms)
  const options = Array.isArray(v.options) ? v.options.filter((o): o is Record<string, any> => isObj(o) && Array.isArray(o.buildings)).map((o, i) => option(o, i, unitTypes)) : []
  if (!options.length) return { state: fresh(), warning: 'Saved GFit data has no options; starting fresh.' }
  options.forEach((o, i) => {
    o.name = uniqueName(o.name, options.slice(0, i).map((x) => x.name))
    o.buildings.forEach((b, k) => { b.name = uniqueName(b.name, o.buildings.slice(0, k).map((x) => x.name)) })
  })
  const f = fresh()
  const s = v as Record<string, any>
  const activeOpt = options.some((o) => o.id === s.activeOpt) ? (s.activeOpt as string) : options[0].id
  const act = options.find((o) => o.id === activeOpt)!
  const ui = uiOf(s.ui, f.ui)
  if (!act.buildings.some((b) => b.id === ui.active)) ui.active = act.buildings[0]?.id ?? 'A'
  const progs = progsOf(s.progs, f.progs)
  const rules = Array.isArray(s.rules) ? rulesOf(s.rules, unitTypes, isObj(s.cg) ? s.cg.prem : undefined) : f.rules
  const warn = fixBlocks(options, progs)
  const share = isObj(s.share) && typeof s.share.url === 'string' && URL_OK.test(s.share.url) ? { url: s.share.url, at: str(s.share.at, '') } : undefined
  // every field is rebuilt from the defaults: a damaged or hand-edited save cannot reach the math or the HTML with a wrong type
  return {
    state: {
      ...f, options, activeOpt, ui, progs, rules, rooms, unitTypes, share,
      context: { open: bool(s.context?.open, f.context.open), layers: isObj(s.context) && Array.isArray(s.context.layers) ? s.context.layers.filter(isObj).map(layerOf) : f.context.layers },
      cg: numsOf(s.cg, f.cg),
      zoning: numsOf(s.zoning, f.zoning),
      site: id(s.site) ?? null,
      seq: Number.isFinite(s.seq) && s.seq > 0 ? Math.floor(s.seq) : f.seq,
    },
    ...(warn.length ? { warning: warn.join(' · ') } : {}),
  }
}

/** ids end up in data attributes and selectors: letters, digits, _ and - (Rhino GUIDs fit) */
const ID = /^[A-Za-z0-9_-]{1,64}$/
const HEX = /^#[0-9a-fA-F]{3,8}$/
const URL_OK = /^https:\/\/[^\s"'<>`]+$/
const id = (v: unknown): string | undefined => (typeof v === 'string' && ID.test(v) ? v : undefined)
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(id).filter((x): x is string => !!x) : [])
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d)
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d)
const pick = <T,>(v: unknown, of: readonly T[], d: T): T => (of.includes(v as T) ? (v as T) : d)

/** numeric fields by the defaults' keys; a wrong type keeps the default */
function numsOf<T extends object>(v: unknown, d: T): T {
  const o = isObj(v) ? v : {}
  return Object.fromEntries(Object.entries(d).map(([k, x]) => [k, typeof x === 'number' ? num(o[k], x) : k === 'round' ? pick(o[k], ['up', 'near'], x) : x])) as T
}

function progsOf(v: unknown, d: Program[]): Program[] {
  if (!Array.isArray(v)) return d
  const out: Program[] = []
  for (const x of v.filter(isObj)) {
    const pid = id(x.id)
    if (!pid || out.some((p) => p.id === pid)) continue
    const base: Program = d.find((p) => p.id === pid) ?? { ...d[1], id: pid, n: 'Program', col: '#888888' }
    const p: Program = {
      ...base, id: pid, n: str(x.n, base.n), col: color(x.col, base.col),
      inc: pick(x.inc, ['sale', 'rent', 'none'] as const, base.inc), basis: pick(x.basis, ['unit', 'm2', 'none'] as const, base.basis),
      m2: num(x.m2, base.m2, 0.01), eff: num(x.eff, base.eff, 0, 100), cost: num(x.cost, base.cost, 0), rent: num(x.rent, base.rent, 0),
      price: num(x.price, base.price, 0), fh: num(x.fh, base.fh, 1, 30),
    }
    out.push(p)
  }
  if (!out.some((p) => p.id === 'res')) out.unshift(d.find((p) => p.id === 'res')!)
  return out
}

/** v0.1 rule ids → sentence rules (spec §8); text is never read from a save */
const V01: Record<string, (on: boolean, prem: number) => SRule> = {
  corner2br: (on) => ({ id: 'corner2br', kind: 'corners', on, strength: 'preferred', types: ['br2'] }),
  one2br: (on) => ({ id: 'one2br', kind: 'at-least', on, strength: 'preferred', types: ['br2'], n: 1 }),
  studiocore: (on) => ({ id: 'studiocore', kind: 'core-face', on, strength: 'preferred', types: ['studio'] }),
  premium: (on, prem) => ({ id: 'premium', kind: 'price-levels', on, strength: 'preferred', types: [], n: 15, p: prem }),
}

function rulesOf(v: unknown[], types: UnitType[], prem: unknown): SRule[] {
  const known = new Set(types.map((t) => t.id))
  const out: SRule[] = []
  v.filter(isObj).forEach((x, i) => {
    let r: SRule | null = null
    if (typeof x.kind !== 'string' && typeof x.id === 'string' && V01[x.id]) r = V01[x.id](bool(x.on, true), num(prem, 8, -100, 1000))
    else if (RULE_KINDS.includes(x.kind)) {
      r = {
        id: id(x.id) ?? 'r' + (i + 1), kind: x.kind, on: bool(x.on, true), strength: pick(x.strength, ['required', 'preferred'] as const, 'preferred'),
        types: ids(x.types), a: Math.round(num(x.a, 2, 1, 999)), b: Math.round(num(x.b, 99, 1, 999)), n: num(x.n, x.kind.startsWith('price') ? 15 : 1, 0, 999), p: num(x.p, 0, -100, 1000),
        dir: pick(x.dir, ['N', 'S', 'E', 'W'] as const, 'N'),
      }
    }
    if (!r) return
    r.types = r.types.filter((t) => known.has(t))
    while (out.some((o) => o.id === r!.id)) r.id += '2'
    out.push(r)
  })
  return out
}

function roomsOf(v: unknown): RoomType[] {
  if (!Array.isArray(v)) return ROOMS0()
  const T = ROOMS0()
  const out: RoomType[] = []
  v.filter(isObj).forEach((x, i) => {
    const rid = id(x.id) ?? 'R-' + (i + 1)
    if (out.some((r) => r.id === rid)) return
    const base = T.find((r) => r.id === rid) ?? T[0]
    const a0 = Array.isArray(x.area) ? num(x.area[0], base.area[0], 0, 500) : base.area[0]
    const a1 = Array.isArray(x.area) ? num(x.area[1], base.area[1], 0, 500) : base.area[1]
    out.push({
      id: rid, name: str(x.name, base.name), kind: pick(x.kind, ROOM_KINDS, base.kind), area: [Math.min(a0, a1), Math.max(a0, a1)],
      minWidth: num(x.minWidth, base.minWidth, 0.6, 20), facade: pick(x.facade, ['required', 'preferred', 'no'] as const, base.facade), wet: bool(x.wet, base.wet),
      near: Array.isArray(x.near) ? x.near.filter((k: unknown) => ROOM_KINDS.includes(k as RoomType['kind'])) : base.near,
      w: num(x.w, base.w, 0.6, 30), d: num(x.d, base.d, 0.6, 30),
    })
  })
  return out
}

/** unit types from the save, or v0.1's three with the residential program's per-type price and stalls */
function unitTypesOf(v: unknown, progs: unknown, rooms: RoomType[]): UnitType[] {
  const roomIds = new Set(rooms.map((r) => r.id))
  if (!Array.isArray(v) || !v.some(isObj)) {
    const res = Array.isArray(progs) ? progs.find((p) => isObj(p) && p.id === 'res') : null
    const old: unknown[] = isObj(res) && Array.isArray(res.units) ? res.units : []
    return UNITS0().map((t, k) => {
      const u = old[k]
      const rr = t.rooms.filter((x) => roomIds.has(x))
      return isObj(u) ? { ...t, rooms: rr, price: num(u.p, t.price, 0), stalls: num(u.r, t.stalls, 0, 20) } : { ...t, rooms: rr }
    })
  }
  const T = UNIT_TEMPLATES()
  const out: UnitType[] = []
  v.filter(isObj).forEach((x, i) => {
    if (out.length >= 8) return
    let uid = id(x.id) ?? 'u' + (i + 1)
    while (out.some((t) => t.id === uid)) uid += '2'
    const base = T.find((t) => t.id === uid) ?? T[Math.min(i, T.length - 1)]
    const w0 = num(x.wMin, base.wMin, 2.4, 30)
    const w1 = num(x.wMax, base.wMax, 2.4, 30)
    out.push({
      id: uid, name: str(x.name, base.name), color: color(x.color, base.color),
      rooms: Array.isArray(x.rooms) ? x.rooms.filter((r: unknown): r is string => typeof r === 'string' && roomIds.has(r)) : base.rooms.filter((r) => roomIds.has(r)),
      wMin: Math.min(w0, w1), wMax: Math.max(w0, w1), price: num(x.price, base.price, 0), stalls: num(x.stalls, base.stalls, 0, 20),
    })
  })
  return out.length ? out : UNITS0()
}

function layerOf(l: Record<string, any>, i: number): CtxLayer {
  const items: CtxItem[] = Array.isArray(l.items)
    ? l.items.filter((it: unknown): it is Record<string, any> => isObj(it) && !!id(it.id)).map((it: Record<string, any>) => ({ id: it.id as string, name: str(it.name, 'Object'), kind: pick(it.kind, ['cbld', 'trees', 'other'] as const, 'other'), h: num(it.h, 0), show: bool(it.show, true) }))
    : []
  return { id: id(l.id) ?? 'L' + (i + 1), name: str(l.name, 'Layer ' + (i + 1)), open: bool(l.open, true), show: bool(l.show, true), items }
}

function uiOf(v: unknown, d: Ui): Ui {
  const u = isObj(v) ? v : {}
  return {
    ...d,
    step: Math.round(num(u.step, d.step, 0, 8)), visited: Array.isArray(u.visited) ? u.visited.filter((x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 8) : d.visited,
    chips: Array.isArray(u.chips) ? ids(u.chips) : d.chips, scope: id(u.scope) ?? d.scope, dscope: id(u.dscope) ?? d.dscope, cscope: id(u.cscope) ?? d.cscope,
    fold: isObj(u.fold) ? Object.fromEntries(Object.entries(u.fold).filter(([k, x]) => ID.test(k) && typeof x === 'boolean')) as Record<string, boolean> : {},
    menu: null, calcOpen: null, renaming: null, ctxLayer: id(u.ctxLayer) ?? d.ctxLayer,
    sel: typeof u.sel === 'string' && /^[A-Za-z0-9_:|-]{0,80}$/.test(u.sel) ? u.sel : '',
    active: id(u.active) ?? d.active, info: bool(u.info, false),
    view: pick(u.view, VIEWS, d.view), vlevel: Math.round(num(u.vlevel, d.vlevel, 0, 999)), tree: bool(u.tree, d.tree),
  }
}

/** Every Rhino object a tower links: its inputs and the solids of its programs (Rhino watches all of them). */
export function linkedOf(b: Building): string[] {
  return [...Object.values(b.links).flat(), ...b.blocks.map((k) => k.id)]
}

function blocksOf(v: unknown): Block[] {
  const out: Block[] = []
  if (Array.isArray(v)) for (const x of v.filter(isObj)) { const bid = id(x.id); if (bid && !out.some((k) => k.id === bid)) out.push({ id: bid, prog: id(x.prog) ?? null }) }
  return out
}

/**
 * v0.2 masses become one block without a program; programs that no longer exist become Unassigned; a solid twice in
 * one option stays in its first tower (spec blocks §5.2, §5.10). Returns the warnings.
 */
function fixBlocks(options: Option[], progs: Program[]): string[] {
  const warn: string[] = []
  const known = new Set(progs.map((p) => p.id))
  for (const o of options) {
    const owner = new Map<string, string>()
    for (const b of o.buildings) {
      if (b.links.mass.length) {
        for (const m of b.links.mass) if (!b.blocks.some((k) => k.id === m)) b.blocks.push({ id: m, prog: null })
        if (b.mode === 'mass') warn.push(b.name + ': program levels now come from blocks; assign one per block')
        b.links.mass = []
      }
      b.blocks = b.blocks.filter((k) => {
        const first = owner.get(k.id)
        if (first) { warn.push(b.name + ': ' + k.id + ' is also in ' + first + '; kept in ' + first); return false }
        owner.set(k.id, b.name)
        return true
      })
      for (const k of b.blocks) if (k.prog && !known.has(k.prog)) k.prog = null
    }
  }
  return warn
}

function isObj(v: unknown): v is Record<string, any> { return !!v && typeof v === 'object' && !Array.isArray(v) }

function option(o: Record<string, any>, i: number, types: UnitType[]): Option {
  const buildings: Building[] = []
  for (const [k, b] of (o.buildings as unknown[]).filter(isObj).entries()) {
    let bid = id(b.id) ?? String.fromCharCode(65 + (k % 26))
    while (buildings.some((x) => x.id === bid)) bid = bid + '2'
    const d = blankBuilding(bid, k)
    const L = isObj(b.links) ? b.links : {}
    // v0.1 kept the mix as a [studio, 1BR, 2BR] tuple
    const mix0: Record<string, number> = Array.isArray(b.mix) ? Object.fromEntries(['studio', 'br1', 'br2'].map((t, q) => [t, num(b.mix[q], 0, 0, 100)])) : isObj(b.mix) ? b.mix : d.mix
    const mix = normMix(mix0, types)
    const stack = isObj(b.stack) ? Object.fromEntries(Object.entries(b.stack).filter(([k2, x]) => ID.test(k2) && typeof x === 'number' && Number.isFinite(x) && x >= 0).map(([k2, x]) => [k2, Math.round(x as number)])) : {}
    buildings.push({
      ...d, name: str(b.name, d.name), color: color(b.color, d.color), open: bool(b.open, d.open),
      links: { footprint: ids(L.footprint), core: ids(L.core), parking: ids(L.parking), mass: ids(L.mass) },
      // a save without a mode predates 3D mass as the default: it was a footprint tower
      mode: pick(b.mode, ['fp', 'mass'] as const, 'fp'), levels: Math.round(num(b.levels, d.levels, 1, 300)), lobbyH: num(b.lobbyH, d.lobbyH, 1, 30), typH: num(b.typH, d.typH, 1, 30),
      setbackFrom: Math.round(num(b.setbackFrom, d.setbackFrom, 1, 999)), setbackDist: num(b.setbackDist, d.setbackDist, 0, 500), mix, seed: num(b.seed, d.seed),
      basements: Math.round(num(b.basements, d.basements, 0, 20)), angle: pick(b.angle, [90, 60, 45] as const, d.angle), aisle: num(b.aisle, d.aisle, 1, 30), stack,
      pkLayout: pick(b.pkLayout, ['auto', 'grid', 'circuit'] as const, 'auto'), pkFlow: pick(b.pkFlow, ['two', 'one'] as const, 'two'),
      unitDepth: num(b.unitDepth, d.unitDepth, 5.4, 12), corridor: num(b.corridor, d.corridor, 1.2, 2.4),
      blocks: blocksOf(b.blocks), groundAt: typeof b.groundAt === 'number' && Number.isFinite(b.groundAt) ? Math.max(-1000, Math.min(1000, b.groundAt)) : null,
      pfh: typeof b.pfh === 'number' && Number.isFinite(b.pfh) ? Math.min(6, Math.max(2.6, b.pfh)) : d.pfh,
    })
  }
  return { id: id(o.id) ?? 'o' + (i + 1), name: str(o.name, 'Option ' + (i + 1)), buildings }
}
