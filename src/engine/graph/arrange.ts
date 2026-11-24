// arrange (Decisions "Rules", "Arrange" and "Solve"): a pure, deterministic layout pass that slides an option's masses
// to meet the brief's rules inside the buildable area. The seed of the Phase 8 optimizer, which reuses the same scores.
// It starts from where the masses are and only slides them (it never turns or reshapes one). The rules are applied
// once, at the start (each mass with its nearest partner), then in rounds:
//   near broken      the pair is pulled together by what is missing
//   adjacent broken  the pair is pulled together until the mass stands against its partner's nearest wall (snapTo)
//   apart broken     the pair is pushed apart by what is missing
//   overlap          two built masses that clash and overlap or touch (and are not one building: adjacent or
//                    attached) are pushed apart, so a pull does not leave one over the other (how far apart they keep is
//                    the brief's apart rules: Decision "Spacing by rules"); one over the other, by as much as they
//                    overlap along the line between their middles
//   buildable        a built mass with corners outside the buildable area is pushed back in, towards its middle
// Who moves (asked by the user): of the two ends of a correction, the SMALLER one takes all of it and the bigger one
// stays, so the dominant mass anchors the layout. Size is floor area: the footprint × its level's floors (×N), and a
// stack (masses of one building on different levels, one over the other) is one unit that moves as one, its floor
// areas summed. Equal sizes: the one drawn later moves. A fixed unit (a locked mass, or a context building's) never
// moves: the other end takes the correction. A rule's weight scales its pull. A mass that *moves with* another takes
// every move of its leader too. Each correction asks MARGIN more than is missing, so the rounds end with the rules met
// instead of creeping towards them; they stop when nothing asks to move, when nothing moves any more, or after
// MAX_ROUNDS.
// Focused on one issue (Decision "Issues, one list"; the user: "one Solve for all and another issue by issue"): only
// that rule between those masses pulls or pushes (none for an overlap or a mass outside), and the overlaps and the
// buildable area move only the masses that have moved already, starting with the issue's: the rest stay put.
import { lockedMassIds } from '../../model/locks.ts'
import type { Id, Point, Polygon, Project } from '../../model/schema.ts'
import { optionOf } from '../buildings.ts'
import { derive } from '../derive.ts'
import { intersection, regionsArea } from '../geom/boolean.ts'
import { translateHoles } from '../geom/holes.ts'
import { centroid, distancePointSegment } from '../geom/polygon.ts'
import { levelOf } from '../levels.ts'
import { clash } from '../massing/checks.ts'
import { snapTo } from './links.ts'
import { inRegions } from './place.ts'
import { measureRule, pairKey, polygonDistance, rulePairs, type Node } from './relations.ts'

const MAX_ROUNDS = 200
const STILL = 1e-4 // m: a round that moves less than this is stuck (rules that cannot all be met): the pass ends
const MARGIN = 0.05 // m: a correction goes this much past what is missing
const RELAX = 0.5 // each round takes half of what the forces ask: it settles instead of overshooting
const STACKED = 1 // m²: two masses of one building on different levels that overlap this much are one stack

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
const shift = (poly: Polygon, d: Point): Polygon => poly.map((q) => ({ x: q.x + d.x, y: q.y + d.y }))

/** The unit vector from a to b (along x when they are on the same spot). */
function direction(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  return l < 1e-9 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l }
}

/** One issue to solve alone: its masses, and its rule when it is a broken one. */
export interface Focus {
  masses: Id[]
  rule?: Id
}

/** The option's masses after the pass (the same project when nothing moves); `focus`: one issue's alone. */
export function arrange(p: Project, optionId: Id, focus?: Focus): Project {
  const option = optionOf(p, optionId)
  const d = derive(p, option.id)
  const shown = Object.values(d.masses).filter((m) => option.buildingIds.includes(m.buildingId) && m.polygon.length >= 3)
  const design = shown.filter((m) => !m.context)
  if (design.length === 0 || (!focus && !p.rules?.length)) return p
  const own = new Map(p.masses.map((m) => [m.id, m]))
  const order = new Map(p.masses.map((m, i) => [m.id, i]))

  // the units that move: a mass, or a stack of one building's masses on different levels, one over another
  const root = new Map<Id, Id>(shown.map((m) => [m.id, m.id]))
  const unit = (id: Id): Id => {
    let x = id
    while (root.get(x) !== x) x = root.get(x)!
    return x
  }
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i]
      const b = shown[j]
      if (a.buildingId !== b.buildingId || a.levelId === b.levelId) continue
      if (regionsArea(intersection([a.polygon], [b.polygon])) > STACKED) root.set(unit(b.id), unit(a.id))
    }
  const size = new Map<Id, number>() // floor area: footprint × floors, summed over a stack
  const first = new Map<Id, number>() // where its first mass is in the project: equal sizes, the later moves
  const fixed = new Set<Id>()
  const locked = new Set(lockedMassIds(p))
  for (const m of shown) {
    const u = unit(m.id)
    size.set(u, (size.get(u) ?? 0) + m.area * levelOf(p, m).repeat)
    first.set(u, Math.min(first.get(u) ?? Infinity, order.get(m.id) ?? Infinity))
    if (m.context || locked.has(m.id)) fixed.add(u)
  }
  /** Of two free units, the one a correction moves: the smaller; equal, the one drawn later. */
  const mover = (a: Id, b: Id): Id => {
    const sa = size.get(a)!
    const sb = size.get(b)!
    if (Math.abs(sa - sb) > 1e-6) return sa < sb ? a : b
    return first.get(a)! > first.get(b)! ? a : b
  }

  // the rules on the design masses, paired once
  const nodes: Node[] = design.map((m) => ({ id: m.id, programId: own.get(m.id)?.programId ?? null, polygon: m.polygon }))
  const all = (p.rules ?? []).flatMap((r) => rulePairs(r, nodes).map(([a, b]) => ({ rule: r, a: a.id, b: b.id })))
  // focused: that rule between those masses pulls or pushes; what moves with what still does
  const pairs = all.filter((x) => !focus || x.rule.kind === 'attached' || (x.rule.id === focus.rule && focus.masses.includes(x.a) && focus.masses.includes(x.b)))
  // who moves with whom: a leader's moves go to its followers, link after link
  const followers = new Map<Id, Id[]>()
  for (const x of pairs) if (x.rule.kind === 'attached') followers.set(unit(x.b), [...(followers.get(unit(x.b)) ?? []), unit(x.a)])
  const together = new Set(all.filter((x) => x.rule.kind === 'adjacent' || x.rule.kind === 'attached').map((x) => pairKey(x.a, x.b)))

  const offset = new Map<Id, Point>() // per unit
  const poly = (id: Id): Polygon => shift(d.masses[id].polygon, offset.get(unit(id)) ?? { x: 0, y: 0 })
  const regions = d.site.buildable
  const built = shown.filter((m) => m.built)
  const units = [...new Set(shown.map((m) => unit(m.id)))]
  // focused: the units that may move for the overlaps and the buildable area (the issue's, then each one pushed)
  const touched = new Set(focus ? focus.masses.filter((id) => root.has(id)).map(unit) : units)

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const push = new Map<Id, Point>()
    /** v for this unit and every unit that moves with it (a fixed one takes nothing; `other`, the correction's other end, neither). */
    const give = (u: Id, v: Point, other?: Id) => {
      const queue = [u]
      const seen = new Set<Id>()
      while (queue.length) {
        const x = queue.shift()!
        if (seen.has(x) || fixed.has(x) || x === other) continue
        seen.add(x)
        touched.add(x)
        push.set(x, add(push.get(x) ?? { x: 0, y: 0 }, v))
        queue.push(...(followers.get(x) ?? []))
      }
    }
    /** A correction `v` that brings b where it should be from a: all of it to the smaller (b moves by v, or a by −v). */
    const share = (a: Id, b: Id, v: Point) => {
      const ua = unit(a)
      const ub = unit(b)
      if (ua === ub || (fixed.has(ua) && fixed.has(ub))) return
      const moving = fixed.has(ua) ? ub : fixed.has(ub) ? ua : mover(ua, ub)
      if (moving === ub) give(ub, v, ua)
      else give(ua, scale(v, -1), ub)
    }

    for (const x of pairs) {
      if (x.rule.kind === 'attached') continue
      const pa = poly(x.a)
      const pb = poly(x.b)
      const res = measureRule(x.rule, pa, pb)
      if (res.met) continue
      const w = x.rule.weight
      // the correction moves the rule's mass (a) towards or away from its partner (b)
      const u = direction(centroid(pb), centroid(pa))
      if (x.rule.kind === 'near') share(x.b, x.a, scale(u, -(res.gap + MARGIN) * w))
      else if (x.rule.kind === 'apart') share(x.b, x.a, scale(u, (res.gap + MARGIN) * w))
      else share(x.b, x.a, scale(snapTo(pb, pa), w))
    }

    for (let i = 0; i < built.length; i++)
      for (let j = i + 1; j < built.length; j++) {
        const a = built[i].id
        const b = built[j].id
        if (together.has(pairKey(a, b)) || !clash(built[i], built[j])) continue
        if (!touched.has(unit(a)) && !touched.has(unit(b))) continue
        const pa = poly(a)
        const pb = poly(b)
        const gap = polygonDistance(pa, pb)
        const want = 0.01
        if (gap >= want - 1e-6) continue
        // one over the other (no gap to measure): as far as they overlap along the line between their middles
        const u = direction(centroid(pa), centroid(pb))
        const along = (poly: Polygon) => poly.map((q) => q.x * u.x + q.y * u.y)
        const depth = gap > 0 ? 0 : Math.max(...along(pa)) - Math.min(...along(pb))
        share(a, b, scale(u, Math.max(want - gap, depth + want) + MARGIN))
      }

    if (regions.length)
      for (const u of units) {
        if (fixed.has(u) || !touched.has(u)) continue
        const members = built.filter((m) => unit(m.id) === u)
        const out = members.flatMap((m) => poly(m.id)).filter((q) => !inRegions(q, regions))
        if (out.length === 0) continue
        // how far its farthest corner is outside, towards the middle of the buildable area
        const depth = Math.max(...out.map((q) => Math.min(...regions.flatMap(([outer]) => (outer ? outer.map((v, k) => distancePointSegment(q, v, outer[(k + 1) % outer.length])) : [])))))
        give(u, scale(direction(centroid(poly(members[0].id)), centroid(regions[0][0])), depth + MARGIN))
      }

    if (push.size === 0) break
    let most = 0
    for (const [id, v] of push) {
      const step = scale(v, RELAX)
      offset.set(id, add(offset.get(id) ?? { x: 0, y: 0 }, step))
      most = Math.max(most, Math.hypot(step.x, step.y))
    }
    if (most < STILL) break
  }

  const round2 = (v: number) => Math.round(v * 100) / 100
  const moved = new Map<Id, Point>()
  for (const [id, o] of offset) {
    const r = { x: round2(o.x), y: round2(o.y) }
    if (r.x !== 0 || r.y !== 0) moved.set(id, r)
  }
  if (moved.size === 0) return p
  return {
    ...p,
    masses: p.masses.map((m) => {
      const o = root.has(m.id) ? moved.get(unit(m.id)) : undefined
      if (!o) return m
      const f = m.footprint
      const holes = m.holes && { holes: translateHoles(m.holes, o).map((h) => ({ ...h, vertices: h.vertices.map((v) => ({ ...v, x: round2(v.x), y: round2(v.y) })) })) }
      return f.kind === 'rect'
        ? { ...m, ...holes, footprint: { ...f, center: { x: round2(f.center.x + o.x), y: round2(f.center.y + o.y) } } }
        : { ...m, ...holes, footprint: { ...f, contour: { ...f.contour, vertices: f.contour.vertices.map((v) => ({ ...v, x: round2(v.x + o.x), y: round2(v.y + o.y) })) } } }
    }),
  }
}
