// One set of operations for any contour (Phase D.1, Decision "Shape engine"): a wall pushed, a bump or a notch, a corner moved,
// added or removed, a corner's radius or chamfer, a hole moved, an outline cut by a line (D.3: only a truck court takes it). `runShapeOp` runs
// one on a plain contour, answering what `edit.ts` answers (the edit's reason when it is refused, the contour as it was); which kinds take which is data (`Kind.shape`), and how an
// object of a kind is read and written is its adapter's (`state/actions/shape.ts`, the warehouse's `actions.ts`).
// The types here are what the adapters and the handles speak: the engine's alone, pure (no React, no store, no DOM).
import type { Ref } from '../../kinds/types.ts'
import type { Contour, Point, Project } from '../../model/schema.ts'
import { bulges, chamferOf } from './contour.ts'
import { insertVertex, moveVertex, moveWallLimited, pushSteps, pushWallLimited, removeVertex, setChamfer, setCornerRadius } from './edit.ts'
import { translateHoles } from './holes.ts'
import { splitByLine, type SplitPiece } from './split.ts'

/** What a person does to an outline. Walls and corners are numbered as the contour's: wall i runs from corner i to corner i + 1. */
export type ShapeOp =
  /** A wall along its normal (out: positive), as far as the shape allows; `free` (Ctrl) slides its corners along their walls instead of keeping it square. */
  | { op: 'push'; wall: number; by: number; free?: boolean }
  /** A bump (out) or a notch (in): from `from` to `to`, m along the wall from its start, pushed `by` m. */
  | { op: 'bump'; wall: number; from: number; to: number; by: number }
  | { op: 'vertex'; vertex: number; to: Point }
  /** A corner on a wall, at the point of it closest to `at`. */
  | { op: 'insert'; wall: number; at: Point }
  | { op: 'remove'; vertex: number }
  | { op: 'radius'; vertex: number; r: number }
  /** A chamfer: `a` m back along the corner's incoming wall, `b` along its outgoing one. */
  | { op: 'chamfer'; vertex: number; a: number; b: number }
  /** The whole outline by a vector (a hole); `copy`: a second one, the first stays. */
  | { op: 'move'; by: Point; copy?: boolean }
  /** The outline cut by the infinite line a–b (Phase D.3): every piece on either side of it (`ShapeRun.pieces`), the first as the contour. */
  | { op: 'split'; a: Point; b: Point }

/** The names a kind refuses by: the ops' own, and the free push apart (a block takes the square push only). */
export type ShapeOpName = ShapeOp['op'] | 'push-free'

/** The name an op is refused by. */
export const opName = (op: ShapeOp): ShapeOpName => (op.op === 'push' && op.free ? 'push-free' : op.op)

/**
 * What `runShapeOp` answers: the contour after (as it was when refused), `applied` (m) for a push or a bump, the notes of the edit,
 * and `from`: for each edge of the contour after, the edge it came from before (null: the op made it, a step or a bump's side).
 * Edge i runs from corner i to corner i + 1. A refused op answers the identity. A `split` also answers `pieces`: every piece it cut the contour
 * into, each with its own lineage, the first of them as `contour` and `from`.
 */
export type ShapeRun =
  | { contour: Contour; ok: true; applied?: number; notes: string[]; from: (number | null)[]; pieces?: SplitPiece[] }
  | { contour: Contour; ok: false; reason: string; notes: string[]; from: (number | null)[] }

/** The lineage of an op that adds and removes no edge. */
const identity = (c: Contour): (number | null)[] => c.vertices.map((_, i) => i)
const ok = (contour: Contour, from: (number | null)[], applied?: number, notes: string[] = []): ShapeRun => ({ contour, ok: true, ...(applied !== undefined && { applied }), notes, from })
const refused = (contour: Contour, reason: string, notes: string[] = []): ShapeRun => ({ contour, ok: false, reason, notes, from: identity(contour) })

/** A lineage through a second step: `step` is relative to the contour `first` gave, `first` relative to the one before. */
const compose = (first: (number | null)[], step: (number | null)[]): (number | null)[] => step.map((s) => (s === null ? null : first[s]))
/** The lineage of `insertVertex` on wall i of a contour of n edges: wall i twice. */
const insertedFrom = (n: number, i: number): (number | null)[] => {
  const out: (number | null)[] = []
  for (let k = 0; k < n; k++) {
    out.push(k)
    if (k === i) out.push(k)
  }
  return out
}
/** The lineage of `pushWall`: a step edge, `null`, goes out at each end that runs on, in the order the corners are written. */
function pushedFrom(n: number, i: number, steps: { a: boolean; b: boolean }): (number | null)[] {
  const j = (i + 1) % n
  const out: (number | null)[] = []
  for (let k = 0; k < n; k++) {
    if (k === i && steps.a) out.push(null)
    if (k === j && steps.b) out.push(null)
    out.push(k)
  }
  return out
}

/** m: no wall ends up shorter than 1 cm. */
const MIN_EDGE = 0.01
const mod = (i: number, n: number) => ((i % n) + n) % n
const tooShort = (c: Contour) => c.vertices.some((a, k) => Math.hypot(c.vertices[(k + 1) % c.vertices.length].x - a.x, c.vertices[(k + 1) % c.vertices.length].y - a.y) < MIN_EDGE)

/** A push as the contour's own: the limited one, as far as it goes. A push that moved nothing is refused with why. */
function push(c: Contour, wall: number, by: number, free: boolean): ShapeRun {
  if (!Number.isFinite(by)) return refused(c, 'the distance must be a number')
  if (by === 0) return ok(c, identity(c), 0)
  const r = free ? moveWallLimited(c, wall, by) : pushWallLimited(c, wall, by)
  if (r.applied === 0) return refused(c, r.notes[0] ?? 'cannot move', r.notes)
  // a square push steps out from each end that runs on: more corners than before
  const n = c.vertices.length
  const from = r.contour.vertices.length === n ? identity(c) : pushedFrom(n, mod(wall, n), pushSteps(c, wall))
  return ok(r.contour, from, r.applied, r.notes)
}

/** Two corners on the wall and the middle one pushed: the bump of a wall (a notch when it goes in). */
function bump(c: Contour, op: Extract<ShapeOp, { op: 'bump' }>): ShapeRun {
  const n = c.vertices.length
  const i = mod(op.wall, n)
  if (!Number.isFinite(op.by) || !Number.isFinite(op.from) || !Number.isFinite(op.to)) return refused(c, 'the bump needs numbers')
  if (bulges(c)[i] !== 0) return refused(c, 'a bump needs a straight wall')
  const a = c.vertices[i]
  const b = c.vertices[(i + 1) % n]
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const from = Math.max(0, Math.min(op.from, op.to))
  const to = Math.min(length, Math.max(op.from, op.to))
  if (to - from < MIN_EDGE) return refused(c, 'the bump has no length')
  if (op.by === 0) return ok(c, identity(c), 0)
  const at = (t: number): Point => ({ x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length })
  let cut = c
  let middle = i
  let lineage = identity(c)
  // the walls' own ends need no corner
  if (from > MIN_EDGE) {
    lineage = compose(lineage, insertedFrom(cut.vertices.length, i))
    cut = insertVertex(cut, i, at(from))
    middle = i + 1
  }
  if (to < length - MIN_EDGE) {
    lineage = compose(lineage, insertedFrom(cut.vertices.length, middle))
    cut = insertVertex(cut, middle, at(to))
  }
  if (tooShort(cut)) return refused(c, 'there is no room for a bump here')
  const r = push(cut, middle, op.by, false)
  return r.ok ? ok(r.contour, compose(lineage, r.from), r.applied, r.notes) : refused(c, r.reason, r.notes)
}

/** The line cuts the contour: its pieces (the first is the run's contour). A line that misses, or that is no line, is refused with why. */
function split(c: Contour, op: Extract<ShapeOp, { op: 'split' }>): ShapeRun {
  if (![op.a.x, op.a.y, op.b.x, op.b.y].every(Number.isFinite) || (op.a.x === op.b.x && op.a.y === op.b.y)) return refused(c, 'The line needs two different points')
  const r = splitByLine(c, op.a, op.b)
  if (!r.cut) return refused(c, 'The line does not cross it')
  return { contour: r.pieces[0].contour, ok: true, notes: [], from: r.pieces[0].from, pieces: r.pieces }
}

/** Runs `op` on a plain contour. An op the contour cannot take is `ok: false` with the reason, its contour the one given. */
export function runShapeOp(c: Contour, op: ShapeOp): ShapeRun {
  // an edit that keeps every edge: the identity
  const edited = (r: ReturnType<typeof moveVertex>): ShapeRun => (r.ok ? ok(r.contour, identity(r.contour), undefined, r.notes) : refused(c, r.reason))
  switch (op.op) {
    case 'push':
      return push(c, op.wall, op.by, op.free === true)
    case 'bump':
      return bump(c, op)
    case 'vertex':
      return edited(moveVertex(c, op.vertex, op.to))
    case 'insert': {
      // on top of an existing corner (a click at the very end of the wall): there is no room for one
      const q = insertVertex(c, op.wall, op.at)
      return tooShort(q) ? refused(c, 'there is no room for a corner here') : ok(q, insertedFrom(c.vertices.length, mod(op.wall, c.vertices.length)))
    }
    case 'remove': {
      const r = removeVertex(c, op.vertex)
      // the corner's two walls join: the merged edge comes from the one before it (corner 0: the last)
      const gone = mod(op.vertex, c.vertices.length)
      return r.ok ? ok(r.contour, identity(c).filter((k) => k !== gone), undefined, r.notes) : refused(c, r.reason)
    }
    case 'radius':
      return c.vertices[mod(op.vertex, c.vertices.length)]?.r === op.r ? ok(c, identity(c)) : edited(setCornerRadius(c, op.vertex, op.r))
    case 'chamfer': {
      // what is there already (none: [0, 0]) changes nothing: the same contour, no undo step
      const i = mod(op.vertex, c.vertices.length)
      const now = c.vertices[i] ? (chamferOf(c, i) ?? [0, 0]) : null
      return now && now[0] === op.a && now[1] === op.b ? ok(c, identity(c)) : edited(setChamfer(c, op.vertex, op.a, op.b))
    }
    case 'move':
      return op.by.x === 0 && op.by.y === 0 ? ok(c, identity(c)) : ok(translateHoles([c], op.by)[0], identity(c))
    case 'split':
      return split(c, op)
  }
}

// ---- What the adapters speak ------------------------------------------------------------------------------------------------

/** One wall of what `read` gives: what its handles need to draw it and to refuse by it (a block's walls know their module and their range). */
export interface ShapeWall {
  /** A block's edge id. */
  id?: string
  tone?: 'box' | 'inner'
  /** Which size of the block a box wall stretches (its length or its width). */
  axis?: 'length' | 'width'
  /** m a wall moves by (a block's module). */
  module?: number
  /** A box wall's range (m): what it may take and what it is now. */
  range?: { lo: number; hi: number; now: number }
  /** Module lines across it, m along its outward normal from where it stands (negative: inside): what it snaps to when it is pushed (D.2: a snap, not a rule). */
  across?: number[]
  /** m its face stands out of its reference line (what the module lines are counted from): a snap lands the reference on a line, so the face is this far past it. */
  face?: number
  /** Module lines, m along the wall from its start. */
  stops?: number[]
  /** Bay lines, m along the wall from its start. */
  bays?: number[]
  /** A wall that stays where it is (a truck court's wall side, on its wall: Phase D.3): it has no pill and no line drag, and a push of it is refused by the writer. */
  fixed?: true
  /** A wall whose length across is a number of its own (a truck court's far edge: its depth): what a typed pill reads and writes, m, and the range it is held to. */
  value?: { now: number; lo: number; hi: number }
}

/** An object's outline as its kind reads it, in the frame of the viewport that draws it. */
export interface ShapeRead {
  contour: Contour
  walls?: ShapeWall[]
  /** The lines its edits snap to (a block's module and column lines, clipped to its face), in the contour's frame: a drag lands on them within the snap's aperture, Shift free. */
  guides?: [Point, Point][]
  /** Corner i's reference corner (where the module lines meet its walls), in the contour's frame: the corner of the contour stands out of it by the faces of its walls. A corner lands on the guides by this one. */
  reference?: Point[]
  /** What this object refuses beyond its kind (a block's mass, before D.2). */
  without?: ShapeOpName[]
  /** Why, in words, for what `without` names: what a refused edit says. */
  why?: string
  /** m a wall moves by (a hole's 0.1). */
  step?: number
  /** Corners that stay on a line (a truck court's on its wall, Phase D.3): `corners` are corner indices, the line runs through `a` and `b`; a drag of one is projected on it, and the writer holds it there. */
  onLine?: { corners: number[]; a: Point; b: Point }
}

/** What `write` gives: the project after the edit, the same one (and `reason`) when it is refused. */
export interface ShapeWrite {
  project: Project
  /** m a push or a bump moved. */
  applied?: number
  reason?: string
  /** The notes of the edit (a push limited, a radius reduced). */
  notes?: string[]
  /** The block editor's frame moved by this (its box grew at a low wall). */
  shift?: Point
  /** The object an edit made (a hole copied: Alt). */
  ref?: Ref
}

/** How the kind with this adapter's id is read and written; the kind's own `shape` says what it refuses, the adapter applies its rules. */
export interface ShapeAdapter {
  read(p: Project, ref: Ref): ShapeRead | null
  write(p: Project, ref: Ref, op: ShapeOp): ShapeWrite
}
