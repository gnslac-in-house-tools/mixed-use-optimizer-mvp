// What the shape handles keep besides the project (Phase D.1 task 5, Decision "Shape engine"), UI state never in the Project or its history:
//   useStretch         the bay a double click on a block's wall picked, a stretch to pull out (a bump) or push in (a notch): its wall and the
//                      module lines it spans, m along the wall from its start. Its face and end pills show while it is picked; another pick, a
//                      new selection or an edit of the mass lets it go.
//   useShapeGhost      what a ghost drag would make (the block editor's dashed result): its own small store, so the handles draw it and the
//                      viewport's plan does not render again on every pointer move.
//   useCourtPick       the truck court picked on the site (a placed block's, Phase D.3) and its corner picked: its own small store, as the stretch is; the block editor's court is the block plan's own pick
//   removeShapeCorner  a corner taken out through the engine, for any kind (Delete on a picked corner, a double click on a dot): what the
//                      kind or the object refuses is said, never done.
//   chamferShapeCorner a corner chamfered through the engine, any kind (Shift+F on a picked corner in the block editor), one undo step
//   setShapeRadius     a corner's radius set through the engine, any kind (Properties' Corner section), one undo step
//   canTake            does this kind, and this object, take that operation? (What an object refuses is not drawn, or is refused with why.)
import { create } from 'zustand'
import type { Point, Project } from '../../../model/schema.ts'
import type { ShapeOpName, ShapeRead } from '../../../engine/geom/shapeOp.ts'
import { kindOf, type Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useToast } from '../../layout/toast.ts'
import { useEdgePick } from '../edge/edgePick.ts'
import type { ShapeSeams } from './host.ts'

/** A block's bay picked on a wall of the mass `target`: from/to are module lines, m along the wall from its start. `label`: what `data-stretch` says (the block editor's: its edge and module lines). */
export interface Stretch {
  target: Ref
  wall: number
  from: number
  to: number
  label?: string
}

/** Where a viewport keeps its picked stretch: the site's is `useStretch`, the block editor's its own pick (`useWarehouse.picked`). */
export interface StretchSeam {
  get(ref: Ref): Stretch | null
  set(ref: Ref, s: Stretch | null): void
}

/** The site's. */
export const siteStretch: StretchSeam = {
  get: () => useStretch.getState().stretch,
  set: (_ref, s) => useStretch.getState().setStretch(s),
}

export const useStretch = create<{ stretch: Stretch | null; setStretch(s: Stretch | null): void }>()((set) => ({
  stretch: null,
  setStretch: (stretch) => set({ stretch }),
}))

/** What a ghost drag would make, in the frame the handles of `ref` stand in; null: no ghost. Written by the viewport's host as the pointer moves. */
export const useShapeGhost = create<{ ghost: { ref: Ref; read: ShapeRead } | null }>()(() => ({ ghost: null }))

/** The truck court picked on the site (a placed block's `block-court`) and its corner, or none. */
export interface CourtPick {
  ref: Ref
  vertex: number | null
}
export const useCourtPick = create<{ pick: CourtPick | null; setPick(p: CourtPick | null): void }>()((set) => ({
  pick: null,
  setPick: (pick) => set({ pick }),
}))

// another selection lets the stretch go, and the court: one thing is picked at a time
useApp.subscribe((s, prev) => {
  if (s.selection !== prev.selection && useCourtPick.getState().pick) useCourtPick.getState().setPick(null)
})
// a court and docks are never picked together: the one picked last stays (review N6)
useCourtPick.subscribe((s) => {
  if (s.pick && useEdgePick.getState().ids.length > 0) useEdgePick.getState().clear()
})
useEdgePick.subscribe((s) => {
  if (s.ids.length > 0 && useCourtPick.getState().pick) useCourtPick.getState().setPick(null)
})
useApp.subscribe((s, prev) => {
  if (s.selection !== prev.selection && useStretch.getState().stretch) useStretch.getState().setStretch(null)
})

/** Does the kind take `op`, and does this object (what `read` says it refuses beyond its kind)? */
export function canTake(target: Ref, read: Pick<ShapeRead, 'without'> | null, op: ShapeOpName): boolean {
  return !kindOf(target.kind)?.shape?.without?.includes(op) && !read?.without?.includes(op)
}

/** The corner `vertex` of `target` rounded to `r` m through the engine, whatever the kind (a mass's, a block's: its copy a variant); one undo step. */
export function setShapeRadius(target: Ref, vertex: number, r: number): void {
  useApp.getState().apply((p) => actions.editShape(p, target, { op: 'radius', vertex, r }).project)
}

/** m: the set-back Shift+F gives a corner in the block editor (its ends are then dragged, or the number typed). */
export const KEY_CHAMFER = 3

/**
 * The corner `vertex` of `target` chamfered by `size` m along both walls through the engine (Shift+F in the block editor: the Chamfer tool's key
 * where there is no tool to hold); a refusal is said and nothing changes. True: it was chamfered. `seams` as `removeShapeCorner`'s.
 */
export function chamferShapeCorner(target: Ref, vertex: number, size = KEY_CHAMFER, seams?: Pick<ShapeSeams, 'commit' | 'shifted'>): boolean {
  let reason: string | undefined
  let shift: Point | undefined
  const before = useApp.getState().project
  const put = seams?.commit ?? ((f: (p: Project) => Project) => useApp.getState().apply(f))
  put((p) => {
    const w = actions.editShape(p, target, { op: 'chamfer', vertex, a: size, b: size })
    reason = w.reason
    shift = w.shift
    return w.project
  })
  if (shift) seams?.shifted?.(shift)
  if (reason) useToast.getState().show('info', /^[A-Z]/.test(reason) ? `${reason.replace(/\.$/, '')}.` : `That corner cannot be chamfered: ${reason}.`)
  return !reason && useApp.getState().project !== before
}

/**
 * The corner `vertex` of `target` taken out (its two walls join); a refusal is said and nothing changes. True: it went. The viewport's
 * `seams` say how it reaches the project (`commit`: the block editor's door, a locked step opened and told) and what its frame did
 * (`shifted`); the site's are the store's apply and none.
 */
export function removeShapeCorner(target: Ref, vertex: number, seams?: Pick<ShapeSeams, 'commit' | 'shifted'>): boolean {
  let reason: string | undefined
  let shift: Point | undefined
  const before = useApp.getState().project
  const put = seams?.commit ?? ((f: (p: Project) => Project) => useApp.getState().apply(f))
  put((p) => {
    const w = actions.editShape(p, target, { op: 'remove', vertex })
    reason = w.reason
    shift = w.shift
    return w.project
  })
  if (shift) seams?.shifted?.(shift)
  // a reason that is a sentence of its own (a block's) is said as it is; the engine's is a clause
  if (reason) useToast.getState().show('info', /^[A-Z]/.test(reason) ? `${reason.replace(/\.$/, '')}.` : `That corner cannot go: ${reason}.`)
  return !reason && useApp.getState().project !== before
}
