// What each shape handle does when it is pressed (Phase D.1 task 5, Decision "Shape engine"): the `Start` functions that `useDrag` calls.
// Each reads the object once through `actions.shapeOf`, edits it through `actions.editShape` (one operation, whatever the kind: a mass, a
// mass's hole, a block's footprint) and tells the typed dimension what it drags, so a number typed during the drag or right after it sets
// it exactly (`views/editing/dimension/typed.ts`). The seams (`host.ts`) say how the viewport previews, snaps and picks; these defaults are the site's.
//   startPush          a wall along its normal: snapped (a block's onto its module lines when near one), square (Ctrl: free); a hole's by 0.1 m. Typed: how far, exactly.
//                      A wall with a `value` (a truck court's far edge, Phase D.3) is dragged by the half metre and typed as the value itself: its depth.
//   startCorner        a corner where the pointer says (snapped); one of `onLine` (a truck court's, on its wall) slides along its line only. Typed: a point (`@x,y`, `d<a`, `#x,y`, `d`).
//   startHoleMove      a hole by its edge, snapped as a mass moves; Alt: a copy. Typed: a point (where its middle goes).
//   startBump          a block's picked stretch by its face: a bump out, a notch in, onto a module line when near one. Typed: how deep, exactly.
//   startChamferEnd    one end of a chamfer along its wall, by 0.1 m (Shift freely). Typed: the set-back itself.
//   followStretchEnd   an end of the picked stretch where the pointer is along its wall, onto a module line when near one (no edit, so nothing to type).
import type { Contour, Point, Project } from '../../../model/schema.ts'
import { bulgeAt, chamferOf } from '../../../engine/geom/contour.ts'
import type { ShapeOp } from '../../../engine/geom/shapeOp.ts'
import type { Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { metres as metresText, beside, settings } from '../../plan/editing.ts'
import { tolerances, type SnapMark } from '../../plan/snap/move.ts'
import { wallAt } from '../../plan/snap/walls.ts'
import type { Mover, Start } from '../../plan/useDrag.ts'
import { moveTyped, resetTyped, startTyped, typedEnded, type Told, type TypedEdit, type TypedValue } from '../dimension/typed.ts'
import { holeOfRef, siteSeams, type ShapeSeams } from './host.ts'
import { canTake, siteStretch } from './shapeState.ts'

/** How a typed value reaches the project, and what to do when it moves the frame: the viewport's, else the site's (the store's apply, no frame). No `cancel`: these drags are `useDrag`'s, whose own Escape lets the ghost go (`ghost.cancel` runs in its `settle`). */
const typedWith = (seams: ShapeSeams) => ({ mode: seams.mode, commit: seams.commit, shifted: seams.shifted })

/** An engine write whose frame shift is told (the block editor's: its box grown at a low wall). The metres asked, exactly: a block's module lines are a snap of the pointer (`moduleSnap.ts`), no rule here. */
function writeShape(p: Project, ref: Ref, op: ShapeOp, told?: Told) {
  const w = actions.editShape(p, ref, op)
  if (told && w.shift) told.shift = w.shift
  return w
}

/** m: a chamfer's ends move by these steps (Shift freely). */
const CHAMFER_STEP = 0.1

/** What a drag calls what it moves: a mass by its name, a hole by its number in its mass. */
function nameOf(p: Project, ref: Ref): string {
  const h = holeOfRef(ref)
  const mass = p.masses.find((m) => m.id === (h?.massId ?? ref.id))
  return h ? `${mass?.name ?? 'Mass'} · hole ${h.k + 1}` : (mass?.name ?? 'Mass')
}

const cornersOf = (c: Contour) => c.vertices.length
const unit = (a: Point, b: Point): Point => {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return l < 1e-12 ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

// ---- A wall pushed ----

/** A wall's typed distance (how far along its normal, towards where it was dragged): exact, squared as a drag is, or free as a Ctrl drag was (`free`: asked when the value is applied; a hole's is always free). Says why when it cannot. */
export function pushEdit(ref: Ref, i: number, free: boolean | (() => boolean)): (v: TypedValue) => TypedEdit {
  return (v) => (p, told) => {
    const d = v as number
    if (Math.abs(d) < 1e-9) {
      told.why = 'The wall stays where it was'
      return null
    }
    const w = writeShape(p, ref, { op: 'push', wall: i, by: d, free: typeof free === 'function' ? free() : free }, told)
    const applied = w.applied ?? 0
    if (Math.abs(applied) < 1e-6) {
      told.why = w.notes?.[0] ?? w.reason ?? 'The wall cannot move there'
      return null
    }
    if (Math.abs(applied - d) > 1e-6) told.note = `Moved ${metresText(applied)}: as far as it fits`
    return w.project
  }
}

/**
 * A `value` wall's typed number (a truck court's depth): the value itself, as it would stand, pushed as far as that is from where it is now (`now`: what it was when the
 * drag began). The writer holds it to its range and says so (`told.note`).
 */
export function valueEdit(ref: Ref, i: number, now: number): (v: TypedValue) => TypedEdit {
  return (v) => (p, told) => {
    const typed = v as number
    if (!(typed > 0)) {
      told.why = 'A depth is a number in metres: 35'
      return null
    }
    const w = writeShape(p, ref, { op: 'push', wall: i, by: typed - now, free: false }, told)
    if (w.project === p) {
      told.why = w.reason ?? 'The depth stays as it was'
      return null
    }
    if (w.notes?.[0]) told.note = w.notes[0]
    return w.project
  }
}

/** m: a `value` wall is dragged by this step (a court's depth, by the half metre; Shift freely). */
const VALUE_STEP = 0.5

/** Wall `i` of `ref` slides along its normal. `onMoved` gets how far it really went (for the live label). */
export function startPush(ref: Ref, i: number, scale: number, onMoved: (d: number) => void, seams: ShapeSeams = siteSeams(scale)): Start {
  return (_e, grabbed) => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    if (!read) return null
    const c = read.contour
    const wall = wallAt(c, i)
    if (wall.length <= 1e-9) return null
    seams.pick(ref)
    // a hole's wall moves by `step`; any other snaps (a block's wall along its grid to the module lines first: `info`)
    const info = read.walls?.[i]
    const hole = ref.kind === 'mass-hole'
    const free = (ctrl: boolean) => hole || (ctrl && canTake(ref, read, 'push-free'))
    const snapper = read.step === undefined ? seams.snap(ref, c) : null
    // an arc edge moves along its chord's normal; it does not line up with straight walls
    const straight = bulgeAt(c, i) === 0
    onMoved(0)
    // a value typed after the drag is pushed as the drag was: free when Ctrl was held at the last move
    let ctrl = false
    // a wall that is a number of its own (a truck court's far edge): the number is the value, not the distance
    const value = info?.value
    if (value)
      startTyped({ what: 'Court depth', name: `${nameOf(project, ref)}: truck court`, measure: 'value', shown: '', at: grabbed, unit: ' m', help: `the depth in metres, ${value.lo}–${value.hi}`, apply: valueEdit(ref, i, value.now), ...typedWith(seams), from: project })
    else startTyped({ what: 'Move wall', name: `${nameOf(project, ref)} · wall ${i + 1}`, measure: 'distance', shown: '', at: grabbed, base: grabbed, way: 0, unit: ' m', apply: pushEdit(ref, i, () => free(ctrl)), ...typedWith(seams), from: project })
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      ctrl = !!(e.ctrlKey || e.metaKey)
      const raw = delta.x * wall.n.x + delta.y * wall.n.y
      let d = raw
      let mark: SnapMark | null = null
      if (value) d = e.shiftKey ? raw : Math.round((value.now + raw) / VALUE_STEP) * VALUE_STEP - value.now
      else if (read.step !== undefined) d = e.shiftKey ? raw : Math.round(raw / read.step) * read.step
      else if (!e.shiftKey && snapper) ({ d, mark } = snapper.wall(wall, delta, straight, info))
      let applied = 0
      seams.preview((p, told) => {
        if (d === 0) return p
        const w = writeShape(p, ref, { op: 'push', wall: i, by: d, free: free(ctrl) }, told)
        // the bisection leaves ~1e-9 when nothing fits: that is a rejection, not a return to the start
        applied = Math.abs(w.applied ?? 0) < 1e-6 ? 0 : (w.applied ?? 0)
        return applied === 0 ? null : w.project
      })
      // rejected (nothing applied with d ≠ 0): the view and the label stay at the last valid one
      if (d === 0 || applied !== 0) {
        onMoved(applied)
        // a value wall shows the depth it makes; any other the distance it went
        moveTyped(value ? metresText(value.now + applied) : metresText(Math.abs(applied)), value ? undefined : raw, beside(grabbed, delta))
      }
      return { ok: Math.abs(applied - d) < 1e-9, mark }
    }
  }
}

// ---- A corner moved ----

/** Corner `i` of `ref` goes where the pointer says (snapped); a rect resizes, a contour moves that corner. */
export function startCorner(ref: Ref, i: number, scale: number, seams: ShapeSeams = siteSeams(scale)): Start {
  return () => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    const v0 = read?.contour.vertices[i]
    if (!read || !v0) return null
    seams.pick(ref, i)
    const snapper = seams.snap(ref, read.contour)
    const from = { x: v0.x, y: v0.y }
    // a corner on a line (a truck court's, on its wall) slides along it: the pointer is projected on it, whatever it snaps to
    const line = read.onLine?.corners.includes(i) ? read.onLine : null
    const along = (q: Point): Point => {
      if (!line) return q
      const d = { x: line.b.x - line.a.x, y: line.b.y - line.a.y }
      const t = ((q.x - line.a.x) * d.x + (q.y - line.a.y) * d.y) / (d.x * d.x + d.y * d.y)
      return { x: line.a.x + d.x * t, y: line.a.y + d.y * t }
    }
    // the number: how far the corner went; typed, `@x,y`, `d<a`, `#x,y` or a distance along the drag, from where it was
    startTyped({
      what: 'Move corner',
      name: `${nameOf(project, ref)} · corner ${i + 1}`,
      measure: 'point',
      shown: '',
      at: from,
      base: from,
      unit: ' m',
      apply: (to) => (p, told) => {
        const w = writeShape(p, ref, { op: 'vertex', vertex: i, to: to as Point }, told)
        if (w.reason) {
          told.why = 'The corner cannot go there'
          return null
        }
        return w.project
      },
      ...typedWith(seams),
      from: project,
    })
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const q = along({ x: v0.x + delta.x, y: v0.y + delta.y })
      const r = e.shiftKey || line ? { point: q, mark: null } : snapper.point(i, q)
      let ok = true
      seams.preview((p, told) => {
        const w = writeShape(p, ref, { op: 'vertex', vertex: i, to: r.point }, told)
        ok = !w.reason
        return w.reason ? null : w.project
      })
      moveTyped(metresText(Math.hypot(r.point.x - v0.x, r.point.y - v0.y)), delta, r.point)
      return { ok, mark: r.mark }
    }
  }
}

// ---- A hole moved ----

/** The middle of a contour's box: where a typed move of a hole is measured from. */
function middleOf(c: Contour): Point {
  const xs = c.vertices.map((v) => v.x)
  const ys = c.vertices.map((v) => v.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

/** A hole dragged by its edge, snapped as a mass moves; Alt+drag copies it (the copy is the pick). */
export function startHoleMove(ref: Ref, scale: number, seams: ShapeSeams = siteSeams(scale)): Start {
  return (e, grabbed) => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    if (!read) return null
    seams.pick(ref)
    const snapper = seams.snap(ref, read.contour)
    const copy = !!e.altKey
    let made: Ref | null = null
    if (copy) resetTyped()
    else {
      // the number: how far it moved; typed, a distance goes along the drag, or `@x,y`, `d<a`, `#x,y` (where its middle goes)
      const base = middleOf(read.contour)
      startTyped({
        what: 'Move',
        name: nameOf(project, ref),
        measure: 'point',
        shown: '',
        at: grabbed,
        base,
        unit: ' m',
        apply: (to) => (p, told) => {
          const by = { x: (to as Point).x - base.x, y: (to as Point).y - base.y }
          const w = actions.editShape(p, ref, { op: 'move', by })
          if (w.reason) told.why = w.reason
          return w.reason ? null : w.project
        },
        ...typedWith(seams),
        from: project,
      })
    }
    const mover: Mover = (delta, ev) => {
      if (typedEnded()) return { ok: true, mark: null }
      const r = ev.shiftKey ? { delta, mark: null } : snapper.move(delta)
      seams.preview((p) => {
        if (!copy) return actions.editShape(p, ref, { op: 'move', by: r.delta }).project
        if (r.delta.x === 0 && r.delta.y === 0) {
          made = null
          return p
        }
        const w = actions.editShape(p, ref, { op: 'move', by: r.delta, copy: true })
        made = w.ref ?? null
        return w.project
      })
      if (!copy) moveTyped(metresText(Math.hypot(r.delta.x, r.delta.y)), delta, beside(grabbed, r.delta))
      return { ok: true, mark: r.mark }
    }
    if (copy) {
      mover.copy = true
      mover.done = () => made && seams.pick(made)
    }
    return mover
  }
}

// ---- A block's stretch ----

/** A bump's typed depth (how far out of its wall, towards where it was dragged): exact, out or in. */
function bumpEdit(ref: Ref, wall: number, from: number, to: number): (v: TypedValue) => TypedEdit {
  return (v) => (p, told) => {
    const w = writeShape(p, ref, { op: 'bump', wall, from, to, by: v as number }, told)
    if (w.reason || Math.abs(w.applied ?? 0) < 1e-6) {
      told.why = w.reason ?? 'A bump needs some depth'
      return null
    }
    if (Math.abs((w.applied ?? 0) - (v as number)) > 1e-6) told.note = `Moved ${metresText(w.applied ?? 0)}: as far as it fits`
    return w.project
  }
}

/** The picked stretch's face pulled out of its wall (a bump) or pushed into it (a notch), by the metres asked (onto a module line when one is near, Shift free): a variant of the copy. */
export function startBump(ref: Ref, wall: number, from: number, to: number, scale: number, onMoved: (d: number) => void, seams: ShapeSeams = siteSeams(scale)): Start {
  return (_e, grabbed) => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    if (!read) return null
    const w = wallAt(read.contour, wall)
    if (w.length <= 1e-9) return null
    onMoved(0)
    startTyped({ what: 'Pull stretch', name: `${nameOf(project, ref)} · wall ${wall + 1}`, measure: 'distance', shown: '', at: grabbed, base: grabbed, way: 0, unit: ' m', apply: bumpEdit(ref, wall, from, to), ...typedWith(seams), from: project })
    const info = read.walls?.[wall]
    const snapper = seams.snap(ref, read.contour)
    let applied = 0
    const mover: Mover = (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const raw = delta.x * w.n.x + delta.y * w.n.y
      let by = raw
      let mark: SnapMark | null = null
      if (!e.shiftKey) ({ d: by, mark } = snapper.wall(w, delta, true, info))
      seams.preview((p, told) => {
        const r = writeShape(p, ref, { op: 'bump', wall, from, to, by }, told)
        applied = r.reason ? 0 : (r.applied ?? 0)
        return r.project
      })
      onMoved(applied)
      moveTyped(metresText(Math.abs(applied)), raw, beside(grabbed, delta))
      return { ok: true, mark }
    }
    // a bump made: its stretch is spent
    mover.done = () => applied !== 0 && (seams.stretch ?? siteStretch).set(ref, null)
    return mover
  }
}

/** The module line of `stops` nearest `v` (m along the wall), its index. */
export function nearestStop(stops: number[], v: number): number {
  let best = 0
  stops.forEach((s, k) => {
    if (Math.abs(s - v) < Math.abs(stops[best] - v)) best = k
  })
  return best
}

/** m: the least a picked stretch is long. */
const MIN_STRETCH = 0.1

/**
 * The end of the picked stretch where the pointer is along its wall (`along`, m from the wall's start; `length` the wall's): onto a module line when one is within
 * `tol` m of it (0: free, Shift), else exactly there; inside the wall and a little way from the other end.
 */
export function stretchEnded(stops: number[], from: number, to: number, end: 'from' | 'to', along: number, length: number, tol: number): { from: number; to: number } {
  const near = stops.length > 0 && tol > 0 ? stops[nearestStop(stops, along)] : null
  const v = near !== null && Math.abs(near - along) <= tol ? near : along
  return end === 'from' ? { from: Math.max(0, Math.min(v, to - MIN_STRETCH)), to } : { from, to: Math.min(length, Math.max(v, from + MIN_STRETCH)) }
}

/** An end of the picked stretch dragged along its wall: it follows the pointer, onto the module lines within the snap's aperture (`scale`: px per metre; Shift free; no edit of the project: nothing to type). */
export function followStretchEnd(ref: Ref, wall: number, end: 'from' | 'to', seams?: ShapeSeams, scale = 0): Start {
  const keep = seams?.stretch ?? siteStretch
  return (_e, grabbed) => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    const picked = keep.get(ref)
    const stops = read?.walls?.[wall]?.stops
    if (!read || !picked || !stops) return null
    const w = wallAt(read.contour, wall)
    resetTyped()
    return (delta, e) => {
      const q = { x: grabbed.x + delta.x, y: grabbed.y + delta.y }
      const along = (q.x - w.a.x) * w.u.x + (q.y - w.a.y) * w.u.y
      const tol = scale > 0 && !e.shiftKey && settings().on ? tolerances(scale).line : 0
      const s = stretchEnded(stops, picked.from, picked.to, end, along, w.length, tol)
      keep.set(ref, { ...picked, ...s })
      return { ok: true, mark: null }
    }
  }
}

// ---- A chamfer's ends ----

/** A chamfer end's typed value: the set-back itself (m); the other end stays. */
function chamferEdit(ref: Ref, i: number, end: 'a' | 'b'): (v: TypedValue) => TypedEdit {
  return (v) => (p, told) => {
    const n = v as number
    if (!(n >= 0)) {
      told.why = 'A set-back is zero or more'
      return null
    }
    const now = actions.shapeOf(p, ref)?.contour
    const was = (now?.vertices[i] ? chamferOf(now, i) : null) ?? [0, 0]
    const w = writeShape(p, ref, { op: 'chamfer', vertex: i, a: end === 'a' ? n : was[0], b: end === 'b' ? n : was[1] }, told)
    if (w.reason) {
      told.why = w.reason
      return null
    }
    return w.project
  }
}

/** One end of the chamfer at corner `i` dragged along its own wall: that set-back changes, the other stays. Typed: the set-back. */
export function startChamferEnd(ref: Ref, i: number, end: 'a' | 'b', scale: number, seams: ShapeSeams = siteSeams(scale)): Start {
  return (_e, grabbed) => {
    const { project } = useApp.getState()
    const read = actions.shapeOf(project, ref)
    const c = read?.contour
    const was = c && chamferOf(c, i)
    if (!read || !c || !was) return null
    seams.pick(ref, i)
    const n = cornersOf(c)
    const v = c.vertices[i]
    // along the incoming wall (corner → its start) for the first end, along the outgoing one for the second
    const away = end === 'a' ? unit(v, c.vertices[(i + n - 1) % n]) : unit(v, c.vertices[(i + 1) % n])
    startTyped({ what: 'Chamfer', name: `${nameOf(project, ref)} · corner ${i + 1}`, measure: 'value', shown: '', at: grabbed, unit: ' m', help: 'the set-back along its wall, in metres', apply: chamferEdit(ref, i, end), ...typedWith(seams), from: project })
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const q = { x: grabbed.x + delta.x, y: grabbed.y + delta.y }
      const raw = Math.max(0, (q.x - v.x) * away.x + (q.y - v.y) * away.y)
      const value = e.shiftKey ? Math.round(raw * 100) / 100 : Math.round(raw / CHAMFER_STEP) * CHAMFER_STEP
      let ok = true
      seams.preview((p, told) => {
        const w = writeShape(p, ref, { op: 'chamfer', vertex: i, a: end === 'a' ? value : was[0], b: end === 'b' ? value : was[1] }, told)
        ok = !w.reason
        return w.reason ? null : w.project
      })
      moveTyped(metresText(value), undefined, beside(grabbed, delta))
      return { ok, mark: null }
    }
  }
}
