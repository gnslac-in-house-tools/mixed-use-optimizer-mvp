// The module lines as a snap, not a rule (Phase D.2 task 6, Decision "Block shape"): a block's outline is free, and what it is dragged near is
// its grid. Pure; the hosts (`host.ts`, the block editor's `blockShapeHost.ts`) call these with what `actions.shapeOf` says of the object.
//   snapAcross    how far a wall (or a bump's face) goes along its normal: onto a module line within the aperture, else null (the pointer's own)
//   snapToGuides  a dragged corner onto the module lines: where two cross (their node), else along the nearest one
//   moduleMark    what the plan draws when a wall landed on a line
import type { Point } from '../../../model/schema.ts'
import type { ShapeWall } from '../../../engine/geom/shapeOp.ts'
import { crossing, toLine, type Line } from '../../plan/snap/lines.ts'
import type { SnapMark } from '../../plan/snap/move.ts'
import type { Wall } from '../../plan/snap/walls.ts'

/** How many modules past the lines the grid goes on for a wall pulled out of its block (a box wall stretches by modules). */
const BEYOND = 80

/**
 * Where a wall goes, `d` m along its outward normal as the pointer asks, when a module line is within `tol` m of it: that line's distance. The
 * lines are the wall's `across` (m from where it stands, out positive) and, past the first and the last, one module apart. null: none near.
 */
export function snapAcross(wall: Pick<ShapeWall, 'module' | 'across'> | undefined, d: number, tol: number): number | null {
  const lines = wall?.across
  if (!lines || lines.length === 0) return null
  const module = wall.module ?? 0
  const lo = Math.min(...lines)
  const hi = Math.max(...lines)
  const beyond = (from: number, way: number) => (module > 0 ? Array.from({ length: BEYOND }, (_, k) => from + way * module * (k + 1)) : [])
  let best: number | null = null
  let gap = tol + 1e-9
  for (const v of [...lines, ...beyond(hi, 1), ...beyond(lo, -1)]) {
    const e = Math.abs(v - d)
    if (e < gap) {
      gap = e
      best = v
    }
  }
  // no −0
  return best === null ? null : best + 0
}

/**
 * The mark of a wall that landed on a module line: its line, dashed. The wall went `d` m out of where it stood; its reference line is on the module line
 * and its face `face` m out of that (a block's wall: the thickness), so the mark is the face's line taken back by it.
 */
export function moduleMark(wall: Wall, d: number, face = 0): SnapMark {
  const out = d - face
  const at = (p: Point): Point => ({ x: p.x + wall.n.x * out, y: p.y + wall.n.y * out })
  const a = at(wall.a)
  const b = at(wall.b)
  return { kind: null, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, label: 'Aligned · Module line', guides: [{ a, b, label: 'Module line' }] }
}

/** The line a segment lies on, through its first end. */
function lineOf(g: readonly [Point, Point]): Line | null {
  const l = Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y)
  return l < 1e-9 ? null : { p: g[0], u: { x: (g[1].x - g[0].x) / l, y: (g[1].y - g[0].y) / l }, label: 'Module line' }
}

/** The foot of q on a segment and how far q is from it (the segment, not its line: a line stops where it stops). */
function onSegment(q: Point, g: readonly [Point, Point]): { foot: Point; d: number } | null {
  const l = lineOf(g)
  if (!l) return null
  const t = (q.x - g[0].x) * l.u.x + (q.y - g[0].y) * l.u.y
  const length = Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y)
  if (t < -tolEnd || t > length + tolEnd) return null
  const foot = { x: g[0].x + l.u.x * t, y: g[0].y + l.u.y * t }
  return { foot, d: Math.hypot(q.x - foot.x, q.y - foot.y) }
}
const tolEnd = 1e-6

/**
 * A point pulled onto the module lines (`guides`, segments): where two of them cross within the aperture `tol` of it, that node; else the foot
 * of the nearest one. null: none near. The mark is the node's intersection sign, or the line drawn through the point.
 */
export function snapToGuides(q: Point, guides: readonly (readonly [Point, Point])[], tol: number): { point: Point; mark: SnapMark } | null {
  const near = guides
    .map((g) => ({ g, hit: onSegment(q, g) }))
    .filter((x): x is { g: readonly [Point, Point]; hit: { foot: Point; d: number } } => x.hit !== null && x.hit.d <= tol)
    .sort((a, b) => a.hit.d - b.hit.d)
  if (near.length === 0) return null
  const first = near[0]
  const l1 = lineOf(first.g)!
  for (const other of near.slice(1)) {
    const l2 = lineOf(other.g)!
    const x = crossing(l1, l2)
    if (x && Math.hypot(x.x - q.x, x.y - q.y) <= tol * 1.5 && onSegment(x, first.g) && onSegment(x, other.g)) {
      return { point: x, mark: { kind: 'intersection', at: x, label: 'Intersection · Module line · Module line', guides: [] } }
    }
  }
  const foot = toLine(q, l1).foot
  return { point: foot, mark: { kind: null, at: foot, label: 'Module line', guides: [], lines: [l1] } }
}
