// A truck court on its wall (Phase D.3, task 3; Decisions "Truck court", "Court depth"), pure: the wall's frame, a court's contour in it, the rule
// on write, a court split by a line, a court's id.
// - The wall's frame: x is m along the wall's straight face from its start, the end where the outline, running counter-clockwise, enters the wall;
//   y is m out of the face. A wall's way out is on the right of the outline's way along it, so the frame is a mirror of the plan: a court that
//   runs counter-clockwise in it runs clockwise on the plan. The face is the reference line out by the facade's offset and the wall (`faceOf`), and x = 0
//   is where the reference line starts (a shape is stored there: it stays put when a wall's thickness changes).
// - A wall's span for a court (task 4's choice, the plan's *Frame span* decision): the frame's own x from 0 to the reference line's length, where the
//   block editor draws a court without a shape (`courtBand`); or, given the wall's outer face from corner to corner (`faceSpan`: a wall's thickness past
//   the reference line at a convex corner), where the site derives it (the footprint's wall). Both are in the one frame, so a shape means the same
//   points on the plan in both; only the rectangle a court without a shape is (`courtContour`), and what the rule lets its wall side reach
//   (`courtRule`'s `lo` and `length`), take the span. Task 6's call: what the rule holds a wall side to is the face's span in BOTH viewports and when the outline
//   changes (`followCourts`), so a shape made on the site that reaches -t (a wall's thickness before the reference line) is not clipped by the block editor or by an
//   outline edit; only the rectangle a court without a shape is stays as each viewport draws it (the editor's 0 to the reference line's length, the site's the face's).
// - A viewport reads a court counter-clockwise: the frame is a mirror of the type's and of the plan, so `mirrored` re-winds it (corners reversed, arcs re-keyed,
//   chamfer set-backs swapped) on its way out and back.
// - A court is a contour in that frame (`CourtByEdge.shape`), the rectangle across the wall by its depth when it has none.
// - The rule on write (`courtRule`): its wall side (the edges on y = 0) stays on the wall and within its span, the court stands in front of the
//   wall (y >= 0; its far part may flare past the wall's ends), its depth is held to 5-200 m, a simple counter-clockwise contour.
// - Split by a line (`splitCourt`, on `splitByLine`): the pieces that touch the wall stay, the others go.
import type { Contour, CourtByEdge, Id, Point } from '../../../model/schema.ts'
import { arcBox, bulgeAt, rawPolygon } from '../../../engine/geom/contour.ts'
import { isSimple, signedArea } from '../../../engine/geom/polygon.ts'
import { splitByLine, type SplitPiece } from '../../../engine/geom/split.ts'
import { COURT_DEPTH_MAX, COURT_DEPTH_MIN } from '../../docks/engine/docks.ts'
import { faceOf, outwardOf, type ShapeEdge } from './shape.ts'

/** What a court needs of its wall: the edge as the outline reads it. */
export type CourtEdge = Pick<ShapeEdge, 'a' | 'b' | 'horizontal' | 'side' | 'offset' | 'thickness'>

/** A wall's frame on its plane: where x = 0, y = 0 is (the start of the face), the unit along the face, the unit out of it, and the face's length (m). */
export interface WallFrame {
  origin: Point
  along: Point
  out: Point
  /** m: the reference line's length (the editor's span). */
  length: number
}

/** A stretch of a wall's frame (m along it): where a court's wall side may stand and what a court without a shape spans: 0 to its length, or the face's. */
export interface WallSpan {
  lo: number
  hi: number
}

/** What a court says when its wall side is pushed off the wall, and when a corner of it is behind the wall's face. */
export const STAYS_ON_WALL = 'A truck court stays on its wall'
export const IN_FRONT = 'A truck court stands in front of its wall'
/** What a court says when what is left is no court: fewer than three corners, a contour that crosses itself or runs clockwise. */
export const NOT_A_SHAPE = 'A truck court is a simple shape of three corners or more'

/** m: a corner this near the wall is on it; an edge this long is one. */
const ON = 1e-4
const MIN_EDGE = 0.01
/** m: a court's wall side the length of which a split's piece needs to touch the wall. */
const MIN_WALL_SIDE = 1
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0
const sign = (v: number) => (v < 0 ? -1 : 1)

/** The frame of an edge's wall (along the grid): its reference line's start put out onto the face, its way along, its way out, its length. */
export function wallFrame(e: CourtEdge): WallFrame {
  const out = outwardOf(e.side)
  const face = faceOf(e)
  if (e.horizontal) {
    const s = sign(e.b.x - e.a.x)
    const length = Math.abs(e.b.x - e.a.x)
    return { origin: { x: e.a.x, y: e.a.y + out.y * face }, along: { x: s, y: 0 }, out, length }
  }
  const s = sign(e.b.y - e.a.y)
  const length = Math.abs(e.b.y - e.a.y)
  return { origin: { x: e.a.x + out.x * face, y: e.a.y }, along: { x: 0, y: s }, out, length }
}

/**
 * An edge's outer face from corner to corner in its frame's x (what the site's footprint wall spans): the stretches of `walls` (the generated walls,
 * in the type's frame) that are the edge's own, not a corner's cut. Null: none (an edge with no wall of its own).
 */
export function faceSpan(e: CourtEdge & Pick<ShapeEdge, 'id'>, walls: readonly { a: Point; b: Point; edge?: Id; corner?: true }[]): WallSpan | null {
  const frame = wallFrame(e)
  const xs = walls.filter((w) => w.edge === e.id && !w.corner).flatMap((w) => [toWall(frame, w.a).x, toWall(frame, w.b).x])
  return xs.length ? { lo: Math.min(...xs), hi: Math.max(...xs) } : null
}

/** A point of the plane (the type's frame) in a wall's frame. */
export const toWall = (f: WallFrame, p: Point): Point => {
  const d = { x: p.x - f.origin.x, y: p.y - f.origin.y }
  return { x: d.x * f.along.x + d.y * f.along.y, y: d.x * f.out.x + d.y * f.out.y }
}

/** A point of a wall's frame on the plane (the type's frame). */
export const fromWall = (f: WallFrame, q: Point): Point => ({ x: f.origin.x + f.along.x * q.x + f.out.x * q.y, y: f.origin.y + f.along.y * q.x + f.out.y * q.y })

/**
 * A court's contour in its wall's frame: its own shape, else the rectangle across the wall's span by `depth`: the reference line's, 0 to its length
 * (the block editor's), or `span` (the site's: `faceSpan`).
 */
export function courtContour(court: Pick<CourtByEdge, 'shape'>, e: CourtEdge, depth: number, span?: WallSpan): Contour {
  if (court.shape) return court.shape
  const { lo, hi } = span ?? { lo: 0, hi: wallFrame(e).length }
  return {
    vertices: [
      { x: lo, y: 0, r: 0 },
      { x: hi, y: 0, r: 0 },
      { x: hi, y: depth, r: 0 },
      { x: lo, y: depth, r: 0 },
    ],
  }
}

/** m: how deep a court goes: its deepest point, an arc's bulge counted. */
export const courtDepth = (c: Contour): number => arcBox(c).y1

/** The edges of a contour on the wall (both ends on y = 0, no arc, a centimetre long): its wall side. */
export function wallSide(c: Contour): number[] {
  const v = c.vertices
  const out: number[] = []
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    if (Math.abs(a.y) <= ON && Math.abs(b.y) <= ON && bulgeAt(c, i) === 0 && Math.abs(b.x - a.x) >= MIN_EDGE) out.push(i)
  }
  return out
}

/**
 * A contour seen through a reflection `map` (a point of one frame in the other's): the wall's frame and a viewport's are mirrors, so the corners are
 * taken in reverse to run counter-clockwise again. Corner i is corner n - 1 - i, edge k is edge (n - 2 - k) mod n (so an arc's key moves with its edge,
 * its bulge the same: the reflection and the reversed way along it each flip its side), and a chamfer's two set-backs swap (the wall before the corner is
 * the one after it now). Twice is the contour it was.
 */
export function mirrored(c: Contour, map: (p: Point) => Point): Contour {
  const n = c.vertices.length
  const vertices = c.vertices
    .map((v) => {
      const q = map(v)
      const { chamfer, ...rest } = v
      return { ...rest, x: q.x + 0, y: q.y + 0, ...(chamfer ? { chamfer: [chamfer[1], chamfer[0]] as [number, number] } : {}) }
    })
    .reverse()
  const arcs = c.arcs && Object.fromEntries(Object.entries(c.arcs).map(([k, b]) => [String((n - 2 - Number(k) + n) % n), b]))
  return { vertices, ...(arcs && Object.keys(arcs).length ? { arcs } : {}) }
}

/** A contour rounded to the millimetre, a corner a hair off the wall on it. */
function rounded(c: Contour): Contour {
  const vertices = c.vertices.map((v) => ({ ...v, x: mm(v.x), y: Math.abs(v.y) <= ON ? 0 : mm(v.y) }))
  return { ...c, vertices }
}

/** Whether a contour is a court's shape as far as the rule goes: three corners, counter-clockwise, simple. */
function validShape(c: Contour): boolean {
  if (c.vertices.length < 3 || c.vertices.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))) return false
  const ring = rawPolygon(c)
  return ring.length >= 3 && signedArea(ring) > 0 && isSimple(ring)
}

/** How much of a piece's wall side lies within x from `lo` to `hi` (m). */
function wallSideIn(piece: Contour, lo: number, hi: number): number {
  const v = piece.vertices
  return wallSide(piece).reduce((sum, i) => {
    const a = v[i].x
    const b = v[(i + 1) % v.length].x
    return sum + Math.max(0, Math.min(Math.max(a, b), hi) - Math.max(Math.min(a, b), lo))
  }, 0)
}

/**
 * A contour cut at x = `at` (the line square to the wall) and what is on the side where its wall side is longer within [`lo`, `hi`]; null when
 * no piece has a wall side there. A contour the line does not cross: itself.
 */
function cutAt(c: Contour, at: number, lo: number, hi: number): Contour | null {
  const r = splitByLine(c, { x: at, y: 0 }, { x: at, y: 1 })
  let best: Contour | null = null
  let most = MIN_EDGE
  for (const p of r.pieces) {
    const side = wallSideIn(p.contour, lo, hi)
    if (side > most) {
      best = p.contour
      most = side
    }
  }
  return best
}

/**
 * A court's contour kept to the wall that is left: the part of it in x from `lo` (0) to `length` where its wall side (`whole`: all of it) went past.
 * Null: no wall side left.
 */
export function clipToWall(c: Contour, length: number, whole = false, lo = 0): Contour | null {
  const reach = (k: Contour) => {
    const xs = (whole ? k.vertices : wallSide(k).flatMap((i) => [k.vertices[i], k.vertices[(i + 1) % k.vertices.length]])).map((v) => v.x)
    return xs.length ? { lo: Math.min(...xs), hi: Math.max(...xs) } : null
  }
  const r0 = reach(c)
  if (!r0) return null
  let out: Contour | null = r0.lo < lo - ON ? cutAt(c, lo, lo, length) : c
  const r1 = out && reach(out)
  if (out && r1 && r1.hi > length + ON) out = cutAt(out, length, lo, length)
  return out && wallSide(out).length ? out : null
}

/** What the rule on write says: the contour as it is held and what it said doing so, or why it is refused. */
export type CourtRule = { contour: Contour; notes: string[] } | { reason: string }

const metres = (v: number) => `${Math.round(v * 100) / 100} m`

/**
 * The rule on write of a court's contour in its wall's frame (`length`: the wall's face, m): rounded to the millimetre; refused when it is no simple
 * counter-clockwise contour, when no edge of it is on the wall (the wall side pushed off it, or none), when a corner is behind the face; its wall
 * side clipped to the wall's span (said; `lo` to `length`: 0 to the reference line's length, or the face's, `faceSpan`); its depth held to 5-200 m
 * (said). A far part that flares past the wall's ends is kept.
 */
export function courtRule(contour: Contour, length: number, lo = 0): CourtRule {
  let c = rounded(contour)
  if (!validShape(c)) return { reason: NOT_A_SHAPE }
  if (!wallSide(c).length) return { reason: STAYS_ON_WALL }
  if (arcBox(c).y0 < -ON) return { reason: IN_FRONT }
  const notes: string[] = []
  // its wall side within the wall's span
  const sides = wallSide(c).flatMap((i) => [c.vertices[i].x, c.vertices[(i + 1) % c.vertices.length].x])
  if (Math.min(...sides) < lo - ON || Math.max(...sides) > length + ON) {
    const clipped = clipToWall(c, length, false, lo)
    if (!clipped) return { reason: STAYS_ON_WALL }
    c = rounded(clipped)
    notes.push('Clipped to its wall: a court’s wall side stays within its wall')
  }
  // its depth, held
  const deepest = courtDepth(c)
  if (deepest > COURT_DEPTH_MAX + ON || deepest < COURT_DEPTH_MIN - ON) {
    const held = deepest > COURT_DEPTH_MAX ? COURT_DEPTH_MAX : COURT_DEPTH_MIN
    const top = Math.max(...c.vertices.map((v) => v.y))
    c = rounded({
      ...c,
      vertices: c.vertices.map((v) => (deepest > held ? (v.y > held ? { ...v, y: held } : v) : v.y >= top - ON ? { ...v, y: v.y + (held - deepest) } : v)),
    })
    if (Math.abs(courtDepth(c) - held) > 1e-3) return { reason: `Held to ${metres(held)}: a court is ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX} m deep` }
    notes.push(`Held to ${metres(held)}: a court is ${COURT_DEPTH_MIN}–${COURT_DEPTH_MAX} m deep`)
    if (!validShape(c)) return { reason: NOT_A_SHAPE }
  }
  return { contour: c.vertices.every((v, i) => v.x === contour.vertices[i]?.x && v.y === contour.vertices[i]?.y) && c.vertices.length === contour.vertices.length ? contour : c, notes }
}

/** What a split says of the pieces off the wall that went ("1 piece off the wall went"). */
export const wentNote = (n: number): string => `${n} piece${n === 1 ? '' : 's'} off the wall went`

/** A court split by a line: its pieces that touch the wall (in the order the line meets them), how many went, whether the line cut it at all. */
export interface CourtSplit {
  pieces: Contour[]
  went: number
  cut: boolean
}

/**
 * A court cut by the infinite line a-b (in its wall's frame): the pieces with a wall side of a metre at least stay, each a court; those off the wall
 * go. A line that does not cross it gives the court itself.
 */
export function splitCourt(contour: Contour, a: Point, b: Point): CourtSplit {
  const r = splitByLine(contour, a, b)
  if (!r.cut) return { pieces: [contour], went: 0, cut: false }
  const wall = new Set(wallSide(contour))
  const touches = (p: SplitPiece) =>
    p.from.reduce<number>((sum, f, i) => {
      if (f === null || !wall.has(f)) return sum
      const v = p.contour.vertices
      const q = v[(i + 1) % v.length]
      return sum + Math.hypot(q.x - v[i].x, q.y - v[i].y)
    }, 0) >= MIN_WALL_SIDE
  const kept = r.pieces.filter(touches)
  return { pieces: kept.map((p) => p.contour), went: r.pieces.length - kept.length, cut: true }
}

/** The first court id "c1", "c2"… not taken. */
export function freeCourtId(taken: { id?: Id }[]): Id {
  let n = 1
  while (taken.some((c) => c.id === `c${n}`)) n++
  return `c${n}`
}
