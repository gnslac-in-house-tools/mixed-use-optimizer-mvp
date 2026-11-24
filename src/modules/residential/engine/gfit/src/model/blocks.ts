// A 3D-mass tower from its blocks (spec 2026-11-04-blocks §5.3–5.6): each Rhino solid is cut at its program's floor
// height into plates; plates at one elevation (5 cm) form a level band, L01… above ground and B1… below. Solid cores
// and a parking solid are cut at the same elevations. Pure: the host's sections come in, missing ones go out in `needs`.
import type { GeomObj, Ring } from '../host/protocol.ts'
import { area, autoCore, difference, intersection, toShape, union } from './geom.ts'
import type { Shape } from './geom.ts'
import { sectionZ } from './massing.ts'
import type { MassLevel, Massed } from './massing.ts'
import type { Program } from './programs.ts'
import type { Building } from './state.ts'

const r2 = (v: number) => Math.round(v * 100) / 100
const band = (z: number) => Math.round(z * 20) / 20
const lname = (n: number) => 'L' + String(n).padStart(2, '0')

interface Raw { k: number; id: string; p: Program; z: number; h: number; lobby: boolean; rings: Ring[] }

/** plate heights of one block: Residential at ground starts with the lobby; then the program's floor height, the last plate taking the difference */
function heights(z0: number, z1: number, p: Program, lobby: number | null): { z: number; h: number; lobby: boolean }[] {
  const out: { z: number; h: number; lobby: boolean }[] = []
  let z = z0
  if (lobby != null) { const h = r2(Math.min(lobby, z1 - z0)); out.push({ z, h, lobby: true }); z = r2(z + h) }
  if (z1 - z > 0.05) {
    const n = Math.max(1, Math.round((z1 - z) / p.fh))
    for (let i = 0; i < n; i++) { const h = i < n - 1 ? p.fh : r2(z1 - z); out.push({ z, h, lobby: false }); z = r2(z + h) }
  }
  return out
}

/** a parking solid cut from its top down every `pfh`, the last basement taking the difference (both tower modes) */
export function parkingCuts(pk: GeomObj, pfh: number, sec: (id: string, z: number) => Ring[] | null): { z: number; h: number; rings: Ring[] | null }[] {
  const out: { z: number; h: number; rings: Ring[] | null }[] = []
  const n = Math.max(1, Math.round((pk.bbox[5] - pk.bbox[2]) / pfh))
  let top = pk.bbox[5]
  for (let i = 0; i < n; i++) { const h = i < n - 1 ? pfh : r2(top - pk.bbox[2]); const z = r2(top - h); out.push({ z, h, rings: sec(pk.id, z) }); top = z }
  return out
}

export function cutBlocks(b: Building, geom: Map<string, GeomObj>, progs: Program[], sections: Map<string, Map<number, Ring[]>> | undefined, lobbyH: number): Massed {
  const issues: string[] = []
  const need = new Map<string, number[]>()
  const sec = (id: string, z: number): Ring[] | null => {
    const key = sectionZ(z)
    const r = sections?.get(id)?.get(key)
    if (r) return r
    const l = need.get(id) ?? []
    if (!l.includes(key)) l.push(key)
    need.set(id, l)
    return null
  }
  const none = (): Massed => ({ ok: false, issues, needs: [], levels: [], fp: [], cores: [], fpA: 0, height: 0, z0: 0, basements: [], coreParts: [] })
  if (!b.blocks.length) { issues.push('No solids assigned to a program'); return none() }

  const nameOf = (id: string, k: number) => geom.get(id)?.name || 'Solid ' + (k + 1)
  const present = b.blocks.map((x, k) => ({ ...x, k, o: geom.get(x.id) })).filter((x) => {
    if (!x.o) issues.push(x.id + ' is missing in Rhino')
    return !!x.o
  })
  const un = present.filter((x) => !progs.some((p) => p.id === x.prog)).length
  if (un) issues.push(un + (un === 1 ? ' solid' : ' solids') + ' without a program, not counted')
  const assigned = present.filter((x) => progs.some((p) => p.id === x.prog))
  if (!assigned.length) return none()
  const ground = b.groundAt ?? Math.min(...assigned.map((x) => x.o!.bbox[2]))

  // block plates
  const raws: Raw[] = []
  for (const x of assigned) {
    const p = progs.find((q) => q.id === x.prog)!
    const z0 = x.o!.bbox[2], z1 = x.o!.bbox[5]
    // mixed-use-mvp patch: lobbyH 0 = no lobby (every residential plate takes units)
    const hs = heights(z0, z1, p, p.id === 'res' && lobbyH > 0 && Math.abs(z0 - ground) < 0.05 ? lobbyH : null)
    const last = hs[hs.length - 1]
    if (last && !last.lobby && Math.abs(last.h - p.fh) > 0.01) issues.push(nameOf(x.id, x.k) + ': ' + (z1 - z0).toFixed(1) + ' m is not a multiple of ' + p.fh.toFixed(1) + ' m (last level ' + last.h.toFixed(1) + ' m)')
    for (const q of hs) { const rings = sec(x.id, q.z); raws.push({ k: x.k, id: x.id, p, z: q.z, h: q.h, lobby: q.lobby, rings: rings ?? [] }) }
  }

  // parking: a solid is cut from its top down; curves keep the basement counter
  const pkObjs = b.links.parking.map((id) => geom.get(id)).filter((o): o is GeomObj => !!o)
  const pkSolid = pkObjs.find((o) => o.kind === 'brep')
  const pkCuts = pkSolid ? parkingCuts(pkSolid, b.pfh, sec) : []
  if (!pkSolid) {
    const curves = pkObjs.filter((o) => o.closed && o.kind === 'curve')
    // the basement counter digs below whatever is lowest: the ground, or block plates under it
    const base = Math.min(ground, ...raws.map((r) => r.z))
    for (let k = 0; k < b.basements; k++) pkCuts.push({ z: r2(base - 3.3 * (k + 1)), h: 2.9, rings: curves.length ? curves.flatMap((o) => o.rings) : null })
  }

  // cores: curves on every plate, solids cut at each plate
  const coreObjs = b.links.core.map((id) => geom.get(id)).filter((o): o is GeomObj => !!o)
  const coreCurves = union([toShape(coreObjs.filter((o) => o.kind !== 'brep' && o.closed).flatMap((o) => o.rings))])
  const coreSolids = coreObjs.filter((o) => o.kind === 'brep')
  const coreAt = new Map<number, Shape>()
  const coresAt = (z: number): Shape => coreAt.get(z) ?? []
  // ask for every core section now, so one round trip brings plates and cores together
  for (const z of new Set([...raws.map((r) => r.z), ...pkCuts.map((c) => c.z)])) {
    const parts: Shape[] = [coreCurves]
    for (const o of coreSolids) { const r = sec(o.id, z); if (r && r.length) parts.push(toShape(r)) }
    coreAt.set(z, union(parts))
  }
  if (!b.links.core.length) issues.push('No cores, using an automatic core')

  if (need.size) return { ...none(), needs: [...need].map(([id, zs]) => ({ id, zs })), z0: ground }

  // level bands from block plates and parking cuts
  const keys = [...new Set([...raws.map((r) => band(r.z)), ...pkCuts.map((c) => band(c.z))])]
  const up = keys.filter((z) => z >= ground - 0.025).sort((a, c) => a - c)
  const dn = keys.filter((z) => z < ground - 0.025).sort((a, c) => c - a)
  const nameAt = new Map<number, [number, string]>([...up.map((z, i) => [z, [i + 1, lname(i + 1)]] as [number, [number, string]]), ...dn.map((z, i) => [z, [-(i + 1), 'B' + (i + 1)]] as [number, [number, string]])])

  // plates, overlaps counted once (the block linked first keeps them)
  raws.sort((a, c) => a.z - c.z || a.k - c.k)
  const taken = new Map<number, { shape: Shape; p: Program }[]>()
  const pairs = new Set<string>()
  const levels: MassLevel[] = []
  let resCore = false
  for (const r of raws) {
    const kz = band(r.z), [num, name] = nameAt.get(kz)!
    let shape = toShape(r.rings)
    const before = taken.get(kz) ?? []
    for (const t of before) {
      const lost = area(intersection(shape, t.shape))
      if (lost > 0.5) {
        shape = difference(shape, t.shape)
        const pk = t.p.id + '>' + r.p.id
        if (!pairs.has(pk)) { pairs.add(pk); issues.push('Blocks overlap at ' + name + ' (' + r.p.n + ' over ' + t.p.n + ')') }
      }
    }
    before.push({ shape: toShape(r.rings), p: r.p })
    taken.set(kz, before)
    const plateA = Math.max(0, area(shape))
    if (plateA < 0.01) continue
    const cores = b.links.core.length ? coresAt(r.z) : autoCore(shape)
    if (r.p.id === 'res' && cores.length && coreSolids.length) resCore = true
    levels.push({ num, name, elev: r2(r.z - ground), z: r.z, h: r.h, prog: r.p.id, col: r.p.col, shape, plateA, net: 0, sell: 0, block: r.id, cores, lobby: r.lobby, below: num < 0 })
  }
  // solid cores that never reach a residential plate: the automatic core there
  if (coreSolids.length && !resCore && levels.some((l) => l.prog === 'res')) {
    issues.push('Core solids do not reach the residential levels, using an automatic core')
    for (const l of levels) if (l.prog === 'res' && !l.cores.length) l.cores = autoCore(l.shape)
  }
  for (const l of levels) {
    const p = progs.find((q) => q.id === l.prog)!
    const net = l.lobby ? 0 : l.cores.length ? Math.max(0, area(difference(l.shape, l.cores))) : l.plateA
    l.net = net
    l.sell = (net * p.eff) / 100
  }

  const l01 = levels.filter((l) => l.num === 1)
  const fp = union(l01.map((l) => l.shape))
  const basements = pkCuts.map((c) => {
    const shape = c.rings ? toShape(c.rings) : fp
    const [, name] = nameAt.get(band(c.z))!
    return { name, z: c.z, h: c.h, shape: pkSolid ? shape : union([shape]), cores: b.links.core.length ? coresAt(c.z) : [] }
  })
  const above = levels.filter((l) => !l.below)
  const height = above.length ? r2(Math.max(...above.map((l) => l.z + l.h)) - ground) : 0
  const parts = new Map<number, { rings: Shape; z0: number; z1: number }>()
  for (const x of [...levels, ...basements]) {
    if (!x.cores.length || !b.links.core.length) continue
    const k = band(x.z), had = parts.get(k)
    // plates side by side share one core prism, as tall as the lowest of them
    if (!had || x.z + x.h < had.z1) parts.set(k, { rings: had?.rings ?? x.cores, z0: x.z, z1: r2(x.z + x.h) })
  }
  const coreParts = [...parts.values()].sort((a, c) => a.z0 - c.z0)
  return {
    ok: levels.length > 0, issues, needs: [], levels, fp, cores: union(levels.map((l) => l.cores)), fpA: area(fp), height, z0: ground, basements, coreParts,
  }
}
