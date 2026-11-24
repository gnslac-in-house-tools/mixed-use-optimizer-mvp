// Where a dragged corner goes. Port of Plaza-Practiko `vistas/planta/iman/motor.ts` (`resolverIman`), on the world
// axes. First that applies wins (Decision "Snap first to what is drawn", 2026-11-04):
//   1. a reference point (endpoint, midpoint, intersection, center, quadrant)
//   2. perpendicular: square onto a straight edge, from `base` (the previous corner)
//   3. ortho (F8): the move from `orthoFrom` stays horizontal or vertical; on it, a tracking line it crosses
//   4. nearest: on an edge (a wall, a street's centreline, a court's edge), arcs included; where a tracking line crosses
//      that edge near the pointer, the crossing: a street started on another one, level with a warehouse's wall
//   5. tracking: the mass's axes through its corners, the extension of nearby walls (and their crossings); along a
//      single line, the grid decides (on a structural grid, the module line it crosses)
//   6. on a structural grid (Phase G.2b), its nearest module node within the point aperture
//   7. the grid; with it off, where the pointer is
// What is drawn comes before the grid (the user, 2026-11-04: a new mass "has no reference lines to the ones we already
// drew"): on a 3 m module the grid's nodes were always within reach, so they hid every alignment.
// Left out: Plaza's acquired points (tracking from points hovered earlier) and the fixed angle of its command line.
import type { Point } from '../../../model/schema.ts'
import { snapToGrid, stepLength, type Step } from './grid.ts'
import { SNAP_NAMES, type SnapKind, type SnapSettings } from './kinds.ts'
import { alongLine, crossing, snapToLines, toLine, wallLines, type Line } from './lines.ts'
import type { SnapMark, Targets } from './move.ts'
import { inSweep, nearestPoint, type SnapEdge } from './points.ts'

export interface ResolveInput {
  targets: Targets
  settings: SnapSettings
  /** Apertures (m): points, and lines / edges. */
  tolPoint: number
  tolLine: number
  /** Grid step (m), or the structural grid whose modules it snaps to (Phase G.2b). */
  step: Step
  /** The previous corner: perpendicular starts from it (and ortho, unless `orthoFrom` says otherwise). */
  base?: Point | null
  /**
   * Where ortho starts. A dragged corner passes its own start point, so it moves straight, as AutoCAD's grip
   * stretch does: from the previous corner (Plaza's choice, made for drawing) a corner level with its neighbour
   * could never move up or down. A drawing tool leaves it out: ortho then starts from `base`.
   */
  orthoFrom?: Point | null
  /** The tool's own tracking lines (the mass's axes through its other corners). */
  tracking?: Line[]
}

export type SnapHow = SnapKind | 'tracking' | 'ortho' | 'grid' | 'free'

export interface Resolved {
  point: Point
  how: SnapHow
  /** null for the grid and a free point: nothing to say. */
  mark: SnapMark | null
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const named = (kind: SnapKind, label: string) => `${SNAP_NAMES[kind]} · ${label}`
const joined = (lines: Line[]) => [...new Set(lines.map((l) => l.label))].join(' · ')
const pointMark = (kind: SnapKind, p: Point, label: string): SnapMark => ({ kind, at: p, label: named(kind, label), guides: [] })
const lineMark = (p: Point, lines: Line[]): SnapMark => ({ kind: null, at: p, label: joined(lines), guides: [], lines })

/** Along a line, the grid's place: a structural grid's module line it crosses (its node, back onto the line), else whole steps. */
function onGridAlong(foot: Point, r: Line, grid: Step): Point {
  if (typeof grid === 'number') return alongLine(foot, r, grid)
  const node = snapToGrid(foot, grid)
  const t = (node.x - r.p.x) * r.u.x + (node.y - r.p.y) * r.u.y
  return { x: r.p.x + r.u.x * t, y: r.p.y + r.u.y * t }
}

/** Where a tracking line crosses a straight edge, within `tol` of q (the nearest such). */
function crossingOnEdge(q: Point, edge: { a: Point; b: Point }, lines: Line[], tol: number): { p: Point; r: Line } | null {
  const u = { x: edge.b.x - edge.a.x, y: edge.b.y - edge.a.y }
  const len = Math.hypot(u.x, u.y)
  if (len < 1e-9) return null
  const e: Line = { p: edge.a, u: { x: u.x / len, y: u.y / len }, label: '' }
  let best: { p: Point; r: Line } | null = null
  let dm = tol
  for (const r of lines) {
    const x = crossing(e, r)
    if (!x) continue
    const t = (x.x - edge.a.x) * e.u.x + (x.y - edge.a.y) * e.u.y
    if (t < -1e-6 || t > len + 1e-6) continue
    const d = dist(x, q)
    if (d <= dm) {
      dm = d
      best = { p: x, r }
    }
  }
  return best
}

/** The foot of the perpendicular from `base` onto the straight edge closest to q, within `tol`. */
function perpendicular(q: Point, base: Point, edges: SnapEdge[], tol: number): { p: Point; label: string } | null {
  let best: { p: Point; label: string } | null = null
  let dm = tol
  for (const e of edges) {
    if (e.arc) continue
    const ab = { x: e.b.x - e.a.x, y: e.b.y - e.a.y }
    const l2 = ab.x * ab.x + ab.y * ab.y
    if (l2 < 1e-18) continue
    const t = ((base.x - e.a.x) * ab.x + (base.y - e.a.y) * ab.y) / l2
    if (t < 0 || t > 1) continue
    const foot = { x: e.a.x + ab.x * t, y: e.a.y + ab.y * t }
    // from a point already on the edge there is no perpendicular to look for
    if (dist(foot, base) < 1e-6) continue
    const d = dist(q, foot)
    if (d <= dm) {
      dm = d
      best = { p: foot, label: e.label }
    }
  }
  return best
}

/** The point closest to q on any edge (straight or arc), within `tol`, and that edge. */
function nearest(q: Point, edges: SnapEdge[], tol: number): { p: Point; label: string; edge: SnapEdge } | null {
  let best: { p: Point; label: string; edge: SnapEdge } | null = null
  let dm = tol
  for (const e of edges) {
    let foot: Point | null
    if (!e.arc) {
      const ab = { x: e.b.x - e.a.x, y: e.b.y - e.a.y }
      const l2 = ab.x * ab.x + ab.y * ab.y
      const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((q.x - e.a.x) * ab.x + (q.y - e.a.y) * ab.y) / l2))
      foot = { x: e.a.x + ab.x * t, y: e.a.y + ab.y * t }
    } else {
      const ang = Math.atan2(q.y - e.center.y, q.x - e.center.x)
      foot = inSweep(ang, e.start, e.sweep) ? { x: e.center.x + e.radius * Math.cos(ang), y: e.center.y + e.radius * Math.sin(ang) } : null
    }
    if (!foot) continue
    const d = dist(q, foot)
    if (d <= dm) {
      dm = d
      best = { p: foot, label: e.label, edge: e }
    }
  }
  return best
}

export function resolveSnap(q: Point, e: ResolveInput): Resolved {
  const { targets, settings: s, tolPoint, tolLine } = e
  // along a line, the grid's step as one length; at the end, its nodes
  const grid = s.grid ? e.step : 0
  const step = stepLength(grid)
  const base = e.base ?? null
  const orthoFrom = e.orthoFrom ?? base

  if (s.on) {
    const p = nearestPoint(q, targets.points, s, tolPoint)
    if (p) return { point: { x: p.p.x, y: p.p.y }, how: p.kind, mark: pointMark(p.kind, p.p, p.label) }
    if (s.kinds.perpendicular && base) {
      const r = perpendicular(q, base, targets.edges, tolLine)
      if (r) return { point: r.p, how: 'perpendicular', mark: pointMark('perpendicular', r.p, r.label) }
    }
  }

  const tracking = s.on && s.align ? [...(e.tracking ?? []), ...wallLines(targets.walls)] : []

  if (s.ortho && orthoFrom) {
    const d = { x: q.x - orthoFrom.x, y: q.y - orthoFrom.y }
    const ortho: Line = { p: orthoFrom, u: Math.abs(d.x) >= Math.abs(d.y) ? { x: 1, y: 0 } : { x: 0, y: 1 }, label: 'Ortho' }
    const { foot } = toLine(q, ortho)
    // on the ortho line, a tracking line that crosses it near the pointer
    let best: { p: Point; r: Line } | null = null
    let dm = tolLine * 1.5
    for (const r of tracking) {
      const x = crossing(ortho, r)
      if (!x) continue
      const dd = dist(x, foot)
      if (dd <= dm) {
        dm = dd
        best = { p: x, r }
      }
    }
    if (best) return { point: best.p, how: 'tracking', mark: lineMark(best.p, [ortho, best.r]) }
    const p = alongLine(foot, ortho, step)
    return { point: p, how: 'ortho', mark: lineMark(p, [ortho]) }
  }

  if (s.on && s.kinds.nearest) {
    const r = nearest(q, targets.edges, tolLine)
    if (r) {
      // on the edge, level with a wall: where that wall's line crosses it
      const x = r.edge.arc ? null : crossingOnEdge(q, r.edge, tracking, tolLine * 1.5)
      if (x) return { point: x.p, how: 'nearest', mark: { ...pointMark('nearest', x.p, `${r.label} · ${x.r.label}`), lines: [x.r] } }
      return { point: r.p, how: 'nearest', mark: pointMark('nearest', r.p, r.label) }
    }
  }

  if (tracking.length > 0) {
    const r = snapToLines(q, tracking, tolLine, 0)
    if (r) {
      const point = r.lines.length === 1 ? onGridAlong(r.point, r.lines[0], grid) : r.point
      return { point, how: 'tracking', mark: lineMark(point, r.lines) }
    }
  }

  if (typeof grid !== 'number') {
    const node = snapToGrid(q, grid)
    if (dist(node, q) <= tolPoint) return { point: node, how: 'grid', mark: { kind: 'intersection', at: node, label: 'Grid module', guides: [] } }
  }

  if (step > 0) return { point: snapToGrid(q, grid), how: 'grid', mark: null }
  return { point: { x: q.x, y: q.y }, how: 'free', mark: null }
}
