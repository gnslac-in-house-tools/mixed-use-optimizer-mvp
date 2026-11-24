// The active tool's layer in the plan: Mass (Draw: it makes a block, Decision "Draw makes a block"), Corner, Chamfer, Dimension, Reference line and Note (Phase AS.5), Street (Decision "Streets layout"), Lot (Decision "Lot tool"), or the ruler while it
// is on with Select, or the Tools strip's Move, Copy and Rotate (Transform: Decision "General tools") and Mirror, Array and Align (Phase AS.5), or a block tool on
// the placed block picked (Dock, Door, Pattern, Court: Decision "Blocks on the site", GT.8). With
// Select and no ruler there is none: the masses and their handles take the presses. While the Program window is over
// the app the plan behind it has none: the block editor's plan has the Dimension and the Ruler then (BE.10), and two
// of them would both hear the keys. Another window leaves it as it is (late review of BE.10: one that is not modal
// must not hide the site's tool).
import { useCallback, useMemo } from 'react'
import type { Point } from '../../../model/schema.ts'
import { drawnStreetLines, streetFootprints, streetTypesOf } from '../../../engine/circulation/streets.ts'
import { useApp } from '../../../state/store.ts'
import { useUi } from '../../layout/ui.ts'
import { DrawReferenceLine } from '../annotations/DrawReferenceLine.tsx'
import { PlaceNote } from '../annotations/PlaceNote.tsx'
import { addStreet } from '../circulation/roadCommands.ts'
import { useStreetSide, useStreetType } from '../circulation/roadState.ts'
import { DrawDimension } from './DrawDimension.tsx'
import { DrawPolyline } from './DrawPolyline.tsx'
import { DrawMass } from './DrawMass.tsx'
import { DrawLot } from '../../../modules/parking/views/DrawLot.tsx'
import { SiteCourtPress, SiteEdgeTools } from '../../../modules/warehouse/views/SiteBlockTools.tsx'
import { useSiteBlock } from '../../../modules/warehouse/views/siteBlockState.ts'
import type { ToolCamera } from './common.tsx'
import { Chamfer } from './Chamfer.tsx'
import { Split } from './Split.tsx'
import { RoundCorner } from './RoundCorner.tsx'
import { Align } from './Align.tsx'
import { ArrayTool } from './ArrayTool.tsx'
import { Mirror } from './Mirror.tsx'
import { Transform } from './Transform.tsx'
import { Ruler } from './Ruler.tsx'
import { letGo } from '../../tools/hand.ts'
import { useRuler, useTool } from './toolState.ts'

export function ToolLayer({ camera }: { camera: ToolCamera }) {
  const tool = useTool((s) => s.tool)
  const ruler = useRuler((s) => s.active)
  const picked0 = useStreetType((s) => s.type)
  const streetWidth = useApp((s) => {
    const types = streetTypesOf(s.project, s.project.options.find((o) => o.id === s.option))
    return (types.find((t) => t.id === picked0) ?? types[0]).width
  })
  const streetRadius = useApp((s) => {
    const types = streetTypesOf(s.project, s.project.options.find((o) => o.id === s.option))
    return (types.find((t) => t.id === picked0) ?? types[0]).radius
  })
  // a street goes to the active option, of the drafting bar's type, and is picked; the tool stays on for another
  const street = useCallback((points: Point[], width: number) => addStreet(points, width), [])
  // its paving previewed by the side chosen, each segment switched where it would run over a mass, rounded as it will
  // be (Decision "Street side when drawing"): the masses the active option shows, as the derived result has them
  const side = useStreetSide((s) => s.side)
  const masses = useApp((s) => s.derived.masses)
  const buildingIds = useApp((s) => s.project.options.find((o) => o.id === s.option)?.buildingIds)
  const footprints = useMemo(() => streetFootprints(Object.values(masses), buildingIds ?? []), [masses, buildingIds])
  const paving = useCallback((points: Point[], width: number) => drawnStreetLines(points, width, streetRadius, side, footprints), [streetRadius, side, footprints])
  const cycleSide = useCallback((back: boolean) => useStreetSide.getState().cycle(back), [])
  const sideDrawn = useMemo(() => ({ value: side, cycle: cycleSide }), [side, cycleSide])
  const exit = useCallback(() => letGo(), [])
  const behind = useUi((s) => s.dialog === 'program')
  const block = useSiteBlock((s) => s.tool)
  if (behind) return null
  if (block === 'court') return <SiteCourtPress camera={camera} />
  if (block) return <SiteEdgeTools camera={camera} />
  if (tool === 'mass') return <DrawMass camera={camera} />
  if (tool === 'hole') return <DrawMass camera={camera} hole />
  if (tool === 'street') return <DrawPolyline key={streetWidth} camera={camera} tool="Street" width={streetWidth} onDone={street} onExit={exit} paving={paving} side={sideDrawn} />
  if (tool === 'lot') return <DrawLot camera={camera} />
  if (tool === 'corner') return <RoundCorner camera={camera} />
  if (tool === 'chamfer') return <Chamfer camera={camera} />
  if (tool === 'split') return <Split camera={camera} />
  if (tool === 'dimension') return <DrawDimension camera={camera} />
  if (tool === 'referenceLine') return <DrawReferenceLine camera={camera} />
  if (tool === 'note') return <PlaceNote camera={camera} />
  // one per mode: Copy after Move starts at its own base
  if (tool === 'move' || tool === 'copy' || tool === 'rotate') return <Transform key={tool} camera={camera} mode={tool} />
  if (tool === 'mirror') return <Mirror camera={camera} />
  if (tool === 'array') return <ArrayTool camera={camera} />
  if (tool === 'align') return <Align camera={camera} />
  if (ruler) return <Ruler camera={camera} />
  return null
}

/** Whether a tool owns the plan's presses (so the masses do not move under it). */
export function useToolActive(): boolean {
  const tool = useTool((s) => s.tool)
  const ruler = useRuler((s) => s.active)
  const block = useSiteBlock((s) => s.tool !== null)
  return tool !== 'select' || ruler || block
}
