// The brief's *moves with* rules (Decision "Rules"; `attached`): each mass of `a` follows its nearest mass of `b`, in
// every option that shows them. Moving or rotating a leader moves its followers the same way (and theirs, link after
// link); a locked follower stays where it is. Pure: the move and rotate verbs (state/actions/masses.ts) call it, so
// the plan, the graph, a typed move and MCP all get it.
import { lockedMassIds } from '../../model/locks.ts'
import type { DesignOption, Id, Point, Polygon, Project } from '../../model/schema.ts'
import { buildingOf } from '../buildings.ts'
import { footprintPolygon } from '../geom/footprint.ts'
import { signedArea } from '../geom/polygon.ts'
import { rulePairs, type Node } from './relations.ts'

/** An option's design masses as the graph sees them: program and footprint (one that cannot be built is left out). */
export function optionNodes(p: Project, option: DesignOption): Node[] {
  const design = new Set(p.buildings.filter((b) => option.buildingIds.includes(b.id) && !b.context).map((b) => b.id))
  return p.masses.flatMap((m) => {
    if (!design.has(buildingOf(p, m).id)) return []
    try {
      return [{ id: m.id, programId: m.programId, polygon: footprintPolygon(m.footprint) }]
    } catch {
      return []
    }
  })
}

/** leader → its followers, in every option (a mass may lead in one option and not in another: both count). */
export function followerMap(p: Project): Map<Id, Id[]> {
  const links = (p.rules ?? []).filter((r) => r.kind === 'attached')
  const out = new Map<Id, Id[]>()
  if (links.length === 0) return out
  for (const o of p.options) {
    const nodes = optionNodes(p, o)
    for (const r of links)
      for (const [a, b] of rulePairs(r, nodes)) {
        const list = out.get(b.id) ?? []
        if (!list.includes(a.id)) out.set(b.id, [...list, a.id])
      }
  }
  return out
}

/** `ids` and every mass that follows them, link after link; a locked follower is left out. */
export function withFollowers(p: Project, ids: Iterable<Id>): Id[] {
  const out = [...new Set(ids)]
  const map = followerMap(p)
  if (map.size === 0) return out
  const locked = new Set(lockedMassIds(p))
  const seen = new Set(out)
  for (let i = 0; i < out.length; i++)
    for (const f of map.get(out[i]) ?? [])
      if (!seen.has(f) && !locked.has(f)) {
        seen.add(f)
        out.push(f)
      }
  return out
}

/**
 * How far B moves to stand against A: across A's wall it is most outside of (or least inside, if they overlap) until
 * it touches that wall's line, then along the wall until they share some of it. For a convex A; a concave one uses
 * its outline all the same. Arrange and the placement of a new mass use it.
 */
export function snapTo(a: Polygon, b: Polygon): Point {
  if (a.length < 3 || b.length < 3) return { x: 0, y: 0 }
  // A counter-clockwise, so each wall's outward normal is to its right
  const ccw = signedArea(a) > 0 ? a : [...a].reverse()
  let best: { gap: number; n: Point; t: Point; p: Point; len: number } | null = null
  for (let i = 0; i < ccw.length; i++) {
    const p = ccw[i]
    const q = ccw[(i + 1) % ccw.length]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (len < 1e-9) continue
    const t = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const n = { x: t.y, y: -t.x }
    const gap = Math.min(...b.map((v) => (v.x - p.x) * n.x + (v.y - p.y) * n.y))
    if (!best || gap > best.gap) best = { gap, n, t, p, len }
  }
  if (!best) return { x: 0, y: 0 }
  // across: onto the wall's line
  let dx = -best.gap * best.n.x
  let dy = -best.gap * best.n.y
  // along: if B is past one end of the wall, back to it
  const along = b.map((v) => (v.x - best.p.x) * best.t.x + (v.y - best.p.y) * best.t.y)
  const lo = Math.min(...along)
  const hi = Math.max(...along)
  const slide = hi < 0 ? -lo : lo > best.len ? best.len - hi : 0
  dx += slide * best.t.x
  dy += slide * best.t.y
  const round = (v: number) => Math.round(v * 1000) / 1000 || 0
  return { x: round(dx), y: round(dy) }
}
