// The block's shape (Decisions "Block shape", "Outline in metres"), pure: its outline in metres in the type's frame (column
// line A / 1 at 0, 0), counter-clockwise and a simple polygon, the walls' reference line, each edge with an id that what
// stands on it names; its holes, contours in metres. On a box of another size (step 2, a variant, the optimizer) each
// corner keeps its distance in m from the nearer wall of the box it was drawn on, and so does each element's module on a
// copy (Decision "Elements by module": `anchorModule`). Read in m: each edge on its reference line, its wall's outer face out
// from it by its facade's offset and its wall; the holes; the bays along an edge. An edge parallel to a grid axis spans the
// whole modules of that axis on its span; an angled one spans none (nothing stands on it).
// And the edits the plans make of it, `ShapeEdit`s in module lines (an outline whose corners stand on them: `cornersOnLines`),
// carried out on the lines and written back in metres: an edge moved, a stretch of an edge pulled out or pushed in, a corner
// removed, a hole drawn, a box fitted round it. The frozen module-line engine of block format 4 is legacy/lines.ts.
import type { Contour, HallElement, HallSide, HallZone, Id, Morphology, OutlineCorner, Point, Polygon, ShapeHole, Vertex, WarehouseType } from '../../../model/schema.ts'
import { arcBox, rawPolygon, withBulges, type PolygonTag } from '../../../engine/geom/contour.ts'
import { insetEdges, offsetEdges } from '../../../engine/geom/offsetEdges.ts'
import { isSimple, pointInPolygon, segmentsTouch } from '../../../engine/geom/polygon.ts'
import { endsKeeping, hallEnds, moduleAt, nearestLine, nearestModule, runsOf, type Bay, type HallRuns, type Run } from './bays.ts'

/** m: two lengths this close are the same. */
const ON = 0.005
/** m: two corners this close are one. */
const SAME = 1e-6
const mm = (v: number) => Math.round(v * 1000) / 1000
const um = (v: number) => Math.round(v * 1e6) / 1e6 + 0

/** What a block says when a dock, a door or a pattern, and a truck court, are put on a wall that is not along the grid (Phase D.2). */
export const ANGLED_ELEMENTS = 'Docks, doors and patterns go on walls along the grid'
export const ANGLED_COURT = 'A truck court goes on a wall along the grid'

/** The box's edges' ids, a new type's: its front, its right, its back, its left. */
export const BOX_EDGES = ['e1', 'e2', 'e3', 'e4'] as const

/** Whether an outline is drawn: three corners at least (fewer: the box). */
export const drawn = (c: readonly unknown[] | undefined): boolean => (c?.length ?? 0) >= 3

/** A box of `length` × `width` m as an outline. */
export function boxOutline(length: number, width: number): OutlineCorner[] {
  return [
    { id: 'e1', x: 0, y: 0 },
    { id: 'e2', x: length, y: 0 },
    { id: 'e3', x: length, y: width },
    { id: 'e4', x: 0, y: width },
  ]
}

/** The modules a run has. */
const count = (r: Run) => r.modules.length - 1

/**
 * The size of the box an outline was drawn on (m): its corners' farthest from column line A / 1, and an outward arc's farthest point
 * (`arcs`: its bulges keyed by the corner an edge starts at; Phase D.3: an arc lies inside its box, not past it). An inward arc, or none:
 * the corners'.
 */
export function ownBox(c: Pick<OutlineCorner, 'x' | 'y'>[], arcs?: Morphology['arcs']): { x: number; y: number } {
  const x = Math.max(...c.map((k) => k.x))
  const y = Math.max(...c.map((k) => k.y))
  if (!arcs || !Object.keys(arcs).length) return { x, y }
  const far = arcBox({ vertices: c.map((k) => ({ x: k.x, y: k.y, r: 0 })), arcs })
  return { x: Math.max(x, far.x1), y: Math.max(y, far.y1) }
}

/**
 * A module line of a box `own` modules long on one `now` long: one in the box's first half keeps its distance from the
 * low wall, one in its second half from the high wall. A box made shorter than its features allow folds the first
 * half's onto the second's (never past the walls). Module lines: zones and element modules (not the outline: `anchorM`).
 */
export function anchor(v: number, own: number, now: number): number {
  if (own === now) return v
  const d = now - own
  const low = v * 2 <= own
  const c = Math.floor(own / 2) + 1 + d
  const to = d > 0 ? (low ? v : v + d) : low ? Math.min(v, c) : v + d
  return Math.max(0, Math.min(now, to))
}

/**
 * A distance in m along a box `own` m long (its runs `ownRun`), kept on one `now` long (`nowRun`): one on a module line keeps its
 * module line (`anchor`: the nearer wall's count of modules), so a bump or a notch of whole modules stays one; any other keeps its
 * distance in m from the nearer wall, the box's first half from the low wall and its second half from the high wall. Shorter, the
 * first half's folds at the first module line past the middle of the box it was drawn on, never past the walls.
 */
export function anchorM(v: number, own: number, now: number, ownRun: Run, nowRun: Run): number {
  if (Math.abs(own - now) < ON) return v
  const k = onLine(ownRun, v)
  if (k !== null) return moduleAt(nowRun, anchor(k, count(ownRun), count(nowRun)))
  const d = now - own
  const low = v * 2 <= own + SAME
  let to = low ? v : v + d
  if (low && d < 0) {
    const n = count(ownRun)
    to = Math.min(v, moduleAt(ownRun, Math.min(n, Math.floor(n / 2) + 1)) + d)
  }
  return um(Math.max(0, Math.min(now, to)))
}

/**
 * A corner's two edges on one line, or a corner on itself: what an outline drops. Lost ids name the edge kept. (Metres or
 * module lines alike: two corners within a micrometre are one, three on a line are two; `collinear` false: only the corners on
 * themselves, so a corner put on a wall by hand stays until it is moved.) An edge that bulges (`bulge`) is never on its line.
 */
export function tidyOutline<C extends Pick<OutlineCorner, 'id' | 'x' | 'y'> & { bulge?: number }>(c: C[], collinear = true): { outline: C[]; renamed: Map<Id, Id> } {
  const pts = c.map((k) => ({ ...k }))
  const renamed = new Map<Id, Id>()
  const lose = (lost: Id, kept: Id) => {
    if (lost === kept) return
    renamed.set(lost, kept)
    for (const [k, v] of renamed) if (v === lost) renamed.set(k, kept)
  }
  let changed = true
  while (changed && pts.length >= 3) {
    changed = false
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      if (Math.abs(a.x - b.x) < SAME && Math.abs(a.y - b.y) < SAME) {
        // edge i has no length: its corner goes, the next keeps its own edge
        lose(a.id, b.id)
        pts.splice(i, 1)
        changed = true
        break
      }
    }
    if (changed || !collinear) continue
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n]
      const q = pts[i]
      const r = pts[(i + 1) % n]
      const u = { x: q.x - p.x, y: q.y - p.y }
      const v = { x: r.x - q.x, y: r.y - q.y }
      const cross = u.x * v.y - u.y * v.x
      if (Math.abs(cross) > 1e-9 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) continue
      // an arc edge is not on its chord's line
      if (p.bulge || q.bulge) continue
      // p → q and q → r on one line: one edge from p, the longer's id (and its own wall)
      const ahead = u.x * v.x + u.y * v.y > 0
      const longer = ahead && Math.abs(v.x) + Math.abs(v.y) > Math.abs(u.x) + Math.abs(u.y)
      const kept = longer ? q : p
      lose(longer ? p.id : q.id, kept.id)
      const { x: _x, y: _y, ...own } = kept
      pts[(i - 1 + n) % n] = { ...own, x: p.x, y: p.y } as C
      pts.splice(i, 1)
      changed = true
      break
    }
  }
  return { outline: pts, renamed }
}

/** Twice the signed area (counter-clockwise: positive). */
function twiceArea(c: Pick<OutlineCorner, 'x' | 'y'>[]): number {
  let s = 0
  c.forEach((p, i) => {
    const q = c[(i + 1) % c.length]
    s += p.x * q.y - q.x * p.y
  })
  return s
}

/** Whether an outline in metres is one: three corners at least, counter-clockwise, no edge under a centimetre, never meeting
 *  itself but at its corners. Its edges may run at any angle. */
export function validOutline(c: Pick<OutlineCorner, 'x' | 'y'>[]): boolean {
  const n = c.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) if (Math.hypot(c[(i + 1) % n].x - c[i].x, c[(i + 1) % n].y - c[i].y) < 0.01) return false
  if (twiceArea(c) <= 0) return false
  return isSimple(c.map((q) => ({ x: q.x, y: q.y })))
}

/** A point strictly inside a polygon (on its boundary is not). */
function strictlyInside(poly: Point[], q: Point): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 <= 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2))
    if (Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)) <= SAME) return false
  }
  return pointInPolygon(q, poly)
}

/**
 * Whether a hole fits an outline (metres): wholly inside it, apart from its edges, no corner of the outline inside the hole, and
 * apart from the other holes. A hole is a simple polygon of a decimetre in each way at least.
 */
export function holeFits(outline: Pick<OutlineCorner, 'x' | 'y'>[], h: Pick<ShapeHole, 'vertices'>, others: Pick<ShapeHole, 'vertices'>[] = []): boolean {
  const ring: Point[] = h.vertices.map((v) => ({ x: v.x, y: v.y }))
  if (ring.length < 3 || !isSimple(ring)) return false
  const xs = ring.map((q) => q.x)
  const ys = ring.map((q) => q.y)
  if (Math.max(...xs) - Math.min(...xs) < 0.1 || Math.max(...ys) - Math.min(...ys) < 0.1) return false
  const out: Point[] = outline.map((q) => ({ x: q.x, y: q.y }))
  if (!ring.every((q) => strictlyInside(out, q))) return false
  if (out.some((q) => pointInPolygon(q, ring) || ring.some((r) => Math.hypot(r.x - q.x, r.y - q.y) <= SAME))) return false
  const apart = (a: Point[], b: Point[]) => {
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segmentsTouch(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return false
    return !a.some((q) => pointInPolygon(q, b)) && !b.some((q) => pointInPolygon(q, a))
  }
  for (let i = 0; i < ring.length; i++) for (let j = 0; j < out.length; j++) if (segmentsTouch(ring[i], ring[(i + 1) % ring.length], out[j], out[(j + 1) % out.length])) return false
  return others.every((o) => apart(ring, o.vertices.map((v) => ({ x: v.x, y: v.y }))))
}

/**
 * A module of a box `own` modules long on one `now` long (Decision "Elements by module"): the module from line k to
 * k + 1 anchored as the lines are, one in the box's first half kept from the low wall, one in its second half from the
 * high wall; new modules come between them, the modules that go take theirs (two may fold onto one).
 */
export const anchorModule = (k: number, own: number, now: number): number => anchor(k, own - 1, now - 1)

/** m: the size of the box the shape was drawn on (its outline's; none drawn: the box it is on now). */
export function ownSize(m: Pick<Morphology, 'outline' | 'arcs'>, runs: HallRuns): { x: number; y: number } {
  return drawn(m.outline) ? ownBox(m.outline, m.arcs) : { x: runs.x.length, y: runs.y.length }
}

/** The modules of the box the shape was drawn on (its outline's size on the grid; none drawn: the box now's). */
export function ownModules(t: Pick<WarehouseType, 'grid' | 'hall' | 'morphology'>, runs: HallRuns): { x: number; y: number } {
  if (!drawn(t.morphology.outline)) return { x: count(runs.x), y: count(runs.y) }
  const size = ownBox(t.morphology.outline, t.morphology.arcs)
  if (Math.abs(size.x - runs.x.length) < ON && Math.abs(size.y - runs.y.length) < ON) return { x: count(runs.x), y: count(runs.y) }
  const own = runsOf(t, size)
  return { x: count(own.x), y: count(own.y) }
}

/** The outline on the box now (`runs`), each corner kept in m from its nearer wall; drawn wrong, or none: the box. */
export function outlineOn(t: Pick<WarehouseType, 'morphology' | 'grid' | 'hall'>, runs: HallRuns): OutlineCorner[] {
  const now = { x: runs.x.length, y: runs.y.length }
  const m = t.morphology
  if (!drawn(m.outline)) return boxOutline(now.x, now.y)
  const own = ownBox(m.outline, m.arcs)
  const same = Math.abs(own.x - now.x) < ON && Math.abs(own.y - now.y) < ON
  const run = same ? undefined : runsOf(t, own)
  const moved = same ? m.outline.map((k) => ({ ...k })) : m.outline.map((k) => ({ ...k, x: anchorM(k.x, own.x, now.x, run!.x, runs.x), y: anchorM(k.y, own.y, now.y, run!.y, runs.y) }))
  // a corner put on a wall by hand (Phase D.2: Insert) stays while the box is the one it was drawn on
  const { outline } = tidyOutline(moved, !same)
  return validOutline(outline) ? outline : boxOutline(now.x, now.y)
}

/** The arcs of the outline on the box now: the type's, while its corners are all there. */
function arcsOn(m: Pick<Morphology, 'outline' | 'arcs'>, outline: OutlineCorner[]): Morphology['arcs'] {
  return m.arcs && Object.keys(m.arcs).length && outline.length === m.outline.length ? m.arcs : undefined
}

/** A hole's corners' bounding box (m). */
function holeBox(h: Pick<ShapeHole, 'vertices'>) {
  const xs = h.vertices.map((q) => q.x)
  const ys = h.vertices.map((q) => q.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** The holes on the box now (each kept from the wall nearer its middle: its module lines when it stands on them, else its metres), those that fit the outline. */
export function holesOn(t: Pick<WarehouseType, 'morphology' | 'grid' | 'hall'>, runs: HallRuns): ShapeHole[] {
  const m = t.morphology
  const now = { x: runs.x.length, y: runs.y.length }
  const own = ownSize(m, runs)
  const same = Math.abs(own.x - now.x) < ON && Math.abs(own.y - now.y) < ON
  const ownRuns = same ? runs : runsOf(t, own)
  const outline = outlineOn(t, runs)
  const out: ShapeHole[] = []
  for (const h of m.holes) {
    let moved: ShapeHole = h
    if (!same) {
      const lines = holeOnLines(h, ownRuns)
      if (lines) {
        // on the module lines: the lines it stands on, moved whole modules
        const dx = lines.x[0] + lines.x[1] <= count(ownRuns.x) ? 0 : count(runs.x) - count(ownRuns.x)
        const dy = lines.y[0] + lines.y[1] <= count(ownRuns.y) ? 0 : count(runs.y) - count(ownRuns.y)
        if (dx || dy) moved = { ...h, ...holeToMetres({ ...lines, x: [lines.x[0] + dx, lines.x[1] + dx], y: [lines.y[0] + dy, lines.y[1] + dy] }, runs) }
      } else {
        const b = holeBox(h)
        const dx = Math.abs(own.x - now.x) < ON || b.x0 + b.x1 <= own.x ? 0 : um(now.x - own.x)
        const dy = Math.abs(own.y - now.y) < ON || b.y0 + b.y1 <= own.y ? 0 : um(now.y - own.y)
        if (dx || dy) moved = { ...h, vertices: h.vertices.map((v) => ({ ...v, x: um(v.x + dx), y: um(v.y + dy) })) }
      }
    }
    if (holeFits(outline, moved, out)) out.push(moved)
  }
  return out
}

/** The zones on the box now: each line kept from its nearer wall (with no outline drawn, the one that reached the farthest
 *  line reaches the box's last, as before Decision "Block shape"); none left empty. */
export function zonesOn(t: Pick<WarehouseType, 'morphology' | 'grid' | 'hall'>, runs: HallRuns): HallZone[] {
  const own = t.morphology.zones ?? []
  if (!own.length) return []
  const nx = count(runs.x)
  const ny = count(runs.y)
  const box = drawn(t.morphology.outline) ? ownModules(t, runs) : { x: Math.max(...own.map((z) => z.x[1])), y: Math.max(...own.map((z) => z.y[1])) }
  const fit = (v: number, o: number, n: number) => anchor(Math.min(v, o), o, n)
  return own
    .map((z) => ({ ...z, x: [fit(z.x[0], box.x, nx), fit(z.x[1], box.x, nx)] as [number, number], y: [fit(z.y[0], box.y, ny), fit(z.y[1], box.y, ny)] as [number, number] }))
    .filter((z) => z.x[1] > z.x[0] && z.y[1] > z.y[0])
}

// ---- In m -----------------------------------------------------------------------------------------------------------

/** An edge of the outline: its corners in m on its reference line and on the module lines (continuous: a whole number where
 *  it stands on one), the way it faces, its wall. */
export interface ShapeEdge {
  id: Id
  /** Its place in the outline: corner `index` is where it starts. */
  index: number
  /** Its corners in module lines (along x and y; between two lines, a fraction of the module). */
  from: Point
  to: Point
  /** m: from `a` to `b`, on its reference line. */
  a: Point
  b: Point
  side: HallSide
  /** Along x (it faces the front or the back) or along y; an angled one the nearer. */
  horizontal: boolean
  /** The grid axis it runs along; null: angled, and docks, doors, patterns and courts refuse it. */
  axis: 'x' | 'y' | null
  thickness: number
  offset: number
  /** On the box's own lines: moving it is the box's length or width (Decision "Block shape"). */
  outer: boolean
  /** The corner where it starts: its radius or chamfer; and the edge's own arc (a bulge: `Contour.arcs`). */
  r?: number
  chamfer?: [number, number]
  bulge?: number
}

/** The way out of a wall that faces `side`. */
export const outwardOf = (side: HallSide): Point => (side === 'front' ? { x: 0, y: -1 } : side === 'back' ? { x: 0, y: 1 } : side === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 })

/** The way an edge from a to b faces (its right: an outline counter-clockwise, a hole's clockwise). */
export function facing(a: Point, b: Point): HallSide {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'front' : 'back'
  return dy > 0 ? 'right' : 'left'
}

/** Which grid axis an edge from a to b runs along (within a micrometre): null when it is angled. */
export function axisOfEdge(a: Point, b: Point): 'x' | 'y' | null {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dy <= SAME && dx > SAME) return 'x'
  if (dx <= SAME && dy > SAME) return 'y'
  return null
}

/** m: how far an edge's wall's outer face stands out from its reference line. */
export const faceOf = (e: Pick<ShapeEdge, 'offset' | 'thickness'>): number => e.offset + e.thickness

/** The module line a distance `v` (m) along a run is: whole where it is on one, else a fraction of the module it is in. */
export function lineOf(r: Run, v: number): number {
  const n = count(r)
  if (v <= 0) return Math.abs(v) < ON ? 0 : v / r.module
  if (v >= r.length) return Math.abs(v - r.length) < ON ? n : n + (v - r.length) / r.module
  for (let k = 0; k < n; k++) {
    if (Math.abs(r.modules[k] - v) < ON) return k
    if (v < r.modules[k + 1] - ON) return k + (v - r.modules[k]) / (r.modules[k + 1] - r.modules[k])
  }
  return n
}

/** The edges of an outline (m) on the box's runs, with their walls (the envelope's thickness unless their own). */
export function edgesOf(outline: OutlineCorner[], runs: HallRuns, thickness: number, arcs?: Morphology['arcs']): ShapeEdge[] {
  const lx = runs.x.length
  const ly = runs.y.length
  const near = (u: number, v: number) => Math.abs(u - v) < ON
  return outline.map((c, i) => {
    const n = outline[(i + 1) % outline.length]
    const a = { x: c.x, y: c.y }
    const b = { x: n.x, y: n.y }
    const axis = axisOfEdge(a, b)
    const horizontal = axis === 'x' || (axis === null && Math.abs(b.x - a.x) >= Math.abs(b.y - a.y))
    const outer = axis === 'x' ? near(c.y, 0) || near(c.y, ly) : axis === 'y' ? near(c.x, 0) || near(c.x, lx) : false
    const bulge = arcs?.[String(i)]
    return {
      id: c.id,
      index: i,
      from: { x: lineOf(runs.x, c.x), y: lineOf(runs.y, c.y) },
      to: { x: lineOf(runs.x, n.x), y: lineOf(runs.y, n.y) },
      a,
      b,
      side: facing(a, b),
      horizontal,
      axis,
      thickness: c.thickness ?? thickness,
      offset: c.offset ?? 0,
      outer,
      ...(c.r ? { r: c.r } : {}),
      ...(c.chamfer ? { chamfer: c.chamfer } : {}),
      ...(bulge ? { bulge } : {}),
    }
  })
}

/** The type's outline and its edges on its runs (a copy's: its type with its overrides), holes and zones. */
export function shapeOf(
  t: Pick<WarehouseType, 'morphology' | 'envelope' | 'grid' | 'hall'>,
  runs: HallRuns,
): { outline: OutlineCorner[]; edges: ShapeEdge[]; holes: ShapeHole[]; zones: HallZone[]; arcs?: Morphology['arcs'] } {
  const outline = outlineOn(t, runs)
  const arcs = arcsOn(t.morphology, outline)
  return { outline, edges: edgesOf(outline, runs, t.envelope.thickness, arcs), holes: holesOn(t, runs), zones: zonesOn(t, runs), ...(arcs ? { arcs } : {}) }
}

/** The edges as a contour of their reference line: corner i where edge i starts, its radius or chamfer, its arcs. */
export function referenceContour(edges: ShapeEdge[]): Contour {
  const vertices: Vertex[] = edges.map((e) => ({ x: e.a.x, y: e.a.y, r: e.r ?? 0, ...(e.chamfer ? { chamfer: e.chamfer } : {}) }))
  return withBulges(
    vertices,
    edges.map((e) => e.bulge ?? 0),
  )
}

/**
 * The outer face of the walls round the outline: corner i where edge i starts, each line out by its face. An outline of
 * edges along the grid with sharp corners and no curve: the corners where its lines meet. Any other: the reference line
 * with each edge moved by its face (`offsetEdges`: angled edges, arcs, radii and chamfers kept); none made: the reference line.
 */
export function facePolygon(edges: ShapeEdge[]): Polygon {
  return faceShape(edges).polygon
}

/** Whether an outline is plain: every edge along the grid, turning square at every corner, every corner sharp, no curve (its face is where its lines meet). */
export const isPlain = (edges: readonly ShapeEdge[]): boolean => edges.length >= 4 && edges.every((e, i) => e.axis !== null && !e.r && !e.chamfer && !e.bulge && e.horizontal !== edges[(i + 1) % edges.length].horizontal)

/** The outer face as `facePolygon` makes it, with what each of its segments belongs to and the face as an exact contour. */
export interface FaceShape {
  polygon: Polygon
  /** For each point, what the segment that ends at it belongs to: an edge of the outline, or a corner's cut or arc (`rawPolygon`). */
  tags: PolygonTag[]
  /** The face with its curves exact (corner arcs as radii, arc edges as bulges); a plain outline's corners. */
  contour: Contour
}

/** The outer face of the walls round the outline (`facePolygon`), what each segment of it belongs to, and its exact contour. */
export function faceShape(edges: ShapeEdge[]): FaceShape {
  const n = edges.length
  if (isPlain(edges)) {
    const polygon = edges.map((e, i) => {
      const prev = edges[(i - 1 + n) % n]
      const h = e.horizontal ? e : prev
      const v = e.horizontal ? prev : e
      return { x: mm(v.a.x + outwardOf(v.side).x * faceOf(v)), y: mm(h.a.y + outwardOf(h.side).y * faceOf(h)) }
    })
    return { polygon, tags: polygon.map((_, i) => ({ edge: (i - 1 + n) % n })), contour: { vertices: polygon.map((q) => ({ x: q.x, y: q.y, r: 0 })) } }
  }
  const reference = referenceContour(edges)
  const face =
    offsetEdges(
      reference,
      edges.map((e) => faceOf(e)),
    ) ?? reference
  const tags: PolygonTag[] = []
  const polygon = rawPolygon(face, undefined, tags).map((q) => ({ x: mm(q.x), y: mm(q.y) }))
  return { polygon, tags, contour: face }
}

/**
 * The inner face of the walls: the reference line moved out by each edge's facade offset (the reference line itself where
 * there is none), as a contour; the reference when it cannot be made.
 */
export function innerContour(edges: ShapeEdge[]): Contour {
  const reference = referenceContour(edges)
  return (
    offsetEdges(
      reference,
      edges.map((e) => e.offset),
    ) ?? reference
  )
}

/** A hole's bounding rectangle (m), its walls' outer face `thickness` m in from it. */
export function holeRect(h: Pick<ShapeHole, 'vertices'>, thickness = 0): { x0: number; y0: number; x1: number; y1: number } {
  const b = holeBox(h)
  return { x0: mm(b.x0 + thickness), y0: mm(b.y0 + thickness), x1: mm(b.x1 - thickness), y1: mm(b.y1 - thickness) }
}

/** Whether a hole is a rectangle along the grid's axes. */
export function isRectHole(h: Pick<ShapeHole, 'vertices' | 'arcs'>): boolean {
  if (h.vertices.length !== 4 || (h.arcs && Object.keys(h.arcs).length) || h.vertices.some((v) => v.r || v.chamfer)) return false
  const b = holeBox({ vertices: h.vertices })
  return h.vertices.every((v) => (Math.abs(v.x - b.x0) < SAME || Math.abs(v.x - b.x1) < SAME) && (Math.abs(v.y - b.y0) < SAME || Math.abs(v.y - b.y1) < SAME))
}

/** A rectangle of corners (m) as a contour, counter-clockwise. */
export function rectContour(x0: number, y0: number, x1: number, y1: number): Vertex[] {
  return [
    { x: x0, y: y0, r: 0 },
    { x: x1, y: y0, r: 0 },
    { x: x1, y: y1, r: 0 },
    { x: x0, y: y1, r: 0 },
  ]
}

/** A hole's walls' outer face: the hole `thickness` m in from its line, counter-clockwise. A rectangle: its corners moved in; any other
 *  contour: inset by `insetEdges` (the contour itself when it cannot be). */
export function holeFace(h: ShapeHole, thickness: number): Polygon {
  if (isRectHole(h)) {
    const r = holeRect(h, thickness)
    return [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ]
  }
  const c: Contour = { vertices: h.vertices, ...(h.arcs ? { arcs: h.arcs } : {}) }
  const inset = insetEdges(
    c,
    h.vertices.map(() => thickness),
  )
  return rawPolygon(inset ?? c).map((q) => ({ x: mm(q.x), y: mm(q.y) }))
}

/** Whether a point is strictly inside a hole's line (m). */
export function inHole(h: Pick<ShapeHole, 'vertices'>, q: Point): boolean {
  return strictlyInside(
    h.vertices.map((v) => ({ x: v.x, y: v.y })),
    q,
  )
}

/** The bays along an edge: the run's, cut to it (one cut short is an end bay). */
export function edgeBays(runs: HallRuns, e: Pick<ShapeEdge, 'a' | 'b' | 'horizontal'>): Bay[] {
  const r = e.horizontal ? runs.x : runs.y
  const lo = Math.min(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
  const hi = Math.max(e.horizontal ? e.a.x : e.a.y, e.horizontal ? e.b.x : e.b.y)
  return r.bays.flatMap((b) => {
    const l = Math.max(b.lo, lo)
    const h = Math.min(b.hi, hi)
    if (h - l <= ON) return []
    const cut = l > b.lo + ON || h < b.hi - ON
    return [{ lo: l, hi: h, end: b.end || cut, modules: cut ? Math.max(1, Math.round((h - l) / ((b.hi - b.lo) / b.modules))) : b.modules }]
  })
}

/** m along an edge's line: x for one along x, y for one along y. */
export const alongEdge = (e: Pick<ShapeEdge, 'horizontal'>, q: Point): number => (e.horizontal ? q.x : q.y)

// ---- Elements by module (Decision "Elements by module") -------------------------------------------------------------
// A type's elements are counted on its box as it is now (its hall's runs): an edit of its box (step 2, step 1, its
// shape fitted round a bump) moves them onto the new box once. A copy's are counted on the box its own outline was drawn
// on (a copy keeps its own elements only with its own outline), or, its type's, on the type's box; on a copy of another
// size they are anchored as the outline's corners are (`typeWith`).

/** The modules an edge spans along its axis: from module line `lo` to `hi`, the whole ones on its span (a partial module at
 *  a wall's end takes none); an angled edge spans none. */
export function edgeModules(e: Pick<ShapeEdge, 'from' | 'to' | 'horizontal'> & Partial<Pick<ShapeEdge, 'axis'>>): { lo: number; hi: number } {
  if (e.axis === null) return { lo: 0, hi: 0 }
  const a = e.horizontal ? e.from.x : e.from.y
  const b = e.horizontal ? e.to.x : e.to.y
  const lo = Math.ceil(Math.min(a, b) - SAME)
  const hi = Math.floor(Math.max(a, b) + SAME)
  return { lo, hi: Math.max(lo, hi) }
}

/** What makes two elements one: their kind (a pattern's name too), their edge and their module (`module`: another). */
export const elementKey = (el: Pick<HallElement, 'kind' | 'name' | 'edge' | 'module'>, module = el.module): string => `${el.kind}|${el.kind === 'pattern' ? (el.name ?? '') : ''}|${el.edge}|${module}`

/**
 * Whether elements `ids` may slide `by` whole modules along their edges together (Decision "Multi-selection", BE.9: all
 * or none): each still on its edge's span, none onto a module holding one of its kind (a pattern of its name) not slid
 * with it. `elements` as they stand on the box, its outline's `edges`. Not a move (0), or none of them there: false.
 */
export function canSlide(elements: readonly HallElement[], edges: readonly ShapeEdge[], ids: readonly Id[], by: number): boolean {
  const k = Math.round(by)
  if (k === 0 || !Number.isFinite(by)) return false
  const these = new Set(ids)
  const moving = elements.filter((x) => these.has(x.id))
  if (!moving.length) return false
  const fits = moving.every((x) => {
    const e = edges.find((d) => d.id === x.edge)
    if (!e) return false
    const span = edgeModules(e)
    return x.module + k >= span.lo && x.module + k + 1 <= span.hi
  })
  if (!fits) return false
  const staying = new Set(elements.filter((x) => !these.has(x.id)).map((x) => elementKey(x)))
  return !moving.some((x) => staying.has(elementKey(x, x.module + k)))
}

/** Where an element on `module` of its edge stands (m along the edge's line): the module's centre. */
export function moduleSpot(runs: HallRuns, e: Pick<ShapeEdge, 'horizontal'>, module: number): number {
  const r = e.horizontal ? runs.x : runs.y
  return mm((moduleAt(r, module) + moduleAt(r, module + 1)) / 2)
}

/**
 * A type's elements as they stand on its box now (`runs`, its outline's `edges`; their modules counted on it): one
 * whose edge is gone or whose module is off its edge's span dropped; two of one kind (a pattern of one name) on one
 * edge and module: the first kept.
 */
export function elementsOn(t: Pick<WarehouseType, 'elements'>, _runs: HallRuns, edges: ShapeEdge[]): HallElement[] {
  const seen = new Set<string>()
  const out: HallElement[] = []
  for (const el of t.elements) {
    const e = edges.find((x) => x.id === el.edge)
    if (!e) continue
    const span = edgeModules(e)
    const key = elementKey(el)
    if (el.module < span.lo || el.module + 1 > span.hi || seen.has(key)) continue
    seen.add(key)
    out.push(el)
  }
  return out
}

/** Whether an outline's edge runs along x, by its id (none of its, or an angled one: undefined). */
export function axisOf(outline: Pick<OutlineCorner, 'id' | 'x' | 'y'>[]): (edge: Id) => boolean | undefined {
  return (edge) => {
    const i = outline.findIndex((c) => c.id === edge)
    if (i < 0) return undefined
    const axis = axisOfEdge(outline[i], outline[(i + 1) % outline.length])
    return axis === null ? undefined : axis === 'x'
  }
}

/**
 * Elements counted on a box `own` modules long and wide, on one `now` (a longer or shorter box, Decision "Block shape"):
 * each module anchored along its edge's axis (`horizontal`) as the corners are; one on an edge of no axis as it is.
 * Two that fold onto one module, or one off its edge, `elementsOn` leaves out.
 */
export function elementsAnchored(elements: HallElement[], horizontal: (edge: Id) => boolean | undefined, own: { x: number; y: number }, now: { x: number; y: number }): HallElement[] {
  if (own.x === now.x && own.y === now.y) return elements
  return elements.map((el) => {
    const h = horizontal(el.edge)
    if (h === undefined) return el
    const module = anchorModule(el.module, h ? own.x : own.y, h ? now.x : now.y)
    return module === el.module ? el : { ...el, module }
  })
}

/**
 * Elements on a box laid on another grid (step 1, the controller's ruling for Decision "Elements by module") or relaid
 * at its size: each on the module whose centre is nearest where it stood (`before` runs, m along its edge), held to its
 * edge's span after (`edges`: none dropped while its edge is there). Two of one kind (a pattern of one name) that fall
 * on one module (late review, the controller's ruling): the one nearer that module's centre keeps it, the other goes to
 * the free module of its edge whose centre is nearest where it stood, if that centre is within one module (its width,
 * m) of where it stood (as near two: the one towards where it stood); none so near, they merge (`mergedOf` counts
 * them). So nothing spills past its run or into end bays that had none.
 */
export function elementsNearest(elements: HallElement[], horizontal: (edge: Id) => boolean | undefined, before: HallRuns, after: HallRuns, edges: ShapeEdge[]): HallElement[] {
  type Spot = { el: HallElement; at: number; r: Run; lo: number; hi: number; k: number }
  const spots: (Spot | null)[] = elements.map((el) => {
    const h = horizontal(el.edge)
    const e = edges.find((x) => x.id === el.edge)
    if (h === undefined || !e) return null
    const span = edgeModules(e)
    const r = h ? after.x : after.y
    const at = moduleSpot(before, { horizontal: h }, el.module)
    return { el, at, r, lo: span.lo, hi: span.hi, k: Math.max(span.lo, Math.min(span.hi - 1, nearestModule(r, at))) }
  })
  const centre = (s: Spot, k: number) => (moduleAt(s.r, k) + moduleAt(s.r, k + 1)) / 2
  const off = (s: Spot, k: number) => Math.abs(centre(s, k) - s.at)
  // the nearer to its module first, so it keeps it whatever the order (ties: as listed)
  const order = spots.map((s, i) => ({ s, i })).filter((x): x is { s: Spot; i: number } => x.s !== null)
  order.sort((a, b) => off(a.s, a.s.k) - off(b.s, b.s.k) || a.i - b.i)
  const held = new Set<string>()
  const placed = new Map<number, number>()
  for (const { s, i } of order) {
    let k: number | null = held.has(elementKey(s.el, s.k)) ? null : s.k
    if (k === null)
      for (let j = s.lo; j < s.hi; j++) {
        // a neighbour only: its centre within its own width of where it stood
        if (held.has(elementKey(s.el, j)) || off(s, j) > moduleAt(s.r, j + 1) - moduleAt(s.r, j) + 1e-9) continue
        const d = off(s, j) - (k === null ? Infinity : off(s, k))
        // nearer where it stood; as near, the one towards where it stood (from the module it fell on)
        if (k === null || d < -1e-9 || (Math.abs(d) <= 1e-9 && Math.sign(j - s.k) === Math.sign(s.at - centre(s, s.k)))) k = j
      }
    if (k === null) continue
    held.add(elementKey(s.el, k))
    placed.set(i, k)
  }
  const out: HallElement[] = []
  elements.forEach((el, i) => {
    const k = placed.get(i)
    if (k !== undefined) out.push(k === el.module ? el : { ...el, module: k })
  })
  return out
}

/** How many elements of each kind an edit merged (`before`, `after`: a type's elements; none lost: empty). */
export function mergedOf(before: HallElement[], after: HallElement[]): Partial<Record<HallElement['kind'], number>> {
  const out: Partial<Record<HallElement['kind'], number>> = {}
  for (const kind of ['dock', 'door', 'pattern'] as const) {
    const lost = before.filter((e) => e.kind === kind).length - after.filter((e) => e.kind === kind).length
    if (lost > 0) out[kind] = lost
  }
  return out
}

/**
 * Whether a box was relaid at its size (final review of BE: *Set end bays automatically*, its ends by hand): its length
 * and width as they were (m), its module lines elsewhere. What stands on it then keeps its place in m (`relaidShape`,
 * `elementsNearest`), not its module numbers.
 */
export function relaidRuns(before: HallRuns, after: HallRuns): boolean {
  const same = (a: Run, b: Run) => a.modules.length === b.modules.length && a.modules.every((v, i) => Math.abs(v - b.modules[i]) < ON)
  return Math.abs(before.x.length - after.x.length) < ON && Math.abs(before.y.length - after.y.length) < ON && !(same(before.x, after.x) && same(before.y, after.y))
}

/**
 * The module lines a shape uses (`used`, on `from`) on a run relaid at its size (`to`): each on the line nearest where it
 * stood (m), two that fall on one kept apart, so nothing between them (a zone) collapses to no width (residual review of
 * BE): of the two, the one whose move to the next line is the shorter (m from where it stood) moves; the box's walls (its
 * first and last lines) stay its walls. None that keeps them apart (more lines used than the run has): null.
 */
export function relaidLines(used: number[], from: Run, to: Run): Map<number, number> | null {
  const lines = [...new Set(used)].sort((a, b) => a - b)
  const last = from.modules.length - 1
  const end = to.modules.length - 1
  const stood = lines.map((k) => moduleAt(from, k))
  const t = stood.map((v) => nearestLine(to, v))
  // a wall stays a wall; a line inside the box stays inside it
  const wall = (i: number) => lines[i] === 0 || lines[i] === last
  const lo = (i: number) => (lines[i] >= 0 ? 0 : -Infinity)
  const hi = (i: number) => (lines[i] <= last ? end : Infinity)
  const cost = (i: number, k: number) => Math.abs(moduleAt(to, k) - stood[i])
  for (let i = 1; i < t.length; i++) {
    if (t[i] > t[i - 1]) continue
    const up = t[i - 1] + 1
    const down = t[i] - 1
    const canUp = !wall(i) && up <= hi(i)
    const canDown = !wall(i - 1) && down >= lo(i - 1) && (i < 2 || down > t[i - 2])
    if (canDown && (!canUp || cost(i - 1, down) < cost(i, up))) t[i - 1] = down
    else t[i] = up
  }
  // pushed past the far wall: back down, one by one
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] > hi(i)) t[i] = hi(i)
    if (i < t.length - 1 && t[i] >= t[i + 1]) t[i] = t[i + 1] - 1
  }
  const kept = t.every((k, i) => k >= lo(i) && k <= hi(i) && (i === 0 || k > t[i - 1]) && (!wall(i) || k === (lines[i] === 0 ? 0 : end)))
  return kept ? new Map(lines.map((k, i) => [k, t[i]])) : null
}

/**
 * A shape on a box relaid at its size (`relaidRuns`): its outline and holes are in m, so they stay where they are; each
 * zone side goes to the module line nearest where it stood (m on `before`), two lines that fall on one kept apart
 * (`relaidLines`), so every zone keeps one module at least. `m` as it stands on `before`. A zone left empty is left out; zones that
 * cannot keep their lines apart: null.
 */
export function relaidShape(m: Morphology, before: HallRuns, after: HallRuns): Morphology | null {
  const zs = m.zones ?? []
  if (!zs.length) return m
  const lx = relaidLines([0, count(before.x), ...zs.flatMap((z) => z.x)], before.x, after.x)
  const ly = relaidLines([0, count(before.y), ...zs.flatMap((z) => z.y)], before.y, after.y)
  if (!lx || !ly) return null
  const x = (k: number) => lx.get(k)!
  const y = (k: number) => ly.get(k)!
  const zones = zs.map((z) => ({ ...z, x: [x(z.x[0]), x(z.x[1])] as [number, number], y: [y(z.y[0]), y(z.y[1])] as [number, number] })).filter((z) => z.x[1] > z.x[0] && z.y[1] > z.y[0])
  return { ...m, zones }
}

/** A type's shape as it stands on its box now (`runs`): its outline (the box's when none is drawn), its holes and its
 *  zones there, drawn on that box. */
export function shapeNow(t: Pick<WarehouseType, 'morphology' | 'envelope' | 'grid' | 'hall'>, runs: HallRuns): Morphology {
  const { outline, holes, zones, arcs } = shapeOf(t, runs)
  return { outline, ...(arcs ? { arcs } : {}), holes, ...(t.morphology.zones?.length ? { zones } : {}) }
}

// ---- The outline on module lines ------------------------------------------------------------------------------------------
// The edits below are made on module lines (a bump of whole modules, an inner wall moved by modules): the outline is read onto
// the lines when every corner stands on one, edited there, and written back in metres on the box it ends on.

/** A rectangle hole as module lines. */
export interface LineHole {
  id: Id
  x: [number, number]
  y: [number, number]
  corridor?: number
}

/** The module line a distance along a run is, when it stands on one. */
function onLine(r: Run, v: number): number | null {
  const k = nearestLine(r, v)
  return Math.abs(moduleAt(r, k) - v) <= ON ? k : null
}

/** An outline in metres read onto the module lines of `runs`; null when a corner is off them. */
export function cornersOnLinesOf(outline: OutlineCorner[], runs: HallRuns): OutlineCorner[] | null {
  const out: OutlineCorner[] = []
  for (const c of outline) {
    const x = onLine(runs.x, c.x)
    const y = onLine(runs.y, c.y)
    if (x === null || y === null) return null
    out.push({ ...c, x, y })
  }
  return out
}

/** A type's outline (a box: its four corners) as module lines, each corner a whole line of its box's runs; null when a corner stands off them. */
export function cornersOnLines(t: Pick<WarehouseType, 'morphology' | 'grid' | 'hall'>): OutlineCorner[] | null {
  const runs = runsOf(t)
  return cornersOnLinesOf(outlineOn(t, runs), runs)
}

/** A rectangle hole as module lines; null for any other hole or one off the lines. */
export function holeOnLines(h: ShapeHole, runs: HallRuns): LineHole | null {
  if (!isRectHole(h)) return null
  const b = holeBox(h)
  const x0 = onLine(runs.x, b.x0)
  const x1 = onLine(runs.x, b.x1)
  const y0 = onLine(runs.y, b.y0)
  const y1 = onLine(runs.y, b.y1)
  if (x0 === null || x1 === null || y0 === null || y1 === null) return null
  return { id: h.id, x: [x0, x1], y: [y0, y1], ...(h.corridor !== undefined ? { corridor: h.corridor } : {}) }
}

/** Corners on module lines in metres on `runs`. */
export function linesToMetres(c: OutlineCorner[], runs: HallRuns): OutlineCorner[] {
  return c.map((k) => ({ ...k, x: moduleAt(runs.x, k.x), y: moduleAt(runs.y, k.y) }))
}

/** A hole of module lines as a contour in metres on `runs`. */
export function holeToMetres(h: LineHole, runs: HallRuns): ShapeHole {
  return { id: h.id, vertices: rectContour(moduleAt(runs.x, h.x[0]), moduleAt(runs.y, h.y[0]), moduleAt(runs.x, h.x[1]), moduleAt(runs.y, h.y[1])), ...(h.corridor !== undefined ? { corridor: h.corridor } : {}) }
}

// ---- Edits (module lines on the box's runs) -------------------------------------------------------------------------

/** A hand edit of a type's shape (step 5, Decision "Block shape"), in module lines of its box. */
export type ShapeEdit =
  /** An inner edge moved `by` modules out (in: negative), within the box; a box's edge moves the box (step 2). */
  | { kind: 'move'; edge: Id; by: number }
  /** The stretch of an edge between module lines `from` and `to` (along it) pulled `by` modules out (a bump; pushed in:
   *  a notch); out of the box, the box grows with it. */
  | { kind: 'pull'; edge: Id; from: number; to: number; by: number }
  /** The corner where `edge` starts removed: the rectangle its edges make filled in or cut away. */
  | { kind: 'corner'; edge: Id }
  /** A hole drawn: a rectangle of module lines inside the outline; or one removed. */
  | { kind: 'hole'; x: [number, number]; y: [number, number] }
  | { kind: 'unhole'; id: Id }
  /** An edge's own wall and facade offset (null: the envelope's, none). */
  | { kind: 'wall'; edge: Id; thickness?: number | null; offset?: number | null }

/** Each corner of the outline whose edge is `i` and the next moved `k` modules out of edge i (in: negative). Module lines. */
export function moveEdge(c: OutlineCorner[], i: number, k: number): OutlineCorner[] {
  const n = c.length
  const a = c[i]
  const b = c[(i + 1) % n]
  const out = outwardOf(facing(a, b))
  return c.map((x, j) => (j === i || j === (i + 1) % n ? { ...x, x: x.x + out.x * k, y: x.y + out.y * k } : x))
}

/** The first id of that prefix the outline has not. */
export function freeEdgeId(c: { id: Id }[], prefix = 'e'): Id {
  let n = 1
  while (c.some((x) => x.id === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

/**
 * The stretch of edge i between the module lines `from` and `to` (along it) pulled `k` modules out of it (pushed in:
 * negative): a bump or a notch, its sides and its face new edges; the rest of the edge past it one more. The whole edge:
 * the edge moved. Returns the outline and the ids it gave (the stretch's face, the rest of the edge). Module lines.
 */
export function pullStretch(c: OutlineCorner[], i: number, from: number, to: number, k: number): { outline: OutlineCorner[]; face: Id; rest: Id | null } {
  const n = c.length
  const p = c[i]
  const q = c[(i + 1) % n]
  const horizontal = p.y === q.y
  const lo = Math.min(horizontal ? p.x : p.y, horizontal ? q.x : q.y)
  const hi = Math.max(horizontal ? p.x : p.y, horizontal ? q.x : q.y)
  const s0 = Math.max(lo, Math.min(from, to))
  const s1 = Math.min(hi, Math.max(from, to))
  if (s0 <= lo && s1 >= hi) return { outline: moveEdge(c, i, k), face: p.id, rest: null }
  const out = outwardOf(facing(p, q))
  const forward = (horizontal ? q.x - p.x : q.y - p.y) > 0
  const [first, second] = forward ? [s0, s1] : [s1, s0]
  const on = (v: number, by = 0) => (horizontal ? { x: v + out.x * by, y: p.y + out.y * by } : { x: p.x + out.x * by, y: v + out.y * by })
  const ids: Id[] = []
  const fresh = () => {
    const id = freeEdgeId([...c, ...ids.map((x) => ({ id: x }))])
    ids.push(id)
    return id
  }
  const { id: _, x: _x, y: _y, ...wall } = p
  const side1 = fresh()
  const face = fresh()
  const side2 = fresh()
  const rest = fresh()
  const added: OutlineCorner[] = [
    { id: side1, ...on(first) },
    { ...wall, id: face, ...on(first, k) },
    { id: side2, ...on(second, k) },
    { ...wall, id: rest, ...on(second) },
  ]
  const outline = [...c.slice(0, i + 1), ...added, ...c.slice(i + 1)]
  return { outline, face, rest }
}

/**
 * Corner i removed: the rectangle its two edges make with the next and the previous corners filled in or cut away
 * (a step of a bump or a notch gone). The outline as it comes; the caller checks it is one. Module lines.
 */
export function removeCorner(c: OutlineCorner[], i: number): OutlineCorner[] {
  const n = c.length
  const a = c[(i - 1 + n) % n]
  const b = c[i]
  const e = c[(i + 1) % n]
  const d = a.x === b.x ? { x: e.x, y: a.y } : { x: a.x, y: e.y }
  return c.map((x, j) => (j === i ? { ...x, ...d } : x))
}

// -- the module-line checks (an outline on the lines of its box: orthogonal, its corners whole lines) --

/** Two axis-aligned segments that touch or cross. */
function touch(a: Point, b: Point, c: Point, d: Point): boolean {
  return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
}

/** Whether an outline on module lines is one: at least four corners, its edges along x or y turn by turn, counter-clockwise, never
 *  meeting but at their corners. */
export function validLines(c: Pick<OutlineCorner, 'x' | 'y'>[]): boolean {
  const n = c.length
  if (n < 4 || n % 2 !== 0) return false
  for (let i = 0; i < n; i++) {
    const a = c[i]
    const b = c[(i + 1) % n]
    const e = c[(i + 2) % n]
    const h1 = a.y === b.y && a.x !== b.x
    const v1 = a.x === b.x && a.y !== b.y
    const h2 = b.y === e.y && b.x !== e.x
    const v2 = b.x === e.x && b.y !== e.y
    if (!((h1 && v2) || (v1 && h2))) return false
  }
  if (twiceArea(c) <= 0) return false
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (touch(c[i], c[(i + 1) % n], c[j], c[(j + 1) % n])) return false
    }
  return true
}

/** A point strictly inside an orthogonal outline on module lines (on an edge is not). */
function insideLines(c: Pick<OutlineCorner, 'x' | 'y'>[], q: Point): boolean {
  let n = 0
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    if (a.x === b.x) {
      if (q.x === a.x && q.y >= Math.min(a.y, b.y) && q.y <= Math.max(a.y, b.y)) return false
      if (q.x < a.x && q.y > Math.min(a.y, b.y) && q.y <= Math.max(a.y, b.y)) n++
    } else if (q.y === a.y && q.x >= Math.min(a.x, b.x) && q.x <= Math.max(a.x, b.x)) return false
  }
  return n % 2 === 1
}

/** Whether a rectangle hole of module lines fits an outline of them: strictly inside it, no corner of it inside the hole, apart from the other holes. */
export function holeFitsLines(outline: Pick<OutlineCorner, 'x' | 'y'>[], h: Pick<LineHole, 'x' | 'y'>, others: Pick<LineHole, 'x' | 'y'>[] = []): boolean {
  if (h.x[1] - h.x[0] < 1 || h.y[1] - h.y[0] < 1) return false
  const corners = [
    { x: h.x[0], y: h.y[0] },
    { x: h.x[1], y: h.y[0] },
    { x: h.x[1], y: h.y[1] },
    { x: h.x[0], y: h.y[1] },
  ]
  if (!corners.every((q) => insideLines(outline, q))) return false
  if (outline.some((k) => k.x >= h.x[0] && k.x <= h.x[1] && k.y >= h.y[0] && k.y <= h.y[1])) return false
  return others.every((o) => o.x[1] < h.x[0] || o.x[0] > h.x[1] || o.y[1] < h.y[0] || o.y[0] > h.y[1])
}

/** A box's size and its ends, as `fitBox` lays it. */
type BoxHall = { length: number; width: number } & ReturnType<typeof hallEnds>

/**
 * A shape edited on the box's module lines (its outline past the box, or short of it) fitted with a box of its own: the box's
 * length and width (m, from the module lines it reaches, past the old box by its interior modules) and its ends (those that
 * keep the old box's lines where they stood, as near as they can: `endsKeeping`), its corners, holes and zones on the new box's
 * module lines (the nearest; the zones reach its walls; a hole that no longer fits goes), and where the new box's column line
 * A / 1 stands in the old box's frame (m). The same box: as it is. All in module lines of `next`, the runs of the box it ends on.
 */
function fitBoxLines(
  t: Pick<WarehouseType, 'hall' | 'grid'>,
  runs: HallRuns,
  shape: { outline: OutlineCorner[]; holes: LineHole[]; zones: HallZone[] },
  hallRunsOf: (hall: BoxHall) => HallRuns,
): { hall: BoxHall; outline: OutlineCorner[]; holes: LineHole[]; zones: HallZone[]; shift: Point; next: HallRuns } {
  const nx = count(runs.x)
  const ny = count(runs.y)
  const { outline } = shape
  const minX = Math.min(...outline.map((k) => k.x))
  const maxX = Math.max(...outline.map((k) => k.x))
  const minY = Math.min(...outline.map((k) => k.y))
  const maxY = Math.max(...outline.map((k) => k.y))
  const keepHoles = (o: OutlineCorner[], h: LineHole[]) => h.filter((x, i) => holeFitsLines(o, x, h.slice(0, i)))
  const was = { x: t.hall.ends, y: t.hall.endsWidth ?? t.hall.ends, short: t.hall.shortEnds, joinUnder: t.hall.joinUnder }
  if (minX === 0 && minY === 0 && maxX === nx && maxY === ny) return { hall: { length: t.hall.length, width: t.hall.width, ...hallEnds(was) }, outline, holes: keepHoles(outline, shape.holes), zones: shape.zones, shift: { x: 0, y: 0 }, next: runs }
  const x0 = moduleAt(runs.x, minX)
  const y0 = moduleAt(runs.y, minY)
  const length = mm(moduleAt(runs.x, maxX) - x0)
  const width = mm(moduleAt(runs.y, maxY) - y0)
  const keep = (r: Run, d: number) => ({ lines: r.lines.map((v) => v - d), modules: r.modules.map((v) => v - d) })
  const ends = hallEnds(endsKeeping({ x: length, y: width }, t.grid, was, { x: keep(runs.x, x0), y: keep(runs.y, y0) }))
  const next = hallRunsOf({ length, width, ...ends })
  const mx = count(next.x)
  const my = count(next.y)
  const toX = (k: number) => (k <= minX ? 0 : k >= maxX ? mx : Math.max(0, Math.min(mx, nearestLine(next.x, moduleAt(runs.x, k) - x0))))
  const toY = (k: number) => (k <= minY ? 0 : k >= maxY ? my : Math.max(0, Math.min(my, nearestLine(next.y, moduleAt(runs.y, k) - y0))))
  const moved = tidyOutline(outline.map((k) => ({ ...k, x: toX(k.x), y: toY(k.y) }))).outline
  // the zones reached the old box's walls: they reach the new one's
  const zx = (k: number) => (k <= 0 ? 0 : k >= nx ? mx : toX(k))
  const zy = (k: number) => (k <= 0 ? 0 : k >= ny ? my : toY(k))
  const h = shape.holes.map((x) => ({ ...x, x: [toX(x.x[0]), toX(x.x[1])] as [number, number], y: [toY(x.y[0]), toY(x.y[1])] as [number, number] }))
  const z = shape.zones.map((x) => ({ ...x, x: [zx(x.x[0]), zx(x.x[1])] as [number, number], y: [zy(x.y[0]), zy(x.y[1])] as [number, number] })).filter((x) => x.x[1] > x.x[0] && x.y[1] > x.y[0])
  return { hall: { length, width, ...ends }, outline: moved, holes: keepHoles(moved, h), zones: z, shift: { x: x0, y: y0 }, next }
}

/** A box fitted round a shape as `Morphology` in metres (`fit.morphology`): its box and ends, the shape on the new box's lines in m. */
export interface BoxFit {
  hall: BoxHall
  morphology: Morphology
  shift: Point
}

// ---- A hand edit of an outline, as a type and a copy take it ---------------------------------------------------------------

/** What `editOutline` makes of an edit: the outline tidied (m), the edges it renamed and split, the holes, and the box fitted round them. */
export interface OutlineEdit {
  outline: OutlineCorner[]
  /** The ids an edge lost to the one kept (two edges on one line). */
  renamed: Map<Id, Id>
  /** The edge a pulled stretch cut in two: its first part's id and the rest's. */
  split: { edge: Id; rest: Id } | null
  holes: ShapeHole[]
  /** The box fitted round the outline (its length, width and ends, the shape in m on that box, how far its column line A / 1 went). */
  fit: BoxFit
  /** Modules an inner edge moved (`move`: as far as it went). */
  moved?: number
  /** The edges each old edge became, in order along it (a free op: Phase D.2): its elements go to the piece they stand on. */
  pieces?: ReadonlyMap<Id, readonly Id[]>
  /** What the edit says besides: a hole that no longer fits is left out. */
  notes?: string[]
  /** m a push or a bump moved. */
  applied?: number
  /** The outline came out as it was (a radius it had already, a push of nothing): nothing to write. */
  unchanged?: true
}

/**
 * The shared core of a hand edit of a block's outline (Phase D.1, Decision "Block shape"): a type's (`shapeWarehouse`) and a copy's
 * (`shapeCopy`) alike. `t`: the type as the outline is read on it (a copy's: its type with its overrides); `g`: its generated edges,
 * runs, outline and holes; `hallRunsOf`: the runs a box of a new size lays (`generate.ts` owns them). The edit is made on the module lines:
 * an outline or a hole off them is refused (null). An edit that makes no outline (a wall through another, an inner wall at the box's
 * edge, a hole outside), or no edge it names: null.
 */
export function editOutline(
  t: Pick<WarehouseType, 'hall' | 'grid' | 'morphology' | 'envelope'>,
  g: { runs: HallRuns; outline: OutlineCorner[]; edges: ShapeEdge[]; holes: ShapeHole[] },
  edit: ShapeEdit,
  hallRunsOf: (hall: BoxHall) => HallRuns,
): OutlineEdit | null {
  const nx = count(g.runs.x)
  const ny = count(g.runs.y)
  const lines = cornersOnLinesOf(g.outline, g.runs)
  if (!lines) return null
  const holeLines = g.holes.map((h) => holeOnLines(h, g.runs))
  if (holeLines.some((h) => h === null)) return null
  let outline = lines
  let holes = holeLines as LineHole[]
  let split: { edge: Id; rest: Id } | null = null
  let moved: number | undefined
  const i = 'edge' in edit ? lines.findIndex((c) => c.id === edit.edge) : -1
  if ('edge' in edit && i < 0) return null
  if (edit.kind === 'move') {
    if (g.edges[i].outer || !Number.isFinite(edit.by)) return null
    const k = Math.round(edit.by)
    const ok = (c: OutlineCorner[]) => c.every((q) => q.x >= 0 && q.x <= nx && q.y >= 0 && q.y <= ny) && validLines(tidyOutline(c).outline)
    let j = k
    while (j !== 0 && !ok(moveEdge(outline, i, j))) j -= Math.sign(j)
    if (j === 0) return null
    outline = moveEdge(outline, i, j)
    moved = j
  } else if (edit.kind === 'pull') {
    const k = Math.round(edit.by)
    if (k === 0 || !Number.isFinite(edit.by)) return null
    const r = pullStretch(outline, i, Math.round(edit.from), Math.round(edit.to), k)
    outline = r.outline
    if (r.rest) split = { edge: edit.edge, rest: r.rest }
  } else if (edit.kind === 'corner') outline = removeCorner(outline, i)
  else if (edit.kind === 'hole') {
    const h: LineHole = { id: freeEdgeId(holes, 'h'), x: edit.x, y: edit.y }
    if (!holeFitsLines(outline, h, holes)) return null
    holes = [...holes, h]
  } else if (edit.kind === 'unhole') {
    if (!holes.some((h) => h.id === edit.id)) return null
    holes = holes.filter((h) => h.id !== edit.id)
  } else {
    outline = outline.map((c) => {
      if (c.id !== edit.edge) return c
      const { thickness, offset, ...rest } = c
      const th = edit.thickness === undefined ? thickness : (edit.thickness ?? undefined)
      const off = edit.offset === undefined ? offset : (edit.offset ?? undefined)
      return { ...rest, ...(th !== undefined && th > 0 && { thickness: th }), ...(off !== undefined && off > 0 && { offset: off }) }
    })
  }
  const tidy = tidyOutline(outline)
  if (!validLines(tidy.outline)) return null
  // its own zones as they stand on the box now
  const fit = fitBoxLines(t, g.runs, { outline: tidy.outline, holes, zones: zonesOn(t, g.runs) }, hallRunsOf)
  const outlineM = linesToMetres(fit.outline, fit.next)
  const holesM = fit.holes.map((h) => holeToMetres(h, fit.next))
  // the arcs stay while no corner came or went
  const arcs = (edit.kind === 'move' || edit.kind === 'wall') && t.morphology.arcs && outlineM.length === t.morphology.outline.length ? { arcs: t.morphology.arcs } : {}
  const morphology: Morphology = { outline: outlineM, ...arcs, holes: holesM, ...(fit.zones.length ? { zones: fit.zones } : {}) }
  return { outline: outlineM, renamed: tidy.renamed, split, holes: holesM, fit: { hall: fit.hall, morphology, shift: fit.shift }, ...(moved !== undefined && { moved }) }
}

/**
 * An inner edge of a block moved `by` whole modules out (in: negative; the copy's own outline, Decision "Block shape"), as far as it goes
 * (each step towards nothing tried): its outline in metres on the box it is on (it never moves the box), the ids it lost, the holes that
 * still fit, and how many modules it moved. Null when the outline is off the module lines, the edge is the box's, or no step makes an outline.
 */
export function moveInnerEdge(
  g: { runs: HallRuns; outline: OutlineCorner[]; edges: ShapeEdge[]; holes: ShapeHole[] },
  edge: Id,
  by: number,
): { outline: OutlineCorner[]; renamed: Map<Id, Id>; holes: ShapeHole[]; moved: number } | null {
  const e = g.edges.find((x) => x.id === edge)
  const k = Math.round(by)
  const lines = cornersOnLinesOf(g.outline, g.runs)
  const holeLines = g.holes.map((h) => holeOnLines(h, g.runs))
  if (!e || e.outer || !lines || holeLines.some((h) => h === null) || k === 0 || !Number.isFinite(by)) return null
  const nx = count(g.runs.x)
  const ny = count(g.runs.y)
  const fits = (c: OutlineCorner[]) => c.every((q) => q.x >= 0 && q.x <= nx && q.y >= 0 && q.y <= ny)
  for (let j = k; j !== 0; j -= Math.sign(k)) {
    const moved = moveEdge(lines, e.index, j)
    if (!fits(moved)) continue
    const { outline, renamed } = tidyOutline(moved)
    if (!validLines(outline)) continue
    const xs = outline.map((q) => q.x)
    const ys = outline.map((q) => q.y)
    // an inner wall never moves the box
    if (Math.min(...xs) !== 0 || Math.max(...xs) !== nx || Math.min(...ys) !== 0 || Math.max(...ys) !== ny) continue
    const kept = (holeLines as LineHole[]).filter((h, i, all) => holeFitsLines(outline, h, all.slice(0, i)))
    return { outline: linesToMetres(outline, g.runs), renamed, holes: kept.map((h) => holeToMetres(h, g.runs)), moved: j }
  }
  return null
}
