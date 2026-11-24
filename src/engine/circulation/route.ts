// Finding a road's way (Decision "Exterior circulation", 4.4): from a gate, a truck court or a part of the network to
// the nearest road, around the masses and inside the site. First straight ahead (a gate's lane, a court's mouth: the
// way a designer draws it); when that is blocked, the shortest way around the masses (a visibility graph over their
// corners, each mass as its minimum rectangle grown by half a road and a metre). A field may also keep the roads out
// of the truck courts' depth (their mouths stay open). Pure, small: tens of corners.
import type { Point, Polygon } from '../../model/schema.ts'
import { minimumRectangle } from '../geom/rectangle.ts'
import { bounds, distancePointSegment, pointInPolygon, type Bounds } from '../geom/polygon.ts'
import type { DerivedDock } from '../types.ts'

/** A segment a road can end on, and which road it belongs to. */
export interface Target {
  a: Point
  b: Point
  key: number
}

export interface Route {
  path: Point[]
  key: number // the target it reached
}

const sub = (p: Point, q: Point) => ({ x: p.x - q.x, y: p.y - q.y })
const dot = (p: Point, q: Point) => p.x * q.x + p.y * q.y
const len = (p: Point) => Math.hypot(p.x, p.y)

/** The point of segment a–b nearest to q. */
export function closestOnSegment(q: Point, a: Point, b: Point): Point {
  const d = sub(b, a)
  const l2 = dot(d, d)
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(q, a), d) / l2))
  return { x: a.x + d.x * t, y: a.y + d.y * t }
}

/** The distance between segments a–b and c–d (0 when they cross). */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (properCross(a, b, c, d)) return 0
  return Math.min(distancePointSegment(a, c, d), distancePointSegment(b, c, d), distancePointSegment(c, a, b), distancePointSegment(d, a, b))
}

const orient = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Do a–b and c–d cross at a point inside both (not at an end)? */
export function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(c, d, a)
  const d2 = orient(c, d, b)
  const d3 = orient(a, b, c)
  const d4 = orient(a, b, d)
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
}

/** Does segment p→q pass through the inside of a convex counter-clockwise polygon (Cyrus–Beck)? */
export function crossesConvex(p: Point, q: Point, poly: Polygon): boolean {
  const d = sub(q, p)
  let tIn = 0
  let tOut = 1
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const normal = { x: b.y - a.y, y: -(b.x - a.x) } // out of a counter-clockwise polygon
    const N = dot(normal, sub(p, a))
    const D = dot(normal, d)
    if (Math.abs(D) < 1e-12) {
      if (N > 0) return false // parallel and outside this edge
      continue
    }
    const t = -N / D
    if (D < 0) tIn = Math.max(tIn, t)
    else tOut = Math.min(tOut, t)
    if (tIn > tOut) return false
  }
  return (tOut - tIn) * len(d) > 1e-6
}

/** Does segment p→q stay inside the outline (no crossing of its edges, its middle inside)? */
export function insideOutline(p: Point, q: Point, outline: Polygon): boolean {
  for (let i = 0, n = outline.length; i < n; i++) if (properCross(p, q, outline[i], outline[(i + 1) % n])) return false
  return pointInPolygon({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, outline)
}

/** A mass as the roads see it: its minimum rectangle grown by `by` m on every side, counter-clockwise. */
export function obstacleOf(poly: Polygon, by: number): Polygon {
  const r = minimumRectangle(poly)
  const v = { x: -r.u.y, y: r.u.x }
  const hl = r.length / 2 + by
  const hw = r.width / 2 + by
  const at = (s: number, t: number) => ({ x: r.center.x + r.u.x * s + v.x * t, y: r.center.y + r.u.y * s + v.y * t })
  return [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw)]
}

/** The world a road finds its way in: the masses to go around (each grown) and the site to stay in. */
export interface Field {
  /** What a road may not cross (slightly smaller than `corners`' rectangles, so a corner's own sides are clear). */
  blocks: Polygon[]
  /** Each block's bounds: most segments are cleared by these alone. */
  boxes: Bounds[]
  /** The corners a road may turn at. */
  corners: Point[]
  outline: Polygon | null
}

/**
 * A truck court's depth as a road's centreline sees it: from 1 m inside its mouth to its wall, `by` m wider each side. It is the court's frame
 * (`court[0]`–`court[1]` on the wall's line, `court[3]` its far end): the wall's own where the court is a rectangle, and where its courts have shapes
 * (Phase D.3) the rectangle that holds them, which a road keeps out of as a whole.
 */
export function courtBlock(d: DerivedDock, by: number): Polygon {
  const [a, b] = [d.court[0], d.court[1]]
  const u = { x: b.x - a.x, y: b.y - a.y }
  const l = Math.hypot(u.x, u.y) || 1
  const e = { x: (u.x / l) * by, y: (u.y / l) * by }
  const depth = Math.max(0, Math.hypot(d.court[3].x - a.x, d.court[3].y - a.y) - 1)
  const o = { x: d.out.x * depth, y: d.out.y * depth }
  const quad = [
    { x: a.x - e.x, y: a.y - e.y },
    { x: b.x + e.x, y: b.y + e.y },
    { x: b.x + e.x + o.x, y: b.y + e.y + o.y },
    { x: a.x - e.x + o.x, y: a.y - e.y + o.y },
  ]
  // counter-clockwise, as crossesConvex wants it
  const s = (quad[1].x - quad[0].x) * (quad[2].y - quad[0].y) - (quad[1].y - quad[0].y) * (quad[2].x - quad[0].x)
  return s < 0 ? quad.reverse() : quad
}

/** The field around these masses (grown by half a road and `clear` m more) and, given, out of these truck courts. */
export function fieldOf(masses: Polygon[], roadWidth: number, outline: Polygon | null, clear = 1, courts: DerivedDock[] = []): Field {
  const grow = roadWidth / 2 + clear
  const shapes = masses.filter((m) => m.length >= 3)
  const blocks = [...shapes.map((m) => obstacleOf(m, grow - 0.05)), ...courts.map((d) => courtBlock(d, roadWidth / 2 - 0.05))]
  const corners = [...shapes.flatMap((m) => obstacleOf(m, grow)), ...courts.flatMap((d) => courtBlock(d, roadWidth / 2 + 0.5))].filter(
    (c) => (!outline || pointInPolygon(c, outline)) && !blocks.some((b) => pointInPolygon(c, b)),
  )
  return { blocks, boxes: blocks.map(bounds), corners, outline }
}

export function clear(f: Field, p: Point, q: Point): boolean {
  if (f.outline && !insideOutline(p, q, f.outline)) return false
  const [x0, x1] = p.x < q.x ? [p.x, q.x] : [q.x, p.x]
  const [y0, y1] = p.y < q.y ? [p.y, q.y] : [q.y, p.y]
  for (let i = 0; i < f.blocks.length; i++) {
    const b = f.boxes[i]
    if (b.maxX < x0 || b.minX > x1 || b.maxY < y0 || b.minY > y1) continue
    if (crossesConvex(p, q, f.blocks[i])) return false
  }
  return true
}

/** Straight ahead from p along unit `dir` to the first target, if the way is clear and within `max` m. */
export function straightRoute(f: Field, p: Point, dir: Point, targets: Target[], max = Infinity): Route | null {
  let best: { s: number; key: number } | null = null
  for (const t of targets) {
    const e = sub(t.b, t.a)
    const den = dir.x * e.y - dir.y * e.x
    if (Math.abs(den) < 1e-12) continue
    const s = ((t.a.x - p.x) * e.y - (t.a.y - p.y) * e.x) / den
    const r = ((t.a.x - p.x) * dir.y - (t.a.y - p.y) * dir.x) / den
    if (s >= 0 && s <= max && r >= -1e-9 && r <= 1 + 1e-9 && (!best || s < best.s)) best = { s, key: t.key }
  }
  if (!best) return null
  const end = { x: p.x + dir.x * best.s, y: p.y + dir.y * best.s }
  return best.s < 1e-6 || clear(f, p, end) ? { path: [p, end], key: best.key } : null
}

/** The shortest way from any source to any target around the field's masses (null: none). */
export function shortestRoute(f: Field, sources: Point[], targets: Target[]): Route | null {
  if (sources.length === 0 || targets.length === 0) return null
  const nodes = [...sources, ...f.corners]
  const n = nodes.length
  const dist = nodes.map((_, i) => (i < sources.length ? 0 : Infinity))
  const prev = nodes.map(() => -1)
  const done = nodes.map(() => false)
  let best: { cost: number; node: number; end: Point; key: number } | null = null
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || (best && dist[u] >= best.cost)) break
    done[u] = true
    const p = nodes[u]
    // the targets nearest first: the first clear one is this corner's best, the rest need no clearing
    const reach = targets
      .map((t) => {
        const c = closestOnSegment(p, t.a, t.b)
        return { t, c, cost: dist[u] + Math.hypot(c.x - p.x, c.y - p.y) }
      })
      .filter((x) => !best || x.cost < best.cost - 1e-9)
      .sort((x, y) => x.cost - y.cost)
    for (const x of reach)
      if (clear(f, p, x.c)) {
        best = { cost: x.cost, node: u, end: x.c, key: x.t.key }
        break
      }
    for (let v = 0; v < n; v++) {
      if (done[v]) continue
      const w = dist[u] + Math.hypot(nodes[v].x - p.x, nodes[v].y - p.y)
      if (w < dist[v] - 1e-9 && clear(f, p, nodes[v])) {
        dist[v] = w
        prev[v] = u
      }
    }
  }
  if (!best) return null
  const path: Point[] = [best.end]
  for (let i = best.node; i >= 0; i = prev[i]) path.unshift(nodes[i])
  // a path that starts and ends at the same point is no road
  return path.length >= 2 && Math.hypot(path[0].x - best.end.x, path[0].y - best.end.y) > 1e-6 ? { path, key: best.key } : null
}
