// Plane geometry in meters on clipper2-js (integer coordinates at 1 mm).
// A Shape is a flat list of rings: outers counter-clockwise, holes clockwise (spec §6.1).
// clipper2-js 1.2.4's PolyTree is broken (see Plaza-Practiko booleanos.ts), so booleans return flat paths and the
// orientation carries outer/hole.
import { ClipType, Clipper, Clipper64, EndType, FillRule, JoinType, Path64, Paths64 } from 'clipper2-js'
import type { Pt, Ring } from '../host/protocol.ts'

export type { Pt, Ring }
export type Shape = Ring[]

const S = 1000

export function signedArea(r: Ring): number {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Net area: outers add, holes subtract. */
export function area(s: Shape): number {
  return s.reduce((t, r) => t + signedArea(r), 0)
}

export function centroid(r: Ring): Pt {
  const a = signedArea(r)
  if (Math.abs(a) < 1e-12) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
  let cx = 0, cy = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], f = p[0] * q[1] - q[0] * p[1]
    cx += (p[0] + q[0]) * f
    cy += (p[1] + q[1]) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

function inRing(pt: Pt, r: Ring): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j]
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

/** Orients loose rings by nesting: a ring inside an odd number of others is a hole (clockwise), else an outer. */
export function toShape(rings: Ring[]): Shape {
  const rs = rings.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-9)
  return rs.map((r, k) => {
    const depth = rs.filter((o, j) => j !== k && Math.abs(signedArea(o)) > Math.abs(signedArea(r)) && inRing(r[0], o)).length
    const hole = depth % 2 === 1, a = signedArea(r)
    return (hole ? a > 0 : a < 0) ? r.slice().reverse() : r.slice()
  })
}

// repeated vertices (after rounding to mm) make clipper2-js 1.2.4 return nothing for a whole union: drop them
function toPaths(s: Shape): Paths64 {
  const ps = new Paths64()
  for (const r of s) {
    const p = new Path64()
    for (const q of r) {
      const x = Math.round(q[0] * S), y = Math.round(q[1] * S), l = p[p.length - 1]
      if (!l || l.x !== x || l.y !== y) p.push({ x, y })
    }
    while (p.length > 1 && p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y) p.pop()
    ps.push(p)
  }
  return ps
}

function fromPaths(ps: Paths64): Shape {
  const out: Shape = []
  for (const p of ps) {
    const r: Ring = []
    for (const q of p) r.push([q.x / S, q.y / S])
    if (r.length >= 3 && Math.abs(signedArea(r)) > 1e-6) out.push(r)
  }
  // Clipper keeps outers and holes opposite; make the outers counter-clockwise.
  const big = out.reduce<Ring | null>((m, r) => (!m || Math.abs(signedArea(r)) > Math.abs(signedArea(m)) ? r : m), null)
  return big && signedArea(big) < 0 ? out.map((r) => r.slice().reverse()) : out
}

/**
 * Positive d grows, negative d shrinks, mitred corners (bevelled past 2·|d|); a shape that collapses comes back
 * as []. Not InflatePaths: in clipper2-js 1.2.4 it returns misplaced vertices for closed paths (a 10 × 10 square
 * offset −1 m comes back twisted). Each edge moves along its outward normal (to the right of an outer CCW / hole
 * CW edge) and loops that invert are dropped by a Positive-fill union — Plaza-Practiko's `desplazar`.
 */
export function offset(s: Shape, d: number): Shape {
  if (!s.length) return []
  const dd = d * S
  const raw = new Paths64()
  for (const ring of toPaths(s)) {
    const p = ring.filter((q, i) => { const r = ring[(i + 1) % ring.length]; return q.x !== r.x || q.y !== r.y })
    const n = p.length
    if (n < 3) continue
    const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }
    }
    const q = new Path64()
    for (let i = 0; i < n; i++) {
      const b = p[i], n1 = normal(p[(i - 1 + n) % n], b), n2 = normal(b, p[(i + 1) % n])
      const k = 1 + n1.x * n2.x + n1.y * n2.y
      if (k < 0.5) {
        q.push({ x: Math.round(b.x + dd * n1.x), y: Math.round(b.y + dd * n1.y) })
        q.push({ x: Math.round(b.x + dd * n2.x), y: Math.round(b.y + dd * n2.y) })
      } else q.push({ x: Math.round(b.x + (dd * (n1.x + n2.x)) / k), y: Math.round(b.y + (dd * (n1.y + n2.y)) / k) })
    }
    raw.push(q)
  }
  const c = new Clipper64()
  c.addSubjectPaths(raw)
  const sol = new Paths64()
  c.execute(ClipType.Union, FillRule.Positive, sol)
  // A shape that collapses can turn inside out and keep its orientation (a square past its middle is the same
  // square rotated 180°), so Positive fill keeps it. A true offset is |d| from the original boundary everywhere.
  const edges: [Pt, Pt][] = s.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt]))
  const far = (r: Ring) => r.every((p) => Math.min(...edges.map(([a, b]) => segDist(p, a, b))) >= Math.abs(d) - 2e-3)
  return fromPaths(sol).filter(far)
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** non-zero winding: the fill Clipper uses (rings whose box misses p are skipped) */
function filled(s: Shape, p: Pt): boolean {
  let w = 0
  for (const r of s) {
    let y0 = Infinity, y1 = -Infinity, x1 = -Infinity
    for (const q of r) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; if (q[0] > x1) x1 = q[0] }
    if (p[1] < y0 || p[1] > y1 || p[0] > x1) continue
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[j], b = r[i]
      if (a[1] <= p[1]) { if (b[1] > p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) > 0) w++ }
      else if (b[1] <= p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) < 0) w--
    }
  }
  return w !== 0
}

/** 3 mm to the filled side (left: outers CCW, holes CW) of every edge of 2 cm or more */
function probes(r: Ring): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L >= 0.02) out.push([(a[0] + b[0]) / 2 - ((b[1] - a[1]) / L) * 0.003, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / L) * 0.003])
  }
  return out
}

const turn = (s: Shape, t: number): Shape => {
  const c = Math.cos(t), n = Math.sin(t)
  return s.map((r) => r.map((p) => [p[0] * c - p[1] * n, p[0] * n + p[1] * c] as Pt))
}

/**
 * clipper2-js 1.2.4 sometimes builds a vertex from one edge's x and another's y and returns a piece that is in
 * neither input (a 5 m² triangle between two units that only share an edge). Every edge of the result is checked
 * 3 mm inside against the inputs; a result that fails is redone with the inputs turned (the bug is tied to the
 * sweep direction) and turned back.
 */
function checked(op: (a: Paths64, b: Paths64) => Paths64, a: Shape, b: Shape, want: (inA: boolean, inB: boolean) => boolean): Shape {
  let best: Shape = [], fewest = Infinity
  for (const t of [0, 0.1, 0.37, 1.1]) {
    const A = t ? turn(a, t) : a, B = t ? turn(b, t) : b
    const out = fromPaths(op(toPaths(A), toPaths(B)))
    const res = t ? turn(out, -t) : out
    // a spike (zero width) fails its own probe, so the result that fails fewest probes wins
    let bad = 0
    for (const r of res) for (const p of probes(r)) if (!want(filled(a, p), filled(b, p))) bad++
    if (!bad) return res
    if (bad < fewest) { fewest = bad; best = res }
  }
  return best
}

export function difference(a: Shape, b: Shape): Shape {
  if (!a.length) return []
  if (!b.length) return a.map((r) => r.slice())
  return checked((p, q) => Clipper.Difference(p, q, FillRule.NonZero), a, b, (x, y) => x && !y)
}

export function intersection(a: Shape, b: Shape): Shape {
  if (!a.length || !b.length) return []
  return checked((p, q) => Clipper.Intersect(p, q, FillRule.NonZero), a, b, (x, y) => x && y)
}

export function union(shapes: Shape[]): Shape {
  const all = shapes.flat()
  if (!all.length) return []
  return checked((p) => Clipper.Union(p, undefined, FillRule.NonZero), all, [], (x) => x)
}

/** A strip of half-width `half` around an open path, square at its ends. */
export function inflatePath(path: Pt[], half: number): Shape {
  if (path.length < 2) return []
  const ps = new Paths64()
  const p = new Path64()
  for (const q of path) p.push({ x: Math.round(q[0] * S), y: Math.round(q[1] * S) })
  ps.push(p)
  // clipper2-js offsets open paths by delta/2 per side, so ask for the full width
  return fromPaths(Clipper.InflatePaths(ps, 2 * half * S, JoinType.Miter, EndType.Butt, 2))
}

/** Closed, at least 3 vertices, some area, and no two non-adjacent edges touch. */
export function isSimple(r: Ring): boolean {
  const n = r.length
  if (n < 3 || Math.abs(signedArea(r)) < 1e-9) return false
  const orient = (a: Pt, b: Pt, c: Pt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const onSeg = (a: Pt, b: Pt, c: Pt) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
  const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b)
    if (o1 !== o2 && o3 !== o4) return true
    return (o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b))
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (cross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return false
    }
  return true
}

export function pathLength(p: Pt[]): number {
  let l = 0
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return l
}

/** The piece of an open path between arc lengths s0 and s1. */
export function subPath(p: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = []
  let acc = 0
  const at = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const e = acc + len
    if (len > 0 && e >= s0 && acc <= s1) {
      if (!out.length) out.push(at(a, b, Math.max(0, (s0 - acc) / len)))
      if (e <= s1) out.push(b)
      else { out.push(at(a, b, (s1 - acc) / len)); break }
    }
    acc = e
  }
  return out
}

/** Even-odd point test over every ring of a shape (holes and islands included), with a bounding-box precheck. */
export function inside(s: Shape, p: Pt): boolean {
  let c = false
  for (const r of s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const q of r) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1] }
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue
    if (inRing(p, r)) c = !c
  }
  return c
}

/** Douglas–Peucker on a closed ring: the fewest points that stay within `tol` of the original (min 3). */
export function simplify(ring: Ring, tol: number): Ring {
  const n = ring.length
  if (n <= 3) return ring.slice()
  // split the loop at its two farthest-apart points, then simplify each open half
  let a = 0, b = 0, best = -1
  for (let i = 0; i < n; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > best) { best = d; b = i } }
  best = -1
  for (let i = 0; i < n; i++) { const d = Math.hypot(ring[i][0] - ring[b][0], ring[i][1] - ring[b][1]); if (d > best) { best = d; a = i } }
  const [i0, i1] = a < b ? [a, b] : [b, a]
  const keep = new Uint8Array(n)
  keep[i0] = keep[i1] = 1
  const dp = (lo: number, hi: number) => {
    // indices lo..hi along the loop (hi may wrap past n)
    const stack: [number, number][] = [[lo, hi]]
    while (stack.length) {
      const [l, h] = stack.pop()!
      if (h - l < 2) continue
      const A = ring[l % n], B = ring[h % n]
      let far = -1, at = -1
      for (let k = l + 1; k < h; k++) { const d = segDist(ring[k % n], A, B); if (d > far) { far = d; at = k } }
      if (far > tol) { keep[at % n] = 1; stack.push([l, at], [at, h]) }
    }
  }
  dp(i0, i1)
  dp(i1, i0 + n)
  const out = ring.filter((_, i) => keep[i])
  return out.length >= 3 ? out : ring.slice()
}

/** An automatic core: a square of `share` of the plate at the largest outer's centroid (or the plate's deepest point). */
export function autoCore(plate: Shape, share = 0.09): Shape {
  const A = area(plate)
  if (A <= 0) return []
  const outer = plate.filter((r) => signedArea(r) > 0).sort((x, y) => signedArea(y) - signedArea(x))[0]
  if (!outer) return []
  let c = centroid(outer)
  if (!inside(plate, c)) {
    // the point of the plate farthest from its edges, on a 1 m grid
    const xs = outer.map((p) => p[0]), ys = outer.map((p) => p[1])
    const edges: [Pt, Pt][] = plate.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt]))
    let bestD = -1
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) {
      if (!inside(plate, [x, y])) continue
      const d = Math.min(...edges.map(([p, q]) => segDist([x, y], p, q)))
      if (d > bestD) { bestD = d; c = [x, y] }
    }
  }
  const h = Math.sqrt(A * share) / 2
  return intersection([[[c[0] - h, c[1] - h], [c[0] + h, c[1] - h], [c[0] + h, c[1] + h], [c[0] - h, c[1] + h]]], plate)
}
