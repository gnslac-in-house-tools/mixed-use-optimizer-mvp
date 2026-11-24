// The verbs over a mixed selection (Phase GT.2, Decision "General tools"): the Tools strip's Move, Copy and Rotate act on
// whatever is picked, of any kind at once (masses, a street's nodes, existing streets, lots, gates, dimensions, reference lines, notes), as one step. Each kind
// goes through its own verb, in this order: masses, nodes, existing streets, lots, gates, dimensions, reference lines, notes, drawings. Pure, Project → Project, like every
// action; a thing that cannot go with the rest is left alone and named in `skipped`, to tell the user.
//   masses      move: moveMasses · copy: copyWithBlocks (a block's masses as a copy of their block) · turn: turnMassesAbout
//   nodes       move: moveStreetNodes (the streets they join stretch) · turn: turnStreetNodes · copy: each street
//               segment between two picked nodes is drawn again by drawStreet with its type, width and vehicles (its
//               radius and own stalls are not copied); drawn from the same points, the copies join each other; never
//               onto another street's paving (its inner nodes are no ends, Decision "Streets stay connected")
//   existing    (PE.2) an existing street: move and turn by its points (the street ends linked to it and the gates on it follow, in settle) ·
//               copy: a street of its own (fresh id, unlocked, in no group but its copies') · a locked one stays, said, in move, turn and mirror
//   lots        a free lot goes by its rect; an anchored lot follows its wall: with its mass picked it is left to it (a
//               copied mass gets an anchored copy of it), alone it is skipped
//   gates       move: to the point nearest where d puts them, on a side of its own kind of host (a street, an existing street, the boundary; at most
//               5 m away for a street's, else it stays) · copy: a gate there · turn: skipped. A gate picked with the existing street it stands on
//               goes with it (moved, turned, mirrored, copied) and is not placed again
//   dimensions  one anchored at both ends to picked masses follows them (state/settle.ts); any other picked one goes
//               free, its anchors dropped (a locked one keeps its length, its lock still pulls what it is anchored to)
//   lines       (AS.5) the project's reference lines: move and turn by their points; copy: new lines (new ids, unlocked)
//   notes       (AS.5) move: the point · turn: the point goes round and the angle follows · copy: new notes on the same level, unlocked
//   drawings    (DM.2) parts of an imported drawing: move and turn go through moveDrawings / turnDrawings after the rest,
//               a locked layer or parcels staying where they are, said; copy: skipped, once
// Mirror, Array and Align (AS.5, Decision "Mirror, Array, Align") are verbs of the same shape beside them:
//   mirrorPicked  reflects about a line (keeping the original, or not): masses and what they keep by their walls (mirrorMasses; a
//                 block's mass is left, said), a street's nodes (and each segment's side), existing streets (left ↔ right, their gates' sides
//                 with them), free lots, dimensions, reference lines, notes; gates stay (but those on a mirrored existing street) and
//                 drawings are not mirrored, said
//   arrayPicked   copyPicked count − 1 times along a vector, and again along a second one for the rows of a grid
//   alignPicked   moves each unit (a group of any kind, a mass, an existing street, a free lot, a reference line, a note) square to a line until its edge
//                 nearest the line, or its centre, is on it; streets, gates and dimensions outside a group, and drawings, are skipped, said
// Copies of a group (Phase AS.5 task 6, Decision "Groups of any kind"): when two or more members of a group are copied, Copy, Array and Mirror
// (keeping the originals) give the copies one new group of their own, across kinds; a member copied alone is in none.
import { LOT_SIDES, type Gate, type GateOn, type Grid, type Id, type Lot, type Mass, type Point, type Polygon, type Project } from '../../model/schema.ts'
import { NOT_COPIED, type Picked } from '../../model/picked.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { footprintContour, footprintPolygon, rotate } from '../../engine/geom/footprint.ts'
import { nearestT, pointAt } from '../../engine/geom/perimeter.ts'
import { reflectAngle, reflectPoint, reflectVector } from '../../engine/geom/reflect.ts'
import { gatePlace, gatesOf, type GateHosts } from '../../engine/circulation/gates.ts'
import { gateHomeNear } from '../../engine/circulation/gateSides.ts'
import { gridOf } from '../../engine/grid/index.ts'
import { withFollowers } from '../../engine/graph/links.ts'
import { groupIdsIn, groupOfNode, refGroup, refGroupMembers, roadIdOfSegment, withGroupOn, type Member } from '../../engine/groups.ts'
import { wallOf, type Wall } from '../../modules/parking/engine/lots.ts'
import { addLot, setLot } from '../../modules/parking/actions.ts'
import { copyWithBlocks } from '../../modules/warehouse/actions.ts'
import { existingRoadLocked } from '../../kinds/locked.ts'
import { addGate, addGateOn, copyExistingRoads, mirrorExistingRoads, moveExistingRoads, turnExistingRoads, updateGate } from './circulation.ts'
import { addNote, addReferenceLine, mirrorNotes, mirrorReferenceLines, moveNotes, moveReferenceLines, turnNotes, turnReferenceLines } from './annotations.ts'
import { addDimension, mirrorDimensions, moveDimensions, turnDimensions } from './dimensions.ts'
import { moveDrawings, turnDrawings } from './drawings.ts'
import { copyMasses, isBlockMass, mirrorMasses, moveMasses, newId, translateFootprint, turnMassesAbout } from './masses.ts'
import { drawStreet, mirrorStreetNodes, moveStreetNodes, turnStreetNodes } from './streets.ts'

type Result = { project: Project; skipped: string[] }

/** A copy that stands for a thing of a group: `key` names the thing it was made of (a street once, whatever its segments), `made` what was made. */
interface Born {
  key: string
  group: Id
  made: Member[]
}

/** Notes the copies of a thing that is in a group (a thing in none leaves nothing to note). */
function born(into: Born[], key: string, group: Id | undefined, ...made: Member[]): void {
  if (group !== undefined && made.length > 0) into.push({ key, group, made })
}

/**
 * The copies of a group's members, a group of their own across kinds: when two or more members of one group were copied, their copies share
 * one new id (the first free among every kind's); a member copied alone is in no group. Each group copied gets an id of its own, so an array's copies
 * are never one group, nor do they join the original's.
 */
function regrouped(into: Project, option: Id, copies: Born[]): Project {
  if (copies.length < 2) return into
  const by = new Map<Id, Born[]>()
  for (const c of copies) by.set(c.group, [...(by.get(c.group) ?? []), c])
  const taken = groupIdsIn(into)
  let q = into
  for (const list of by.values()) {
    if (new Set(list.map((c) => c.key)).size < 2) continue
    // masses alone: `copyMasses` made their group already
    if (list.every((c) => c.made.every((m) => m.kind === 'mass'))) continue
    const id = newId('g', taken)
    taken.push(id)
    q = withGroupOn(q, option, list.flatMap((c) => c.made), id)
  }
  return q
}

/** The group a thing is in (undefined for a group of one, which is none). */
const groupIn = (p: Project, option: Id, ref: Member): Id | undefined => (refGroupMembers(p, option, ref).length > 1 ? refGroup(p, option, ref) : undefined)

const gatesStay = (tool: string) => `Gates stay on their side: ${tool} leaves them`
const GATE_NOWHERE = 'A gate on a street goes to a side of a street within 5 m: there is none there'
/** What a gate on a street can stand on in this option. */
/**
 * Where the copy of a gate picked with its street stands, found by position (review R2): the nearest point of a side of the streets the copy drew (the
 * originals' segments left out), within the same reach as a gate Transform re-homes, from the place `to` the copy of the gate is put. A copy that knit
 * where it landed is split, and only its first half keeps the id `copyStreets` told: the gate's place along that id is not the gate's place on the plan.
 */
function copiedGateHome(p: Project, q: Project, optionId: Id, g: Gate, to: Point): GateOn | null {
  const was = new Set((p.options.find((o) => o.id === optionId)?.streets?.segments ?? []).map((x) => x.id))
  const s = q.options.find((o) => o.id === optionId)?.streets
  return s ? gateHomeNear(g, { streets: { ...s, segments: s.segments.filter((x) => !was.has(x.id)) } }, to) : null
}

const hostsOf = (p: Project, optionId: Id): GateHosts => ({ streets: p.options.find((o) => o.id === optionId)?.streets, existingRoads: p.site.existingRoads })
const GATES_STAY = gatesStay('Rotate')
const NOT_MIRRORED = 'Drawings are not mirrored'
const BLOCK_NOT_MIRRORED = 'A block is not mirrored: its type has one hand'
const NO_BOUNDARY = 'Gates need a site boundary: the site has none'

const plus = (q: Point, d: Point): Point => ({ x: q.x + d.x, y: q.y + d.y })
const unique = (ids: Id[]) => [...new Set(ids)]
const isNothing = (k: Picked) => !(k.masses.length || k.nodes.length || k.existing.length || k.lots.length || k.gates.length || k.dimensions.length || k.lines.length || k.notes.length || k.drawings.length)
const turns = (degrees: number) => Number.isFinite(degrees) && degrees !== 0
const goes = (d: Point) => Number.isFinite(d.x) && Number.isFinite(d.y) && (d.x !== 0 || d.y !== 0)

/** What is said of the locked existing streets that stayed where they were (Review Focus 5: Move, Rotate and Mirror skip them). */
const roadsStayed =(n: number): string => `${n} existing street${n === 1 ? '' : 's'} stayed: locked`
/** The other side of a street. */
const handed = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left')

/** The existing streets picked that are there: `free` go, `held` (locked) stay, `all` both (a copy changes nothing locked). */
function pickedRoads(p: Project, picked: Picked): { all: Id[]; free: Id[]; held: Id[] } {
  const all = unique(picked.existing).filter((id) => p.site.existingRoads?.some((r) => r.id === id))
  const held = all.filter((id) => existingRoadLocked(p, id))
  return { all, free: all.filter((id) => !held.includes(id)), held }
}

/** Whether a gate stands on one of these existing streets: it goes with them, and is not placed again. */
const ridesOn = (g: Gate, roads: ReadonlySet<Id>): boolean => g.on?.kind === 'existing-road' && roads.has(g.on.id)

/**
 * The segments of the option's streets that have both their nodes picked (Phase PE.2, review E2): they move, turn or are mirrored whole, and a gate standing
 * on one of them goes with it (the settle step keeps it on its side: `followGates`), so it is not placed again.
 */
const segmentsPicked = (p: Project, optionId: Id, picked: Picked): ReadonlySet<Id> => {
  const nodes = new Set(picked.nodes)
  return new Set((p.options.find((o) => o.id === optionId)?.streets?.segments ?? []).filter((g) => nodes.has(g.a) && nodes.has(g.b)).map((g) => g.id))
}
/** Whether a gate stands on one of these street segments. */
const ridesStreet = (g: Gate, segments: ReadonlySet<Id>): boolean => g.on?.kind === 'street' && segments.has(g.on.id)

/** Whether a gate is picked that rides neither one of these existing streets nor one of these street segments (Rotate and Mirror leave it where it is, and say so). */
const strayGates = (p: Project, optionId: Id, picked: Picked, roads: ReadonlySet<Id>, segments: ReadonlySet<Id> = new Set()): boolean => {
  const list = gatesOf(p, optionId)
  return picked.gates.some((id) => {
    const g = list.find((x) => x.id === id) ?? ({ id } as Gate)
    return !ridesOn(g, roads) && !ridesStreet(g, segments)
  })
}

const lotsOf = (p: Project, optionId: Id): Lot[] => p.options.find((o) => o.id === optionId)?.lots ?? []
/** The picked lots the option has, in its order. */
const pickedLots = (p: Project, optionId: Id, k: Picked): Lot[] => lotsOf(p, optionId).filter((l) => k.lots.includes(l.id))
const follows = (l: Lot, verb: 'move' | 'copy' | 'turn' | 'mirror' | 'align') => `${l.name} follows its wall: pick its mass to ${verb} it`
const boundaryOf = (p: Project) => (p.site.boundary ? contourToPolygon(p.site.boundary) : null)
const degreesIn = (a: number) => ((a % 360) + 360) % 360

/**
 * Moves every kind that can be moved: a lot, gate or dimension picked with nothing to move it is left as it is; a locked drawing too.
 * `followers` false: the masses picked alone, without the masses that move with them (Align moves those itself, each once).
 */
export function movePicked(p: Project, optionId: Id, picked: Picked, d: Point, followers = true): Result {
  if (isNothing(picked) || !goes(d)) return { project: p, skipped: [] }
  const skipped: string[] = []
  const massSet = new Set(picked.masses)
  let q = moveMasses(p, picked.masses, d, followers)
  q = moveStreetNodes(q, optionId, picked.nodes, d)
  // existing streets (Phase PE.2): a locked one stays, said; its linked street ends and its gates follow in settle
  const roads = pickedRoads(p, picked)
  q = moveExistingRoads(q, roads.free, d)
  if (roads.held.length) skipped.push(roadsStayed(roads.held.length))
  const going = new Set(roads.free)
  for (const l of pickedLots(p, optionId, picked)) {
    if (l.anchor) {
      if (!massSet.has(l.anchor.massId)) skipped.push(follows(l, 'move'))
    } else if (l.rect) q = setLot(q, optionId, l.id, { rect: { ...l.rect, center: plus(l.rect.center, d) } })
  }
  const poly = boundaryOf(p)
  const gates = gatesOf(p, optionId).filter((x) => picked.gates.includes(x.id))
  if (!poly && gates.some((g) => g.on === undefined)) skipped.push(NO_BOUNDARY)
  const riding = segmentsPicked(p, optionId, picked)
  for (const g of gates) {
    // a gate picked with its street goes with it (its place along it is kept): placing it again would move it twice
    if (ridesOn(g, going) || ridesStreet(g, riding)) continue
    if (g.on) {
      // on a street: to the nearest point of a side of its kind of host within 5 m of where d puts it, else it stays (plan Decision 17)
      const place = gatePlace(g, poly, hostsOf(p, optionId))
      const home = place && gateHomeNear(g, hostsOf(p, optionId), plus(place.at, d))
      if (home) q = updateGate(q, optionId, g.id, { on: home })
    } else if (poly && g.t !== undefined) q = updateGate(q, optionId, g.id, { t: nearestT(poly, plus(pointAt(poly, g.t), d)) })
  }
  q = moveDimensions(q, freeDimensions(p, picked), d)
  q = moveReferenceLines(q, picked.lines, d)
  q = moveNotes(q, picked.notes, d)
  const dr = moveDrawings(q, picked.drawings, d)
  return { project: dr.project, skipped: [...skipped, ...dr.skipped] }
}

/** Turns every kind that can turn about `pivot`: gates stay where they are (they say so), an anchored lot turns with its mass. */
export function turnPicked(p: Project, optionId: Id, picked: Picked, pivot: Point, degrees: number): Result {
  if (isNothing(picked) || !turns(degrees)) return { project: p, skipped: [] }
  const skipped: string[] = []
  const massSet = new Set(picked.masses)
  let q = turnMassesAbout(p, picked.masses, pivot, degrees)
  q = turnStreetNodes(q, optionId, picked.nodes, pivot, degrees)
  const roads = pickedRoads(p, picked)
  q = turnExistingRoads(q, roads.free, pivot, degrees)
  if (roads.held.length) skipped.push(roadsStayed(roads.held.length))
  for (const l of pickedLots(p, optionId, picked)) {
    if (l.anchor) {
      if (!massSet.has(l.anchor.massId)) skipped.push(follows(l, 'turn'))
    } else if (l.rect) {
      q = setLot(q, optionId, l.id, { rect: { ...l.rect, center: rotate(l.rect.center, pivot, degrees), rotation: degreesIn(l.rect.rotation + degrees) } })
    }
  }
  // a gate on a street turned with it goes with it; any other stays where it is
  const going = new Set(roads.free)
  if (strayGates(p, optionId, picked, going, segmentsPicked(p, optionId, picked))) skipped.push(GATES_STAY)
  q = turnDimensions(q, freeDimensions(p, picked), pivot, degrees)
  q = turnReferenceLines(q, picked.lines, pivot, degrees)
  q = turnNotes(q, picked.notes, pivot, degrees)
  const dr = turnDrawings(q, picked.drawings, pivot, degrees)
  return { project: dr.project, skipped: [...skipped, ...dr.skipped] }
}

/** Copies every kind but drawings (said once), each moved by d, and leaves the originals where they are. */
export function copyPicked(p: Project, optionId: Id, picked: Picked, d: Point): Result {
  if (isNothing(picked) || !goes(d)) return { project: p, skipped: [] }
  const skipped: string[] = []
  const copies: Born[] = []
  let q = p

  // masses: a block's as a copy of their block; `made` maps a copied mass to its copy, for the lots anchored to it
  const sources = unique(picked.masses).flatMap((id) => p.masses.filter((m) => m.id === id))
  const made = new Map<Id, Id>()
  if (sources.length) {
    const r = copyWithBlocks(q, sources, d, optionId)
    q = r.project
    // a block's mass: the mass of the same part in its block's copy
    const buildingOf = (x: Project, levelId: Id) => x.buildings.find((b) => b.levels.some((l) => l.id === levelId))
    const taken = new Set<Id>()
    for (const m of sources) {
      const pair = m.part === undefined ? undefined : r.blocks.find((b) => b.from === buildingOf(p, m.levelId)?.id)
      const to = pair && q.buildings.find((b) => b.id === pair.to)
      const copy = to && q.masses.find((x) => x.part === m.part && !taken.has(x.id) && to.levels.some((l) => l.id === x.levelId))
      if (copy) {
        made.set(m.id, copy.id)
        taken.add(copy.id)
      }
    }
    // any other: the copy made with its footprint moved by d (a block that could not be placed leaves none of its own)
    const fresh = r.ids.filter((id) => !taken.has(id)).flatMap((id) => q.masses.filter((x) => x.id === id))
    for (const m of sources.filter((x) => !made.has(x.id))) {
      const want = JSON.stringify(translateFootprint(m.footprint, d))
      const copy = fresh.find((x) => !taken.has(x.id) && x.levelId === m.levelId && JSON.stringify(x.footprint) === want)
      if (copy) {
        made.set(m.id, copy.id)
        taken.add(copy.id)
      }
    }
  }

  for (const m of sources) born(copies, `mass:${m.id}`, groupIn(p, optionId, { kind: 'mass', id: m.id }), ...(made.has(m.id) ? [{ kind: 'mass', id: made.get(m.id)! }] : []))

  // nodes: each segment between two picked nodes, drawn again
  const streetsDrawn = copyStreets(p, q, optionId, picked.nodes, (x) => plus(x, d), false)
  q = streetsDrawn.project
  skipped.push(...streetsDrawn.skipped)
  bornStreets(copies, p, optionId, streetsDrawn.copied)

  // existing streets (a locked one is copied too: nothing locked changes; the copy is born free)
  const roads = pickedRoads(p, picked)
  const roadMade = copiedRoads(copies, p, q, optionId, roads.all, d)
  q = roadMade.project

  // lots
  for (const l of pickedLots(p, optionId, picked)) {
    // a copy is born unlocked and in no group but the copies' own (`regrouped`)
    const { id: _id, name: _name, group: _group, locked: _locked, ...fields } = l
    let r: ReturnType<typeof addLot> = null
    if (l.rect) r = addLot(q, optionId, { ...fields, rect: { ...l.rect, center: plus(l.rect.center, d) } })
    else if (l.anchor && made.has(l.anchor.massId)) r = addLot(q, optionId, { ...fields, anchor: { ...l.anchor, massId: made.get(l.anchor.massId)! } })
    else skipped.push(follows(l, 'copy'))
    if (r) {
      q = r.project
      born(copies, `lot:${l.id}`, groupIn(p, optionId, { kind: 'lot', id: l.id }), { kind: 'lot', id: r.id })
    }
  }

  // gates
  const streetMade = new Map(streetsDrawn.copied.map((c) => [c.from, c.to]))
  const poly = boundaryOf(p)
  const gates = gatesOf(p, optionId).filter((x) => picked.gates.includes(x.id))
  if (!poly && gates.some((g) => g.on === undefined)) skipped.push(NO_BOUNDARY)
  for (const g of gates) {
    // a copy is born unlocked and in no group but the copies' own (`regrouped`), as a lot's is
    const { id: _id, t, on, group: _group, locked: _locked, ...rest } = g
    let r: { project: Project; id: Id } | null = null
    if (on?.kind === 'existing-road' && roadMade.made.has(on.id)) {
      // a gate picked with its street: its copy stands on the street's copy, the same side, the same place
      r = addGateOn(q, optionId, { ...on, id: roadMade.made.get(on.id)! }, rest)
    } else if (on?.kind === 'street' && streetMade.has(on.id)) {
      // by position on the copy as drawn (it may have been split where it knit), else on the segment it was drawn as
      const place = gatePlace(g, poly, hostsOf(p, optionId))
      const home = place && copiedGateHome(p, q, optionId, g, plus(place.at, d))
      r = addGateOn(q, optionId, home ?? { ...on, id: streetMade.get(on.id)! }, rest)
    } else if (on) {
      const place = gatePlace(g, poly, hostsOf(p, optionId))
      const home = place && gateHomeNear(g, hostsOf(p, optionId), plus(place.at, d))
      if (home) r = addGateOn(q, optionId, home, rest)
      else skipped.push(GATE_NOWHERE)
    } else if (poly && t !== undefined) r = addGate(q, optionId, nearestT(poly, plus(pointAt(poly, t), d)), rest)
    if (!r) continue
    q = r.project
    born(copies, `gate:${g.id}`, groupIn(p, optionId, { kind: 'gate', id: g.id }), { kind: 'gate', id: r.id })
  }

  // dimensions: after the masses, so an end on a copied corner is anchored to the copy
  for (const dim of (p.dimensions ?? []).filter((x) => picked.dimensions.includes(x.id))) {
    const r = addDimension(q, plus(dim.a, d), plus(dim.b, d), dim.offset, dim.levelId)
    if (!r) continue
    q = r.project
    born(copies, `dimension:${dim.id}`, groupIn(p, optionId, { kind: 'dimension', id: dim.id }), { kind: 'dimension', id: r.id })
  }
  // reference lines and notes: new ones, unlocked, on the same level for a note
  for (const line of (p.referenceLines ?? []).filter((x) => picked.lines.includes(x.id))) {
    const r = addReferenceLine(q, line.points.map((x) => plus(x, d)))
    if (!r) continue
    q = r.project
    born(copies, `reference-line:${line.id}`, groupIn(p, optionId, { kind: 'reference-line', id: line.id }), { kind: 'reference-line', id: r.id })
  }
  for (const n of (p.notes ?? []).filter((x) => picked.notes.includes(x.id))) {
    const r = addNote(q, plus(n.at, d), n.text, n.levelId, { angle: n.angle, size: n.size })
    if (!r) continue
    q = r.project
    born(copies, `note:${n.id}`, groupIn(p, optionId, { kind: 'note', id: n.id }), { kind: 'note', id: r.id })
  }
  if (picked.drawings.length) skipped.push(NOT_COPIED)
  return { project: regrouped(q, optionId, copies), skipped }
}

/**
 * Each segment of `from`'s option between two of these nodes, drawn again into `into` through `put` (its radius and own stalls are
 * not copied); `handed`: a mirrored copy, its side changing hand. A node alone, with no segment of its own picked, says so.
 */
function copyStreets(from: Project, into: Project, optionId: Id, nodes: Id[], put: (q: Point) => Point, handed: boolean): Result & { copied: { from: Id; to: Id }[] } {
  if (!nodes.length) return { project: into, skipped: [], copied: [] }
  const copied: { from: Id; to: Id }[] = []
  let q = into
  const s = from.options.find((o) => o.id === optionId)?.streets
  const these = new Set(nodes)
  const at = new Map((s?.nodes ?? []).map((n) => [n.id, n]))
  const drawn = new Set<Id>()
  for (const g of (s?.segments ?? []).filter((x) => these.has(x.a) && these.has(x.b))) {
    const a = at.get(g.a)
    const b = at.get(g.b)
    const edges = handed ? { left: g.right, right: g.left } : { left: g.left, right: g.right }
    // its stored lanes go with it, told walking the copy: a mirror image reads them from the other hand
    const lanes = g.lanes ? { lanes: handed ? [...g.lanes].reverse() : g.lanes } : {}
    const r = a && b && drawStreet(q, optionId, [put(a), put(b)], g.type, undefined, g.vehicles, { paving: false, edges, ...lanes })
    if (!r) continue
    q = r.project
    drawn.add(g.a).add(g.b)
    copied.push({ from: g.id, to: r.segments[0] })
  }
  const alone = nodes.some((id) => at.has(id) && !drawn.has(id))
  return { project: q, skipped: alone ? ['A street node alone cannot be copied: pick its street segment'] : [], copied }
}

/** Notes the segments a copy of streets drew, for the group each came from (a street counts once, whatever its segments). */
function bornStreets(into: Born[], p: Project, option: Id, copied: { from: Id; to: Id }[]): void {
  const segments = p.options.find((o) => o.id === option)?.streets?.segments ?? []
  for (const c of copied) {
    const group = segments.find((g) => g.id === c.from)?.group
    if (group !== undefined) born(into, `street:${roadIdOfSegment(p, option, c.from) ?? c.from}`, group, { kind: 'segment', id: c.to })
  }
}

/**
 * The existing streets `ids` copied into `into`, each moved by `d`, and noted for the group each came from (`born`); `made` maps a street to its copy.
 * `ids` are streets that are there (`pickedRoads`), so the copies are in their order.
 */
function copiedRoads(copies: Born[], from: Project, into: Project, option: Id, ids: Id[], d: Point): { project: Project; made: Map<Id, Id> } {
  const r = copyExistingRoads(into, ids, d)
  const made = new Map<Id, Id>()
  ids.forEach((id, i) => {
    const copy = r.ids[i]
    if (copy === undefined) return
    made.set(id, copy)
    born(copies, `existing-road:${id}`, groupIn(from, option, { kind: 'existing-road', id }), { kind: 'existing-road', id: copy })
  })
  return { project: r.project, made }
}

/** The picked dimensions that go by themselves: not those anchored at both ends to masses that move (settle makes those follow). */
function freeDimensions(p: Project, picked: Picked): Id[] {
  const massSet = new Set(picked.masses)
  const onPicked = (a: { massId: Id } | undefined) => a !== undefined && massSet.has(a.massId)
  return (p.dimensions ?? []).filter((x) => picked.dimensions.includes(x.id) && !(onPicked(x.anchorA) && onPicked(x.anchorB))).map((x) => x.id)
}

// ---- Mirror, Array, Align (AS.5, Decision "Mirror, Array, Align") ---------------------------------------------------

const isLine = (a: Point, b: Point) => [a.x, a.y, b.x, b.y].every(Number.isFinite) && (a.x !== b.x || a.y !== b.y)
const whole = (n: number) => Number.isInteger(n) && n >= 1
const once = (xs: string[]) => [...new Set(xs)]
const otherEnd = (end: 'start' | 'end'): 'start' | 'end' => (end === 'start' ? 'end' : 'start')

/** A mass's outline: a contour's real one (its arcs and rounded corners to a tenth of a millimetre), a rect's four corners. */
const outlineOf = (m: Mass): Polygon => (m.footprint.kind === 'contour' ? contourToPolygon(m.footprint.contour, 1e-4) : footprintPolygon(m.footprint))

/** Where each corner of a mass went when it was reflected: its vertex's index in the new contour (the order reverses). */
function vertexMap(was: Mass, now: Mass, a: Point, b: Point): (vertex: number) => number {
  const after = footprintContour(now.footprint).vertices
  const to = footprintContour(was.footprint).vertices.map((v) => {
    const q = reflectPoint(v, a, b)
    let best = 0
    let near = Infinity
    after.forEach((c, j) => {
      const e = Math.hypot(c.x - q.x, c.y - q.y)
      if (e < near) {
        near = e
        best = j
      }
    })
    return best
  })
  return (v) => to[v] ?? v
}

/**
 * A lot's anchor after the mass it stands against was reflected: the side of the new box that is the mirror image of the old one (the
 * one whose way out is the reflection of the old way out, and nearest the reflection of its middle), and the stretch of it `from`
 * and `length` name measured from that side's own start. A side held whole stays whole. `reversed`: the new side runs the other way
 * along the wall than the reflected old one did, so the end of the aisles a lot's entrance is (`entry`) is the other end.
 */
function mirroredAnchor(was: Polygon, now: Polygon, k: NonNullable<Lot['anchor']>, a: Point, b: Point): { anchor: NonNullable<Lot['anchor']>; reversed: boolean } {
  const old = wallOf(was, k.side)
  if (!old) return { anchor: k, reversed: false }
  const middle = (w: Wall): Point => ({ x: w.start.x + (w.along.x * w.length) / 2, y: w.start.y + (w.along.y * w.length) / 2 })
  const target = reflectPoint(middle(old), a, b)
  const out = reflectVector(old.out, a, b)
  let best: Wall | null = null
  let score = [-Infinity, -Infinity]
  for (const side of LOT_SIDES) {
    const w = wallOf(now, side)
    if (!w) continue
    const facing = Math.round((w.out.x * out.x + w.out.y * out.y) * 1e6)
    const nearer = -Math.hypot(middle(w).x - target.x, middle(w).y - target.y)
    if (facing > score[0] || (facing === score[0] && nearer > score[1])) {
      best = w
      score = [facing, nearer]
    }
  }
  if (!best) return { anchor: k, reversed: false }
  const way = reflectVector(old.along, a, b)
  const reversed = best.along.x * way.x + best.along.y * way.y < 0
  if (k.from === undefined && k.length === undefined) return { anchor: { massId: k.massId, side: best.side }, reversed }
  const from = Math.min(k.from ?? 0, old.length)
  const to = k.length === undefined ? old.length : Math.min(old.length, from + k.length)
  const onNew = (s: number) => {
    const q = reflectPoint({ x: old.start.x + old.along.x * s, y: old.start.y + old.along.y * s }, a, b)
    return Math.min(best!.length, Math.max(0, (q.x - best!.start.x) * best!.along.x + (q.y - best!.start.y) * best!.along.y))
  }
  const lo = Math.min(onNew(from), onNew(to))
  const hi = Math.max(onNew(from), onNew(to))
  return { anchor: { massId: k.massId, side: best.side, ...(lo > 1e-9 ? { from: lo } : {}), ...(hi < best.length - 1e-9 ? { length: hi - lo } : {}) }, reversed }
}

/**
 * Reflects every kind that can be reflected about the line through a and b (Decision "Mirror, Array, Align"). `keep`: the originals
 * stay and each thing's mirror image is a copy (a new thing, unlocked, in no group but a group's copies' own, as Copy makes them);
 * not kept, the things themselves are reflected. A block's mass is not reflected (its type has one hand) and, kept, not copied: left
 * where it is, said. A street's nodes are reflected and its segments' sides change hand; an anchored lot goes with its mass, against
 * the same wall seen in the mirror, and alone is skipped; a dimension goes free with its offset's sign changed (or follows a mirrored
 * mass, its anchors on the same corners); gates stay and drawings are not mirrored, said. Nothing to do, or no line: the same project.
 */
export function mirrorPicked(p: Project, optionId: Id, picked: Picked, a: Point, b: Point, keep: boolean): Result {
  if (isNothing(picked) || !isLine(a, b)) return { project: p, skipped: [] }
  const skipped: string[] = []
  const copies: Born[] = []
  const r = (x: Point) => reflectPoint(x, a, b)
  const massSet = new Set(picked.masses)
  const grid: Grid | null = gridOf(p, optionId)
  let q = p

  // masses (a block's is left): kept, a copy of each, then reflected where it stands
  const sources = unique(picked.masses).flatMap((id) => p.masses.filter((m) => m.id === id))
  const hands = sources.filter((m) => !isBlockMass(p, m))
  if (hands.length < sources.length) skipped.push(BLOCK_NOT_MIRRORED)
  const made = new Map<Id, Id>() // a mass → its mirror image, when kept
  if (keep && hands.length) {
    const c = copyMasses(q, hands, { x: 0, y: 0 })
    hands.forEach((m, i) => {
      made.set(m.id, c.ids[i])
      born(copies, `mass:${m.id}`, groupIn(p, optionId, { kind: 'mass', id: m.id }), { kind: 'mass', id: c.ids[i] })
    })
    q = mirrorMasses(c.project, c.ids, a, b, grid, false)
  } else if (!keep) q = mirrorMasses(q, hands.map((m) => m.id), a, b, grid)

  // nodes
  const streetMade = new Map<Id, Id>()
  if (keep) {
    const drawn = copyStreets(p, q, optionId, picked.nodes, r, true)
    drawn.copied.forEach((c) => streetMade.set(c.from, c.to))
    q = drawn.project
    skipped.push(...drawn.skipped)
    bornStreets(copies, p, optionId, drawn.copied)
  } else q = mirrorStreetNodes(q, optionId, picked.nodes, a, b)

  // existing streets (Phase PE.2): kept, a copy of each is reflected where it stands (a locked one is copied too); not kept, the free ones are reflected
  // (a locked one stays, said). The gates on a reflected street change side with it, and a gate picked with its street is copied with it
  const roads = pickedRoads(p, picked)
  const reflected = new Set<Id>()
  const roadCopies = new Map<Id, Id>()
  if (keep && roads.all.length) {
    const c = copiedRoads(copies, p, q, optionId, roads.all, { x: 0, y: 0 })
    c.made.forEach((copy, id) => roadCopies.set(id, copy))
    q = mirrorExistingRoads(c.project, [...roadCopies.values()], a, b)
    roadCopies.forEach((_copy, id) => reflected.add(id))
  } else if (!keep) {
    q = mirrorExistingRoads(q, roads.free, a, b)
    roads.free.forEach((id) => reflected.add(id))
    if (roads.held.length) skipped.push(roadsStayed(roads.held.length))
  }

  // lots: a free one by its rect; an anchored one with its mass (a copy on the copied mass)
  for (const l of pickedLots(p, optionId, picked)) {
    if (l.anchor) {
      if (!massSet.has(l.anchor.massId)) skipped.push(follows(l, 'mirror'))
      else if (keep && made.has(l.anchor.massId)) {
        const was = p.masses.find((m) => m.id === l.anchor!.massId)
        const copy = q.masses.find((m) => m.id === made.get(l.anchor!.massId))
        if (!was || !copy) continue
        const { id: _id, name: _name, group: _group, locked: _locked, ...fields } = l
        const { anchor, reversed } = mirroredAnchor(outlineOf(was), outlineOf(copy), l.anchor, a, b)
        const added = addLot(q, optionId, { ...fields, anchor: { ...anchor, massId: copy.id }, ...(fields.entry && reversed ? { entry: otherEnd(fields.entry) } : {}) })
        if (added) {
          q = added.project
          born(copies, `lot:${l.id}`, groupIn(p, optionId, { kind: 'lot', id: l.id }), { kind: 'lot', id: added.id })
        }
      }
    } else if (l.rect) {
      // a lot's rows stack from its local bottom up (a row alone has its aisle above it) and its entrance is an end along x: a mirror
      // image keeps the bottom as the bottom, so 2α − rotation + 180 (the new y is the reflected old y), and the two ends swap
      const rect = { ...l.rect, center: r(l.rect.center), rotation: reflectAngle(l.rect.rotation - 180, a, b) }
      const entry = l.entry ? { entry: otherEnd(l.entry) } : {}
      if (keep) {
        const { id: _id, name: _name, group: _group, locked: _locked, ...fields } = l
        const added = addLot(q, optionId, { ...fields, rect, ...entry })
        if (added) {
          q = added.project
          born(copies, `lot:${l.id}`, groupIn(p, optionId, { kind: 'lot', id: l.id }), { kind: 'lot', id: added.id })
        }
      } else q = setLot(q, optionId, l.id, { rect, ...entry })
    }
  }
  // the lots against a mass that was reflected stay against the same wall seen in the mirror, picked or not
  const moved = new Map<Id, (vertex: number) => number>()
  if (!keep) {
    for (const m of p.masses) {
      const now = q.masses.find((x) => x.id === m.id)
      if (!now || now === m) continue
      moved.set(m.id, vertexMap(m, now, a, b))
      for (const o of q.options) {
        for (const l of o.lots ?? []) {
          if (l.anchor?.massId !== m.id) continue
          const { anchor, reversed } = mirroredAnchor(outlineOf(m), outlineOf(now), l.anchor, a, b)
          q = setLot(q, o.id, l.id, { anchor, ...(l.entry && reversed ? { entry: otherEnd(l.entry) } : {}) })
        }
      }
    }
  }

  // a gate picked with its street: not kept, its side changed with its street's (`mirrorExistingRoads`); kept, its copy stands on the street's copy
  if (keep) {
    for (const g of gatesOf(p, optionId).filter((x) => picked.gates.includes(x.id) && x.on?.kind === 'existing-road' && roadCopies.has(x.on.id))) {
      const { id: _id, t: _t, on, group: _group, locked: _locked, ...rest } = g
      const added = addGateOn(q, optionId, { ...on!, id: roadCopies.get(on!.id)!, side: handed(on!.side) }, rest)
      q = added.project
      born(copies, `gate:${g.id}`, groupIn(p, optionId, { kind: 'gate', id: g.id }), { kind: 'gate', id: added.id })
    }
    // a gate picked with its street's segment: its copy stands on the mirror image of the segment, on the other side
    for (const g of gatesOf(p, optionId).filter((x) => picked.gates.includes(x.id) && x.on?.kind === 'street' && streetMade.has(x.on.id))) {
      const { id: _id, t: _t, on, group: _group, locked: _locked, ...rest } = g
      // where its mirror image stands, on the copy as drawn (it may have been split where it knit), else on the segment it was drawn as
      const place = gatePlace(g, boundaryOf(p), hostsOf(p, optionId))
      const home = place && copiedGateHome(p, q, optionId, g, r(place.at))
      const added = addGateOn(q, optionId, home ?? { ...on!, id: streetMade.get(on!.id)!, side: handed(on!.side) }, rest)
      q = added.project
      born(copies, `gate:${g.id}`, groupIn(p, optionId, { kind: 'gate', id: g.id }), { kind: 'gate', id: added.id })
    }
  }
  if (strayGates(p, optionId, picked, reflected, segmentsPicked(p, optionId, picked))) skipped.push(gatesStay('Mirror'))

  // dimensions
  if (keep) {
    for (const dim of (p.dimensions ?? []).filter((x) => picked.dimensions.includes(x.id))) {
      const added = addDimension(q, r(dim.a), r(dim.b), dim.offset === 0 ? 0 : -dim.offset, dim.levelId)
      if (!added) continue
      q = added.project
      born(copies, `dimension:${dim.id}`, groupIn(p, optionId, { kind: 'dimension', id: dim.id }), { kind: 'dimension', id: added.id })
    }
  } else q = mirrorDimensions(q, picked.dimensions, a, b, moved)

  // reference lines and notes: a copy is made where the original is, then reflected
  if (keep) {
    for (const line of (p.referenceLines ?? []).filter((x) => picked.lines.includes(x.id))) {
      const added = addReferenceLine(q, line.points)
      if (!added) continue
      q = mirrorReferenceLines(added.project, [added.id], a, b)
      born(copies, `reference-line:${line.id}`, groupIn(p, optionId, { kind: 'reference-line', id: line.id }), { kind: 'reference-line', id: added.id })
    }
    for (const n of (p.notes ?? []).filter((x) => picked.notes.includes(x.id))) {
      const added = addNote(q, n.at, n.text, n.levelId, { angle: n.angle, size: n.size })
      if (!added) continue
      q = mirrorNotes(added.project, [added.id], a, b)
      born(copies, `note:${n.id}`, groupIn(p, optionId, { kind: 'note', id: n.id }), { kind: 'note', id: added.id })
    }
  } else {
    q = mirrorReferenceLines(q, picked.lines, a, b)
    q = mirrorNotes(q, picked.notes, a, b)
  }
  if (picked.drawings.length) skipped.push(NOT_MIRRORED)
  return { project: regrouped(q, optionId, copies), skipped }
}

/**
 * A row, or a grid, of copies (Decision "Mirror, Array, Align"): `count − 1` copies along `d` (the k-th at k·d), each what `copyPicked`
 * makes; with `rows` over 1 and a second vector `d2`, the whole row again `rows − 1` times (the j-th row at j·d2). `count` and
 * `rows` are whole numbers from 1; a vector that goes nowhere counts for one. A count of 1 in one row, nothing picked: the same
 * project. What the copies skip is said once.
 */
export function arrayPicked(p: Project, optionId: Id, picked: Picked, d: Point, count: number, rows = 1, d2?: Point): Result {
  if (isNothing(picked) || !whole(count) || !whole(rows)) return { project: p, skipped: [] }
  const n = goes(d) ? count : 1
  const m = d2 && goes(d2) ? rows : 1
  if (n === 1 && m === 1) return { project: p, skipped: [] }
  const skipped: string[] = []
  let q = p
  for (let j = 0; j < m; j++) {
    for (let k = 0; k < n; k++) {
      if (j === 0 && k === 0) continue
      const by = { x: k * d.x + j * (d2?.x ?? 0), y: k * d.y + j * (d2?.y ?? 0) }
      const r = copyPicked(q, optionId, picked, by)
      q = r.project
      skipped.push(...r.skipped)
    }
  }
  return { project: q, skipped: once(skipped) }
}

/**
 * Lines things up on the line through a and b (Decision "Mirror, Array, Align"): each unit moves square to it until, `edges`, its
 * side nearest the line (of its extent across the line, on the side its centre is) lies on it, or `centres`, the centre of its extent
 * does. A unit is a group of any kind (the picked ones of it), a mass alone (measured by its real outline, arcs and rounded corners to
 * a tenth of a millimetre), a free lot, a reference line or a note (its point); a group of any kind is one unit (the picked members of it, one extent, one
 * move: its streets' nodes, gates and dimensions go with it). Streets, gates and dimensions in no group, drawings and an anchored lot alone are skipped, said. A thing already there, nothing picked, no line: the same project.
 */
export function alignPicked(p: Project, optionId: Id, picked: Picked, a: Point, b: Point, how: 'edges' | 'centres'): Result {
  if (isNothing(picked) || !isLine(a, b)) return { project: p, skipped: [] }
  const skipped: string[] = []
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  const across = (q: Point) => (q.x - a.x) * normal.x + (q.y - a.y) * normal.y
  /** How far a unit moves, along the normal, to be on the line: null when it is already. */
  const shiftOf = (points: Point[]): Point | null => {
    const s = points.map(across)
    const lo = Math.min(...s)
    const hi = Math.max(...s)
    const centre = (lo + hi) / 2
    const by = how === 'centres' ? centre : Math.abs(centre) < 1e-9 ? 0 : centre > 0 ? lo : hi
    return Math.abs(by) < 1e-9 ? null : { x: -by * normal.x, y: -by * normal.y }
  }
  const massSet = new Set(picked.masses)
  let q = p

  // the units: a group is one unit, the picked members of it, whatever their kinds (one extent, one move); a thing in none is a unit of its own
  interface Unit {
    masses: Id[]
    existing: Id[]
    lots: Id[]
    lines: Id[]
    notes: Id[]
    points: Point[]
  }
  const units = new Map<string, Unit>()
  const unit = (key: string): Unit => {
    let u = units.get(key)
    if (!u) units.set(key, (u = { masses: [], existing: [], lots: [], lines: [], notes: [], points: [] }))
    return u
  }
  for (const m of unique(picked.masses).flatMap((id) => p.masses.filter((x) => x.id === id))) {
    const u = unit(m.group ?? `·mass:${m.id}`)
    u.masses.push(m.id)
    u.points.push(...outlineOf(m))
  }

  // existing streets (Phase PE.2): a unit by their drawn lines, as a reference line is; a locked one stays, said
  const roads = pickedRoads(p, picked)
  if (roads.held.length) skipped.push(roadsStayed(roads.held.length))
  for (const r of (p.site.existingRoads ?? []).filter((x) => roads.free.includes(x.id))) {
    const u = unit(r.group ?? `·road:${r.id}`)
    u.existing.push(r.id)
    u.points.push(...r.points)
  }

  // lots: a free one by its rect; an anchored one goes with its mass
  for (const l of pickedLots(p, optionId, picked)) {
    if (l.anchor) {
      if (!massSet.has(l.anchor.massId)) skipped.push(follows(l, 'align'))
    } else if (l.rect) {
      const { center, width, depth, rotation } = l.rect
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => rotate({ x: center.x + (x * width) / 2, y: center.y + (y * depth) / 2 }, center, rotation))
      const u = unit(l.group ?? `·lot:${l.id}`)
      u.lots.push(l.id)
      u.points.push(...corners)
    }
  }

  // reference lines and notes
  for (const line of (p.referenceLines ?? []).filter((x) => picked.lines.includes(x.id))) {
    const u = unit(line.group ?? `·line:${line.id}`)
    u.lines.push(line.id)
    u.points.push(...line.points)
  }
  for (const n of (p.notes ?? []).filter((x) => picked.notes.includes(x.id))) {
    const u = unit(n.group ?? `·note:${n.id}`)
    u.notes.push(n.id)
    u.points.push(n.at)
  }

  // what is in a group beside them (a street's nodes, a gate, a dimension) goes with the group's one move; the rest is skipped, said
  const nodesIn = (key: string) => picked.nodes.filter((id) => groupOfNode(p, optionId, id) === key)
  const gatesIn = (key: string) => gatesOf(p, optionId).filter((g) => picked.gates.includes(g.id) && g.group === key).map((g) => g.id)
  const dimensionsIn = (key: string) => (p.dimensions ?? []).filter((d) => picked.dimensions.includes(d.id) && d.group === key).map((d) => d.id)
  const taken = { nodes: new Set<Id>(), gates: new Set<Id>(), dimensions: new Set<Id>() }
  // every unit's shift is read from the project as it stands, then each mass moves once: a picked one by its own unit's shift, a follower that is
  // not picked by its leader's (it would be moved twice, by its leader's unit and by its own, if each unit pulled its followers along)
  const shifts: { u: Unit; by: Point }[] = []
  for (const [key, u] of units) {
    // (what a group holds beside is taken even when the group is already on the line: it is aligned, not skipped)
    const own = key.startsWith('·')
    const nodes = own ? [] : nodesIn(key)
    const gates = own ? [] : gatesIn(key)
    const dimensions = own ? [] : dimensionsIn(key)
    nodes.forEach((id) => taken.nodes.add(id))
    gates.forEach((id) => taken.gates.add(id))
    dimensions.forEach((id) => taken.dimensions.add(id))
    const by = shiftOf(u.points)
    if (!by) continue
    shifts.push({ u, by })
    q = movePicked(q, optionId, { masses: u.masses, nodes, existing: u.existing, lots: u.lots, gates, dimensions, lines: u.lines, notes: u.notes, drawings: [] }, by, false).project
  }
  const moved = new Set(massSet)
  for (const { u, by } of shifts) {
    const followers = withFollowers(p, u.masses).filter((id) => !moved.has(id))
    followers.forEach((id) => moved.add(id))
    q = moveMasses(q, followers, by, false)
  }

  if (picked.nodes.some((id) => !taken.nodes.has(id))) skipped.push('Streets are not aligned: move their nodes')
  if (picked.gates.some((id) => !taken.gates.has(id))) skipped.push('Gates are not aligned: they stay on their side')
  if (picked.dimensions.some((id) => !taken.dimensions.has(id))) skipped.push('Dimensions are not aligned')
  if (picked.drawings.length) skipped.push('Drawings are not aligned')
  return { project: q, skipped }
}
