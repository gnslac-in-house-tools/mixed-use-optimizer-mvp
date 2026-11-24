// The Site step's access tools on the plan (Decision "Exterior circulation", 4.2), each a layer over the view that
// takes the presses while it is on:
//   Gate           a click on a street's side (on its paving: the side of the drawn line it lies on), on an existing street's, or near the site's boundary places a gate there (the
//                  pointer shows it first); the tool stays on
//   Existing road  its drawn line by points (DrawPolyline), the standards' road width, by the side chosen (the Street tool's: Space cycles it)
// Escape cancels what is in progress and, with nothing, leaves the tool.
import { useCallback, useMemo, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { GATE_SLOT } from '../../../engine/circulation/gates.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { EXISTING_ROADS } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { Capture, useDrawingKeys, type ToolCamera } from '../tools/common.tsx'
import { DrawPolyline } from '../tools/DrawPolyline.tsx'
import { putGate } from '../../editing/edge/gateSlide.ts'
import { gateHostAt, type GateHost } from './gateHosts.ts'
import { letGo } from '../../tools/hand.ts'
import { useAccess } from './accessState.ts'
import { useStreetSide } from '../circulation/roadState.ts'

export function AccessToolLayer({ camera }: { camera: ToolCamera }) {
  const tool = useAccess((s) => s.tool)
  const roadWidth = useApp((s) => standardsOf(s.project).roadWidth)
  const exit = useCallback(() => letGo(), [])
  const side = useStreetSide((s) => s.side)
  const sideDrawn = useMemo(() => ({ value: side, cycle: (back: boolean) => useStreetSide.getState().cycle(back) }), [side])
  const addExisting = useCallback((points: Point[], width: number) => {
    let id: string | null = null
    useApp.getState().apply((p) => {
      const r = actions.addExistingRoad(p, points, width, useStreetSide.getState().side)
      id = r?.id ?? null
      return r?.project ?? p
    })
    if (id) {
      showLayers(EXISTING_ROADS) // an existing road drawn is one seen
      useAccess.getState().pick({ kind: 'existing', id })
    }
    return id !== null
  }, [])
  if (tool === 'gate') return <PlaceGate camera={camera} />
  if (tool === 'existing') return <DrawPolyline camera={camera} tool="Existing road" width={roadWidth} onDone={addExisting} onExit={exit} side={sideDrawn} />
  return null
}

function PlaceGate({ camera }: { camera: ToolCamera }) {
  const width = useApp((s) => standardsOf(s.project).gateWidth)
  const [cursor, setCursor] = useState<Point | null>(null)
  useDrawingKeys({ enter: () => false, escape: () => letGo(), back: () => {} })
  const px = 1 / camera.scale
  // where a gate would go: the side of a street under the pointer (on its paving, the side of the drawn line it lies on), else the nearest side of a street or the boundary
  const spot = (q: Point): GateHost | null => gateHostAt(q, px)
  // the pointer shows it first: the middle of the slot the click would take
  const showAt = (hit: GateHost | null): Point | null => {
    if (!hit) return null
    const { project, option } = useApp.getState()
    const edge = actions.edgeOf(project, hit.host, option)?.edges.find((e) => e.id === hit.edge)
    const along = (hit.slot + 0.5) * GATE_SLOT
    return edge ? { x: edge.origin.x + edge.dir.x * along, y: edge.origin.y + edge.dir.y * along } : null
  }
  return (
    <g data-tool="gate">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerMove={(e) => setCursor(showAt(spot(camera.toWorld(e))))}
        onPointerUp={(e) => {
          if (e.button !== 0) return
          const hit = spot(camera.toWorld(e))
          if (hit) putGate(hit)
          else useToast.getState().show('info', 'A gate goes on a street’s side or the site’s boundary: click near one.')
        }}
        onPointerLeave={() => setCursor(null)}
      />
      {cursor && <circle cx={cursor.x} cy={-cursor.y} r={width / 2} fill="var(--road)" fillOpacity={0.6} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    </g>
  )
}
