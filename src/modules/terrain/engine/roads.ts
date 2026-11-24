// The roads graded (Decision "Graded roads"), pure: each design road gets a profile of its own, read every few metres
// along it, that climbs no steeper than the standards' max. grade. Where the ground is gentler the road lies on it;
// where it is steeper the road cuts into it and fills over it, half each way (the middle of the steepest-allowed
// profile under the ground and the one over it, so cut and fill even out along a climb); where it runs onto a graded
// platform or court it stands at that level (a pin), and climbs to it within the grade where it can; the network's
// junctions are given one height each first, within the grade of each other, and every road held at them. Its cut and fill
// are its width times the depth along it: no banks of its own (their earth is the road's edge on the plan). The site's
// existing roads lie on the ground as they are. Every figure is an estimate.
import type { Point, Project } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { EARTH_BANK, EARTH_NONE, type DerivedRoad, type Earthwork, type RoadGrading, type RoadProfile, type RoadStation } from '../../../engine/types.ts'
import type { Surface } from './surface.ts'

/** How far apart a road's stations are (m). */
export const ROAD_STEP = 5

/** The graded height at p, where a platform's masses or a court grade it; null elsewhere (a bank is not a pin). */
function pinAt(e: Earthwork | null, ground: Surface, p: Point): number | null {
  if (!e) return null
  const g = e.grid
  const i = Math.floor((p.x - g.x0) / g.size)
  const j = Math.floor((p.y - g.y0) / g.size)
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return null
  const c = j * g.cols + i
  if (g.kind[c] === EARTH_NONE || g.kind[c] === EARTH_BANK || Number.isNaN(g.depth[c])) return null
  const z = ground.elevation(p)
  return z === null ? null : z + g.depth[c]
}

/** The ground a road finds at p: a platform's bank where one is (its earth already counted), else the ground. */
function groundAt(e: Earthwork | null, ground: Surface, p: Point): number | null {
  const z = ground.elevation(p)
  if (z === null || !e) return z
  const g = e.grid
  const i = Math.floor((p.x - g.x0) / g.size)
  const j = Math.floor((p.y - g.y0) / g.size)
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return z
  const c = j * g.cols + i
  return g.kind[c] === EARTH_BANK && !Number.isNaN(g.depth[c]) ? z + g.depth[c] : z
}

/** A road's stations: its corners and points between them, none farther apart than ROAD_STEP; null ground left out.
 *  Its ground is the banked one where it crosses a bank (the bank's slope is under it, not beside it). */
function stationsOf(r: DerivedRoad, ground: Surface, e: Earthwork | null): { along: number; p: Point; ground: number }[] {
  const out: { along: number; p: Point; ground: number }[] = []
  let along = 0
  for (let i = 0; i + 1 < r.points.length; i++) {
    const a = r.points[i]
    const b = r.points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(len / ROAD_STEP))
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }
      const z = groundAt(e, ground, p)
      if (z !== null) out.push({ along: along + (len * k) / n, p, ground: z })
    }
    along += len
  }
  return out
}

/**
 * The profile no steeper than `grade` nearest the ground: the steepest-allowed one under it and the one over it
 * (forward and back passes), their middle; then held within the grade of every pin (a pin's own station at its level).
 * Pins that no profile can join within the grade: each at its level, the stations between on the line joining them.
 */
export function profileOf(along: number[], ground: number[], pins: (number | null)[], grade: number): number[] {
  const n = along.length
  const under = [...ground]
  const over = [...ground]
  for (let i = 1; i < n; i++) {
    const d = (along[i] - along[i - 1]) * grade
    under[i] = Math.min(under[i], under[i - 1] + d)
    over[i] = Math.max(over[i], over[i - 1] - d)
  }
  for (let i = n - 2; i >= 0; i--) {
    const d = (along[i + 1] - along[i]) * grade
    under[i] = Math.min(under[i], under[i + 1] + d)
    over[i] = Math.max(over[i], over[i + 1] - d)
  }
  // the pins' reach: as low and as high as the grade lets a station be, from every pin
  const low = Array.from({ length: n }, () => -Infinity)
  const high = Array.from({ length: n }, () => Infinity)
  for (let i = 0; i < n; i++)
    if (pins[i] !== null) {
      low[i] = Math.max(low[i], pins[i]!)
      high[i] = Math.min(high[i], pins[i]!)
    }
  for (let i = 1; i < n; i++) {
    const d = (along[i] - along[i - 1]) * grade
    low[i] = Math.max(low[i], low[i - 1] - d)
    high[i] = Math.min(high[i], high[i - 1] + d)
  }
  for (let i = n - 2; i >= 0; i--) {
    const d = (along[i + 1] - along[i]) * grade
    low[i] = Math.max(low[i], low[i + 1] - d)
    high[i] = Math.min(high[i], high[i + 1] + d)
  }
  // where no profile meets every pin within the grade: a pin at its level, a station between two pins on the straight
  // line between them (steeper than the grade: an Issue)
  const prev = Array.from({ length: n }, () => -1)
  const next = Array.from({ length: n }, () => -1)
  for (let i = 0, last = -1; i < n; i++) prev[i] = last = pins[i] !== null ? i : last
  for (let i = n - 1, last = -1; i >= 0; i--) next[i] = last = pins[i] !== null ? i : last
  return under.map((u, i) => {
    if (low[i] <= high[i]) return Math.min(high[i], Math.max(low[i], (u + over[i]) / 2))
    if (pins[i] !== null) return pins[i]!
    const a = prev[i]
    const b = next[i]
    if (a < 0 || b < 0) return (low[i] + high[i]) / 2
    return pins[a]! + ((pins[b]! - pins[a]!) * (along[i] - along[a])) / (along[b] - along[a])
  })
}

/**
 * A design road graded: its profile, cut, fill and steepest grade; null when no stretch of it is on the ground.
 * `held`: heights the network holds it at (its ends, where another road meets it), besides the platforms' and courts'.
 */
export function gradeRoad(r: DerivedRoad, ground: Surface, earthwork: Earthwork | null, grade: number, held: { p: Point; z: number }[] = []): RoadProfile | null {
  const st = stationsOf(r, ground, earthwork)
  if (st.length < 2) return null
  const pins = st.map((s) => pinAt(earthwork, ground, s.p))
  // each height held at the station nearest it, at each when several are as near (a loop's two ends, one node: a
  // street drawn round a building since ST.4)
  for (const h of held) {
    const far = st.map((s) => Math.hypot(s.p.x - h.p.x, s.p.y - h.p.y))
    const near = Math.min(...far)
    far.forEach((d, i) => {
      if (d <= near + 1e-6 && pins[i] === null) pins[i] = h.z
    })
  }
  const zs = profileOf(
    st.map((s) => s.along),
    st.map((s) => s.ground),
    pins,
    grade,
  )
  const stations: RoadStation[] = st.map((s, i) => ({ ...s, z: zs[i] }))
  let cut = 0
  let fill = 0
  let steepest = 0
  let at = stations[0].p
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i]
    const b = stations[i + 1]
    const run = b.along - a.along
    if (run < 1e-6) continue
    const g = Math.abs(b.z - a.z) / run
    if (g > steepest) {
      steepest = g
      at = { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 }
    }
    // the depth's mean over the stretch, each way apart (a stretch that crosses the ground is split where it does)
    const da = a.z - a.ground
    const db = b.z - b.ground
    const area = (u: number, v: number) => {
      if (u >= 0 && v >= 0) return [(u + v) / 2, 0]
      if (u <= 0 && v <= 0) return [0, -(u + v) / 2]
      const t = u / (u - v)
      return u > 0 ? [(u * t) / 2, (-v * (1 - t)) / 2] : [(v * (1 - t)) / 2, (-u * t) / 2]
    }
    const [f, c] = area(da, db)
    fill += f * run * r.width
    cut += c * run * r.width
  }
  return { roadId: r.id, width: r.width, stations, cut, fill, grade: steepest, at }
}

/** Ends closer than this are one junction (m). */
const SAME = 0.5
/** How many times the network's junctions are brought within the grade of each other. */
const ROUNDS = 200

/** How far along a polyline p's nearest point is, and how far off it p is. */
function onLine(points: Point[], p: Point): { along: number; off: number } {
  let best = { along: 0, off: Infinity }
  let along = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const t = len < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)))
    const off = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
    if (off < best.off) best = { along: along + len * t, off }
    along += len
  }
  return best
}

/**
 * An option's design roads graded (the site's existing ones left as they are), as one network: first its junctions
 * (the roads' ends, one where they meet; an end on another road's side, a T) are given heights no farther apart than
 * the grade lets the road between them climb (each starting at its ground, or a court's level, and brought within the
 * grade of the others round by round, a court's never moved); then each road is graded held at its junctions, so
 * every junction is one height. Null without ground.
 */
export function gradeRoads(p: Project, roads: DerivedRoad[], ground: Surface | null, earthwork: Earthwork | null): RoadGrading | null {
  if (!ground) return null
  const { maxGrade } = standardsOf(p)
  const design = roads.filter((r) => r.kind !== 'existing' && r.points.length >= 2)
  const lengthOf = (r: DerivedRoad) => r.points.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - r.points[i].x, b.y - r.points[i].y), 0)
  const lengths = design.map(lengthOf)

  // the junctions: each road's two ends, one where they meet
  const nodes: { p: Point; z: number; fixed: boolean }[] = []
  const nodeAt = (q: Point): number => {
    const k = nodes.findIndex((n) => Math.hypot(n.p.x - q.x, n.p.y - q.y) < SAME)
    if (k >= 0) return k
    const pin = pinAt(earthwork, ground, q)
    const z = pin ?? groundAt(earthwork, ground, q)
    nodes.push({ p: q, z: z ?? Number.NaN, fixed: pin !== null })
    return nodes.length - 1
  }
  const ends = design.map((r) => [nodeAt(r.points[0]), nodeAt(r.points.at(-1)!)] as const)
  // what holds two junctions within the grade: a road between them (its length), and a T's end along its road's side
  const ties: { a: number; b: number; run: number }[] = design.map((_, i) => ({ a: ends[i][0], b: ends[i][1], run: lengths[i] }))
  const tees: { road: number; node: number }[] = []
  nodes.forEach((n, k) =>
    design.forEach((r, i) => {
      if (ends[i][0] === k || ends[i][1] === k) return
      const o = onLine(r.points, n.p)
      if (o.off > r.width / 2 + SAME) return
      tees.push({ road: i, node: k })
      ties.push({ a: ends[i][0], b: k, run: o.along }, { a: k, b: ends[i][1], run: lengths[i] - o.along })
    }),
  )
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false
    for (const t of ties) {
      const a = nodes[t.a]
      const b = nodes[t.b]
      if (Number.isNaN(a.z) || Number.isNaN(b.z) || t.a === t.b) continue
      const over = Math.abs(a.z - b.z) - maxGrade * t.run
      if (over <= 1e-6 || (a.fixed && b.fixed)) continue
      const sign = a.z > b.z ? 1 : -1
      const da = a.fixed ? 0 : b.fixed ? over : over / 2
      const db = over - da
      a.z -= sign * da
      b.z += sign * db
      moved = true
    }
    if (!moved) break
  }

  const out: RoadProfile[] = []
  design.forEach((r, i) => {
    const held = [ends[i][0], ends[i][1], ...tees.filter((t) => t.road === i).map((t) => t.node)]
      .map((k) => nodes[k])
      .filter((n) => !Number.isNaN(n.z))
      .map((n) => ({ p: n.p, z: n.z }))
    const x = gradeRoad(r, ground, earthwork, maxGrade, held)
    if (x) out.push(x)
  })
  return { roads: out, cut: out.reduce((s, x) => s + x.cut, 0), fill: out.reduce((s, x) => s + x.fill, 0) }
}

/** The road's height at p: the station nearest along its centreline, between two by how far; null off its profile. */
export function profileHeight(r: RoadProfile, p: Point): number | null {
  const s = r.stations
  let best = Infinity
  let z: number | null = null
  for (let i = 0; i + 1 < s.length; i++) {
    const a = s[i].p
    const b = s[i + 1].p
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
    if (d < best) {
      best = d
      z = s[i].z + (s[i + 1].z - s[i].z) * t
    }
  }
  return best <= r.width / 2 + 1e-6 ? z : null
}
