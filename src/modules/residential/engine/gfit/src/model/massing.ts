// Levels of one building from its linked footprint (or 3D mass sections), spec §6.2–6.3.
import type { GeomObj, Ring } from '../host/protocol.ts'
import { area, difference, isSimple, offset, toShape, union } from './geom.ts'
import type { Shape } from './geom.ts'
import type { Program } from './programs.ts'
import type { Building } from './state.ts'
import { cutBlocks, parkingCuts } from './blocks.ts'

export interface MassLevel {
  num: number
  name: string
  /** elevation above the building's ground */
  elev: number
  /** absolute Z in Rhino */
  z: number
  h: number
  prog: string
  col: string
  shape: Shape
  plateA: number
  net: number
  sell: number
  /** 3D mass: the Rhino solid this plate is cut from */
  block?: string
  /** cores at this plate */
  cores: Shape
  /** a Residential plate at L01 that is the lobby (no units) */
  lobby?: boolean
  /** below the ground: a B band (num < 0) */
  below?: boolean
}

/** one basement cut: its B band name, plate and the cores at that elevation */
export interface MassBasement { name: string; z: number; h: number; shape: Shape; cores: Shape }

export interface Massed {
  ok: boolean
  issues: string[]
  /** section keys (level base + 0.05 m) still waiting from the host, per Rhino object */
  needs: { id: string; zs: number[] }[]
  levels: MassLevel[]
  fp: Shape
  cores: Shape
  fpA: number
  height: number
  z0: number
  basements: MassBasement[]
  /** core prisms to draw: one per plate (3D mass) or one for the tower (footprint) */
  coreParts: { rings: Shape; z0: number; z1: number }[]
}

/** The key a mass section is stored under: level base + 0.05 m, to the mm. */
export const sectionZ = (z: number) => Math.round((z + 0.05) * 1000) / 1000

const levelName = (n: number) => 'L' + String(n).padStart(2, '0')
const AUTO_CORE = 0.09

function linked(ids: string[], geom: Map<string, GeomObj>, issues: string[], what: string): GeomObj[] {
  const out: GeomObj[] = []
  for (const id of ids) {
    const o = geom.get(id)
    if (o) out.push(o)
    else if (!issues.includes(what + ' is missing in Rhino')) issues.push(what + ' is missing in Rhino')
  }
  return out
}

/** A ring whose points lie on one line in plan (within 5 cm): a curve drawn in Front or Right view. */
function edgeOn(r: Ring): boolean {
  if (r.length < 2) return true
  const a = r[0]
  const b = r.reduce((f, p) => (Math.hypot(p[0] - a[0], p[1] - a[1]) > Math.hypot(f[0] - a[0], f[1] - a[1]) ? p : f), a)
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L < 0.05) return true
  return r.every((p) => Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L < 0.05)
}

/** The parking outline: linked parking curves (nested even-odd), else the footprint. */
export function parkingOutline(b: Building, geom: Map<string, GeomObj>, fp: Shape): Shape {
  // parking curves are read by their outline; a parking solid is cut into basements instead (parkingCuts)
  const pk = b.links.parking.map((id) => geom.get(id)).filter((o): o is GeomObj => !!o && o.closed && o.kind !== 'brep')
  return pk.length ? union([toShape(pk.flatMap((o) => o.rings))]) : fp
}

/** `sections`: mass sections per Rhino object id, keyed by sectionZ */
export function massBuilding(b: Building, geom: Map<string, GeomObj>, progs: Program[], sections?: Map<string, Map<number, Ring[]>>): Massed {
  if (b.mode === 'mass') return cutBlocks(b, geom, progs, sections, b.lobbyH)
  const issues: string[] = []
  const empty = (z0 = 0): Massed => ({ ok: false, issues, needs: [], levels: [], fp: [], cores: [], fpA: 0, height: 0, z0, basements: [], coreParts: [] })
  const res = progs.find((p) => p.id === 'res') ?? progs[0]

  // ground plate
  let fp: Shape = []
  let z0 = 0
  {
    const objs = linked(b.links.footprint, geom, issues, 'Footprint')
    if (!b.links.footprint.length) { issues.push('No footprint linked'); return empty() }
    if (!objs.length) return empty()
    if (objs.some((o) => o.rings.length && o.rings.every(edgeOn))) { issues.push('Footprint has no area in plan (drawn in Front or Right view?)'); return empty() }
    if (objs.some((o) => !o.closed || !o.rings.length || o.rings.some((r) => !isSimple(r)))) { issues.push('Footprint is not a simple closed curve'); return empty() }
    // curves nest even-odd across objects: a curve inside another is a hole (spec blocks §5.7)
    fp = union([toShape(objs.flatMap((o) => o.rings))])
    z0 = Math.min(...objs.map((o) => o.z))
  }

  // cores
  const cores: Shape = union(linked(b.links.core, geom, issues, 'Core').filter((o) => o.closed).map((o) => toShape(o.rings)))
  if (!b.links.core.length) issues.push('No cores, using an automatic core')

  // program stack from the ground, in program order
  const stack: Program[] = []
  for (const p of progs) if (p.id !== res.id) for (let k = 0; k < (b.stack[p.id] ?? 0); k++) stack.push(p)

  const levels: MassLevel[] = []
  let elev = 0
  let collapsedAt = 0
  const sb = b.setbackFrom <= b.levels ? offset(fp, -b.setbackDist) : fp
  for (let i = 0; i < b.levels; i++) {
    const num = i + 1
    const p = stack[i] ?? res
    const isRes = p.id === res.id
    const h = i === 0 ? Math.max(b.lobbyH, isRes ? 0 : p.fh) : isRes ? b.typH : p.fh
    const shape: Shape = num >= b.setbackFrom ? sb : fp
    if (num >= b.setbackFrom && !shape.length && !collapsedAt) collapsedAt = num
    const plateA = Math.max(0, area(shape))
    const net0 = !plateA ? 0 : cores.length ? Math.max(0, area(difference(shape, cores))) : plateA * (1 - AUTO_CORE)
    const lobby = i === 0 ? net0 * (isRes ? 1 : 0.2) : 0
    const net = net0 - lobby
    levels.push({ num, name: levelName(num), elev, z: z0 + elev, h, prog: p.id, col: p.col, shape, plateA, net, sell: (net * p.eff) / 100, cores, lobby: i === 0 && isRes })
    elev += h
  }
  if (collapsedAt) issues.push('Setback leaves no plate from ' + levelName(collapsedAt))
  // nothing is built above the last plate (top of a 3D mass, or a collapsed setback): height and floors stop there
  while (levels.length && !levels[levels.length - 1].plateA) levels.pop()
  const top = levels[levels.length - 1]
  const height = top ? top.elev + top.h : 0
  // a parking solid is cut from its top down every Parking floor, like in 3D mass; until Rhino answers, its outline stands in
  const pkSolid = b.links.parking.map((id) => geom.get(id)).find((o): o is GeomObj => !!o && o.kind === 'brep')
  const need: number[] = []
  const sec = (id: string, z: number): Ring[] | null => {
    const key = sectionZ(z), r = sections?.get(id)?.get(key)
    if (!r) need.push(key)
    return r ?? null
  }
  const pk = parkingOutline(b, geom, fp)
  const basements = pkSolid
    ? parkingCuts(pkSolid, b.pfh, sec).map((c, k) => ({ name: 'B' + (k + 1), z: c.z, h: c.h, shape: toShape(c.rings ?? pkSolid.rings), cores }))
    : Array.from({ length: b.basements }, (_, k) => ({ name: 'B' + (k + 1), z: z0 - 3.3 * (k + 1), h: 2.9, shape: pk, cores }))
  const coreParts = cores.length ? [{ rings: cores, z0, z1: z0 + height + 3.5 }] : []
  const needs = pkSolid && need.length ? [{ id: pkSolid.id, zs: need }] : []
  return { ok: true, issues, needs, levels, fp, cores, fpA: area(fp), height, z0, basements, coreParts }
}
