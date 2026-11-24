// Packing masses of one size in the buildable area (Phase 8.6, Decision "Agent sees the site"): rows of rectangles
// along a direction, each row as many as fit with `gap` between them, rows `gap` apart. With docks, rows go in pairs
// facing each other across a shared truck court (`court` deep, which no mass enters and which stays inside the site
// with a road's width to spare, as the docks' own rule asks: modules/docks/engine/docks.ts), pairs back to back `gap`
// apart; each mass turns so its front (where its program's docks go) faces the court. Many layouts are tried (the
// rows' directions, the masses' proportions and areas, where the first row starts, where each row's run stands in its
// room); the best few that fall short have the room they leave filled with rows of any direction; the ones that place
// most come
// first. Exact for polygons: a row's room is where its whole depth is inside, found at every vertex of the outline
// between its edges. Pure; the caller checks the result with the app's own checks (derive).
import type { Point, Polygon } from '../../model/schema.ts'
import { difference, offset, type Region } from '../geom/boolean.ts'

export interface PackInput {
  /** Where masses may stand (the buildable area less what is there, kept `gap` off). */
  room: Region[]
  /** Where courts may lie (the site, a road's width in, less the masses there). */
  courtRoom: Region[]
  count: number
  /** m² per mass to try, the preferred first. */
  areas: number[]
  /** long side / short side, to try. */
  aspects: number[]
  /** degrees counter-clockwise: the directions the rows may run. */
  angles: number[]
  /** m between masses, side by side and back to back. */
  gap: number
  /** m: the depth of a shared truck court (docks on the masses' fronts); null: no docks. */
  court: number | null
}

/** A mass placed: a rectangle as the model keeps it (Footprint 'rect'). */
export interface PackedMass {
  center: Point
  width: number
  depth: number
  rotation: number
}

export interface Packed {
  masses: PackedMass[]
  area: number
  aspect: number
  angle: number
}

/** Starts tried for the first row, per period of rows. */
const PHASES = 16
/** Layouts kept of one direction, proportion and size. */
const PER_KIND = 2
/** Layouts whose leftover room is filled. */
const FILLED = 12
/** m: a hair inside the room, so a mass on its edge is not counted out by rounding. */
const EPS = 1e-6

type Interval = [number, number]

/** Where a horizontal line at `v` is inside the rings (even-odd: outer rings and their holes). */
function across(rings: Polygon[], v: number): Interval[] {
  const xs: number[] = []
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      if ((a.y > v) !== (b.y > v)) xs.push(a.x + ((v - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
  xs.sort((p, q) => p - q)
  const out: Interval[] = []
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]])
  return out
}

function meet(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  for (const [p, q] of a)
    for (const [r, s] of b) {
      const lo = Math.max(p, r)
      const hi = Math.min(q, s)
      if (hi > lo) out.push([lo, hi])
    }
  return out
}

/** Where a band from v0 to v1 lies whole inside the rings: what is inside at both its edges and at every vertex between. */
function band(rings: Polygon[], v0: number, v1: number): Interval[] {
  const at = [v0 + EPS, v1 - EPS]
  for (const r of rings) for (const q of r) if (q.y > v0 && q.y < v1) at.push(q.y - EPS, q.y + EPS)
  return at.reduce<Interval[] | null>((acc, v) => (acc === null ? across(rings, v) : meet(acc, across(rings, v))), null) ?? []
}

/** The rings seen from a frame turned `angle`: u along the rows (as x), v across them (as y). */
function framed(regions: Region[], angle: number): Polygon[] {
  const c = Math.cos((angle * Math.PI) / 180)
  const s = Math.sin((angle * Math.PI) / 180)
  return regions.flat().map((r) => r.map((q) => ({ x: q.x * c + q.y * s, y: -q.x * s + q.y * c })))
}

/** Where a run stands in its room: at its start, centred, at its end (the slack goes after, round or before it). */
const ALIGN = [0, 0.5, 1]

/** As many as fit in each interval, `gap` apart; `align` places the run in it. */
function runs(intervals: Interval[], w: number, gap: number, align: number): number[] {
  const starts: number[] = []
  for (const [a, b] of intervals) {
    const n = Math.floor((b - a + gap) / (w + gap) + 1e-9)
    if (n <= 0) continue
    const slack = b - a - (n * w + (n - 1) * gap)
    for (let k = 0; k < n; k++) starts.push(a + slack * align + k * (w + gap))
  }
  return starts
}

/** One layout: rows from `start` across the room, in the frame of `angle`. */
function layout(input: PackInput, rooms: Polygon[], courts: Polygon[], angle: number, w: number, d: number, start: number, end: number, align: number): PackedMass[] {
  const { gap, court } = input
  const c = Math.cos((angle * Math.PI) / 180)
  const s = Math.sin((angle * Math.PI) / 180)
  const world = (u: number, v: number) => ({ x: u * c - v * s, y: u * s + v * c })
  const out: PackedMass[] = []
  // a row from v to v + d; `faces`: +1 its front (docks) toward +v, −1 toward −v; 0: no docks
  const row = (v: number, faces: number, courtFrom: number) => {
    let room = band(rooms, v, v + d)
    if (court !== null && faces !== 0) room = meet(room, band(courts, courtFrom, courtFrom + court))
    for (const u of runs(room, w, gap, align))
      out.push({
        center: world(u + w / 2, v + d / 2),
        width: w,
        depth: d,
        // a rect's front is its local bottom (−v at 0°): turned half round, it faces +v
        rotation: ((angle + (faces > 0 ? 180 : 0)) % 360 + 360) % 360,
      })
  }
  if (court === null) {
    for (let v = start; v < end; v += d + gap) row(v, 0, 0)
    return out
  }
  for (let v = start; v < end; v += 2 * d + court + gap) {
    row(v, 1, v + d)
    row(v + d + court, -1, v + d)
  }
  return out
}

type Found = Packed & { placed: number }

/** Every layout of the input's directions, sizes, proportions, starts and alignments. */
function search(input: PackInput): Found[] {
  const found: Found[] = []
  for (const angle of input.angles) {
    const rooms = framed(input.room, angle)
    const courts = framed(input.courtRoom, angle)
    const ys = rooms.flat().map((q) => q.y)
    if (ys.length === 0) continue
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)]
    for (const area of input.areas)
      for (const aspect of input.aspects) {
        const w = Math.sqrt(area * aspect)
        const d = area / w
        const period = input.court === null ? d + input.gap : 2 * d + input.court + input.gap
        for (let k = 0; k < PHASES; k++)
          for (const align of ALIGN) {
            const masses = layout(input, rooms, courts, angle, w, d, lo - period + (period * (k + 1)) / PHASES, hi, align)
            found.push({ masses, placed: masses.length, area, aspect, angle })
          }
      }
  }
  return found.sort(rank(input.count))
}

const rank = (count: number) => (a: Found, b: Found) => Math.min(b.placed, count) - Math.min(a.placed, count) || b.area - a.area || b.placed - a.placed

/** A placed mass's outline, and its court's (in front of its front: its local bottom). */
function outlines(m: PackedMass, court: number | null): Polygon[] {
  const r = (m.rotation * Math.PI) / 180
  const at = (x: number, y: number) => ({ x: m.center.x + x * Math.cos(r) - y * Math.sin(r), y: m.center.y + x * Math.sin(r) + y * Math.cos(r) })
  const [hw, hd] = [m.width / 2, m.depth / 2]
  const own = [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)]
  return court === null ? [own] : [own, [at(-hw, -hd - court), at(hw, -hd - court), at(hw, -hd), at(-hw, -hd)]]
}

/** Short of `count`, the room a layout leaves filled with more of its masses, in rows of any direction (turned too). */
function fill(input: PackInput, f: Found): Found {
  if (f.placed >= input.count) return f
  const taken = f.masses.flatMap((m) => outlines(m, input.court))
  const room = difference(input.room.flat(), offset(taken, input.gap).flat())
  const courtRoom = difference(input.courtRoom.flat(), f.masses.map((m) => outlines(m, null)[0]))
  const more = search({ ...input, room, courtRoom, count: input.count - f.placed, areas: [f.area], aspects: [f.aspect] })[0]
  return more && more.placed > 0 ? { ...f, masses: [...f.masses, ...more.masses], placed: f.placed + more.placed } : f
}

/** The layouts that place most first (then the larger masses), every mass each places (it may be more than `count`: spares). */
export function pack(input: PackInput, keep = 12): Packed[] {
  const first = search(input)
  // the best few, filled where they fall short
  const found = [...first.slice(0, FILLED).map((f) => fill(input, f)), ...first.slice(FILLED)].sort(rank(input.count))
  // varied: a few of each direction, proportion and size, so one that fails the checks is not tried over and over
  const seen = new Set<string>()
  const kinds = new Map<string, number>()
  const out: Packed[] = []
  for (const f of found) {
    const sig = f.masses.map((m) => `${Math.round(m.center.x)},${Math.round(m.center.y)}`).join(';')
    const kind = `${f.angle}|${f.aspect}|${f.area}`
    if (seen.has(sig) || (kinds.get(kind) ?? 0) >= PER_KIND) continue
    seen.add(sig)
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    out.push({ masses: f.masses, area: f.area, aspect: f.aspect, angle: f.angle })
    if (out.length >= keep) break
  }
  return out
}
