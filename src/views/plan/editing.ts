// What each drag of Transform does on the plan: the `Start` functions that `useDrag` calls on press. Each one reads the store
// once (the project at the drag start), builds what attracts, and returns the Mover that snaps and previews.
//   mass body → moveMasses      (snap: point pair → walls → grid)       snap/move.ts  (the selection, if it holds it)
//               Alt: copyMasses, the copies move and the masses stay   Decision "Alt+drag copies"
//   rotate    → rotateMasses    (by ROTATE_STEP; a rect to whole steps of its own angle; several as one piece about
//                               the centre of their bounds)  Decision "Rotate handle"
// Shift = free. Port of the `empezar…` functions of Plaza-Practiko `vistas/planta/edicion/Manijas.tsx`. The walls and the corners are the
// shape engine's, not Transform's: their drags are `views/editing/shape/drags.ts` (Phase D.1 task 5); it takes the snap helpers below.
// Each one tells the typed dimension what it drags (`startTyped`, `moveTyped`): the number shows beside the handle, and a
// measure typed during the drag, or just after it, replaces it (views/editing/dimension/typed.ts); once typed, the pointer
// no longer moves it (`typedEnded`). What the number means: a mass: a point (`@x,y`, `d<a`, `#x,y`, `d` along the drag);
// the rotation handle: degrees.
import { massIsLocked } from '../../kinds/locked.ts'
import type { Footprint, Id, Point, Project } from '../../model/schema.ts'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { footprintContour, footprintPolygon } from '../../engine/geom/footprint.ts'
import { bounds, centroid } from '../../engine/geom/polygon.ts'
import type { Picked } from '../../model/picked.ts'
import { groupMembers } from '../../engine/groups.ts'
import { pickedBox } from '../../engine/pickedBox.ts'
import { withFollowers } from '../../engine/graph/links.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { massHiddenOnPlan } from '../buildingView.ts'
import { hiddenNow } from '../layers/layerView.ts'
import { moveTyped, resetTyped, startTyped, typedEnded, type TypedEdit, type TypedValue } from '../editing/dimension/typed.ts'
import { centreOf, moveMassesTo } from './command/editCommand.ts'
import { tellLockedPick } from '../layers/locks.ts'
import { pickOnPlan, tellOnce } from './massCommands.ts'
import { pickedNow, withoutHeld } from './mix.ts'
import { wholeDrag } from './pickedDrag.ts'
import { planStep } from './snap/grid.ts'
import { shapeOf, snapMove, targetsOf, tolerances } from './snap/move.ts'
import { useSnapSettings } from './snap/settings.ts'
import { sourcesFor } from './snap/sources.ts'
import { snapLevels } from './reference.ts'
import type { Mover, Start } from './useDrag.ts'

/** What attracts while masses `ids` are edited: everything on their level (and the reference's) but themselves. */
export function targetsFor(ids: Id | Id[]) {
  const { project, derived } = useApp.getState()
  return targetsOf(sourcesFor(project, derived, ids, snapLevels()))
}

export const settings = () => useSnapSettings.getState().settings
/** A length in the typed dimension's field: metres to the centimetre. */
export const metres = (v: number) => `${Math.round(v * 100) / 100} m`
/** The pointer's place now, where the field stands beside the handle. */
export const beside = (grabbed: Point, delta: Point): Point => ({ x: grabbed.x + delta.x, y: grabbed.y + delta.y })
/** The plan's snap step now: the modules of the grid the option stands on, else 1 m (Phase G.2b). */
export const step = () => {
  const s = useApp.getState()
  return planStep(s.project, s.option)
}

/**
 * Pressing a mass (Decision "Multi-selection"). Shift+press adds it to the selection or takes it out, and drags
 * nothing. A press on a selected mass drags the selection (the snap works from the one grabbed); released without
 * moving, a selection of several becomes that mass (with its group). Any other press selects it and drags it, with
 * its group (Decision "Groups"): a member picked alone (Alt+click) drags alone once picked.
 * Alt+drag copies what the drag would move (Decision "Alt+drag copies"); Alt+click picks that mass alone. A mass in a group that holds other kinds, or picked beside
 * other kinds, drags the whole pick (`wholeDrag`, Phase AS.5 task 6).
 * A locked mass is not pressed at all (the padlock is CAD's): nothing is picked or dragged, and the notice says where it
 * comes off (the plan's own masses do not even bind this: their press is the background's, a window or a pan).
 * `scale`: px per metre, to turn the snap apertures into metres.
 */
export function startMassDrag(id: Id, scale: number): Start {
  return (e, grabbed) => {
    const { project, selection, preview } = useApp.getState()
    const mass = project.masses.find((m) => m.id === id)
    if (mass && massIsLocked(project, mass)) {
      tellLockedPick()
      return null
    }
    if (e.shiftKey) {
      pickOnPlan(id, true, e.altKey)
      return null
    }
    if (!mass) return null
    // a group that holds other kinds, or what is picked beside other kinds: the whole pick moves (Phase AS.5 task 6); masses alone are this drag's own
    const whole = wholeDrag({ kind: 'mass', id }, () => shapeOf(footprintContour(mass.footprint)), scale, e)
    if (whole) return whole
    const held = selection.massIds.includes(id)
    // a press on a mass not picked moves its group but for the members the plan does not draw (their building's eye is off)
    const off = hiddenNow()
    const { level } = useApp.getState()
    const ids = held ? selection.massIds : groupMembers(project, id).filter((x) => !massHiddenOnPlan(project, level, x, off))
    const shape = shapeOf(footprintContour(mass.footprint))
    if (e.altKey) return copyDrag(id, ids, shape, scale)
    if (!held) pickOnPlan(id)
    // what moves with them (their attached followers, Decision "Links") is not something to snap to
    const targets = targetsFor(withFollowers(project, ids))
    const base = centreOf(project, ids) ?? { x: 0, y: 0 }
    // the number: how far it moved; typed, a distance goes along the drag, or `@x,y`, `d<a`, `#x,y` (where its centre goes)
    startTyped({
      what: 'Move',
      name: ids.length > 1 ? `${ids.length} masses` : mass.name,
      measure: 'point',
      shown: '',
      at: grabbed,
      base,
      unit: ' m',
      apply: (v) => (p) => moveMassesTo(p, ids, base, v as Point),
      mode: 'live',
      from: project,
    })
    const mover: Mover = (delta, ev) => {
      if (typedEnded()) return { ok: true, mark: null }
      const r = ev.shiftKey ? { delta, mark: null } : snapMove(delta, shape, targets, settings(), tolerances(scale), step())
      // a locked mass in the group: the store refuses the whole move and says why
      preview((p) => actions.moveMasses(p, ids, r.delta))
      moveTyped(metres(Math.hypot(r.delta.x, r.delta.y)), delta, beside(grabbed, r.delta))
      return { ok: true, mark: r.mark }
    }
    // released without moving, the mass becomes the pick: a selection of several, or a mix with other kinds (Decision
    // "Mixed selection"), narrows to that mass (with its group)
    const now = pickedNow()
    const mixed = now.nodes.length + now.lots.length + now.gates.length + now.dimensions.length + now.drawings.length > 0
    if (held && (ids.length > 1 || mixed)) mover.click = () => pickOnPlan(id)
    return mover
  }
}

/**
 * Alt+drag on a mass (Decision "Alt+drag copies"): copies of `ids` follow the pointer, snapped as a move is (the
 * masses copied attract too, to line the copies up with them), and the masses stay. Kept, the copies are the selection
 * (one undo step); released without moving, it is Alt+click: that mass alone is picked. A measure typed then moves the
 * copies, as a new edit.
 */
function copyDrag(id: Id, ids: Id[], shape: ReturnType<typeof shapeOf>, scale: number): Mover {
  const { project, preview } = useApp.getState()
  const sources = project.masses.filter((m) => ids.includes(m.id))
  const targets = targetsFor([])
  resetTyped()
  let made: Id[] = []
  const mover: Mover = (delta, ev) => {
    const r = ev.shiftKey ? { delta, mark: null } : snapMove(delta, shape, targets, settings(), tolerances(scale), step())
    preview((p) => {
      // a smart block's masses come as a copy of their block (Decision "Smart blocks")
      const c = actions.copyWithBlocks(p, sources, r.delta, useApp.getState().option)
      made = c.ids
      return c.project
    })
    return { ok: true, mark: r.mark }
  }
  mover.copy = true
  mover.click = () => pickOnPlan(id, false, true)
  mover.done = () => {
    const s = useApp.getState()
    if (made.length === 1) s.select(made[0])
    else s.selectMany(made)
  }
  return mover
}

/** °: a turn of the rotation handle goes by these steps (Decision "Rotate handle"); Shift turns it freely. */
export const ROTATE_STEP = 15

/** px: how far the rotation handle stands beyond the mass: past the wall's pill and its docks' mark (26 px out). */
export const ROTATE_GAP_PX = 56

/**
 * The rotation handle of a mass: the point it turns about (a rect's centre, a free shape's centroid), and the stem
 * from its side to the handle. A rect's handle stands beyond the side its local up faces, so it turns with it; a free
 * shape's, above it. `px`: metres per screen pixel.
 */
export function rotateHandle(f: Footprint, px: number): { pivot: Point; stem: Point; at: Point } {
  if (f.kind === 'rect') {
    const a = (f.rotation * Math.PI) / 180
    const up = { x: -Math.sin(a), y: Math.cos(a) }
    const stem = { x: f.center.x + (up.x * f.depth) / 2, y: f.center.y + (up.y * f.depth) / 2 }
    return { pivot: f.center, stem, at: { x: stem.x + up.x * ROTATE_GAP_PX * px, y: stem.y + up.y * ROTATE_GAP_PX * px } }
  }
  const poly = contourToPolygon(f.contour)
  const pivot = centroid(poly)
  const stem = { x: pivot.x, y: Math.max(...poly.map((q) => q.y)) }
  return { pivot, stem, at: { x: stem.x, y: stem.y + ROTATE_GAP_PX * px } }
}

/**
 * How far a rotation handle grabbed at `grabbed` and moved by `delta` turns a shape about `pivot` (degrees, in
 * (-180, 180]): by ROTATE_STEP to whole steps of its own angle `own` (0°, 15°, 30°…), `free` (Shift) to a tenth of a
 * degree. Null while the pointer sits on the pivot. The masses' handle and a parking lot's (Decision "Rotate handle").
 */
export function turnOf(pivot: Point, grabbed: Point, delta: Point, own: number, free: boolean): number | null {
  const q = { x: grabbed.x + delta.x, y: grabbed.y + delta.y }
  if (Math.hypot(q.x - pivot.x, q.y - pivot.y) < 1e-9) return null
  const from = Math.atan2(grabbed.y - pivot.y, grabbed.x - pivot.x)
  const raw = ((((Math.atan2(q.y - pivot.y, q.x - pivot.x) - from) * 180) / Math.PI + 540) % 360) - 180
  return free ? Math.round(raw * 10) / 10 : Math.round((own + raw) / ROTATE_STEP) * ROTATE_STEP - own
}

/** What a turn that came back null says. */
const turned = (x: Project | null, told: { why?: string }): Project | null => {
  if (!x) told.why = 'It cannot turn that far'
  return x
}

/** A rotation handle's drag starts its typed dimension: degrees, exactly (the drag goes by ROTATE_STEP, a typed angle does not). */
function startTurnTyped(name: string, grabbed: Point, apply: (v: TypedValue) => TypedEdit, from: Project): void {
  startTyped({ what: 'Rotate', name, measure: 'angle', shown: '', at: grabbed, unit: '°', help: 'the angle in degrees, counter-clockwise', apply, mode: 'live', from })
}

/**
 * The rotation handle dragged round the mass's pivot: it turns by ROTATE_STEP (a rect to whole steps of its own
 * angle: 0°, 15°, 30°…), Shift freely (to a tenth of a degree); its followers turn with it. `onTurn` gets the turn so
 * far, for the live label.
 */
export function startRotateDrag(id: Id, scale: number, onTurn: (degrees: number) => void): Start {
  return (_e, grabbed) => {
    const { project, select, preview } = useApp.getState()
    select(id)
    const mass = project.masses.find((m) => m.id === id)
    if (!mass) return null
    const { pivot } = rotateHandle(mass.footprint, 1 / scale)
    const own = mass.footprint.kind === 'rect' ? mass.footprint.rotation : 0
    onTurn(0)
    startTurnTyped(mass.name, grabbed, (v) => (p, told) => turned(actions.rotateMasses(p, [id], v as number), told), project)
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const turn = turnOf(pivot, grabbed, delta, own, e.shiftKey)
      if (turn === null) return { ok: true, mark: null }
      let ok = true
      preview((p) => {
        const x = actions.rotateMasses(p, [id], turn)
        ok = x !== null
        return x
      })
      onTurn(turn)
      moveTyped(`${turn}°`, undefined, beside(grabbed, delta))
      return { ok, mark: null }
    }
  }
}

/**
 * Several masses' rotation handle (Decision "Rotate handle"; the user: "selecting two objects should let me rotate
 * too, the dot appearing so they turn together without losing their alignment"): the frame round them, the centre of
 * their bounds they turn about (as rotateMasses turns a group) and the dot above the frame. `px`: m per screen px.
 */
export function groupHandle(project: Project, ids: Id[], px: number): { box: { minX: number; minY: number; maxX: number; maxY: number }; pivot: Point; stem: Point; at: Point } | null {
  const polys = project.masses.filter((m) => ids.includes(m.id)).map((m) => footprintPolygon(m.footprint))
  if (polys.length < 2) return null
  const box = bounds(polys.flat())
  const pivot = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const stem = { x: pivot.x, y: box.maxY }
  return { box, pivot, stem, at: { x: pivot.x, y: box.maxY + ROTATE_GAP_PX * px } }
}

/** The group's dot dragged round the centre of their bounds: they turn as one piece by ROTATE_STEP, Shift freely. */
export function startGroupRotateDrag(ids: Id[], scale: number, onTurn: (degrees: number) => void): Start {
  return (_e, grabbed) => {
    const { project, preview } = useApp.getState()
    const h = groupHandle(project, ids, 1 / scale)
    if (!h) return null
    const from = Math.atan2(grabbed.y - h.pivot.y, grabbed.x - h.pivot.x)
    onTurn(0)
    startTurnTyped(`${ids.length} masses`, grabbed, (v) => (p, told) => turned(actions.rotateMasses(p, ids, v as number), told), project)
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const q = { x: grabbed.x + delta.x, y: grabbed.y + delta.y }
      if (Math.hypot(q.x - h.pivot.x, q.y - h.pivot.y) < 1e-9) return { ok: true, mark: null }
      const raw = ((((Math.atan2(q.y - h.pivot.y, q.x - h.pivot.x) - from) * 180) / Math.PI + 540) % 360) - 180
      const turn = e.shiftKey ? Math.round(raw * 10) / 10 : Math.round(raw / ROTATE_STEP) * ROTATE_STEP
      preview((p) => actions.rotateMasses(p, ids, turn))
      onTurn(turn)
      moveTyped(`${turn}°`, undefined, q)
      return { ok: true, mark: null }
    }
  }
}

/**
 * The frame of a group that holds other kinds than masses (Phase AS.5 task 6): the box round everything picked, the centre of it the group turns about, and the dot above it, as the
 * masses' group has (`groupHandle`). Null when nothing picked has a place. `px`: m per screen px.
 */
export function pickedHandle(project: Project, option: Id, picked: Picked, px: number): { box: { minX: number; minY: number; maxX: number; maxY: number }; pivot: Point; stem: Point; at: Point } | null {
  const box = pickedBox(project, option, picked)
  if (!box) return null
  const pivot = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  return { box, pivot, stem: { x: pivot.x, y: box.maxY }, at: { x: pivot.x, y: box.maxY + ROTATE_GAP_PX * px } }
}

/**
 * The frame, the pivot and the dot of what a group's dot turns: the box round what is picked but for the nodes a locked segment holds (what Rotate leaves where it is), so the frame
 * a group shows is round what turns and its centre is the pivot of the turn. `base`: the project the frame is drawn in (the one a drag began in, while it turns).
 */
export function turnedHandle(base: Project, option: Id, px: number): ReturnType<typeof pickedHandle> {
  return pickedHandle(base, option, withoutHeld(pickedNow()), px)
}

/**
 * The dot of a group that holds other kinds, dragged round the centre of its box: everything picked turns as one piece by what Rotate turns (`actions.turnPicked`; the gates stay
 * where they are, and it says so, as Rotate does), by ROTATE_STEP, Shift freely; one undo step. `onTurn` gets the turn so far.
 */
export function startPickedRotateDrag(scale: number, onTurn: (degrees: number) => void): Start {
  return (_e, grabbed) => {
    const { project, option, preview } = useApp.getState()
    // the nodes a locked segment holds stay: what Rotate would leave (the frame is round the same)
    const picked = withoutHeld(pickedNow())
    const h = turnedHandle(project, option, 1 / scale)
    if (!h) return null
    const from = Math.atan2(grabbed.y - h.pivot.y, grabbed.x - h.pivot.x)
    onTurn(0)
    startTurnTyped(
      'Selection',
      grabbed,
      (v) => (p) => {
        const r = actions.turnPicked(p, option, picked, h.pivot, v as number)
        for (const why of r.skipped) tellOnce(why)
        return r.project
      },
      project,
    )
    return (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const q = { x: grabbed.x + delta.x, y: grabbed.y + delta.y }
      if (Math.hypot(q.x - h.pivot.x, q.y - h.pivot.y) < 1e-9) return { ok: true, mark: null }
      const raw = ((((Math.atan2(q.y - h.pivot.y, q.x - h.pivot.x) - from) * 180) / Math.PI + 540) % 360) - 180
      const turn = e.shiftKey ? Math.round(raw * 10) / 10 : Math.round(raw / ROTATE_STEP) * ROTATE_STEP
      preview((p) => {
        const r = actions.turnPicked(p, option, picked, h.pivot, turn)
        for (const why of r.skipped) tellOnce(why)
        return r.project
      })
      onTurn(turn)
      moveTyped(`${turn}°`, undefined, q)
      return { ok: true, mark: null }
    }
  }
}
