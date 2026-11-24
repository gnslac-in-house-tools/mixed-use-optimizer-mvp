// An option's exterior circulation (Decision "Exterior circulation"), in two parts (Phase C.1, Decision "Flow step"):
//   deriveDockSet      the masses' part, which Massing draws: the docks and truck courts of the option's masses
//   deriveCirculation  on top of it, Flow's: the option's gates (its own or the site's), the
//                      roads (existing, and the option's streets: since ST.4 none is derived) and the car stalls
// and their Issues: courtIssues (the masses'), circulationIssues (Flow's: gates, access, roads; `FLOW_ISSUES`). Pure.
import type { DesignOption, Grid, Id, Point, Polygon, Project } from '../../model/schema.ts'
import { buildingBays, gridOf, type BuildingBays } from '../grid/index.ts'
import { intersection, regionsArea, union, type Region } from '../geom/boolean.ts'
import { area, bounds, boundsTouch, distancePointSegment, toCounterClockwise } from '../geom/polygon.ts'
import type { Circulation, DerivedMass, DerivedRoad, DerivedSite, DockSet, Issue, IssueCode } from '../types.ts'
import { deriveGates } from './access.ts'
import { courtShapes, deriveDocks } from '../../modules/docks/engine/docks.ts'
import { gatesOf } from './gates.ts'
import { deriveNetwork, inCourt } from './network.ts'
import { deriveParkingBy } from '../../modules/parking/engine/parking.ts'
import { deriveLots, lotIssues, REACH } from '../../modules/parking/engine/lots.ts'
import { MIN_ROAD_WIDTH, standardsOf } from './standards.ts'
import { existingRoads, onTheGround, streetRoads, streetTypesOf } from './streets.ts'
import { stripOutlines, stripRegions } from '../path/strip.ts'

/** The Issues the circulation raises on top of the masses (Flow's, Decision "Flow step"); the courts' are the masses'. */
export const FLOW_ISSUES: IssueCode[] = ['gate', 'access', 'road', 'parking', 'lot']

/** m²: an overlap smaller than this is a touch, not a clash. */
const CLASH = 1

/** A point of the largest piece of an overlap: its outline's centroid (a road over a mass: a convex piece, inside it). */
function clashAt(over: Region[]): Point {
  const rings = over.map((r) => r[0]).filter((q) => q && q.length >= 3)
  const ring = rings.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a))
  let cx = 0
  let cy = 0
  let w = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const k = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * k
    cy += (a.y + b.y) * k
    w += k
  }
  if (Math.abs(w) < 1e-9) return ring[0]
  return { x: cx / (3 * w), y: cy / (3 * w) }
}
/** m: a road's end this close (plus half a road) to another road, a gate's lane or a court is joined to it. */
const END_SLACK = 1

const mergedArea = (polys: Polygon[]) => (polys.length ? regionsArea(union(polys.map(toCounterClockwise), [])) : 0)

/**
 * The docks and truck courts of the masses an option shows (`shown`, its context's too). `optionId`: the option, whose
 * structural grid lays out its doors by pattern (Phase G.3); absent, none.
 */
export function deriveDockSet(project: Project, site: DerivedSite, shown: DerivedMass[], optionId?: Id): DockSet {
  const s = standardsOf(project, project.options.find((o) => o.id === optionId))
  const g = optionId !== undefined ? gridOf(project, optionId) : null
  const grid = g ? { grid: g, runs: buildingRuns(g, shown) } : null
  const { docks, covered, targets, gaps } = deriveDocks(project.masses, project.programs, shown, s.courtDepth, site.polygon, s.roadWidth, grid, blockDepths(project))
  return {
    docks,
    covered,
    doors: docks.reduce((n, d) => n + d.doors.length, 0),
    courtArea: mergedArea(docks.flatMap(courtShapes)),
    targets,
    short: targets.length ? targets.reduce((n, t) => n + Math.max(0, t.target - t.doors), 0) : null,
    gaps,
  }
}

/** By building, the court depth of the block it is a copy of (Decision "Truck court"), where its block says one. */
function blockDepths(project: Project): Map<Id, number> {
  const out = new Map<Id, number>()
  for (const b of project.buildings) {
    const depth = b.warehouse && project.warehouseTypes?.find((t) => t.id === b.warehouse!.type)?.court?.depth
    if (depth) out.set(b.id, depth)
  }
  return out
}

/** Each design building's runs on the grid (its end bays), from its built masses. */
function buildingRuns(g: Grid, shown: DerivedMass[]): Map<Id, BuildingBays> {
  const out = new Map<Id, BuildingBays>()
  for (const id of new Set(shown.filter((m) => !m.context).map((m) => m.buildingId))) {
    const bays = buildingBays(g, { x: 0, y: 0 }, shown.filter((m) => m.buildingId === id && m.built && m.polygon.length >= 3))
    if (bays) out.set(id, bays)
  }
  return out
}

/**
 * The doors short of the brief (Phase G.3, Decision "Structural grid"): a mass on the grid whose pattern places fewer
 * dock doors than its program's docks would give it (per m² of floor, or every m of docked wall).
 */
export function doorIssues(project: Project, c: DockSet, shown: DerivedMass[]): Issue[] {
  const name = namer(shown)
  return c.targets
    .filter((t) => t.doors < t.target)
    .map((t) => {
      const program = project.programs.find((g) => g.id === project.masses.find((m) => m.id === t.massId)?.programId)
      const rule = program?.docks
      const asks = rule ? (rule.per === 'm2' ? ` (one per ${rule.every.toLocaleString('en-US')} m² of floor)` : ` (one every ${rule.every} m of docked wall)`) : ''
      return {
        code: 'doors' as const,
        severity: 'warning' as const,
        massIds: [t.massId],
        message: `${name(t.massId)}: ${t.doors} dock ${t.doors === 1 ? 'door' : 'doors'} by its pattern, the brief asks ${t.target}${asks}.`,
      }
    })
}

/**
 * `shown`: the masses the option shows (its context's too); `dockSet`: theirs. `withRoads` false: the access alone
 * (gates, the docks), no roads or stalls, for a reader that needs no more (the optimizer's masses' measures).
 */
export function deriveCirculation(project: Project, option: DesignOption, site: DerivedSite, shown: DerivedMass[], dockSet: DockSet, withRoads = true): Circulation {
  const s = standardsOf(project, option)
  const { docks, covered } = dockSet
  const gates = deriveGates(site.polygon, gatesOf(project, option.id), { streets: option.streets, existingRoads: project.site.existingRoads }, s.roadWidth)
  if (!withRoads)
    return {
      gates,
      docks,
      roads: [],
      stalls: [],
      lots: [],
      approaches: [],
      reached: [],
      nowhere: [],
      covered,
      totals: { doors: dockSet.doors, courtArea: dockSet.courtArea, roadArea: 0, carRoadArea: 0, stalls: 0, lotStalls: 0 },
    }
  const kept: DerivedRoad[] = [
    ...existingRoads(project.site, s.laneWidth),
    ...streetRoads(option.streets, streetTypesOf(project, option), s.laneWidth),
  ]
  const network = deriveNetwork({ docks, gates, roads: kept, standards: s })
  const paved = network.roads.filter((r) => r.kind !== 'existing')
  const paving = (rs: DerivedRoad[]) => (rs.length ? regionsArea(stripRegions(rs.map((r) => ({ points: r.points, width: r.width })))) : 0)
  // the lots first (the designer placed them), then the stalls along the streets, clear of them
  const lots = deriveLots({ lots: option.lots ?? [], shown, docks, gates, roads: network.roads, site, standards: s })
  const { stalls, roads: stallRoads } = deriveParkingBy({ roads: network.roads, shown, docks, approaches: network.approaches, gates, site: site.polygon, standards: s, option, lots: lots.map((l) => l.polygon) })
  const lotStalls = lots.reduce((n, l) => n + l.stalls.length, 0)
  return {
    gates,
    docks,
    roads: network.roads,
    stalls,
    stallRoads,
    lots,
    approaches: network.approaches,
    reached: [...network.reached],
    nowhere: [...network.nowhere],
    covered,
    totals: {
      doors: dockSet.doors,
      courtArea: dockSet.courtArea,
      roadArea: paving(paved),
      carRoadArea: paving(paved.filter((r) => r.vehicles === 'cars')),
      stalls: stalls.length + lotStalls,
      lotStalls,
    },
  }
}

/** m: a shared court this much under the depth it is asked for is short (a typed gap rounds to the centimetre). */
const SHORT = 0.01
const fixed = (v: number) => (Math.round(v * 10) / 10).toFixed(1)

const builtOf = (shown: DerivedMass[]) => shown.filter(onTheGround)
const namer = (shown: DerivedMass[]) => (id: string) => shown.find((m) => m.id === id)?.name ?? id

/** What the courts break (the masses' part): a truck court that runs into another built mass or out of the site; docks
 *  with no free wall to go on. */
export function courtIssues(c: DockSet, site: DerivedSite, shown: DerivedMass[]): Issue[] {
  const issues: Issue[] = []
  const name = namer(shown)
  const built = builtOf(shown)
  for (const id of c.covered)
    issues.push({ code: 'court', severity: 'warning', massIds: [id], message: `${name(id)} has no free wall for its docks: other masses stand against the walls they would take.` })
  const reported = new Set<string>()
  for (const d of c.docks) {
    // a shared court (Decision "Truck court"): the gap between the two walls under the deeper court either asks
    const other = d.shares && c.docks.find((x) => x.massId === d.shares!.massId && x.wall === d.shares!.wall)
    const pair = d.shares && [d.massId, d.shares.massId].sort().join('|')
    if (d.shares && other && pair && !reported.has(pair)) {
      const asks = Math.max(d.depth, other.depth)
      const gap = d.shares.gap
      if (gap < asks - SHORT) {
        reported.add(pair)
        const whose = d.depth >= other.depth ? d.massId : other.massId
        issues.push({ code: 'court', severity: 'warning', massIds: [d.massId, d.shares.massId], message: `${name(d.massId)} and ${name(d.shares.massId)} share a truck court ${fixed(gap)} m deep: ${name(whose)}'s asks ${fixed(asks)} m.` })
      }
    }
    // what is paved: the court's shapes (the frame holds them, so its bounds sift the masses; a court without shapes is the one rectangle)
    const paved = courtShapes(d)
    for (const m of built) {
      if (m.id === d.massId || m.id === d.shares?.massId || reported.has(`${d.massId}|${m.id}`) || !boundsTouch(bounds(d.court), bounds(m.polygon))) continue
      if (paved.reduce((n, c) => n + regionsArea(intersection([c], [m.polygon])), 0) > CLASH) {
        reported.add(`${d.massId}|${m.id}`)
        issues.push({ code: 'court', severity: 'warning', massIds: [d.massId, m.id], message: `The truck court of ${name(d.massId)} runs into ${name(m.id)}.` })
      }
    }
    if (site.polygon && !reported.has(`${d.massId}|site`) && paved.reduce((n, c) => n + area(c) - regionsArea(intersection([c], [site.polygon!])), 0) > CLASH) {
      reported.add(`${d.massId}|site`)
      issues.push({ code: 'court', severity: 'warning', massIds: [d.massId], message: `The truck court of ${name(d.massId)} leaves the site.` })
    }
  }
  return issues
}

/**
 * What the circulation breaks (Flow's part; the courts' are `courtIssues`):
 *   gate    a gate that leads nowhere; docks and no gate
 *   access  a mass with docks that no truck gate reaches (the `access` relation)
 *   road    a street narrower than its vehicles need, over a mass, or with an end that leads nowhere
 */
export function circulationIssues(c: Circulation, shown: DerivedMass[]): Issue[] {
  const issues: Issue[] = []
  const name = namer(shown)
  const built = builtOf(shown)
  const gateName = (id: string) => `Gate ${c.gates.findIndex((g) => g.id === id) + 1}`

  // the gates
  for (const id of c.nowhere) {
    const g = c.gates.find((x) => x.id === id)!
    issues.push({ code: 'gate', severity: 'warning', massIds: [], at: g.at, message: `${gateName(id)} leads nowhere: no road reaches it.` })
  }

  // the docks: a gate for the trucks, and each docked mass reached
  const docked = [...new Set(c.docks.map((d) => d.massId))]
  const trucks = c.gates.some((g) => g.vehicles !== 'cars' && g.flow !== 'out')
  if (docked.length > 0 && !trucks)
    issues.push({
      code: 'gate',
      severity: 'warning',
      massIds: [],
      message: c.gates.length ? 'No gate lets trucks in: the docks cannot be reached.' : 'No gate yet: place a gate on the boundary or on a street’s side (Gate, in the Streets group of the Tools strip).',
    })
  else
    for (const id of docked)
      if (!c.reached.includes(id)) issues.push({ code: 'access', severity: 'warning', massIds: [id], message: `No truck gate reaches the docks of ${name(id)}.` })

  // the streets (Decision "Streets")
  for (const r of c.roads.filter((x) => x.kind === 'street')) {
    const label = 'A street'
    if (r.width < MIN_ROAD_WIDTH[r.vehicles])
      issues.push({
        code: 'road',
        severity: 'warning',
        massIds: [],
        at: r.points[0],
        message: `${label} is ${r.width} m wide: its ${r.vehicles === 'cars' ? 'cars' : 'trucks'} need ${MIN_ROAD_WIDTH[r.vehicles]} m.`,
      })
    const strip = stripOutlines(r.points, r.width)
    for (const m of built) {
      if (!strip.some((q) => boundsTouch(bounds(q), bounds(m.polygon)))) continue
      const over = intersection(strip, [m.polygon])
      // marked where it runs over the mass, not where the road begins (found trying the streets in Chrome)
      if (regionsArea(over) > CLASH) issues.push({ code: 'road', severity: 'warning', massIds: [m.id], at: clashAt(over), message: `${label} runs over ${name(m.id)}.` })
    }
    for (const end of [r.points[0], r.points[r.points.length - 1]]) {
      const joined =
        c.roads.some((o) => o !== r && o.points.slice(1).some((b, i) => distancePointSegment(end, o.points[i], b) <= o.width / 2 + r.width / 2 + END_SLACK)) ||
        c.gates.some((g) => distancePointSegment(end, g.at, g.end) <= g.width / 2 + END_SLACK) ||
        inCourt(end, c.docks) ||
        // a street that ends at a parking lot's entrance (Decision "Lot tool") is no dead end
        c.lots.some((l) => Math.hypot(end.x - l.entrance.at.x, end.y - l.entrance.at.y) <= REACH + r.width / 2)
      if (!joined) issues.push({ code: 'road', severity: 'warning', massIds: [], at: end, message: `${label} ends nowhere: a dead end.` })
    }
  }
  // the parking lots (Decision "Lot tool")
  issues.push(...lotIssues(c.lots))
  return issues
}
