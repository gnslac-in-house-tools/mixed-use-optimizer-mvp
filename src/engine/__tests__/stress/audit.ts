// The circulation's invariants, measured on any project (the stress test, `circulation.stress.test.ts`): what derive()
// must never produce, however odd the site, the masses or the roads. Since ST.4 no road is derived (Decision
// "Streets"): a project is audited with its network drawn as the migration draws an old one's (legacy/toStreets.ts:
// its rings, links and joins as streets), and those streets are held to what the derived roads were; the ones the
// scenario drew itself are the designer's. Each finding names what broke and where; the test asserts there are none,
// and prints them when there are.
import type { Point, Polygon, Project } from '../../../model/schema.ts'
import { derive } from '../../derive.ts'
import type { Derived, DerivedGate, DerivedMass, DerivedRoad } from '../../types.ts'
import { gatesOf } from '../../circulation/gates.ts'
import { difference, intersection, regionsArea } from '../../geom/boolean.ts'
import { contourToPolygon } from '../../geom/contour.ts'
import { turning } from '../../circulation/access.ts'
import { perimeterPath } from '../../geom/perimeter.ts'
import type { LegacyFrontage } from './scenarios.ts'
import { area, bounds, boundsTouch, distancePointSegment, pointInPolygon } from '../../geom/polygon.ts'
import { overlap } from '../../../modules/parking/engine/parking.ts'
import { stripPieces } from '../../path/strip.ts'
import { segmentDistance } from '../../circulation/route.ts'
import { standardsOf } from '../../circulation/standards.ts'
import { derivedRoadsOf, derivedRoadsToStreets } from '../../circulation/legacy/toStreets.ts'
import { boundaryRoads, centreShift, turned } from '../../circulation/streets.ts'
import { offsetLine } from '../../path/offset.ts'
import { followGates } from '../../../state/actions/circulation.ts'
import { followRoads } from '../../../state/actions/streets.ts'
import { joinedPaving, TOUCH } from '../../path/join.ts'
import { JOIN } from '../../path/ends.ts'

export type Check =
  | 'finite' // a coordinate is NaN or infinite
  | 'stall-site' // a stall leaves the site
  | 'stall-mass' // a stall stands on a mass (or its sidewalk)
  | 'stall-court' // a stall stands in a truck court (of a shaped one, in its shapes)
  | 'stall-road' // a stall stands on a road's paving
  | 'stall-stall' // two stalls overlap
  | 'stall-lane' // a stall stands in a gate's lane
  | 'stall-approach' // a stall stands on the paved way into a court served from its side
  | 'road-mass' // a derived road runs over a built mass
  | 'road-site' // a derived road leaves the site
  | 'road-duplicate' // two roads run on top of each other
  | 'road-twin' // two derived roads run side by side, too close for anything between them
  | 'road-degenerate' // a road of one point, or a segment of no length
  | 'court-road' // a road runs through a truck court (not just at its mouth)
  | 'unreached' // docks no truck gate reaches although a truck gate leads somewhere
  | 'court-car' // docks a truck gate reaches with only car roads at their court
  | 'court-frame' // a shaped court's frame (its mouth) does not hold its shapes, or its far edge is not where they end
  | 'court-wall' // a shaped court's wall side goes past the end of its wall
  | 'dock-covered' // a program's docks on a wall another mass stands against
  | 'deterministic' // derive gives two answers for one project
  | 'issue-at' // an Issue that a road runs over a mass is marked away from that mass
  | 'migration-kept' // a road version 10 derived is no street of its width and vehicles once drawn (v10 → v11); a frontage's street is not under its existing street's paving (v19 → v20, `frontageKept`)
  | 'street-end' // a street's centre line ends off its drawn end where nothing asks it to, or far off, or over a mass
  | 'paving-seam' // where road ends meet, the paving leaves a notch or a hole between their square ends
  | 'edge-offset' // a street run's edges are not where its left and right say, from its nodes
  | 'link-off' // a street node linked to an existing street lies off its drawn line, or names one that is gone
  | 'gate-host' // a gate with `on` is not on its host's side (within 1 cm, half its width inside the side's ends) or its host is gone; a gate with `t` is off the boundary
  | 'lanes-sum' // a road's lanes do not add up to its width, one is not over 0, or a stored segment's or stretch's lanes do not add up to its sides

export interface Finding {
  check: Check
  detail: string
}

export interface Audit {
  derived: Derived
  ms: number
  findings: Finding[]
}

const grounded = (d: Derived): DerivedMass[] => Object.values(d.masses).filter((m) => m.built && !m.context && m.polygon.length >= 3 && m.span[0] <= 1e-6)
const segs = (r: Pick<DerivedRoad, 'points'>) => r.points.slice(1).map((b, i) => [r.points[i], b] as const)
const fmt = (q: Point) => `(${q.x.toFixed(1)}, ${q.y.toFixed(1)})`

/** A point inside the polygon or on its edge (within `tol` m). */
function inside(q: Point, poly: Polygon, tol = 0.01): boolean {
  if (pointInPolygon(q, poly)) return true
  for (let i = 0, n = poly.length; i < n; i++) if (distancePointSegment(q, poly[i], poly[(i + 1) % n]) <= tol) return true
  return false
}

/** Shapes filed by grid cells, for the all-pairs checks. */
function grid<T>(items: T[], box: (t: T) => { minX: number; minY: number; maxX: number; maxY: number }, cell = 25) {
  const cells = new Map<string, number[]>()
  items.forEach((t, k) => {
    const b = box(t)
    for (let i = Math.floor(b.minX / cell); i <= Math.floor(b.maxX / cell); i++)
      for (let j = Math.floor(b.minY / cell); j <= Math.floor(b.maxY / cell); j++) {
        const key = `${i},${j}`
        cells.set(key, [...(cells.get(key) ?? []), k])
      }
  })
  const pairs = new Set<string>()
  for (const list of cells.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) pairs.add(`${list[a]},${list[b]}`)
  return [...pairs].map((s) => s.split(',').map(Number) as [number, number])
}

/** Two segments: their angle (degrees, 0–90), their centrelines' distance, and how long they run side by side. */
function sideBySide(a: Point, b: Point, c: Point, d: Point) {
  const u = { x: b.x - a.x, y: b.y - a.y }
  const lu = Math.hypot(u.x, u.y)
  const v = { x: d.x - c.x, y: d.y - c.y }
  const lv = Math.hypot(v.x, v.y)
  if (lu < 1e-9 || lv < 1e-9) return null
  const cos = Math.abs(u.x * v.x + u.y * v.y) / (lu * lv)
  const angle = (Math.acos(Math.min(1, cos)) * 180) / Math.PI
  const e = { x: u.x / lu, y: u.y / lu }
  const s = (q: Point) => (q.x - a.x) * e.x + (q.y - a.y) * e.y
  const lo = Math.max(0, Math.min(s(c), s(d)))
  const hi = Math.min(lu, Math.max(s(c), s(d)))
  const run = hi - lo
  if (run <= 0) return { angle, gap: Infinity, run: 0 }
  // the other segment's distance from this one's line, at the middle of the shared run
  const m = (lo + hi) / 2
  const k = Math.max(0, Math.min(1, (m - s(c)) / (s(d) - s(c) || 1)))
  const q = { x: c.x + v.x * k, y: c.y + v.y * k }
  const gap = Math.abs((q.x - a.x) * e.y - (q.y - a.y) * e.x)
  return { angle, gap, run }
}

/**
 * The project as version 10 saw it (Phase PE.2): its existing streets along the boundary are not in the network (the street of a frontage, which a
 * saved frontage became, was not one either: the gates met no road there, and the rings were linked to them).
 */
export function asLegacy(p: Project): Project {
  const along = new Set(boundaryRoads(p.site))
  const roads = (p.site.existingRoads ?? []).filter((r) => !along.has(r.points))
  return roads.length === (p.site.existingRoads ?? []).length ? p : { ...p, site: { ...p.site, existingRoads: roads.length ? roads : undefined } }
}

/**
 * The project with its network drawn as the migration draws an old one's (legacy/toStreets.ts), the roads found as version 10 found them (`asLegacy`),
 * and the street ends on an existing street's drawn line linked to it, as the settle step leaves them (the way a gate had ends on its frontage's line).
 */
export const legacyStreets = (p: Project): Project => followRoads(p, derivedRoadsToStreets(p, derivedRoadsOf(asLegacy(p))))

export function audit(given: Project, opts: { determinism?: boolean } = {}): Audit {
  // the network drawn as the migration draws it
  const before = derivedRoadsOf(asLegacy(given))
  // (the settle step's: the streets it draws split the designer's, and the gates on them follow, as followGates leaves them)
  const p = followGates(given, followRoads(given, derivedRoadsToStreets(given, before)))
  const t0 = performance.now()
  const d = derive(p)
  const ms = performance.now() - t0
  // a street the migration drew: each of its segments on a road version 10 derived (the scenario's own are the
  // designer's; a knit gives their pieces new ids, so they are told apart by where they run)
  const was = before[d.option] ?? []
  const onWas = (q: Point) => was.some((r) => segs(r).some(([a, b]) => distancePointSegment(q, a, b) <= 0.05))
  const derivedRoad = (r: DerivedRoad) => {
    const ns = r.nodePoints ?? r.points
    return r.kind === 'street' && ns.slice(1).every((b, i) => onWas({ x: (ns[i].x + b.x) / 2, y: (ns[i].y + b.y) / 2 }))
  }
  const c = d.circulation
  const s = standardsOf(p)
  const out: Finding[] = []
  const add = (check: Check, detail: string) => out.push({ check, detail })

  // finite numbers everywhere
  const bad = JSON.stringify(c, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NOT_FINITE__' : v))
  if (bad.includes('__NOT_FINITE__')) add('finite', 'the circulation has a NaN or infinite number')

  const site = d.site.polygon
  const masses = grounded(d)

  // the roads
  for (const r of c.roads.filter(derivedRoad)) {
    if (r.points.length < 2) add('road-degenerate', `${r.id} has ${r.points.length} point(s)`)
    for (const [a, b] of segs(r)) if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) add('road-degenerate', `${r.id} has a segment of no length at ${fmt(a)}`)
  }
  const paved = c.roads.map((r) => stripPieces(r.points, r.width))
  c.roads.forEach((r, k) => {
    if (!derivedRoad(r)) return
    for (const m of masses) {
      if (!paved[k].some((q) => boundsTouch(bounds(q), bounds(m.polygon)))) continue
      const a = regionsArea(intersection(paved[k], [m.polygon]))
      if (a > 1) add('road-mass', `${r.id} runs over ${m.name} (${a.toFixed(0)} m²)`)
    }
    if (site) {
      const off = r.points.find((q) => !inside(q, site, 0.05))
      if (off) add('road-site', `${r.id} leaves the site at ${fmt(off)}`)
    }
    for (const dock of c.docks) {
      // a court that leaves the site says so (an Issue): a road may have to cross it
      if (site && (dock.shapes ?? [dock.court]).some((s) => s.some((q) => !inside(q, site, 0.05)))) continue
      // the court's mouth is where roads belong: only what runs deeper than half a road counts (of a shaped court, the part of its shapes there)
      const deep = shrinkCourt(dock.court, r.width / 2 + 1)
      if (!deep) continue
      const where = dock.shapes ? intersection(dock.shapes, [deep]).map((x) => x[0]) : [deep]
      if (!where.length) continue
      const a = regionsArea(intersection(paved[k], where))
      if (a > 2) add('court-road', `${r.id} runs through the truck court of ${dock.massId} (${a.toFixed(0)} m²)`)
    }
  })
  // roads on top of each other, or side by side with no room between them
  const allSegs = c.roads.flatMap((r, k) => segs(r).map(([a, b]) => ({ k, a, b })))
  for (const [i, j] of grid(allSegs, (x) => bounds([x.a, x.b]), 30)) {
    const A = allSegs[i]
    const B = allSegs[j]
    if (A.k === B.k) continue
    const ra = c.roads[A.k]
    const rb = c.roads[B.k]
    // two roads the designer drew (or found) on top of each other are the designer's
    if (!derivedRoad(ra) && !derivedRoad(rb)) continue
    const sb = sideBySide(A.a, A.b, B.a, B.b)
    if (!sb || sb.angle > 5) continue
    const half = (ra.width + rb.width) / 2
    if (sb.gap < half - 0.5 && sb.run > half) add('road-duplicate', `${ra.id} and ${rb.id} overlap for ${sb.run.toFixed(0)} m, ${sb.gap.toFixed(1)} m apart`)
    // derived roads are laid out a truck road wide; the load narrows some after (Decision "Circulation optimization")
    else if (derivedRoad(ra) && derivedRoad(rb) && sb.gap < s.roadWidth + s.stallDepth - 0.5 && sb.run > 2 * s.roadWidth)
      add('road-twin', `${ra.id} and ${rb.id} run side by side for ${sb.run.toFixed(0)} m, ${sb.gap.toFixed(1)} m apart`)
  }

  // the stalls: along the streets and in the parking lots (Decision "Lot tool"), all of them by the same checks
  const stalls = [...c.stalls, ...c.lots.flatMap((l) => l.stalls)]
  if (site) stalls.forEach((q, k) => q.some((v) => !inside(v, site)) && add('stall-site', `stall ${k} leaves the site at ${fmt(q[0])}`))
  for (const m of masses)
    for (const [k, q] of stalls.entries())
      if (boundsTouch(bounds(q), bounds(m.polygon)) && regionsArea(intersection([q], [m.polygon])) > 0.05) add('stall-mass', `stall ${k} stands on ${m.name}`)
  for (const dock of c.docks)
    for (const [k, q] of stalls.entries()) {
      // a shaped court need not be convex: its area, not the separating axes (an unshaped court is the rectangle, as ever)
      const inCourt = dock.shapes ? dock.shapes.some((s) => boundsTouch(bounds(q), bounds(s)) && regionsArea(intersection([q], [s])) > 0.05) : overlap(q, dock.court)
      if (inCourt) add('stall-court', `stall ${k} stands in the court of ${dock.massId}`)
    }
  for (const g of c.gates) for (const [k, q] of stalls.entries()) if (overlap(q, g.lane)) add('stall-lane', `stall ${k} stands in the lane of ${g.id}`)
  for (const ap of c.approaches) for (const [k, q] of stalls.entries()) if (overlap(q, ap)) add('stall-approach', `stall ${k} stands on a court's approach`)
  const pieces = paved.flatMap((ps, k) => ps.map((q) => ({ q, k })))
  const both = [...stalls.map((q) => ({ q, k: -1 })), ...pieces]
  for (const [i, j] of grid(both, (x) => bounds(x.q))) {
    const A = both[i]
    const B = both[j]
    if (A.k >= 0 && B.k >= 0) continue
    if (!overlap(A.q, B.q)) continue
    if (A.k < 0 && B.k < 0) add('stall-stall', `stalls ${i} and ${j} overlap at ${fmt(A.q[0])}`)
    else add('stall-road', `a stall at ${fmt((A.k < 0 ? A : B).q[0])} stands on ${c.roads[A.k < 0 ? B.k : A.k].id}`)
  }

  // a program's docks never go on a wall another mass stands against (its own docks are the designer's)
  const standing = Object.values(d.masses).filter((m) => m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6)
  for (const dock of c.docks) {
    if (dock.own) continue
    const probes = [0.25, 0.5, 0.75].map((f) => ({ x: dock.a.x + (dock.b.x - dock.a.x) * f + dock.out.x * 0.5, y: dock.a.y + (dock.b.y - dock.a.y) * f + dock.out.y * 0.5 }))
    const against = standing.find((m) => m.id !== dock.massId && probes.some((q) => pointInPolygon(q, m.polygon)))
    if (against) add('dock-covered', `the docks of ${d.masses[dock.massId]?.name ?? dock.massId} are on a wall ${against.name} stands against`)
  }

  // the docks a truck gate should reach
  const truckGateLeads = c.gates.some((g) => g.vehicles !== 'cars' && g.flow !== 'out' && !c.nowhere.includes(g.id))
  if (truckGateLeads) for (const id of new Set(c.docks.map((k) => k.massId))) if (!c.reached.includes(id)) add('unreached', `the docks of ${d.masses[id]?.name ?? id} are not reached`)

  // a court the trucks reach has a truck road at it: within a road, the clearance and a row of stalls of its edges
  const atCourt = (court: Polygon, r: DerivedRoad) =>
    court.some((q, i) => segs(r).some(([a, b]) => segmentDistance(q, court[(i + 1) % court.length], a, b) <= r.width / 2 + s.ringClear + s.stallDepth + 1))
  for (const dock of c.docks) {
    if (!c.reached.includes(dock.massId)) continue
    const near = c.roads.filter((r) => atCourt(dock.court, r))
    if (near.length && near.every((r) => r.vehicles === 'cars')) add('court-car', `the court of ${d.masses[dock.massId]?.name ?? dock.massId} has only car roads at it`)
  }

  // a shaped court (Phase D.3): its frame holds every shape, and its far edge, the mouth, is where the deepest of them ends (a shared court's shapes
  // and its frame are both cut at the other wall)
  for (const dock of c.docks) {
    if (!dock.shapes) continue
    const outside = dock.shapes.reduce((n, sh) => n + regionsArea(difference([sh], [dock.court])), 0)
    if (outside > 0.05) add('court-frame', `the frame of the court of ${dock.massId} leaves ${outside.toFixed(1)} m² of its shapes outside`)
    const out = (q: Point) => (q.x - dock.court[0].x) * dock.out.x + (q.y - dock.court[0].y) * dock.out.y
    const deepest = Math.max(...dock.shapes.flatMap((sh) => sh.map(out)))
    const mouth = out(dock.court[3])
    if (Math.abs(deepest - mouth) > 0.05) add('court-frame', `the mouth of the court of ${dock.massId} is ${mouth.toFixed(2)} m out, its shapes end ${deepest.toFixed(2)} m out`)
  }

  // a shaped court's wall side stays within its wall (Phase D.3, review S3): a box shrunk or stretched, a copy's pill or a candidate leaves none past its end
  for (const dock of c.docks) {
    if (!dock.shapes) continue
    const len = Math.hypot(dock.b.x - dock.a.x, dock.b.y - dock.a.y)
    const u = { x: (dock.b.x - dock.a.x) / len, y: (dock.b.y - dock.a.y) / len }
    for (const sh of dock.shapes)
      for (const q of sh) {
        const x = (q.x - dock.a.x) * u.x + (q.y - dock.a.y) * u.y
        const y = (q.x - dock.a.x) * dock.out.x + (q.y - dock.a.y) * dock.out.y
        if (Math.abs(y) < 0.05 && (x < -0.05 || x > len + 0.05)) add('court-wall', `the court of ${dock.massId} has its wall side ${(x < 0 ? -x : x - len).toFixed(1)} m past its wall's end`)
      }
  }

  // an Issue that a road runs over a mass marks the place on it (found in Chrome: it marked where the street began)
  for (const i of d.issues) {
    if (i.code !== 'road' || !i.at || i.massIds.length !== 1 || !i.message.includes('runs over')) continue
    const m = d.masses[i.massIds[0]]
    if (m && m.polygon.length >= 3 && !inside(i.at, m.polygon, 1)) add('issue-at', `"${i.message}" is marked at ${fmt(i.at)}, off ${m.name}`)
  }

  // every road version 10 derived is a street now, of its width and vehicles: the middle of each of its segments on
  // one (a rounded corner leaves the middles where they were)
  for (const r of was)
    for (const [a, b] of segs(r)) {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const on = c.roads.filter((x) => x.kind === 'street' && segs(x).some(([u, v]) => distancePointSegment(m, u, v) <= 0.05))
      if (on.some((x) => Math.abs(x.width - r.width) < 1e-6 && x.vehicles === r.vehicles)) continue
      const what = on.map((x) => `${x.width} m, ${x.vehicles}`).join(' / ')
      add('migration-kept', on.length ? `${r.id} at ${fmt(m)} is a street of ${what}, not ${r.width} m, ${r.vehicles}` : `${r.id} at ${fmt(m)} is no street`)
    }

  streetEnds(p, d, masses, add)

  // streets that meet (Phase PE.1): the one joined paving has no seam, and each run's edges are where its sides say
  const joined = joinedPaving(c.roads.map((r) => ({ points: r.points, width: r.width, radius: r.radius })))
  const rings = joined.flatMap(([outer, ...holes]) => [signedArea(outer) > 0 ? outer : [...outer].reverse(), ...holes.map((h) => (signedArea(h) < 0 ? h : [...h].reverse()))])
  for (const f of pavingSeams(c.roads, rings)) add('paving-seam', f)
  for (const f of edgeOffsets(c.roads)) add('edge-offset', f)
  for (const f of linkOffs(p, d.option)) add('link-off', f)
  for (const f of laneSums(c.roads, p, d.option)) add('lanes-sum', f)
  for (const f of gateHosts(p, d.option, c.gates)) add('gate-host', f)

  if (opts.determinism !== false && JSON.stringify(derive(p).circulation) !== JSON.stringify(c)) add('deterministic', 'two derives differ')
  return { derived: d, ms, findings: out }
}

/**
 * Streets drawn by an edge (Decision "Street side when drawing"): each centre line ends on its drawn end, shifted by its
 * side, unless it meets a street of another side at a node only the two share. There it may move to join it, but
 * within the wider one's width of the node, and its end's paving over no more of a mass than it had unjoined. A loop's
 * seam is mitred (`offsetLine`): it is no end. (Found in review: a joint carried tens of metres at gentle bends.)
 */
function streetEnds(p: Project, d: Derived, masses: DerivedMass[], add: (check: Check, detail: string) => void) {
  const s = p.options.find((o) => o.id === d.option)?.streets
  if (!s) return
  const degree = new Map<string, number>()
  for (const g of s.segments) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const roads = d.circulation.roads.filter((r) => r.kind === 'street' && r.nodes && r.nodePoints && r.nodes.length >= 2)
  const endsAt = new Map<string, DerivedRoad[]>()
  for (const r of roads) for (const n of new Set([r.nodes![0], r.nodes![r.nodes!.length - 1]])) endsAt.set(n, [...(endsAt.get(n) ?? []), r])
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  // the side read walking into n (along r), and walking out of it
  const handOf = (r: DerivedRoad): 'left' | 'centre' | 'right' => (r.left === 0 ? 'left' : r.right === 0 ? 'right' : 'centre')
  const into = (r: DerivedRoad, n: string) => turned(handOf(r), r.nodes![r.nodes!.length - 1] === n)
  const outOf = (r: DerivedRoad, n: string) => turned(handOf(r), r.nodes![0] === n)
  for (const r of roads) {
    const ns = r.nodes!
    if (ns[0] === ns[ns.length - 1]) continue
    const want = offsetLine(r.nodePoints!, centreShift(r))
    for (const first of [true, false]) {
      const n = first ? ns[0] : ns[ns.length - 1]
      const node = first ? r.nodePoints![0] : r.nodePoints![ns.length - 1]
      const e = first ? r.points[0] : r.points[r.points.length - 1]
      const w = first ? want[0] : want[want.length - 1]
      const moved = dist(e, w)
      if (moved < 0.01) continue
      const others = (endsAt.get(n) ?? []).filter((x) => x !== r)
      if (degree.get(n) !== 2 || others.length !== 1) {
        add('street-end', `${r.id} ends ${moved.toFixed(1)} m off its drawn end at ${fmt(node)}, where it meets no one street`)
        continue
      }
      const o = others[0]
      if (into(r, n) === outOf(o, n))
        add('street-end', `${r.id} ends ${moved.toFixed(1)} m off its drawn end at ${fmt(node)}, though ${o.id} is drawn by its side there`)
      const reach = Math.max(r.width, o.width)
      if (dist(e, node) > reach + 0.01) add('street-end', `${r.id} ends ${dist(e, node).toFixed(1)} m from its node at ${fmt(node)}, beyond ${reach} m`)
      const before = first ? r.points[1] : r.points[r.points.length - 2]
      const now = stripPieces([before, e], r.width)
      const was = stripPieces([before, w], r.width)
      for (const m of masses) {
        const over = (q: Polygon[]) => (q.length ? regionsArea(intersection(q, [m.polygon])) : 0)
        const more = over(now) - over(was)
        if (more > 1) add('street-end', `${r.id}'s end joined at ${fmt(node)} runs ${more.toFixed(0)} m² more over ${m.name}`)
      }
    }
  }
}

/** A street node linked to an existing street (`StreetNode.road`) must lie on that street's drawn line (within `JOIN`), and the street must be there. */
export function linkOffs(p: Project, optionId: string): string[] {
  const out: string[] = []
  const roads = new Map((p.site.existingRoads ?? []).map((r) => [r.id, r]))
  const streets = p.options.find((o) => o.id === optionId)?.streets
  const degree = new Map<string, number>()
  for (const g of streets?.segments ?? []) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const lineOff = (n: Point, r: { points: Point[] }) => Math.min(...r.points.slice(1).map((b, k) => distancePointSegment(n, r.points[k], b)))
  for (const n of streets?.nodes ?? []) {
    if (!n.road) {
      // an end (a node of one segment) on a drawn line, linked to nothing, is no end the app makes (`followRoads`, rule 4)
      const on = !n.lot && degree.get(n.id) === 1 ? [...roads.values()].find((r) => lineOff(n, r) <= JOIN) : undefined
      if (on) out.push(`${n.id} at ${fmt(n)} ends on ${on.id}'s drawn line and is linked to nothing`)
      continue
    }
    const r = roads.get(n.road)
    if (!r) {
      out.push(`${n.id} at ${fmt(n)} is linked to ${n.road}, which is gone`)
      continue
    }
    const off = lineOff(n, r)
    if (off > JOIN + 1e-6) out.push(`${n.id} at ${fmt(n)} is ${off.toFixed(2)} m off ${n.road}'s drawn line`)
  }
  return out
}

/** m: lanes add up to a width within this (the schema's). */
const LANE_SUM = 1e-3

/**
 * Lanes (Phase PE.2): each derived road's `lanes` are each over 0 and add up to its width within 1 mm, and the lanes a stored segment
 * (the option's) or an existing road's stretch keeps add up to its two sides.
 */
export function laneSums(roads: Pick<DerivedRoad, 'id' | 'width' | 'lanes'>[], p: Project, optionId: string): string[] {
  const out: string[] = []
  const check = (what: string, lanes: number[] | undefined, width: number, required: boolean) => {
    if (!lanes) {
      if (required) out.push(`${what} has no lanes`)
      return
    }
    const sum = lanes.reduce((a, b) => a + b, 0)
    if (lanes.length === 0 || lanes.some((x) => !(x > 0))) out.push(`${what} has a lane that is not over 0 (${lanes.join(' + ')} m)`)
    else if (Math.abs(sum - width) > LANE_SUM) out.push(`${what}'s lanes add up to ${sum.toFixed(3)} m of ${width.toFixed(3)} m`)
  }
  for (const r of roads) check(r.id, r.lanes, r.width, true)
  for (const g of p.options.find((o) => o.id === optionId)?.streets?.segments ?? []) check(`segment ${g.id}`, g.lanes, g.left + g.right, false)
  for (const r of p.site.existingRoads ?? []) r.stretches.forEach((t, k) => check(`${r.id}'s stretch ${k}`, t.lanes, t.left + t.right, false))
  return out
}

/** m: a gate lies on its host's side within this. */
const GATE_TOL = 0.01

/**
 * Gates and their hosts (Phase PE.2, the On edge engine): a gate with `on` is derived, and its opening's middle lies on its host's side (the street's
 * segment or the existing street's stretch, offset by that side's paving) within 1 cm, half its width inside the side's ends (a side shorter than the
 * gate keeps it in the middle: not checked); a gate with `t` lies on the boundary. Measured here from the data, not from the engine's own geometry.
 */
export function gateHosts(p: Project, optionId: string, derived: Pick<DerivedGate, 'id' | 'at'>[]): string[] {
  const out: string[] = []
  const streets = p.options.find((o) => o.id === optionId)?.streets
  const nodes = new Map((streets?.nodes ?? []).map((n) => [n.id, n]))
  const boundary = p.site.boundary ? contourToPolygon(p.site.boundary) : null
  for (const g of gatesOf(p, optionId)) {
    const what = `gate ${g.id}`
    const d = derived.find((x) => x.id === g.id)
    if (!g.on) {
      if (g.t === undefined || !boundary || boundary.length < 3) continue
      if (!d) out.push(`${what} on the boundary was not derived`)
      else if (Math.min(...boundary.map((a, i) => distancePointSegment(d.at, a, boundary[(i + 1) % boundary.length]))) > GATE_TOL) out.push(`${what} at ${fmt(d.at)} is off the boundary`)
      continue
    }
    // the host's stretch: its two points, the paving each side, and the place along it
    let line: [Point, Point] | null = null
    let sides = { left: 0, right: 0 }
    let along = g.on.at
    if (g.on.kind === 'street') {
      const seg = streets?.segments.find((x) => x.id === g.on!.id)
      const a = seg && nodes.get(seg.a)
      const b = seg && nodes.get(seg.b)
      if (seg && a && b) {
        line = [a, b]
        sides = seg
      }
    } else {
      const road = (p.site.existingRoads ?? []).find((x) => x.id === g.on!.id)
      let from = 0
      for (const [k, s] of road ? road.stretches.entries() : []) {
        const len = Math.hypot(road!.points[k + 1].x - road!.points[k].x, road!.points[k + 1].y - road!.points[k].y)
        if (!line && (g.on!.at <= from + len || k === road!.stretches.length - 1)) {
          line = [road!.points[k], road!.points[k + 1]]
          sides = s
          along = g.on!.at - from
        }
        from += len
      }
    }
    if (!line) {
      out.push(`${what} stands on ${g.on.kind} ${g.on.id}, which is not there`)
      continue
    }
    if (!d) {
      out.push(`${what} on ${g.on.kind} ${g.on.id} was not derived`)
      continue
    }
    const [a, b] = line
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-9) continue
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const across = u.x * (d.at.y - a.y) - u.y * (d.at.x - a.x)
    const want = g.on.side === 'left' ? sides.left : -sides.right
    if (Math.abs(across - want) > GATE_TOL) out.push(`${what} at ${fmt(d.at)} is ${across.toFixed(3)} m across its host's line, its ${g.on.side} side is ${want.toFixed(3)} m`)
    const h = g.width / 2
    if (len >= g.width && (along < h - GATE_TOL || along > len - h + GATE_TOL)) out.push(`${what} is ${along.toFixed(2)} m along a side of ${len.toFixed(2)} m, its half-width ${h} m not inside`)
  }
  return out
}

/** A polyline moved `d` m to its left (each vertex along its corner's mitre): how the engine drew a frontage's street, before Phase PE.2 took it out. */
function offsetPolyline(points: Point[], d: number): Point[] {
  const n = points.length
  const normal = (a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
  }
  return points.map((q, i) => {
    const n1 = i > 0 ? normal(points[i - 1], q) : null
    const n2 = i < n - 1 ? normal(q, points[i + 1]) : null
    if (!n1 || !n2) {
      const m = (n1 ?? n2)!
      return { x: q.x + m.x * d, y: q.y + m.y * d }
    }
    const k = 1 + n1.x * n2.x + n1.y * n2.y
    if (k < 1e-6) return { x: q.x + n1.x * d, y: q.y + n1.y * d }
    return { x: q.x + (d * (n1.x + n2.x)) / k, y: q.y + (d * (n1.y + n2.y)) / k }
  })
}

/**
 * A saved frontage that became an existing street (Phase PE.2, project 20; `migration-kept`): the street the frontage drew outside the
 * boundary (`frontages`, as the version 19 file held them: drawn here as the engine drew it) lies under the joined paving of `after`'s existing
 * roads, within 1 m² plus, for each boundary corner it turns, the notch a round join leaves at the outer corner of a strip as wide as the
 * street (the old street mitred its corners; (1 − π/4)·(w/2)², and 0.5 m² more), and each gate's derived `at` is where it was (`before`,
 * the project with no street of the site's own), within 1 mm.
 */
export function frontageKept(before: Project, after: Project, frontages: LegacyFrontage[]): string[] {
  const out: string[] = []
  const poly = before.site.boundary ? contourToPolygon(before.site.boundary) : null
  if (!poly) return out
  const was = derive(before).circulation
  const now = derive(after).circulation
  const paving = joinedPaving(now.roads.filter((r) => r.kind === 'existing').map((r) => ({ points: r.points, width: r.width }))).map((r) => r[0])
  for (const f of frontages) {
    if (!f.streetWidth || poly.length < 3) continue
    const path = perimeterPath(poly, f.from, f.to)
    if (path.length < 2) continue
    const street = [...path, ...offsetPolyline(path, -turning(poly) * f.streetWidth).reverse()]
    const corners = Math.max(0, path.length - 2)
    const notch = (1 - Math.PI / 4) * (f.streetWidth / 2) ** 2 + 0.5
    const bare = regionsArea(difference([street], paving))
    if (bare > 1 + corners * notch) out.push(`frontage ${f.id}'s street is bare over ${bare.toFixed(2)} m² (it turns ${corners} corner(s))`)
  }
  for (const g of now.gates) {
    const old = was.gates.find((x) => x.id === g.id)
    if (!old) out.push(`${g.id} was not there before`)
    else if (Math.hypot(old.at.x - g.at.x, old.at.y - g.at.y) > 1e-3) out.push(`${g.id} moved from ${fmt(old.at)} to ${fmt(g.at)}`)
  }
  if (now.gates.length !== was.gates.length) out.push(`${was.gates.length} gate(s) before, ${now.gates.length} after`)
  return out
}

/** The court without its mouth band: the part a road should not cross (null: nothing left). */
function shrinkCourt(court: Polygon, by: number): Polygon | null {
  // court: [a, b, b + out·depth, a + out·depth]; pull its outer side in by `by`
  const [a, b, c, d] = court
  const depth = Math.hypot(d.x - a.x, d.y - a.y)
  if (depth <= by + 0.5 || area(court) < 1) return null
  const k = (depth - by) / depth
  return [a, b, { x: b.x + (c.x - b.x) * k, y: b.y + (c.y - b.y) * k }, { x: a.x + (d.x - a.x) * k, y: a.y + (d.y - a.y) * k }]
}

/** The findings, counted by check. */
export const tally = (fs: Finding[]) => fs.reduce<Partial<Record<Check, number>>>((acc, f) => ({ ...acc, [f.check]: (acc[f.check] ?? 0) + 1 }), {})

const signedArea = (poly: Polygon) => poly.reduce((n, q, i) => n + (q.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * q.y), 0) / 2

/** The convex hull of the points (Andrew's monotone chain), counter-clockwise. */
function hullOf(points: Point[]): Polygon {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: Point[]) => {
    const h: Point[] = []
    for (const q of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(pts), ...half([...pts].reverse())]
}

/**
 * Where two or more road ends meet (within TOUCH), the joined paving covers the hull of their square ends' corners
 * (all but 1 m²), and no hole of it over 1 m² has a point within the widest half width of the node, unless it is as big as a square of that width's side (a block's or a ring's inside is no seam). `paving`: the rings of
 * the joined paving, outer rings counter-clockwise, holes clockwise.
 */
export function pavingSeams(roads: Pick<DerivedRoad, 'id' | 'points' | 'width'>[], paving: Polygon[]): string[] {
  const ends: { at: Point; corners: Point[]; road: number; half: number }[] = []
  roads.forEach((r, k) => {
    for (const first of [true, false]) {
      const at = first ? r.points[0] : r.points[r.points.length - 1]
      const next = first ? r.points[1] : r.points[r.points.length - 2]
      const l = at && next ? Math.hypot(next.x - at.x, next.y - at.y) : 0
      if (l < 1e-9) continue
      const n = { x: (-(next.y - at.y) / l) * (r.width / 2), y: ((next.x - at.x) / l) * (r.width / 2) }
      ends.push({ at, corners: [{ x: at.x + n.x, y: at.y + n.y }, { x: at.x - n.x, y: at.y - n.y }], road: k, half: r.width / 2 })
    }
  })
  const outers = paving.filter((q) => signedArea(q) > 0)
  const holes = paving.filter((q) => signedArea(q) < 0).map((q) => [...q].reverse())
  const out: string[] = []
  const seen = new Set<number>()
  ends.forEach((e, i) => {
    if (seen.has(i)) return
    const group = ends.map((x, j) => ({ x, j })).filter(({ x }) => Math.hypot(x.at.x - e.at.x, x.at.y - e.at.y) <= TOUCH)
    group.forEach(({ j }) => seen.add(j))
    if (new Set(group.map(({ x }) => x.road)).size < 2) return
    const hull = hullOf(group.flatMap(({ x }) => x.corners))
    if (hull.length < 3) return
    const bare = regionsArea(difference([hull], outers)) + regionsArea(intersection([hull], holes))
    if (bare > 1) out.push(`the paving leaves ${bare.toFixed(1)} m² of the end joint at ${fmt(e.at)} bare (${group.map(({ x }) => roads[x.road].id).join(', ')})`)
    const reach = Math.max(...group.map(({ x }) => x.half))
    for (const h of holes)
      if (area(h) > 1 && area(h) <= 4 * reach * reach && h.some((q) => Math.hypot(q.x - e.at.x, q.y - e.at.y) <= reach)) out.push(`a hole of ${area(h).toFixed(1)} m² in the paving within ${reach.toFixed(1)} m of the end joint at ${fmt(e.at)}`)
  })
  return out
}

/** m: the street run's width: its edges' offsets from its drawn line (`nodePoints`), the left and the right, the drawn side's none. */
export function sidesOf(r: Pick<DerivedRoad, 'width' | 'left' | 'right'>): { left: number; right: number } {
  return { left: r.left ?? r.width / 2, right: r.right ?? r.width / 2 }
}

/**
 * Each street run's two edges lie `left` and `right` from its nodes' line, within 1 cm: the middle of the two edges, so placed,
 * is on the centre line and the edges are a width apart. Not near the run's ends or its
 * corners (the centre line is rounded there): the middle of a segment longer than twice its width, farther than the run's width from them.
 */
export function edgeOffsets(roads: Pick<DerivedRoad, 'id' | 'kind' | 'points' | 'width' | 'left' | 'right' | 'nodePoints'>[]): string[] {
  const out: string[] = []
  for (const r of roads) {
    const ns = r.nodePoints
    if (r.kind !== 'street' || !ns || ns.length < 2) continue
    const { left, right } = sidesOf(r)
    ns.slice(1).forEach((b, i) => {
      const a = ns[i]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (l < 2 * r.width + 1e-6) return
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if ([ns[0], ns[ns.length - 1]].some((q) => Math.hypot(q.x - m.x, q.y - m.y) <= r.width)) return
      const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l }
      // the two edges, and the centre line half way between them: on the run's own centre line
      const le = { x: m.x + n.x * left, y: m.y + n.y * left }
      const re = { x: m.x - n.x * right, y: m.y - n.y * right }
      const mid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 }
      const off = Math.min(...r.points.slice(1).map((c, j) => distancePointSegment(mid, r.points[j], c)))
      if (Math.abs(left + right - r.width) > 0.01 || off > 0.01) out.push(`${r.id}'s edges (${left.toFixed(2)} m left, ${right.toFixed(2)} m right of its nodes) at ${fmt(m)} do not close round its centre line: ${off.toFixed(2)} m off`)
    })
  }
  return out
}
