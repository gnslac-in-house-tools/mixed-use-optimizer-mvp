// The viewport the shape handles stand in (Phase D.1 task 5, Decision "Shape engine"): `ShapeHandles` draws the outline of any object that
// takes the engine (a mass, a mass's hole, a block's footprint) and starts its drags, and everything that is the viewport's own comes in
// through a host. The site's host is here (`siteHost`: live, today's snaps); the block editor's is
// `modules/warehouse/views/blockShapeHost.ts` (task 6: a ghost).
//   `ShapeSeams` is what the drags need: how a preview is made, what snaps, what a pick does.
//   `ShapeHost` adds what the component draws with: the drag, the camera, the keys the handles carry, what is picked and what the
//   viewport asks first (`may`, `grab`, `click`). What a ghost drag would make goes to `useShapeGhost` (`shapeState.ts`).
// `mode`: `live` previews through the store and commits on release (the site); `ghost` draws the result dashed and applies it on release
// (the block editor, whose frame moves when its box grows at a low wall: `ShapeWrite.shift`, told by `Told.shift` to `shifted`). Both start the same typed drags;
// a ghost host also says how a typed value reaches the project (`commit`) and what a ghost drag does when pressed, cancelled and let go (`ghost`).
import type { PointerEvent } from 'react'
import type { Contour, Point, Project } from '../../../model/schema.ts'
import type { ShapeOpName, ShapeWall } from '../../../engine/geom/shapeOp.ts'
import type { Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { settings, step, targetsFor } from '../../plan/editing.ts'
import { useHoles } from '../../plan/holeState.ts'
import { axisLines } from '../../plan/snap/lines.ts'
import { shapeOf as moveShape, snapMove, targetsOf, tolerances, type Shape, type SnapMark } from '../../plan/snap/move.ts'
import { resolveSnap } from '../../plan/snap/resolve.ts'
import { snapWallOffset } from '../../plan/snap/handles.ts'
import { sourcesFor } from '../../plan/snap/sources.ts'
import { snapLevels } from '../../plan/reference.ts'
import type { Wall } from '../../plan/snap/walls.ts'
import type { Drag } from '../../plan/useDrag.ts'
import type { Told } from '../dimension/typed.ts'
import type { Lengths } from './labels.ts'
import { moduleMark, snapAcross, snapToGuides } from './moduleSnap.ts'
import { useCourtPick, useStretch, type CourtPick, type StretchSeam } from './shapeState.ts'

/** The parts of an outline a handle can be: its body (a hole's edge), a wall's line and pill, a corner's dot, a chamfer's ends, a stretch's face and ends. */
export type ShapePart = 'body' | 'line' | 'wall' | 'vertex' | 'chamfer-a' | 'chamfer-b' | 'face' | 'from' | 'to'

/** Where a handle's pointer snaps to, built once at the press: a wall's offset, a corner's place, a whole outline's move. */
export interface ShapeSnapper {
  /** A wall dragged by `delta`: how far it goes along its normal (`straight`: an arc edge does not line up with walls; `info`: what the object says of it, a block's wall along the grid its module lines). */
  wall(wall: Wall, delta: Point, straight: boolean, info?: ShapeWall): { d: number; mark: SnapMark | null }
  /** Corner `i` of the outline pointed at `q`. */
  point(i: number, q: Point): { point: Point; mark: SnapMark | null }
  /** The outline moved by `delta`. */
  move(delta: Point): { delta: Point; mark: SnapMark | null }
}

/** What the drags of `drags.ts` need from the viewport. */
export interface ShapeSeams {
  mode: 'live' | 'ghost'
  /** The edit of the drag so far: applied to the project the drag began in (cumulative); null keeps the last valid one. `told.shift`: the frame moved (a block's box grown at a low wall). */
  preview(f: (p: Project, told: Told) => Project | null): void
  /** What attracts while `ref`'s outline `c` is edited. */
  snap(ref: Ref, c: Contour): ShapeSnapper
  /** The object (and its corner) now picked. */
  pick(ref: Ref, vertex?: number | null): void
  /** Where the picked stretch is kept (absent: the site's `useStretch`). */
  stretch?: StretchSeam
  /** How an edit outside a drag reaches the project: a typed value, a corner removed (absent: the store's apply, one undo step; the block editor's: its door, a locked step opened and said). */
  commit?(f: (p: Project) => Project): void
  /** An edit that moved the frame (`ShapeWrite.shift`) was applied: how far what stays still went (m), for the camera. */
  shifted?(d: Point): void
  /** A ghost viewport's drag (`mode: 'ghost'`): pressed, cancelled (Escape) and let go; `release` applies what the ghost shows. */
  ghost?: { begin(): void; cancel(): void; release(): void }
}

export interface ShapeHost extends ShapeSeams {
  drag: Drag
  /** px per metre. */
  scale: number
  toWorld(ev: { clientX: number; clientY: number }): Point
  /** The `data-handle` key of a part: today's, so the tests that drive a handle by its key still do. `at`: a wall's, a corner's or a hole's number. */
  keyOf(ref: Ref, part: ShapePart, at?: number): string
  /** The corner of `ref` picked now, or null; `whole`: the object itself is the pick (a hole). */
  picked(ref: Ref): { vertex: number | null; whole: boolean }
  /** What the viewport asks before a handle may start (the block editor's locked steps, `mayReshape`); false: nothing starts. */
  may?(ref: Ref, op: ShapeOpName): boolean
  /** A press on a wall the viewport takes first (an element picked there slid along its wall); true: it took it. */
  grab?(e: PointerEvent<SVGElement>, at: Point): boolean
  /** A press on a handle released without moving (the block editor's wall: the element or the edge under it picked): `wall` the wall's number, `shift` Shift held at the press. */
  click?(ref: Ref, part: ShapePart, at: Point, wall: number | undefined, shift: boolean): void
  /** How the viewport writes a length (absent: metres): the block editor's unit (BE.8). */
  lengths?: Lengths
}

/** A truck court's ref (the block editor's `court`, a placed block's `block-court`: Phase D.3). */
export const isCourtRef = (ref: Ref): boolean => ref.kind === 'court' || ref.kind === 'block-court'

/** The `data-handle` key of a part of a truck court, in either viewport: `court-<ref id>-<part>[-<at>]`. The two hosts build the keys of the shapes; a court's are the same in both. */
export const courtKey = (ref: Ref, part: ShapePart, at?: number): string => `court-${ref.id}-${part}${at === undefined ? '' : `-${at}`}`

/** The mass and the hole's number of a hole's ref (`<massId>/<k>`), or null for another ref. */
export function holeOfRef(ref: Ref): { massId: string; k: number } | null {
  if (ref.kind !== 'mass-hole') return null
  const s = ref.id.lastIndexOf('/')
  return s > 0 ? { massId: ref.id.slice(0, s), k: Number(ref.id.slice(s + 1)) } : null
}

// ---- The site's host ----

/** What attracts to a mass's handles: everything on its level (and the reference's) but itself; a hole's: everything, its own mass too. */
function sitesFor(ref: Ref) {
  if (ref.kind === 'mass') return targetsFor(ref.id)
  // a placed block's court: what attracts is all that is drawn but its own block (its walls and its courts move with it, or are what is edited)
  if (ref.kind === 'block-court') return targetsFor(ref.id.split('/')[0])
  const { project, derived } = useApp.getState()
  return targetsOf(sourcesFor(project, derived, [], snapLevels()))
}

/** The snaps of the site's plan, as the handles had them before the engine: walls, then points, then ortho and tracking; a move by its points, walls and the grid. */
function siteSnapper(scale: number, ref: Ref, c: Contour): ShapeSnapper {
  const targets = sitesFor(ref)
  const tol = tolerances(scale)
  return {
    // a block's wall along the grid has its module lines (`withModuleLines`) and no 1 m grid: its own grid is the one it moves on
    wall: (wall, delta, straight, info) => snapWallOffset(wall, delta, straight ? targets.walls : [], info?.module !== undefined ? { ...settings(), grid: false } : settings(), tol.line, step()),
    point(i, q) {
      const n = c.vertices.length
      const v0 = c.vertices[i]
      // perpendicular starts from the previous corner; ortho from the corner's own start (it moves straight); a mass's own axes are tracking lines
      const base = c.vertices[(i + n - 1) % n]
      const tracking = ref.kind === 'mass' ? axisLines(c, i) : undefined
      return resolveSnap(q, { targets, settings: settings(), tolPoint: tol.point, tolLine: tol.line, step: step(), base, orthoFrom: v0, ...(tracking && { tracking }) })
    },
    move(delta) {
      const shape: Shape = moveShape(c)
      return snapMove(delta, shape, targets, settings(), tol, step())
    },
  }
}

/**
 * A snapper with the module lines first (Phase D.2 task 6, Decision "Block shape": the grid is a snap, not a rule): a wall along a block's grid lands on
 * a module line within the aperture, a dragged corner on a node of the lines or along one, whatever `base` says of the rest. Snap off (F3), or Shift
 * (which never asks), leaves it free. What the object says of its lines comes from its reader (`ShapeRead.guides`, each wall's `across`), read once, at the press.
 */
export function withModuleLines(ref: Ref, scale: number, base: ShapeSnapper): ShapeSnapper {
  const read = actions.shapeOf(useApp.getState().project, ref)
  const guides = read?.guides ?? []
  const tol = tolerances(scale)
  // a corner lands by its reference corner (as a wall by its reference line): the contour's corner stands out of it by this much
  const setBack = (i: number): Point => {
    const f = read?.contour.vertices[i]
    const r = read?.reference?.[i]
    return f && r ? { x: f.x - r.x, y: f.y - r.y } : { x: 0, y: 0 }
  }
  return {
    wall(wall, delta, straight, info) {
      if (info?.module !== undefined && settings().on) {
        const m = snapAcross(info, delta.x * wall.n.x + delta.y * wall.n.y, tol.line)
        if (m !== null) return { d: m, mark: moduleMark(wall, m, info.face ?? 0) }
      }
      return base.wall(wall, delta, straight, info)
    },
    point(i, q) {
      const back = setBack(i)
      const hit = guides.length > 0 && settings().on ? snapToGuides({ x: q.x - back.x, y: q.y - back.y }, guides, tol.point) : null
      // the corner stands out of the node its reference corner landed on
      const lines = hit && { point: { x: hit.point.x + back.x, y: hit.point.y + back.y }, mark: hit.mark }
      // a node of the lines is the corner's; along one line, only where nothing drawn attracts
      if (lines?.mark.kind === 'intersection') return lines
      const other = base.point(i, q)
      return lines && !other.mark ? lines : other
    },
    move: base.move,
  }
}

/** The seams of the site: its store previews and commits, its snaps, a mass picked by `select`, a hole by the holes' own pick. */
export function siteSeams(scale: number): ShapeSeams {
  return {
    mode: 'live',
    preview: (f) => useApp.getState().preview((p) => f(p, {})),
    snap: (ref, c) => withModuleLines(ref, scale, siteSnapper(scale, ref, c)),
    pick(ref, vertex = null) {
      const h = holeOfRef(ref)
      // a truck court: its corner picked (the pill and the sides leave the pick as it is); the court itself is picked by a click on it
      if (isCourtRef(ref)) {
        if (vertex !== null) useCourtPick.getState().setPick({ ref, vertex })
      } else if (h) useHoles.getState().setPick({ massId: h.massId, k: h.k, vertex })
      else {
        useStretch.getState().setStretch(null)
        useApp.getState().select(ref.id, vertex)
      }
    },
  }
}

/** The site's host: its drag and camera, its keys (`wall-i`, `line-i`, `vertex-i`, `hole-k`, `hole-k-wall-i`…), what is picked in `selection` and in the holes' pick. */
export function siteHost(drag: Drag, scale: number, toWorld: ShapeHost['toWorld'], picked: { vertex: number | null; hole: { massId: string; k: number; vertex: number | null } | null; court?: CourtPick | null }): ShapeHost {
  return {
    ...siteSeams(scale),
    drag,
    scale,
    toWorld,
    keyOf(ref, part, at) {
      if (isCourtRef(ref)) return courtKey(ref, part, at)
      const h = holeOfRef(ref)
      if (h) return part === 'body' ? `hole-${h.k}` : part === 'wall' ? `hole-${h.k}-wall-${at}` : `hole-${h.k}-vertex-${at}`
      if (part === 'chamfer-a' || part === 'chamfer-b') return `chamfer-${at}-${part === 'chamfer-a' ? 'a' : 'b'}`
      return part === 'face' || part === 'from' || part === 'to' ? `stretch-${part}` : `${part}-${at}`
    },
    picked(ref) {
      if (isCourtRef(ref)) return { vertex: picked.court && picked.court.ref.kind === ref.kind && picked.court.ref.id === ref.id ? picked.court.vertex : null, whole: false }
      const h = holeOfRef(ref)
      if (!h) return { vertex: picked.vertex, whole: false }
      const on = picked.hole?.massId === h.massId && picked.hole.k === h.k
      return { vertex: on ? picked.hole!.vertex : null, whole: on }
    },
  }
}
