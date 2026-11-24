// A contour cut by a line (Phase D.3, task 2, Decision "Split by a line"): the pieces of it on either side of the infinite line a–b, each
// counter-clockwise. Pure geometry, no store: the shape engine's `split` op (`shapeOp.ts`) and the truck court's engine use it.
// - A corner's radius or chamfer the line misses is kept on its piece, whole. One the line cuts is made into what it is drawn as (two
//   corners and the edge between them, an arc or a straight cut), and the line cuts that edge like any other.
// - An arc the line cuts is cut at the point the line meets it, and each part keeps its centre and its radius (a new bulge on the same circle).
// - `from`, for each edge of a piece: the edge of the contour it came from, null for the edge the cut made (and for a corner's radius or
//   chamfer a cut turned into edges: they were no edge of the contour).
// - A point of the contour on the line counts as on its left. So a line along a wall, or one that only touches a corner, cuts nothing; one that
//   runs along a wall and through the shape beyond it cuts as if it ran a hair to the right. A piece under a square millimetre is no piece.
// - The pieces come in the order of the first crossing each starts at, along the line from a to b.
import type { Contour, Point, Vertex } from '../../model/schema.ts'
import { arcOfEdge, bulgeAt, effectiveSetbacks, rawPolygon, setbacks, tangentLength, turnAt, withBulges } from './contour.ts'
import { EPS, signedArea } from './polygon.ts'

/** One piece of a split contour, and where each of its edges came from. */
export interface SplitPiece {
  contour: Contour
  /** For each edge of `contour` (edge i runs from corner i to corner i + 1): the edge it came from, null when the cut made it. */
  from: (number | null)[]
}

/** What `splitByLine` answers: every piece (the contour itself, whole, when the line does not cross it), and whether it was cut. */
export interface SplitResult {
  pieces: SplitPiece[]
  cut: boolean
}

/** m: a point this near the line is on it. */
const ON_LINE = 1e-7
/** m: two points this near are one. */
const SAME = 1e-7
/** m²: a piece smaller than this is a sliver the line only grazed. */
const MIN_AREA = 1e-6
const TAU = 2 * Math.PI

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const mod = (x: number, m: number) => ((x % m) + m) % m

/** A contour's edges and corners as a cycle: corner k, then edge k to corner k + 1 (its bulge and where it came from). */
interface Cycle {
  vertices: Vertex[]
  bulges: number[]
  from: (number | null)[]
}

/** One step of the walk round the boundary: a point, the corner there (none for a point the cut made), and the edge that leaves it. */
interface Node {
  p: Point
  vertex?: Vertex
  cross: boolean
  bulge: number
  from: number | null
}

export function splitByLine(c: Contour, a: Point, b: Point): SplitResult {
  const whole: SplitResult = { pieces: [{ contour: c, from: c.vertices.map((_, i) => i) }], cut: false }
  const len = dist(a, b)
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || len <= EPS) return whole
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  /** m: how far p is to the left of the line a → b (negative: to the right). */
  const d = (p: Point) => u.x * (p.y - a.y) - u.y * (p.x - a.x)
  /** m along the line from a. */
  const along = (p: Point) => u.x * (p.x - a.x) + u.y * (p.y - a.y)
  const side = (x: number): 1 | -1 => (x >= -ON_LINE ? 1 : -1)
  const touches = (p: Point, q: Point) => Math.min(d(p), d(q)) <= ON_LINE && Math.max(d(p), d(q)) >= -ON_LINE

  const cycle = explode(c, touches)
  const nodes = walkable(cycle, d, Math.atan2(u.y, u.x), side)
  const crossings = nodes.map((n, i) => (n.cross ? i : -1)).filter((i) => i >= 0)
  // an odd number of crossings is a contour that crosses itself: nothing to cut
  if (crossings.length < 2 || crossings.length % 2 !== 0) return whole
  const order = [...crossings].sort((i, j) => along(nodes[i].p) - along(nodes[j].p) || i - j)
  // inside the shape, the line runs from the 1st crossing to the 2nd, from the 3rd to the 4th…
  const partner = new Map<number, number>()
  for (let k = 0; k < order.length; k += 2) {
    partner.set(order[k], order[k + 1])
    partner.set(order[k + 1], order[k])
  }

  const pieces: SplitPiece[] = []
  const used = new Set<number>()
  for (const start of order) {
    if (used.has(start)) continue
    const piece: Node[] = []
    let cur = start
    for (let guard = 0; guard <= nodes.length; guard++) {
      used.add(cur)
      // along the boundary from a crossing to the next, then along the cut to where the line leaves the shape again
      piece.push({ ...nodes[cur], vertex: undefined })
      let k = (cur + 1) % nodes.length
      while (!nodes[k].cross) {
        piece.push(nodes[k])
        k = (k + 1) % nodes.length
      }
      piece.push({ p: nodes[k].p, cross: true, bulge: 0, from: null })
      cur = partner.get(k)!
      if (cur === start) break
    }
    if (cur !== start) return whole
    const made = tidy(piece)
    if (made && signedArea(rawPolygon(made.contour)) >= MIN_AREA) pieces.push(made)
  }
  return pieces.length < 2 ? whole : { pieces, cut: true }
}

/**
 * The contour as a cycle, with each corner the line cuts through made into what it is drawn as: its two ends and the edge between them,
 * an arc for a radius, a straight cut for a chamfer. A corner the line misses stays a corner, radius or chamfer and all, unless its
 * neighbour was made into edges and its set-backs had been scaled to share a wall with that one's (it would be drawn another way).
 */
function explode(c: Contour, touches: (p: Point, q: Point) => boolean): Cycle {
  const v = c.vertices
  const n = v.length
  const { inn, out } = effectiveSetbacks(c)
  const raw = v.map((_, i) => setbacks(c, i))
  const ends = (i: number): [Point, Point] => {
    const prev = v[(i + n - 1) % n]
    const next = v[(i + 1) % n]
    const lin = dist(prev, v[i])
    const lout = dist(v[i], next)
    return [
      { x: v[i].x - ((v[i].x - prev.x) / lin) * inn[i], y: v[i].y - ((v[i].y - prev.y) / lin) * inn[i] },
      { x: v[i].x + ((next.x - v[i].x) / lout) * out[i], y: v[i].y + ((next.y - v[i].y) / lout) * out[i] },
    ]
  }
  const has = (i: number) => raw[i][0] > EPS || raw[i][1] > EPS
  const hit = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (!has(i)) continue
    const [p1, p2] = ends(i)
    if (touches(p1, v[i]) || touches(v[i], p2)) hit.add(i)
  }
  for (let again = true; again; ) {
    again = false
    for (let i = 0; i < n; i++) {
      if (hit.has(i) || !has(i)) continue
      const scaled = inn[i] < raw[i][0] - 1e-9 || out[i] < raw[i][1] - 1e-9
      if (scaled && (hit.has((i + 1) % n) || hit.has((i + n - 1) % n))) {
        hit.add(i)
        again = true
      }
    }
  }
  const result: Cycle = { vertices: [], bulges: [], from: [] }
  for (let i = 0; i < n; i++) {
    if (!hit.has(i)) {
      result.vertices.push({ ...v[i] })
    } else {
      const [p1, p2] = ends(i)
      result.vertices.push({ x: p1.x, y: p1.y, r: 0 })
      // the corner's own edge: a radius is an arc of the circle tangent to both walls (bulge −tan(turn / 4)), a chamfer a straight cut
      result.bulges.push(tangentLength(c, i) > EPS ? -Math.tan(turnAt(c, i) / 4) : 0)
      result.from.push(null)
      result.vertices.push({ x: p2.x, y: p2.y, r: 0 })
    }
    result.bulges.push(bulgeAt(c, i))
    result.from.push(i)
  }
  return result
}

/**
 * The cycle as nodes, with a node where the line crosses an edge. A point on the line counts as on its left, so what crosses is where an
 * edge goes from the left to the right of it, or back; a crossing at an edge's end is a node there, on top of the corner.
 */
function walkable(cy: Cycle, d: (p: Point) => number, angle: number, side: (x: number) => 1 | -1): Node[] {
  const nodes: Node[] = []
  const m = cy.vertices.length
  for (let k = 0; k < m; k++) {
    const A = cy.vertices[k]
    const B = cy.vertices[(k + 1) % m]
    const b = cy.bulges[k]
    const f = cy.from[k]
    const sa = side(d(A))
    const sb = side(d(B))
    if (b === 0) {
      if (sa === sb) {
        nodes.push({ p: A, vertex: cy.vertices[k], cross: false, bulge: 0, from: f })
        continue
      }
      const da = d(A)
      const db = d(B)
      const t = Math.max(0, Math.min(1, da / (da - db)))
      nodes.push({ p: A, vertex: cy.vertices[k], cross: false, bulge: 0, from: f })
      nodes.push({ p: { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }, cross: true, bulge: 0, from: f })
      continue
    }
    // an arc: the line meets its circle in 0, 1 or 2 points, and the side tells which of those it crosses at
    const { center, radius, sweep } = arcOfEdge(A, B, b)
    const a0 = Math.atan2(A.y - center.y, A.x - center.x)
    const at = (s: number): Point => ({ x: center.x + radius * Math.cos(a0 + sweep * s), y: center.y + radius * Math.sin(a0 + sweep * s) })
    // d(centre + R(cos θ, sin θ)) = d(centre) + R sin(θ − angle of the line)
    const kk = -d(center) / radius
    const roots: number[] = []
    if (Math.abs(kk) < 1 - 1e-9) {
      for (const th of [angle + Math.asin(kk), angle + Math.PI - Math.asin(kk)]) {
        const s = (sweep >= 0 ? mod(th - a0, TAU) : mod(a0 - th, TAU)) / Math.abs(sweep)
        if (s > -1e-9 && s < 1 + 1e-9) roots.push(Math.max(0, Math.min(1, s)))
      }
    }
    roots.sort((x, y) => x - y)
    const pts = [0, ...roots.filter((s, i) => i === 0 || s - roots[i - 1] > 1e-9), 1]
    // the side along each stretch between two such points, from the corner's own side to the next corner's
    const states: (1 | -1)[] = [sa]
    for (let j = 0; j + 1 < pts.length; j++) states.push(side(d(at((pts[j] + pts[j + 1]) / 2))))
    states.push(sb)
    const cuts: number[] = []
    for (let j = 0; j + 1 < states.length; j++) if (states[j] !== states[j + 1]) cuts.push(pts[j])
    const sub = (s0: number, s1: number) => (s1 - s0 < 1e-12 ? 0 : -Math.tan((sweep * (s1 - s0)) / 4))
    nodes.push({ p: A, vertex: cy.vertices[k], cross: false, bulge: cuts.length > 0 ? sub(0, cuts[0]) : b, from: f })
    cuts.forEach((s, j) => nodes.push({ p: at(s), cross: true, bulge: sub(s, j + 1 < cuts.length ? cuts[j + 1] : 1), from: f }))
  }
  return nodes
}

/** A piece's nodes as a contour: points that sit on one another become one (it keeps the corner's radius or chamfer), and so do its edges. */
function tidy(piece: Node[]): SplitPiece | null {
  const list = piece.map((n) => ({ ...n }))
  for (let i = 0; i < list.length && list.length > 3; ) {
    const j = (i + 1) % list.length
    if (dist(list[i].p, list[j].p) < SAME) {
      // the edge between them has no length: it goes, and the corner it leaves is the one that is still there
      if (list[i].vertex && !list[j].vertex) list[j].vertex = list[i].vertex
      list.splice(i, 1)
      i = 0
    } else i++
  }
  if (list.length < 3) return null
  const vertices = list.map((n) => ({ x: n.p.x, y: n.p.y, r: n.vertex?.r ?? 0, ...(n.vertex?.chamfer && { chamfer: n.vertex.chamfer }) }))
  return { contour: withBulges(vertices, list.map((n) => n.bulge)), from: list.map((n) => n.from) }
}
