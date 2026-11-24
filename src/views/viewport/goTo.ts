// A warning's "go to" (port of Plaza-Practiko `vistas/paneles/irA.ts`): selects its masses that are not locked and asks the
// plan and the 3D to look at the first, without changing the zoom. The plan leaves a mark that pulses for a few seconds.
import { create } from 'zustand'
import type { Point } from '../../model/schema.ts'
import { centroid } from '../../engine/geom/polygon.ts'
import type { Issue } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'
import { massHiddenOnPlan } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import { pickUnlocked } from '../layers/locks.ts'

export interface Target {
  point: Point
  /** Counts the requests: going twice to the same point centres again. */
  n: number
}

export const useGoTo = create<{ target: Target | null }>()(() => ({ target: null }))

/** The mark lasts this long; then the target is forgotten (a view mounted later does not jump to it). */
export const MARK_MS = 3500

// opening another project forgets the previous one's target
useApp.subscribe((s, before) => {
  if (s.opened !== before.opened && useGoTo.getState().target) useGoTo.setState({ target: null })
})

/** The last request each view served: an old one is not served again. */
const served: Record<'plan' | '3d', number> = { plan: 0, '3d': 0 }

/** Should this view serve request n? (once each) */
export function takeRequest(view: 'plan' | '3d', n: number): boolean {
  if (n <= served[view]) return false
  served[view] = n
  return true
}

let next = 1

/** Points the cameras at a place, with the mark for a few seconds. */
function lookAt(point: Point) {
  const n = next++
  useGoTo.setState({ target: { point, n } })
  setTimeout(() => {
    if (useGoTo.getState().target?.n === n) useGoTo.setState({ target: null })
  }, MARK_MS)
}

/**
 * Goes to the issue: selects its masses that are not locked or hidden (the first one's level) and points the cameras at the first one's centre; one
 * about no mass (a gate, a dead end), at its place. Returns whether there was somewhere to go.
 */
export function goToIssue(issue: Issue): boolean {
  const s = useApp.getState()
  const ids = issue.massIds.filter((x) => s.project.masses.some((m) => m.id === x))
  if (ids.length === 0) {
    if (!issue.at) return false
    lookAt(issue.at)
    return true
  }
  // the view goes there; a locked mass is not picked (the padlock is CAD's: a row of Layers is the way to it), nor a hidden one
  const free = pickUnlocked(ids.filter((id) => !massHiddenOnPlan(s.project, s.level, id, useLayerView.getState().hidden)))
  if (free.length > 0) s.select(free[0])
  else s.setLevel(s.project.masses.find((m) => m.id === ids[0])!.levelId)
  if (free.length > 1) s.selectMany(free)
  const polygon = s.derived.masses[ids[0]]?.polygon
  if (polygon && polygon.length >= 3) lookAt(centroid(polygon))
  return true
}
