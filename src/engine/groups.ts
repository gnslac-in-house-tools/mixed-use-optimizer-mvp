// Groups of masses (Decision "Groups"; the user: "selecting two should enable Group, and they appear grouped, or
// Ungroup"): a mass's `group` names the group it is in, as Rhino's groups. Masses of one group are picked, moved and
// turned as one; Alt+click on the plan and the Buildings tree still reach one of them. A group of one is none. Pure.
import type { DesignOption, Id, Project } from '../model/schema.ts'
import { gatesOf } from './circulation/gates.ts'
import { standardsOf } from './circulation/standards.ts'
import { streetRoads, streetTypesOf } from './circulation/streets.ts'

/** The masses of the group this mass is in, in the project's order; itself alone when it is in none. */
export function groupMembers(p: Pick<Project, 'masses'>, id: Id): Id[] {
  const group = p.masses.find((m) => m.id === id)?.group
  if (group === undefined) return [id]
  const all = p.masses.filter((m) => m.group === group).map((m) => m.id)
  return all.length > 1 ? all : [id]
}

/** These masses and every mass grouped with one of them, without repeats (theirs first, in their order). */
export function withGroups(p: Pick<Project, 'masses'>, ids: Id[]): Id[] {
  return [...new Set(ids.flatMap((id) => [id, ...groupMembers(p, id)]))]
}

/** Is this mass in a group (of two or more)? */
export const isGrouped = (p: Pick<Project, 'masses'>, id: Id): boolean => groupMembers(p, id).length > 1

/** Are these masses one whole group, no more and no less? */
export function oneGroup(p: Pick<Project, 'masses'>, ids: Id[]): boolean {
  if (ids.length < 2) return false
  const members = groupMembers(p, ids[0])
  return members.length === ids.length && ids.every((id) => members.includes(id))
}

// ---- Groups of any kind (Phase AS.5 task 6, Decision "Groups of any kind") ----------------------------------------------------
// A group may hold a mass, a street, an existing street (the site's, Phase PE.2), a lot, a gate, a dimension, a reference line and a note: each keeps the group's id in its own optional
// `group` field (a street's on each of its segments), and one id names the group across kinds. There is no list of groups: a group is what shares
// the id **in the option in view** (masses, dimensions, reference lines and notes are the project's; streets, lots and gates are the option's: the
// gates the option's own copy, else the site's). A group of one is none. The masses' own reader above stays as it is (the optimizer reads it).
//
// A street (the derived road) is in the group of its first segment that has one: a street split in two keeps both parts in the group (each part's
// segments carry it), a street joined to another is in the group of its first tagged segment, and a segment drawn on to a grouped street leaves
// it in its group. A street counts once, whatever its segments.

/** What a thing is, as a `Ref` says it (`kind` and `id`; a street's id is the derived road's). */
export interface Member {
  kind: string
  id: Id
}

/** The kinds that can be in a group: the ones the transform tools move. */
export const GROUP_KINDS: readonly string[] = ['mass', 'street', 'existing-road', 'lot', 'gate', 'dimension', 'reference-line', 'note']

/** Whether things of this kind can be in a group. */
export const isGroupable = (kind: string): boolean => GROUP_KINDS.includes(kind)

const sameMember = (a: Member, b: Member): boolean => a.kind === b.kind && a.id === b.id

const optionIn = (p: Project, option: Id): DesignOption | undefined => p.options.find((o) => o.id === option)

/** A street of the option as the groups read it: its id (`street:<its earliest segment>`), every segment it runs along and every node it passes. */
interface StreetOf {
  id: Id
  segments: Id[]
  nodes: Id[]
}

/**
 * The streets of the option (`street:<its earliest segment>`), each with the segments it runs through. A street whose width changes derives as
 * several runs (`DerivedRoad.street` names the street, `DerivedRoad.id` the run): they are one street here, its segments and nodes the runs' together.
 */
function roadsOf(p: Project, option: Id): StreetOf[] {
  const o = optionIn(p, option)
  if (!o) return []
  const out = new Map<Id, StreetOf>()
  for (const r of streetRoads(o.streets, streetTypesOf(p, o), standardsOf(p, o).laneWidth)) {
    if (r.kind !== 'street') continue
    const id = r.street ?? r.id
    const street = out.get(id) ?? { id, segments: [], nodes: [] }
    out.set(id, street)
    for (const g of r.segments ?? []) if (!street.segments.includes(g)) street.segments.push(g)
    for (const n of r.nodes ?? []) if (!street.nodes.includes(n)) street.nodes.push(n)
  }
  return [...out.values()]
}

/** The segments of the street with this road id in the option; none when there is no such street. */
export function roadSegmentIds(p: Project, option: Id, roadId: Id): Id[] {
  return roadsOf(p, option).find((r) => r.id === roadId)?.segments ?? []
}

/** The road id of the street that runs along this segment, in the option. */
export function roadIdOfSegment(p: Project, option: Id, segment: Id): Id | undefined {
  return roadsOf(p, option).find((r) => r.segments.includes(segment))?.id
}

/** The group of the first street that has this node and is in a group (a group of a single thing is none, as everywhere). */
export function groupOfNode(p: Project, option: Id, node: Id): Id | undefined {
  const road = roadsOf(p, option).find((r) => r.nodes.includes(node) && groupOfSegments(p, option, r.segments) !== undefined)
  return road ? refGroupMembers(p, option, { kind: 'street', id: road.id }).length > 1 ? groupOfSegments(p, option, road.segments) : undefined : undefined
}

/** The group of the street whose segments these are: that of its first segment that has one. */
function groupOfSegments(p: Project, option: Id, segments: readonly Id[]): Id | undefined {
  const all = optionIn(p, option)?.streets?.segments ?? []
  for (const id of segments) {
    const g = all.find((s) => s.id === id)?.group
    if (g !== undefined) return g
  }
  return undefined
}

/** Whether the thing is there (in the option, for a street, a lot and a gate). */
export function isThere(p: Project, option: Id, ref: Member): boolean {
  switch (ref.kind) {
    case 'mass':
      return p.masses.some((m) => m.id === ref.id)
    case 'street':
      return roadsOf(p, option).some((r) => r.id === ref.id)
    case 'existing-road':
      return p.site.existingRoads?.some((r) => r.id === ref.id) === true
    case 'lot':
      return optionIn(p, option)?.lots?.some((l) => l.id === ref.id) === true
    case 'gate':
      return gatesOf(p, option).some((g) => g.id === ref.id)
    case 'dimension':
      return p.dimensions?.some((d) => d.id === ref.id) === true
    case 'reference-line':
      return p.referenceLines?.some((r) => r.id === ref.id) === true
    case 'note':
      return p.notes?.some((n) => n.id === ref.id) === true
    default:
      return false
  }
}

/** The group the thing is in (in the option), whether or not anything is in it with it; undefined when none. */
export function refGroup(p: Project, option: Id, ref: Member): Id | undefined {
  switch (ref.kind) {
    case 'mass':
      return p.masses.find((m) => m.id === ref.id)?.group
    case 'street':
      return groupOfSegments(p, option, roadSegmentIds(p, option, ref.id))
    case 'existing-road':
      return p.site.existingRoads?.find((r) => r.id === ref.id)?.group
    case 'lot':
      return optionIn(p, option)?.lots?.find((l) => l.id === ref.id)?.group
    case 'gate':
      return gatesOf(p, option).find((g) => g.id === ref.id)?.group
    case 'dimension':
      return p.dimensions?.find((d) => d.id === ref.id)?.group
    case 'reference-line':
      return p.referenceLines?.find((r) => r.id === ref.id)?.group
    case 'note':
      return p.notes?.find((n) => n.id === ref.id)?.group
    default:
      return undefined
  }
}

/** Everything in the group with this id, in the option: masses, streets, lots, gates, dimensions, reference lines, notes, each in the project's order. */
export function membersOfGroup(p: Project, option: Id, group: Id): Member[] {
  const o = optionIn(p, option)
  return [
    ...p.masses.filter((m) => m.group === group).map((m): Member => ({ kind: 'mass', id: m.id })),
    ...roadsOf(p, option)
      .filter((r) => groupOfSegments(p, option, r.segments) === group)
      .map((r): Member => ({ kind: 'street', id: r.id })),
    ...(p.site.existingRoads ?? []).filter((r) => r.group === group).map((r): Member => ({ kind: 'existing-road', id: r.id })),
    ...(o?.lots ?? []).filter((l) => l.group === group).map((l): Member => ({ kind: 'lot', id: l.id })),
    ...gatesOf(p, option).filter((g) => g.group === group).map((g): Member => ({ kind: 'gate', id: g.id })),
    ...(p.dimensions ?? []).filter((d) => d.group === group).map((d): Member => ({ kind: 'dimension', id: d.id })),
    ...(p.referenceLines ?? []).filter((r) => r.group === group).map((r): Member => ({ kind: 'reference-line', id: r.id })),
    ...(p.notes ?? []).filter((n) => n.group === group).map((n): Member => ({ kind: 'note', id: n.id })),
  ]
}

/** The thing and everything grouped with it, in the option, itself among them; itself alone when it is in no group (a group of one is none). */
export function refGroupMembers(p: Project, option: Id, ref: Member): Member[] {
  const group = refGroup(p, option, ref)
  if (group === undefined) return [ref]
  const all = membersOfGroup(p, option, group)
  return all.length > 1 && all.some((m) => sameMember(m, ref)) ? all : [ref]
}

/** These things and everything grouped with any of them, without repeats (theirs first, in their order). */
export function withRefGroups(p: Project, option: Id, refs: readonly Member[]): Member[] {
  const out: Member[] = []
  for (const r of refs.flatMap((x) => [x, ...refGroupMembers(p, option, x)])) if (!out.some((m) => sameMember(m, r))) out.push(r)
  return out
}

/** Are these things one whole group, no more and no less (two or more of them)? */
export function oneRefGroup(p: Project, option: Id, refs: readonly Member[]): boolean {
  if (refs.length < 2) return false
  const members = refGroupMembers(p, option, refs[0])
  return members.length === refs.length && refs.every((r) => members.some((m) => sameMember(m, r)))
}

/** Every group id in use anywhere in the project (every kind, every option, the site's gates): a new group takes the first free one. */
export function groupIdsIn(p: Project): Id[] {
  const ids: Id[] = []
  const add = (g: Id | undefined) => {
    if (g !== undefined) ids.push(g)
  }
  for (const m of p.masses) add(m.group)
  for (const d of p.dimensions ?? []) add(d.group)
  for (const r of p.referenceLines ?? []) add(r.group)
  for (const n of p.notes ?? []) add(n.group)
  for (const g of p.site.gates ?? []) add(g.group)
  for (const r of p.site.existingRoads ?? []) add(r.group)
  for (const o of p.options) {
    for (const l of o.lots ?? []) add(l.group)
    for (const g of o.gates ?? []) add(g.group)
    for (const s of o.streets?.segments ?? []) add(s.group)
  }
  return [...new Set(ids)]
}

/** The `group` of a record put, or taken away with `undefined`; the same record when it already says so. */
function grouped<T extends { group?: Id }>(x: T, group: Id | undefined): T {
  if (x.group === group) return x
  const { group: _, ...rest } = x
  return (group === undefined ? rest : { ...rest, group }) as T
}

/** A list with `f` applied to each record `pick` says yes to; the same list when none changes. */
function mapped<T>(list: T[], pick: (x: T) => boolean, f: (x: T) => T): T[] {
  let changed = false
  const next = list.map((x) => {
    if (!pick(x)) return x
    const y = f(x)
    if (y !== x) changed = true
    return y
  })
  return changed ? next : list
}

/**
 * The group put on these things (or taken away: `undefined`): a mass, a dimension, a reference line and a note by their ids, a street on each of its
 * segments, a lot and a gate in the option (a gate in the option's own copy of the gates, else the site's); `segment` is a street's segment by its own id
 * (what a copy of a street makes). A thing that is not there is left. The same project when nothing changes.
 */
export function withGroupOn(p: Project, option: Id, things: readonly Member[], group: Id | undefined): Project {
  const of = (kind: string) => new Set(things.filter((t) => t.kind === kind).map((t) => t.id))
  const segments = new Set([...of('segment'), ...[...of('street')].flatMap((id) => roadSegmentIds(p, option, id))])
  const masses = of('mass')
  const dimensions = of('dimension')
  const lines = of('reference-line')
  const notes = of('note')
  const lots = of('lot')
  const gates = of('gate')
  const roads = of('existing-road')
  let q = p
  const set = <K extends keyof Project>(key: K, value: Project[K]) => {
    if (value !== q[key]) q = { ...q, [key]: value }
  }
  set('masses', mapped(p.masses, (m) => masses.has(m.id), (m) => grouped(m, group)))
  // an existing street is the site's (Phase PE.2): in every option
  if (p.site.existingRoads) {
    const list = mapped(p.site.existingRoads, (r) => roads.has(r.id), (r) => grouped(r, group))
    if (list !== p.site.existingRoads) q = { ...q, site: { ...q.site, existingRoads: list } }
  }
  if (p.dimensions) set('dimensions', mapped(p.dimensions, (d) => dimensions.has(d.id), (d) => grouped(d, group)))
  if (p.referenceLines) set('referenceLines', mapped(p.referenceLines, (r) => lines.has(r.id), (r) => grouped(r, group)))
  if (p.notes) set('notes', mapped(p.notes, (n) => notes.has(n.id), (n) => grouped(n, group)))
  const o = optionIn(p, option)
  if (o) {
    let next = o
    const lotList = o.lots && mapped(o.lots, (l) => lots.has(l.id), (l) => grouped(l, group))
    if (lotList && lotList !== o.lots) next = { ...next, lots: lotList }
    const segs = o.streets && mapped(o.streets.segments, (s) => segments.has(s.id), (s) => grouped(s, group))
    if (o.streets && segs && segs !== o.streets.segments) next = { ...next, streets: { ...o.streets, segments: segs } }
    // the gates the option answers for: its own copy, else the site's
    if (o.gates) {
      const own = mapped(o.gates, (g) => gates.has(g.id), (g) => grouped(g, group))
      if (own !== o.gates) next = { ...next, gates: own }
    } else if (p.site.gates) {
      const site = mapped(p.site.gates, (g) => gates.has(g.id), (g) => grouped(g, group))
      if (site !== p.site.gates) q = { ...q, site: { ...q.site, gates: site } }
    }
    if (next !== o) q = { ...q, options: q.options.map((x) => (x.id === option ? next : x)) }
  }
  return q
}

/**
 * Every group of a single thing taken away (a group of one is none): the ids that only one thing carries. A group is counted in each option
 * (the project's things in every option, the option's own in theirs): an id that is lone in every option goes from the project's things, one lone in an
 * option goes from that option's own streets, lots and gates (the site's gates when every option that uses them has it lone). The same project
 * when there is none; every edit goes through this in `state/settle.ts`, so deleting members never leaves a group of one.
 */
export function withoutLoneGroups(p: Project): Project {
  if (groupIdsIn(p).length === 0) return p
  // a group counts a street once, however many segments carry it
  // (the roads are derived only where a segment carries a group: every edit asks)
  const roads = new Map(p.options.map((o) => [o.id, o.streets?.segments.some((s) => s.group !== undefined) ? roadsOf(p, o.id) : []]))
  const counts = new Map<Id, Map<Id, number>>() // option → group → things
  const base = new Map<Id, number>() // the project's own things
  const bump = (m: Map<Id, number>, g: Id | undefined) => {
    if (g !== undefined) m.set(g, (m.get(g) ?? 0) + 1)
  }
  for (const m of p.masses) bump(base, m.group)
  for (const d of p.dimensions ?? []) bump(base, d.group)
  for (const r of p.referenceLines ?? []) bump(base, r.group)
  for (const n of p.notes ?? []) bump(base, n.group)
  // the existing streets are the site's: in every option, as the masses are
  for (const r of p.site.existingRoads ?? []) bump(base, r.group)
  for (const o of p.options) {
    const c = new Map(base)
    for (const r of roads.get(o.id) ?? []) bump(c, groupOfSegments(p, o.id, r.segments))
    for (const l of o.lots ?? []) bump(c, l.group)
    for (const g of gatesOf(p, o.id)) bump(c, g.group)
    counts.set(o.id, c)
  }
  const lone = (option: Id, g: Id | undefined) => g !== undefined && (counts.get(option)?.get(g) ?? 0) < 2
  const everywhere = (g: Id | undefined, options: readonly DesignOption[]) => g !== undefined && options.every((o) => lone(o.id, g))
  const all = p.options
  const usingSite = all.filter((o) => !o.gates)
  let q: Project = p
  const set = <K extends keyof Project>(key: K, value: Project[K]) => {
    if (value !== q[key]) q = { ...q, [key]: value }
  }
  set('masses', mapped(p.masses, (m) => everywhere(m.group, all), (m) => grouped(m, undefined)))
  if (p.dimensions) set('dimensions', mapped(p.dimensions, (d) => everywhere(d.group, all), (d) => grouped(d, undefined)))
  if (p.referenceLines) set('referenceLines', mapped(p.referenceLines, (r) => everywhere(r.group, all), (r) => grouped(r, undefined)))
  if (p.notes) set('notes', mapped(p.notes, (n) => everywhere(n.group, all), (n) => grouped(n, undefined)))
  if (p.site.gates) {
    const site = mapped(p.site.gates, (g) => usingSite.length > 0 && everywhere(g.group, usingSite), (g) => grouped(g, undefined))
    if (site !== p.site.gates) q = { ...q, site: { ...q.site, gates: site } }
  }
  if (p.site.existingRoads) {
    const roadsFree = mapped(p.site.existingRoads, (r) => everywhere(r.group, all), (r) => grouped(r, undefined))
    if (roadsFree !== p.site.existingRoads) q = { ...q, site: { ...q.site, existingRoads: roadsFree } }
  }
  const options = p.options.map((o) => {
    let next = o
    const lots = o.lots && mapped(o.lots, (l) => lone(o.id, l.group), (l) => grouped(l, undefined))
    if (lots && lots !== o.lots) next = { ...next, lots }
    if (o.gates) {
      const gates = mapped(o.gates, (g) => lone(o.id, g.group), (g) => grouped(g, undefined))
      if (gates !== o.gates) next = { ...next, gates }
    }
    if (o.streets) {
      // a street is read in one group (its first segment's that has one): its segments go from it when that is lone, and any that carry another one
      // (an old project's) go from that
      const own = new Map((roads.get(o.id) ?? []).flatMap((r) => r.segments.map((g) => [g, groupOfSegments(p, o.id, r.segments)] as const)))
      if (own.size > 0) {
        const segments = mapped(
          o.streets.segments,
          (s) => s.group !== undefined && own.has(s.id) && (s.group !== own.get(s.id) || lone(o.id, s.group)),
          (s) => grouped(s, undefined),
        )
        if (segments !== o.streets.segments) next = { ...next, streets: { ...o.streets, segments } }
      }
    }
    return next
  })
  if (options.some((o, i) => o !== p.options[i])) q = { ...q, options }
  return q
}
