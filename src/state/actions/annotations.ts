// Reference line and note actions (Phase AS.5): a guide the other tools snap to, and a text placed on a level. Pure, like the dimension
// actions they follow (`dimensions.ts`); nothing changed → the same project. A reference line is the project's (no level, every
// option); a note is on one level, as a dimension is. The padlock on either is held by `state/settle.ts` (a locked one is not changed
// or deleted, whoever asks); `lockReferenceLines` and `lockNotes` set it, as `lockLots` does.
import type { Id, Note, NoteSize, Point, Project, ReferenceLine } from '../../model/schema.ts'
import { setLocked } from '../../model/locks.ts'
import { rotate } from '../../engine/geom/footprint.ts'
import { reflectAngle, reflectPoint } from '../../engine/geom/reflect.ts'
import { levelOrGround } from '../../engine/levels.ts'
import { newId } from './masses.ts'

const finite = (q: Point) => Number.isFinite(q.x) && Number.isFinite(q.y)
const copyOf = (q: Point): Point => ({ x: q.x, y: q.y })
const plus = (q: Point, d: Point): Point => ({ x: q.x + d.x, y: q.y + d.y })
const goes = (d: Point) => finite(d) && (d.x !== 0 || d.y !== 0)
const turns = (pivot: Point, degrees: number) => Number.isFinite(degrees) && degrees !== 0 && finite(pivot)
const mirrors = (a: Point, b: Point) => finite(a) && finite(b) && (a.x !== b.x || a.y !== b.y)
/** Degrees below this are no turn at all (a note turned there and back is as it was). */
const EPS = 1e-9

// ---- reference lines ------------------------------------------------------------------------------------------

/** A new reference line through these points (two at least, all finite), ids `r1`, `r2`…; null when it is not one. Returns its id. */
export function addReferenceLine(p: Project, points: Point[]): { project: Project; id: Id } | null {
  if (points.length < 2 || !points.every(finite)) return null
  const list = p.referenceLines ?? []
  const id = newId('r', list.map((r) => r.id))
  return { project: { ...p, referenceLines: [...list, { id, points: points.map(copyOf) }] }, id }
}

export function removeReferenceLine(p: Project, id: Id): Project {
  if (!p.referenceLines?.some((r) => r.id === id)) return p
  return { ...p, referenceLines: p.referenceLines.filter((r) => r.id !== id) }
}

/** The project's reference lines with `f` applied to the named ones; the same project when `f` changes none. */
function placed(p: Project, ids: Id[], f: (r: ReferenceLine) => ReferenceLine): Project {
  const these = new Set(ids)
  if (!p.referenceLines?.some((r) => these.has(r.id))) return p
  return { ...p, referenceLines: p.referenceLines.map((r) => (these.has(r.id) ? f(r) : r)) }
}

/** Reference lines moved by d. */
export function moveReferenceLines(p: Project, ids: Id[], d: Point): Project {
  if (!goes(d)) return p
  return placed(p, ids, (r) => ({ ...r, points: r.points.map((q) => plus(q, d)) }))
}

/** Reference lines turned by `degrees` about `pivot`. */
export function turnReferenceLines(p: Project, ids: Id[], pivot: Point, degrees: number): Project {
  if (!turns(pivot, degrees)) return p
  return placed(p, ids, (r) => ({ ...r, points: r.points.map((q) => rotate(q, pivot, degrees)) }))
}

/** Reference lines seen in the mirror about the line through a and b (Decision "Mirror, Array, Align"): their points reflected. */
export function mirrorReferenceLines(p: Project, ids: Id[], a: Point, b: Point): Project {
  if (!mirrors(a, b)) return p
  return placed(p, ids, (r) => ({ ...r, points: r.points.map((q) => reflectPoint(q, a, b)) }))
}

/** One point of a line (its `index`) put at `to`: what a drag of a point does. A point that is not there, or already there: the same project. */
export function setReferenceLinePoint(p: Project, id: Id, index: number, to: Point): Project {
  if (!finite(to)) return p
  const r = p.referenceLines?.find((x) => x.id === id)
  const at = r?.points[index]
  if (!r || !at || (at.x === to.x && at.y === to.y)) return p
  return { ...p, referenceLines: p.referenceLines!.map((x) => (x.id === id ? { ...x, points: x.points.map((q, i) => (i === index ? copyOf(to) : q)) } : x)) }
}

/** Locks or frees reference lines: a locked one keeps every field and is not deleted, whoever asks (state/settle.ts). Nothing to change: the same project. */
export function lockReferenceLines(p: Project, ids: Id[], on: boolean): Project {
  const these = new Set(ids)
  const changes = (r: ReferenceLine) => these.has(r.id) && (r.locked === true) !== on
  if (!p.referenceLines?.some(changes)) return p
  return { ...p, referenceLines: p.referenceLines.map((r) => (changes(r) ? setLocked(r, on) : r)) }
}

// ---- notes ----------------------------------------------------------------------------------------------------

/**
 * A new note at `at` on a level (absent, or one that does not exist: the ground floor), reading *Note* unless given a text; ids `t1`, `t2`…
 * `look`: an angle and a size it is made with (a copy keeps them). Null when the point is not a point or the text says nothing. Returns its id.
 */
export function addNote(p: Project, at: Point, text = 'Note', levelId?: Id, look: Pick<Note, 'angle' | 'size'> = {}): { project: Project; id: Id } | null {
  if (!finite(at) || text.trim() === '') return null
  const list = p.notes ?? []
  const id = newId('t', list.map((n) => n.id))
  const note: Note = {
    id,
    levelId: levelOrGround(p, levelId),
    at: copyOf(at),
    text,
    ...(look.angle !== undefined && Number.isFinite(look.angle) ? { angle: look.angle } : {}),
    ...(look.size !== undefined ? { size: look.size } : {}),
  }
  return { project: { ...p, notes: [...list, note] }, id }
}

export function removeNote(p: Project, id: Id): Project {
  if (!p.notes?.some((n) => n.id === id)) return p
  return { ...p, notes: p.notes.filter((n) => n.id !== id) }
}

/** The project's notes with `f` applied to the named ones; the same project when none is named. */
function notesPlaced(p: Project, ids: Id[], f: (n: Note) => Note): Project {
  const these = new Set(ids)
  if (!p.notes?.some((n) => these.has(n.id))) return p
  return { ...p, notes: p.notes.map((n) => (these.has(n.id) ? f(n) : n)) }
}

/** Notes moved by d. */
export function moveNotes(p: Project, ids: Id[], d: Point): Project {
  if (!goes(d)) return p
  return notesPlaced(p, ids, (n) => ({ ...n, at: plus(n.at, d) }))
}

/** `angle` degrees in 0 … 360; an angle that is none (0, or a full turn) is the same as no `angle` at all. */
function angleOf(angle: number): number | undefined {
  const a = ((angle % 360) + 360) % 360
  return a < EPS || 360 - a < EPS ? undefined : a
}

/** Notes turned by `degrees` about `pivot`: the point goes round, and the text's angle follows. */
export function turnNotes(p: Project, ids: Id[], pivot: Point, degrees: number): Project {
  if (!turns(pivot, degrees)) return p
  return notesPlaced(p, ids, (n) => {
    const { angle: was, ...rest } = n
    const angle = angleOf((was ?? 0) + degrees)
    return { ...rest, at: rotate(n.at, pivot, degrees), ...(angle !== undefined ? { angle } : {}) }
  })
}

/** Notes seen in the mirror about the line through a and b: the point reflected, the text's angle 2α − angle, in 0 … 360 (none when it comes to none). */
export function mirrorNotes(p: Project, ids: Id[], a: Point, b: Point): Project {
  if (!mirrors(a, b)) return p
  return notesPlaced(p, ids, (n) => {
    const { angle: was, ...rest } = n
    const angle = angleOf(reflectAngle(was ?? 0, a, b))
    return { ...rest, at: reflectPoint(n.at, a, b), ...(angle !== undefined ? { angle } : {}) }
  })
}

/** What a note says. A text of blank space, or the same one, changes nothing (a note is deleted, not blanked). */
export function setNoteText(p: Project, id: Id, text: string): Project {
  if (text.trim() === '') return p
  const n = p.notes?.find((x) => x.id === id)
  if (!n || n.text === text) return p
  return notesPlaced(p, [id], (x) => ({ ...x, text }))
}

/** A note's size: `small` or `large`; absent, the middle one (the plan's labels'). */
export function setNoteSize(p: Project, id: Id, size?: NoteSize): Project {
  const n = p.notes?.find((x) => x.id === id)
  if (!n || n.size === size) return p
  return notesPlaced(p, [id], (x) => {
    const { size: _, ...rest } = x
    return size === undefined ? rest : { ...rest, size }
  })
}

/** Locks or frees notes: a locked one keeps every field and is not deleted, whoever asks (state/settle.ts). Nothing to change: the same project. */
export function lockNotes(p: Project, ids: Id[], on: boolean): Project {
  const these = new Set(ids)
  const changes = (n: Note) => these.has(n.id) && (n.locked === true) !== on
  if (!p.notes?.some(changes)) return p
  return { ...p, notes: p.notes.map((n) => (changes(n) ? setLocked(n, on) : n)) }
}
