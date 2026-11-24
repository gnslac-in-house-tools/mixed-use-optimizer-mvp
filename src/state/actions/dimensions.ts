// Dimension actions (the Dimension tool, the plan and Properties): add, remove, lock, offset and a typed length.
// Pure, like the mass actions; nothing changed → the same project. Port of Plaza-Practiko
// `estado/acciones/acotaciones.ts` (without moving an end): a dimension is drawn on a level, and an end placed on a
// corner of a mass of that level is anchored to it.
// That a dimension follows its corners and a lock holds is the store's job: `state/settle.ts`.
// A target (BE.10): absent, the Project's; `{ type }`, a warehouse type's own (the block editor's plan: in the type's
// frame, on no level of the project, its `levelId` the type's id, never anchored), saved with the type in its block.
import type { Dimension, DimensionAnchor, Id, Point, Project } from '../../model/schema.ts'
import { footprintContour, rotate } from '../../engine/geom/footprint.ts'
import { reflectPoint } from '../../engine/geom/reflect.ts'
import { levelOrGround } from '../../engine/levels.ts'
import { LOCKED_DIMENSION } from '../dimensionAnchors.ts'
import { settle } from '../settle.ts'
import { moveMass, newId } from './masses.ts'
import { moveWall, refusalOf, shapeOf, stretchMass } from './shape.ts'

/** A point closer than this to a corner is anchored to it (the Endpoint snap puts it exactly there). */
const ANCHOR_TOL = 1e-3
/** No dimension is shorter than this (a double click on one point). */
const LENGTH_MIN = 1e-3

const lengthOf = (d: Pick<Dimension, 'a' | 'b'>) => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)

/** Whose dimensions a verb works on: absent, the Project's; a warehouse type's own (the block editor's). */
export type DimensionTarget = { type: Id }

/** The target's dimensions; undefined when the type is not there. */
function dimensionsOf(p: Project, on?: DimensionTarget): Dimension[] | undefined {
  if (!on) return p.dimensions ?? []
  const t = p.warehouseTypes?.find((x) => x.id === on.type)
  return t ? (t.dimensions ?? []) : undefined
}

/** The project with the target's dimensions replaced. */
function withDimensions(p: Project, dims: Dimension[], on?: DimensionTarget): Project {
  if (!on) return { ...p, dimensions: dims }
  return { ...p, warehouseTypes: (p.warehouseTypes ?? []).map((t) => (t.id === on.type ? { ...t, dimensions: dims } : t)) }
}

/** The corners at `q` of the masses on a level (two neighbouring masses can share one). */
function anchorsAt(p: Project, q: Point, levelId: Id): DimensionAnchor[] {
  const r: DimensionAnchor[] = []
  for (const m of p.masses) {
    if (m.levelId !== levelId) continue
    const i = footprintContour(m.footprint).vertices.findIndex((v) => Math.abs(v.x - q.x) <= ANCHOR_TOL && Math.abs(v.y - q.y) <= ANCHOR_TOL)
    if (i >= 0) r.push({ massId: m.id, vertex: i })
  }
  return r
}

/** The anchors of a new dimension's two ends: if they share a mass, both on it (a side of a mass is not anchored to
 *  the neighbour that shares its corner). */
function anchorsOfDimension(p: Project, a: Point, b: Point, levelId: Id): [DimensionAnchor | undefined, DimensionAnchor | undefined] {
  const ka = anchorsAt(p, a, levelId)
  const kb = anchorsAt(p, b, levelId)
  const shared = ka.find((x) => kb.some((y) => y.massId === x.massId))
  if (shared) return [shared, kb.find((y) => y.massId === shared.massId)]
  return [ka[0], kb[0]]
}

/** The corner an anchor points at, if its mass and vertex exist. */
function anchorPoint(p: Project, k: DimensionAnchor): Point | undefined {
  const m = p.masses.find((x) => x.id === k.massId)
  const v = m ? footprintContour(m.footprint).vertices[k.vertex] : undefined
  return v ? { x: v.x, y: v.y } : undefined
}

/**
 * A new dimension from a to b on a level (absent, or one that does not exist: the ground floor), its line `offset` m
 * to the left of a→b; null when a and b coincide (or the target's type is not there). An end on a corner of a mass of
 * that level is anchored to it, exactly on the corner (a fraction of a millimetre off, the first edit would move it).
 * On a type (`on`), the level is the type's own and nothing anchors.
 */
export function addDimension(p: Project, a: Point, b: Point, offset: number, levelId?: Id, on?: DimensionTarget): { project: Project; id: Id } | null {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-3) return null
  const dims = dimensionsOf(p, on)
  if (!dims) return null
  const id = newId('d', dims.map((d) => d.id))
  if (on) return { project: withDimensions(p, [...dims, { id, levelId: on.type, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, offset }], on), id }
  const level = levelOrGround(p, levelId)
  const [ka, kb] = anchorsOfDimension(p, a, b, level)
  const qa = (ka && anchorPoint(p, ka)) ?? a
  const qb = (kb && anchorPoint(p, kb)) ?? b
  const d: Dimension = {
    id,
    levelId: level,
    a: { x: qa.x, y: qa.y },
    b: { x: qb.x, y: qb.y },
    offset,
    ...(ka ? { anchorA: ka } : {}),
    ...(kb ? { anchorB: kb } : {}),
  }
  return { project: withDimensions(p, [...dims, d]), id }
}

export function removeDimension(p: Project, id: Id, on?: DimensionTarget): Project {
  const dims = dimensionsOf(p, on)
  if (!dims?.some((d) => d.id === id)) return p
  return withDimensions(p, dims.filter((d) => d.id !== id), on)
}

function withDimension(p: Project, id: Id, f: (d: Dimension) => Dimension, on?: DimensionTarget): Project {
  const dims = dimensionsOf(p, on) ?? []
  const i = dims.findIndex((d) => d.id === id)
  if (i < 0) return p
  const next = f(dims[i])
  return next === dims[i] ? p : withDimensions(p, dims.map((d, k) => (k === i ? next : d)), on)
}

/**
 * The project's own dimensions (`p.dimensions`) with `f` applied to the picked ones: their two ends move and they let go
 * of the corners they were anchored to (a dimension moved on its own is free); `locked` and `offset` stay.
 */
function placed(p: Project, ids: Id[], f: (q: Point) => Point): Project {
  const these = new Set(ids)
  if (!p.dimensions?.some((d) => these.has(d.id))) return p
  return {
    ...p,
    dimensions: p.dimensions.map((d) => {
      if (!these.has(d.id)) return d
      const { anchorA: _a, anchorB: _b, ...rest } = d
      return { ...rest, a: f(d.a), b: f(d.b) }
    }),
  }
}

/** Dimensions moved by d, free (Decision "General tools"): both ends go, the anchors are dropped; `locked` and `offset` stay. */
export function moveDimensions(p: Project, ids: Id[], d: Point): Project {
  if ((d.x === 0 && d.y === 0) || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return p
  return placed(p, ids, (q) => ({ x: q.x + d.x, y: q.y + d.y }))
}

/** Dimensions turned by `degrees` about `pivot`, free: both ends go round, the anchors are dropped; `locked` and `offset` stay. */
export function turnDimensions(p: Project, ids: Id[], pivot: Point, degrees: number): Project {
  if (degrees === 0 || !Number.isFinite(degrees) || !Number.isFinite(pivot.x) || !Number.isFinite(pivot.y)) return p
  return placed(p, ids, (q) => rotate(q, pivot, degrees))
}

/**
 * Dimensions seen in the mirror about the line through a and b (Decision "Mirror, Array, Align"): their ends reflected and the sign
 * of `offset` changed, so the line stays on the same side of what it measures. `ids`: the picked ones, freed from their anchors as
 * a turned one is. `moved`: the masses reflected (each with where a corner of it went: its vertex's index after): a dimension
 * anchored at both ends to them goes with them, its anchors on the same corners, picked or not; one anchored at one end only keeps
 * that anchor on its corner (the corner goes, the dimension stretches). `locked` stays.
 */
export function mirrorDimensions(p: Project, ids: Id[], a: Point, b: Point, moved: ReadonlyMap<Id, (vertex: number) => number> = new Map()): Project {
  if (!p.dimensions?.length || ![a.x, a.y, b.x, b.y].every(Number.isFinite) || (a.x === b.x && a.y === b.y)) return p
  const these = new Set(ids)
  const r = (q: Point) => reflectPoint(q, a, b)
  const follows = (k: DimensionAnchor | undefined): k is DimensionAnchor => k !== undefined && moved.has(k.massId)
  const onto = (k: DimensionAnchor): DimensionAnchor => ({ ...k, vertex: moved.get(k.massId)!(k.vertex) })
  const flipped = (offset: number) => (offset === 0 ? 0 : -offset)
  let changed = false
  const dimensions = p.dimensions.map((d) => {
    const both = follows(d.anchorA) && follows(d.anchorB)
    if (both) return { ...d, a: r(d.a), b: r(d.b), offset: flipped(d.offset), anchorA: onto(d.anchorA!), anchorB: onto(d.anchorB!) }
    if (these.has(d.id)) {
      const { anchorA: _a, anchorB: _b, ...rest } = d
      return { ...rest, a: r(d.a), b: r(d.b), offset: flipped(d.offset) }
    }
    if (!follows(d.anchorA) && !follows(d.anchorB)) return d
    return {
      ...d,
      ...(follows(d.anchorA) ? { a: r(d.a), anchorA: onto(d.anchorA) } : {}),
      ...(follows(d.anchorB) ? { b: r(d.b), anchorB: onto(d.anchorB) } : {}),
    }
  })
  dimensions.forEach((d, i) => {
    if (d !== p.dimensions![i]) changed = true
  })
  return changed ? { ...p, dimensions } : p
}

/** Locks or unlocks a dimension: locked, it keeps its length (settle.ts). */
export function toggleDimensionLock(p: Project, id: Id): Project {
  return withDimension(p, id, (d) => {
    if (!d.locked) return { ...d, locked: true }
    const { locked: _, ...free } = d
    return free
  })
}

/** How far the dimension line is from its points (m, positive to the left of a→b). */
export function setDimensionOffset(p: Project, id: Id, offset: number, on?: DimensionTarget): Project {
  if (!Number.isFinite(offset)) return p
  return withDimension(p, id, (d) => (d.offset === offset ? d : { ...d, offset }), on)
}

/**
 * Typing a dimension's length moves the geometry along it (port of Practiko's `fijarLargoAcotacion`): both ends on
 * one mass stretch it (b's side); b on a mass moves that mass; only a on a mass moves it the other way; no anchors
 * move b. `notice` says why nothing changed. The result is settled: the locks hold, and the dimension must end at that
 * length (a chain of locks back to a's mass would leave it as it was).
 */
export function setDimensionLength(p: Project, id: Id, length: number): { project: Project; notice?: string } {
  const d = p.dimensions?.find((x) => x.id === id)
  if (!d) return { project: p }
  if (!Number.isFinite(length) || length < LENGTH_MIN) return { project: p, notice: 'Type a length above 0.' }
  if (d.locked) return { project: p, notice: 'This is a dimension with a fixed length: free its length to change it.' }
  const l = lengthOf(d)
  const delta = length - l
  if (Math.abs(delta) < 1e-9) return { project: p }
  const u = { x: (d.b.x - d.a.x) / l, y: (d.b.y - d.a.y) / l }
  const ma = d.anchorA?.massId
  const mb = d.anchorB?.massId
  let r: Project
  if (mb !== undefined && mb === ma) {
    const s = stretchAlong(p, mb, d.a, d.b, u, delta)
    if ('notice' in s) return { project: p, notice: s.notice }
    r = s.project
  } else if (mb !== undefined) r = moveMass(p, mb, { x: u.x * delta, y: u.y * delta })
  else if (ma !== undefined) r = moveMass(p, ma, { x: -u.x * delta, y: -u.y * delta })
  else r = withDimension(p, id, (x) => ({ ...x, b: { x: x.b.x + u.x * delta, y: x.b.y + u.y * delta } }))
  const settled = settle(p, r)
  if ('refused' in settled) return { project: p, notice: settled.refused }
  const end = settled.project.dimensions?.find((x) => x.id === id)
  if (!end || Math.abs(lengthOf(end) - length) > 1e-4) return { project: p, notice: LOCKED_DIMENSION }
  return { project: settled.project }
}

/**
 * Stretches the mass so the dimension from a to b grows d: when what moves is a single wall square to the dimension,
 * that wall moves (a rect stays a rect); otherwise the corners past the middle of the dimension, on b's side, move.
 */
function stretchAlong(p: Project, id: Id, a: Point, b: Point, u: Point, d: number): { project: Project } | { notice: string } {
  const m = p.masses.find((x) => x.id === id)
  // the corners as moveWall counts its walls: a block's face, not its faceted footprint
  const vs = m ? (shapeOf(p, { kind: 'mass', id })?.contour ?? footprintContour(m.footprint)).vertices : []
  const n = vs.length
  const cut = ((a.x + b.x) / 2) * u.x + ((a.y + b.y) / 2) * u.y
  const side = vs.map((q, i) => (q.x * u.x + q.y * u.y > cut ? i : -1)).filter((i) => i >= 0)
  if (side.length === 2 && n > 2) {
    // wall i runs from corner i to corner i + 1
    const i = (side[0] + 1) % n === side[1] ? side[0] : (side[1] + 1) % n === side[0] ? side[1] : -1
    if (i >= 0) {
      const q0 = vs[i]
      const q1 = vs[(i + 1) % n]
      const lw = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1
      const w = { x: (q1.x - q0.x) / lw, y: (q1.y - q0.y) / lw }
      if (Math.abs(w.x * u.x + w.y * u.y) < 1e-6) {
        // how much of the dimension goes along the wall's outward normal (counter-clockwise outline: on its right)
        const s = w.y * u.x - w.x * u.y
        // a block's wall goes by whole modules, through the block's push (a free one is refused): a length off its lines says why
        const free = !shapeOf(p, { kind: 'mass', id })?.without?.includes('push-free')
        const r = moveWall(p, id, i, d * s, free)
        if (Math.abs(r.applied - d * s) > 1e-6) return { notice: r.reason ?? 'The mass cannot take that length.' }
        return { project: r.project }
      }
    }
  }
  const r = stretchMass(p, id, u, cut, d)
  return r === p ? { notice: refusalOf(p, id) ?? 'The mass cannot stretch to that length.' } : { project: r }
}
