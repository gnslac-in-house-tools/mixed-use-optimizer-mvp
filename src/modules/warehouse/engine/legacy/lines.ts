// Frozen: shape.ts, the block as BLOCK_VERSION 4 kept it, for the steps that read older files; never edited, never imported by
// the app (only engine/migrate.ts reaches this folder: src/modules/__tests__/boundaries.test.ts). Copied from shape.ts as it
// stood before Phase D.2; only its imports differ.
// The block's shape (Decision "Block shape"), pure: its outline on the module lines of its box (the box's runs,
// bays.ts), counter-clockwise and orthogonal, each edge with an id that what stands on it names. On a box of another
// size (step 2, a variant, the optimizer) each corner keeps its distance from the nearer wall of the box it was drawn
// on, and so does each element's module on a copy (Decision "Elements by module": `anchorModule`). Read in m: each
// edge on its column lines, its wall's outer face out from them by its facade's offset and its wall; the holes; the bays
// along an edge. And the edits the plans make of it, in module lines (past the box when it grows): an edge moved, a
// stretch of an edge pulled out or pushed in, a corner removed, a hole drawn, a box fitted round it.
import type { HallElement, HallSide, HallZone, Id, Point, Polygon } from '../../../../model/schema.ts'
import type { LegacyMorphology as Morphology, LegacyOutlineCorner as OutlineCorner, LegacyShapeHole as ShapeHole, LegacyType as WarehouseType } from './types.ts'
import { endsKeeping, hallEnds, moduleAt, nearestLine, nearestModule, type Bay, type HallRuns, type Run } from '../bays.ts'

/** m: two lengths this close are the same. */
const ON = 0.005
const mm = (v: number) => Math.round(v * 1000) / 1000

/** The box's edges' ids, a new type's: its front, its right, its back, its left. */
export const BOX_EDGES = ['e1', 'e2', 'e3', 'e4'] as const

/** A box of nx × ny modules as an outline. */
export function boxOutline(nx: number, ny: number): OutlineCorner[] {
  return [
    { id: 'e1', x: 0, y: 0 },
    { id: 'e2', x: nx, y: 0 },
    { id: 'e3', x: nx, y: ny },
    { id: 'e4', x: 0, y: ny },
  ]
}

/** The modules a run has. */
const count = (r: Run) => r.modules.length - 1

/** The size of the box an outline was drawn on: its corners' farthest module lines. */
export function ownBox(c: Pick<OutlineCorner, 'x' | 'y'>[]): { x: number; y: number } {
  return { x: Math.max(...c.map((k) => k.x)), y: Math.max(...c.map((k) => k.y)) }
}

/**
 * A module line of a box `own` modules long on one `now` long: one in the box's first half keeps its distance from the
 * low wall, one in its second half from the high wall. A box made shorter than its features allow folds the first
 * half's onto the second's (never past the walls).
 */
export function anchor(v: number, own: number, now: number): number {
  if (own === now) return v
  const d = now - own
  const low = v * 2 <= own
  const c = Math.floor(own / 2) + 1 + d
  const to = d > 0 ? (low ? v : v + d) : low ? Math.min(v, c) : v + d
  return Math.max(0, Math.min(now, to))
}

/** A corner's two edges on one line, or a corner on itself: what an outline drops. Lost ids name the edge kept. */
export function tidyOutline(c: OutlineCorner[]): { outline: OutlineCorner[]; renamed: Map<Id, Id> } {
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
      if (a.x === b.x && a.y === b.y) {
        // edge i has no length: its corner goes, the next keeps its own edge
        lose(a.id, b.id)
        pts.splice(i, 1)
        changed = true
        break
      }
    }
    if (changed) continue
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n]
      const q = pts[i]
      const r = pts[(i + 1) % n]
      const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
      if (cross !== 0) continue
      // p → q and q → r on one line: one edge from p, the longer's id (and its own wall)
      const ahead = (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y) > 0
      const longer = ahead && Math.abs(r.x - q.x) + Math.abs(r.y - q.y) > Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      const kept = longer ? q : p
      lose(longer ? p.id : q.id, kept.id)
      const { x: _x, y: _y, ...own } = kept
      pts[(i - 1 + n) % n] = { ...own, x: p.x, y: p.y }
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

/** Two axis-aligned segments that touch or cross. */
function touch(a: Point, b: Point, c: Point, d: Point): boolean {
  return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
}

/** Whether an outline is one: at least four corners, its edges along x or y turn by turn, counter-clockwise, never
 *  meeting but at their corners. */
export function validOutline(c: Pick<OutlineCorner, 'x' | 'y'>[]): boolean {
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

/** A point strictly inside an orthogonal outline (module lines; on an edge is not). */
function inside(c: Pick<OutlineCorner, 'x' | 'y'>[], q: Point): boolean {
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

/**
 * A module of a box `own` modules long on one `now` long (Decision "Elements by module"): the module from line k to
 * k + 1 anchored as the lines are, one in the box's first half kept from the low wall, one in its second half from the
 * high wall; new modules come between them, the modules that go take theirs (two may fold onto one).
 */
export const anchorModule = (k: number, own: number, now: number): number => anchor(k, own - 1, now - 1)

/** The size the shape's own box is drawn on: its outline's (none drawn: the box it is on now). */
export function ownOf(m: Pick<Morphology, 'outline'>, nx: number, ny: number) {
  return m.outline.length >= 4 ? ownBox(m.outline) : { x: nx, y: ny }
}

/** The outline on a box of nx × ny modules, each corner kept from its nearer wall; drawn wrong, or none: the box. */
export function outlineOn(m: Pick<Morphology, 'outline'>, nx: number, ny: number): OutlineCorner[] {
  if (m.outline.length < 4) return boxOutline(nx, ny)
  const own = ownOf(m, nx, ny)
  const moved = m.outline.map((k) => ({ ...k, x: anchor(k.x, own.x, nx), y: anchor(k.y, own.y, ny) }))
  const { outline } = tidyOutline(moved)
  return validOutline(outline) ? outline : boxOutline(nx, ny)
}

/** Whether a hole fits an outline: strictly inside it, no corner of it inside the hole, apart from the other holes. */
export function holeFits(outline: Pick<OutlineCorner, 'x' | 'y'>[], h: Pick<ShapeHole, 'x' | 'y'>, others: Pick<ShapeHole, 'x' | 'y'>[] = []): boolean {
  if (h.x[1] - h.x[0] < 1 || h.y[1] - h.y[0] < 1) return false
  const corners = [
    { x: h.x[0], y: h.y[0] },
    { x: h.x[1], y: h.y[0] },
    { x: h.x[1], y: h.y[1] },
    { x: h.x[0], y: h.y[1] },
  ]
  if (!corners.every((q) => inside(outline, q))) return false
  if (outline.some((k) => k.x >= h.x[0] && k.x <= h.x[1] && k.y >= h.y[0] && k.y <= h.y[1])) return false
  return others.every((o) => o.x[1] < h.x[0] || o.x[0] > h.x[1] || o.y[1] < h.y[0] || o.y[0] > h.y[1])
}

/** The holes on a box of nx × ny modules (each kept from the wall nearer its middle), those that fit the outline. */
export function holesOn(m: Pick<Morphology, 'outline' | 'holes'>, nx: number, ny: number): ShapeHole[] {
  const own = ownOf(m, nx, ny)
  const outline = outlineOn(m, nx, ny)
  const shift = (r: [number, number], own: number, now: number): [number, number] => {
    const d = (r[0] + r[1]) <= own ? 0 : now - own
    return [r[0] + d, r[1] + d]
  }
  const out: ShapeHole[] = []
  for (const h of m.holes) {
    const moved = { ...h, x: shift(h.x, own.x, nx), y: shift(h.y, own.y, ny) }
    if (holeFits(outline, moved, out)) out.push(moved)
  }
  return out
}

/** The zones on a box of nx × ny modules: each line kept from its nearer wall (with no outline drawn, the one that
 *  reached the farthest line reaches the box's last, as before Decision "Block shape"); none left empty. */
export function zonesOn(m: Pick<Morphology, 'outline' | 'zones'>, nx: number, ny: number): HallZone[] {
  const own = m.zones ?? []
  if (!own.length) return []
  const box = m.outline.length >= 4 ? ownBox(m.outline) : { x: Math.max(...own.map((z) => z.x[1])), y: Math.max(...own.map((z) => z.y[1])) }
  const fit = (v: number, o: number, n: number) => anchor(Math.min(v, o), o, n)
  return own
    .map((z) => ({ ...z, x: [fit(z.x[0], box.x, nx), fit(z.x[1], box.x, nx)] as [number, number], y: [fit(z.y[0], box.y, ny), fit(z.y[1], box.y, ny)] as [number, number] }))
    .filter((z) => z.x[1] > z.x[0] && z.y[1] > z.y[0])
}

// ---- In m -----------------------------------------------------------------------------------------------------------

/** An edge of the outline: its corners on the module lines and on the column lines (m), the way it faces, its wall. */
export interface ShapeEdge {
  id: Id
  /** Its place in the outline: corner `index` is where it starts. */
  index: number
  from: Point
  to: Point
  /** m: from `a` to `b`, on the module lines. */
  a: Point
  b: Point
  side: HallSide
  /** Along x (it faces the front or the back) or along y. */
  horizontal: boolean
  thickness: number
  offset: number
  /** On the box's own lines: moving it is the box's length or width (Decision "Block shape"). */
  outer: boolean
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

/** m: how far an edge's wall's outer face stands out from its module line. */
export const faceOf = (e: Pick<ShapeEdge, 'offset' | 'thickness'>): number => e.offset + e.thickness

/** The edges of an outline on the box's runs, in m, with their walls (the envelope's thickness unless their own). */
export function edgesOf(outline: OutlineCorner[], runs: HallRuns, thickness: number): ShapeEdge[] {
  const nx = count(runs.x)
  const ny = count(runs.y)
  const at = (k: Pick<OutlineCorner, 'x' | 'y'>): Point => ({ x: moduleAt(runs.x, k.x), y: moduleAt(runs.y, k.y) })
  return outline.map((c, i) => {
    const n = outline[(i + 1) % outline.length]
    const from = { x: c.x, y: c.y }
    const to = { x: n.x, y: n.y }
    const horizontal = c.y === n.y
    const outer = horizontal ? c.y === 0 || c.y === ny : c.x === 0 || c.x === nx
    return { id: c.id, index: i, from, to, a: at(c), b: at(n), side: facing(from, to), horizontal, thickness: c.thickness ?? thickness, offset: c.offset ?? 0, outer }
  })
}

/** The type's outline and its edges on its runs (a copy's: its type with its overrides). */
export function shapeOf(t: Pick<WarehouseType, 'morphology' | 'envelope'>, runs: HallRuns): { outline: OutlineCorner[]; edges: ShapeEdge[]; holes: ShapeHole[]; zones: HallZone[] } {
  const nx = count(runs.x)
  const ny = count(runs.y)
  const outline = outlineOn(t.morphology, nx, ny)
  return { outline, edges: edgesOf(outline, runs, t.envelope.thickness), holes: holesOn(t.morphology, nx, ny), zones: zonesOn(t.morphology, nx, ny) }
}

/** The outer face of the walls round the outline: corner i where edge i starts, each line out by its face. */
export function facePolygon(edges: ShapeEdge[]): Polygon {
  const n = edges.length
  return edges.map((e, i) => {
    const prev = edges[(i - 1 + n) % n]
    const h = e.horizontal ? e : prev
    const v = e.horizontal ? prev : e
    return { x: mm(v.a.x + outwardOf(v.side).x * faceOf(v)), y: mm(h.a.y + outwardOf(h.side).y * faceOf(h)) }
  })
}

/** A hole's rectangle on the module lines (m), and the outer face of its walls (`thickness` m in from them). */
export function holeRect(h: Pick<ShapeHole, 'x' | 'y'>, runs: HallRuns, thickness = 0): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: mm(moduleAt(runs.x, h.x[0]) + thickness),
    y0: mm(moduleAt(runs.y, h.y[0]) + thickness),
    x1: mm(moduleAt(runs.x, h.x[1]) - thickness),
    y1: mm(moduleAt(runs.y, h.y[1]) - thickness),
  }
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

/** The modules an edge spans along its axis: from module line `lo` to `hi`. */
export function edgeModules(e: Pick<ShapeEdge, 'from' | 'to' | 'horizontal'>): { lo: number; hi: number } {
  const a = e.horizontal ? e.from.x : e.from.y
  const b = e.horizontal ? e.to.x : e.to.y
  return { lo: Math.min(a, b), hi: Math.max(a, b) }
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

/** Whether an outline's edge runs along x, by its id (none of its: undefined). */
export function axisOf(outline: Pick<OutlineCorner, 'id' | 'x' | 'y'>[]): (edge: Id) => boolean | undefined {
  return (edge) => {
    const i = outline.findIndex((c) => c.id === edge)
    return i < 0 ? undefined : outline[i].y === outline[(i + 1) % outline.length].y
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
 * stood (m), two that fall on one kept apart, so nothing between them (a hole, a zone, an outline's run) collapses to no
 * width (residual review of BE): of the two, the one whose move to the next line is the shorter (m from where it stood)
 * moves; the box's walls (its first and last lines) stay its walls. None that keeps them apart (more lines used than the
 * run has): null.
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
 * A shape on a box relaid at its size (`relaidRuns`): each corner, hole side and zone side on the module line nearest
 * where it stood (m on `before`), so nothing moves on the site but onto the new lines; two lines that fall on one kept
 * apart (`relaidLines`), so every hole, zone and outline run keeps one module at least. `m` as it stands on `before`
 * (no outline drawn: none, the box's). One that cannot keep its lines apart, or no longer makes the outline it was:
 * null; a hole that no longer fits, or a zone left empty: left out.
 */
export function relaidShape(m: Morphology, before: HallRuns, after: HallRuns): Morphology | null {
  const zs = m.zones ?? []
  const lx = relaidLines([0, count(before.x), ...m.outline.map((c) => c.x), ...m.holes.flatMap((h) => h.x), ...zs.flatMap((z) => z.x)], before.x, after.x)
  const ly = relaidLines([0, count(before.y), ...m.outline.map((c) => c.y), ...m.holes.flatMap((h) => h.y), ...zs.flatMap((z) => z.y)], before.y, after.y)
  if (!lx || !ly) return null
  const x = (k: number) => lx.get(k)!
  const y = (k: number) => ly.get(k)!
  const outline = m.outline.map((c) => ({ ...c, x: x(c.x), y: y(c.y) }))
  if (outline.length >= 4) {
    const tidy = tidyOutline(outline)
    if (tidy.renamed.size || tidy.outline.length !== outline.length || !validOutline(tidy.outline)) return null
  }
  const box = outline.length >= 4 ? outline : boxOutline(count(after.x), count(after.y))
  const holes: ShapeHole[] = []
  for (const h of m.holes) {
    const moved = { ...h, x: [x(h.x[0]), x(h.x[1])] as [number, number], y: [y(h.y[0]), y(h.y[1])] as [number, number] }
    if (holeFits(box, moved, holes)) holes.push(moved)
  }
  const zones = (m.zones ?? [])
    .map((z) => ({ ...z, x: [x(z.x[0]), x(z.x[1])] as [number, number], y: [y(z.y[0]), y(z.y[1])] as [number, number] }))
    .filter((z) => z.x[1] > z.x[0] && z.y[1] > z.y[0])
  return { ...m, outline, holes, ...(m.zones ? { zones } : {}) }
}

/** A type's shape as it stands on its box now (`runs`): its outline (the box's when none is drawn), its holes and its
 *  zones there, drawn on that box. */
export function shapeNow(t: Pick<WarehouseType, 'morphology' | 'envelope'>, runs: HallRuns): Morphology {
  const { outline, holes, zones } = shapeOf(t, runs)
  return { outline, holes, ...(t.morphology.zones?.length ? { zones } : {}) }
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

/** Each corner of the outline whose edge is `i` and the next moved `k` modules out of edge i (in: negative). */
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
 * the edge moved. Returns the outline and the ids it gave (the stretch's face, the rest of the edge).
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
 * (a step of a bump or a notch gone). The outline as it comes; the caller checks it is one.
 */
export function removeCorner(c: OutlineCorner[], i: number): OutlineCorner[] {
  const n = c.length
  const a = c[(i - 1 + n) % n]
  const b = c[i]
  const e = c[(i + 1) % n]
  const d = a.x === b.x ? { x: e.x, y: a.y } : { x: a.x, y: e.y }
  return c.map((x, j) => (j === i ? { ...x, ...d } : x))
}

/**
 * A shape edited on the box's module lines (its outline past the box, or short of it) fitted with a box of its own:
 * the box's length and width (m, from the module lines it reaches, past the old box by its interior modules) and its
 * ends (those that keep the old box's lines where they stood, as near as they can: `endsKeeping`), its corners, holes
 * and zones on the new box's module lines (the nearest; the zones reach its walls; a hole that no longer fits goes),
 * and where the new box's column line A / 1 stands in the old box's frame (m). The same box: as it is.
 */
/** A box's size and its ends, as `fitBox` lays it. */
type BoxHall = { length: number; width: number } & ReturnType<typeof hallEnds>

export function fitBox(
  t: Pick<WarehouseType, 'hall' | 'grid'>,
  runs: HallRuns,
  shape: { outline: OutlineCorner[]; holes: ShapeHole[]; zones: HallZone[] },
  hallRunsOf: (hall: BoxHall) => HallRuns,
): { hall: BoxHall; morphology: Morphology; shift: Point } {
  const nx = count(runs.x)
  const ny = count(runs.y)
  const { outline } = shape
  const minX = Math.min(...outline.map((k) => k.x))
  const maxX = Math.max(...outline.map((k) => k.x))
  const minY = Math.min(...outline.map((k) => k.y))
  const maxY = Math.max(...outline.map((k) => k.y))
  const morphology = (o: OutlineCorner[], h: ShapeHole[], z: HallZone[]): Morphology => ({
    outline: o,
    holes: h.filter((x, i) => holeFits(o, x, h.slice(0, i))),
    ...(z.length ? { zones: z } : {}),
  })
  const was = { x: t.hall.ends, y: t.hall.endsWidth ?? t.hall.ends, short: t.hall.shortEnds, joinUnder: t.hall.joinUnder }
  if (minX === 0 && minY === 0 && maxX === nx && maxY === ny) return { hall: { length: t.hall.length, width: t.hall.width, ...hallEnds(was) }, morphology: morphology(outline, shape.holes, shape.zones), shift: { x: 0, y: 0 } }
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
  return { hall: { length, width, ...ends }, morphology: morphology(moved, h, z), shift: { x: x0, y: y0 } }
}

// ---- A hand edit of an outline, as a type and a copy take it ---------------------------------------------------------------

/** What `editOutline` makes of an edit: the outline tidied, the edges it renamed and split, the holes, and the box fitted round them. */
export interface OutlineEdit {
  outline: OutlineCorner[]
  /** The ids an edge lost to the one kept (two edges on one line). */
  renamed: Map<Id, Id>
  /** The edge a pulled stretch cut in two: its first part's id and the rest's. */
  split: { edge: Id; rest: Id } | null
  holes: ShapeHole[]
  /** The box fitted round the outline (its length, width and ends, the shape on its module lines, how far its column line A / 1 went). */
  fit: ReturnType<typeof fitBox>
  /** Modules an inner edge moved (`move`: as far as it went). */
  moved?: number
}

/**
 * The shared core of a hand edit of a block's outline (Phase D.1, Decision "Block shape"): a type's (`shapeWarehouse`) and a copy's
 * (`shapeCopy`) alike. `t`: the type as the outline is read on it (a copy's: its type with its overrides); `g`: its generated edges,
 * runs, outline and holes; `hallRunsOf`: the runs a box of a new size lays (`generate.ts` owns them). An edit that makes no outline
 * (a wall through another, an inner wall at the box's edge, a hole outside), or no edge it names: null.
 */
export function editOutline(
  t: Pick<WarehouseType, 'hall' | 'grid' | 'morphology'>,
  g: { runs: HallRuns; outline: OutlineCorner[]; edges: ShapeEdge[]; holes: ShapeHole[] },
  edit: ShapeEdit,
  hallRunsOf: (hall: BoxHall) => HallRuns,
): OutlineEdit | null {
  const nx = count(g.runs.x)
  const ny = count(g.runs.y)
  let outline = g.outline
  let holes = g.holes
  let split: { edge: Id; rest: Id } | null = null
  let moved: number | undefined
  const i = 'edge' in edit ? g.outline.findIndex((c) => c.id === edit.edge) : -1
  if ('edge' in edit && i < 0) return null
  if (edit.kind === 'move') {
    if (g.edges[i].outer || !Number.isFinite(edit.by)) return null
    const k = Math.round(edit.by)
    const ok = (c: OutlineCorner[]) => c.every((q) => q.x >= 0 && q.x <= nx && q.y >= 0 && q.y <= ny) && validOutline(tidyOutline(c).outline)
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
    const h = { id: freeEdgeId(holes, 'h'), x: edit.x, y: edit.y }
    if (!holeFits(outline, h, holes)) return null
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
  if (!validOutline(tidy.outline)) return null
  // its own zones as they stand on the box now
  const fit = fitBox(t, g.runs, { outline: tidy.outline, holes, zones: zonesOn(t.morphology, nx, ny) }, hallRunsOf)
  return { outline: tidy.outline, renamed: tidy.renamed, split, holes, fit, ...(moved !== undefined && { moved }) }
}
