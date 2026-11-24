// Kept for the migration alone (Decision "Streets", ST.4: no road is derived; legacy/toStreets.ts).
// The ring roads (Decision "Exterior circulation", 4.4; settled by the stress pass, Decision "Circulation stress
// pass"). Each building's masses, each as its minimum rectangle grown on every side (past its truck court where that
// side docks, by the ring clearance where not, plus half a road), merged: a ring per group. Then every two rings that
// meet, of one building or two, are settled:
//   merge   no room for a road between them with both clearances: one ring round both (two dock walls 60 m apart
//           share their courts, as a shared truck court does)
//   share   two of their sides would run side by side with less between them than two rows of stalls: both move to
//           the line halfway and one road serves both
// The rings are kept half a road inside the site; a side's stretch over a mass, deep in a truck court, or sharing its
// paving with another ring's side or a road the designer keeps (side by side) is left out, so the network never
// doubles a road. Pure.
import type { Id, Point, Polygon } from '../../../model/schema.ts'
import type { StandardFigures } from '../standards.ts'
import { intersection, offset, regionsArea, union, type Region } from '../../geom/boolean.ts'
import { minimumRectangle } from '../../geom/rectangle.ts'
import { bounds, boundsTouch, pointInPolygon, signedArea, toCounterClockwise } from '../../geom/polygon.ts'
import type { DerivedDock, DerivedMass } from '../../types.ts'
import type { LegacyOption, LegacyRoad } from './types.ts'
import { obstacleOf } from '../route.ts'

/** cos 20°: a docked wall faces a side of its mass's rectangle when its normal is this close to the side's. */
const FACING = Math.cos((20 * Math.PI) / 180)
/** m²: two rings sharing less than this only touch. */
const TOUCH = 1
/** cos 10°: a ring's edge this square to the gap faces it (it moves to the shared line, turned or stepped). */
const FACES = Math.cos(Math.PI / 18)
/** sin 5°: a ring's side this parallel to another's, their paving overlapping, is one road. */
const PARALLEL = Math.sin(Math.PI / 36)
/** sin 10°: a road the designer keeps this parallel to a ring's side, close enough to share paving, replaces it. */
const ALONG = Math.sin(Math.PI / 18)

interface Ring {
  key: string // `<building>:<k>`: its roads' ids start with it
  building: string // merged: the first one's
  region: Polygon // its centreline, closed, counter-clockwise
  masses: Polygon[] // the masses it goes round
}

const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y
const perp = (u: Point): Point => ({ x: -u.y, y: u.x })
const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y })
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** The outer rings of a boolean's regions, counter-clockwise, without slivers. */
const outers = (rs: Region[]): Polygon[] => rs.map((r) => r[0]).filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > TOUCH).map(toCounterClockwise)

/** m: a point this close to the line through its neighbours is on it (the booleans round to a tenth of a millimetre). */
const STRAIGHT = 0.01

/** A ring's corners: the points on a straight run dropped, until none is left. */
export function corners(ring: Polygon): Polygon {
  let out = [...ring]
  for (let changed = true; changed && out.length > 3; ) {
    changed = false
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i - 1 + out.length) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      const l = Math.hypot(c.x - a.x, c.y - a.y)
      const off = l < 1e-9 ? 0 : Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / l
      // on the line between them (not a spike back on itself)
      if (off < STRAIGHT && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0) {
        out = [...out.slice(0, i), ...out.slice(i + 1)]
        changed = true
        i--
      }
    }
  }
  return out
}

/** A mass's minimum rectangle grown on each side: past its court where a docked wall faces it, else by the clearance; plus half a road. */
function grownOf(m: DerivedMass, docks: DerivedDock[], s: StandardFigures): Polygon {
  const half = s.roadWidth / 2
  const r = minimumRectangle(m.polygon)
  const v = perp(r.u)
  const mine = docks.filter((d) => d.massId === m.id)
  const side = (n: Point) => (mine.some((d) => dot(d.out, n) >= FACING) ? s.courtDepth : s.ringClear) + half
  const [pu, mu, pv, mv] = [side(r.u), side({ x: -r.u.x, y: -r.u.y }), side(v), side({ x: -v.x, y: -v.y })]
  const at = (a: number, b: number) => ({ x: r.center.x + r.u.x * a + v.x * b, y: r.center.y + r.u.y * a + v.y * b })
  const hl = r.length / 2
  const hw = r.width / 2
  return [at(-hl - mu, -hw - mv), at(hl + pu, -hw - mv), at(hl + pu, hw + pv), at(-hl - mu, hw + pv)]
}

/** One building's rings: its masses' grown rectangles merged, each group a ring. */
function buildingRings(building: string, masses: DerivedMass[], docks: DerivedDock[], s: StandardFigures): Ring[] {
  const grown = masses.map((m) => ({ m, g: grownOf(m, docks, s) }))
  if (grown.length === 0) return []
  const centre = (g: Polygon) => lerp(g[0], g[2], 0.5)
  return outers(union(grown.map((x) => x.g), [])).map((region, k) => ({
    key: `${building}:${k}`,
    building,
    region,
    masses: grown.filter((x) => pointInPolygon(centre(x.g), region)).map((x) => x.m.polygon),
  }))
}

/**
 * The region with the edges that face `n` (square to it within 10°, no deeper than `depth` from its outermost point
 * `x1`) moved out to the line at `l`: a turned or stepped side straightens onto it. Unchanged when no edge faces it.
 */
function extend(R: Polygon, n: Point, x1: number, l: number, depth: number): Polygon {
  if (l - x1 < 1e-3) return R
  const onLine = (q: Point) => ({ x: q.x + n.x * (l - dot(q, n)), y: q.y + n.y * (l - dot(q, n)) })
  const pieces: Polygon[] = []
  R.forEach((a, i) => {
    const b = R[(i + 1) % R.length]
    const e = sub(b, a)
    const L = Math.hypot(e.x, e.y)
    // out of a counter-clockwise polygon: to the right of its edge
    if (L < 1e-6 || dot({ x: e.y / L, y: -e.x / L }, n) < FACES || Math.max(dot(a, n), dot(b, n)) < x1 - depth) return
    pieces.push(toCounterClockwise([a, b, onLine(b), onLine(a)]))
  })
  if (pieces.length === 0) return R
  const o = outers(union([R], pieces))
  return o.length === 1 ? corners(o[0]) : R
}

type Verdict = { kind: 'apart' } | { kind: 'merge'; region: Polygon } | { kind: 'share'; a: Polygon; b: Polygon }

/** How two rings live together (see the header). `room`: what two sides need between them to stay two roads. */
function settle(A: Ring, B: Ring, room: number): Verdict {
  const meet = () => regionsArea(intersection([A.region], [B.region])) > TOUCH
  const merged = (): Verdict => {
    const o = outers(union([A.region], [B.region]))
    return o.length === 1 ? { kind: 'merge', region: corners(o[0]) } : { kind: 'apart' }
  }
  // the direction across the gap: of the masses' sides' normals, the one they are most apart along
  let n: Point | null = null
  let gap = -Infinity
  const ends = (ms: Polygon[], c: Point) => ms.flatMap((m) => m.map((q) => dot(q, c)))
  for (const m of [...A.masses, ...B.masses]) {
    const u = minimumRectangle(m).u
    for (const c of [u, perp(u), { x: -u.x, y: -u.y }, { x: u.y, y: -u.x }]) {
      const g = Math.min(...ends(B.masses, c)) - Math.max(...ends(A.masses, c))
      if (g > gap) [gap, n] = [g, c]
    }
  }
  // masses that interlock: one ring if their rings overlap
  if (!n || gap <= 0) return meet() ? merged() : { kind: 'apart' }
  const x1 = Math.max(...A.region.map((q) => dot(q, n)))
  const x2 = Math.min(...B.region.map((q) => dot(q, n)))
  const t = perp(n)
  const ta = A.region.map((q) => dot(q, t))
  const tb = B.region.map((q) => dot(q, t))
  const lateral = Math.min(Math.max(...ta), Math.max(...tb)) - Math.max(Math.min(...ta), Math.min(...tb))
  // corner to corner, or no room for a road with both clearances: one ring if they overlap
  if (lateral <= 0 || x2 - x1 < -0.01) return meet() ? merged() : { kind: 'apart' }
  if (x2 - x1 >= room) return { kind: 'apart' }
  const l = (x1 + x2) / 2
  const a = extend(A.region, n, x1, l, room)
  const b = extend(B.region, { x: -n.x, y: -n.y }, -x2, -l, room)
  return a === A.region && b === B.region ? { kind: 'apart' } : { kind: 'share', a, b }
}

/** The stretches (as fractions of a→b) of segment a→b inside the convex counter-clockwise polygon (Cyrus–Beck). */
function within(a: Point, b: Point, poly: Polygon): [number, number] | null {
  const d = sub(b, a)
  let lo = 0
  let hi = 1
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    const normal = { x: q.y - p.y, y: -(q.x - p.x) } // out of a counter-clockwise polygon
    const N = dot(normal, sub(a, p))
    const D = dot(normal, d)
    if (Math.abs(D) < 1e-12) {
      if (N > 0) return null
      continue
    }
    const k = -N / D
    if (D < 0) lo = Math.max(lo, k)
    else hi = Math.min(hi, k)
    if (lo >= hi) return null
  }
  return [lo, hi]
}

/** The stretch of a→b that runs along c→d (as fractions of a→b), when the two are this parallel and this close. */
function along(a: Point, b: Point, c: Point, d: Point, sin: number, near: number): [number, number] | null {
  const ab = sub(b, a)
  const cd = sub(d, c)
  const la = Math.hypot(ab.x, ab.y)
  const lc = Math.hypot(cd.x, cd.y)
  if (la < 1e-9 || lc < 1e-9) return null
  if (Math.abs(ab.x * cd.y - ab.y * cd.x) / (la * lc) > sin) return null
  const u = { x: ab.x / la, y: ab.y / la }
  const off = (q: Point) => Math.abs(dot(sub(q, a), perp(u)))
  if (off(c) > near || off(d) > near) return null
  const s0 = dot(sub(c, a), u) / la
  const s1 = dot(sub(d, a), u) / la
  const lo = Math.max(0, Math.min(s0, s1))
  const hi = Math.min(1, Math.max(s0, s1))
  return hi > lo ? [lo, hi] : null
}

/** [0, 1] less the stretches. */
function remaining(cuts: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  let at = 0
  for (const [lo, hi] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (lo > at) out.push([at, lo])
    at = Math.max(at, hi)
  }
  if (at < 1) out.push([at, 1])
  return out
}

/** The buildings of an option whose ring was on: those it shows, less the ones it switched off (ingOff). */
const ringedBuildings = (option: LegacyOption): Id[] => option.buildingIds.filter((b) => !option.ringOff?.includes(b))

export interface RingInput {
  option: LegacyOption
  /** The option's design masses that stand on the ground and are built. */
  masses: DerivedMass[]
  /** Every built mass on the ground, context too: no ring runs over one. */
  obstacles: Polygon[]
  docks: DerivedDock[]
  /** The roads the designer keeps: a ring's side on top of one is left out. */
  kept: LegacyRoad[]
  site: Polygon | null
  standards: StandardFigures
}

/** The rings' roads: one per side, or per stretch of a side that stays. */
export function ringRoads(input: RingInput): LegacyRoad[] {
  const { option, masses, obstacles, docks, kept, site, standards: s } = input
  const w = s.roadWidth
  const half = w / 2
  const rings = ringedBuildings(option).flatMap((b) => buildingRings(b, masses.filter((m) => m.buildingId === b), docks, s))

  // settle every two rings that meet; a merge starts again (the merged ring meets others anew)
  const room = w + 2 * s.stallDepth
  for (let pass = 0; pass < 200; pass++) {
    let again = false
    for (let i = 0; i < rings.length && !again; i++)
      for (let j = i + 1; j < rings.length && !again; j++) {
        if (!boundsTouch(bounds(rings[i].region), bounds(rings[j].region), room)) continue
        const v = settle(rings[i], rings[j], room)
        if (v.kind === 'merge') {
          rings[i] = { key: rings[i].key, building: rings[i].building, region: v.region, masses: [...rings[i].masses, ...rings[j].masses] }
          rings.splice(j, 1)
          again = true
        } else if (v.kind === 'share') {
          rings[i] = { ...rings[i], region: v.a }
          rings[j] = { ...rings[j], region: v.b }
        }
      }
    if (!again) break
  }

  // half a road inside the site
  const inside = site ? offset([site], -half).flat() : null
  const loops = rings.flatMap((r) =>
    (inside ? outers(intersection([r.region], inside)) : [r.region]).map((ring, k) => ({ key: k ? `${r.key}.${k}` : r.key, building: r.building, ring: corners(ring) })),
  )

  // what a side may not run over: the masses (a road's half and a hair), the courts' depth (all but their mouths)
  const blocks = [
    ...obstacles.filter((m) => m.length >= 3).map((m) => obstacleOf(m, half - 0.05)),
    ...docks.map((d) => {
      // the court's frame: the wall's own where it is a rectangle, the rectangle that holds its shapes where they have them (Phase D.3)
      const [a, b] = [d.court[0], d.court[1]]
      const u = sub(b, a)
      const l = Math.hypot(u.x, u.y) || 1
      const e = { x: (u.x / l) * (half - 0.05), y: (u.y / l) * (half - 0.05) }
      const depth = Math.hypot(d.court[3].x - a.x, d.court[3].y - a.y) - 1.05
      const o = { x: d.out.x * depth, y: d.out.y * depth }
      return toCounterClockwise([sub(a, e), { x: b.x + e.x, y: b.y + e.y }, { x: b.x + e.x + o.x, y: b.y + e.y + o.y }, { x: a.x - e.x + o.x, y: a.y - e.y + o.y }])
    }),
  ].filter((q) => Math.abs(signedArea(q)) > 1e-9)
  const keptSegs = kept.flatMap((r) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b, near: (r.width + w) / 2 - 0.5 })))

  const out: LegacyRoad[] = []
  for (const { key, building, ring } of loops)
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length < 1e-6) return
      const cuts: [number, number][] = []
      const box = bounds([a, b])
      for (const q of blocks) if (boundsTouch(box, bounds(q))) {
        const c = within(a, b, q)
        if (c) cuts.push(c)
      }
      for (const r of out) {
        const c = along(a, b, r.points[0], r.points[1], PARALLEL, w - 0.5)
        if (c) cuts.push(c)
      }
      for (const k of keptSegs) {
        const c = along(a, b, k.a, k.b, ALONG, k.near)
        if (c) cuts.push(c)
      }
      remaining(cuts)
        .filter(([lo, hi]) => (hi - lo) * length >= half)
        .forEach(([lo, hi], j) =>
          out.push({ id: j ? `ring:${key}:${i}.${j}` : `ring:${key}:${i}`, kind: 'ring', points: [lerp(a, b, lo), lerp(a, b, hi)], width: w, vehicles: 'all', buildingId: building }),
        )
    })
  return out
}
