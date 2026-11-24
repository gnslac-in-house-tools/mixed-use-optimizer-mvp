// What is picked on a host's edges, where the plan has no pick of its own for it (Phase D.3 task 11): the docks, doors and patterns of a placed block picked on the site (Select), UI state, never
// in the Project or the history. The block editor's are its own plan's pick (`useWarehouse.picked`). One thing is picked at a time: another selection lets them go.
import { create } from 'zustand'
import type { Id } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'

interface EdgePick {
  /** The host (the placed block's hall mass) whose elements are picked, or none. */
  host: Id | null
  ids: Id[]
  set(host: Id, ids: Id[]): void
  clear(): void
}

export const useEdgePick = create<EdgePick>()((set) => ({
  host: null,
  ids: [],
  set: (host, ids) => set({ host, ids }),
  clear: () => set({ host: null, ids: [] }),
}))

useApp.subscribe((s, prev) => {
  if (s.selection !== prev.selection && useEdgePick.getState().ids.length > 0) useEdgePick.getState().clear()
})

/**
 * The press the site's dock hit bands take, for a handle drawn over them (Phase D.3 review): a block's bay line is 16 px across and over a dock's band, so its press asks this first, with the
 * pointer; it returns true when a dock lay under it and took the press (a pick, or the begin of a slide). Set by `SiteEdgeSelect` while it is drawn.
 */
export const dockPressUnder: { current: ((e: { clientX: number; clientY: number; button: number; shiftKey: boolean }) => boolean) | null } = { current: null }
