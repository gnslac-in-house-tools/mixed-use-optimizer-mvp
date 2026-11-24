// A mass's holes (Phase H.3, Decision "Holes and free geometry"; port of Plaza-Practiko `estado/acciones/huecos.ts`):
// closed outlines inside a mass that are not mass (a court, a light well). Stored as drawn, in site coordinates;
// derive clips them to the mass (engine/geom/holes.ts). Hole k is `mass.holes[k]`; on a block's hall (Phase D.2) it is the copy's own
// hole k, a free contour of the block (the warehouse's `editBlockHoles`: the copy a variant). Pure verbs, like the rest of
// `actions/`: the Hole tool and its handles call them, and so can an MCP tool.
// An edit the geometry rejects returns the SAME project (no undo step); `dragHoleVertex` returns null instead, so the
// store keeps the last valid view and the handle turns red.
import type { Contour, Hole, Id, Point, Project } from '../../model/schema.ts'
import { normalize } from '../../engine/geom/contour.ts'
import { translateHoles } from '../../engine/geom/holes.ts'
import { runShapeOp, type ShapeAdapter, type ShapeOp, type ShapeWrite } from '../../engine/geom/shapeOp.ts'
import type { Ref } from '../../kinds/types.ts'
import { blockHoleOf, editBlockHole, editBlockHoles } from '../../modules/warehouse/actions.ts'

const holeOf = (p: Project, id: Id, k: number): Hole | null => p.masses.find((m) => m.id === id)?.holes?.[k] ?? null

/** The mass with its holes `holes` (none: without the field). */
function withHoles(p: Project, id: Id, holes: Hole[]): Project {
  return {
    ...p,
    masses: p.masses.map((m) => {
      if (m.id !== id) return m
      if (holes.length > 0) return { ...m, holes }
      const { holes: _gone, ...rest } = m
      return rest
    }),
  }
}

/** Hole k reshaped as `c`: its corridor stays. */
function withHole(p: Project, id: Id, k: number, c: Contour): Project {
  const m = p.masses.find((x) => x.id === id)
  const old = m?.holes?.[k]
  if (!m?.holes || !old) return p
  const hole: Hole = { vertices: c.vertices, ...(c.arcs && { arcs: c.arcs }), ...(old.corridor && { corridor: old.corridor }) }
  return withHoles(p, id, m.holes.map((h, j) => (j === k ? hole : h)))
}

/** Adds a hole to the mass (counter-clockwise, as a contour); it is the mass's last, `k`. A block's hole is the cut as drawn: its wall grows out from it. Null when it does not fit inside the block. */
export function addHole(p: Project, id: Id, contour: Contour): { project: Project; k: number } | null {
  const m = p.masses.find((x) => x.id === id)
  if (!m) return null
  const block = editBlockHoles(p, id, { kind: 'add', contour, face: true })
  if (block) return block.k === undefined ? null : { project: block.project, k: block.k }
  const holes = [...(m.holes ?? []), normalize(structuredClone(contour))]
  return { project: withHoles(p, id, holes), k: holes.length - 1 }
}

/** Alt+drag (Decision "Alt+drag copies"): a copy of hole k moved by d, the mass's last hole; the original stays. */
export function copyHole(p: Project, id: Id, k: number, d: Point): { project: Project; k: number } | null {
  // a block's hall: the copy's own hole, copied as the block's writer does (not the mass's face of it)
  const block = editBlockHole(p, holeRef(id, k), { op: 'move', by: d, copy: true })
  if (block) return block.reason || !block.ref ? null : { project: block.project, k: Number(block.ref.id.slice(block.ref.id.lastIndexOf('/') + 1)) }
  const h = holeOf(p, id, k)
  return h ? addHole(p, id, translateHoles([h], d)[0]) : null
}

export function removeHole(p: Project, id: Id, k: number): Project {
  const block = editBlockHoles(p, id, { kind: 'remove', k })
  if (block) return block.project
  const m = p.masses.find((x) => x.id === id)
  if (!m?.holes?.[k]) return p
  return withHoles(p, id, m.holes.filter((_, j) => j !== k))
}

export function moveHole(p: Project, id: Id, k: number, d: Point): Project {
  return writeHole(p, id, k, { op: 'move', by: d }).project
}

/** Redraws hole k (the same project if it is not there). */
export function setHole(p: Project, id: Id, k: number, contour: Contour): Project {
  const block = editBlockHoles(p, id, { kind: 'set', k, contour })
  if (block) return block.project
  return holeOf(p, id, k) ? withHole(p, id, k, normalize(structuredClone(contour))) : p
}

/** The corridor round hole k (Phase H.4): `width` m inside the mass; null or 0: none. */
export function setHoleCorridor(p: Project, id: Id, k: number, width: number | null): Project {
  const block = editBlockHoles(p, id, { kind: 'corridor', k, width })
  if (block) return block.project
  const m = p.masses.find((x) => x.id === id)
  const old = m?.holes?.[k]
  if (!m?.holes || !old) return p
  const w = width && width > 0 ? width : undefined
  if (old.corridor === w) return p
  const { corridor: _was, ...shape } = old
  return withHoles(p, id, m.holes.map((h, j) => (j === k ? { ...shape, ...(w && { corridor: w }) } : h)))
}

/** Moves corner i of hole k to `point`; the same project when the geometry rejects it. */
export function moveHoleVertex(p: Project, id: Id, k: number, i: number, point: Point): Project {
  return dragHoleVertex(p, id, k, i, point) ?? p
}

/** moveHoleVertex for a drag: null when the geometry rejects it. */
export function dragHoleVertex(p: Project, id: Id, k: number, i: number, point: Point): Project | null {
  const w = writeHole(p, id, k, { op: 'vertex', vertex: i, to: point })
  return w.reason ? null : w.project
}

/** Adds a corner on wall i of hole k, at the point of the wall closest to `point` (it becomes corner i + 1). */
export function insertHoleVertex(p: Project, id: Id, k: number, i: number, point: Point): Project {
  return writeHole(p, id, k, { op: 'insert', wall: i, at: point }).project
}

/** Takes corner i out of hole k: its two walls join. The same project (and why) when the geometry does not allow it. */
export function removeHoleVertex(p: Project, id: Id, k: number, i: number): { project: Project; reason?: string } {
  const h = holeOf(p, id, k)
  if (!h || i < 0 || i >= h.vertices.length) return { project: p }
  const w = writeHole(p, id, k, { op: 'remove', vertex: i })
  return w.reason ? { project: p, reason: w.reason } : { project: w.project }
}

/** Moves wall i of hole k by d along its normal (d > 0 makes the hole bigger), as far as the shape allows (`applied`). */
export function moveHoleWall(p: Project, id: Id, k: number, i: number, d: number): { project: Project; applied: number; notes: string[] } {
  const w = writeHole(p, id, k, { op: 'push', wall: i, by: d, free: true })
  return { project: w.project, applied: w.applied ?? 0, notes: w.notes ?? [] }
}

// ---- The shape engine's adapter for a hole (Phase D.1, kind `mass-hole`; `Ref.id` is `<massId>/<k>`) ----

/** What a hole's handles move by (m). */
const HOLE_STEP = 0.1

/** A mass's hole as the engine names it. */
const holeRef = (id: Id, k: number): Ref => ({ kind: 'mass-hole', id: `${id}/${k}` })

/** Mass and index of a hole's ref; null for an id that names none. */
function holeAt(ref: Ref): { id: Id; k: number } | null {
  const s = ref.id.lastIndexOf('/')
  const tail = ref.id.slice(s + 1)
  return s > 0 && /^\d+$/.test(tail) ? { id: ref.id.slice(0, s), k: Number(tail) } : null
}

/** One operation on hole k of a mass: what the engine does to its outline, the corridor kept; a copy is the mass's last hole. */
function writeHole(p: Project, id: Id, k: number, op: ShapeOp): ShapeWrite {
  // a block's hall: the copy's own hole k, a free contour of the block (the warehouse's one writer)
  const block = editBlockHole(p, holeRef(id, k), op)
  if (block) return block
  const h = holeOf(p, id, k)
  if (!h) return { project: p, reason: 'That hole is not there' }
  if (op.op === 'move' && op.copy) {
    const made = copyHole(p, id, k, op.by)
    return made ? { project: made.project, ref: holeRef(id, made.k) } : { project: p, reason: 'That hole is not there' }
  }
  const r = runShapeOp(h, op)
  const notes = r.notes.length > 0 ? { notes: r.notes } : {}
  // a wall that did not move says so (0 m)
  const pushed = op.op === 'push' || op.op === 'bump'
  if (!r.ok) return { project: p, reason: r.reason, ...(pushed && { applied: 0 }), ...notes }
  return { project: r.contour === h ? p : withHole(p, id, k, r.contour), ...(r.applied !== undefined && { applied: r.applied }), ...notes }
}

/** A mass's hole in the shape engine: its walls, corners and place; no bump, radius or chamfer (its kind refuses them). A block's hall hands it to the warehouse's writer. */
export const holeAdapter: ShapeAdapter = {
  read(p, ref) {
    const at = holeAt(ref)
    // a block's hall: the copy's own hole
    const block = blockHoleOf(p, ref)
    if (block !== undefined) return block
    const h = at && holeOf(p, at.id, at.k)
    return h ? { contour: h, step: HOLE_STEP } : null
  },
  write(p, ref, op) {
    const at = holeAt(ref)
    return at ? writeHole(p, at.id, at.k, op) : { project: p, reason: 'That hole is not there' }
  },
}
