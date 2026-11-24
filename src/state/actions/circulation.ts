// The exterior circulation's verbs (Decision "Exterior circulation"). Pure, Project → Project, like every action.
//   site      existing roads, the site's gates
//   option    its own gates (a copy of the site's; *Use the site's* drops it); its streets: actions/streets.ts; its
//             parking: modules/parking/actions.ts
//   programs  the dock default; a mass its own dock walls
//   project   the circulation's standards
// Gates are edited where the option takes them from: its own copy when it has one, else the site's.
import type { DesignOption, Docks, ExistingRoad, Gate, GateOn, Id, Point, Project, Standards, StreetSegment, StreetSide, Streets } from '../../model/schema.ts'
import { gateSideOf, gatesOf, ownsGates, type GateHosts } from '../../engine/circulation/gates.ts'
import { gateRange, nearestSide, onOf, pointOn, roadSides, segmentSides, sideOfGate } from '../../engine/circulation/gateGeometry.ts'
import { setLocked } from '../../model/locks.ts'
import { newGateDefaults, standardsOf, type SearchedStandard } from '../../engine/circulation/standards.ts'
import { sideReach, streetChains } from '../../engine/circulation/streets.ts'
import { rotate } from '../../engine/geom/footprint.ts'
import { reflectPoint } from '../../engine/geom/reflect.ts'
import { MIN_WIDTH } from '../../engine/path/pathOp.ts'
import { newId } from './masses.ts'

/** A t into 0..1: one outside wraps around the perimeter. */
const clampT = (t: number) => {
  if (!Number.isFinite(t)) return 0
  return t >= 0 && t <= 1 ? t : ((t % 1) + 1) % 1
}

function withOption(p: Project, optionId: Id, f: (o: DesignOption) => DesignOption): Project {
  if (!p.options.some((o) => o.id === optionId)) return p
  return { ...p, options: p.options.map((o) => (o.id === optionId ? f(o) : o)) }
}

/** A list field set, or removed when it is empty (absent = none, as everywhere in the Project). */
function setList<T extends object, K extends keyof T>(x: T, key: K, list: unknown[]): T {
  const next = { ...x }
  if (list.length) (next as Record<K, unknown>)[key] = list
  else delete next[key]
  return next
}

// ---- Gates -----------------------------------------------------------------------------------------------------

/** The option's gates replaced: its own copy when it has one, else the site's. */
function setGates(p: Project, optionId: Id, gates: Gate[]): Project {
  if (ownsGates(p, optionId)) return withOption(p, optionId, (o) => ({ ...o, gates }))
  return { ...p, site: setList(p.site, 'gates', gates) }
}

/** A gate id unique across the site's and every option's copy, so a gate keeps its id when an option copies them. */
function newGateId(p: Project): Id {
  return newId('g', [...(p.site.gates ?? []), ...p.options.flatMap((o) => o.gates ?? [])].map((g) => g.id))
}

/** Places a gate at `t` on the boundary, with the standards' width and radius. Returns its id. */
export function addGate(p: Project, optionId: Id, t: number, init: Partial<Omit<Gate, 'id' | 't' | 'on'>> = {}): { project: Project; id: Id } {
  const list = gatesOf(p, optionId)
  const id = newGateId(p)
  const gate: Gate = { id, t: clampT(t), ...newGateDefaults(p), ...init }
  return { project: setGates(p, optionId, [...list, gate]), id }
}

/**
 * Places a gate on a side of a street or of an existing street (Phase PE.2, plan Decision 19): on an option's street, into that option's own gates
 * (a copy of the site's first); on an existing street, into the gates the option uses. Returns its id.
 */
export function addGateOn(p: Project, optionId: Id, on: GateOn, init: Partial<Omit<Gate, 'id' | 't' | 'on'>> = {}): { project: Project; id: Id } {
  const base = on.kind === 'street' ? ownGates(p, optionId) : p
  const id = newGateId(p)
  const gate: Gate = { id, on, ...newGateDefaults(p), ...init }
  return { project: setGates(base, optionId, [...gatesOf(base, optionId), { ...gate, on: insideHost(base, optionId, on, gate.width) }]), id }
}

/** A gate's place on its host kept inside it (review E5): its middle from half its width in to half its width before the end of the side; a host that is not there leaves it as given. */
function insideHost(p: Project, optionId: Id, on: GateOn, width: number): GateOn {
  const r = gateSideOf({ on }, null, { streets: p.options.find((o) => o.id === optionId)?.streets, existingRoads: p.site.existingRoads })
  if (!r) return on
  const [lo, hi] = gateRange(r.side, width)
  const along = Math.min(hi, Math.max(lo, r.along))
  return Math.abs(r.side.from + along - on.at) < 1e-9 ? on : onOf(r.side, along)
}

/**
 * A gate's fields changed. A gate stands in one place, `t` on the boundary or `on` a street's side (Phase PE.2): a patch with one drops the other. A gate set on
 * an option's street goes into the option's own gates first (a street's ids are the option's: `addGateOn`).
 */
export function updateGate(p: Project, optionId: Id, id: Id, patch: Partial<Omit<Gate, 'id'>>): Project {
  if (!gatesOf(p, optionId).some((g) => g.id === id)) return p
  const base = patch.on?.kind === 'street' ? ownGates(p, optionId) : p
  const list = gatesOf(base, optionId)
  const now = list.find((g) => g.id === id)!
  // a gate's place kept inside its host for the width it will have: a new place, or a width change alone on a gate with `on` (review R6)
  const fix =
    patch.t !== undefined
      ? { ...patch, t: clampT(patch.t) }
      : patch.on !== undefined
        ? { ...patch, on: insideHost(base, optionId, patch.on, patch.width ?? now.width) }
        : patch.width !== undefined && now.on && now.t === undefined
          ? { ...patch, on: insideHost(base, optionId, now.on, patch.width) }
          : patch
  return setGates(
    base,
    optionId,
    list.map((g) => {
      if (g.id !== id) return g
      const { t, on, ...rest } = g
      const place = fix.on !== undefined ? { on: fix.on } : fix.t !== undefined ? { t: fix.t } : { ...(t !== undefined ? { t } : {}), ...(on ? { on } : {}) }
      const { t: _t, on: _on, ...fields } = fix
      return { ...rest, ...fields, ...place } as Gate
    }),
  )
}

export function removeGate(p: Project, optionId: Id, id: Id): Project {
  const list = gatesOf(p, optionId)
  if (!list.some((g) => g.id === id)) return p
  return setGates(p, optionId, list.filter((g) => g.id !== id))
}

/** *Own gates for <option>*: the option gets a copy of the site's gates and edits it from now on. */
export function ownGates(p: Project, optionId: Id): Project {
  if (ownsGates(p, optionId)) return p
  return withOption(p, optionId, (o) => ({ ...o, gates: structuredClone(p.site.gates ?? []) }))
}

/** *Use the site's*: the option drops its own gates and takes the site's again. */
export function dropOwnGates(p: Project, optionId: Id): Project {
  if (!ownsGates(p, optionId)) return p
  return withOption(p, optionId, (o) => {
    const next = { ...o }
    delete next.gates
    return next
  })
}

/**
 * The gates on streets kept on them through an edit (the settle step, Phase PE.2, plan Decision 18; `followRoads` for gates). For each gate with `on`
 * in a list whose streets or existing streets were edited: (1) its host gone, the gate goes; (2) its segment (or existing street) still between the
 * same nodes (the same number of points) and its sides unchanged, the gate is left as it is; with its sides changed its place along it is kept, clamped
 * half its width from the ends; (3) the host split, merged or its points added or removed: it goes to the nearest point of the same side within the host's
 * widest side + 1 m of where it stood, on the street's own segments only, else it goes. The project as it was when nothing changed.
 */
export function followGates(before: Project, after: Project): Project {
  if (before === after || (before.options === after.options && before.site === after.site)) return after
  const roads = before.site.existingRoads !== after.site.existingRoads
  let q = after
  if (roads && after.site.gates?.some((g) => g.on)) {
    const next = followList(after.site.gates, { existingRoads: before.site.existingRoads }, { existingRoads: after.site.existingRoads })
    if (next !== after.site.gates) q = { ...q, site: setList(q.site, 'gates', next) }
  }
  for (const o of after.options) {
    if (!o.gates?.some((g) => g.on)) continue
    const b = before.options.find((x) => x.id === o.id)
    if (!b || (b.streets === o.streets && !roads)) continue
    const next = followList(o.gates, { streets: b.streets, existingRoads: before.site.existingRoads }, { streets: o.streets, existingRoads: after.site.existingRoads })
    if (next !== o.gates) q = withOption(q, o.id, (x) => ({ ...x, gates: next }))
  }
  return q
}

/** A list of gates followed: the same array when none changed. */
function followList(gates: Gate[], was: GateHosts, now: GateHosts): Gate[] {
  let changed = false
  const next = gates.flatMap((g): Gate[] => {
    if (!g.on) return [g]
    const f = followed(g, was, now)
    if (f !== g) changed = true
    return f ? [f] : []
  })
  return changed ? next : gates
}

/** One gate with `on`, followed (null: it goes). */
function followed(g: Gate, was: GateHosts, now: GateHosts): Gate | null {
  const on = g.on!
  const street = on.kind === 'street'
  // the site's gates are followed through the existing streets alone (no streets given: a street gate there is left as it is)
  if (street && !was.streets && !now.streets) return g
  const hostWas = street ? was.streets?.segments.find((x) => x.id === on.id) : was.existingRoads?.find((x) => x.id === on.id)
  const hostNow = street ? now.streets?.segments.find((x) => x.id === on.id) : now.existingRoads?.find((x) => x.id === on.id)
  if (!hostWas) return hostNow ? g : null
  if (!hostNow && !street) return null
  // (2) the same segment between the same nodes, the same existing street with its points: the place along it stays
  const same = street
    ? hostNow && (hostNow as { a: Id; b: Id }).a === (hostWas as { a: Id; b: Id }).a && (hostNow as { a: Id; b: Id }).b === (hostWas as { a: Id; b: Id }).b
    : (hostNow as ExistingRoad).points.length === (hostWas as ExistingRoad).points.length
  const sidesIn = (h: GateHosts) => (street ? (h.streets?.segments.find((x) => x.id === on.id) ? segmentSides(h.streets, h.streets.segments.find((x) => x.id === on.id)!) : []) : roadSides(h.existingRoads!.find((x) => x.id === on.id)!))
  if (same) {
    // its host as it was: an edit of another street (or another end of this one) leaves the gate as it is, even a locked one past its street's end
    if (JSON.stringify(sidesIn(was)) === JSON.stringify(sidesIn(now))) return g
    const r = sideOfGate(g, sidesIn(now))
    if (!r) return null
    const [lo, hi] = gateRange(r.side, g.width)
    const at = onOf(r.side, Math.min(hi, Math.max(lo, r.along))).at
    return at === on.at ? g : { ...g, on: { ...on, at } }
  }
  // (3) the host changed shape: the nearest point of the same side, kept half its width in
  if (street) return followedOnStreet(g, on, was.streets!, now.streets, hostWas as StreetSegment, hostNow as StreetSegment | undefined)
  const was0 = sideOfGate(g, sidesIn(was))
  if (!was0) return null
  const stood = pointOn(was0.side, was0.along)
  const reach = Math.max(...(hostWas as ExistingRoad).stretches.map((s) => Math.max(s.left, s.right))) + 1
  const facing = roadSides(hostNow as ExistingRoad).filter((s) => s.out.x * was0.side.out.x + s.out.y * was0.side.out.y > 0.5)
  const near = nearestSide(stood, facing, (s) => gateRange(s, g.width))
  if (!near || near.distance > reach) return null
  const home = onOf(near.side, near.along)
  return home.id === on.id && home.side === on.side && home.at === on.at ? g : { ...g, on: home }
}

/**
 * A gate on a street segment whose host changed shape (split, merged, an end joined, its nodes moved and the network knit): the nearest point of the same
 * side, within the host's widest side + 1 m of where the gate stood, on the street's own segments (Phase PE.2, plan Decision 18; review E1, E4). Where it
 * stood is told by the host's side with its nodes where they are now (a street moved whole takes its gate with it); an end joined to another street is
 * taken at the end of the host it became. The street's own segments: those of its chain that are still there, and the ones the edit made (a new id
 * meeting them). A host that is gone, not merged into a neighbour, takes its gate with it.
 */
function followedOnStreet(g: Gate, on: GateOn, was: Streets, now: Streets | undefined, hostWas: StreetSegment, hostNow: StreetSegment | undefined): Gate | null {
  if (!now) return null
  const at = (id: Id) => now.nodes.find((n) => n.id === id)
  const chain = streetChains(was).find((c) => c.segs.includes(hostWas.id))
  const members = new Set(chain?.segs ?? [hostWas.id])
  // a host that is no segment now was merged into a neighbour (a node of it, between two segments, went) or is gone
  let mergedInto: StreetSegment | undefined
  if (!hostNow) {
    const degree = (id: Id) => was.segments.filter((x) => x.a === id || x.b === id).length
    const vanished = [hostWas.a, hostWas.b].filter((id) => !at(id) && degree(id) === 2)
    const far = [hostWas.a, hostWas.b].find((id) => at(id))
    // the merge runs between the host's far node and the far end of the segment that met it at the vanished node: at any angle, however the bend lies
    const across = (id: Id): Id | undefined => {
      const other = was.segments.find((x) => x.id !== hostWas.id && (x.a === id || x.b === id))
      return other && (other.a === id ? other.b : other.a)
    }
    mergedInto = now.segments.find((x) => {
      if (!members.has(x.id) || x.id === hostWas.id || !far) return false
      return vanished.some((id) => {
        const end = across(id)
        return end !== undefined && ((x.a === far && x.b === end) || (x.b === far && x.a === end))
      })
    })
    if (!mergedInto) return null
  }
  const ends = hostNow ?? mergedInto!
  // the host's side with its nodes where they are now (an end that joined another street: at the end of the host it became)
  const placed = (id: Id, end: 'a' | 'b') => at(id) ?? (hostNow ? at(hostNow[end]) : undefined) ?? was.nodes.find((n) => n.id === id)!
  const there: Streets = { nodes: was.nodes.map((n) => (n.id === hostWas.a ? { ...n, ...placed(n.id, 'a'), id: n.id } : n.id === hostWas.b ? { ...n, ...placed(n.id, 'b'), id: n.id } : n)), segments: was.segments }
  const was0 = sideOfGate(g, segmentSides(there, hostWas))
  if (!was0) return null
  const stood = pointOn(was0.side, was0.along)
  const reach = Math.max(hostWas.left, hostWas.right) + 1
  // the street's own segments now: its chain's that are still there, then each new one that meets them (a split's other half, a crossing's pieces)
  const wasIds = new Set(was.segments.map((x) => x.id))
  const touching = new Set<Id>([...(chain?.nodes ?? [hostWas.a, hostWas.b]), ends.a, ends.b])
  const own = new Set(now.segments.filter((x) => members.has(x.id)).map((x) => x.id))
  for (let grown = true; grown; ) {
    grown = false
    for (const x of now.segments) {
      if (own.has(x.id) || wasIds.has(x.id) || !(touching.has(x.a) || touching.has(x.b))) continue
      own.add(x.id)
      touching.add(x.a).add(x.b)
      grown = true
    }
  }
  const candidates = now.segments.filter((x) => own.has(x.id)).flatMap((x) => segmentSides(now, x))
  const facing = candidates.filter((s) => s.out.x * was0.side.out.x + s.out.y * was0.side.out.y > 0.5)
  const near = nearestSide(stood, facing, (s) => gateRange(s, g.width))
  if (!near || near.distance > reach) return null
  const home = onOf(near.side, near.along)
  return home.id === on.id && home.side === on.side && home.at === on.at ? g : { ...g, on: home }
}

// ---- Existing roads --------------------------------------------------------------------------------------------

/**
 * An existing road inside the parcel: its drawn line, its width (absent: the standards' road width) and the side that
 * line is (`left` or `right` edge: no paving on that hand; absent or `centre`: half each side), the same on every
 * stretch (project 19). Returns its id.
 */
export function addExistingRoad(p: Project, points: Point[], width?: number, side?: StreetSide): { project: Project; id: Id } | null {
  if (points.length < 2) return null
  const list = p.site.existingRoads ?? []
  const id = newId('e', list.map((r) => r.id))
  const sides = sideReach(side ?? 'centre', Math.max(MIN_WIDTH, width ?? standardsOf(p).roadWidth))
  const road: ExistingRoad = { id, points, stretches: points.slice(1).map(() => ({ ...sides })) }
  return { project: { ...p, site: { ...p.site, existingRoads: [...list, road] } }, id }
}

/**
 * An existing road's fields changed. It always has one pair of sides per stretch of its line: new `points` without
 * `stretches` keep the sides they had, the last pair carrying on to a longer line; `stretches` of another count are
 * padded with their last pair or trimmed.
 */
export function updateExistingRoad(p: Project, id: Id, patch: Partial<Omit<ExistingRoad, 'id'>>): Project {
  const list = p.site.existingRoads ?? []
  if (!list.some((r) => r.id === id) || (patch.points && patch.points.length < 2)) return p
  return {
    ...p,
    site: {
      ...p.site,
      existingRoads: list.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        const given = patch.stretches?.length ? patch.stretches : r.stretches
        const count = next.points.length - 1
        if (next.stretches.length !== count) next.stretches = Array.from({ length: count }, (_, k) => given[k] ?? given[given.length - 1])
        return next
      }),
    },
  }
}

export function removeExistingRoad(p: Project, id: Id): Project {
  const list = p.site.existingRoads ?? []
  if (!list.some((r) => r.id === id)) return p
  return { ...p, site: setList(p.site, 'existingRoads', list.filter((r) => r.id !== id)) }
}

// ---- Existing roads, transformed (Phase PE.2, task 11; plan Decision 22) --------------------------------------------

const movesAnywhere = (d: Point) => Number.isFinite(d.x) && Number.isFinite(d.y) && (d.x !== 0 || d.y !== 0)

/** The site's existing roads with `f` applied to those `ids` name; the same project when none is there. */
function withRoads(p: Project, ids: Id[], f: (r: ExistingRoad) => ExistingRoad): Project {
  const these = new Set(ids)
  const list = p.site.existingRoads ?? []
  if (!list.some((r) => these.has(r.id))) return p
  return { ...p, site: { ...p.site, existingRoads: list.map((r) => (these.has(r.id) ? f(r) : r)) } }
}

/**
 * Existing roads moved by `d`: their points go, their stretches stay. The street ends linked to them and the gates standing on them follow in `settle`
 * (`followRoads`, `followGates`: the point count is the same, so each keeps its place along the road). A road that is not there is left.
 */
export function moveExistingRoads(p: Project, ids: Id[], d: Point): Project {
  if (!movesAnywhere(d)) return p
  return withRoads(p, ids, (r) => ({ ...r, points: r.points.map((q) => ({ x: q.x + d.x, y: q.y + d.y })) }))
}

/** Existing roads turned `degrees` (counter-clockwise) about `pivot`: their points go round, their stretches stay. */
export function turnExistingRoads(p: Project, ids: Id[], pivot: Point, degrees: number): Project {
  if (!Number.isFinite(degrees) || degrees === 0 || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return p
  return withRoads(p, ids, (r) => ({ ...r, points: r.points.map((q) => rotate(q, pivot, degrees)) }))
}

/** The gates (the site's and every option's own copy) with `f` applied to each; the same project when none changes. */
function withGates(p: Project, f: (g: Gate) => Gate): Project {
  const each = (gates: Gate[] | undefined): Gate[] | undefined => {
    if (!gates) return gates
    const next = gates.map(f)
    return next.some((g, i) => g !== gates[i]) ? next : gates
  }
  const site = each(p.site.gates)
  const options = p.options.map((o) => {
    const own = each(o.gates)
    return own === o.gates ? o : { ...o, gates: own }
  })
  if (site === p.site.gates && options.every((o, i) => o === p.options[i])) return p
  return { ...p, site: site === p.site.gates ? p.site : { ...p.site, gates: site }, options }
}

/** The other side of a street: left ↔ right. */
const handedSide =(side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left')

/**
 * Existing roads reflected about the line through `a` and `b`: their points go to their mirror images, so what was on a road's left is on its right
 * (each stretch's `left` and `right` swap, its lanes run the other way) and the gates standing on it change side with it (`Gate.on.side`; their place
 * along it stays). A line that is no line, a road that is not there: the same project.
 */
export function mirrorExistingRoads(p: Project, ids: Id[], a: Point, b: Point): Project {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || (a.x === b.x && a.y === b.y)) return p
  const these = new Set((p.site.existingRoads ?? []).filter((r) => ids.includes(r.id)).map((r) => r.id))
  if (these.size === 0) return p
  const q = withRoads(p, ids, (r) => ({
    ...r,
    points: r.points.map((x) => reflectPoint(x, a, b)),
    stretches: r.stretches.map((s) => ({ ...s, left: s.right, right: s.left, ...(s.lanes ? { lanes: [...s.lanes].reverse() } : {}) })),
  }))
  return withGates(q, (g) => (g.on?.kind === 'existing-road' && these.has(g.on.id) ? { ...g, on: { ...g.on, side: handedSide(g.on.side) } } : g))
}

/**
 * Existing roads copied, each moved by `d` (nothing: in place): a fresh id, its name kept, no padlock and no group (a copy is born free and in no group but its
 * copies' own: `selection.ts` `regrouped`). The street ends linked to the original and the gates on it stay there. Returns the ids of the copies,
 * in the order of `ids` (a road that is not there has none).
 */
export function copyExistingRoads(p: Project, ids: Id[], d: Point): { project: Project; ids: Id[] } {
  // a step of nothing copies in place (Mirror keeping the originals makes its copies there, then reflects them); no step at all, nothing
  if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return { project: p, ids: [] }
  const list = p.site.existingRoads ?? []
  const taken = list.map((r) => r.id)
  const made: ExistingRoad[] = []
  for (const id of new Set(ids)) {
    const r = list.find((x) => x.id === id)
    if (!r) continue
    const copyId = newId('e', taken)
    taken.push(copyId)
    const { id: _id, locked: _locked, group: _group, ...rest } = r
    made.push({ ...structuredClone(rest), id: copyId, points: r.points.map((q) => ({ x: q.x + d.x, y: q.y + d.y })) })
  }
  if (made.length === 0) return { project: p, ids: [] }
  return { project: { ...p, site: { ...p.site, existingRoads: [...list, ...made] } }, ids: made.map((r) => r.id) }
}

/** Locks or frees existing roads (the padlock is CAD's, Decision "Padlocks by kind"): a locked one keeps every field and cannot be deleted (state/settle.ts). The same project when nothing changes. */
export function lockExistingRoads(p: Project, ids: Id[], on: boolean): Project {
  const these = new Set(ids)
  const list = p.site.existingRoads ?? []
  if (!list.some((r) => these.has(r.id) && (r.locked === true) !== on)) return p
  return { ...p, site: { ...p.site, existingRoads: list.map((r) => (these.has(r.id) ? setLocked(r, on) : r)) } }
}

// ---- Docks -----------------------------------------------------------------------------------------------------

/** A program's dock default; null: none. */
export function setProgramDocks(p: Project, programId: Id, docks: Docks | null): Project {
  const g = p.programs.find((x) => x.id === programId)
  if (!g) return p
  const next = { ...g }
  if (docks) next.docks = docks
  else delete next.docks
  return { ...p, programs: p.programs.map((x) => (x.id === programId ? next : x)) }
}

/**
 * A mass's own dock walls (each a docked wall's middle, as t on its outline); [] = no docks; null = back to its
 * program's. A locked mass does not: its docks are held with the rest of it (settle.ts refuses the edit).
 */
export function setMassDocks(p: Project, massId: Id, walls: number[] | null): Project {
  const m = p.masses.find((x) => x.id === massId)
  if (!m) return p
  const next = { ...m }
  if (walls) next.docks = [...new Set(walls.map(clampT))].sort((a, b) => a - b)
  else delete next.docks
  return { ...p, masses: p.masses.map((x) => (x.id === massId ? next : x)) }
}

// ---- Standards -------------------------------------------------------------------------------------------------

/** Changes some of the project's circulation standards. */
/** The road widths the standards let the optimizer search (Phase K.4), from and to in m; null clears that one. */
export function setStandardSearch(p: Project, key: SearchedStandard, range: [number, number] | null): Project {
  const ok = range !== null && range[0] > 0 && range[1] >= range[0]
  const search = { ...p.standards?.search }
  if (ok) search[key] = range
  else delete search[key]
  if (JSON.stringify(p.standards?.search?.[key] ?? null) === JSON.stringify(ok ? range : null)) return p
  const { search: _was, ...rest } = p.standards ?? {}
  return { ...p, standards: Object.keys(search).length ? { ...rest, search } : rest }
}

/** An option's own road widths (Phase K.4: what the optimizer tried), over the standards'; null clears one. */
export function setOptionStandards(p: Project, optionId: Id, patch: Partial<Record<SearchedStandard, number | null>>): Project {
  const o = p.options.find((x) => x.id === optionId)
  if (!o) return p
  const next = { ...o.standards }
  for (const k of Object.keys(patch) as SearchedStandard[]) {
    const v = patch[k]
    if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) next[k] = v
    else delete next[k]
  }
  if (JSON.stringify(o.standards ?? {}) === JSON.stringify(next)) return p
  return withOption(p, optionId, ({ standards: _was, ...x }) => (Object.keys(next).length ? { ...x, standards: next } : x))
}

export function updateStandards(p: Project, patch: Partial<Standards>): Project {
  const next = { ...p.standards, ...patch }
  if ((Object.keys(next) as (keyof Standards)[]).every((k) => next[k] === p.standards?.[k])) return p
  return { ...p, standards: next }
}

/**
 * Locks or frees gates (Decision "Padlocks by kind"): the option's (its own copy when it has one, else the site's); with no option, the
 * site's and every option's own copy that has the id. A locked gate keeps every field, and an option's own copy keeps the flag when
 * it is made (`ownGates`); dropping own gates that include a locked one is refused (state/settle.ts). Nothing to change: the same project.
 */
export function lockGates(p: Project, ids: Id[], on: boolean, optionId?: Id): Project {
  const these = new Set(ids)
  const changes = (g: Gate) => these.has(g.id) && (g.locked === true) !== on
  const lock = (gates: Gate[]) => gates.map((g) => (changes(g) ? setLocked(g, on) : g))
  if (optionId !== undefined) {
    if (ownsGates(p, optionId)) return withOption(p, optionId, (o) => (o.gates?.some(changes) ? { ...o, gates: lock(o.gates) } : o))
    return p.site.gates?.some(changes) ? { ...p, site: { ...p.site, gates: lock(p.site.gates) } } : p
  }
  const site = p.site.gates?.some(changes) ? { ...p.site, gates: lock(p.site.gates) } : p.site
  const options = p.options.map((o) => (o.gates?.some(changes) ? { ...o, gates: lock(o.gates) } : o))
  return site === p.site && options.every((o, i) => o === p.options[i]) ? p : { ...p, site, options }
}
