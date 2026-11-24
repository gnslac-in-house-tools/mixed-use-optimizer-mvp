// One residential level laid out with WFC units and rooms (spec 2026-11-04-program-wfc §5): zones and bands from
// the plate, the band WFC per run (longest chords first, each run only where earlier units left room), units
// clipped to the unit zone, small leftovers merged, rooms from the room WFC, rules as weights, a required rule
// that fails reseeds the level.
import { area, autoCore, difference, inside, intersection, offset, signedArea, union } from '../model/geom.ts'
import type { Pt, Shape } from '../model/geom.ts'
import type { RoomKind, RoomType, SRule, UnitType } from '../model/program.ts'
import { Q, solveBand } from './band.ts'
import type { BandRules, BandType } from './band.ts'
import { candidates, reachOf, runsOf, toWorld, zones } from './plate.ts'
import type { Frame, Run } from './plate.ts'
import { generateRooms } from './rooms.ts'
import { rng } from './rng.ts'

export type Dir = 'N' | 'S' | 'E' | 'W'
export interface PlacedRoom { name: string; kind: RoomKind; shape: Shape }
export interface PlacedUnit {
  id: string
  type: string
  shape: Shape
  area: number
  /** facade width, m */
  w: number
  /** touches a convex corner of the plate (two facades) */
  corner: boolean
  facing: Dir[]
  rooms: PlacedRoom[]
  /** the entry door, on the corridor side */
  entry: Pt
  issue?: string
}
export interface LevelLayout {
  units: PlacedUnit[]
  unitA: number
  /** m² of the unit zone no unit took */
  leftover: number
  issues: string[]
  attempts: number
  /** the first required rule this level could not meet */
  ruleFail?: string
}
export interface LevelInput {
  plate: Shape
  cores: Shape
  d: number
  cw: number
  num: number
  seed: number
  types: UnitType[]
  rooms: RoomType[]
  rules: SRule[]
  /** % per type id */
  mix: Record<string, number>
  below?: LevelLayout
}

const ENTRY: [number, number] = [0.45, 1.35]
const ATTEMPTS = 30
const live = (rules: SRule[]) => rules.filter((r) => r.on)
const inLevels = (r: SRule, n: number) => n >= (r.a ?? 1) && n <= (r.b ?? 999)

/** the widths a type offers on the 0.6 m grid inside its range */
export function widthsOf(t: UnitType): number[] {
  const out: number[] = []
  for (let w = t.wMin; w <= t.wMax + 1e-6; w += 0.6) out.push(Math.round(w * 100) / 100)
  return out.length ? out : [t.wMin]
}

interface Raw { type: string; run: number; x: number; w: number; flip: boolean; frame: Frame; d: number; shape: Shape; area: number; corner: boolean; facing: Dir[] }

function facingOf(f: Frame): Dir[] {
  const n: Pt = [-f.v[0], -f.v[1]]
  const out: Dir[] = []
  if (n[1] > 0.7071) out.push('N')
  if (n[0] > 0.7071) out.push('E')
  if (n[1] < -0.7071) out.push('S')
  if (n[0] < -0.7071) out.push('W')
  return out
}

const roomCache = new Map<string, ReturnType<typeof generateRooms>>()
function roomsFor(t: UnitType, all: RoomType[], w: number, d: number, seed: number) {
  const prog = t.rooms.map((id) => all.find((r) => r.id === id)).filter((r): r is RoomType => !!r)
  const key = JSON.stringify([prog, Math.round(w * 100), Math.round(d * 100), seed])
  let g = roomCache.get(key)
  if (!g) {
    // a few seeds before giving up: one unlucky draw should not leave a unit without rooms
    for (let k = 0; k < 5; k++) { g = generateRooms(w, d, prog, seed + k * 7717); if (!g.fail) break }
    if (roomCache.size > 2000) roomCache.delete(roomCache.keys().next().value!)
    roomCache.set(key, g!)
  }
  return g!
}

/** a rectangle in a band's frame, as a world ring */
const quad = (f: Frame, x0: number, x1: number, y0: number, y1: number): Shape => [[toWorld(f, x0, y0), toWorld(f, x1, y0), toWorld(f, x1, y1), toWorld(f, x0, y1)]]

const shift = (s: Shape, dx: number, dy: number): Shape => s.map((r) => r.map((p) => [p[0] + dx, p[1] + dy] as Pt))

/**
 * Solved in local coordinates (the plate's lower-left corner at 0,0) and moved back: plates drawn in UTM sit at
 * 10⁶ m, where every Clipper call and point test would lose sub-mm precision and the layout would differ from
 * the same plate at the origin.
 */
export function layoutLevel(i: LevelInput): LevelLayout {
  const pts = i.plate.flat()
  if (!pts.length) return solveLevel(i)
  const ox = Math.min(...pts.map((p) => p[0])), oy = Math.min(...pts.map((p) => p[1]))
  if (!ox && !oy) return solveLevel(i)
  const below = i.below && { ...i.below, units: i.below.units.map((u) => ({ ...u, shape: shift(u.shape, -ox, -oy) })) }
  const L = solveLevel({ ...i, plate: shift(i.plate, -ox, -oy), cores: shift(i.cores, -ox, -oy), ...(below ? { below } : {}) })
  return {
    ...L,
    units: L.units.map((u) => ({
      ...u, shape: shift(u.shape, ox, oy), entry: [u.entry[0] + ox, u.entry[1] + oy] as Pt,
      rooms: u.rooms.map((r) => ({ ...r, shape: shift(r.shape, ox, oy) })),
    })),
  }
}

function solveLevel(i: LevelInput): LevelLayout {
  const issues: string[] = []
  const cores = i.cores.length ? i.cores : autoCore(i.plate)
  const z = zones(i.plate, cores, i.d, i.cw)
  const rules = live(i.rules)
  // types this level may use: required level rules remove the others
  let types = i.types.filter((t) => t.wMax >= t.wMin)
  for (const r of rules) {
    if (r.strength !== 'required' || !inLevels(r, i.num)) continue
    if (r.kind === 'levels-only') types = types.filter((t) => r.types.includes(t.id))
    if (r.kind === 'levels-never') types = types.filter((t) => !r.types.includes(t.id))
  }
  const zoneA = Math.max(0, area(z.unit))
  if (!types.length) return { units: [], unitA: 0, leftover: zoneA, issues: ['No unit type is allowed on L' + String(i.num).padStart(2, '0')], attempts: 0 }
  // the band only offers widths where the type's rooms fit at this depth; a type that fits nowhere keeps its
  // widths (its units count, with the reason) so the plate is never silently emptied
  const fits = types.map((t) => ({ t, all: widthsOf(t), fit: widthsOf(t).filter((w) => !roomsFor(t, i.rooms, w, z.d, i.seed).fail) }))
  for (const f of fits) if (!f.fit.length) issues.push(f.t.name + ' does not fit a ' + z.d.toFixed(1) + ' m deep unit')
  const anyFit = fits.some((f) => f.fit.length)
  if (anyFit) types = fits.filter((f) => f.fit.length).map((f) => f.t)
  const bandTypes: BandType[] = fits.filter((f) => !anyFit || f.fit.length).map((f) => ({ id: f.t.id, widths: anyFit ? f.fit : f.all }))
  const minW = Math.min(...bandTypes.flatMap((t) => t.widths))
  // mix shares 0–1, with preferred level rules as weights
  const mix: Record<string, number> = {}
  for (const t of types) mix[t.id] = Math.max(0, i.mix[t.id] ?? 0)
  for (const r of rules) {
    if (r.strength !== 'preferred' || !inLevels(r, i.num)) continue
    for (const t of types) {
      if (r.kind === 'levels-only') mix[t.id] *= r.types.includes(t.id) ? 2 : 1
      if (r.kind === 'levels-never' && r.types.includes(t.id)) mix[t.id] *= 0.5
    }
  }
  const msum = Object.values(mix).reduce((a, b) => a + b, 0)
  for (const t of types) mix[t.id] = msum ? mix[t.id] / msum : 1 / types.length
  const nn = rules.filter((r) => r.kind === 'never-next' && r.types.length >= 1)
  const along = (a: string, b: string) => {
    let f = 1
    for (const r of nn) {
      const [x, y] = [r.types[0], r.types[1] ?? r.types[0]]
      if ((a === x && b === y) || (a === y && b === x)) f *= r.strength === 'required' ? 0 : 0.3
    }
    return f
  }
  const bandRules: BandRules = { types: bandTypes, mix, along }
  const cornerRules = rules.filter((r) => r.kind === 'corners')
  const coreRules = rules.filter((r) => r.kind === 'core-face')
  const stack = rules.some((r) => r.kind === 'stack')
  const nearCore = coreRules.length && z.cores.length ? offset(z.cores, 3) : []
  const required = rules.filter((r) => r.strength === 'required' && r.kind === 'at-least')

  const cands = candidates(i.plate, z)
  let best: { raw: Raw[]; fails: string[]; attempts: number } | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const r = rng(i.seed * 977 + i.num * 131 + attempt)
    const raw: Raw[] = []
    const rects: { f: Frame; x0: number; x1: number; d: number }[] = []
    const taken = (p: Pt) => rects.some((q) => {
      const dx = p[0] - q.f.o[0], dy = p[1] - q.f.o[1]
      const x = dx * q.f.u[0] + dy * q.f.u[1], y = dx * q.f.v[0] + dy * q.f.v[1]
      return x > q.x0 - 1e-6 && x < q.x1 + 1e-6 && y > -1e-6 && y < q.d + 1e-6
    })
    const counts: Record<string, number> = {}
    let runIx = 0
    for (const c of cands) {
      for (const run0 of runsOf(c, z, taken)) {
        // a slot no unit can serve (its door cannot reach the corridor, or the along rules contradict there)
        // splits the run: both sides are solved on their own, the slot itself is left over
        const queue: Run[] = [run0]
        for (let solves = 0; queue.length && solves < 40; solves++) {
          const run = queue.shift()!
          if (run.x1 - run.x0 < minW - 1e-6) continue
          const ri = runIx++
          const len = run.x1 - run.x0
          const runNow = run
          const bias = (t: string, xm: number) => {
            let f = 1
            const atCorner = (runNow.convexStart && xm < 6) || (runNow.convexEnd && xm > len - 6)
            if (atCorner) for (const cr of cornerRules) if (cr.types.includes(t)) f *= cr.strength === 'required' ? 10 : 3
            if (nearCore.length) {
              const p = toWorld(runNow.frame, runNow.x0 + xm, z.d + z.cw + 1.5)
              if (inside(nearCore, p)) for (const cr of coreRules) if (cr.types.includes(t)) f *= cr.strength === 'required' ? 0.02 : 0.3
            }
            if (stack && i.below) {
              const p = toWorld(runNow.frame, runNow.x0 + xm, z.d / 2)
              const u = i.below.units.find((b) => inside(b.shape, p))
              if (u && u.type === t) f *= 2
            }
            return f
          }
          const res = solveBand({ name: 'B' + ri, length: len, reach: reachOf(run, z), entry: ENTRY, bias }, bandRules, r, counts)
          if (res.ok) {
            for (const u of res.units) {
              const x0 = run.x0 + u.x, x1 = x0 + u.w
              rects.push({ f: run.frame, x0, x1, d: z.d })
              const shape = intersection(quad(run.frame, x0, x1, 0, z.d), z.unit)
              raw.push({
                type: u.t, run: ri, x: x0, w: u.w, flip: u.flip, frame: run.frame, d: z.d, shape, area: Math.max(0, area(shape)),
                corner: (run.convexStart && u.x < Q) || (run.convexEnd && u.x + u.w > len - Q), facing: facingOf(run.frame),
              })
            }
            continue
          }
          // the stretches between the slots no unit can serve (or around the one that broke) go back in the queue
          const bad = res.slots?.length ? res.slots : [res.slot ?? 0]
          const sc = len / (Q * Math.max(1, Math.round(len / Q)))
          const parts: Run[] = []
          let from = 0
          for (const k of [...bad, Infinity]) {
            const to = Math.min(len, k * Q * sc)
            if (to - from >= minW - 1e-6) parts.push({ ...run, x0: run.x0 + from, x1: run.x0 + to, convexStart: run.convexStart && from < 1e-6, convexEnd: run.convexEnd && to > len - 1e-6 })
            from = Math.min(len, (k + 1) * Q * sc)
          }
          queue.unshift(...parts)
        }
      }
    }
    // a unit clipped below 60 % of its rectangle joins its neighbour in the run; alone, it is leftover
    for (let k = 0; k < raw.length; k++) {
      const u = raw[k]
      if (u.area >= 0.6 * u.w * u.d) continue
      const prev = k > 0 && raw[k - 1].run === u.run ? raw[k - 1] : null
      const next = !prev && k + 1 < raw.length && raw[k + 1].run === u.run ? raw[k + 1] : null
      const into = prev ?? next
      if (into) {
        into.shape = union([into.shape, u.shape])
        into.area += u.area
        into.w += u.w
        if (next) into.x = u.x
        into.corner = into.corner || u.corner
      }
      raw.splice(k, 1)
      k--
    }
    // overlaps across bands (slanted corners): later units give way to earlier ones
    for (let k = 1; k < raw.length; k++) {
      const others = raw.slice(0, k).filter((o) => o.run !== raw[k].run)
      const hit = others.filter((o) => area(intersection(o.shape, raw[k].shape)) > 1e-4)
      if (hit.length) { raw[k].shape = difference(raw[k].shape, union(hit.map((o) => o.shape))); raw[k].area = Math.max(0, area(raw[k].shape)) }
    }
    // what no band reached — wedges where a chord's run starts late, the strip between a chord and its arc, the
    // ends of a slab — goes to the units next to it: run-end units grow along their band (up to 4.5 m), then every
    // unit takes what lies within 0.7 m (the chord tolerance). Always clipped to what is still free: no overlaps.
    if (raw.length) {
      let rest = difference(z.unit, union(raw.map((u) => u.shape)))
      const grow = (u: Raw, add: Shape) => {
        if (area(add) <= 0.01) return
        u.shape = union([u.shape, add])
        u.area = Math.max(0, area(u.shape))
        rest = difference(rest, add)
      }
      raw.forEach((u, k) => {
        if (!rest.length) return
        const first = k === 0 || raw[k - 1].run !== u.run, last = k === raw.length - 1 || raw[k + 1].run !== u.run
        if (first) grow(u, intersection(quad(u.frame, u.x - 4.5, u.x, 0, u.d), rest))
        if (last) grow(u, intersection(quad(u.frame, u.x + u.w, u.x + u.w + 4.5, 0, u.d), rest))
      })
      // then small pieces left whole (the strip between a chord and its arc) join the unit they touch most
      for (const piece of rest) {
        const pa = signedArea(piece)
        if (pa <= 0.05 || pa > 25) continue
        const grown = offset([piece], 0.1)
        let host: Raw | null = null, contact = 0
        for (const u of raw) { const c = area(intersection(grown, u.shape)); if (c > contact + 1e-6) { contact = c; host = u } }
        if (host && contact > 0.01 && pa < 0.5 * host.area) { host.shape = union([host.shape, [piece]]); host.area = Math.max(0, area(host.shape)) }
      }
    }
    // last word on overlaps: each unit yields to the ones before. Unions of touching pieces leave crumbs below half
    // a square metre: drop those outers. Holes stay: a small hole is often exactly where an earlier unit reaches in.
    const crumbs = (s: Shape) => s.filter((r) => signedArea(r) < 0 || signedArea(r) >= 0.5)
    // Pair by pair, not against one union of the earlier units: that union can lose a small ring (clipper2-js),
    // and the unit after it then keeps the overlap (0.26 m² on a 2500-point circle).
    const box = (sh: Shape) => { const ps = sh.flat(); return ps.length ? [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))] : [0, 0, -1, -1] }
    const boxes: number[][] = []
    raw.forEach((u, k) => {
      u.shape = crumbs(u.shape)
      let bb = box(u.shape)
      for (let j = 0; j < k; j++) {
        const o = boxes[j]
        if (o[0] > bb[2] || bb[0] > o[2] || o[1] > bb[3] || bb[1] > o[3]) continue
        if (area(intersection(u.shape, raw[j].shape)) <= 1e-4) continue
        u.shape = crumbs(difference(u.shape, raw[j].shape))
        // when clipper2-js still leaves a piece of the neighbour, cut that piece (1 cm larger), then ring by ring
        for (let t = 0; t < 4; t++) {
          const ov = intersection(u.shape, raw[j].shape)
          if (area(ov) <= 1e-4) break
          u.shape = crumbs(t < 2 ? difference(u.shape, offset(ov, 0.01 * (t + 1))) : raw[j].shape.filter((r) => signedArea(r) > 0).reduce((acc, r) => difference(acc, [r]), u.shape))
        }
        bb = box(u.shape)
      }
      u.area = Math.max(0, area(u.shape))
      boxes.push(bb)
    })
    const fails: string[] = []
    for (const q of required) {
      const have = raw.filter((u) => q.types.includes(u.type)).length
      if (have < (q.n ?? 1)) fails.push('At least ' + (q.n ?? 1) + ' ' + q.types.join('/') + ' per level')
    }
    const score = (b: { raw: Raw[]; fails: string[] }) => -b.fails.length * 1e6 + b.raw.length * 1e3 + b.raw.reduce((a, u) => a + u.area, 0)
    const cand = { raw, fails, attempts: attempt + 1 }
    if (!best || score(cand) > score(best)) best = cand
    if (!fails.length && raw.length) break
    if (!raw.length && attempt >= 2) break
  }
  const B = best!
  const units: PlacedUnit[] = B.raw.filter((u) => u.area > 0).map((u, k) => {
    const t = types.find((x) => x.id === u.type)!
    const g = roomsFor(t, i.rooms, u.w, u.d, i.seed)
    // room frame: x along the unit (mirrored when flipped), y = 0 corridor … d facade; band frame: y = 0 facade
    const toBand = (rx: number, ry: number): Pt => toWorld(u.frame, u.flip ? u.x + u.w - rx : u.x + rx, u.d - ry)
    const rooms: PlacedRoom[] = g.fail ? [] : g.rooms.map((rm) => {
      const ring = [toBand(rm.r[0], rm.r[1]), toBand(rm.r[2], rm.r[1]), toBand(rm.r[2], rm.r[3]), toBand(rm.r[0], rm.r[3])]
      return { name: rm.name, kind: rm.kind, shape: intersection([ring], u.shape) }
    }).filter((rm) => area(rm.shape) > 0.05)
    return {
      id: 'L' + String(i.num).padStart(2, '0') + '-' + String(k + 1).padStart(2, '0'),
      type: u.type, shape: u.shape, area: u.area, w: u.w, corner: u.corner, facing: u.facing, rooms,
      entry: toBand(g.entry, 0), ...(g.fail ? { issue: g.fail } : {}),
    }
  })
  const unitA = units.reduce((a, u) => a + u.area, 0)
  if (!units.length) issues.push('No unit fits this plate')
  return { units, unitA, leftover: Math.max(0, zoneA - unitA), issues, attempts: B.attempts, ...(B.fails.length ? { ruleFail: B.fails[0] } : {}) }
}
