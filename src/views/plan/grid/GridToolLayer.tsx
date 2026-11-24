// The Grid tool on the plan (Phase G.2a, Decision "Grid layout"; turned on by *Move pivot* in the bottom bar's Grid menu,
// GridMenu.tsx, Decision "Grid menu"), as *Place* is for the map (PlaceLayer.tsx):
// the grid's origin (where lines A and 1 meet) as a handle to drag, which moves the grid, and a handle along its x axis
// that turns it round the origin. Both snap as a drawn point does (the user: "both points snap, to line them up where I
// want: the snap's kinds, Align, Grid, Ortho…"): to the masses, the site and the setback, Ortho from the origin; the
// grid's nodes are the grid's as the drag began. Shift: free (the turn in steps of 15°). A double-click or the
// right-click's *Restore original* (the menu's button too) puts it back along the site's main axis, from the buildable area's corner (its bays
// and modules kept). The right-click opens the grid's menu, the one right-click menu of the app (editing/menu/kinds/grid.ts: Restore original, Hide, Properties). It changes the grid the active option stands on (its own, else the project's: `updateGrid`); a
// drag is one undo step (preview, then commit). Escape cancels a drag in progress, and with none leaves the tool.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Point } from '../../../model/schema.ts'
import { axesOf, fitGrid, gridOf } from '../../../engine/grid/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { openMenu } from '../../editing/menu/open.tsx'
import type { ToolCamera } from '../tools/common.tsx'
import { angleTo, TURN_STEP, turnedBy } from '../site/place.ts'
import { useSiteTool } from '../site/siteTools.ts'
import { letGo } from '../../tools/hand.ts'
import { snapLevels } from '../reference.ts'
import { planStep, type Step } from '../snap/grid.ts'
import { targetsOf, tolerances, type SnapMark as Mark, type Targets } from '../snap/move.ts'
import { resolveSnap } from '../snap/resolve.ts'
import { useSnapSettings } from '../snap/settings.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { sourcesFor } from '../snap/sources.ts'
import { beginDrag } from '../../controls/beginDrag.ts'

const HANDLE_PX = 7
const ARM_PX = 60

/** A drag of a handle, with what snaps it: what attracts and the grid's step, as the drag began. */
type Drag = ({ kind: 'move'; start: Point; origin: Point } | { kind: 'turn'; origin: Point; angle: number; pointer: number }) & { id: number; targets: Targets; step: Step }

/** The grid the active option stands on, back along the site's main axis and from its corner (bays and modules kept). */
export function restoreGrid() {
  const { option } = useApp.getState()
  useApp.getState().apply((p) => {
    const g = gridOf(p, option)
    if (!g) return p
    const f = fitGrid(p, g)
    return actions.updateGrid(p, option, { angle: f.angle, origin: f.origin })
  })
}

const round = (v: number, step: number) => Math.round(v / step) * step

export function GridToolLayer({ camera }: { camera: ToolCamera }) {
  const tool = useSiteTool((s) => s.tool)
  const g = useApp((s) => gridOf(s.project, s.option))
  const option = useApp((s) => s.option)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  const [mark, setMark] = useState<Mark | null>(null)
  const on = tool === 'grid'

  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drag.current) {
        drag.current = null
        setDragging(false)
        setMark(null)
        useApp.getState().cancel()
      } else letGo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [on])

  if (!on || !g) return null
  const px = 1 / camera.scale
  const { u } = axesOf(g)
  const reach = Math.max(ARM_PX * px, Math.min(g.x, 3 * ARM_PX * px))
  const handle = { x: g.origin.x + u.x * reach, y: g.origin.y + u.y * reach }

  const start = (e: ReactPointerEvent<SVGElement>, kind: Drag['kind']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    beginDrag(e)
    const q = camera.toWorld(e)
    // what attracts, as the plan shows it now; the grid's nodes are the grid's as it stands before the drag
    const { project, derived } = useApp.getState()
    const snap = { id: e.pointerId, targets: targetsOf(sourcesFor(project, derived, null, snapLevels())), step: planStep(project, option) }
    drag.current = kind === 'move' ? { kind, start: q, origin: g.origin, ...snap } : { kind, origin: g.origin, angle: g.angle, pointer: angleTo(g.origin, q), ...snap }
    setDragging(true)
  }
  const snapped = (d: Drag, q: Point) => {
    const tol = tolerances(camera.scale)
    return resolveSnap(q, { targets: d.targets, settings: useSnapSettings.getState().settings, tolPoint: tol.point, tolLine: tol.line, step: d.step, base: d.origin, orthoFrom: d.origin })
  }
  const move = (e: ReactPointerEvent<SVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const q = camera.toWorld(e)
    if (d.kind === 'move') {
      const raw = { x: d.origin.x + q.x - d.start.x, y: d.origin.y + q.y - d.start.y }
      const r = e.shiftKey ? { point: raw, mark: null } : snapped(d, raw)
      setMark(r.mark)
      // to the centimetre: what the Grid menu shows
      const origin = { x: round(r.point.x, 0.01), y: round(r.point.y, 0.01) }
      useApp.getState().preview((p) => actions.updateGrid(p, option, { origin }))
    } else {
      // the handle snaps and the axis goes through it; Shift: free, in steps of 15°
      const r = e.shiftKey ? { point: q, mark: null } : snapped(d, q)
      setMark(r.mark)
      const angle = e.shiftKey ? turnedBy(d.angle, d.pointer, angleTo(d.origin, q), TURN_STEP) : angleTo(d.origin, r.point)
      // within (−180°, 180°], to the tenth of a degree
      useApp.getState().preview((p) => actions.updateGrid(p, option, { angle: round(angle, 0.1) }))
    }
  }
  const end = (e: ReactPointerEvent<SVGElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    setMark(null)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (cancelled) useApp.getState().cancel()
    else useApp.getState().commit()
  }
  const handlers = (kind: Drag['kind']) => ({
    'data-handle': `grid-${kind}`,
    onPointerDown: (e: ReactPointerEvent<SVGElement>) => start(e, kind),
    onPointerMove: move,
    onPointerUp: (e: ReactPointerEvent<SVGElement>) => end(e, false),
    onPointerCancel: (e: ReactPointerEvent<SVGElement>) => end(e, true),
    onDoubleClick: (e: ReactMouseEvent<SVGElement>) => {
      e.stopPropagation()
      restoreGrid()
    },
    onContextMenu: (e: ReactMouseEvent<SVGElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // the grid is not picked on the plan: its menu is of the grid itself
      openMenu(e, [{ kind: 'grid', id: 'grid' }], 'plan')
    },
  })

  return (
    <g data-tool="Grid">
      <SnapMark mark={mark} px={px} />
      <line x1={g.origin.x} y1={-g.origin.y} x2={handle.x} y2={-handle.y} stroke="var(--grid-line)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <circle
        {...handlers('move')}
        cx={g.origin.x}
        cy={-g.origin.y}
        r={HANDLE_PX * 1.4 * px}
        fill="var(--grid-line)"
        stroke="var(--panel)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: dragging ? 'grabbing' : 'move', touchAction: 'none' }}
      >
        <title>Move the grid: lines A and 1 meet here (it snaps; Shift: free). Double-click or right-click: restore original</title>
      </circle>
      <circle
        {...handlers('turn')}
        cx={handle.x}
        cy={-handle.y}
        r={HANDLE_PX * px}
        fill="var(--panel)"
        stroke="var(--grid-line)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <title>Turn the grid round its origin (it snaps; Shift: steps of 15°). Double-click or right-click: restore original</title>
      </circle>
    </g>
  )
}
