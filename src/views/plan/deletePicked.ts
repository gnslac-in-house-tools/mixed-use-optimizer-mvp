// What Delete removes, in the order of the Delete key (it was a chain in `useShortcuts.ts`; the key and Edit › Delete
// (commands/edit.ts) both call `deletePicked` now): what is picked of the street, gate, existing road, lot, reference line, note and dimension kinds (all of it, in one
// undo step; masses selected beside them keep theirs, only a dimension goes with them), a picked street's node alone, a picked hole or its corner, a
// selected corner of a mass, the selected masses (a smart block's part from its copy alone), and with only a drawing picked it says where a drawing is
// removed. `deleteRefusal` is the same list read the other way: null when something would go, else why not. What is picked comes through the bridge
// (`mix.ts`: `pickedRefs`); a locked street, lot or gate is not deleted (Phase AS.4, Decision "Padlocks by kind"): the reason is `lockedFirst`'s words, and a
// street with some segments locked is held back as a whole (its locked segment would go with it) unless a node of it is what is picked.
import { isLocked, streetLockState, roadSegments } from '../../kinds/locked.ts'
import type { Ref } from '../../kinds/types.ts'
import type { Id } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { lockedFirst } from '../layers/locks.ts'
import { removePickedRoad, streetPartPicked } from './circulation/roadCommands.ts'
import { gatesOnRoads, gatesOnSegments, tellGatesWent } from './access/accessCommands.ts'
import { DRAWING_STAYS, deleteSelection, drawingsPicked, lockedRefusal, tellDrawingsStay, tellOnce } from './massCommands.ts'
import { removePickedPathNode, pickedPathNode } from '../editing/path/pathState.ts'
import { removeShapeCorner } from '../editing/shape/shapeState.ts'
import { pickedHole, removePickedHole } from './holeState.ts'
import { blockPart, deleteBlockPart } from './blockPickDelete.ts'
import { pickedRefs } from './mix.ts'

/** The kinds this chain removes one by one, with their own ids (a street goes by its segments). */
const THINGS = ['street', 'gate', 'existing-road', 'lot', 'reference-line', 'note']

/** What is picked of the kinds that Delete removes before a mass (the dimensions' are `dimensions`). */
const picked = (): { things: Ref[]; dimensions: Ref[] } => {
  const refs = pickedRefs()
  return { things: refs.filter((r) => THINGS.includes(r.kind)), dimensions: refs.filter((r) => r.kind === 'dimension') }
}

/** Why these cannot go: a locked street, lot or gate, or a street with a locked segment (when it is picked whole). Null when they can. */
function lockedThingsRefusal(things: Ref[]): string | null {
  const { project, option } = useApp.getState()
  const whole = !streetPartPicked()
  const held = things.filter((r) => isLocked(project, r, option) || (whole && r.kind === 'street' && streetLockState(project, option, roadSegments(project, option, r.id)) !== 'unlocked'))
  if (held.length === 0) return null
  const kinds = new Set(held.map((r) => r.kind))
  // one street with only some segments locked says what holds it back
  if (held.length === 1 && held[0].kind === 'street' && !isLocked(project, held[0], option)) return 'A street with a locked segment: unlock first'
  return lockedFirst(held.length, kinds.size === 1 ? [...kinds][0] : 'things')
}

/** Removes what is picked of the street, gate, existing road, lot, reference line, note and dimension kinds in one step (a street by all its segments). */
function removeThings(things: Ref[], dimensions: Ref[]): void {
  const { option } = useApp.getState()
  const ofKind = (kind: string) => things.filter((r) => r.kind === kind).map((r) => r.id)
  // the gates standing on the streets and existing streets that go, asked before any goes: they go with them, said
  const onStreets: Id[] = []
  useApp.getState().apply((p) => {
    let q = p
    // the segments of every street picked, asked before any goes (a street's id is its first segment's)
    const segments = [...new Set(things.filter((r) => r.kind === 'street').flatMap((r) => roadSegments(p, option, r.id)))]
    onStreets.push(...gatesOnSegments(p, option, segments), ...gatesOnRoads(p, option, ofKind('existing-road')))
    for (const seg of segments) q = actions.removeStreetSegment(q, option, seg)
    for (const id of ofKind('gate')) q = actions.removeGate(q, option, id)
    for (const id of ofKind('existing-road')) q = actions.removeExistingRoad(q, id)
    if (ofKind('lot').length > 0) q = actions.removeLots(q, option, ofKind('lot'))
    for (const id of ofKind('reference-line')) q = actions.removeReferenceLine(q, id)
    for (const id of ofKind('note')) q = actions.removeNote(q, id)
    for (const d of dimensions) q = actions.removeDimension(q, d.id)
    return q
  })
  tellGatesWent(onStreets)
}

/** Delete of a road, gate, lot or dimension: it goes, and a drawing picked with it stays, said (Decision "Drawing pick"). */
function removeAnd(remove: () => unknown): void {
  // asked first: what goes may change what is picked
  const drawings = drawingsPicked()
  remove()
  if (drawings) tellOnce(DRAWING_STAYS)
}

/** Removes what Delete removes; false when nothing is picked that it can remove (then the key is the browser's). */
export function deletePicked(): boolean {
  const s = useApp.getState()
  const { massId: id, vertex, massIds: ids } = s.selection
  const { things, dimensions } = picked()
  const alone = !ids.length
  // a path's node picked: it goes, its two stretches merging (Phase PE.1)
  if (alone && removePickedPathNode()) return true
  if (alone && things.length) {
    const why = lockedThingsRefusal(things)
    if (why) tellOnce(why)
    // a street's node picked: it alone goes, as ever (the street goes on past it where it can)
    else if (streetPartPicked() && things.some((r) => r.kind === 'street')) removeAnd(removePickedRoad)
    else removeAnd(() => removeThings(things, dimensions))
  } else if (dimensions.length) removeAnd(() => removeThings([], dimensions))
  else if (removePickedHole()) {
    // a picked hole (or its corner) goes, not the mass (Phase H.3)
  } else if (deleteBlockPart()) {
    // a placed block's own court, court corner or docks picked: they go, never the block (review B1)
  } else if (id && vertex !== null) {
    // a selected corner goes, not the whole mass
    removeShapeCorner({ kind: 'mass', id }, vertex)
    s.select(id)
  } else if (ids.length) deleteSelection() // a block's part: from its copy alone (B.3); a drawing picked with it stays, said
  // a drawing picked alone is not removed here: its file's row in Layers removes it (DM.2)
  else if (drawingsPicked()) tellDrawingsStay()
  else return false
  return true
}

/** Why Delete has nothing to remove: nothing is picked. */
export const NOTHING_TO_DELETE = 'Pick something first'

/** Why Delete would remove nothing, or may not (a locked mass, street, lot or gate); null when it would remove what is picked. */
export function deleteRefusal(): string | null {
  const { massId: id, vertex, massIds: ids } = useApp.getState().selection
  const { things, dimensions } = picked()
  const alone = !ids.length
  if (alone && pickedPathNode()) return null
  if (alone && things.length) return lockedThingsRefusal(things)
  if (dimensions.length || pickedHole()) return null
  if (blockPart()) return lockedRefusal()
  if (id && vertex !== null) return null
  if (ids.length) return lockedRefusal()
  return drawingsPicked() ? null : NOTHING_TO_DELETE
}
