// The contours' heights (Decision "Terrain", "Terrain layout"): the one the designer gave it (the Heights tool), else
// its file's, else counted. A file that drew its contours flat needs two neighbouring contours given: they say the
// interval and the way up, and the others are counted out from them, nearest first:
//   - which contours are neighbours, and on which side of each other, comes from a triangulation of their samples:
//     an edge between two contours makes them neighbours, and says on which side (left / right of the way the
//     contour runs; a closed one runs counter-clockwise, so its left is its inside);
//   - a contour N next to a known one C is counted from another known neighbour R of C: across C from R the ground
//     goes on the same way (N = C + (C − R)); on R's side it is at R's height (N = R);
//   - what cannot be counted (a single height given, a ridge where the ground may go either way) stays null.
// Where the ground turns (a hilltop, a valley, two hills) the count goes wrong: the plan shows each height, and the
// designer gives the wrong one; the rest is counted again from it.
import Delaunator from 'delaunator'
import type { Terrain } from '../../../model/schema.ts'
import { samplesOf, type Samples } from './samples.ts'

export type HeightFrom = 'given' | 'file' | 'counted'

export interface Heights {
  /** Per contour: its height, or null (nothing to count it from). */
  z: (number | null)[]
  /** Per contour: where its height comes from (null: none). */
  from: (HeightFrom | null)[]
  /** The least step between the contours' known heights, or null. */
  interval: number | null
}

/** Neighbours: for each contour, the contours next to it and on which side (1: left or inside, -1: right or outside). */
export type Neighbours = Map<number, Map<number, 1 | -1>>

/** Fewer edges than this between two contours are not enough to call them neighbours. */
const MIN_EDGES = 2

/** Which contours are neighbours, from a triangulation of their samples. */
export function neighboursOf(s: Samples): Neighbours {
  const votes = new Map<number, Map<number, { sum: number; edges: number }>>()
  const vote = (i: number, j: number) => {
    const a = s.contour[i]
    const b = s.contour[j]
    if (a < 0 || b < 0 || a === b) return
    // the side of j seen from i's contour: the cross product of the way it runs and the way to j
    const side = Math.sign(s.tx[i] * (s.y[j] - s.y[i]) - s.ty[i] * (s.x[j] - s.x[i]))
    const row = votes.get(a) ?? new Map<number, { sum: number; edges: number }>()
    votes.set(a, row)
    const v = row.get(b) ?? { sum: 0, edges: 0 }
    row.set(b, { sum: v.sum + side, edges: v.edges + 1 })
  }
  const coords = new Float64Array(s.x.length * 2)
  for (let i = 0; i < s.x.length; i++) {
    coords[2 * i] = s.x[i]
    coords[2 * i + 1] = s.y[i]
  }
  if (s.x.length >= 3) {
    const { triangles } = new Delaunator(coords)
    for (let e = 0; e < triangles.length; e++) {
      const i = triangles[e]
      const j = triangles[e % 3 === 2 ? e - 2 : e + 1]
      vote(i, j)
      vote(j, i)
    }
  }
  const out: Neighbours = new Map()
  for (const [a, row] of votes)
    for (const [b, v] of row) {
      if (v.edges < MIN_EDGES || v.sum === 0) continue
      const m = out.get(a) ?? new Map<number, 1 | -1>()
      out.set(a, m)
      m.set(b, v.sum > 0 ? 1 : -1)
    }
  return out
}

const made = new WeakMap<Terrain, Heights>()

export function heightsOf(t: Terrain): Heights {
  const known = made.get(t)
  if (known) return known
  const h = count(t)
  made.set(t, h)
  return h
}

function count(t: Terrain): Heights {
  const n = t.contours.length
  const z: (number | null)[] = t.contours.map((c) => c.z ?? null)
  const from: (HeightFrom | null)[] = t.contours.map((c) => (c.z === undefined ? null : 'file'))
  for (const g of t.given ?? [])
    if (g.contour < n) {
      z[g.contour] = g.z
      from[g.contour] = 'given'
    }
  // contours only: a point of the ground says no contour's height
  const nb = z.every((v) => v !== null) ? new Map() : neighboursOf(samplesOf({ ...t, points: [] }))
  const next = (k: number) => nb.get(k) ?? new Map<number, 1 | -1>()

  // nearest first: how many neighbours away from a known contour
  const dist = z.map((v) => (v === null ? Infinity : 0))
  const queue = z.flatMap((v, k) => (v === null ? [] : [k]))
  for (let q = 0; q < queue.length; q++)
    for (const m of next(queue[q]).keys())
      if (dist[m] === Infinity) {
        dist[m] = dist[queue[q]] + 1
        queue.push(m)
      }

  /** N counted from C, one of its known neighbours: through another known neighbour of C. */
  const through = (c: number, k: number): number | null => {
    const side = next(c).get(k)
    const zc = z[c]
    if (side === undefined || zc === null) return null
    const others = [...next(c)].filter(([r]) => r !== k && z[r] !== null)
    const across = others.find(([r, s]) => s !== side && z[r] !== zc)
    if (across) return zc + (zc - z[across[0]]!)
    const beside = others.find(([, s]) => s === side)
    return beside ? z[beside[0]] : null
  }

  const order = queue.filter((k) => z[k] === null)
  for (const k of order) {
    // from the known neighbours nearer the given ones, the given and the file's first
    const rank = (c: number) => (from[c] === 'counted' ? 1 : 0)
    const parents = [...next(k).keys()].filter((c) => dist[c] < dist[k] && z[c] !== null).sort((a, b) => rank(a) - rank(b))
    for (const c of parents) {
      const v = through(c, k)
      if (v !== null) {
        z[k] = v
        from[k] = 'counted'
        break
      }
    }
  }

  // the least step between the heights there are (to the millimetre, so 0.1 + 0.2 reads as 0.3)
  const levels = [...new Set(z.flatMap((v) => (v === null ? [] : [Math.round(v * 1000) / 1000])))].sort((a, b) => a - b)
  const steps = levels.slice(1).map((v, i) => v - levels[i])
  const interval = steps.length ? Math.round(Math.min(...steps) * 1000) / 1000 : null
  return { z, from, interval }
}
