// What the type's plan finds under a press (Decisions "Warehouse by hand", "Block shape"), pure: the edge and the bay under
// the pointer, a stretch of an edge (the bay a double click pressed), a hole dragged on the module lines (a wall's drag is the shape
// engine's, on the block's module lines: state/actions/shape.ts); where the Split tool splits a zone; where a press of Dock, Door or Pattern lands (Decision "Elements by
// module", BE.4: inside the block by a wall, a module of it; outside in front of a bay, the bay's modules) and what it
// does, a drag's modules along the wall; the truck courts in front of the walls (Decision "Truck court"). The plan
// (WarehousePlan.tsx) and its tools use them.
import type { HallElement, HallZone, Id, OutlineCorner, Point, Polygon, WarehouseType } from '../../../model/schema.ts'
import { moduleAt as lineAt, nearestLine, type HallRuns, type Run } from '../engine/bays.ts'
import type { Generated } from '../engine/generate.ts'
import { isOf } from '../engine/elements.ts'
import { arcBox, rawPolygon } from '../../../engine/geom/contour.ts'
import { distancePointSegment, pointInPolygon } from '../../../engine/geom/polygon.ts'
import { fromWall, wallFrame } from '../engine/courts.ts'
import { edgeBays, faceOf, facePolygon, holeRect, isRectHole, outwardOf, type ShapeEdge } from '../engine/shape.ts'
import type { ZoneAxis } from '../engine/zones.ts'
import { bayModules, moduleOn, onDockRule, runAlongEdge } from '../engine/dockRule.ts'


/** px: how near a wall's face the Dock, Door, Pattern and Court tools find it (inside: its module; outside: its bay),
 *  and a click its edge; the block editor's and the site's (GT.8) alike. */
export const BAY_REACH_PX = 28
export const EDGE_REACH_PX = 10

/** The module line nearest `v` (m along the run), its index. */
export function nearestModule(r: Run, v: number): number {
  let best = 0
  r.modules.forEach((m, i) => {
    if (Math.abs(m - v) < Math.abs(r.modules[best] - v)) best = i
  })
  return best
}

/** m along an edge's line: x for one along x, y for one along y. */
export const alongOf = (e: Pick<ShapeEdge, 'horizontal'>, q: Point): number => (e.horizontal ? q.x : q.y)

/** An edge's line (m across: y for one along x, x for one along y) and its outer face. */
export const lineOf = (e: Pick<ShapeEdge, 'horizontal' | 'a'>): number => (e.horizontal ? e.a.y : e.a.x)
export const faceLine = (e: ShapeEdge): number => lineOf(e) + (e.horizontal ? outwardOf(e.side).y : outwardOf(e.side).x) * faceOf(e)

/** The ends of an edge along its line (m). */
export const spanOf = (e: Pick<ShapeEdge, 'horizontal' | 'a' | 'b'>): [number, number] => {
  const a = alongOf(e, e.a)
  const b = alongOf(e, e.b)
  return [Math.min(a, b), Math.max(a, b)]
}

/** The edge whose outer face is nearest a point, within `reach` m of it (inside or out), and along it; null if none. */
export function edgeAt(g: Pick<Generated, 'edges'>, q: Point, reach: number): ShapeEdge | null {
  let best: { e: ShapeEdge; d: number } | null = null
  for (const e of g.edges) {
    const [lo, hi] = spanOf(e)
    const s = alongOf(e, q)
    if (s < lo - reach / 2 || s > hi + reach / 2) continue
    const d = Math.abs((e.horizontal ? q.y : q.x) - faceLine(e))
    if (d <= reach && (!best || d < best.d)) best = { e, d }
  }
  return best?.e ?? null
}

/**
 * The angled wall (along neither axis of the grid: nothing stands on it) a point is at: the wall nearest it, within `reach` m, when it is angled and
 * strictly nearer than every wall along the grid (each measured to its band, the wall's thickness: a point inside both is the straight wall's, as a
 * press on the last module beside an angled wall is); else null. A press of Dock, Door, Pattern or Court there says why and does nothing (Decision "Block shape").
 */
export function angledAt(g: Pick<Generated, 'edges'>, q: Point, reach: number): ShapeEdge | null {
  let angled: { e: ShapeEdge; d: number } | null = null
  let straight = Infinity
  for (const e of g.edges) {
    if (e.axis === null) {
      const d = Math.max(0, distancePointSegment(q, e.a, e.b) - (e.thickness + Math.abs(e.offset)))
      if (d <= reach && (!angled || d < angled.d)) angled = { e, d }
      continue
    }
    const [lo, hi] = spanOf(e)
    const s = alongOf(e, q)
    if (s < lo - reach / 2 || s > hi + reach / 2) continue
    // how far the point is from the wall's band: out of its face, or in past its thickness
    const out = outOfFace(e, q)
    const t = e.thickness + Math.abs(e.offset)
    straight = Math.min(straight, out > 0 ? out : out < -t ? -out - t : 0)
  }
  return angled && angled.d < straight ? angled.e : null
}

/** The bay of an edge under `along` (its index in the edge's bays), or -1 past its ends. */
export function bayOn(runs: HallRuns, e: ShapeEdge, along: number): number {
  return edgeBays(runs, e).findIndex((b) => along >= b.lo - 1e-6 && along <= b.hi + 1e-6)
}

/** The stretch a double click on an edge picks: the bay pressed, as the module lines it spans along the edge. */
export function stretchAt(runs: HallRuns, e: ShapeEdge, along: number): { from: number; to: number } | null {
  const bays = edgeBays(runs, e)
  const b = bays.find((x) => along >= x.lo - 1e-6 && along <= x.hi + 1e-6)
  if (!b) return null
  const r = runAlongEdge(runs, e)
  const from = nearestLine(r, b.lo)
  const to = nearestLine(r, b.hi)
  return to > from ? { from, to } : null
}

/** A box in the type's frame. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const inBox = (q: Point, b: Box): boolean => q.x >= b.x0 && q.x <= b.x1 && q.y >= b.y0 && q.y <= b.y1

/** The module lines a drag from `a` to `b` covers: a hole's rectangle, a module each way at least. */
export function holeFrom(runs: HallRuns, a: Point, b: Point): { x: [number, number]; y: [number, number] } {
  const x0 = nearestModule(runs.x, Math.min(a.x, b.x))
  const x1 = Math.max(x0 + 1, nearestModule(runs.x, Math.max(a.x, b.x)))
  const y0 = nearestModule(runs.y, Math.min(a.y, b.y))
  const y1 = Math.max(y0 + 1, nearestModule(runs.y, Math.max(a.y, b.y)))
  return { x: [x0, x1], y: [y0, y1] }
}

/** The hole under a point, if any. */
export function holeAt(g: Pick<Generated, 'holes'>, q: Point): Id | null {
  const h = g.holes.find((x) => (isRectHole(x) ? inBox(q, holeRect(x)) : pointInPolygon(q, x.vertices)))
  return h?.id ?? null
}

/** The corner nearest a point within `reach` m (on the module lines), its edge's id (the edge that starts there). */
export function cornerAt(g: Pick<Generated, 'edges' | 'outline'>, q: Point, reach: number): Id | null {
  let best: { id: Id; d: number } | null = null
  for (const e of g.edges) {
    const d = Math.hypot(e.a.x - q.x, e.a.y - q.y)
    if (d <= reach && (!best || d < best.d)) best = { id: e.id, d }
  }
  return best?.id ?? null
}

/** An edge's name in the lists: E1, E2… by its id where it is one (e7 → E7), else by its place. */
export function edgeName(outline: Pick<OutlineCorner, 'id'>[], id: Id): string {
  const m = /^e(\d+)$/.exec(id)
  return m ? `E${m[1]}` : `E${outline.findIndex((c) => c.id === id) + 1}`
}

/** Where the Split tool would split: the zone under `q`, the module line nearest it inside the zone either way. */
export function splitAt(zones: HallZone[], runs: HallRuns, q: Point): { zone: Id; axis: ZoneAxis; k: number; line: [Point, Point] } | null {
  const ix = runs.x.modules.findIndex((v, i) => i > 0 && q.x <= v)
  const iy = runs.y.modules.findIndex((v, i) => i > 0 && q.y <= v)
  const z = zones.find((x) => ix > x.x[0] && ix <= x.x[1] && iy > x.y[0] && iy <= x.y[1])
  if (!z || q.x < 0 || q.y < 0) return null
  const best = (r: Run, v: number, [a, b]: [number, number]) => {
    let k = -1
    for (let i = a + 1; i < b; i++) if (k < 0 || Math.abs(r.modules[i] - v) < Math.abs(r.modules[k] - v)) k = i
    return k
  }
  const kx = best(runs.x, q.x, z.x)
  const ky = best(runs.y, q.y, z.y)
  const dx = kx < 0 ? Infinity : Math.abs(runs.x.modules[kx] - q.x)
  const dy = ky < 0 ? Infinity : Math.abs(runs.y.modules[ky] - q.y)
  if (dx === Infinity && dy === Infinity) return null
  const yLo = runs.y.modules[z.y[0]]
  const yHi = runs.y.modules[z.y[1]]
  const xLo = runs.x.modules[z.x[0]]
  const xHi = runs.x.modules[z.x[1]]
  return dx <= dy
    ? { zone: z.id, axis: 'x', k: kx, line: [{ x: runs.x.modules[kx], y: yLo }, { x: runs.x.modules[kx], y: yHi }] }
    : { zone: z.id, axis: 'y', k: ky, line: [{ x: xLo, y: runs.y.modules[ky] }, { x: xHi, y: runs.y.modules[ky] }] }
}

// ---- Elements (W.13; by module since Decision "Elements by module"; placed by the tools since BE.4) -------------------

/** m: how far a point stands out of an edge's outer face (inside the block: negative). */
const outOfFace = (e: ShapeEdge, q: Point): number => ((e.horizontal ? q.y : q.x) - faceLine(e)) * (e.horizontal ? outwardOf(e.side).y : outwardOf(e.side).x)

/** The edge whose face is nearest a point along its span, within `reach` m of it on one side (inside: in the block, its
 *  wall's thickness among it; else out of it); null when none is, or the point is on the other side of the block. */
function wallBy(g: Pick<Generated, 'edges'>, q: Point, reach: number, inside: boolean): ShapeEdge | null {
  if (pointInPolygon(q, facePolygon(g.edges)) !== inside) return null
  let best: { e: ShapeEdge; d: number } | null = null
  for (const e of g.edges) {
    const [lo, hi] = spanOf(e)
    const s = alongOf(e, q)
    if (s < lo || s > hi) continue
    const d = outOfFace(e, q)
    if (inside ? d > 0 || d < -reach : d <= 0 || d > reach) continue
    if (!best || Math.abs(d) < best.d) best = { e, d: Math.abs(d) }
  }
  return best?.e ?? null
}

/** A press inside the block within `reach` m of a wall's face: that wall and the module of it under the press. */
export function moduleAt(g: Pick<Generated, 'edges' | 'runs'>, q: Point, reach: number): { edge: ShapeEdge; module: number } | null {
  const e = wallBy(g, q, reach, true)
  return e ? { edge: e, module: moduleOn(g.runs, e, alongOf(e, q)) } : null
}

/** A press outside the block within `reach` m of a wall's face, in front of one of its bays: that bay's modules. */
export function bayOutsideAt(g: Pick<Generated, 'edges' | 'runs'>, q: Point, reach: number): { edge: ShapeEdge; modules: number[] } | null {
  const e = wallBy(g, q, reach, false)
  if (!e) return null
  const bay = bayOn(g.runs, e, alongOf(e, q))
  const modules = bay >= 0 ? bayModules(g.runs, e, bay) : []
  return modules.length ? { edge: e, modules } : null
}

/** m: how far out of its face a piece of the plan stands: a dock's bar, a door's opening (as the plan draws them). */
const BAR_OUT: Partial<Record<HallElement['kind'], number>> = { dock: 1.5, door: 0.6 }

/** The element of a kind (a pattern of `name`) whose drawn bar or opening is under a point, out of its wall (the bar
 *  1.5 m out of the face, the opening 0.6 m); null when none is. A press on it is that element's, not its bay's. */
function barAt(g: Pick<Generated, 'doors'>, kind: HallElement['kind'], name: string | undefined, q: Point): Generated['doors'][number] | null {
  const deep = BAR_OUT[kind]
  if (deep === undefined) return null
  for (const d of g.doors) {
    if (d.kind !== kind || (kind === 'pattern' && (d.name ?? '') !== (name ?? ''))) continue
    const n = outwardOf(d.side)
    const dx = q.x - d.at.x
    const dy = q.y - d.at.y
    const out = dx * n.x + dy * n.y
    if (Math.abs(dx * n.y - dy * n.x) <= d.width / 2 && out >= 0 && out <= deep) return d
  }
  return null
}

/**
 * What a press of Dock, Door or Pattern (a pattern of `name`) does there: on a module, one put there or (it has one)
 * taken away; on the bar of a dock (the opening of a door) out of the wall, that one taken away; outside the block in
 * front of a bay (past the bars), every module of the bay filled or (all have one) emptied. `bay`: pressed outside.
 * Null: no wall there.
 */
export function elementPress(
  g: Pick<Generated, 'edges' | 'runs' | 'doors'>,
  kind: HallElement['kind'],
  name: string | undefined,
  q: Point,
  reach: number,
): { edge: ShapeEdge; modules: number[]; on: boolean; bay: boolean; span: [number, number] } | null {
  const m = moduleAt(g, q, reach)
  const bar = m ? null : barAt(g, kind, name, q)
  const edge = bar ? g.edges.find((e) => e.id === bar.edge) : undefined
  if (bar && edge) return { edge, modules: [bar.module], on: false, bay: false, span: [bar.module, bar.module] }
  // the band a bar or an opening is drawn in is its module's whether or not one stands there: a press there puts one
  // back where one was taken away; only past the band is the press the bay's
  const deep = BAR_OUT[kind]
  const band = m || deep === undefined ? null : wallBy(g, q, deep, false)
  const inBand = band ? { edge: band, module: moduleOn(g.runs, band, alongOf(band, q)) } : null
  const b = m || inBand ? null : bayOutsideAt(g, q, reach)
  const one = m ?? inBand
  // a bay of docks by the dock rule (its modules the block's docked bays hold), full or empty by it too
  const hit = one
    ? { edge: one.edge, modules: [one.module], bay: false, span: [one.module, one.module] as [number, number] }
    : b
      ? { ...b, modules: kind === 'dock' ? onDockRule(g, b.edge, b.modules) : b.modules, bay: true, span: [Math.min(...b.modules), Math.max(...b.modules)] as [number, number] }
      : null
  if (!hit) return null
  const held = new Set(g.doors.filter((d) => isOf(d, kind, hit.edge.id, name)).map((d) => d.module))
  return { ...hit, on: !hit.modules.every((k) => held.has(k)) }
}

/** An element's name on the plan and in its row: its pattern's own, else its kind's. */
export const elementName = (el: Pick<HallElement, 'kind' | 'name'>): string => (el.kind === 'pattern' ? (el.name ?? 'Pattern') : el.kind === 'dock' ? 'Docks' : 'Level doors')

/** The band from `lo` to `hi` m along an edge's line, `deep` m out of its face. */
function faceBand(e: ShapeEdge, lo: number, hi: number, deep: number): { x: number; y: number; w: number; h: number } {
  const face = faceLine(e)
  const n = outwardOf(e.side)
  const out = face + (n.x + n.y) * deep
  const [a, b] = [Math.min(face, out), Math.max(face, out)]
  return e.horizontal ? { x: lo, y: a, w: hi - lo, h: b - a } : { x: a, y: lo, w: b - a, h: hi - lo }
}

/** The band a module of an edge takes, `deep` m out of its face. */
export function moduleBand(runs: HallRuns, e: ShapeEdge, module: number, deep = 2.5): { x: number; y: number; w: number; h: number } {
  const r = runAlongEdge(runs, e)
  return faceBand(e, lineAt(r, module), lineAt(r, module + 1), deep)
}

/** m: how far out of its wall a dock's bar stands, and how far in a pattern's mark (as the plan draws them). */
const PIECE_OUT = 1.5
const PIECE_IN = 1

/** The element one of whose pieces is nearest a point, within `reach` m of it (a dock's bar, a door's opening, a
 *  pattern's mark); null when none is. */
export function elementAt(g: Pick<Generated, 'doors'>, q: Point, reach: number): Id | null {
  let best: { id: Id; d: number } | null = null
  for (const d of g.doors) {
    const n = outwardOf(d.side)
    const dx = q.x - d.at.x
    const dy = q.y - d.at.y
    const along = Math.max(0, Math.abs(dx * n.y - dy * n.x) - d.width / 2)
    const out = dx * n.x + dy * n.y
    const across = out > PIECE_OUT ? out - PIECE_OUT : out < -PIECE_IN ? -PIECE_IN - out : 0
    const dist = Math.hypot(along, across)
    if (dist <= reach && (!best || dist < best.d)) best = { id: d.element, d: dist }
  }
  return best?.id ?? null
}

// ---- Truck courts (Decision "Truck court", BE.4) -----------------------------------------------------------------

/** A court of a wall as the plan draws it (Phase D.3): its id when it has one, its outline in the type's frame, and whether it has a shape of its own. */
export interface CourtPart {
  id?: Id
  polygon: Polygon
  shaped: boolean
  /** m: the depth of a court without a shape (the block's, else the entry's own). */
  depth?: number
}

/** A rectangle `x, y, w, h` as a polygon, counter-clockwise on the plan. */
export const rectPolygon = (r: { x: number; y: number; w: number; h: number }): Polygon => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
]

/**
 * The block's truck courts as its plan draws them: one entry for every docked edge, and for every edge with an entry
 * (a court-only edge); its depth the entry's own, else the block's (`court.depth`), else the standards' (`standard`).
 * `parts` are the edge's courts as they are drawn and picked (Phase D.3): a court with a shape of its own is its
 * contour (`CourtByEdge.shape`, in the wall's frame, on the plan through `fromWall`), a wall split into several has
 * one part for each, the rest the rectangle across the wall by the depth. A wall with only shaped courts has the
 * deepest of them for its `depth` and is not `own`.
 */
export function courtsOf(
  t: Pick<WarehouseType, 'court' | 'courts'>,
  g: Pick<Generated, 'edges' | 'doors'>,
  standard: number,
): { edge: ShapeEdge; depth: number; own: boolean; parts: CourtPart[] }[] {
  const docked = new Set(g.doors.filter((d) => d.kind === 'dock').map((d) => d.edge))
  const block = t.court?.depth ?? standard
  return g.edges.flatMap((e) => {
    const mine = t.courts?.filter((x) => x.edge === e.id) ?? []
    if (!mine.length && !docked.has(e.id)) return []
    const withDepth = mine.find((c) => c.depth !== undefined)
    const shapes = mine.flatMap((c) => (c.shape ? [c.shape] : []))
    const depth = withDepth?.depth ?? (shapes.length ? Math.max(...shapes.map((c) => arcBox(c).y1)) : block)
    const frame = wallFrame(e)
    const parts: CourtPart[] = mine.length
      ? mine.map((c) => ({
          ...(c.id !== undefined ? { id: c.id } : {}),
          shaped: c.shape !== undefined,
          ...(c.shape ? {} : { depth: c.depth ?? block }),
          polygon: c.shape ? rawPolygon(c.shape).map((q) => fromWall(frame, q)) : rectPolygon(courtBand(e, c.depth ?? block).rect),
        }))
      : [{ shaped: false, depth: block, polygon: rectPolygon(courtBand(e, block).rect) }]
    return [{ edge: e, depth, own: withDepth !== undefined, parts }]
  })
}

/** A court's rectangle in front of its edge (m), and the middle of its outer edge (where its pill stands). */
export function courtBand(e: ShapeEdge, depth: number): { rect: { x: number; y: number; w: number; h: number }; pill: Point } {
  const [lo, hi] = spanOf(e)
  const n = outwardOf(e.side)
  const f = faceLine(e)
  const mid = (lo + hi) / 2
  const at = e.horizontal ? { x: mid, y: f } : { x: f, y: mid }
  return { rect: faceBand(e, lo, hi, depth), pill: { x: at.x + n.x * depth, y: at.y + n.y * depth } }
}
