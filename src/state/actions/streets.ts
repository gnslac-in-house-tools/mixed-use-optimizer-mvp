// The streets' verbs (Decision "Streets"): an option's network of nodes and segments, drawn by hand (the Street tool)
// or by Connect. Pure, Project → Project, like every action. A point drawn where a node is joins it; on a segment, it
// splits that segment there (a T). Nodes left with no segment go with it.
import type { DesignOption, ExistingRoad, Id, Point, Project, StreetNode, StreetSegment, StreetSide, StreetType, Streets, Vehicles } from '../../model/schema.ts'
import { rotate } from '../../engine/geom/footprint.ts'
import { reflectPoint } from '../../engine/geom/reflect.ts'
import { Draft, JOIN, tidy } from '../../engine/circulation/draft.ts'
import { closestOnSegment } from '../../engine/circulation/route.ts'
import { connectPaths, lotPaths } from '../../engine/circulation/connect.ts'
import { deriveMassing } from '../../engine/derive.ts'
import { LOT_LINK, outsideSide, sideReach, streetChains, streetFootprints, streetRoads, streetTypesOf, turned, typeForVehicles, typeOfSegment, type Chain } from '../../engine/circulation/streets.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { endOn } from '../../engine/path/ends.ts'
import { MIN_WIDTH, runPathOp } from '../../engine/path/pathOp.ts'
import type { Path, PathOp, Stretch } from '../../engine/path/types.ts'
import type { PathAdapter, PathRead, PathWrite } from './path.ts'
import { setLocked } from '../../model/locks.ts'
import { lotEntrances, setLot } from '../../modules/parking/actions.ts'

const EMPTY: Streets = { nodes: [], segments: [] }

const optionOf = (p: Project, optionId: Id) => p.options.find((o) => o.id === optionId)
const streetsOf = (p: Project, optionId: Id): Streets => optionOf(p, optionId)?.streets ?? EMPTY

/** The option with these streets (none left: the field goes, as every empty list in the Project). */
function withStreets(p: Project, optionId: Id, streets: Streets): Project {
  return {
    ...p,
    options: p.options.map((o): DesignOption => {
      if (o.id !== optionId) return o
      const { streets: _, ...rest } = o
      return streets.segments.length ? { ...rest, streets } : rest
    }),
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Where an end dropped at q lands on an existing street (Decision "Street links"): the road, and the point of its drawn
 * line the end goes to (its node, or the nearest point of the stretch whose paving holds q); null when q is on none.
 */
function landOnRoad(p: Project, q: Point): { road: Id; at: Point } | null {
  const roads = p.site.existingRoads ?? []
  if (!roads.length) return null
  const hit = endOn(q, roads.map((r) => ({ points: r.points, stretches: r.stretches })))
  return hit ? { road: roads[hit.path].id, at: hit.at } : null
}

const finite = (q: Point) => Number.isFinite(q.x) && Number.isFinite(q.y)

/**
 * A street drawn through these points, of a type (absent: the project's first) and, when they differ from the type's,
 * its own width and vehicles. Each point joins a node there, or splits the segment it falls on, or is a new node.
 * Its first and last points, on another street's paving, join it there (`opts.paving`, default true; false for a
 * copy drawn segment by segment, whose inner nodes are no ends). `opts.side` (Decision "Drawing side"): which edge of
 * the street its points are, walking them; every segment it makes keeps it (each runs the way it was drawn; centre,
 * the default, stored as none). `opts.outside` (the Street tool alone, Decision "Street side when drawing"): a segment
 * whose paving would run over a mass the option shows takes the side that keeps it outside (`outsideSide`), each on
 * its own. Returns the nodes it went through, in order, and the segments it made; null with fewer than two distinct
 * points or no option. `opts.edges`: the paving each side of the line walking it, in place of `width` and `side` (a copy); `opts.lanes`: its stored lanes, told walking it
 * (a copy of a street that has them: only with `edges` that add up to them).
 */
export function drawStreet(
  p: Project,
  optionId: Id,
  points: Point[],
  type?: Id,
  width?: number,
  vehicles?: Vehicles,
  opts: { paving?: boolean; side?: StreetSide; outside?: boolean; edges?: { left: number; right: number }; lanes?: number[] } = {},
): { project: Project; nodes: Id[]; segments: Id[] } | null {
  const o = optionOf(p, optionId)
  if (!o || !points.every(finite)) return null
  const types = streetTypesOf(p, o)
  const t = types.find((x) => x.id === type) ?? types[0]
  const own: Pick<StreetSegment, 'vehicles'> = {
    ...(vehicles !== undefined && vehicles !== t.vehicles && { vehicles }),
  }
  const side = opts.side ?? 'centre'
  const footprints = opts.outside ? streetFootprints(Object.values(deriveMassing(p).masses), o.buildingIds) : []
  const kind = t.id
  const d = new Draft(p, streetsOf(p, optionId))
  const nodes: Id[] = []
  points.forEach((q, i) => {
    // its ends on another street's paving join it there (Decision "Streets stay connected"); the points between do not
    const end = opts.paving !== false && (i === 0 || i === points.length - 1)
    // a created street's node or paving first; then an existing street's end or paving: onto its drawn line, linked
    let n = end ? d.onPaving(q) : null
    if (!n && end && !d.touches(q)) {
      const land = landOnRoad(p, q)
      if (land) {
        n = d.node(land.at)
        d.link(n, land.road)
      }
    }
    n ??= d.node(q)
    if (nodes[nodes.length - 1] !== n) nodes.push(n)
  })
  if (nodes.length < 2) return null
  const w = width !== undefined && width > 0 ? Math.max(MIN_WIDTH, width) : t.width
  const lanes = opts.edges && opts.lanes?.length ? { lanes: [...opts.lanes] } : {}
  const made = nodes.slice(1).flatMap((n, i) => d.join(nodes[i], n, kind, { ...own, ...(opts.edges ?? sideReach(outsideSide(d.at(nodes[i]), d.at(n), w, side, footprints), w)), ...lanes }) ?? [])
  if (!made.length) return null
  d.knit(new Set(), new Set(made))
  // where it crossed a street its segments were split: the first halves keep their ids
  const segments = made.filter((id) => d.segments.some((g) => g.id === id))
  return { project: withStreets(p, optionId, d.done()), nodes: nodes.filter((n) => d.nodes.some((x) => x.id === n)), segments }
}

/**
 * Nodes moved: their segments follow, and the network is made whole where they land (`Draft.knit`). A moved end (a
 * node with one segment) left on another street's paving joins it there (Decision "Streets stay connected"); never
 * its own street's: the run it ends, and the segments that moved with it.
 */
function moved(p: Project, optionId: Id, s: Streets, these: Set<Id>, to: (n: StreetNode) => Point): Project {
  // a node moved keeps its lot: the settle step lets go of it if it went too far (followLots)
  const d = new Draft(p, { ...s, nodes: s.nodes.map((n) => (these.has(n.id) ? { ...n, ...to(n) } : n)) })
  d.knit(these, new Set())
  const types = streetTypesOf(p, optionOf(p, optionId))
  const ends = d.nodes.filter((n) => these.has(n.id) && d.segments.filter((g) => g.a === n.id || g.b === n.id).length === 1)
  if (ends.length) {
    const roads = streetRoads(d.done(), types, standardsOf(p, optionOf(p, optionId)).laneWidth)
    const joined = new Set<Id>()
    for (const e of ends) {
      const own = new Set(d.segments.filter((g) => these.has(g.a) || these.has(g.b)).map((g) => g.id))
      for (const r of roads) if (r.nodes?.includes(e.id)) for (const id of r.segments ?? []) own.add(id)
      const seg = d.segments.find((g) => g.a === e.id || g.b === e.id)!
      const m = d.onPaving(d.at(e.id), own)
      if (!m) {
        // an existing street's end or paving: onto its drawn line, linked (a created street's own paving is looked at first)
        const land = landOnRoad(p, d.at(e.id))
        if (land) {
          d.nodes = d.nodes.map((n) => (n.id === e.id ? { ...n, x: land.at.x, y: land.at.y, road: land.road } : n))
          joined.add(e.id)
        }
        continue
      }
      // onto the node it starts from (a street shorter than the paving is wide): it stays as it is
      if (m === seg.a || m === seg.b) continue
      d.segments = d.segments.map((g) => (g.a === e.id ? { ...g, a: m } : g.b === e.id ? { ...g, b: m } : g))
      d.nodes = d.nodes.filter((n) => n.id !== e.id)
      joined.add(m)
    }
    if (joined.size) d.knit(joined, new Set())
  }
  return withStreets(p, optionId, d.done())
}

/** A node moved to `at`: its segments follow. Dropped on a node it is that node; on a street, a T. */
export function moveStreetNode(p: Project, optionId: Id, nodeId: Id, at: Point): Project {
  const s = streetsOf(p, optionId)
  if (!s.nodes.some((n) => n.id === nodeId) || !finite(at)) return p
  return moved(p, optionId, s, new Set([nodeId]), () => ({ x: at.x, y: at.y }))
}

/** Nodes moved by d (a segment or a whole street dragged): what they join follows; where they land, they join. */
export function moveStreetNodes(p: Project, optionId: Id, nodeIds: Id[], d: Point): Project {
  const s = streetsOf(p, optionId)
  const these = new Set(nodeIds)
  if (!s.nodes.some((n) => these.has(n.id)) || !finite(d)) return p
  return moved(p, optionId, s, these, (n) => ({ x: n.x + d.x, y: n.y + d.y }))
}

/** Nodes turned by `degrees` about `pivot` (Decision "General tools"): what they join follows; where they land, they join. */
export function turnStreetNodes(p: Project, optionId: Id, nodeIds: Id[], pivot: Point, degrees: number): Project {
  const s = streetsOf(p, optionId)
  const these = new Set(nodeIds)
  if (!s.nodes.some((n) => these.has(n.id)) || degrees === 0 || !Number.isFinite(degrees) || !finite(pivot)) return p
  return moved(p, optionId, s, these, (n) => rotate(n, pivot, degrees))
}

/**
 * Nodes reflected about the line through a and b (Decision "Mirror, Array, Align"): what they join follows, where they land they
 * join. A segment with both its nodes among them is mirrored whole: its `left` and `right`, its lanes' order and its parking's side, told walking
 * a → b, change hand (left ↔ right; none and both stay). A segment with one node among them is stretched, as a move stretches it.
 */
export function mirrorStreetNodes(p: Project, optionId: Id, nodeIds: Id[], a: Point, b: Point): Project {
  const s = streetsOf(p, optionId)
  const these = new Set(nodeIds)
  if (!s.nodes.some((n) => these.has(n.id)) || !finite(a) || !finite(b) || (a.x === b.x && a.y === b.y)) return p
  const handed = (g: StreetSegment): StreetSegment => {
    if (!these.has(g.a) || !these.has(g.b)) return g
    const { parking, lanes, ...rest } = g
    return { ...rest, left: g.right, right: g.left, ...(lanes ? { lanes: [...lanes].reverse() } : {}), ...(parking ? { parking: turned(parking, false) } : {}) }
  }
  const r = moved(p, optionId, { ...s, segments: s.segments.map(handed) }, these, (n) => reflectPoint(n, a, b))
  // a gate on a side of a segment mirrored whole stands on the other side of it now (Phase PE.2): the side is told walking a → b
  const whole = new Set(s.segments.filter((g) => these.has(g.a) && these.has(g.b)).map((g) => g.id))
  const o = optionOf(r, optionId)
  if (!whole.size || !o?.gates?.some((g) => g.on?.kind === 'street' && whole.has(g.on.id))) return r
  const gates = o.gates.map((g) => (g.on?.kind === 'street' && whole.has(g.on.id) ? { ...g, on: { ...g.on, side: g.on.side === 'left' ? ('right' as const) : ('left' as const) } } : g))
  return { ...r, options: r.options.map((x) => (x.id === optionId ? { ...x, gates } : x)) }
}

/** A node added on a segment at `at` (its nearest point on it): the segment is two from then on. */
export function splitStreetSegment(p: Project, optionId: Id, segId: Id, at: Point): { project: Project; id: Id } | null {
  const s = streetsOf(p, optionId)
  const g = s.segments.find((x) => x.id === segId)
  if (!g || !finite(at)) return null
  const d = new Draft(p, s)
  const q = closestOnSegment(at, d.at(g.a), d.at(g.b))
  if (dist(q, d.at(g.a)) <= JOIN || dist(q, d.at(g.b)) <= JOIN) return null
  const id = d.split(segId, q)
  return { project: withStreets(p, optionId, d.done()), id }
}

/**
 * A node goes. Where it joins two segments of one type, sides and vehicles along the street they become one from the node before to the node
 * after (the path engine's `remove`: the first's data, the earlier one's id, the street goes on, straight); elsewhere the segments that meet there go with it (nodes left alone too).
 */
export function removeStreetNode(p: Project, optionId: Id, nodeId: Id): Project {
  const s = streetsOf(p, optionId)
  if (!s.nodes.some((n) => n.id === nodeId)) return p
  const here = s.segments.filter((g) => g.a === nodeId || g.b === nodeId)
  // the sides read walking from g's far node through this one to h's
  const along = (g: StreetSegment, forward: boolean) => (forward ? { left: g.left, right: g.right } : { left: g.right, right: g.left })
  const [g, h] = here
  if (here.length === 2 && g.type === h.type && g.vehicles === h.vehicles && g.radius === h.radius && along(g, g.b === nodeId).left === along(h, h.a === nodeId).left && along(g, g.b === nodeId).right === along(h, h.a === nodeId).right) {
    // an inner node of one street: the path engine's `remove` (the first's data, the earlier one's id)
    const merged = mergeAt(s, nodeId, g, h)
    if (merged) return withStreets(p, optionId, merged)
  }
  const rest = s.segments.filter((g) => g.a !== nodeId && g.b !== nodeId)
  return withStreets(p, optionId, tidy({ nodes: s.nodes, segments: rest }))
}

/**
 * The two segments `g` and `h` meeting at `nodeId` made one, from g's far node to h's, with g's data (type, sides, parking: walking g then h). It has the
 * id, lock and group of the earlier in `s.segments`, at its place: a street is named by its earliest segment, so merging never renames it. Null when that
 * would run between two nodes another segment joins already, or from a node to itself. Lanes that differ along the walk (or one side stored and not the other)
 * are not one street's: the merged segment has none stored, its lanes are the standard's at its width (review E7, R4).
 */
function mergeAt(s: Streets, nodeId: Id, g: StreetSegment, h: StreetSegment): Streets | null {
  const a = g.a === nodeId ? g.b : g.a
  const b = h.a === nodeId ? h.b : h.a
  if (a === b || s.segments.some((x) => x !== g && x !== h && ((x.a === a && x.b === b) || (x.a === b && x.b === a)))) return null
  // g's data whole (type, vehicles, radius, sides, parking: its parking side is told in g's own a → b), reaching h's far node
  const walked = (x: StreetSegment, forward: boolean) => JSON.stringify(x.lanes ? (forward ? x.lanes : [...x.lanes].reverse()) : null)
  const keepLanes = walked(g, g.b === nodeId) === walked(h, h.a === nodeId)
  const { lanes: _lanes, ...bare } = g
  const grown: StreetSegment = { ...(keepLanes ? g : bare), ...(g.a === nodeId ? { a: b } : { b }) }
  const earlier = s.segments.indexOf(g) <= s.segments.indexOf(h)
  let merged = grown
  if (!earlier) {
    // h is the earlier: the street keeps its id, lock and group, at its place in the list; the rest is g's
    const { locked: _l, group: _g, ...rest } = grown
    merged = { ...rest, id: h.id, ...(h.locked !== undefined ? { locked: h.locked } : {}), ...(h.group !== undefined ? { group: h.group } : {}) }
  }
  const gone = earlier ? h : g
  return tidy({ nodes: s.nodes, segments: s.segments.flatMap((x) => (x === gone ? [] : x === g || x === h ? [merged] : [x])) })
}

/** A segment goes (its nodes too, if nothing else meets there). */
export function removeStreetSegment(p: Project, optionId: Id, segId: Id): Project {
  const s = streetsOf(p, optionId)
  if (!s.segments.some((g) => g.id === segId)) return p
  return withStreets(p, optionId, tidy({ nodes: s.nodes, segments: s.segments.filter((g) => g.id !== segId) }))
}

/** Segments given a street type (a type the project does not have: no change); their own vehicles and radii go (their sides stay: a type is a preset). */
export function setStreetSegmentType(p: Project, optionId: Id, segIds: Id[], type: Id): Project {
  const s = streetsOf(p, optionId)
  const these = new Set(segIds)
  if (!streetTypesOf(p, optionOf(p, optionId)).some((t) => t.id === type) || !s.segments.some((g) => these.has(g.id))) return p
  return withStreets(p, optionId, {
    ...s,
    segments: s.segments.map((g) => {
      if (!these.has(g.id)) return g
      const { vehicles: _, radius: __, ...rest } = g
      return { ...rest, type }
    }),
  })
}

/**
 * Segments given their paving each side of their drawn line (project 19), each its own, walking its a → b. Segments the
 * option does not have are passed over, and so is a pair that is not a width of 0.5 m, with neither side under 0; a segment's stored lanes
 * are scaled to its new width (Phase PE.2). Nothing to change: the project as it was (no step).
 */
export function setStreetEdges(p: Project, optionId: Id, edges: Record<Id, { left: number; right: number }>): Project {
  const s = streetsOf(p, optionId)
  const ok = (e: { left: number; right: number }) => Number.isFinite(e.left) && Number.isFinite(e.right) && e.left >= 0 && e.right >= 0 && e.left + e.right >= MIN_WIDTH
  const changes = (g: StreetSegment) => Object.hasOwn(edges, g.id) && ok(edges[g.id]) && (g.left !== edges[g.id].left || g.right !== edges[g.id].right)
  if (!s.segments.some(changes)) return p
  return withStreets(p, optionId, { ...s, segments: s.segments.map((g) => (changes(g) ? { ...g, ...scaledTo(g, edges[g.id].left, edges[g.id].right) } : g)) })
}

/** A segment's new sides with its stored lanes scaled to the new width (kept as they are when the width is the same; none stored: none). */
function scaledTo(g: Pick<StreetSegment, 'left' | 'right' | 'lanes'>, left: number, right: number): Pick<StreetSegment, 'left' | 'right' | 'lanes'> {
  const was = g.left + g.right
  const now = left + right
  if (!g.lanes) return { left, right }
  if (Math.abs(now - was) <= 1e-9) return { left, right, lanes: g.lanes }
  return { left, right, lanes: g.lanes.map((l) => (l * now) / was) }
}

/**
 * Segments given a width (Properties' Width), each keeping the shares of its sides (a centred one stays centred, one
 * drawn by its edge keeps that edge); null: their type's width, with those shares. A width under 0.5 m, or nothing to
 * change: the project as it was (no step). A segment's stored lanes are scaled to its new width (Phase PE.2).
 */
export function setStreetSegmentWidth(p: Project, optionId: Id, segIds: Id[], width: number | null): Project {
  const s = streetsOf(p, optionId)
  const these = new Set(segIds)
  if (width !== null && !(Number.isFinite(width) && width >= MIN_WIDTH)) return p
  const types = streetTypesOf(p, optionOf(p, optionId))
  const sidesOf = (g: StreetSegment) => {
    const w = width ?? typeOfSegment(g, types).width
    const share = g.left + g.right > 0 ? g.left / (g.left + g.right) : 0.5
    return scaledTo(g, w * share, w * (1 - share))
  }
  const changes = (g: StreetSegment) => these.has(g.id) && Math.abs(sidesOf(g).left - g.left) + Math.abs(sidesOf(g).right - g.right) > 1e-9
  if (!s.segments.some(changes)) return p
  return withStreets(p, optionId, { ...s, segments: s.segments.map((g) => (changes(g) ? { ...g, ...sidesOf(g) } : g)) })
}

/** The project's street types (Brief › Circulation › Street types): at least one, ids unique. */
export function setStreetTypes(p: Project, types: StreetType[]): Project {
  if (!types.length || new Set(types.map((t) => t.id)).size !== types.length) return p
  return { ...p, standards: { ...p.standards, streetTypes: types } }
}

/**
 * Connect (Decision "Streets", ST.7): each truck court no truck gate reaches gets its shortest way to a gate or to the
 * network (engine/circulation/connect.ts), drawn as streets of the trucks' type, joined where they meet. Once: then
 * they are streets like any other; then each gate that led nowhere is joined to them; then each parking lot whose
 * entrance no road reaches gets its way, of the cars' type (Decision "Lot tool"). `segments`: how many it drew;
 * `linked` and `left`: the courts it reached, and those it found no way for; `gates`: the gates it joined; `lots` and
 * `lotsLeft`: the lots it reached, and those it found no way for.
 */
export function connectStreets(p: Project, optionId: Id): { project: Project; segments: number; linked: number; left: number; gates: number; lots: number; lotsLeft: number } {
  const o = optionOf(p, optionId)
  if (!o) return { project: p, segments: 0, linked: 0, left: 0, gates: 0, lots: 0, lotsLeft: 0 }
  const c = connectPaths(p, optionId)
  const l = lotPaths(p, optionId, c.paths)
  if (c.paths.length === 0 && l.paths.length === 0) return { project: p, segments: 0, linked: 0, left: c.left, gates: 0, lots: 0, lotsLeft: l.left }
  const types = streetTypesOf(p, o)
  const t = typeForVehicles(types, 'trucks')
  const car = typeForVehicles(types, 'cars')
  const d = new Draft(p, streetsOf(p, optionId))
  const made: Id[] = []
  for (const [path, type] of [...c.paths.map((x) => [x, t] as const), ...l.paths.map((x) => [x, car] as const)]) {
    const nodes: Id[] = []
    for (const q of path) {
      const n = d.node(q)
      if (nodes[nodes.length - 1] !== n) nodes.push(n)
    }
    nodes.slice(1).forEach((n, i) => {
      const id = d.join(nodes[i], n, type.id, { left: type.width / 2, right: type.width / 2 })
      if (id) made.push(id)
    })
  }
  d.knit(new Set(), new Set(made))
  const streets = d.done()
  const segments = made.filter((id) => streets.segments.some((g) => g.id === id)).length
  return { project: withStreets(p, optionId, streets), segments, linked: c.linked, left: c.left, gates: c.gates, lots: l.linked, lotsLeft: l.left }
}

// ---- Streets follow their lots (Decision "Streets follow their lots", SE.6) ---------------------------------------

type Entrances = ReturnType<typeof lotEntrances>

/** Entrances by project and option: a drag's first project, settled against on every frame, is read once. */
const entrancesSeen = new WeakMap<Project, Map<Id, Entrances>>()
function entrancesOf(p: Project, optionId: Id): Entrances {
  let byOption = entrancesSeen.get(p)
  if (!byOption) entrancesSeen.set(p, (byOption = new Map()))
  let e = byOption.get(optionId)
  if (!e) byOption.set(optionId, (e = lotEntrances(p, optionId)))
  return e
}

/** Whether a lot is laid from the same in both: the masses, the brief, the standards, the site, the option but its streets. */
function sameGround(before: Project, after: Project, b: DesignOption | undefined, a: DesignOption): boolean {
  if (!b || before.masses !== after.masses || before.programs !== after.programs || before.buildings !== after.buildings) return false
  if (before.standards !== after.standards || before.site !== after.site) return false
  const keys = new Set([...Object.keys(b), ...Object.keys(a)] as (keyof DesignOption)[])
  keys.delete('streets')
  for (const k of keys) if (b[k] !== a[k]) return false
  return true
}

const same = (a: Point, b: Point) => dist(a, b) <= 1e-9

function withoutLot(n: StreetNode): StreetNode {
  const { lot: _, ...rest } = n
  return rest
}

/**
 * The street ends connected to the parking lots, kept so after an edit (the settle step, Decision "Streets follow
 * their lots"). Per option with lots: (1) a `lot` naming a lot that is gone is dropped (the node stays); (2) a
 * connected node whose lot's entrance moved (the lot, its mass or its entrance's end changed) goes to the new entrance,
 * its segments stretching, the streets' other nodes where they were; (3) a connected node that moved by itself farther
 * than LOT_LINK from the entrance lets go; (4) an end (a node of one segment) connected to none that is new or moved,
 * or that a lot's entrance came to, within LOT_LINK of that entrance, is connected: it goes onto it, and the lot's
 * `entry` is written as the end reached, so the lot never turns its entrance to its other end under the street. The
 * project as it was when nothing changed (no lots, or nothing they are laid from and no street end moved).
 */
export function followLots(before: Project, after: Project): Project {
  if (before === after) return after
  let q = after
  for (const o of after.options) {
    const s = o.streets
    if (!s?.segments.length) continue
    if (!o.lots?.length && !s.nodes.some((n) => n.lot)) continue
    const b = before.options.find((x) => x.id === o.id)
    const ground = sameGround(before, after, b, o)
    if (ground && b!.streets === s) continue
    q = followOption(before, b, q, o.id, ground)
  }
  return q
}

/** followLots in one option: `ground`, whether its lots are laid from the same as before. */
function followOption(before: Project, b: DesignOption | undefined, p: Project, optionId: Id, ground: boolean): Project {
  const o = optionOf(p, optionId)!
  const s = o.streets!
  const lots = new Map((o.lots ?? []).map((l) => [l.id, l]))
  const was = new Map((b?.streets?.nodes ?? []).map((n) => [n.id, n]))
  const degree = new Map<Id, number>()
  for (const g of s.segments) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const movedNode = (n: StreetNode) => {
    const w = was.get(n.id)
    return !w || w.x !== n.x || w.y !== n.y
  }
  // (1); then the entrances are read only if a lot may have moved or a connected node or an end did
  const kept = s.nodes.map((n) => (n.lot && !lots.has(n.lot) ? withoutLot(n) : n))
  const read = lots.size > 0 && (!ground || kept.some((n) => (n.lot || degree.get(n.id) === 1) && movedNode(n)))
  if (!read) return kept.every((n, i) => n === s.nodes[i]) ? p : withStreets(p, optionId, { ...s, nodes: kept })
  const then: Entrances = b ? entrancesOf(before, optionId) : new Map()
  // the roads pick an entrance's end only for a lot with no entry: with every lot's written, a street edit moves none
  const now = ground && [...lots.values()].every((l) => l.entry) ? then : entrancesOf(p, optionId)
  const came = (id: Id) => {
    const e = now.get(id)
    const w = then.get(id)
    return !!e && (!w || !same(w.at, e.at))
  }
  const follow = new Set<Id>()
  const entries = new Map<Id, 'start' | 'end'>()
  const nodes = kept.map((n): StreetNode => {
    if (n.lot) {
      const e = now.get(n.lot)
      if (!e) return n
      // (2) its lot's entrance moved: it goes there
      if (came(n.lot)) {
        if (same(n, e.at)) return n
        follow.add(n.id)
        return { ...n, x: e.at.x, y: e.at.y }
      }
      // (3) moved by itself, too far: it lets go
      return movedNode(n) && dist(n, e.at) > LOT_LINK ? withoutLot(n) : n
    }
    // (4) an end that came to an entrance, or an entrance that came to it
    if (degree.get(n.id) !== 1) return n
    const moved = movedNode(n)
    for (const [id, e] of now) {
      if (!(moved || came(id)) || dist(n, e.at) > LOT_LINK) continue
      if (lots.get(id)!.entry !== e.end) entries.set(id, e.end)
      if (!same(n, e.at)) follow.add(n.id)
      return { ...n, x: e.at.x, y: e.at.y, lot: id }
    }
    return n
  })
  let r = p
  if (nodes.some((n, i) => n !== s.nodes[i])) {
    if (follow.size) {
      // the ends gone to an entrance meet what they cross on the way (a node there), as a dragged node does
      const d = new Draft(p, { ...s, nodes })
      d.knit(follow, new Set())
      r = withStreets(p, optionId, d.done())
    } else r = withStreets(p, optionId, { ...s, nodes })
  }
  for (const [id, end] of entries) r = setLot(r, optionId, id, { entry: end })
  return r
}

/** The point of an existing road's drawn line nearest q, and how far it is. */
function nearestOnRoad(r: ExistingRoad, q: Point): { at: Point; d: number; k: number; t: number } {
  let best = { at: r.points[0], d: Infinity, k: 0, t: 0 }
  for (let k = 0; k + 1 < r.points.length; k++) {
    const a = r.points[k]
    const b = r.points[k + 1]
    const c = closestOnSegment(q, a, b)
    const d = dist(c, q)
    if (d < best.d) best = { at: c, d, k, t: dist(a, b) < 1e-12 ? 0 : dist(a, c) / dist(a, b) }
  }
  return best
}

/**
 * The street ends linked to the existing streets, kept so after an edit (the settle step, Decision "Street links"; the
 * lots' `followLots` for roads). Per option: (1) a `road` naming an existing street that is gone is dropped (the node stays); (2) a
 * linked node whose road was edited goes where its point on the road's drawn line went (the same stretch at the same fraction, its
 * segments stretching, the streets' other nodes where they were; the nearest point of the line when the road's points were added or
 * removed); (3) a linked node that moved by itself farther than LOT_LINK from the line lets go, nearer it goes back onto it;
 * (4) an end (a node of one segment) linked to nothing, new or moved or under a changed site, within JOIN of a drawn line, is linked.
 * The project as it was when nothing changed.
 */
export function followRoads(before: Project, after: Project): Project {
  if (before === after) return after
  const roads = after.site.existingRoads ?? []
  const same = before.site.existingRoads === after.site.existingRoads
  let q = after
  for (const o of after.options) {
    const s = o.streets
    if (!s?.segments.length) continue
    if (!roads.length && !s.nodes.some((n) => n.road)) continue
    const b = before.options.find((x) => x.id === o.id)
    if (same && b?.streets === s) continue
    q = followRoadsIn(before, b, q, o.id)
  }
  return q
}

/**
 * The street ends that lie on an existing street's drawn line, linked to it, in a project built whole (the sample, the demo) as the migration
 * (step 19) and settle (rule 4) link them: without it the first edit of the existing street leaves them behind. The project when none is on one.
 */
export function linkStreetEnds(p: Project): Project {
  return followRoads({ ...p, site: { ...p.site, existingRoads: undefined } }, p)
}

/** followRoads in one option. */
function followRoadsIn(before: Project, b: DesignOption | undefined, p: Project, optionId: Id): Project {
  const s = optionOf(p, optionId)!.streets!
  const now = new Map((p.site.existingRoads ?? []).map((r) => [r.id, r]))
  const then = new Map((before.site.existingRoads ?? []).map((r) => [r.id, r]))
  const was = new Map((b?.streets?.nodes ?? []).map((n) => [n.id, n]))
  const degree = new Map<Id, number>()
  for (const g of s.segments) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const roadsChanged = before.site.existingRoads !== p.site.existingRoads
  const follow = new Set<Id>()
  const nodes = s.nodes.map((n): StreetNode => {
    const w = was.get(n.id)
    const itself = !w || w.x !== n.x || w.y !== n.y
    if (n.road) {
      const r = now.get(n.road)
      // (1) its road is gone
      if (!r) return withoutRoad(n)
      // (3) moved by itself
      if (itself) {
        const c = nearestOnRoad(r, n)
        if (c.d > LOT_LINK) return withoutRoad(n)
        if (c.d <= 1e-9) return n
        follow.add(n.id)
        return { ...n, x: c.at.x, y: c.at.y }
      }
      // (2) its road was edited: the same stretch at the same fraction, or the nearest point when the road's points changed
      const old = then.get(n.road)
      if (!old || old === r) return n
      const was0 = nearestOnRoad(old, n)
      const to = old.points.length === r.points.length ? lerp(r.points[was0.k], r.points[was0.k + 1], was0.t) : nearestOnRoad(r, n).at
      if (same(n, to)) return n
      follow.add(n.id)
      return { ...n, x: to.x, y: to.y }
    }
    // (4) an end that is on a drawn line
    if (n.lot || degree.get(n.id) !== 1 || !(itself || roadsChanged)) return n
    for (const r of now.values()) if (nearestOnRoad(r, n).d <= JOIN) return { ...n, road: r.id }
    return n
  })
  if (nodes.every((n, i) => n === s.nodes[i])) return p
  if (!follow.size) return withStreets(p, optionId, { ...s, nodes })
  // the ends that went along meet what they cross on the way (a node there), as a dragged node does
  const d = new Draft(p, { ...s, nodes })
  d.knit(follow, new Set())
  return withStreets(p, optionId, d.done())
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function withoutRoad(n: StreetNode): StreetNode {
  const { road: _, ...rest } = n
  return rest
}

/**
 * A street end let go of its lot (Properties' Disconnect, Decision "Streets follow their lots"): it stays where it is,
 * and the lot moves without it from then on. A node not connected: the project as it was.
 */
export function disconnectStreetEnd(p: Project, optionId: Id, nodeId: Id): Project {
  const s = streetsOf(p, optionId)
  if (!s.nodes.some((n) => n.id === nodeId && n.lot)) return p
  return withStreets(p, optionId, { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? withoutLot(n) : n)) })
}

/**
 * Locks or frees street segments of one option (Decision "Padlocks by kind": a street's padlock is its segments' and is of one option:
 * a copy of an option has the same segment ids, and locking one there leaves the other free): a locked segment keeps its fields and the
 * place of its two nodes, whoever asks (state/settle.ts). Nothing to change: the project as it was.
 */
export function lockStreets(p: Project, segmentIds: Id[], on: boolean, optionId: Id): Project {
  const these = new Set(segmentIds)
  const changes = (g: StreetSegment) => these.has(g.id) && (g.locked === true) !== on
  const o = optionOf(p, optionId)
  if (!o?.streets?.segments.some(changes)) return p
  const streets = { ...o.streets, segments: o.streets.segments.map((g) => (changes(g) ? setLocked(g, on) : g)) }
  return { ...p, options: p.options.map((x) => (x.id === optionId ? { ...x, streets } : x)) }
}

// ---- The street as a path (Phase PE.1, Decision "Path engine"; `state/actions/path.ts` runs it) -----------------------------

/** The chain of the street `id` names: its street id (`street:<segment>`) or a segment's. */
function chainAt(s: Streets, id: Id): Chain | null {
  const seg = id.startsWith('street:') ? id.slice('street:'.length) : id
  return streetChains(s).find((c) => c.segs.includes(seg)) ?? null
}

/** A segment's sides and lanes read walking the chain: swapped (the lanes turned) for one stored the other way; a segment with no lanes has none. */
const walked = (g: Pick<StreetSegment, 'left' | 'right' | 'lanes'>, forward: boolean): Stretch => {
  const sides = forward ? { left: g.left, right: g.right } : { left: g.right, right: g.left }
  return g.lanes ? { ...sides, lanes: forward ? [...g.lanes] : [...g.lanes].reverse() } : sides
}

const sameLanes = (a: number[] | undefined, b: number[] | undefined) => (a === undefined || b === undefined ? a === b : a.length === b.length && a.every((x, i) => x === b[i]))

function streetRead(p: Project, ref: { id: Id }, optionId: Id): PathRead | null {
  const s = optionOf(p, optionId)?.streets
  const chain = s && chainAt(s, ref.id)
  if (!s || !chain) return null
  const at = new Map(s.nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  const byId = new Map(s.segments.map((g) => [g.id, g]))
  if (chain.nodes.some((n) => !at.has(n))) return null
  const degree = new Map<Id, number>()
  for (const g of s.segments) for (const n of [g.a, g.b]) degree.set(n, (degree.get(n) ?? 0) + 1)
  const path: Path = { points: chain.nodes.map((n) => at.get(n)!), stretches: chain.segs.map((id, k) => walked(byId.get(id)!, chain.forward[k])) }
  return { path, nodes: chain.nodes, held: chain.segs.map((id) => byId.get(id)!.locked === true), shared: chain.nodes.map((n) => (degree.get(n) ?? 0) > 2) }
}

function streetWrite(p: Project, ref: { id: Id }, optionId: Id, op: PathOp): PathWrite {
  const s = optionOf(p, optionId)?.streets
  const chain = s && chainAt(s, ref.id)
  const read = streetRead(p, ref, optionId)
  if (!s || !chain || !read) return { project: p, reason: 'That street is not there' }
  const refuse = (reason: string): PathWrite => ({ project: p, reason })
  const m = chain.segs.length
  const closed = chain.nodes[0] === chain.nodes[m]
  const byId = new Map(s.segments.map((g) => [g.id, g]))
  // a node tied to a lot or an existing street stays put in `equal`: moving it would drag the link
  const tiedNodes = new Set(s.nodes.filter((n) => n.lot || n.road).map((n) => n.id))
  const tied = chain.nodes.map((n) => tiedNodes.has(n))
  const run = runPathOp(read.path, op.op === 'equal' ? { op: 'equal', held: heldOf(op, read, closed, tied) } : op)
  if (!run.ok) return refuse(run.reason ?? 'Not possible')
  const notes = run.notes.length ? { notes: run.notes } : {}
  /** The streets with the run's sides on their segments (each turned back to how it is stored). */
  const withSides = (): Streets => {
    const next = new Map<Id, Stretch>()
    chain.segs.forEach((id, k) => next.set(id, walked(run.path.stretches[k], chain.forward[k])))
    const segments = s.segments.map((g) => {
      const n = next.get(g.id)
      if (!n || (n.left === g.left && n.right === g.right && sameLanes(n.lanes, g.lanes))) return g
      // the lanes the run gives, turned back to how the segment is stored; none given: none kept
      const { lanes: _, ...rest } = g
      return { ...rest, left: n.left, right: n.right, ...(n.lanes ? { lanes: n.lanes } : {}) }
    })
    return segments.every((g, i) => g === s.segments[i]) ? s : { ...s, segments }
  }
  switch (op.op) {
    case 'node':
      return { project: moved(p, optionId, s, new Set([chain.nodes[op.i]]), () => ({ x: op.to.x, y: op.to.y })), ...notes }
    case 'stretch':
      return { project: moved(p, optionId, s, new Set([chain.nodes[op.k], chain.nodes[op.k + 1]]), (n) => ({ x: n.x + op.by.x, y: n.y + op.by.y })), ...notes }
    case 'insert': {
      const r = splitStreetSegment(p, optionId, chain.segs[op.k], op.at)
      return r ? { project: r.project, ...notes } : refuse('That is a node already')
    }
    case 'remove': {
      let g: StreetSegment
      let h: StreetSegment
      let node: Id
      if (closed) {
        if (m <= 3) return refuse('A street has two nodes at least')
        const i = op.i % m
        g = byId.get(chain.segs[(i - 1 + m) % m])!
        h = byId.get(chain.segs[i])!
        node = chain.nodes[i]
      } else if (op.i > 0 && op.i < m) {
        g = byId.get(chain.segs[op.i - 1])!
        h = byId.get(chain.segs[op.i])!
        node = chain.nodes[op.i]
      } else {
        // an end: its stretch goes, and its node when nothing else meets there (a crossing or a T keeps the other streets whole)
        const gone = chain.segs[op.i === 0 ? 0 : m - 1]
        return { project: withStreets(p, optionId, tidy({ nodes: s.nodes, segments: s.segments.filter((x) => x.id !== gone) })), ...notes }
      }
      const merged = mergeAt(s, node, g, h)
      return merged ? { project: withStreets(p, optionId, merged), ...notes } : refuse('Those stretches would run between the same two nodes')
    }
    case 'side':
    case 'width':
    case 'lanes':
    case 'line':
    case 'lane':
    case 'equal-lanes':
    case 'lane-widths': {
      const next = withSides()
      return { project: next === s ? p : withStreets(p, optionId, next), ...notes }
    }
    case 'equal': {
      const next = withSides()
      const held = new Set(heldOf(op, read, closed, tied))
      const to = new Map<Id, Point>()
      run.path.points.forEach((q, i) => {
        const n = chain.nodes[i]
        if (!held.has(i) && Math.hypot(q.x - read.path.points[i].x, q.y - read.path.points[i].y) > 1e-9) to.set(n, q)
      })
      if (to.size) return { project: moved(p, optionId, next, new Set(to.keys()), (n) => to.get(n.id)!), ...notes }
      return { project: next === s ? p : withStreets(p, optionId, next), ...notes }
    }
  }
}

/** The nodes `equal` leaves where they are: those asked, those another street meets, those tied to a lot or an existing street, and a loop's first (its last is the same node). */
function heldOf(op: Extract<PathOp, { op: 'equal' }>, read: PathRead, closed: boolean, tied: boolean[]): number[] {
  const held = new Set(op.held ?? [])
  read.shared.forEach((x, i) => (x || tied[i]) && held.add(i))
  if (closed) {
    held.add(0)
    held.add(read.shared.length - 1)
  }
  return [...held]
}

/** A street read and written as a path (`PATH_ADAPTERS.street`). */
export const streetPath: PathAdapter = { read: streetRead, write: streetWrite }
