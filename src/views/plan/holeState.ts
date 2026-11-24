// The holes on the plan (Phase H.3, Decision "Holes and free geometry"): which one is picked (UI state, never in the
// Project or the history), the mass a hole drawn on the plan goes into, and the commands of the keyboard.
//   pick       the selected mass's hole k, and one of its corners: Delete removes that corner, else the hole
//   holeHost   the mass a drawn outline is a hole of: the selected one if it covers 1 m² of it, else the one of the
//              active level that covers the most (Practiko's rule: at least 1 m² inside)
import { create } from 'zustand'
import { intersection } from '../../engine/geom/boolean.ts'
import { HOLE_MIN } from '../../engine/geom/holes.ts'
import { area } from '../../engine/geom/polygon.ts'
import type { Id, Polygon } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { useToast } from '../layout/toast.ts'

export interface HolePick {
  massId: Id
  k: number
  vertex: number | null
}

export const useHoles = create<{ pick: HolePick | null; setPick(p: HolePick | null): void }>()((set) => ({
  pick: null,
  setPick: (pick) => set({ pick }),
}))

// another selection (a mass, one of its corners, nothing) lets the hole go: one thing is picked at a time
useApp.subscribe((s, prev) => {
  if (s.selection !== prev.selection && useHoles.getState().pick) useHoles.getState().setPick(null)
})

/** The picked hole, if it is one of the selected mass's (a pick outlives no selection). */
export function pickedHole(): HolePick | null {
  const pick = useHoles.getState().pick
  const s = useApp.getState()
  if (!pick || s.selection.massId !== pick.massId || s.selection.massIds.length !== 1) return null
  return s.project.masses.find((m) => m.id === pick.massId)?.holes?.[pick.k] ? pick : null
}

/** The mass `outline` is a hole of, or null when it covers less than 1 m² of every mass of the active level. */
export function holeHost(outline: Polygon): Id | null {
  const { project, derived, selection, level } = useApp.getState()
  const inside = (id: Id) => {
    const d = derived.masses[id]
    return d && d.polygon.length >= 3 ? intersection([d.polygon], [outline]).reduce((s, r) => s + area(r[0]), 0) : 0
  }
  if (selection.massId && inside(selection.massId) >= HOLE_MIN) return selection.massId
  let best: { id: Id; a: number } | null = null
  for (const m of project.masses) {
    if (m.levelId !== level) continue
    const a = inside(m.id)
    if (a >= HOLE_MIN && (!best || a > best.a)) best = { id: m.id, a }
  }
  return best?.id ?? null
}

/** Delete with a hole picked: its corner if one is picked (a hole keeps 3), else the hole. False: none picked. */
export function removePickedHole(): boolean {
  const pick = pickedHole()
  if (!pick) return false
  const s = useApp.getState()
  if (pick.vertex !== null) {
    let reason: string | undefined
    s.apply((p) => {
      const r = actions.removeHoleVertex(p, pick.massId, pick.k, pick.vertex!)
      reason = r.reason
      return r.project
    })
    if (reason) useToast.getState().show('info', `That corner cannot go: ${reason}.`)
    useHoles.getState().setPick({ ...pick, vertex: null })
    return true
  }
  s.apply((p) => actions.removeHole(p, pick.massId, pick.k))
  useHoles.getState().setPick(null)
  return true
}
