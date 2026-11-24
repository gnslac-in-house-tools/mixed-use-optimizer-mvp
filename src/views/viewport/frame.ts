// Frame (Decision "One Frame"): the plan fits the site and the 3D frames the model, in Split both at once. The viewport's
// Frame button, View › Frame and its key all call `frameModel`; the plan and the 3D register what they can do in
// `plan/planRef.ts` and `scene/sceneRef.ts` while they are mounted.
import { usePlanRef } from '../plan/planRef.ts'
import { useSceneRef } from '../scene/sceneRef.ts'

/** `true`, or why Frame cannot act: neither the plan nor the 3D is mounted. */
export function frameRefusal(): true | string {
  return usePlanRef.getState().fit || useSceneRef.getState().frame ? true : 'Nothing to frame'
}

/** Fits the plan and frames the 3D, whichever of the two are on screen. */
export function frameModel(): void {
  usePlanRef.getState().fit?.()
  useSceneRef.getState().frame?.()
}
