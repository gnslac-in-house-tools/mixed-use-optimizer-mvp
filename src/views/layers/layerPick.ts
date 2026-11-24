// What is picked in Layers that is not an object (Phase AS.3, Decision "Layers"): a branch, a kind's row (Boundary, Streets,
// Truck courts, the Annotations' rows…), a building, a level, a file of drawings that is not moved, a layer. Its rows are
// named by their id in the tree (tree.ts), a view store as each kind's: never in the project or the undo history.
// One thing is picked at a time (the master design: *One reference for anything picked*): picking a row lets every object
// go (the masses, the dimensions, the reference lines and notes, the access, the streets, the lots, the drawings, the graph's rule), and picking any
// object, wherever (the plan, the 3D, another row), lets the row go. The one exception is a building's right-click (`set(keys, true)`):
// it marks the building and leaves the masses selected, which *Assign selection to <building>* acts on. The second half is a set of subscriptions here, in one
// place, so no pick site has to know of it. Escape lets it go with the rest (`useShortcuts.ts`). Another project lets it go, and so does the deletion of
// what a row stands for (a building, a level, a gate, a lot, a file or its layer…): the subscription below prunes the pick
// against the project, wherever Layers is shown (the tab's own check only follows the option in view).
import { create } from 'zustand'
import type { Project } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { aliveIn, isObjectRow, rowsAlive } from './gone.ts'
import { useAccess } from '../plan/access/accessState.ts'
import { useAnnotations } from '../plan/annotations/annotationState.ts'
import { useRoads } from '../plan/circulation/roadState.ts'
import { useGraph } from '../graph/graphState.ts'
import { useHoles } from '../plan/holeState.ts'
import { letGoAll } from '../plan/mix.ts'
import { useDrawingPick } from '../plan/site/drawingPick.ts'
import { useDimensions } from '../plan/tools/toolState.ts'
import { useLots } from '../../modules/parking/views/lotState.ts'

interface LayerPick {
  /** The ids of the rows picked, in the order they were picked. */
  keys: string[]
  /**
   * Picks exactly these rows (an empty list lets them go); every object is let go first, unless `keepObjects`: a right-click on a
   * building marks it without touching the masses selected, which *Assign selection to <building>* acts on.
   */
  set(keys: string[], keepObjects?: boolean): void
  /** Lets the rows go. */
  clear(): void
  /** Lets go of the rows that are no longer in the tree (`ids`). */
  keep(ids: ReadonlySet<string>): void
  /** Lets go of the rows of objects that are no longer in the project (in any option). */
  forget(project: Project): void
}

/** Every object let go: the masses, dimensions, access, streets, lots and drawings (the bridge), and what it does not cover. */
function letGoObjects(): void {
  letGoAll()
  useGraph.getState().selectRule(null)
  useGraph.getState().selectRelation(null)
  if (useHoles.getState().pick) useHoles.getState().setPick(null)
}

export const useLayerPick = create<LayerPick>()((set, get) => ({
  keys: [],
  set: (keys, keepObjects = false) => {
    if (keys.length > 0 && !keepObjects) letGoObjects()
    set({ keys: [...new Set(keys)] })
  },
  clear: () => {
    if (get().keys.length > 0) set({ keys: [] })
  },
  keep: (ids) => {
    const kept = get().keys.filter((k) => ids.has(k))
    if (kept.length !== get().keys.length) set({ keys: kept })
  },
  forget: (project) => {
    const { keys } = get()
    if (!keys.some(isObjectRow)) return
    const kept = rowsAlive(keys, aliveIn(project))
    if (kept !== keys) set({ keys: kept })
  },
}))

/** Picks a row that is not an object. `add`: Ctrl, it joins the rows picked, or leaves them. */
export function pickLayer(id: string, add = false): void {
  const now = useLayerPick.getState().keys
  useLayerPick.getState().set(add ? (now.includes(id) ? now.filter((k) => k !== id) : [...now, id]) : [id])
}

const clear = () => useLayerPick.getState().clear()

// an object picked, anywhere, lets the row go
useApp.subscribe((s, before) => {
  if (s.project.id !== before.project.id) return clear()
  if (s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds) clear()
  // a row of what was deleted is let go (not during a drag's preview: the project is the drag's, not yet the viewer's)
  if (s.project !== before.project && s.dragStart === null) useLayerPick.getState().forget(s.project)
})
useDimensions.subscribe((s, before) => {
  if (s.selected !== null && (s.selected !== before.selected || s.also !== before.also)) clear()
})
useAccess.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.alsoGates !== before.alsoGates)) clear()
})
useAnnotations.subscribe((s, before) => {
  if (s.lines.length + s.notes.length > 0 && (s.lines !== before.lines || s.notes !== before.notes)) clear()
})
useRoads.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.also !== before.also || s.node !== before.node)) clear()
})
useLots.subscribe((s, before) => {
  if (s.picked !== null && (s.picked !== before.picked || s.also !== before.also)) clear()
})
useDrawingPick.subscribe((s, before) => {
  if (s.picked.length > 0 && s.picked !== before.picked) clear()
})
useHoles.subscribe((s, before) => {
  if (s.pick !== null && s.pick !== before.pick) clear()
})
useGraph.subscribe((s, before) => {
  if ((s.rule !== null && s.rule !== before.rule) || (s.relation !== null && s.relation !== before.relation)) clear()
})
