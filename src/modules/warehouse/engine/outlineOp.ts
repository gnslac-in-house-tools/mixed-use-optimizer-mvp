// A block's outline edited freely (Phase D.2, task 5; Decisions "Outline in metres", "Block shape"), pure. The shape engine's ops
// (`engine/geom/shapeOp.ts`) run on the outline's outer face (the reference line moved out by each wall's own face), at any angle; the
// result is inset back to the reference line, each new edge by its own wall (an edge that came from an old one takes its wall, a new
// one the envelope's), its ids given by lineage (the first piece of an old edge keeps its id, the others get fresh ones), the corners
// tidied, and the box fitted round it (its bounding box: its length and width, its ends, where its column line A / 1 went). What
// stands on the edges (docks, doors, patterns, courts) follows through `pieces` and `renamed`: `engine/elements.ts`.
import type { Contour, HallZone, Id, OutlineCorner, ShapeHole, Vertex, WarehouseType } from '../../../model/schema.ts'
import { arcBox, bulges } from '../../../engine/geom/contour.ts'
import { offsetEdges, insetEdges } from '../../../engine/geom/offsetEdges.ts'
import { runShapeOp, type ShapeOp } from '../../../engine/geom/shapeOp.ts'
import { endsKeeping, hallEnds, moduleAt, nearestLine, type HallRuns, type Run } from './bays.ts'
import { hallRuns, type Generated } from './generate.ts'
import { faceOf, freeEdgeId, holeFits, referenceContour, tidyOutline, validOutline, zonesOn, type BoxFit, type OutlineEdit } from './shape.ts'

/** m: two lengths this close are the same. */
const ON = 0.005
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0
const mod = (i: number, n: number) => ((i % n) + n) % n
const count = (r: Run) => r.modules.length - 1

/** What the edit reads of a block: the type as it is (a copy's: with its overrides) and what it generated. */
type Basis = Pick<WarehouseType, 'hall' | 'grid' | 'morphology' | 'envelope'>
type Read = Pick<Generated, 'runs' | 'outline' | 'edges' | 'holes'>

/** An edit made, or why not (the same outline stays). */
export type OutlineRun = { ok: true; edit: OutlineEdit } | { ok: false; reason: string; applied?: number; notes: string[] }

/** A corner of the outline being built: its edge's curve (`bulge`) rides with it until the arcs are keyed by index. */
type Corner = OutlineCorner & { bulge?: number }

const refuse = (reason: string, notes: string[] = [], applied?: number): OutlineRun => ({ ok: false, reason, notes, ...(applied !== undefined && { applied }) })

/** Whether corner i of the outline is a square one of two edges along the grid, sharp, with no curve: removing it fills or cuts the step. */
function squareCorner(g: Read, i: number): boolean {
  const n = g.edges.length
  const prev = g.edges[mod(i - 1, n)]
  const here = g.edges[mod(i, n)]
  const c = g.outline[mod(i, n)]
  return n >= 4 && prev.axis !== null && here.axis !== null && prev.axis !== here.axis && !prev.bulge && !here.bulge && !c.r && !c.chamfer
}

/** The corner moved to the opposite corner of the rectangle it makes with its neighbours: the step it ends filled in or cut away. */
function filled(g: Read, i: number): Corner[] {
  const n = g.edges.length
  const a = g.outline[mod(i - 1, n)]
  const e = g.outline[mod(i + 1, n)]
  const d = g.edges[mod(i - 1, n)].axis === 'y' ? { x: e.x, y: a.y } : { x: a.x, y: e.y }
  return g.outline.map((c, k) => ({ ...c, ...(g.edges[k].bulge ? { bulge: g.edges[k].bulge } : {}), ...(k === mod(i, n) ? d : {}) }))
}

/** The arcs of an outline's edges, keyed by the corner an edge starts at. */
function arcsOf(edges: Read['edges']): Record<string, number> {
  const out: Record<string, number> = {}
  edges.forEach((e, i) => {
    if (e.bulge) out[String(i)] = e.bulge
  })
  return out
}

/** Whether two outlines are one (the same ids, corners the same to the millimetre they are stored at, the same radii, chamfers and walls). */
function sameOutline(a: OutlineCorner[], b: OutlineCorner[]): boolean {
  const wall = (c: OutlineCorner) => JSON.stringify([c.r ?? 0, c.chamfer ?? null, c.thickness ?? null, c.offset ?? null])
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && Math.abs(c.x - mm(b[i].x)) < 1e-6 && Math.abs(c.y - mm(b[i].y)) < 1e-6 && wall(c) === wall(b[i]))
}

/** One op of the shape engine on a block's outline, at any angle: the outline in metres, its box fitted, its pieces; or why not. */
export function runOutlineOp(t: Basis, g: Read, op: ShapeOp): OutlineRun {
  const reference = referenceContour(g.edges)
  const face = offsetEdges(
    reference,
    g.edges.map((e) => faceOf(e)),
  )
  if (!face) return refuse('The walls of this block do not fit its outline')
  // a square corner of a step goes as the module-line engine took it: the rectangle it makes filled in or cut away
  if (op.op === 'remove' && squareCorner(g, op.vertex)) return finish(t, g, filled(g, op.vertex), { tidyAll: true })
  const r = runShapeOp(face, op)
  if (!r.ok) return refuse(r.reason, r.notes, op.op === 'push' || op.op === 'bump' ? 0 : undefined)
  const n = g.edges.length
  // the edge lost where two walls join: its elements go to the one that stays
  const joined = op.op === 'remove' ? { lost: g.edges[mod(op.vertex, n)].id, kept: g.edges[mod(op.vertex - 1, n)].id } : undefined
  return outlineFromFace(t, g, r.contour, r.from, { ...(r.applied !== undefined && { applied: r.applied }), notes: r.notes, keepCollinear: op.op === 'insert', ...(joined && { joined }) })
}

/** What `outlineFromFace` knows besides the face. */
interface FaceOptions {
  applied?: number
  notes?: string[]
  /** A corner just put on a wall stays on it. */
  keepCollinear?: boolean
  /** An edge lost where two joined, and the one it joined (in the ids before). */
  joined?: { lost: Id; kept: Id }
}

/**
 * The outline whose outer face is `face`, each of its edges from an old edge (`from`: its index in `g.edges`, or null for a new one):
 * the reference line inset by each edge's own wall, its corners named by lineage and tidied, the box fitted round it. A new edge takes
 * the envelope's wall. The ops of `runOutlineOp` end here, and so does a block redrawn from a new face (`setBlockOutline`).
 */
export function outlineFromFace(t: Basis, g: Read, face: Contour, from: readonly (number | null)[], opts: FaceOptions = {}): OutlineRun {
  const dist = from.map((j) => (j === null ? t.envelope.thickness : faceOf(g.edges[j])))
  const ref = insetEdges(face, dist)
  if (!ref) return refuse('The walls do not fit there')
  const bs = bulges(ref)
  const taken: { id: Id }[] = g.outline.map((c) => ({ id: c.id }))
  const used = new Set<Id>()
  const corners: Corner[] = ref.vertices.map((v, k) => {
    const j = from[k]
    const old = j === null ? undefined : g.outline[j]
    let id: Id
    if (old && !used.has(old.id)) {
      id = old.id
      used.add(id)
    } else {
      id = freeEdgeId(taken)
      taken.push({ id })
    }
    return {
      id,
      x: mm(v.x),
      y: mm(v.y),
      ...(v.r ? { r: v.r } : {}),
      ...(v.chamfer ? { chamfer: v.chamfer } : {}),
      ...(old?.thickness !== undefined ? { thickness: old.thickness } : {}),
      ...(old?.offset !== undefined ? { offset: old.offset } : {}),
      ...(bs[k] ? { bulge: bs[k] } : {}),
    }
  })
  // the edges each old one became, in order along it
  const pieces = new Map<Id, Id[]>()
  from.forEach((j, k) => {
    if (j === null) return
    const id = g.edges[j].id
    pieces.set(id, [...(pieces.get(id) ?? []), corners[k].id])
  })
  const renamed0 = new Map<Id, Id>()
  if (opts.joined) {
    const keptNew = pieces.get(opts.joined.kept)?.[0]
    if (keptNew) renamed0.set(opts.joined.lost, keptNew)
  }
  return finish(t, g, corners, { ...opts, pieces, renamed0, tidyAll: !opts.keepCollinear })
}

/** What `finish` is given besides the corners. */
interface FinishOptions {
  applied?: number
  notes?: string[]
  tidyAll?: boolean
  pieces?: Map<Id, Id[]>
  renamed0?: Map<Id, Id>
}

/** The corners tidied, checked and given their box. */
function finish(t: Basis, g: Read, corners: Corner[], opts: FinishOptions): OutlineRun {
  const tidy = tidyOutline(corners, opts.tidyAll !== false)
  const renamed = new Map<Id, Id>()
  for (const [lost, kept] of opts.renamed0 ?? []) renamed.set(lost, tidy.renamed.get(kept) ?? kept)
  for (const [lost, kept] of tidy.renamed) if (!renamed.has(lost)) renamed.set(lost, kept)
  const out = tidy.outline
  if (!validOutline(out)) return refuse('The outline would cross itself, or leave a wall under a centimetre', opts.notes ?? [], opts.applied !== undefined ? 0 : undefined)
  const arcs: Record<string, number> = {}
  out.forEach((c, i) => {
    if (c.bulge) arcs[String(i)] = c.bulge
  })
  const outline: OutlineCorner[] = out.map((c) => {
    const own: Corner = { ...c }
    delete own.bulge
    return own
  })
  // the walls must still stand round it: each edge's face from its own wall
  const sharp: Vertex[] = outline.map((c) => ({ x: c.x, y: c.y, r: c.r ?? 0, ...(c.chamfer ? { chamfer: c.chamfer } : {}) }))
  const reference: Contour = { vertices: sharp, ...(Object.keys(arcs).length ? { arcs } : {}) }
  if (
    !offsetEdges(
      reference,
      outline.map((c) => (c.thickness ?? t.envelope.thickness) + (c.offset ?? 0)),
    )
  )
    return refuse('The walls do not fit there', opts.notes ?? [], opts.applied !== undefined ? 0 : undefined)
  // the edges each old one became, under the ids that stayed
  const pieces = new Map<Id, Id[]>()
  if (opts.pieces) {
    const live = new Set(outline.map((c) => c.id))
    for (const [id, ids] of opts.pieces) {
      const now = [...new Set(ids.map((x) => renamed.get(x) ?? x))].filter((x) => live.has(x))
      if (now.length) pieces.set(id, now)
    }
  }
  const fit = fitBox(t, g, outline, Object.keys(arcs).length ? arcs : undefined)
  const unchanged = fit.fit.shift.x === 0 && fit.fit.shift.y === 0 && fit.dropped === 0 && sameOutline(fit.outline, g.outline) && JSON.stringify(Object.keys(arcs).length ? arcs : {}) === JSON.stringify(arcsOf(g.edges))
  const notes = [...(opts.notes ?? [])]
  if (fit.dropped > 0) notes.push(`${fit.dropped} hole${fit.dropped === 1 ? '' : 's'} no longer fit${fit.dropped === 1 ? 's' : ''} inside the outline and ${fit.dropped === 1 ? 'was' : 'were'} left out`)
  const edit: OutlineEdit = {
    outline: fit.outline,
    renamed,
    split: null,
    holes: fit.fit.morphology.holes,
    fit: fit.fit,
    ...(opts.pieces ? { pieces } : {}),
    notes,
    ...(opts.applied !== undefined && { applied: opts.applied }),
    ...(unchanged && { unchanged: true as const }),
  }
  return { ok: true, edit }
}

/**
 * The box fitted round an outline in metres (its bounding box: length and width, its ends kept as near their lines as they can be),
 * the outline, the holes that still fit and the zones on the new box, `shift` where its column line A / 1 stands in the old frame.
 * The same box: as it is.
 */
function fitBox(t: Basis, g: Read, outline: OutlineCorner[], arcs: Record<string, number> | undefined): { fit: BoxFit; outline: OutlineCorner[]; dropped: number } {
  // the box holds an outward arc: its farthest point, not its chord (Phase D.3)
  const far = arcBox({ vertices: outline.map((c) => ({ x: c.x, y: c.y, r: 0 })), ...(arcs ? { arcs } : {}) })
  const x0 = mm(far.x0)
  const y0 = mm(far.y0)
  const x1 = mm(far.x1)
  const y1 = mm(far.y1)
  const nx = count(g.runs.x)
  const ny = count(g.runs.y)
  const zones = zonesOn(t, g.runs)
  const was = { x: t.hall.ends, y: t.hall.endsWidth ?? t.hall.ends, short: t.hall.shortEnds, joinUnder: t.hall.joinUnder }
  const unchanged = Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6 && Math.abs(x1 - g.runs.x.length) < 1e-3 && Math.abs(y1 - g.runs.y.length) < 1e-3
  const keep = (hs: ShapeHole[], o: OutlineCorner[]) => {
    const kept: ShapeHole[] = []
    for (const h of hs) if (holeFits(o, h, kept)) kept.push(h)
    return kept
  }
  const morphology = (o: OutlineCorner[], holes: ShapeHole[], z: HallZone[]) => ({ outline: o, ...(arcs ? { arcs } : {}), holes, ...(z.length ? { zones: z } : {}) })
  if (unchanged) {
    const holes = keep(g.holes, outline)
    return { fit: { hall: { length: t.hall.length, width: t.hall.width, ...hallEnds(was) }, morphology: morphology(outline, holes, zones), shift: { x: 0, y: 0 } }, outline, dropped: g.holes.length - holes.length }
  }
  const length = mm(x1 - x0)
  const width = mm(y1 - y0)
  const shift = (r: Run, d: number) => ({ lines: r.lines.map((v) => v - d), modules: r.modules.map((v) => v - d) })
  const ends = hallEnds(endsKeeping({ x: length, y: width }, t.grid, was, { x: shift(g.runs.x, x0), y: shift(g.runs.y, y0) }))
  const { endsWidth: _w, shortEnds: _s, ...base } = t.hall
  const next: HallRuns = hallRuns({ grid: t.grid, hall: { ...base, length, width, ...ends } })
  const mx = count(next.x)
  const my = count(next.y)
  const moved = outline.map((c) => ({ ...c, x: mm(c.x - x0), y: mm(c.y - y0) }))
  const holes = keep(
    g.holes.map((h) => ({ ...h, vertices: h.vertices.map((v) => ({ ...v, x: mm(v.x - x0), y: mm(v.y - y0) })) })),
    moved,
  )
  // a zone's lines are module lines: each to the line of the new box nearest where it stood; the box's own walls stay its walls
  const line = (r: Run, nextRun: Run, lo: number, hi: number, last: number, k: number) => {
    const m = moduleAt(r, k)
    return m <= lo + ON ? 0 : m >= hi - ON ? last : Math.max(0, Math.min(last, nearestLine(nextRun, m - lo)))
  }
  const zx = (k: number) => (k <= 0 ? 0 : k >= nx ? mx : line(g.runs.x, next.x, x0, x1, mx, k))
  const zy = (k: number) => (k <= 0 ? 0 : k >= ny ? my : line(g.runs.y, next.y, y0, y1, my, k))
  const z = zones.map((q) => ({ ...q, x: [zx(q.x[0]), zx(q.x[1])] as [number, number], y: [zy(q.y[0]), zy(q.y[1])] as [number, number] })).filter((q) => q.x[1] > q.x[0] && q.y[1] > q.y[0])
  return { fit: { hall: { length, width, ...ends }, morphology: morphology(moved, holes, z), shift: { x: x0, y: y0 } }, outline: moved, dropped: g.holes.length - holes.length }
}
