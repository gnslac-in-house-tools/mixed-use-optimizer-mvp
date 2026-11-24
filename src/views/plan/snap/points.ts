// Point snap. Port of Plaza-Practiko `vistas/planta/iman/motor.ts` (`geometriaDe`, `puntosPropios`, `pegarForma`).
// Pure: the reference points are built ONCE per drag (the other masses do not move meanwhile) and `snapShape` runs on
// every pointer move.
import type { Contour, Point } from '../../../model/schema.ts'
import { arcOfEdge, bulgeAt, contourToPolygon, cornerArc, cornerCut } from '../../../engine/geom/contour.ts'
import { centroid } from '../../../engine/geom/polygon.ts'
import { SNAP_PRIORITY, type SnapKind, type SnapSettings } from './kinds.ts'

/** A contour that attracts: a mass, the site, the setback line; or an open line, a road's centreline (Decision "Road snap"). */
export interface Source {
  contour: Contour
  /** How it is named next to the cursor: "Endpoint · Warehouse 2". */
  label: string
  /** Its centroid attracts as Center (masses do; the site does not). */
  centroid?: boolean
  /** An open line: no edge from its last point back to its first, no rounded corners (a road; one point: a gate). */
  open?: boolean
  /**
   * false: its walls are no tracking lines for a point (Decision "Snap first to what is drawn"): the site's and the
   * setback's long, often oblique edges and a curved street's short pieces would run across the whole plan. They still
   * attract by their points and edges, and a mass moved still lines up with them.
   */
  track?: boolean
  /**
   * false: its edges cross nothing for the snap (Decision "Drawing layers"): a reference drawing's thousands of short
   * pieces would make the crossings of every pair. It still attracts by its points and edges.
   */
  crossings?: boolean
  /** Only its edges attract (nearest, perpendicular): no points, no walls to line up with. A contour's thousands of
   *  corners would bury the rest (Decision "Drawing layers"). */
  edgesOnly?: boolean
}

/** How many edges a source has: a closed outline one per corner, an open line one fewer. */
const edgeCount = (src: Source) => (src.open ? Math.max(0, src.contour.vertices.length - 1) : src.contour.vertices.length)

export interface SnapPoint {
  p: Point
  kind: SnapKind
  label: string
}

const EPS = 1e-9
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x

/** Where segments ab and cd cross (end points included), with the parameter along each. */
function segmentCrossing(a: Point, b: Point, c: Point, d: Point): { p: Point; t: number; u: number } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const s = { x: d.x - c.x, y: d.y - c.y }
  const den = cross(r, s)
  if (Math.abs(den) < EPS * Math.max(1, Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) return null // parallel
  const ac = { x: c.x - a.x, y: c.y - a.y }
  const t = cross(ac, s) / den
  const u = cross(ac, r) / den
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { p: { x: a.x + r.x * t, y: a.y + r.y * t }, t, u }
}

const atEnd = (t: number) => Math.abs(t) < 1e-6 || Math.abs(t - 1) < 1e-6

/** Does angle `ang` fall inside the arc that starts at `start` and sweeps `sweep` (rad, signed)? */
export function inSweep(ang: number, start: number, sweep: number): boolean {
  const d = sweep >= 0 ? ang - start : start - ang
  return ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) <= Math.abs(sweep) + 1e-9
}

/** An edge that a corner can slide on (nearest) or drop square onto (perpendicular, straight edges only). */
export type SnapEdge =
  | { arc: false; a: Point; b: Point; label: string }
  | { arc: true; a: Point; b: Point; center: Point; radius: number; start: number; sweep: number; label: string }

/** Every edge of the sources, straight or arc (zero-length ones skipped). */
export function edgesOf(sources: Source[]): SnapEdge[] {
  const out: SnapEdge[] = []
  for (const src of sources) {
    const v = src.contour.vertices
    const n = v.length
    for (let i = 0; i < edgeCount(src) && n >= 2; i++) {
      const a = { x: v[i].x, y: v[i].y }
      const b = { x: v[(i + 1) % n].x, y: v[(i + 1) % n].y }
      if (dist(a, b) < EPS) continue
      const bulge = bulgeAt(src.contour, i)
      if (bulge === 0) out.push({ arc: false, a, b, label: src.label })
      else {
        const { center, radius, sweep } = arcOfEdge(a, b, bulge)
        out.push({ arc: true, a, b, center, radius, start: Math.atan2(a.y - center.y, a.x - center.x), sweep, label: src.label })
      }
    }
  }
  return out
}

/**
 * The reference points of some sources: corners (endpoint), edge middles (midpoint, on the arc for arc edges),
 * centres (of arc edges, of rounded corners, and centroids), arc points at 0° / 90° / 180° / 270° (quadrant) and the
 * crossings of straight edges (intersection).
 */
export function snapPointsOf(sources: Source[]): SnapPoint[] {
  const points: SnapPoint[] = []
  const straight: { a: Point; b: Point; source: number }[] = []
  sources.forEach((src, k) => {
    if (src.edgesOnly) return
    const c = src.contour
    const v = c.vertices
    const n = v.length
    const label = src.label
    const crosses = src.crossings !== false
    for (const q of v) points.push({ p: { x: q.x, y: q.y }, kind: 'endpoint', label })
    for (let i = 0; i < edgeCount(src) && n >= 2; i++) {
      const a = { x: v[i].x, y: v[i].y }
      const b = { x: v[(i + 1) % n].x, y: v[(i + 1) % n].y }
      if (dist(a, b) < EPS) continue
      const bulge = bulgeAt(c, i)
      if (bulge === 0) {
        if (crosses) straight.push({ a, b, source: k })
        points.push({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'midpoint', label })
        continue
      }
      const { center, radius, sweep } = arcOfEdge(a, b, bulge)
      const start = Math.atan2(a.y - center.y, a.x - center.x)
      const half = start + sweep / 2
      points.push({ p: { x: center.x + radius * Math.cos(half), y: center.y + radius * Math.sin(half) }, kind: 'midpoint', label })
      points.push({ p: center, kind: 'center', label })
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2
        if (inSweep(ang, start, sweep))
          points.push({ p: { x: center.x + radius * Math.cos(ang), y: center.y + radius * Math.sin(ang) }, kind: 'quadrant', label })
      }
    }
    if (n >= 3 && !src.open) {
      for (let i = 0; i < n; i++) {
        const cut = cornerCut(c, i)
        if (cut) {
          // a chamfer: the two ends of the cut and the middle of it
          points.push(
            { p: cut.p1, kind: 'endpoint', label },
            { p: cut.p2, kind: 'endpoint', label },
            { p: { x: (cut.p1.x + cut.p2.x) / 2, y: (cut.p1.y + cut.p2.y) / 2 }, kind: 'midpoint', label },
          )
          continue
        }
        const e = cornerArc(c, i)
        if (!e) continue
        points.push({ p: e.mid, kind: 'midpoint', label }, { p: e.center, kind: 'center', label })
      }
      // from the true outline (arcs and rounded corners), not from the polygon of vertices
      if (src.centroid) points.push({ p: centroid(contourToPolygon(c)), kind: 'center', label })
    }
  })
  // crossings between straight edges (same source or not); two edges that only share an end point do not count
  for (let i = 0; i < straight.length; i++) {
    for (let j = i + 1; j < straight.length; j++) {
      const x = segmentCrossing(straight[i].a, straight[i].b, straight[j].a, straight[j].b)
      if (!x || (atEnd(x.t) && atEnd(x.u))) continue
      const li = sources[straight[i].source].label
      const lj = sources[straight[j].source].label
      points.push({ p: x.p, kind: 'intersection', label: straight[i].source === straight[j].source ? li : `${li} × ${lj}` })
    }
  }
  return points
}

/** The points of a shape that stick when it moves: its corners, edge middles and centres (no crossings or quadrants). */
export function ownPoints(c: Contour): SnapPoint[] {
  return snapPointsOf([{ contour: c, label: '', centroid: true }]).filter((q) => q.kind !== 'intersection' && q.kind !== 'quadrant')
}

export function movePoints(ps: SnapPoint[], d: Point): SnapPoint[] {
  return ps.map((q) => ({ ...q, p: { x: q.p.x + d.x, y: q.p.y + d.y } }))
}

/** Is `d` better than the best so far `dm`? Clearly closer, or a tie (within tol / 12) won by priority. */
function beats(d: number, kind: SnapKind, dm: number, best: SnapKind | null, tol: number): boolean {
  const tie = tol / 12
  return best === null || d < dm - tie || (Math.abs(d - dm) <= tie && SNAP_PRIORITY.indexOf(kind) < SNAP_PRIORITY.indexOf(best))
}

/** The enabled reference point closest to q, within `tol`. */
export function nearestPoint(q: Point, targets: SnapPoint[], s: SnapSettings, tol: number): SnapPoint | null {
  let best: SnapPoint | null = null
  let dm = Infinity
  for (const c of targets) {
    if (!s.kinds[c.kind]) continue
    const d = dist(q, c.p)
    if (d > tol) continue
    if (beats(d, c.kind, dm, best?.kind ?? null, tol)) {
      best = c
      dm = d
    }
  }
  return best
}

export interface ShapeSnap {
  /** What to add to the drag offset so that `from` lands on `to`. */
  correction: Point
  from: SnapPoint
  to: SnapPoint
}

/**
 * A moving shape sticks by its points: the closest pair (own point, reference point) within `tol`, both of enabled
 * kinds; on a tie, by the priority of the reference point.
 */
export function snapShape(own: SnapPoint[], targets: SnapPoint[], s: SnapSettings, tol: number): ShapeSnap | null {
  if (!s.on) return null
  let best: { from: SnapPoint; to: SnapPoint } | null = null
  let dm = Infinity
  for (const from of own) {
    if (!s.kinds[from.kind]) continue
    const to = nearestPoint(from.p, targets, s, tol)
    if (!to) continue
    const d = dist(from.p, to.p)
    if (beats(d, to.kind, dm, best?.to.kind ?? null, tol)) {
      best = { from, to }
      dm = d
    }
  }
  if (!best) return null
  return { correction: { x: best.to.p.x - best.from.p.x, y: best.to.p.y - best.from.p.y }, ...best }
}
