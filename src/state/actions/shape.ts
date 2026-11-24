// Editing a mass's shape: walls, corners, radii and chamfers. Port of Plaza-Practiko `estado/acciones/muros.ts`, without shared
// walls or aisles. Pure verbs, like the rest of `actions/`: an MCP tool can call them just like the handles do.
// Phase D.1 (Decision "Shape engine"): one pair of verbs for the outline of anything, `shapeOf(p, ref)` (what its handles draw) and
// `editShape(p, ref, op)` (one operation, `engine/geom/shapeOp.ts`), with one adapter a kind (`SHAPE_ADAPTERS`, checked against the
// kinds that declare `shape`): a mass's here, a mass's hole in `holes.ts`, a block's in the warehouse's `actions.ts`. The kind says
// what it refuses (`Kind.shape.without`), the object what it refuses beyond (`ShapeRead.without`); a refusal is the SAME project
// and why. The verbs of before (`moveWall`, `dragVertex`…) are wrappers over the mass's adapter, for the MCP tools and the dimensions.
// - A `rect` stays a rect when a wall or a corner moves: it resizes and the opposite side stays.
// - Adding, deleting, rounding or chamfering a corner first turns it into a free `contour` (`toContour`).
// - An edit the geometry rejects returns the SAME project: no undo step. `dragVertex` returns null instead, so the
//   store keeps the last valid view and the handle turns red; `moveWall` moves as far as it can and says how far.
import type { Contour, Footprint, Id, Point, Project } from '../../model/schema.ts'
import * as edit from '../../engine/geom/edit.ts'
import { footprintContour } from '../../engine/geom/footprint.ts'
import { opName, runShapeOp, type ShapeAdapter, type ShapeOp, type ShapeRead, type ShapeWrite } from '../../engine/geom/shapeOp.ts'
import { kindOf, type Ref } from '../../kinds/index.ts'
import { blockHoleOf, blockShapeOf, blockWalls, courtShapeOf, editBlockHole, editBlockShape, editCourtShape, editTypeShape, typeShapeOf } from '../../modules/warehouse/actions.ts'
import { holeAdapter } from './holes.ts'
import { updateMass } from './masses.ts'

const footprintOf = (p: Project, id: Id): Footprint | null => p.masses.find((m) => m.id === id)?.footprint ?? null
const withFootprint = (p: Project, id: Id, footprint: Footprint) => updateMass(p, id, { footprint })
const withContour = (p: Project, id: Id, contour: Contour) => withFootprint(p, id, { kind: 'contour', contour })

/** A rect becomes a free shape with the same four corners (a contour stays as it is). */
export function toContour(p: Project, id: Id): Project {
  const f = footprintOf(p, id)
  return f?.kind === 'rect' ? withContour(p, id, footprintContour(f)) : p
}

// ---- The adapter of a mass ----

/** One operation on a mass as any mass is: a rect stays a rect for a push and a corner, and becomes a contour for the rest. */
function writeMass(p: Project, ref: Ref, op: ShapeOp): ShapeWrite {
  const f = footprintOf(p, ref.id)
  if (!f) return { project: p, reason: 'That mass is not there' }
  if (op.op === 'move') return { project: p, reason: 'A mass moves by Transform' }
  if (f.kind === 'rect' && op.op === 'push') {
    if (op.by === 0) return { project: p, applied: 0 }
    const r = edit.moveRectWall(f, op.wall, op.by)
    return r.applied === 0 ? { project: p, applied: 0, reason: 'A side cannot be shorter than 1 m' } : { project: withFootprint(p, ref.id, r.footprint), applied: r.applied }
  }
  if (f.kind === 'rect' && op.op === 'vertex') {
    const corner = footprintContour(f).vertices[((op.vertex % 4) + 4) % 4]
    return { project: withFootprint(p, ref.id, edit.moveRectCorner(f, op.vertex, op.to, corner).footprint) }
  }
  const c = footprintContour(f)
  const r = runShapeOp(c, op)
  const notes = r.notes.length > 0 ? { notes: r.notes } : {}
  const pushed = op.op === 'push' || op.op === 'bump'
  if (!r.ok) return { project: p, reason: r.reason, ...(pushed && { applied: 0 }), ...notes }
  return { project: r.contour === c ? p : withContour(p, ref.id, r.contour), ...(r.applied !== undefined && { applied: r.applied }), ...notes }
}

const massAdapter: ShapeAdapter = {
  read(p, ref) {
    const f = footprintOf(p, ref.id)
    if (!f) return null
    // a block's mass: its face as the shape engine reads it, its walls with their module lines (the warehouse's reader)
    return blockShapeOf(p, ref) ?? { contour: footprintContour(f) }
  },
  write: (p, ref, op) => (blockWalls(p, ref.id) ? editBlockShape(p, ref, op) : writeMass(p, ref, op)),
}

/** How each kind with a `shape` is read and written, by the kind's id (`__tests__/shapeEngine.test.ts` checks it against the registry). */
export const SHAPE_ADAPTERS: Record<string, ShapeAdapter> = {
  mass: massAdapter,
  'mass-hole': holeAdapter,
  'block-type': { read: typeShapeOf, write: editTypeShape },
  // a hole of the block editor (the warehouse's); a placed copy's hole is `mass-hole`'s, handed to the same writer (holes.ts)
  hole: { read: (p, ref) => blockHoleOf(p, ref) ?? null, write: (p, ref, op) => editBlockHole(p, ref, op) ?? { project: p, reason: 'That hole is not there' } },
  // a truck court (Phase D.3): the block editor's (`court`, `<typeId>/<edgeId>[/<courtId>]`) and a placed block's (`block-court`, `<hallMassId>/<edgeId>[/<courtId>]`), one writer
  court: { read: courtShapeOf, write: editCourtShape },
  'block-court': { read: courtShapeOf, write: editCourtShape },
}

/** The outline of the object `ref` names, as its kind reads it (and what it refuses); null when there is none. */
export function shapeOf(p: Project, ref: Ref): ShapeRead | null {
  return SHAPE_ADAPTERS[ref.kind]?.read(p, ref) ?? null
}

/**
 * One operation on the outline of `ref`: its kind's refusals first, then the object's, then the adapter writes. A refusal is the SAME
 * project and `reason`; a push says how far it went (`applied`, m); a hole copied says its new ref.
 */
export function editShape(p: Project, ref: Ref, op: ShapeOp): ShapeWrite {
  const kind = kindOf(ref.kind)
  const adapter = SHAPE_ADAPTERS[ref.kind]
  if (!kind?.shape || !adapter) return { project: p, reason: `A ${(kind?.label ?? ref.kind).toLowerCase()} has no outline to edit` }
  const name = opName(op)
  const by = `A ${kind.label.toLowerCase()} does not take ${name}`
  const read = adapter.read(p, ref)
  // a kind that refuses an op says so before it says the object is not there; the object may say why in its own words (a block's module lines)
  if (!read) return { project: p, reason: kind.shape.without?.includes(name) ? by : `That ${kind.label.toLowerCase()} is not there` }
  if (kind.shape.without?.includes(name) || read.without?.includes(name)) return { project: p, reason: read.why ?? by }
  return adapter.write(p, ref, op)
}

// ---- The verbs of before, over the mass's adapter ----

const massRef = (id: Id): Ref => ({ kind: 'mass', id })
/** One operation through the mass's adapter, as `editShape` writes it: a block's mass gets its rules (its refusal and reason), a plain mass is as it always was. */
const write = (p: Project, id: Id, op: ShapeOp): ShapeWrite => massAdapter.write(p, massRef(id), op)

/**
 * Why a mass refuses a corner moved, added or rounded, a free push or a stretch by its corners: what its reader says it refuses (its
 * `ShapeRead.why`). Undefined for a plain mass, a block's (its outline is free since D.2) or one that is not there.
 */
export function refusalOf(p: Project, id: Id): string | undefined {
  const read = shapeOf(p, massRef(id))
  return read?.without?.length ? read.why : undefined
}

/**
 * Moves wall i of the mass by d along its outward normal; as far as the shape allows (`applied`). Square by default
 * (Decision "Square pull"): a corner added on the wall stays and a step goes out from it; `free` (the Ctrl drag, a
 * dimension's length) slides both corners along their neighbouring walls, whatever angle that makes. A block's mass keeps its
 * rules (a push by whole modules; a free one is refused): `reason` says why nothing moved.
 */
export function moveWall(p: Project, id: Id, i: number, d: number, free = false): { project: Project; applied: number; notes: string[]; reason?: string } {
  if (!footprintOf(p, id)) return { project: p, applied: 0, notes: [] }
  const w = write(p, id, { op: 'push', wall: i, by: d, free })
  return { project: w.project, applied: w.applied ?? 0, notes: w.notes ?? [], ...(w.reason && { reason: w.reason }) }
}

/** Moves corner i to `point`. A rect resizes (opposite corner fixed); a contour moves that corner only; a block's mass refuses. */
export function moveVertex(p: Project, id: Id, i: number, point: Point): Project {
  return dragVertex(p, id, i, point) ?? p
}

/** moveVertex for a drag: null when the geometry rejects it (or a block's rules do). */
export function dragVertex(p: Project, id: Id, i: number, point: Point): Project | null {
  if (!footprintOf(p, id)) return null
  const w = write(p, id, { op: 'vertex', vertex: i, to: point })
  return w.reason ? null : w.project
}

/**
 * Stretches the mass along the unit vector u: the corners past `cut` (measured along u) move d. A rect becomes a free
 * shape. The same project when the geometry rejects it (it would flip or cross itself), and for a block's mass (its outline is
 * the block's own: the shape verbs edit it).
 */
export function stretchMass(p: Project, id: Id, u: Point, cut: number, d: number): Project {
  const f = footprintOf(p, id)
  if (!f || d === 0 || refusalOf(p, id) || blockWalls(p, id)) return p
  const r = edit.stretch(footprintContour(f), u, cut, d)
  return r.ok ? withContour(p, id, r.contour) : p
}

/** Adds a corner on wall i, at the point of the wall closest to `point` (it becomes corner i + 1). */
export function insertVertex(p: Project, id: Id, i: number, point: Point): Project {
  return write(p, id, { op: 'insert', wall: i, at: point }).project
}

export function removeVertex(p: Project, id: Id, i: number): Project {
  return write(p, id, { op: 'remove', vertex: i }).project
}

export function setCornerRadius(p: Project, id: Id, i: number, r: number): Project {
  return write(p, id, { op: 'radius', vertex: i, r }).project
}
