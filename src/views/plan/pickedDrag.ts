// A drag of what is picked as one (Phase AS.5 task 6, Decision "Groups of any kind"): a press on a member of a group, or on a thing picked beside things of other kinds, moves the
// whole pick, through the same verb Move does (`actions.movePicked`: one undo step, previewed as a drag is). Before this, a drag moved the kind pressed alone: on a mass of a mass and a
// street picked with Shift it moved the masses and left the street; on the street it picked the street alone (the mass let go) and moved it. Each layer's drag asks `wholeDrag` first, with
// the shape its own drag snaps by, and goes on with its own when it answers null (one kind alone, no group, Shift or Alt: the drags of one kind stay as they were).
import { isGroupable, refGroupMembers } from '../../engine/groups.ts'
import type { Ref } from '../../kinds/types.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { pickedRefs, pickGroup, pickRefs, withoutHeld } from './mix.ts'
import { planStep } from './snap/grid.ts'
import { snapMove, tolerances, type Shape } from './snap/move.ts'
import { useSnapSettings } from './snap/settings.ts'
import { holdNow, targetsWithout } from './tools/standingPreview.ts'
import type { Mover } from './useDrag.ts'

const sameRef = (a: Ref, b: Ref): boolean => a.kind === b.kind && a.id === b.id

/**
 * Whether a press on this picked thing drags the whole pick: what is picked holds more than one kind of thing that can be grouped, or the thing is in a group
 * (not of masses alone: their drag is the masses') that is picked whole, with others. One kind alone, no group: false, and the layer's own drag stands.
 */
function dragsWhole(ref: Ref, picked: Ref[]): boolean {
  const things = picked.filter((r) => isGroupable(r.kind))
  if (things.length < 2 || !things.some((r) => sameRef(r, ref))) return false
  if (new Set(things.map((r) => r.kind)).size > 1) return true
  if (ref.kind === 'mass') return false
  const { project, option } = useApp.getState()
  const members = refGroupMembers(project, option, ref)
  return members.length > 1 && members.every((m) => things.some((r) => sameRef(r, m)))
}

/**
 * A press on a thing that is, or is in, a pick of several: null when its layer's own drag is the answer; else the Mover that drags the whole pick. Not picked yet, the thing's
 * group is picked first (a click on a member picks the group): a group of several things is dragged whole at once. `shape`: what the thing's own drag snaps by (its points and walls,
 * as the layer draws them); Shift is free. Released without moving, the press picks the thing's group alone (or the thing), as a click on a mass of a mix does. Alt and Shift are the layers'.
 * `scale`: px per metre.
 */
export function wholeDrag(ref: Ref, shape: () => Shape | null, scale: number, e: { shiftKey: boolean; altKey: boolean }): Mover | null {
  if (e.shiftKey || e.altKey) return null
  if (pickedRefs().some((r) => sameRef(r, ref))) {
    if (!dragsWhole(ref, pickedRefs())) return null
  } else if (!pickGroup(ref)) return null
  const mine = shape()
  if (!mine) return null
  const held = holdNow()
  // the nodes a locked segment holds stay; what moves does not attract
  const picked = withoutHeld(held.picked)
  const targets = targetsWithout(held)
  const { project, option } = useApp.getState()
  const step = planStep(project, option)
  const mover: Mover = (delta, ev) => {
    const r = ev.shiftKey ? { delta, mark: null } : snapMove(delta, mine, targets, useSnapSettings.getState().settings, tolerances(scale), step)
    useApp.getState().preview((p) => actions.movePicked(p, option, picked, r.delta).project)
    return { ok: true, mark: r.mark }
  }
  mover.click = () => {
    if (!pickGroup(ref)) pickRefs([ref])
  }
  return mover
}
