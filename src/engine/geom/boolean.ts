// Polygon booleans (intersection, difference, union) and offsets, on top of clipper2-js.
// Ported from Plaza-Practiko `app/src/motores/geom/booleanos.ts` (the subset massing needs).
//
// - Coordinates are scaled ×1e4 (0.1 mm) to integers: Clipper works on integers, which makes it robust.
// - Input: each operand is a list of rings; outer ring or hole is decided by nesting (see toPaths).
// - Output: a list of Regions. A Region is [outer counter-clockwise, ...holes clockwise].
//
// Note from the original: in clipper2-js 1.2.4 executePolyTree always fails, so we use execute (loose paths) and
// rebuild the nesting here. Clipper returns outer rings with positive area and holes with negative area.
import { ClipType, Clipper64, FillRule, Path64, Paths64 } from 'clipper2-js'
import type { Point, Polygon } from '../../model/schema.ts'
import { area, bounds, distancePointSegment, pointInPolygon, signedArea } from './polygon.ts'

/** [outer, ...holes]. */
export type Region = Polygon[]

const SCALE = 1e4

/** x lies inside y: every vertex of x inside y or on its edge, and x is smaller. */
function nested(x: Polygon, y: Polygon): boolean {
  if (area(x) >= area(y)) return false
  return x.every((q) => {
    if (pointInPolygon(q, y)) return true
    for (let i = 0; i < y.length; i++) if (distancePointSegment(q, y[i], y[(i + 1) % y.length]) <= 1e-6) return true
    return false
  })
}

/**
 * Orientation is decided by nesting within the same operand: a ring inside an odd number of other rings is a hole
 * (forced clockwise); otherwise it is an outer ring (forced counter-clockwise).
 */
function toPaths(rings: Polygon[]): Paths64 {
  const rs = rings.filter((r) => r.length >= 3)
  const ps = new Paths64()
  rs.forEach((ring, k) => {
    let level = 0
    rs.forEach((other, j) => {
      if (j !== k && nested(ring, other)) level++
    })
    const hole = level % 2 === 1
    const s = signedArea(ring)
    const ordered = (hole ? s > 0 : s < 0) ? ring.slice().reverse() : ring
    const p = new Path64()
    for (const q of ordered) p.push({ x: Math.round(q.x * SCALE), y: Math.round(q.y * SCALE) })
    ps.push(p)
  })
  return ps
}

function fromPath(p: Path64): Polygon {
  const ring: Point[] = []
  for (const q of p) {
    const last = ring[ring.length - 1]
    const x = q.x / SCALE
    const y = q.y / SCALE
    if (!last || last.x !== x || last.y !== y) ring.push({ x, y })
  }
  while (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y) ring.pop()
  return ring
}

/** The hole falls inside the outer ring: most of its vertices that are not on the outer edge are inside. */
function contains(outer: Polygon, hole: Polygon): boolean {
  let inside = 0
  let outside = 0
  for (const q of hole) {
    let onEdge = false
    for (let i = 0; i < outer.length && !onEdge; i++)
      onEdge = distancePointSegment(q, outer[i], outer[(i + 1) % outer.length]) <= 1e-7
    if (onEdge) continue
    if (pointInPolygon(q, outer)) inside++
    else outside++
  }
  return inside >= outside
}

/** Loose Clipper paths → Regions: each hole goes with the smallest outer ring that contains it. */
function regionsOf(sol: Paths64): Region[] {
  const outers: { ring: Polygon; area: number; holes: Polygon[] }[] = []
  const holes: { ring: Polygon; area: number }[] = []
  for (const p of sol) {
    const ring = fromPath(p)
    if (ring.length < 3) continue
    const s = signedArea(ring)
    if (s > 0) outers.push({ ring, area: s, holes: [] })
    else if (s < 0) holes.push({ ring, area: -s })
  }
  for (const h of holes) {
    let best: (typeof outers)[number] | null = null
    for (const e of outers)
      if (e.area > h.area && (!best || e.area < best.area) && contains(e.ring, h.ring)) best = e
    if (!best) {
      // No outer ring contains it: the smallest whose box covers it (a lost hole would add area).
      const c = bounds(h.ring)
      for (const e of outers) {
        const k = bounds(e.ring)
        const covers =
          k.minX <= c.minX + 1e-7 && k.minY <= c.minY + 1e-7 && k.maxX >= c.maxX - 1e-7 && k.maxY >= c.maxY - 1e-7
        if (e.area > h.area && covers && (!best || e.area < best.area)) best = e
      }
    }
    best?.holes.push(h.ring)
  }
  return outers.map((e) => [e.ring, ...e.holes])
}

function run(type: ClipType, a: Polygon[], b: Polygon[]): Region[] {
  const c = new Clipper64()
  c.addSubjectPaths(toPaths(a))
  c.addClipPaths(toPaths(b))
  const sol = new Paths64()
  c.execute(type, FillRule.NonZero, sol)
  return regionsOf(sol)
}

export function intersection(a: Polygon[], b: Polygon[]): Region[] {
  return run(ClipType.Intersection, a, b)
}

export function difference(a: Polygon[], b: Polygon[]): Region[] {
  return run(ClipType.Difference, a, b)
}

export function union(a: Polygon[], b: Polygon[]): Region[] {
  return run(ClipType.Union, a, b)
}

/**
 * Rings offset `d` m outwards from the region (negative = inwards).
 * - Outwards: each edge moves along its normal, mitred corners (bevelled when the mitre would pass 2·d); the loops
 *   that flip are removed with a positive-fill union. Not Clipper's InflatePaths: in 1.2.4 it misplaces vertices.
 * - Inwards: delegated to `inset`. Moving edges inwards breaks when the shape vanishes (a 10 m square inset 6 m
 *   flips into a 2 m square instead of disappearing), which would show a false buildable area on narrow sites.
 */
export function offset(rings: Polygon[], d: number): Region[] {
  if (d < 0) return inset(rings, -d)
  const dd = d * SCALE
  const raw = new Paths64()
  for (const path of toPaths(rings)) {
    // With outer rings counter-clockwise and holes clockwise, the right-hand normal of each edge points out.
    const p = path.filter((q, i) => {
      const r = path[(i + 1) % path.length]
      return q.x !== r.x || q.y !== r.y
    })
    const n = p.length
    if (n < 3) continue
    const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
    }
    const q = new Path64()
    for (let i = 0; i < n; i++) {
      const b = p[i]
      const n1 = normal(p[(i - 1 + n) % n], b)
      const n2 = normal(b, p[(i + 1) % n])
      const k = 1 + n1.x * n2.x + n1.y * n2.y
      if (k < 0.5) {
        q.push({ x: Math.round(b.x + dd * n1.x), y: Math.round(b.y + dd * n1.y) })
        q.push({ x: Math.round(b.x + dd * n2.x), y: Math.round(b.y + dd * n2.y) })
      } else {
        q.push({ x: Math.round(b.x + (dd * (n1.x + n2.x)) / k), y: Math.round(b.y + (dd * (n1.y + n2.y)) / k) })
      }
    }
    raw.push(q)
  }
  const c = new Clipper64()
  c.addSubjectPaths(raw)
  const sol = new Paths64()
  c.execute(ClipType.Union, FillRule.Positive, sol)
  return regionsOf(sol)
}

/** Sides of the polygon that replaces the disk at a concave corner (circumscribed, so it never cuts less than d). */
const CORNER_SIDES = 32

/**
 * The region shrunk `d` m inwards: everything closer than `d` to its boundary is removed.
 * Instead of moving edges, it subtracts "strips": a 2d-wide rectangle along every edge, and a disk at every concave
 * corner (convex corners are already covered by the two rectangles, which leaves the sharp mitred corner).
 * Booleans never flip, so a part that is too narrow simply disappears. Technique from Plaza-Practiko `restarTiras`.
 */
export function inset(rings: Polygon[], d: number): Region[] {
  if (d <= 0) return union(rings, [])
  const rs = rings.filter((r) => r.length >= 3)
  const strips: Polygon[] = []
  const R = d / Math.cos(Math.PI / CORNER_SIDES)
  rs.forEach((ring, k) => {
    const hole = rs.filter((other, j) => j !== k && nested(ring, other)).length % 2 === 1
    const orientation = Math.sign(signedArea(ring))
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % n]
      const l = Math.hypot(b.x - a.x, b.y - a.y)
      if (l <= 1e-9) continue
      const nx = (-(b.y - a.y) / l) * d
      const ny = ((b.x - a.x) / l) * d
      strips.push([
        { x: a.x - nx, y: a.y - ny },
        { x: b.x - nx, y: b.y - ny },
        { x: b.x + nx, y: b.y + ny },
        { x: a.x + nx, y: a.y + ny },
      ])
      // Corner at b: turn sign against the ring's orientation tells convex from concave (inverted for holes).
      const c = ring[(i + 2) % n]
      const turn = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
      const concave = turn !== 0 && (hole ? turn === orientation : turn !== orientation)
      if (concave)
        strips.push(
          Array.from({ length: CORNER_SIDES }, (_, s) => {
            const t = (2 * Math.PI * s) / CORNER_SIDES
            return { x: b.x + R * Math.cos(t), y: b.y + R * Math.sin(t) }
          }),
        )
    }
  })
  return subtractStrips(rs, strips)
}

/**
 * Every ring an outer ring (forced counter-clockwise), skipping toPaths' nesting: a piece inside another must not
 * become a hole and cancel it, and pieces are never compared with each other, so the cost stays linear.
 */
function outerPaths(rings: Polygon[]): Paths64 {
  const ps = new Paths64()
  for (const t of rings) {
    if (t.length < 3) continue
    const ordered = signedArea(t) < 0 ? t.slice().reverse() : t
    const p = new Path64()
    for (const q of ordered) p.push({ x: Math.round(q.x * SCALE), y: Math.round(q.y * SCALE) })
    ps.push(p)
  }
  return ps
}

/** `a` minus the union of the strips (each an outer ring, outerPaths). */
function subtractStrips(a: Polygon[], strips: Polygon[]): Region[] {
  const c = new Clipper64()
  c.addSubjectPaths(toPaths(a))
  c.addClipPaths(outerPaths(strips))
  const sol = new Paths64()
  c.execute(ClipType.Difference, FillRule.NonZero, sol)
  return regionsOf(sol)
}

/**
 * The union of pieces that may lie inside one another (a road's strips, a court on a street): each an outer ring, as
 * subtractStrips feeds its strips, where `union` would read a piece inside another as a hole. The vertices where the
 * outline runs straight on are dropped: kept, they shorten the edges a curb return is cut to (fillet.ts), and
 * clipper2-js 1.2.4 then also keeps zero-width spikes where pieces share an edge's end (it compares points by
 * reference).
 */
export function unionPieces(pieces: Polygon[]): Region[] {
  const c = new Clipper64()
  c.preserveCollinear = false
  c.addSubjectPaths(outerPaths(pieces))
  const sol = new Paths64()
  c.execute(ClipType.Union, FillRule.NonZero, sol)
  return regionsOf(sol)
}

/** Sum of areas: outer rings minus holes. */
export function regionsArea(rs: Region[]): number {
  let s = 0
  for (const [outer, ...holes] of rs) {
    if (!outer) continue
    s += area(outer)
    for (const h of holes) s -= area(h)
  }
  return s
}
