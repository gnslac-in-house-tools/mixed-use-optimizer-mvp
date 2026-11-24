// Connect (Decision "Streets", ST.7): the ways the streets of an option lack, found once and then drawn as streets the
// designer edits by hand. Each truck court no truck gate reaches (along the roads trucks take) gets the shortest way
// from its mouth to a truck gate or to the part of the network one reaches: around every built mass on the ground and
// out of the other courts' depth where there is a way (through them where there is none), inside the site, straight
// ahead while that is about as short. Its corners keep clear of the masses by enough for the type's turning radius to
// round them. On a terrain, of the ways to the network and to each gate, the shortest whose ground climbs no steeper
// than the standards' max. grade (none: the least steep). The levels of the platforms it joins are the grading's to
// meet: where they are too far apart for the way's length, its Issue says so (a way graded alone, before the network's
// junctions are, chose worse in the sample). A court once linked
// serves the next: they share the way where it is shorter. Then each gate no road meets (one the courts' ways did not
// take) gets the shortest way from its lane to the network, so none leads nowhere. Then each parking lot whose entrance
// no road reaches (Decision "Lot tool") gets the shortest way from it to the roads, of the cars' type (`lotPaths`). Pure.
import type { Id, Point, Polygon, Project } from '../../model/schema.ts'
import { surfaceOf, type Surface } from '../../modules/terrain/engine/surface.ts'
import { deriveMassing } from '../derive.ts'
import type { DerivedDock, DerivedGate, DerivedRoad } from '../types.ts'
import { deriveGates } from './access.ts'
import { gatesOf } from './gates.ts'
import { deriveNetwork } from './network.ts'
import { fieldOf, shortestRoute, straightRoute, type Field, type Target } from './route.ts'
import { standardsOf } from './standards.ts'
import { existingRoads, streetRoads, streetTypesOf, typeForVehicles } from './streets.ts'
import { deriveLots } from '../../modules/parking/engine/lots.ts'

/** m: a straight way is kept while it is no more than this longer than the shortest. */
const STRAIGHT = 15
/** m: the ground is read this often along a way, and its grade over twice this. */
const STEP = 5
/** m: a way starts this far inside its court's mouth. */
const INSIDE = 0.5

export interface Connection {
  /** The ways drawn, each from a court's mouth to a gate (through it) or to the network. */
  paths: Point[][]
  /** The courts that had none: linked, and left (no way found). */
  linked: number
  left: number
  /** The gates that led nowhere and now meet the network. */
  gates: number
}

const length = (path: Point[]) => path.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0)
const segments = (r: DerivedRoad) => r.points.slice(1).map((b, i) => [r.points[i], b] as const)
const key = (d: DerivedDock) => `${d.massId}:${d.wall}`

/** The steepest the ground climbs along a way: its height every STEP m, the grade over each 2·STEP m (0 off the ground). */
export function steepestAlong(ground: Surface, path: Point[]): number {
  const at: { s: number; z: number }[] = []
  let s = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    const n = Math.max(1, Math.ceil(l / STEP))
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const z = ground.elevation({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
      if (z !== null) at.push({ s: s + (l * k) / n, z })
    }
    s += l
  }
  let most = 0
  for (let i = 0, j = 0; i < at.length; i++) {
    while (j < at.length && at[j].s - at[i].s < 2 * STEP - 1e-9) j++
    if (j < at.length) most = Math.max(most, Math.abs(at[j].z - at[i].z) / (at[j].s - at[i].s))
  }
  return most
}

/** The ways an option's courts lack (none for an option it does not have). */
export function connectPaths(p: Project, optionId: Id): Connection {
  const none: Connection = { paths: [], linked: 0, left: 0, gates: 0 }
  const o = p.options.find((x) => x.id === optionId)
  if (!o) return none
  const m = deriveMassing(p)
  const s = standardsOf(p, o)
  const site = m.site.polygon
  const docks = m.options[o.id]?.docks.docks ?? []
  if (docks.length === 0) return none
  const gates = deriveGates(site, gatesOf(p, o.id), { streets: o.streets, existingRoads: p.site.existingRoads }, s.roadWidth)
  const truckGates = gates.filter((g) => g.vehicles !== 'cars' && g.flow !== 'out')
  const t = typeForVehicles(streetTypesOf(p, o), 'trucks')
  const roads: DerivedRoad[] = [
    ...existingRoads(p.site, s.laneWidth),
    ...streetRoads(o.streets, streetTypesOf(p, o), s.laneWidth),
  ]
  // the masses the ways go round: every built one on the ground the option shows, its context's too
  const ground: Polygon[] = Object.values(m.masses)
    .filter((x) => o.buildingIds.includes(x.buildingId) && x.built && x.polygon.length >= 3 && x.span[0] <= 1e-6)
    .map((x) => x.polygon)
  // clear of a mass's corner by enough that the type's radius, rounding a right-angled turn there, stays clear of it
  const clearance = 1 + t.radius * (Math.SQRT2 - 1)
  const soft: Field = fieldOf(ground, t.width, site, clearance, docks)
  const hard: Field = fieldOf(ground, t.width, site, clearance)
  const surface = p.site.terrain ? surfaceOf(p.site.terrain) : null

  /** Straight ahead while about as short as the shortest way, else the shortest; out of the courts first. */
  const routeOf = (from: Point, dir: Point, goals: Target[]): { path: Point[]; key: number } | null => {
    for (const field of [soft, hard]) {
      const straight = straightRoute(field, from, dir, goals)
      const short = shortestRoute(field, [from], goals)
      if (straight && (!short || length(straight.path) <= length(short.path) + STRAIGHT)) return straight
      if (short) return short
    }
    return null
  }

  const paths: Point[][] = []
  // a court tried once is not tried again (linked, or no way found)
  const tried = new Set<string>()
  const total = new Set(docks.map(key))
  for (let round = 0; round < docks.length; round++) {
    const net = deriveNetwork({ docks, gates, roads, standards: s })
    if (round === 0) for (const k of net.courts) total.delete(k)
    const todo = docks.filter((d) => !net.courts.has(key(d)) && !tried.has(key(d)))
    if (todo.length === 0 || (truckGates.length === 0 && net.trucked.size === 0)) break
    // half a metre inside the court's mouth (a street ending in a court is no dead end; its depth's block starts 1 m in)
    const mouthOf = (d: DerivedDock) => ({ x: (d.court[2].x + d.court[3].x) / 2 - d.out.x * INSIDE, y: (d.court[2].y + d.court[3].y) / 2 - d.out.y * INSIDE })
    // the court nearest a gate first, so the ways after it can share its way
    const near = (d: DerivedDock) => Math.min(...truckGates.map((g) => Math.hypot(g.end.x - mouthOf(d).x, g.end.y - mouthOf(d).y)), Infinity)
    const d = [...todo].sort((a, b) => near(a) - near(b))[0]
    tried.add(key(d))
    const network: Target[] = roads.flatMap((r) => (net.trucked.has(r.id) ? segments(r).map(([a, b]) => ({ a, b, key: 0 })) : []))
    const gateGoal = (g: DerivedGate, k: number): Target => ({ a: g.end, b: g.end, key: -1 - k })
    // the ways to try: to the network or any gate; on a terrain, to the network and to each gate apart
    const groups: Target[][] = surface ? [network, ...truckGates.map((g, k) => [gateGoal(g, k)])].filter((x) => x.length > 0) : [[...network, ...truckGates.map(gateGoal)]]
    const found = groups.flatMap((goals) => {
      const r = routeOf(mouthOf(d), d.out, goals)
      if (!r) return []
      // to a gate: on through it, to the street
      const path = r.key < 0 ? [...r.path, truckGates[-1 - r.key].at] : r.path
      return [{ path, steep: surface ? steepestAlong(surface, path) : 0 }]
    })
    if (found.length === 0) continue
    const within = found.filter((f) => f.steep <= s.maxGrade + 1e-9)
    const best = within.length ? within.sort((a, b) => length(a.path) - length(b.path))[0] : found.sort((a, b) => a.steep - b.steep)[0]
    paths.push(best.path)
    roads.push({ id: `connect:${paths.length}`, kind: 'street', points: best.path, width: t.width, vehicles: t.vehicles })
  }
  // the gates no road meets: from the inner end of each one's lane to the network, on through it to the street
  let joined = 0
  for (const g of gates) {
    const net = deriveNetwork({ docks, gates, roads, standards: s })
    if (!net.nowhere.has(g.id) || roads.length === 0) continue
    const goals: Target[] = roads.flatMap((r) => segments(r).map(([a, b]) => ({ a, b, key: 0 })))
    const r = routeOf(g.end, g.inward, goals)
    if (!r) continue
    const path = [g.at, ...r.path]
    paths.push(path)
    roads.push({ id: `connect:${paths.length}`, kind: 'street', points: path, width: t.width, vehicles: t.vehicles })
    joined++
  }
  const after = deriveNetwork({ docks, gates, roads, standards: s })
  const left = [...total].filter((k) => !after.courts.has(k)).length
  return { paths, linked: total.size - left, left, gates: joined }
}

/** The ways an option's parking lots lack. */
export interface LotConnection {
  paths: Point[][]
  /** The lots it reached, and those it found no way for. */
  linked: number
  left: number
}

/**
 * The ways from each parking lot whose entrance no road reaches (Decision "Lot tool") to the roads there are and those
 * drawn before it (`drawn`: the courts' ways, of the trucks' type): straight out of its entrance while about as short,
 * else the shortest, around the masses and the lots, out of the courts where there is a way (through them where there
 * is none), inside the site. A lot once linked serves the next. Of the cars' type: a turning radius clear of what it
 * goes round.
 */
export function lotPaths(p: Project, optionId: Id, drawn: Point[][] = []): LotConnection {
  const none: LotConnection = { paths: [], linked: 0, left: 0 }
  const o = p.options.find((x) => x.id === optionId)
  if (!o?.lots?.length) return none
  const m = deriveMassing(p)
  const s = standardsOf(p, o)
  const types = streetTypesOf(p, o)
  const truck = typeForVehicles(types, 'trucks')
  const car = typeForVehicles(types, 'cars')
  const shown = Object.values(m.masses).filter((x) => o.buildingIds.includes(x.buildingId))
  const docks = m.options[o.id]?.docks.docks ?? []
  const gates = deriveGates(m.site.polygon, gatesOf(p, o.id), { streets: o.streets, existingRoads: p.site.existingRoads }, s.roadWidth)
  const roads: DerivedRoad[] = [
    ...existingRoads(p.site, s.laneWidth),
    ...streetRoads(o.streets, types, s.laneWidth),
    ...drawn.map((points, i) => ({ id: `connect:${i}`, kind: 'street' as const, points, width: truck.width, vehicles: truck.vehicles })),
  ]
  const lotsOf = () => deriveLots({ lots: o.lots ?? [], shown, docks, gates, roads, site: m.site, standards: s })
  const ground = shown.filter((x) => x.built && x.polygon.length >= 3 && x.span[0] <= 1e-6).map((x) => x.polygon)
  const obstacles = [...ground, ...lotsOf().map((l) => l.polygon)]
  const clearance = 1 + car.radius * (Math.SQRT2 - 1)
  const fields = [fieldOf(obstacles, car.width, m.site.polygon, clearance, docks), fieldOf(obstacles, car.width, m.site.polygon, clearance)]
  // the way starts out of the lot's own clearance: from its entrance straight to there
  const out = car.width / 2 + clearance + 0.5
  const paths: Point[][] = []
  let left = 0
  for (const id of lotsOf().map((l) => l.id)) {
    const l = lotsOf().find((x) => x.id === id)
    if (!l || l.reached) continue
    const goals: Target[] = roads.flatMap((r) => segments(r).map(([a, b]) => ({ a, b, key: 0 })))
    const from = { x: l.entrance.at.x + l.entrance.out.x * out, y: l.entrance.at.y + l.entrance.out.y * out }
    let found: Point[] | null = null
    for (const field of goals.length ? fields : []) {
      const straight = straightRoute(field, from, l.entrance.out, goals)
      const short = shortestRoute(field, [from], goals)
      const r = straight && (!short || length(straight.path) <= length(short.path) + STRAIGHT) ? straight : short
      if (r) {
        found = [l.entrance.at, ...r.path]
        break
      }
    }
    if (!found) {
      left++
      continue
    }
    paths.push(found)
    roads.push({ id: `lot:${paths.length}`, kind: 'street', points: found, width: car.width, vehicles: car.vehicles })
  }
  return { paths, linked: paths.length, left }
}
