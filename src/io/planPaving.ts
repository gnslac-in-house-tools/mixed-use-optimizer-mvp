// The CAD plan's one paving (Phase DI.2; spec docs/superpowers/specs/2026-11-09-dxf-interior-and-paving-design.md),
// pure: the streets, the existing roads (a site's street along its boundary is one), the truck courts and the approaches as one
// outline with its holes, trimmed where they meet (the drafters asked for streets that make sense, not strips laid
// over each other), its inside corners rounded where streets meet (curb returns) as true arcs. In metres, on the plan;
// planOf (exportPlan.ts) writes the rings on C-ROAD in the output's units and frame.
//   junctions  where streets meet: two centrelines crossing or touching, a road ending on another's paving; each
//              rounds the inside corners within its reach, farther where they meet at an acute angle (the crotch
//              stands off)
//   closings   where roads end at one node, the outer corner their square ends leave open, mitred (bevelled past
//              120°): so it is convex, never a notch with a curb return in it
//   reaching   a road that ends up to TOUCH short of another's paving runs on to it: a junction there is paved joined
//   rings      every road's strip, the closings and the areas unioned, slivers of holes left out,
//              each ring through filletRing, its returns kept clear of the blockers and of the other rings
import type { Region } from '../engine/geom/boolean.ts'
import { filletRing, type Fillet } from '../engine/geom/fillet.ts'
import { endsOf, joinedPaving, nearestSegment, TOUCH, type PavingRoad } from '../engine/path/join.ts'
import { bounds, boundsTouch, cross, lineCrossing } from '../engine/geom/polygon.ts'
import type { Point, Polygon } from '../model/schema.ts'

export { TOUCH }
/** m: a curb return's radius where no street that meets there has a turning radius of its own. */
export const CURB_RADIUS = 9
/** m: junctions closer than this are one. */
const SAME_JUNCTION = 1
/** A junction's reach: this many times the widest that meet there, where they meet square. */
const REACH = 1.5
/** A junction's reach never passes this many times the widest: roads that meet almost parallel. */
const REACH_MAX = 4
/** What meets at a junction: a width (m) and, a street's, a turning radius. */
type Meeting = { width: number; radius?: number }

/** Where the two segments cross or touch (a shared vertex included); null when they do not, or run parallel. */
function crossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const x = lineCrossing(a, b, c, d)
  const e = 1e-9
  if (!x || x.t < -e || x.t > 1 + e || x.u < -e || x.u > 1 + e) return null
  return { x: a.x + x.t * (b.x - a.x), y: a.y + x.t * (b.y - a.y) }
}

const unit = (a: Point, b: Point): Point | null => {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return l > 1e-9 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : null
}

/**
 * The ways a road leaves the point of its segment k nearest x: one at its end (that point within TOUCH of it), both
 * ways elsewhere. None for a segment of no length.
 */
function armsAt(line: Point[], k: number, x: Point): Point[] {
  const [a, b] = [line[k], line[k + 1]]
  const u = unit(a, b)
  if (!u) return []
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  const t = Math.max(0, Math.min(l, (x.x - a.x) * u.x + (x.y - a.y) * u.y))
  if (k === 0 && t <= TOUCH) return [u]
  if (k === line.length - 2 && l - t <= TOUCH) return [{ x: -u.x, y: -u.y }]
  return [u, { x: -u.x, y: -u.y }]
}

/**
 * How much farther than square a junction's returns reach: 1 / sin of the sharpest angle between two roads leaving it
 * (its acute crotch stands about half a width / sin of it away); 1 where none is acute (a T, an L, a road running
 * straight on).
 */
function spread(as: Point[], bs: Point[]): number {
  let sin = 1
  for (const a of as) for (const b of bs) if (a.x * b.x + a.y * b.y > 0) sin = Math.min(sin, Math.abs(cross(a, b)))
  return 1 / Math.max(sin, 1e-9)
}

/**
 * Where streets meet, each with the radius of its curb returns (the larger turning radius of the roads that meet, else
 * CURB_RADIUS) and its reach (1.5 × the widest that meet; more where two of them leave it at an acute angle, by
 * `spread`, up to 4 × the widest): (a) wherever two roads' centrelines cross or touch, a vertex they share included;
 * (b) each road's end within half another's width + TOUCH of that one's centreline (a street ending on an existing
 * street along the boundary is one). Junctions closer than 1 m are one, with the larger radius and reach.
 */
export function junctionsOf(roads: PavingRoad[]): Fillet[] {
  const found: Fillet[] = []
  const meet = (at: Point, who: Meeting[], wider: number) => {
    const radii = who.map((m) => m.radius ?? 0).filter((r) => r > 0)
    const widest = Math.max(...who.map((m) => m.width))
    found.push({ at, radius: radii.length ? Math.max(...radii) : CURB_RADIUS, reach: Math.min(REACH * wider, REACH_MAX) * widest })
  }
  const lines = roads.filter((r) => r.points.length >= 2)
  const boxes = lines.map((r) => bounds(r.points))
  const ends = lines.map(endsOf)

  for (let i = 0; i < lines.length; i++) {
    const ri = lines[i]
    for (let j = 0; j < lines.length; j++) {
      // far apart: neither crosses nor ends on the other
      if (j === i || !boundsTouch(boxes[i], boxes[j], Math.max(ri.width, lines[j].width) / 2 + TOUCH)) continue
      const rj = lines[j]
      // (a) once per pair: every crossing or touch of their segments
      if (j > i)
        for (let k = 0; k + 1 < ri.points.length; k++)
          for (let l = 0; l + 1 < rj.points.length; l++) {
            const x = crossing(ri.points[k], ri.points[k + 1], rj.points[l], rj.points[l + 1])
            if (x) meet(x, [ri, rj], spread(armsAt(ri.points, k, x), armsAt(rj.points, l, x)))
          }
      // (b) i's ends on j's paving
      for (const e of ends[i]) {
        const near = nearestSegment(e.at, rj.points)
        if (near.distance <= rj.width / 2 + TOUCH) meet(e.at, [ri, rj], spread([e.away], armsAt(rj.points, near.k, e.at)))
      }
    }
  }

  // one junction where several fall within a metre: the first's place, the larger radius and reach
  const out: Fillet[] = []
  for (const f of found) {
    const same = out.find((g) => Math.hypot(g.at.x - f.at.x, g.at.y - f.at.y) < SAME_JUNCTION)
    if (!same) out.push({ ...f })
    else {
      same.radius = Math.max(same.radius, f.radius)
      same.reach = Math.max(same.reach, f.reach)
    }
  }
  return out
}

/**
 * The one paving: `joinedPaving` of the roads and the areas (courts, approaches), each ring of each region
 * with its inside corners near a junction rounded, clear of the blockers (stalls, lots, buildings: each
 * [outer, ...holes]) and of the other regions: outer rings counter-clockwise, holes clockwise, each its points and
 * bulges (DXF's sign).
 */
export function pavingRings(input: { roads: PavingRoad[]; areas: Polygon[]; blockers?: Region[] }): { points: Point[]; bulges: number[] }[] {
  const regions = joinedPaving(input.roads, { areas: input.areas })
  if (regions.length === 0) return []
  const fillets = junctionsOf(input.roads)
  return regions.flatMap((region, i) => {
    const blockers = [...(input.blockers ?? []), ...regions.filter((_, j) => j !== i)]
    return region.map((ring) => filletRing(ring, fillets, blockers))
  })
}
