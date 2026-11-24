// Shape editing: walls, corners, radii and chamfers. Port of Plaza-Practiko `motores/geom/edicion.ts`, plus resizing a `rect`.
// Every contour edit returns a valid contour or the reason it was rejected; on rejection `contour` is the original,
// unchanged (the handle stays at its last valid position).
// Left out: Plaza's "fixed" radii (`rFijo`: our Vertex has none, so every radius shrinks to fit), stretching and
// shared walls (Plaza's retail units share walls; warehouses stand apart).
import type { Contour, Footprint, Point, Vertex } from '../../model/schema.ts'
import { fitChamfers, maxChamfer } from './chamfer.ts'
import { arcOfEdge, bulges, effectiveSetbacks, maxRadius, rawPolygon, setbacks, tangentLength, turnAt, withBulges } from './contour.ts'
import { cosSin } from './footprint.ts'
import { EPS, isSimple, signedArea } from './polygon.ts'

export type EditResult = { contour: Contour; ok: true; notes: string[] } | { contour: Contour; ok: false; reason: string }

/** m: no wall ends up shorter than 1 cm. */
const MIN_EDGE = 0.01
const BISECTIONS = 30

const next = (i: number, n: number) => (i + 1) % n
const prev = (i: number, n: number) => (i - 1 + n) % n
const mod = (i: number, n: number) => ((i % n) + n) % n
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

function unit(a: Point, b: Point): Point {
  const l = dist(a, b)
  return l <= EPS ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

const fail = (c: Contour, reason: string): EditResult => ({ contour: c, ok: false, reason })

/** Radii that no longer fit shrink to the largest that does (two corners that collide, radii or chamfers, share the edge). */
function fitRadii(c: Contour): { contour: Contour; notes: string[] } {
  const t = c.vertices.map((_, i) => tangentLength(c, i))
  const lim = effectiveSetbacks(c).inn
  const notes: string[] = []
  const vertices = c.vertices.map((vi, j) => {
    if (!(lim[j] < t[j] - 1e-9)) return vi
    const r = lim[j] / Math.tan(Math.abs(turnAt(c, j)) / 2)
    notes.push(`radius reduced to ${r.toFixed(2)} m at corner ${j + 1}`)
    return { ...vi, r }
  })
  return { contour: notes.length ? { ...c, vertices } : c, notes }
}

/** Radii and chamfers that no longer fit, both fitted against the contour as edited (they share each wall's length). */
function fitCorners(c: Contour): { contour: Contour; notes: string[] } {
  const r = fitRadii(c)
  const k = fitChamfers(c)
  if (k.contour === c) return r
  const vertices = r.contour.vertices.map((vi, i) => {
    const kv = k.contour.vertices[i]
    if (kv.chamfer === c.vertices[i].chamfer) return vi
    const { chamfer: _, ...rest } = vi
    return kv.chamfer ? { ...rest, chamfer: kv.chamfer } : rest
  })
  return { contour: { ...c, vertices }, notes: [...r.notes, ...k.notes] }
}

/** Checks an edited contour: ≥ 3 corners, walls of at least 1 cm, radii and chamfers that fit, counter-clockwise and simple. */
function validate(original: Contour, c: Contour): EditResult {
  const v = c.vertices
  const n = v.length
  if (n < 3) return fail(original, 'the shape needs at least 3 corners')
  for (let s = 0; s < n; s++) if (dist(v[s], v[next(s, n)]) < MIN_EDGE) return fail(original, `wall ${s + 1} becomes too short`)
  const fitted = fitCorners(c)
  const p = rawPolygon(fitted.contour)
  if (signedArea(p) <= EPS) return fail(original, 'the shape flips over')
  if (!isSimple(p)) return fail(original, 'the shape crosses itself')
  return { contour: fitted.contour, ok: true, notes: fitted.notes }
}

/** Where the line p + s·u meets the line through q0 and q1; null if they are parallel. */
function meet(p: Point, u: Point, q0: Point, q1: Point): Point | null {
  const w = { x: q1.x - q0.x, y: q1.y - q0.y }
  const lw = Math.hypot(w.x, w.y)
  const den = u.x * w.y - u.y * w.x
  if (lw <= EPS || Math.abs(den) <= 1e-12 * lw) return null
  const s = ((q0.x - p.x) * w.y - (q0.y - p.y) * w.x) / den
  return { x: p.x + u.x * s, y: p.y + u.y * s }
}

/**
 * Moves wall i (vertices[i] → vertices[i+1]) a distance d along its normal (d > 0 outwards). Each of its corners
 * slides to where the moved line meets the neighbouring wall's line (if parallel, along the normal). Radii stay
 * unless they stop fitting; an arc edge keeps its bulge.
 */
export function moveWall(c: Contour, i: number, d: number): EditResult {
  const v = c.vertices
  const n = v.length
  if (n < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  const j = next(i, n)
  const a = v[i]
  const b = v[j]
  const u = unit(a, b)
  if (u.x === 0 && u.y === 0) return fail(c, `wall ${i + 1} has no length`)
  const sx = u.y * d // outward normal: right of the edge on a counter-clockwise contour
  const sy = -u.x * d
  const a2 = { x: a.x + sx, y: a.y + sy }
  const b2 = { x: b.x + sx, y: b.y + sy }
  const na = meet(a2, u, v[prev(i, n)], a) ?? a2
  const nb = meet(b2, u, b, v[next(j, n)]) ?? b2
  const vertices: Vertex[] = v.slice()
  vertices[i] = { ...a, x: na.x, y: na.y }
  vertices[j] = { ...b, x: nb.x, y: nb.y }
  for (const s of [prev(i, n), i, j]) {
    const p0 = v[s]
    const p1 = v[next(s, n)]
    const q0 = vertices[s]
    const q1 = vertices[next(s, n)]
    if ((p1.x - p0.x) * (q1.x - q0.x) + (p1.y - p0.y) * (q1.y - q0.y) <= 0) return fail(c, `wall ${s + 1} flips over`)
  }
  return validate(c, { ...c, vertices })
}

/** Like moveWall, but when d is not valid it applies the largest valid |d| (bisection between 0 and d). */
export function moveWallLimited(c: Contour, i: number, d: number): { contour: Contour; applied: number; notes: string[] } {
  const full = moveWall(c, i, d)
  if (full.ok) return { contour: full.contour, applied: d, notes: full.notes }
  let lo = 0
  let hi = d
  let best: EditResult | null = null
  for (let k = 0; k < BISECTIONS; k++) {
    const mid = (lo + hi) / 2
    const r = moveWall(c, i, mid)
    if (r.ok) {
      lo = mid
      best = r
    } else hi = mid
  }
  if (!best || !best.ok) return { contour: c, applied: 0, notes: [`cannot move: ${full.reason}`] }
  return { contour: best.contour, applied: lo, notes: [...best.notes, `move limited to ${lo.toFixed(2)} m: ${full.reason}`] }
}

/** How far a neighbouring wall may turn from the pushed wall and still run on in its line: a corner added on a wall. */
const ON_LINE = Math.sin((10 * Math.PI) / 180)

/** Which ends of wall i `pushWall` steps out from (a neighbouring wall runs on in its line): `a` its start, `b` its end. */
export function pushSteps(c: Contour, i: number): { a: boolean; b: boolean } {
  const v = c.vertices
  const n = v.length
  if (n < 3) return { a: false, b: false }
  i = mod(i, n)
  const j = next(i, n)
  const u = unit(v[i], v[j])
  if (u.x === 0 && u.y === 0) return { a: false, b: false }
  const runsOn = (w: Point) => w.x * u.x + w.y * u.y > 0 && Math.abs(w.x * u.y - w.y * u.x) < ON_LINE
  return { a: runsOn(unit(v[prev(i, n)], v[i])), b: runsOn(unit(v[j], v[next(j, n)])) }
}

/**
 * Pushes wall i a distance d along its normal and keeps the shape square (Decision "Square pull"; the user: "the pull
 * straight… deformed as before only with Ctrl"): a corner whose neighbouring wall runs on in the wall's line (within
 * 10°, a corner added on the wall) stays where it is and a new corner steps out from it, square to the wall; any other
 * corner slides along its neighbouring wall, as `moveWall` (which is the Ctrl drag). With no corner of the first kind it
 * is `moveWall`.
 */
export function pushWall(c: Contour, i: number, d: number): EditResult {
  const v = c.vertices
  const n = v.length
  if (n < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  const j = next(i, n)
  const a = v[i]
  const b = v[j]
  const u = unit(a, b)
  if (u.x === 0 && u.y === 0) return fail(c, `wall ${i + 1} has no length`)
  const { a: stepA, b: stepB } = pushSteps(c, i)
  if (!stepA && !stepB) return moveWall(c, i, d)
  const s = { x: u.y * d, y: -u.x * d } // outward normal: right of the edge on a counter-clockwise contour
  const a2 = { x: a.x + s.x, y: a.y + s.y }
  const b2 = { x: b.x + s.x, y: b.y + s.y }
  const na = stepA ? a2 : (meet(a2, u, v[prev(i, n)], a) ?? a2)
  const nb = stepB ? b2 : (meet(b2, u, b, v[next(j, n)]) ?? b2)
  const bs = bulges(c)
  const vertices: Vertex[] = []
  const edges: number[] = []
  for (let k = 0; k < n; k++) {
    if (k === i) {
      // the corner stays, the step goes out from it; else it slides
      if (stepA) vertices.push(a, { x: na.x, y: na.y, r: 0 })
      else vertices.push({ ...a, x: na.x, y: na.y })
      if (stepA) edges.push(0)
      edges.push(bs[i])
    } else if (k === j) {
      if (stepB) vertices.push({ x: nb.x, y: nb.y, r: 0 }, b)
      else vertices.push({ ...b, x: nb.x, y: nb.y })
      if (stepB) edges.push(0)
      edges.push(bs[j])
    } else {
      vertices.push(v[k])
      edges.push(bs[k])
    }
  }
  return validate(c, withBulges(vertices, edges))
}

/** Like pushWall, but when d is not valid it applies the largest valid |d| (a step at least 1 cm long). */
export function pushWallLimited(c: Contour, i: number, d: number): { contour: Contour; applied: number; notes: string[] } {
  const full = pushWall(c, i, d)
  if (full.ok) return { contour: full.contour, applied: d, notes: full.notes }
  // the steps need a length: the search starts at a 1 cm push, not at none
  let lo = Math.sign(d) * MIN_EDGE * 1.01
  const least = pushWall(c, i, lo)
  if (!least.ok || Math.abs(d) <= Math.abs(lo)) return { contour: c, applied: 0, notes: [`cannot move: ${full.reason}`] }
  let hi = d
  let best: EditResult = least
  for (let k = 0; k < BISECTIONS; k++) {
    const mid = (lo + hi) / 2
    const r = pushWall(c, i, mid)
    if (r.ok) {
      lo = mid
      best = r
    } else hi = mid
  }
  if (!best.ok) return { contour: c, applied: 0, notes: [`cannot move: ${full.reason}`] }
  return { contour: best.contour, applied: lo, notes: [...best.notes, `move limited to ${lo.toFixed(2)} m: ${full.reason}`] }
}

export function moveVertex(c: Contour, i: number, p: Point): EditResult {
  const n = c.vertices.length
  if (n < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  const vertices = c.vertices.slice()
  vertices[i] = { ...vertices[i], x: p.x, y: p.y }
  return validate(c, { ...c, vertices })
}

/**
 * Stretches the shape along the unit vector u (port of Plaza-Practiko's `estirar`): the corners whose projection on u
 * passes `cut` move d·u, the rest stay. Arc edges keep their bulge. Checked like any edit.
 */
export function stretch(c: Contour, u: Point, cut: number, d: number): EditResult {
  if (d === 0) return { contour: c, ok: true, notes: [] }
  const vertices = c.vertices.map((v) => (v.x * u.x + v.y * u.y > cut ? { ...v, x: v.x + u.x * d, y: v.y + u.y * d } : v))
  if (vertices.every((v, i) => v === c.vertices[i])) return fail(c, 'nothing to stretch')
  return validate(c, { ...c, vertices })
}

/**
 * Inserts a sharp corner on wall i, at the point of the wall closest to p, outside the tangent zones of its corners'
 * radii. An arc edge is split in two.
 */
export function insertVertex(c: Contour, i: number, p: Point): Contour {
  const v = c.vertices
  const n = v.length
  i = mod(i, n)
  const a = v[i]
  const b = v[next(i, n)]
  const bs = bulges(c)
  const bulge = bs[i]
  let q: Point
  let b1 = 0
  let b2 = 0
  if (bulge === 0) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const l = Math.sqrt(l2)
    // outside the corners' tangent zones, so their radii are neither shrunk nor blocked
    let lo = l <= EPS ? 0 : Math.min(1, setbacks(c, i)[1] / l)
    let hi = l <= EPS ? 1 : Math.max(0, 1 - setbacks(c, next(i, n))[0] / l)
    if (lo > hi) lo = hi = (lo + hi) / 2
    const t = l2 <= EPS ? 0.5 : Math.max(lo, Math.min(hi, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    q = { x: a.x + t * dx, y: a.y + t * dy }
  } else {
    const { center, radius, sweep } = arcOfEdge(a, b, bulge)
    const a0 = Math.atan2(a.y - center.y, a.x - center.x)
    let phi = Math.atan2(p.y - center.y, p.x - center.x) - a0
    // bring phi to the sweep's direction and inside it
    if (sweep > 0) while (phi < 0) phi += 2 * Math.PI
    else while (phi > 0) phi -= 2 * Math.PI
    if (Math.abs(phi) > Math.abs(sweep)) phi = Math.abs(phi) - Math.abs(sweep) < 2 * Math.PI - Math.abs(phi) ? sweep : 0
    phi = Math.sign(sweep) * Math.min(Math.max(Math.abs(phi), 1e-6), Math.abs(sweep) - 1e-6)
    q = { x: center.x + radius * Math.cos(a0 + phi), y: center.y + radius * Math.sin(a0 + phi) }
    b1 = -Math.tan(phi / 4)
    b2 = -Math.tan((sweep - phi) / 4)
  }
  const vertices = v.slice()
  vertices.splice(i + 1, 0, { x: q.x, y: q.y, r: 0 })
  const nb = bs.slice()
  nb[i] = b1
  nb.splice(i + 1, 0, b2)
  return withBulges(vertices, nb)
}

/** Deletes corner i; its two walls join (two arcs of the same circle join into one arc). */
export function removeVertex(c: Contour, i: number): EditResult {
  const v = c.vertices
  const n = v.length
  if (n - 1 < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  const h = prev(i, n)
  const bs = bulges(c)
  const notes: string[] = []
  let joined = 0
  if (bs[h] !== 0 || bs[i] !== 0) {
    const p = bs[h] !== 0 ? arcOfEdge(v[h], v[i], bs[h]) : null
    const q = bs[i] !== 0 ? arcOfEdge(v[i], v[next(i, n)], bs[i]) : null
    const sameCircle = p && q && dist(p.center, q.center) <= 1e-6 && Math.abs(p.radius - q.radius) <= 1e-6 && p.sweep * q.sweep > 0
    if (p && q && sameCircle) joined = -Math.tan((p.sweep + q.sweep) / 4)
    else notes.push('the arc edge became straight')
  }
  const vertices = v.slice()
  vertices.splice(i, 1)
  const nb = bs.slice()
  nb[h] = joined
  nb.splice(i, 1)
  const r = validate(c, withBulges(vertices, nb))
  return r.ok ? { ...r, notes: [...notes, ...r.notes] } : r
}

/** Changes the radius of corner i (a radius above 0 takes its chamfer away). Rejects a negative radius or one larger than what fits next to its neighbours. */
export function setCornerRadius(c: Contour, i: number, r: number): EditResult {
  const n = c.vertices.length
  if (n < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  if (!Number.isFinite(r) || r < 0) return fail(c, 'the radius must be a number ≥ 0')
  const max = maxRadius(c, i)
  if (r > max + 1e-9) return fail(c, `the radius does not fit at corner ${i + 1}: max ${max.toFixed(2)} m`)
  const vertices = c.vertices.slice()
  const { chamfer: cut, ...rest } = vertices[i]
  vertices[i] = r > 0 || !cut ? { ...rest, r } : { ...rest, r, chamfer: cut }
  return validate(c, { ...c, vertices })
}

/**
 * Cuts corner i with a chamfer, a m back along its incoming wall and b m along its outgoing one (Phase D.1). A chamfer takes the
 * corner's radius away; [0, 0] takes the chamfer away. Rejects a negative set-back or more than fits next to the neighbours
 * (`maxChamfer`).
 */
export function setChamfer(c: Contour, i: number, a: number, b: number): EditResult {
  const n = c.vertices.length
  if (n < 3) return fail(c, 'the shape needs at least 3 corners')
  i = mod(i, n)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return fail(c, 'the chamfer set-backs must be numbers ≥ 0')
  const vertices = c.vertices.slice()
  const { chamfer: _, ...rest } = vertices[i]
  if (a > 0 || b > 0) {
    const [maxA, maxB] = maxChamfer(c, i)
    if (a > maxA + 1e-9 || b > maxB + 1e-9) return fail(c, `the chamfer does not fit at corner ${i + 1}: max ${maxA.toFixed(2)} × ${maxB.toFixed(2)} m`)
    vertices[i] = { ...rest, r: 0, chamfer: [a, b] }
  } else vertices[i] = rest
  return validate(c, { ...c, vertices })
}

// ---- Rectangles ---------------------------------------------------------------------------------------------
// A rect keeps its five numbers while it is resized: walls are numbered like `footprintContour` (counter-clockwise
// from the local bottom-left corner): 0 bottom, 1 right, 2 top, 3 left. The opposite wall stays where it is.

export type RectFootprint = Extract<Footprint, { kind: 'rect' }>

/** Smallest side a rect can be dragged down to (m). */
export const MIN_RECT_SIDE = 1

/** Outward normal of rect wall i, in site coordinates. */
export function rectWallNormal(f: RectFootprint, i: number): Point {
  const local = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ][mod(i, 4)]
  const [cos, sin] = cosSin(f.rotation)
  return { x: local.x * cos - local.y * sin, y: local.x * sin + local.y * cos }
}

/** Moves rect wall i by d along its outward normal; never below MIN_RECT_SIDE (`applied` says how much it moved). */
export function moveRectWall(f: RectFootprint, i: number, d: number): { footprint: RectFootprint; applied: number } {
  const across = mod(i, 2) === 1 ? 'width' : 'depth'
  const applied = Math.max(d, MIN_RECT_SIDE - f[across])
  if (applied === 0) return { footprint: f, applied: 0 }
  const n = rectWallNormal(f, i)
  return {
    footprint: { ...f, [across]: f[across] + applied, center: { x: f.center.x + (n.x * applied) / 2, y: f.center.y + (n.y * applied) / 2 } },
    applied,
  }
}

/**
 * Moves rect corner i (between walls i − 1 and i) to p: both walls move, the opposite corner stays. `exact` is false
 * when a side hit MIN_RECT_SIDE and the corner could not get there.
 */
export function moveRectCorner(f: RectFootprint, i: number, p: Point, corner: Point): { footprint: RectFootprint; exact: boolean } {
  const delta = { x: p.x - corner.x, y: p.y - corner.y }
  const before = mod(i - 1, 4)
  const n1 = rectWallNormal(f, before)
  const n2 = rectWallNormal(f, i)
  const d1 = delta.x * n1.x + delta.y * n1.y
  const d2 = delta.x * n2.x + delta.y * n2.y
  const r1 = moveRectWall(f, before, d1)
  const r2 = moveRectWall(r1.footprint, i, d2)
  return { footprint: r2.footprint, exact: Math.abs(r1.applied - d1) < 1e-9 && Math.abs(r2.applied - d2) < 1e-9 }
}
