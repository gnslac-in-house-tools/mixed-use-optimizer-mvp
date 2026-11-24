// Where a street end lands (Decision "Streets stay connected"): on a node, or on a stretch's paving. Pure.
import type { Point } from '../../model/schema.ts'
import { centreOf } from './offset.ts'
import type { Path } from './types.ts'

/** m: a point drawn this close to a node is that node; this close to a segment, on it (the snap puts it there exactly). */
export const JOIN = 0.05

export type Landing =
  | { on: 'node'; path: number; i: number; at: Point }
  | { on: 'stretch'; path: number; k: number; at: Point }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function nearestOn(q: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2))
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/**
 * Where an end drawn at q lands on the paths: a node when q is within `JOIN` of one (an end or an inner node), else
 * the stretch whose paving holds q (within half its width of its centre segment, round past a free tip), `at` its
 * nearest point on the drawn line; the nearest when several; null on none.
 */
export function endOn(q: Point, paths: readonly Path[]): Landing | null {
  for (let p = 0; p < paths.length; p++)
    for (let i = 0; i < paths[p].points.length; i++) if (dist(paths[p].points[i], q) <= JOIN) return { on: 'node', path: p, i, at: paths[p].points[i] }
  let best: (Landing & { d: number }) | null = null
  paths.forEach((path, p) => {
    const centre = centreOf(path)
    path.stretches.forEach((s, k) => {
      const d = dist(nearestOn(q, centre[k], centre[k + 1]), q)
      if (d <= (s.left + s.right) / 2 && (!best || d < best.d)) best = { on: 'stretch', path: p, k, at: nearestOn(q, path.points[k], path.points[k + 1]), d }
    })
  })
  if (!best) return null
  const { d: _d, ...landing } = best as Landing & { d: number }
  return landing
}
