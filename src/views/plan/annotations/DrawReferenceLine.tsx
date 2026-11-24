// The Reference line tool (L; Phase AS.5, Decision "Reference lines"): a guide drawn point by point, the way the Street tool draws a centreline and the Existing road tool an
// outline (`tools/DrawPolyline.tsx`, `bare`: no width). Each click places a point through the snap (ortho and the square start from the previous one; Shift is free), the command
// line takes typed points and distances (x,y · @x,y · 12<30), Enter or a double click ends it (two points at least), Backspace (or Ctrl+Z) takes the last point back, Escape drops
// the line and, without one, leaves the tool. The line is one undo step, picked when it is made, and the tool stays on for another. A project's guide belongs to no level.
import { useCallback } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { REFERENCE_LINES } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { letGo } from '../../tools/hand.ts'
import type { ToolCamera } from '../tools/common.tsx'
import { DrawPolyline } from '../tools/DrawPolyline.tsx'
import { useAnnotations } from './annotationState.ts'

/** A reference line through these points, picked; false when it is not one (fewer than two points). A guide drawn is a guide seen: the eye of the kind opens if it was closed. */
export function addReferenceLine(points: Point[]): boolean {
  let made: string | undefined
  useApp.getState().apply((p) => {
    const r = actions.addReferenceLine(p, points)
    made = r?.id
    return r?.project ?? p
  })
  if (made === undefined) return false
  showLayers(REFERENCE_LINES)
  useAnnotations.getState().set([made])
  return true
}

export function DrawReferenceLine({ camera }: { camera: ToolCamera }) {
  const exit = useCallback(() => letGo(), [])
  return <DrawPolyline camera={camera} tool="Reference line" width={0} bare onDone={addReferenceLine} onExit={exit} />
}
