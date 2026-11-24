// Merge (Phase H.2, Decision "Holes and free geometry"): masses that touch become one shape, a boolean union of their
// outlines with their holes; a court they close all round becomes a hole. Pure: the verb (`mergeMasses`) makes the
// mass, the plan menu and the MCP call the verb.
import type { Polygon } from '../../model/schema.ts'
import { union, type Region } from './boolean.ts'
import { area } from './polygon.ts'

/** m: a corner this close to the line through its neighbours is on it (where two shapes met). */
const STRAIGHT = 1e-3

/**
 * The ring without repeated corners, corners on a straight run between their neighbours, or the tips of spikes (a run
 * out and back along one line, which the union leaves where two shapes met at a T).
 */
export function tidy(ring: Polygon): Polygon {
  let q = ring
  for (let changed = true; changed && q.length > 3; ) {
    changed = false
    for (let i = 0; i < q.length && q.length > 3; i++) {
      const a = q[(i - 1 + q.length) % q.length]
      const v = q[i]
      const b = q[(i + 1) % q.length]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      // on the line a → b, between them or past them (a spike's tip); a and b at one point: v is a spike's tip, or
      // repeats them
      const off = l < 1e-9 ? 0 : Math.abs((b.x - a.x) * (v.y - a.y) - (b.y - a.y) * (v.x - a.x)) / l
      if (off < STRAIGHT) {
        q = [...q.slice(0, i), ...q.slice(i + 1)]
        changed = true
        i--
      }
    }
  }
  return q
}

/**
 * The union of shapes (each its outline, then its holes) as one outline (counter-clockwise) and its holes (clockwise);
 * null when they make more than one piece: some of them do not touch the others.
 */
export function mergeShapes(shapes: Polygon[][]): { outline: Polygon; holes: Polygon[] } | null {
  let regions: Region[] = []
  for (const s of shapes) regions = union(regions.flat(), s)
  if (regions.length !== 1) return null
  const [outline, ...holes] = regions[0].map(tidy)
  return { outline, holes: holes.filter((h) => h.length >= 3 && area(h) > 0) }
}
