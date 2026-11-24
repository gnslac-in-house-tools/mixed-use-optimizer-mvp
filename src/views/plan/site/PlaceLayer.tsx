// *Place* on the plan (Phase 5.5; port of Practiko's `vistas/mapa/ManijasMapa.tsx`): with the tool on, the map's body
// is dragged (the Earth moves under the plan) and the handle above it turns it round its centre (Shift: steps of 15°).
// What changes is the site's georeference (`placeSite`): the drawing stays where it is, and a drag is one undo step
// (preview, then commit). Escape cancels a drag in progress, and with none leaves the tool.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Point } from '../../../model/schema.ts'
import { mapOnPlan } from '../../../engine/geo/local.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import type { ToolCamera } from '../tools/common.tsx'
import { angleTo, handleDistance, TURN_STEP, turnedBy } from './place.ts'
import { useSiteTool } from './siteTools.ts'
import { letGo } from '../../tools/hand.ts'
import { beginDrag } from '../../controls/beginDrag.ts'

const HANDLE_PX = 7
const ARM_PX = 30

type Drag = { kind: 'move'; id: number; start: Point; about: Point } | { kind: 'turn'; id: number; about: Point; north: number; angle: number }

export function PlaceLayer({ camera }: { camera: ToolCamera }) {
  const tool = useSiteTool((s) => s.tool)
  const map = useApp((s) => s.project.site.map)
  const geo = useApp((s) => s.project.site.geo)
  const drag = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)
  const on = tool === 'place'

  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drag.current) {
        drag.current = null
        setDragging(false)
        useApp.getState().cancel()
      } else letGo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [on])

  if (!on || !map || !geo) return null
  const { center, rotation, width, height } = mapOnPlan(geo, map)
  const px = 1 / camera.scale
  const arm = ARM_PX * px
  const [vx, vy, vw, vh] = (camera.viewBox ?? '0 0 0 0').split(' ').map(Number)
  const view = { cx: vx + vw / 2, cy: -(vy + vh / 2), w: vw, h: vh }
  const reach = vw > 0 ? handleDistance(center, rotation, height / 2 + arm, 2 * arm, view, 2 * arm) : height / 2 + arm

  const start = (e: ReactPointerEvent<SVGElement>, kind: Drag['kind']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    beginDrag(e)
    const q = camera.toWorld(e)
    drag.current = kind === 'move' ? { kind, id: e.pointerId, start: q, about: center } : { kind, id: e.pointerId, about: center, north: geo.north, angle: angleTo(center, q) }
    setDragging(true)
  }
  const move = (e: ReactPointerEvent<SVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const q = camera.toWorld(e)
    if (d.kind === 'move') {
      const by = { x: q.x - d.start.x, y: q.y - d.start.y }
      useApp.getState().preview((p) => actions.placeSite(p, by, 0, d.about))
    } else {
      const north = turnedBy(d.north, d.angle, angleTo(d.about, q), e.shiftKey ? TURN_STEP : null)
      useApp.getState().preview((p) => actions.placeSite(p, { x: 0, y: 0 }, north - d.north, d.about))
    }
  }
  const end = (e: ReactPointerEvent<SVGElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (cancelled) useApp.getState().cancel()
    else useApp.getState().commit()
  }
  const handlers = (kind: Drag['kind']) => ({
    'data-handle': `map-${kind}`,
    onPointerDown: (e: ReactPointerEvent<SVGElement>) => start(e, kind),
    onPointerMove: move,
    onPointerUp: (e: ReactPointerEvent<SVGElement>) => end(e, false),
    onPointerCancel: (e: ReactPointerEvent<SVGElement>) => end(e, true),
  })

  // the world is drawn as (x, −y): the map's local +y is the SVG's −y
  return (
    <g data-tool="Place" transform={`translate(${center.x} ${-center.y}) rotate(${-rotation})`}>
      <rect
        {...handlers('move')}
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill="transparent"
        stroke="var(--ink)"
        strokeWidth={1}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
        style={{ cursor: dragging ? 'grabbing' : 'move', touchAction: 'none' }}
      />
      <line x1={0} y1={0} x2={0} y2={-reach} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <circle
        {...handlers('turn')}
        cx={0}
        cy={-reach}
        r={HANDLE_PX * px}
        fill="var(--panel)"
        stroke="var(--ink)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <title>Turn the map (Shift: steps of 15°)</title>
      </circle>
    </g>
  )
}
