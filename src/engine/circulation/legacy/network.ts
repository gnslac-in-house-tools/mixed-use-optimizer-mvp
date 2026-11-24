// Kept for the migration alone (Decision "Streets", ST.4: no road is derived; legacy/toStreets.ts): the option's
// derived road network as version 10 found it again on every edit (Decision "Exterior circulation", 4.4).
//   1 rings   each building's ring road (unless the option switched it off), settled with its neighbours' so no road
//             is doubled (rings.ts)
//   2 links   a truck court no road serves gets a link from its mouth; a gate whose lane meets no road gets one from
//             its lane's end (straight ahead when it can, else the shortest way around the masses)
//   3 joins   the parts of the network no gate reaches, nearest first, each joined to the part a gate reaches (as
//             Prim's tree grows): short joins, none running along another part on its way
//   4 load    a ring side or a link no truck takes from a truck gate to a court is a car road (Decision "Circulation
//             optimization"): narrower, for cars
// A removed road (the option's `removedRoads`: a point on it) is left out while a derived road passes there. Pure.
import type { Point, Polygon } from '../../../model/schema.ts'
import type { StandardFigures } from '../standards.ts'
import { distancePointSegment } from '../../geom/polygon.ts'
import type { DerivedDock, DerivedGate, DerivedMass, DerivedRoad } from '../../types.ts'
import { ringRoads } from './rings.ts'
import type { LegacyOption, LegacyRoad } from './types.ts'
import { fieldOf, segmentDistance, shortestRoute, straightRoute, type Field, type Target } from '../route.ts'

/** m: a point this close (plus half a road) is on it; a court's mouth this close (plus half a road) to a road is served. */
const JOIN = 0.5
const SERVE = 1
/** m: a straight link is kept while it is no longer than the shortest way plus this (it reads as drawn). */
const STRAIGHT = 15

export interface LegacyInput {
  option: LegacyOption
  /** The masses the option shows (its context's too). */
  shown: DerivedMass[]
  docks: DerivedDock[]
  gates: DerivedGate[]
  /** The roads the designer kept: existing ones and the streets. */
  kept: DerivedRoad[]
  site: Polygon | null
  standards: StandardFigures
}

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const segments = (r: LegacyRoad) => r.points.slice(1).map((b, i) => [r.points[i], b] as const)

/** The distance from a road's centreline to the segment a–b. */
const roadTo = (r: LegacyRoad, a: Point, b: Point) => Math.min(...segments(r).map(([p, q]) => segmentDistance(p, q, a, b)))

/** Is the point on this road (within half its width and a little)? */
const onRoad = (r: LegacyRoad, q: Point, slack = JOIN) => segments(r).some(([a, b]) => distancePointSegment(q, a, b) <= r.width / 2 + slack)

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
const boxOf = (r: LegacyRoad, pad: number): Box => ({
  minX: Math.min(...r.points.map((q) => q.x)) - pad,
  minY: Math.min(...r.points.map((q) => q.y)) - pad,
  maxX: Math.max(...r.points.map((q) => q.x)) + pad,
  maxY: Math.max(...r.points.map((q) => q.y)) + pad,
})
const touch = (a: Box, b: Box) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
const boxGap = (a: Box, b: Box) => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY))

/** Two roads whose paving touches: one part of the network, and a truck passes from one to the other. */
const joined = (r: LegacyRoad, o: LegacyRoad) => segments(r).some(([a, b]) => roadTo(o, a, b) <= (r.width + o.width) / 2)

/** The network's connected parts, kept as roads are added (union–find). */
class Parts {
  private parent: number[] = []
  private boxes: Box[] = []
  private roads: LegacyRoad[]
  constructor(roads: LegacyRoad[]) {
    this.roads = roads
    roads.forEach((_, i) => this.add(i))
  }
  find(i: number): number {
    while (this.parent[i] !== i) i = this.parent[i] = this.parent[this.parent[i]]
    return i
  }
  /** Files road i (already in `roads`) and joins it to every road it touches. */
  add(i: number) {
    this.parent[i] = i
    this.boxes[i] = boxOf(this.roads[i], this.roads[i].width / 2)
    for (let j = 0; j < i; j++) {
      if (this.find(i) === this.find(j) || !touch(this.boxes[i], this.boxes[j])) continue
      if (joined(this.roads[i], this.roads[j])) this.parent[this.find(i)] = this.find(j)
    }
  }
  all(): number[] {
    return this.roads.map((_, i) => this.find(i))
  }
}

/** The roads version 10 derived for the option (its rings' sides, the links and joins; not the kept ones). */
export function legacyRoads(input: LegacyInput): LegacyRoad[] {
  const { option, shown, docks, gates, kept, site, standards: s } = input
  const w = s.roadWidth
  const removed = option.removedRoads ?? []
  const isRemoved = (r: LegacyRoad) => removed.some((q) => onRoad(r, q))
  const roads: LegacyRoad[] = [...kept]

  // 1 the rings
  const ground = shown.filter((m) => m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6)
  const rings = ringRoads({ option, masses: ground.filter((m) => !m.context), obstacles: ground.map((m) => m.polygon), docks, kept, site, standards: s })
  for (const r of rings) if (!isRemoved(r)) roads.push(r)

  // the field the links find their way in: every built mass on the ground, context too; out of the courts' depth
  // when there is a way, through them when there is none
  const soft: Field = fieldOf(
    ground.map((m) => m.polygon),
    w,
    site,
    1,
    docks,
  )
  const hard: Field = docks.length ? fieldOf(ground.map((m) => m.polygon), w, site) : soft
  const length = (path: Point[]) => path.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0)
  /** Straight ahead while that is about as short as the shortest way; else the shortest way; avoiding the courts first. */
  const routeOf = (from: Point, dir: Point, goals: Target[]): Point[] | null => {
    for (const field of soft === hard ? [soft] : [soft, hard]) {
      const straight = straightRoute(field, from, dir, goals)
      const short = shortestRoute(field, [from], goals)
      if (straight && (!short || length(straight.path) <= length(short.path) + STRAIGHT)) return straight.path
      if (short) return short.path
    }
    return null
  }
  const targets = (): Target[] => roads.flatMap((r, key) => segments(r).map(([a, b]) => ({ a, b, key })))
  const addLink = (id: string, path: Point[]): boolean => {
    const road: LegacyRoad = { id, kind: 'link', points: path, width: w, vehicles: 'all' }
    if (isRemoved(road)) return false
    roads.push(road)
    return true
  }
  const mouthOf = (d: DerivedDock) => mid(d.court[3], d.court[2])
  // a court is served at its mouth (a shared road may run up to half the room for two stall rows past it), or from a
  // side a road passes within the ring clearance
  const reach = s.ringClear + SERVE
  const mouthReach = SERVE + w / 2 + s.stallDepth
  const atMouth = (d: DerivedDock, r: LegacyRoad) => roadTo(r, d.court[3], d.court[2]) <= r.width / 2 + mouthReach
  const sides = (d: DerivedDock) => [
    [d.court[0], d.court[3]],
    [d.court[1], d.court[2]],
  ] as const
  const atSide = (d: DerivedDock, r: LegacyRoad) => sides(d).some(([a, b]) => roadTo(r, a, b) <= r.width / 2 + reach)
  const served = (d: DerivedDock) => roads.some((r) => atMouth(d, r) || atSide(d, r))
  const meets = (g: DerivedGate) => roads.some((r) => roadTo(r, g.at, g.end) <= r.width / 2)

  // 2 links: the courts no road serves, then the gates no road meets (with no road yet, a gate goes to a court's mouth)
  const linkCourts = () => {
    if (roads.length === 0) return
    for (const d of docks) {
      if (served(d)) continue
      const path = routeOf(mouthOf(d), d.out, targets())
      if (path) addLink(`court:${d.massId}:${d.wall}`, path)
    }
  }
  linkCourts()
  for (const g of gates) {
    if (meets(g)) continue
    const goals: Target[] = roads.length ? targets() : docks.map((d, k) => ({ a: mouthOf(d), b: mouthOf(d), key: -1 - k }))
    const path = routeOf(g.end, g.inward, goals)
    if (path) addLink(`gate:${g.id}`, [g.at, ...path])
  }
  linkCourts()

  // 3 joins: the part no gate reaches nearest (as the crow flies) to one a gate reaches, joined to it; again, until
  // none is left (a part that cannot be joined is left out)
  const parts = new Parts(roads)
  const touchesGate = (r: LegacyRoad, list: DerivedGate[]) => list.some((g) => onRoad(r, g.at) || roadTo(r, g.at, g.end) <= r.width / 2)
  const gatesOn = (part: number[], list: DerivedGate[]) => new Set(roads.flatMap((r, i) => (touchesGate(r, list) ? [part[i]] : [])))
  const stuck = new Set<number>()
  for (let round = 0; gates.length > 0 && round < roads.length; round++) {
    const part = parts.all()
    const withGate = gatesOn(part, gates)
    if (withGate.size === 0) break
    const tree = roads.flatMap((r, i) => (withGate.has(part[i]) ? [{ r, box: boxOf(r, 0) }] : []))
    let lonely: number | undefined
    let nearest = Infinity
    roads.forEach((r, i) => {
      if (withGate.has(part[i]) || stuck.has(part[i])) return
      const box = boxOf(r, 0)
      for (const t of tree) {
        // the boxes' gap is no more than the roads': a box farther than the nearest yet is passed by
        if (boxGap(box, t.box) >= nearest) continue
        const d = Math.min(...segments(r).map(([a, b]) => roadTo(t.r, a, b)))
        if (d < nearest) [nearest, lonely] = [d, part[i]]
      }
    })
    if (lonely === undefined) break
    const sources = roads.flatMap((r, i) => (part[i] === lonely ? r.points : []))
    const goals = targets().filter((t) => withGate.has(part[t.key]))
    const route = shortestRoute(soft, sources, goals) ?? (hard === soft ? null : shortestRoute(hard, sources, goals))
    if (!route || !addLink(`join:${round}`, route.path)) {
      stuck.add(lonely)
      continue
    }
    parts.add(roads.length - 1)
  }

  // 4 the load (Decision "Circulation optimization"): from each truck gate, the shortest way along the roads to each
  // road at a court; a ring side or a link on none of them is a car road, as wide as the standard says
  const trucks = truckRoads(
    roads,
    gates.filter((g) => g.vehicles !== 'cars'),
    docks,
    (r, g) => touchesGate(r, [g]),
    (d, r) => atMouth(d, r) || atSide(d, r),
  )
  return roads.flatMap((r, i) => (r.kind !== 'ring' && r.kind !== 'link' ? [] : trucks.has(i) ? [r] : [{ ...r, width: s.carRoadWidth, vehicles: 'cars' as const }]))
}

/**
 * The roads a truck takes: from each truck gate (the roads at it), the shortest way (Dijkstra, each road weighing its
 * length) to each road that serves a court; a road for cars alone is no way. Their indices in `roads`.
 */
function truckRoads(
  roads: LegacyRoad[],
  gates: DerivedGate[],
  docks: DerivedDock[],
  atGate: (r: LegacyRoad, g: DerivedGate) => boolean,
  serves: (d: DerivedDock, r: LegacyRoad) => boolean,
): Set<number> {
  const out = new Set<number>()
  if (gates.length === 0 || docks.length === 0) return out
  const open = roads.map((r) => r.vehicles !== 'cars')
  const weight = roads.map((r) => segments(r).reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0))
  const boxes = roads.map((r) => boxOf(r, r.width / 2))
  const next: number[][] = roads.map(() => [])
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++)
      if (open[i] && open[j] && touch(boxes[i], boxes[j]) && joined(roads[i], roads[j])) {
        next[i].push(j)
        next[j].push(i)
      }
  const served = docks.map((d) => roads.flatMap((r, i) => (open[i] && serves(d, r) ? [i] : [])))
  for (const g of gates) {
    const dist = roads.map(() => Infinity)
    const prev = roads.map(() => -1)
    const done = roads.map(() => false)
    roads.forEach((r, i) => {
      if (open[i] && atGate(r, g)) dist[i] = weight[i]
    })
    for (;;) {
      let u = -1
      for (let i = 0; i < roads.length; i++) if (!done[i] && Number.isFinite(dist[i]) && (u < 0 || dist[i] < dist[u])) u = i
      if (u < 0) break
      done[u] = true
      for (const v of next[u])
        if (dist[u] + weight[v] < dist[v]) {
          dist[v] = dist[u] + weight[v]
          prev[v] = u
        }
    }
    // every road at a court the gate reaches: the trucks turn along its mouth and its sides
    for (const list of served) for (const end of list) if (Number.isFinite(dist[end])) for (let i = end; i >= 0; i = prev[i]) out.add(i)
  }
  return out
}
