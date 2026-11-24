// Which parking lot is picked on the plan (Decision "Lot tool"): UI state, never in the Project. A plain click picks
// one thing at a time: a lot picked lets go of the masses, the roads, the gates and the dimensions, and any of them
// picked lets the lot go; so does the lot gone (an undo, its wall gone, another option). Shift+click and the selection
// window mix kinds (`views/plan/mix.ts`, Decision "Mixed selection"): `also` holds the lots picked beside the first.
// Every edit of a lot is one verb through `actions`.
import { create } from 'zustand'
import type { Id, Lot, Project } from '../../../model/schema.ts'
import type { DerivedLot } from '../engine/lots.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useDimensions } from '../../../views/plan/tools/toolState.ts'
import { LOTS } from '../../../views/layers/keys.ts'
import { showLayers } from '../../../views/layers/layerView.ts'
import { useRoads } from '../../../views/plan/circulation/roadState.ts'
import { useAccess } from '../../../views/plan/access/accessState.ts'
import { mixing } from '../../../views/plan/mixing.ts'
import type { LotFields } from '../actions.ts'

export const useLots = create<{
  picked: Id | null
  also: Id[]
  pick(id: Id | null): void
  /** Shift+click: the lot joins what is picked, or leaves it; it lets go of nothing else. */
  toggle(id: Id): void
}>()((set, get) => ({
  picked: null,
  also: [],
  pick: (picked) => {
    if (picked !== null) {
      useApp.getState().select(null)
      useDimensions.getState().select(null)
      useRoads.getState().pick(null)
      useAccess.getState().pick(null)
    }
    set({ picked, also: [] })
  },
  toggle: (id) => {
    const { picked, also } = get()
    if (picked === null) return set({ picked: id, also: [] })
    if (id === picked) return set({ picked: also[0] ?? null, also: also.slice(1) })
    set({ also: also.includes(id) ? also.filter((x) => x !== id) : [...also, id] })
  },
}))

/** Every lot picked: the one first, then those Shift+clicked beside it. */
export const pickedLotIds = (s: { picked: Id | null; also: Id[] }): Id[] => (s.picked === null ? [] : [s.picked, ...s.also])

/** The picked lot as the active option lays it out; null when none (or it is gone). */
export function pickedLot(): DerivedLot | null {
  const id = useLots.getState().picked
  return id === null ? null : (useApp.getState().derived.circulation.lots.find((l) => l.id === id) ?? null)
}

/** A lot of the active option, as the project has it. */
export const lotOf = (p: Project, option: Id, id: Id): Lot | undefined => p.options.find((o) => o.id === option)?.lots?.find((l) => l.id === id)

/** A lot changed (one undo step). */
export function changeLot(id: Id, patch: { [K in keyof LotFields]?: LotFields[K] | null }): void {
  const { apply, option } = useApp.getState()
  apply((p) => actions.setLot(p, option, id, patch))
}

/** A new lot in the active option, picked (one undo step). Whether it was made. */
export function addLotNow(fields: LotFields): boolean {
  const { apply, option } = useApp.getState()
  let made: Id | null = null
  apply((p) => {
    const r = actions.addLot(p, option, fields)
    made = r?.id ?? null
    return r?.project ?? p
  })
  if (made) {
    showLayers(LOTS) // a lot drawn is a lot seen
    useLots.getState().pick(made)
  }
  return made !== null
}

/** The picked lot taken away (Delete). Whether there was one. */
export function removePickedLot(): boolean {
  const id = useLots.getState().picked
  if (id === null || !pickedLot()) return false
  const { apply, option } = useApp.getState()
  apply((p) => actions.removeLots(p, option, [id]))
  useLots.getState().pick(null)
  return true
}

// a mass picked, or the lot gone, lets it go
useApp.subscribe((s, before) => {
  const id = useLots.getState().picked
  if (id === null) return
  const massPicked = !mixing.on && s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds
  if (massPicked || !s.derived.circulation.lots.some((l) => l.id === id)) return useLots.setState({ picked: null, also: [] })
  // a lot beside it gone leaves the others picked
  const also = useLots.getState().also
  const kept = also.filter((x) => s.derived.circulation.lots.some((l) => l.id === x))
  if (kept.length !== also.length) useLots.setState({ also: kept })
})
// another kind picked alone (a plain click) lets the lot go; Shift+click and the window mix them
useRoads.subscribe((s, before) => {
  if (mixing.on || s.picked === null || (s.picked === before.picked && s.also === before.also)) return
  if (useLots.getState().picked !== null) useLots.setState({ picked: null, also: [] })
})
useDimensions.subscribe((s, before) => {
  if (mixing.on || s.selected === null || (s.selected === before.selected && s.also === before.also)) return
  if (useLots.getState().picked !== null) useLots.setState({ picked: null, also: [] })
})
useAccess.subscribe((s, before) => {
  if (mixing.on || s.picked === null || (s.picked === before.picked && s.alsoGates === before.alsoGates)) return
  if (useLots.getState().picked !== null) useLots.setState({ picked: null, also: [] })
})
