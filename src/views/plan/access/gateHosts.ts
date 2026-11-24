// Where a click of the Gate tool lands (Phase PE.2 task 10, Decision "On edge engine"): the side of a street, of an existing street or of the site's boundary a gate would stand
// on, with the slot under the pointer. Pure of the plan's drawing: it reads the project and says which host, which of its edges and which slot, the three things `actions.editEdge`
// takes to put a gate (`op: 'put'`).
//   - A press on a street's paving takes the side of the drawn line it lies on: left of it, the left side; right of it, the right one (a press anywhere in the paving, not only near the side).
//   - Else the nearest side of any street, existing street or the boundary within `NEAR_PX` px; between two equally near, the boundary (as a gate has always been put).
// A side too short to hold a slot is not a place, nor is one of a host an eye hides (a street's segment, an existing street, the boundary: Phase PE.2 review).
import { GATE_SLOT } from '../../../engine/circulation/gates.ts'
import { allGateSides } from '../../../engine/circulation/gateSides.ts'
import { nearestSide, roadSides, segmentSides, type GateSide } from '../../../engine/circulation/gateGeometry.ts'
import type { Ref } from '../../../kinds/index.ts'
import type { Id, Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { BOUNDARY, isObjectHidden } from '../../layers/keys.ts'
import { hiddenNow } from '../../layers/layerView.ts'

/** px: how near a side a click must be to put a gate on it (a press on the paving needs no nearness). */
export const NEAR_PX = 12

export interface GateHost {
  host: Ref
  edge: Id
  slot: number
}

/** The slots of a side (the part left over has none). */
const slotsOf = (side: GateSide): number => Math.floor(side.length / GATE_SLOT + 1e-9)

/** The host a side belongs to, as `editEdge` names it. */
function hostOf(side: GateSide): Ref {
  if (side.kind === 'street') return { kind: 'street', id: `street:${side.host}` }
  if (side.kind === 'existing-road') return { kind: 'existing-road', id: side.host }
  return { kind: 'boundary', id: 'site' }
}

/** A hit on `side` at the point `q` (the slot under its projection onto the side). */
function hit(side: GateSide, q: Point): GateHost {
  const along = Math.min(side.length, Math.max(0, (q.x - side.a.x) * side.dir.x + (q.y - side.a.y) * side.dir.y))
  return { host: hostOf(side), edge: side.id, slot: Math.max(0, Math.min(slotsOf(side) - 1, Math.floor(along / GATE_SLOT + 1e-6))) }
}

/** A run of one street's or existing street's paving: its drawn line and its two sides. */
interface Run {
  p: Point
  q: Point
  left: GateSide
  right: GateSide
}

/** Every run of paving a gate can stand beside: each segment of the option's streets, each stretch of the existing streets (not those an eye hides: `off`). */
function runs(off: ReadonlySet<string>): Run[] {
  const { project, option } = useApp.getState()
  const streets = project.options.find((o) => o.id === option)?.streets
  const out: Run[] = []
  for (const seg of streets?.segments ?? []) {
    if (isObjectHidden(off, 'street', seg.id)) continue
    const a = streets!.nodes.find((n) => n.id === seg.a)
    const b = streets!.nodes.find((n) => n.id === seg.b)
    const [left, right] = segmentSides(streets, seg)
    if (a && b && left && right) out.push({ p: a, q: b, left, right })
  }
  for (const road of project.site.existingRoads ?? []) {
    if (isObjectHidden(off, 'existing-road', road.id)) continue
    const sides = roadSides(road)
    road.stretches.forEach((_, k) => {
      const left = sides.find((s) => s.index === k && s.side === 'left')
      const right = sides.find((s) => s.index === k && s.side === 'right')
      if (road.points[k] && road.points[k + 1] && left && right) out.push({ p: road.points[k], q: road.points[k + 1], left, right })
    })
  }
  return out
}

/** The side of the drawn line of `r` that `q` lies on when it is on the paving of `r`; null when it is not. */
function pavingSide(r: Run, q: Point): GateSide | null {
  const length = r.left.length
  const u = (q.x - r.p.x) * r.left.dir.x + (q.y - r.p.y) * r.left.dir.y
  if (u < 0 || u > length) return null
  // across the line: + is its left (the left side's outward vector), − its right
  const n = r.left.out
  const h = (q.x - r.p.x) * n.x + (q.y - r.p.y) * n.y
  const toLeft = (r.left.a.x - r.p.x) * n.x + (r.left.a.y - r.p.y) * n.y
  const toRight = (r.right.a.x - r.p.x) * n.x + (r.right.a.y - r.p.y) * n.y
  if (h < Math.min(toLeft, toRight) - 1e-9 || h > Math.max(toLeft, toRight) + 1e-9) return null
  const side = h > 1e-9 ? r.left : h < -1e-9 ? r.right : toLeft > 1e-9 ? r.left : r.right
  return slotsOf(side) > 0 ? side : null
}

/**
 * The side a gate would go on at `q` (the plan's frame, m), `px` metres per pixel: a press on a paving takes the side of the drawn line it lies on, else the nearest side within
 * `NEAR_PX` px. Null when there is none (the click says where gates go).
 */
export function gateHostAt(q: Point, px: number): GateHost | null {
  const { project, option, derived } = useApp.getState()
  const off = hiddenNow()
  // a press on a paving: the nearest of the sides it picks (two streets crossing)
  let best: { side: GateSide; distance: number } | null = null
  for (const r of runs(off)) {
    const side = pavingSide(r, q)
    if (!side) continue
    const d = Math.abs((q.x - side.a.x) * side.out.x + (q.y - side.a.y) * side.out.y)
    if (!best || d < best.distance) best = { side, distance: d }
  }
  if (best) return hit(best.side, q)
  // else the nearest side of any kind, the boundary first among equals
  const hosts = { streets: project.options.find((o) => o.id === option)?.streets, existingRoads: project.site.existingRoads }
  const poly = derived.site.polygon
  const groups: GateSide[][] = [
    off.has(BOUNDARY) ? [] : allGateSides('boundary', hosts, poly),
    allGateSides('street', hosts, poly).filter((s) => !isObjectHidden(off, 'street', s.host)),
    allGateSides('existing-road', hosts, poly).filter((s) => !isObjectHidden(off, 'existing-road', s.host)),
  ]
  let near: { side: GateSide; distance: number } | null = null
  for (const sides of groups) {
    const n = nearestSide(q, sides.filter((s) => slotsOf(s) > 0))
    if (n && (!near || n.distance < near.distance - 1e-9)) near = { side: n.side, distance: n.distance }
  }
  return near && near.distance <= NEAR_PX * px ? hit(near.side, q) : null
}
