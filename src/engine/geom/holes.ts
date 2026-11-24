// A mass's holes (Phase H, Decision "Holes and free geometry"; port of Plaza-Practiko `motores/derivar.ts` `huecosDe`):
// each hole is a contour of its own in site coordinates (a court, a light well), cut out of the mass's outline. What
// leaves the outline does not count, nor does a hole under 1 m²; two holes that overlap are one. Pure.
import type { Contour, Hole, Point, Polygon } from '../../model/schema.ts'
import { difference, intersection, offset, regionsArea, union, type Region } from './boolean.ts'
import { contourToPolygon } from './contour.ts'
import { rotate } from './footprint.ts'
import { area } from './polygon.ts'

/** m²: a smaller hole does not count. */
export const HOLE_MIN = 1

/** m²: a hole whose part outside the outline is under this is inside it. */
const OUTSIDE_TOL = 0.01

/**
 * The holes cut out of `outline`: merged, clipped to it, each at least 1 m², clockwise. `outside`: how many went past
 * the outline (clipped, or left out when nothing of them was in), for a warning.
 */
export function holesIn(holes: Hole[] | undefined, outline: Polygon): { holes: Polygon[]; outside: number } {
  if (!holes?.length || outline.length < 3) return { holes: [], outside: 0 }
  const rings: Polygon[] = []
  let outside = 0
  for (const h of holes) {
    let ring: Polygon
    try {
      ring = contourToPolygon(h)
    } catch {
      outside++
      continue
    }
    // a tiny one is left out without a word; one past the outline warns
    if (area(ring) < HOLE_MIN) continue
    const inside = intersection([outline], [ring]).reduce((s, r) => s + area(r[0]), 0)
    if (area(ring) - inside > OUTSIDE_TOL) outside++
    rings.push(ring)
  }
  if (rings.length === 0) return { holes: [], outside }
  // merged first, one at a time: two holes that overlap do not take the shared part out twice (nor break the 3D or the
  // even-odd fill), and a hole inside another is not read as an island
  let merged: Region[] = [[rings[0]]]
  for (const r of rings.slice(1)) merged = union(merged.map((x) => x[0]), [r])
  const clipped = intersection([outline], merged.map((x) => x[0]))
    .map((r) => r[0])
    .filter((r) => r && area(r) >= HOLE_MIN)
    // clockwise, as a Region's holes: the plan's fill (non-zero) and its hatch leave them empty
    .map((r) => r.slice().reverse())
  return { holes: clipped, outside }
}

/** A hole's corridor (Phase H.4): the ring round hole `k`, `width` m wide, inside the mass and out of every hole. */
export interface Corridor {
  k: number
  width: number
  rings: Polygon[] // one operand of the booleans (outer rings and their holes)
  area: number
}

/**
 * The corridors round the holes that have one (Practiko's `pasilloDeHueco`: the hole offset outwards by the width),
 * clipped to the outline and with every hole (`cut`, holesIn's) taken out. A hole that falls outside has none.
 */
export function corridorsIn(holes: Hole[] | undefined, outline: Polygon, cut: Polygon[]): Corridor[] {
  if (!holes?.some((h) => h.corridor) || outline.length < 3) return []
  const out: Corridor[] = []
  holes.forEach((h, k) => {
    if (!h.corridor) return
    let ring: Polygon
    try {
      ring = contourToPolygon(h)
    } catch {
      return
    }
    const grown = offset([ring], h.corridor).flat()
    const inside = intersection(grown, [outline])
    const regions = cut.length > 0 ? difference(inside.flat(), cut) : inside
    const area = regionsArea(regions)
    if (area >= HOLE_MIN) out.push({ k, width: h.corridor, rings: regions.flat(), area })
  })
  return out
}

/** m²: the corridors of one mass together (two that meet count their shared part once). */
export function corridorArea(corridors: Corridor[]): number {
  if (corridors.length <= 1) return corridors[0]?.area ?? 0
  let regions: Region[] = []
  for (const c of corridors) regions = union(regions.flat(), c.rings)
  return regionsArea(regions)
}

/** The outline and its holes as one operand of the booleans (a ring inside the outline is a hole). */
export const rings = (m: { polygon: Polygon; holes: Polygon[] }): Polygon[] => [m.polygon, ...m.holes]

const moved = <C extends Contour>(c: C, f: (v: Point) => Point): C => ({ ...c, vertices: c.vertices.map((v) => ({ ...v, ...f(v) })) })

/** The holes moved by d (they go with their mass). */
export function translateHoles<C extends Contour>(holes: C[], d: Point): C[] {
  return holes.map((h) => moved(h, (v) => ({ x: v.x + d.x, y: v.y + d.y })))
}

/** The holes turned by `degrees` around `pivot`, counter-clockwise; arcs keep their bulge. */
export function turnHoles<C extends Contour>(holes: C[], pivot: Point, degrees: number): C[] {
  return holes.map((h) => moved(h, (v) => rotate(v, pivot, degrees)))
}
