// The viewport the path handles stand in (Phase PE.1 task 10, Decision "Path engine"): `PathHandles` draws the handles of a street or an
// existing street and starts their drags; what is the viewport's own comes in through a host: the drag, the camera, and what attracts a
// dragged node or stretch (the masses, the site, the other roads, the gates, and the path's own other nodes, so a node dropped on one joins it).
import type { Point } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/index.ts'
import { useApp } from '../../../state/store.ts'
import { snapLevels } from '../../plan/reference.ts'
import { targetsOf } from '../../plan/snap/move.ts'
import { roadSources, sourcesFor } from '../../plan/snap/sources.ts'
import type { Drag } from '../../plan/useDrag.ts'

export interface PathHost {
  drag: Drag
  /** px per metre. */
  scale: number
  toWorld(ev: { clientX: number; clientY: number }): Point
}

/** What attracts while `ref` is edited: all but the path itself; `own`: the path's other nodes, which attract a node dropped on them. */
export function pathTargets(ref: Ref, own: Point[] = []) {
  const { project, derived } = useApp.getState()
  const ids = new Set<string>([ref.id])
  // an existing street is several derived roads (a run of equal stretches each): all are the path itself
  for (const r of derived.circulation.roads) if (r.sourceId === ref.id || r.id === ref.id || r.street === ref.id) ids.add(r.id)
  const nodes = own.map((q) => ({ contour: { vertices: [{ x: q.x, y: q.y, r: 0 }] }, label: 'street node', open: true }))
  return targetsOf([...sourcesFor(project, derived, null, snapLevels()), ...roadSources(derived, ids), ...nodes])
}
