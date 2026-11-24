// What Delete does when a placed block is picked and, on its plan, one of its own parts is too (Phase D.3 review B1): a truck court, a court's corner (`useCourtPick`) or docks, doors and
// patterns (`useEdgePick`). The key takes those and never the block, as the block editor's does: a court corner goes through the shape engine, a court is the copy's own taken away, the docks
// picked are taken through the On edge engine. Both are the copy's own edits (a variant), one undo step. A refusal is said, nothing changes.
import { buildingOfLevel } from '../../engine/buildings.ts'
import type { Ref } from '../../kinds/types.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useEdgePick } from '../editing/edge/edgePick.ts'
import { takePickedElements } from '../editing/edge/takePicked.ts'
import { removeShapeCorner, useCourtPick } from '../editing/shape/shapeState.ts'
import { useToast } from '../layout/toast.ts'
import { lockedRefusal } from './massCommands.ts'

/** What stands in Delete's way of the block, if one of its own parts is picked: 'court', 'corner' or 'docks'; null: none (Delete is the block's). */
export function blockPart(): 'court' | 'corner' | 'docks' | null {
  const { massIds } = useApp.getState().selection
  const court = useCourtPick.getState().pick
  if (court && massIds.length > 0) return court.vertex !== null ? 'corner' : 'court'
  const e = useEdgePick.getState()
  return e.host && e.ids.length > 0 && massIds.includes(e.host) ? 'docks' : null
}

const say = (text: string) => useToast.getState().show('info', text)

/** The hall mass a court ref names (`<hallMassId>/<edgeId>[/<courtId>]`) and its wall. */
const courtOf = (r: Ref): { hall: string; edge: string } => {
  const [hall, edge] = r.id.split('/')
  return { hall, edge }
}

/** Delete on the block's own part picked: it goes, said when it cannot. False: no such part is picked. */
export function deleteBlockPart(): boolean {
  const part = blockPart()
  if (!part) return false
  const locked = lockedRefusal()
  if (locked) {
    say(locked)
    return true
  }
  const s = useApp.getState()
  if (part === 'docks') return takePickedElements()
  const pick = useCourtPick.getState().pick!
  if (part === 'corner') {
    removeShapeCorner(pick.ref, pick.vertex!)
    useCourtPick.getState().setPick({ ref: pick.ref, vertex: null })
    return true
  }
  // the court: the copy's own court of that wall taken away (its type's, or the standard one of a docked wall, then stands)
  const { hall } = courtOf(pick.ref)
  const mass = s.project.masses.find((m) => m.id === hall)
  const before = s.project
  const owner = mass && buildingOfLevel(s.project, mass.levelId)
  if (owner) s.apply((p) => actions.removeCourt(p, pick.ref))
  useCourtPick.getState().setPick(null)
  if (useApp.getState().project === before) say('That truck court is the wall’s own: there is nothing of the copy’s to take away.')
  return true
}
