// An option's streets built on a working copy (Decision "Streets"): nodes found or made, segments split and added, the
// network kept whole (a node on another is that node, on a segment a T, two segments that cross an X). The streets'
// verbs build on it (state/actions/streets.ts), and so does the migration that draws an old project's derived roads
// as streets (legacy/toStreets.ts). Pure.
import type { Id, Point, Project, StreetNode, StreetSegment, Streets } from '../../model/schema.ts'
import { closestOnSegment } from './route.ts'
import { endOn, JOIN } from '../path/ends.ts'

export { JOIN }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const ids = (p: Project, f: (s: Streets) => { id: Id }[]) => p.options.flatMap((o) => (o.streets ? f(o.streets) : [])).map((x) => x.id)

/** `<prefix><n>`, the first n not taken. */
function freshId(prefix: string, taken: Iterable<Id>): Id {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/** Without the nodes no segment touches. */
export function tidy(s: Streets): Streets {
  const used = new Set(s.segments.flatMap((g) => [g.a, g.b]))
  return { nodes: s.nodes.filter((n) => used.has(n.id)), segments: s.segments }
}

/** Builds streets on a working copy: nodes found or made, segments split and added, ids unique across the project. */
export class Draft {
  nodes: StreetNode[]
  segments: StreetSegment[]
  private takenNodes: Id[]
  private takenSegments: Id[]
  constructor(p: Project, s: Streets) {
    this.nodes = [...s.nodes]
    this.segments = [...s.segments]
    this.takenNodes = ids(p, (x) => x.nodes)
    this.takenSegments = ids(p, (x) => x.segments)
  }
  private nodeId() {
    const id = freshId('n', [...this.takenNodes, ...this.nodes.map((n) => n.id)])
    this.takenNodes.push(id)
    return id
  }
  private segmentId() {
    const id = freshId('s', [...this.takenSegments, ...this.segments.map((g) => g.id)])
    this.takenSegments.push(id)
    return id
  }
  at(id: Id): Point {
    const n = this.nodes.find((x) => x.id === id)!
    return { x: n.x, y: n.y }
  }
  /** The segment `segId` split at `q` (on it): its two halves keep its type, width and lanes (each its own array); the new node's id. */
  split(segId: Id, q: Point): Id {
    const g = this.segments.find((x) => x.id === segId)!
    const id = this.nodeId()
    this.nodes.push({ id, x: q.x, y: q.y })
    const second: StreetSegment = { ...g, id: this.segmentId(), a: id, ...(g.lanes ? { lanes: [...g.lanes] } : {}) }
    this.segments = this.segments.flatMap((x) => (x.id === segId ? [{ ...g, b: id }, second] : [x]))
    return id
  }
  /** Whether q is on a node or on a segment's drawn line (within `JOIN`): `node(q)` joins it there. */
  touches(q: Point): boolean {
    return this.nodes.some((n) => dist(n, q) <= JOIN) || this.segments.some((g) => dist(closestOnSegment(q, this.at(g.a), this.at(g.b)), q) <= JOIN)
  }
  /** The node `id` linked to the existing street `road` (Decision "Street links"). */
  link(id: Id, road: Id) {
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, road } : n))
  }
  /** The node at q: one there, else a new one, splitting the segment q lies on. */
  node(q: Point): Id {
    const near = this.nodes.find((n) => dist(n, q) <= JOIN)
    if (near) return near.id
    for (const g of this.segments) {
      const c = closestOnSegment(q, this.at(g.a), this.at(g.b))
      if (dist(c, q) <= JOIN) return this.split(g.id, c)
    }
    const id = this.nodeId()
    this.nodes.push({ id, x: q.x, y: q.y })
    return id
  }
  /**
   * A street end at q on another street's paving (Decision "Streets stay connected"): the node at q's nearest point on
   * the drawn line of the segment whose paving holds q (the segment split there, a T; that segment's node when the
   * point is its end). Null when no paving holds q, or when q is on a node or a drawn line already (`node(q)` joins it
   * there). The paving is the segment's strip as `streetRoads` draws it: its `left` and `right` each side of its drawn line
   * (Decision "Drawing side"), so past a free tip it reaches half a width beyond the end of the centre line, round it. Segments in `skip` (a dragged
   * end's own run and the segments moved with it) and their nodes are not looked at.
   */
  onPaving(q: Point, skip: ReadonlySet<Id> = new Set()): Id | null {
    const segs = this.segments.filter((g) => !skip.has(g.id))
    // each segment a path of one stretch, its sides as the segment draws them (Decision "Drawing side")
    const paths = segs.map((g) => {
      return { points: [this.at(g.a), this.at(g.b)], stretches: [{ left: g.left, right: g.right }] }
    })
    const hit = endOn(q, paths)
    if (!hit || hit.on === 'node') return null
    const g = segs[hit.path]
    const c = hit.at
    if (dist(c, q) <= JOIN) return null
    if (dist(c, this.at(g.a)) <= JOIN) return g.a
    if (dist(c, this.at(g.b)) <= JOIN) return g.b
    return this.split(g.id, c)
  }
  /** A segment from a to b of a type, its paving `left` and `right` of its drawn line (and its own vehicles, radius and stored lanes), unless one joins them already. */
  join(a: Id, b: Id, type: Id, own: Pick<StreetSegment, 'left' | 'right'> & Pick<StreetSegment, 'vehicles' | 'radius' | 'lanes'>): Id | null {
    if (a === b || this.segments.some((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a))) return null
    const id = this.segmentId()
    this.segments.push({ id, a, b, type, ...own })
    return id
  }
  /** Segment `segId` through node `nodeId` (on it): two segments, its type and width; the second half as hot as it. */
  private through(segId: Id, nodeId: Id, hot: Set<Id> | null) {
    const g = this.segments.find((x) => x.id === segId)!
    const second: StreetSegment = { ...g, id: this.segmentId(), a: nodeId }
    this.segments = this.segments.flatMap((x) => (x.id === segId ? [{ ...g, b: nodeId }, second] : [x]))
    if (hot?.has(segId)) hot.add(second.id)
  }
  /** Without segments from a node to itself, and without a second segment between the same two nodes. */
  private clean() {
    const seen = new Set<string>()
    this.segments = this.segments.filter((g) => {
      const key = g.a < g.b ? `${g.a} ${g.b}` : `${g.b} ${g.a}`
      if (g.a === g.b || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  /**
   * The network made whole after an edit (the user: "a sketch-like tool"): a node on another is that node (the one
   * not `moved` stays), a node on a segment splits it (a T), two segments that cross meet at a node there (an X).
   * Only where the edit was: the segments `touched` (null: all) and those at the nodes `moved` or joined, so a large
   * network is not searched whole on every drag step (the stress test: 40 streets at random).
   */
  knit(moved: Set<Id> = new Set(), touched: Set<Id> | null = null) {
    const order = [...this.nodes.filter((n) => !moved.has(n.id)), ...this.nodes.filter((n) => moved.has(n.id))]
    const into = new Map<Id, Id>()
    order.forEach((n, i) => {
      if (into.has(n.id)) return
      for (const m of order.slice(i + 1)) if (!into.has(m.id) && dist(n, m) <= JOIN) into.set(m.id, n.id)
    })
    const hot = touched && new Set(touched)
    if (hot) for (const g of this.segments) if ([g.a, g.b].some((n) => moved.has(n) || into.has(n))) hot.add(g.id)
    if (into.size) {
      this.nodes = this.nodes.filter((n) => !into.has(n.id))
      this.segments = this.segments.map((g) => ({ ...g, a: into.get(g.a) ?? g.a, b: into.get(g.b) ?? g.b }))
    }
    this.clean()
    // each pass mends one meeting, until there is none (bounded, so it always ends)
    for (let pass = 0; pass < 10_000; pass++) {
      const mend = this.meeting(hot)
      if (!mend) break
      mend()
      this.clean()
    }
  }
  /** One place where a hot segment (or its node) meets the network without a node: a node on a segment, a crossing. */
  private meeting(hot: Set<Id> | null): (() => void) | null {
    const at = new Map(this.nodes.map((n) => [n.id, n]))
    const isHot = (g: StreetSegment) => hot === null || hot.has(g.id)
    const hotSegs = this.segments.filter(isHot)
    const hotNodes = hot && new Set(hotSegs.flatMap((g) => [g.a, g.b]))
    const box = (g: StreetSegment) => {
      const a = at.get(g.a)!
      const b = at.get(g.b)!
      return { minX: Math.min(a.x, b.x) - JOIN, maxX: Math.max(a.x, b.x) + JOIN, minY: Math.min(a.y, b.y) - JOIN, maxY: Math.max(a.y, b.y) + JOIN }
    }
    for (const g of this.segments) {
      const k = box(g)
      for (const n of this.nodes) {
        if (g.a === n.id || g.b === n.id || (!isHot(g) && !hotNodes?.has(n.id))) continue
        if (n.x < k.minX || n.x > k.maxX || n.y < k.minY || n.y > k.maxY) continue
        const a = at.get(g.a)!
        const b = at.get(g.b)!
        if (dist(closestOnSegment(n, a, b), n) <= JOIN && dist(n, a) > JOIN && dist(n, b) > JOIN) return () => this.through(g.id, n.id, hot)
      }
    }
    for (const g of hotSegs) {
      const k = box(g)
      for (const h of this.segments) {
        if (h === g || g.a === h.a || g.a === h.b || g.b === h.a || g.b === h.b) continue
        const l = box(h)
        if (l.minX > k.maxX || l.maxX < k.minX || l.minY > k.maxY || l.maxY < k.minY) continue
        const q = crossing(at.get(g.a)!, at.get(g.b)!, at.get(h.a)!, at.get(h.b)!)
        if (q)
          return () => {
            const id = this.nodeId()
            this.nodes.push({ id, ...q })
            this.through(g.id, id, hot)
            this.through(h.id, id, hot)
          }
      }
    }
    return null
  }
  done(): Streets {
    return tidy({ nodes: this.nodes, segments: this.segments })
  }
}

/** Where segments ab and cd cross, away from their ends (more than JOIN); null when they do not (or run parallel). */
function crossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const den = r.x * s.y - r.y * s.x
  if (Math.abs(den) < 1e-12) return null
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
  const lr = Math.hypot(r.x, r.y)
  const ls = Math.hypot(s.x, s.y)
  if (t * lr <= JOIN || (1 - t) * lr <= JOIN || u * ls <= JOIN || (1 - u) * ls <= JOIN) return null
  return { x: a.x + t * r.x, y: a.y + t * r.y }
}
