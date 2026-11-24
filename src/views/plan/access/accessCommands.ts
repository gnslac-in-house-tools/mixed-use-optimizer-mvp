// What the Site step's access does on the plan and in its panel (Decision "Exterior circulation", 4.2), through the
// verbs in `actions`: + Gate, remove what is picked, and what a street deleted says of its gates. A gate's slide, its put by the Gate tool and its width are the On edge views' (`views/editing/edge/gateSlide.ts`,
// Phase PE.2). Gates are the active option's: its own copy when it has one, else the site's.
import type { Id, Project } from '../../../model/schema.ts'
import { gateSideMiddle, gatesOf } from '../../../engine/circulation/gates.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { GATES } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { useToast } from '../../layout/toast.ts'
import { useAccess } from './accessState.ts'

/** A gate at t on the active option's gates (the Gate tool, + Gate). Returns its id. */
export function placeGate(t: number): Id {
  const { option } = useApp.getState()
  let id = ''
  useApp.getState().apply((p) => {
    const r = actions.addGate(p, option, t)
    id = r.id
    return r.project
  })
  // a gate placed is a gate seen
  showLayers(GATES)
  useAccess.getState().pick({ kind: 'gate', id })
  return id
}

/** + Gate: one at the middle of the boundary side nearest an existing street, else of the longest side; without a boundary it says so. */
export function addGateOnSide(): Id | null {
  const { project, derived } = useApp.getState()
  const t = gateSideMiddle(derived.site.polygon, (project.site.existingRoads ?? []).map((r) => r.points))
  if (t === null) {
    useToast.getState().show('info', 'A gate goes on the site’s boundary: draw it first.')
    return null
  }
  return placeGate(t)
}

/** Delete: what is picked goes (one undo step). False when nothing is picked. */
export function removePicked(): boolean {
  const picked = useAccess.getState().picked
  if (!picked) return false
  const { option } = useApp.getState()
  useApp.getState().apply((p) =>
    picked.kind === 'gate' ? actions.removeGate(p, option, picked.id) : actions.removeExistingRoad(p, picked.id),
  )
  useAccess.getState().pick(null)
  return true
}

/** The ids of the option's gates that stand on these segments of a street (asked before the street goes: `tellGatesWent` is told after). */
export const gatesOnSegments = (p: Project, option: Id, segments: Id[]): Id[] =>
  gatesOf(p, option)
    .filter((g) => g.on?.kind === 'street' && segments.includes(g.on.id))
    .map((g) => g.id)

/** The ids of the option's gates that stand on these existing streets (asked before they go: `tellGatesWent` is told after). */
export const gatesOnRoads = (p: Project, option: Id, ids: Id[]): Id[] =>
  gatesOf(p, option)
    .filter((g) => g.on?.kind === 'existing-road' && ids.includes(g.on.id))
    .map((g) => g.id)

/** After a street or an existing street went: says so when gates of `ids` went with it (a gate stands on a street's side only while it is there). */
export function tellGatesWent(ids: Id[]): void {
  if (ids.length === 0) return
  const { project, option } = useApp.getState()
  const left = new Set(gatesOf(project, option).map((g) => g.id))
  if (ids.some((id) => !left.has(id))) useToast.getState().show('info', 'Its gates went with it')
}
