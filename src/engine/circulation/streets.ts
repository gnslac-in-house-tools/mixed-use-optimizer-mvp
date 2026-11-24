// An option's streets (Decision "Streets"): a network of nodes and straight segments, each of a street type. The
// network reads them as roads: each run of segments through nodes where nothing else meets, of one type and width,
// is one road (a polyline), so the parking, the grading and the Issues read a street as a road. A segment drawn by an
// edge (Decision "Drawing side") is turned into its centre line here only: every road's `points` are a centre line.
import type { DesignOption, Id, Point, Polygon, Project, Site, StreetParking, StreetSegment, StreetSide, StreetType, Streets } from '../../model/schema.ts'
import type { DerivedMass, DerivedRoad } from '../types.ts'
import { intersection, regionsArea } from '../geom/boolean.ts'
import { contourToPolygon } from '../geom/contour.ts'
import { bounds, boundsTouch, distancePointSegment } from '../geom/polygon.ts'
import { gatesOf } from './gates.ts'
import { standardsOf } from './standards.ts'
import { offsetLine } from '../path/offset.ts'
import { joinEnds, type JoinRun } from '../path/join.ts'
import { cornerRadii, rounded } from '../path/round.ts'
import { LANE_WIDTH, lanesOf } from '../path/lanes.ts'
import { stretchStrip } from '../path/strip.ts'

/** m: the turning radius the default street types' corners are drawn with (a tractor-trailer's, a car's). */
export const TRUCK_RADIUS = 15
export const CAR_RADIUS = 6

/** m: a street end this near a parking lot's entrance is connected to it; a connected end dragged farther lets go
 *  (Decision "Streets follow their lots", state/actions/streets.ts `followLots`). */
export const LOT_LINK = 0.5

/** m: an existing street lies along the boundary when its points, and the middle of each stretch, are within this of the outline. */
const ALONG_BOUNDARY = 1

/**
 * The drawn lines of the site's existing streets that lie along its boundary (each point of the line, and the middle of each stretch, within 1 m of
 * the outline): the street the site faces, which the main axis follows (Phase PE.2, Decision 13; a saved frontage became one). A street across the
 * site does not count.
 */
export function boundaryRoads(site: Pick<Site, 'boundary' | 'existingRoads'>): Point[][] {
  if (!site.boundary) return []
  const outline = contourToPolygon(site.boundary)
  return (site.existingRoads ?? []).filter((r) => alongBoundary(outline, r.points)).map((r) => r.points)
}

/** Does this drawn line lie along the outline: each of its points, and the middle of each stretch, within 1 m of it? */
export function alongBoundary(outline: Polygon, points: Point[]): boolean {
  if (outline.length < 3) return false
  const near = (q: Point) => outline.some((a, i) => distancePointSegment(q, a, outline[(i + 1) % outline.length]) <= ALONG_BOUNDARY)
  return points.every((q, i) => near(q) && (i === 0 || near({ x: (q.x + points[i - 1].x) / 2, y: (q.y + points[i - 1].y) / 2 })))
}

/** The street types a project without its own uses: trucks and cars, as wide as the standards' road widths. */
export function defaultStreetTypes(p: Pick<Project, 'standards'>, option?: Pick<DesignOption, 'standards'> | null): StreetType[] {
  const s = standardsOf(p, option)
  return [
    { id: 'trucks', name: 'Trucks', width: s.roadWidth, radius: TRUCK_RADIUS, vehicles: 'trucks' },
    { id: 'cars', name: 'Cars', width: s.carRoadWidth, radius: CAR_RADIUS, vehicles: 'cars' },
  ]
}

/** The project's street types (its own, else the defaults); the first is the one a new street takes. */
export function streetTypesOf(p: Pick<Project, 'standards'>, option?: Pick<DesignOption, 'standards'> | null): StreetType[] {
  return p.standards?.streetTypes ?? defaultStreetTypes(p, option)
}

/** The type a road of these vehicles becomes as a street: the first for cars when they are cars, else the first for
 *  trucks, else the first (an old project's roads, drawn as streets by the migration). */
export function typeForVehicles(types: StreetType[], vehicles: StreetType['vehicles']): StreetType {
  const want = vehicles === 'cars' ? 'cars' : 'trucks'
  return types.find((t) => t.vehicles === want) ?? types[0]
}

/** A segment's type: the one it names, else the first (a type removed leaves its segments on the first). */
export const typeOfSegment = (s: StreetSegment, types: StreetType[]): StreetType => types.find((t) => t.id === s.type) ?? types[0]

/** A segment's width: the paving each side of its drawn line together. */
export const segmentWidth = (s: Pick<StreetSegment, 'left' | 'right'>): number => s.left + s.right

/** Who drives a segment: its own, else its type's (a road drawn by hand before the streets kept its own). */
export const segmentVehicles = (s: StreetSegment, types: StreetType[]): StreetType['vehicles'] => s.vehicles ?? typeOfSegment(s, types).vehicles

/** m: how far a road's centre line lies from its drawn line, positive to its left (0 for a road drawn by its centre or an existing one). */
export const centreShift = (r: Pick<DerivedRoad, 'left' | 'right'>): number => ((r.left ?? 0) - (r.right ?? 0)) / 2

/** m: the paving each side of a drawn line, walking it, for a width drawn by a side (the Street tool's chips; Decision "Drawing side"): a left edge has none on its left. */
export const sideReach = (side: StreetSide, width: number): { left: number; right: number } =>
  side === 'left' ? { left: 0, right: width } : side === 'right' ? { left: width, right: 0 } : { left: width / 2, right: width / 2 }

/** A mass a street keeps out of: built, on the ground, with an outline; what the street-over-a-mass issue reads. */
export const onTheGround = (m: DerivedMass): boolean => m.built && m.polygon.length >= 3 && m.span[0] <= 1e-6

/** The footprints a street drawn on an option keeps out of (Decision "Street side when drawing"): its masses on the
 *  ground, its context's too, as the street-over-a-mass issue reads them. */
export function streetFootprints(masses: DerivedMass[], buildingIds: Id[]): Polygon[] {
  return masses.filter((m) => buildingIds.includes(m.buildingId) && onTheGround(m)).map((m) => m.polygon)
}

/** m²: a segment's paving over a footprint by more than this runs over it, while drawing (the snap's tolerance). */
export const OUTSIDE_TOL = 0.05

/**
 * The side a segment drawn with the Street tool takes (Decision "Street side when drawing"): the one chosen, unless
 * its paving would run over a footprint (by more than OUTSIDE_TOL); then the edge that keeps it outside: left or
 * right switches to the other, centre to the edge whose paving stays clear (its drawn line the edge against the mass).
 * Neither way clear: the one chosen.
 */
export function outsideSide(a: Point, b: Point, width: number, side: StreetSide, footprints: Polygon[]): StreetSide {
  const over = (s: StreetSide) => {
    const { left, right } = sideReach(s, width)
    const q = stretchStrip(a, b, left, right)
    if (!q) return false
    const box = bounds(q)
    return footprints.some((f) => boundsTouch(box, bounds(f)) && regionsArea(intersection([q], [f])) > OUTSIDE_TOL)
  }
  if (!footprints.length || !over(side)) return side
  const others: StreetSide[] = side === 'centre' ? ['left', 'right'] : [side === 'left' ? 'right' : 'left']
  return others.find((s) => !over(s)) ?? side
}

/**
 * The Street tool's preview (Decision "Street side when drawing"): the centre lines of a line being drawn `width`
 * wide by `side`, each segment switched as `outsideSide` says when there are footprints, as `streetRoads` derives them
 * (rounded by the type's `radius` as the street made will be, `cornerRadii`).
 */
export function drawnStreetLines(points: Point[], width: number, radius: number, side: StreetSide, footprints: Polygon[]): Point[][] {
  if (points.length < 2) return [points]
  const type: StreetType = { id: 'drawn', name: '', width, radius, vehicles: 'trucks' }
  const streets: Streets = {
    nodes: points.map((q, i) => ({ id: `n${i}`, x: q.x, y: q.y })),
    segments: points.slice(1).map((q, i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}`, type: type.id, ...sideReach(outsideSide(points[i], q, width, side, footprints), width) })),
  }
  return streetRoads(streets, [type]).map((r) => r.points)
}

/** A segment's corners' turning radius: its own, else its type's (a road derived before ST.4 kept its sharp corners: 0). */
export const segmentRadius = (s: StreetSegment, types: StreetType[]): number => s.radius ?? typeOfSegment(s, types).radius

/**
 * The option has roads in the engine's sense: gates (its own, else the site's) or streets (since ST.4 no road is
 * derived). What a view asks to show the roads' controls and the parking module to know there is something to park
 * along (Decision "What is not there is not shown").
 */
export function hasRoads(p: Project, option: DesignOption): boolean {
  return gatesOf(p, option.id).length > 0 || (option.streets?.segments.length ?? 0) > 0
}

/**
 * The streets as roads: each run of segments through nodes where only two meet, of one type, sides, vehicles and radius
 * (read along the run: a segment walked b → a has its sides swapped). Its `points` are the centre line: the drawn line
 * offset by its side (`offsetLine`), its ends joined to a neighbour's of another side (`joinEnds`, path engine), then rounded
 * (`cornerRadii`: a corner hugging its drawn edge keeps that edge sharp); `nodePoints` stay the drawn line (the handles).
 */
export function streetRoads(streets: Streets | undefined, types: StreetType[], laneWidth: number = LANE_WIDTH): DerivedRoad[] {
  if (!streets || !streets.segments.length) return []
  const at = new Map(streets.nodes.map((n) => [n.id, { x: n.x, y: n.y } as Point]))
  const touching = new Map<Id, StreetSegment[]>()
  for (const s of streets.segments) for (const n of [s.a, s.b]) touching.set(n, [...(touching.get(n) ?? []), s])
  // walked a → b when `forward`: its sides and its lanes read that way (b → a swaps them), the lanes to the millimetre (Phase PE.2)
  const key = (s: StreetSegment, forward: boolean) =>
    `${typeOfSegment(s, types).id}|${forward ? s.left : s.right}|${forward ? s.right : s.left}|${segmentVehicles(s, types)}|${segmentRadius(s, types)}|${lanesKey(walkedLanes(s, forward, laneWidth))}`
  const done = new Set<Id>()
  const runs: Run[] = []
  // the next segment of a run through node n, coming from `from`: the one other there, when only two meet and it matches
  const next = (n: Id, from: StreetSegment): StreetSegment | null => {
    const here = touching.get(n) ?? []
    if (here.length !== 2) return null
    const s = here[0] === from ? here[1] : here[0]
    return !done.has(s.id) && key(s, s.a === n) === key(from, from.b === n) ? s : null
  }
  const other = (s: StreetSegment, n: Id) => (s.a === n ? s.b : s.a)
  for (const first of streets.segments) {
    if (done.has(first.id) || !at.has(first.a) || !at.has(first.b)) continue
    done.add(first.id)
    const nodes: Id[] = [first.a, first.b]
    const segs: StreetSegment[] = [first]
    // on from b, then back from a
    for (let s = next(first.b, first), n = first.b; s; s = next(n, s)) {
      done.add(s.id)
      n = other(s, n)
      nodes.push(n)
      segs.push(s)
    }
    for (let s = next(first.a, first), n = first.a; s; s = next(n, s)) {
      done.add(s.id)
      n = other(s, n)
      nodes.unshift(n)
      segs.unshift(s)
    }
    const forward = segs.map((s, i) => s.a === nodes[i])
    // the run's sides and lanes are read walking it, from its first segment in that walk (not `first`: a run extended backwards begins on another)
    const left = forward[0] ? segs[0].left : segs[0].right
    const right = forward[0] ? segs[0].right : segs[0].left
    runs.push({ first, nodes, segs, line: offsetLine(nodes.map((n) => at.get(n)!), (left - right) / 2), left, right, forward })
  }
  const lines = joinEnds(
    runs.map((r): JoinRun => ({ drawn: r.nodes.map((n) => at.get(n)!), line: r.line, left: r.left, right: r.right, ends: [r.nodes[0], r.nodes[r.nodes.length - 1]] })),
  )
  const streetOf = new Map<Id, string>(streetChains(streets).flatMap((c) => c.segs.map((id) => [id, c.id] as const)))
  return runs.map(({ first, nodes, segs, left, right, forward }, k): DerivedRoad => {
    const line = lines[k]
    const type = typeOfSegment(first, types)
    const radius = segmentRadius(first, types)
    const parking = segs.some((s) => s.parking) ? segs.map((s, i) => (s.parking ? turned(s.parking, forward[i]) : null)) : undefined
    return {
      id: `street:${first.id}`,
      kind: 'street',
      street: streetOf.get(first.id) ?? `street:${first.id}`,
      points: rounded(line, cornerRadii(nodes.map((n) => at.get(n)!), left, right, radius)),
      width: left + right,
      left,
      right,
      vehicles: segmentVehicles(first, types),
      sourceId: first.id,
      segments: segs.map((s) => s.id),
      nodes,
      nodePoints: nodes.map((n) => at.get(n)!),
      streetType: type.id,
      radius,
      forward,
      lanes: walkedLanes(segs[0], forward[0], laneWidth),
      ...(parking ? { parking } : {}),
    }
  })
}

/**
 * A street a person picks (Phase PE.1, Decision "Path engine"): the segments between crossings. `nodes` and `segs` run along it,
 * `forward[i]` says segment i is stored walking the same way (a → b); the chain's earliest segment in `streets.segments` runs
 * a → b, and its id is `street:<that segment>`, the id of the run that holds it. A loop (every node of two) is one chain whose
 * last node is its first.
 */
export interface Chain {
  id: string
  nodes: Id[]
  segs: Id[]
  forward: boolean[]
}

/** The streets' chains: each cut at a node where other than two segments meet (a crossing, a T, a free end), not by type or width. */
export function streetChains(streets: Streets): Chain[] {
  const touching = new Map<Id, StreetSegment[]>()
  for (const s of streets.segments) for (const n of [s.a, s.b]) touching.set(n, [...(touching.get(n) ?? []), s])
  const through = (n: Id) => touching.get(n)?.length === 2
  const other = (s: StreetSegment, n: Id) => (s.a === n ? s.b : s.a)
  const seen = new Set<Id>()
  const chains: Chain[] = []
  for (const first of streets.segments) {
    if (seen.has(first.id)) continue
    const nodes: Id[] = [first.a, first.b]
    const segs: StreetSegment[] = [first]
    seen.add(first.id)
    // on from b: a loop comes back to the first segment
    for (let cur = first, n = first.b; through(n); ) {
      const next = touching.get(n)!.find((g) => g !== cur)!
      if (next === first) break
      seen.add(next.id)
      n = other(next, n)
      nodes.push(n)
      segs.push(next)
      cur = next
    }
    // then back from a, unless it closed
    if (nodes[nodes.length - 1] !== first.a) {
      for (let cur = first, n = first.a; through(n); ) {
        const next = touching.get(n)!.find((g) => g !== cur)!
        seen.add(next.id)
        n = other(next, n)
        nodes.unshift(n)
        segs.unshift(next)
        cur = next
      }
    }
    chains.push({ id: `street:${first.id}`, nodes, segs: segs.map((g) => g.id), forward: segs.map((g, i) => g.a === nodes[i]) })
  }
  return chains
}

/**
 * The site's existing roads as derived roads (project 19: each has its sides by stretch). One road per run of equal
 * stretches, ids `existing:<id>` for the first and `existing:<id>:<k>` after (k: the run's first stretch, counted from
 * 1), `sourceId` the road's id; `points` the run's centre line (its drawn line offset by (left − right) / 2, its ends
 * joined to the next run's), `nodePoints` the drawn line.
 */
export function existingRoads(site: Pick<Site, 'existingRoads'>, laneWidth: number = LANE_WIDTH): DerivedRoad[] {
  const out: DerivedRoad[] = []
  for (const road of site.existingRoads ?? []) {
    const runs: { from: number; to: number; left: number; right: number; lanes: number[] }[] = []
    road.stretches.forEach((s, k) => {
      const last = runs[runs.length - 1]
      const lanes = lanesOf(s, laneWidth)
      if (last && last.left === s.left && last.right === s.right && lanesKey(last.lanes) === lanesKey(lanes)) last.to = k + 1
      else runs.push({ from: k, to: k + 1, left: s.left, right: s.right, lanes })
    })
    const drawn = runs.map((r) => road.points.slice(r.from, r.to + 1))
    const lines = joinEnds(
      runs.map((r, i): JoinRun => ({
        drawn: drawn[i],
        line: offsetLine(drawn[i], (r.left - r.right) / 2),
        left: r.left,
        right: r.right,
        ends: [i > 0 ? `${road.id}#${r.from}` : null, i < runs.length - 1 ? `${road.id}#${r.to}` : null],
      })),
    )
    runs.forEach((r, i) =>
      out.push({
        id: i === 0 ? `existing:${road.id}` : `existing:${road.id}:${r.from + 1}`,
        kind: 'existing',
        points: lines[i],
        width: r.left + r.right,
        left: r.left,
        right: r.right,
        lanes: r.lanes,
        vehicles: 'all',
        sourceId: road.id,
        street: `existing:${road.id}`,
        nodePoints: drawn[i],
      }),
    )
  }
  return out
}

/** A segment's lanes (`lanesOf`: stored, else equal from its width) walked a → b when `forward`, else b → a (their order turned). */
function walkedLanes(s: StreetSegment, forward: boolean, laneWidth: number): number[] {
  const lanes = lanesOf(s, laneWidth)
  return forward ? lanes : [...lanes].reverse()
}

/** Lanes to the millimetre, as text: two runs whose lanes agree to it are one run. */
const lanesKey = (lanes: number[]): string => lanes.map((x) => Math.round(x * 1000)).join(',')

/** A segment's side walked the other way: left is right (Decisions "Street parking by side", "Drawing side"); none,
 *  both and centre stay. */
export function turned<S extends StreetParking | StreetSide>(side: S, forward: boolean): S {
  if (forward || (side !== 'left' && side !== 'right')) return side
  return (side === 'left' ? 'right' : 'left') as S
}

/** A street of `streetRoads` before it is rounded: its segments, its centre line, the segment it began from. */
interface Run {
  first: StreetSegment
  nodes: Id[]
  segs: StreetSegment[]
  line: Point[]
  left: number
  right: number
  forward: boolean[]
}
