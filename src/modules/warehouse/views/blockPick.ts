// What is picked in the Blocks tab (Phase AS.4 task 6, Decision "One menu"; the user: "a block is picked with a click, and has the menu too"): the cards
// picked, by key (a project's type: its id; a library block: `block:<id>`, as a drag carries it), in the order picked, with the anchor a Shift click
// runs from (`views/controls/rangeSelect.ts`). It is a store of its own, not mixed with the site's selection (the site's `pickedRefs` is of the plan's
// things; a block is an entry of a list), and UI state: never in the Project or the history. A project's type that is gone (deleted, undone away) is
// forgotten by it. `renaming` is the card whose name is a field now (F2, the menu's Rename); `order` the cards the panel shows, which Select all
// blocks and the Shift run read.
import { create } from 'zustand'
import { useApp } from '../../../state/store.ts'
import { draggedBlock } from './blockLibrary.ts'

interface BlockPick {
  /** The keys of the cards picked, in the order picked. */
  ids: string[]
  /** The card a Shift click runs from. */
  anchor: string | null
  /** The card whose name is being edited; null: none. */
  renaming: string | null
  /** The cards the panel shows now, in its order. */
  order: string[]
  /** These and no other picked (the last the anchor, unless `anchor` says). */
  set(ids: string[], anchor?: string | null): void
  /** One in or out of what is picked (Ctrl). */
  toggle(id: string): void
  /** Lets go of everything. */
  clear(): void
  /** Forgets the cards that are not among these (a block that is gone, or no longer shown). */
  keep(ids: readonly string[]): void
  rename(id: string | null): void
  setOrder(order: string[]): void
}

export const useBlockPick = create<BlockPick>()((set, get) => ({
  ids: [],
  anchor: null,
  renaming: null,
  order: [],
  set: (ids, anchor) => set({ ids, anchor: anchor === undefined ? (ids.at(-1) ?? null) : anchor }),
  toggle: (id) => {
    const { ids } = get()
    set({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id], anchor: id })
  },
  clear: () => set({ ids: [], anchor: null }),
  keep: (keep) => {
    const { ids, anchor, renaming } = get()
    const kept = ids.filter((id) => keep.includes(id))
    if (kept.length === ids.length && (renaming === null || keep.includes(renaming))) return
    set({ ids: kept, anchor: anchor !== null && kept.includes(anchor) ? anchor : (kept.at(-1) ?? null), renaming: renaming !== null && keep.includes(renaming) ? renaming : null })
  },
  rename: (renaming) => set({ renaming }),
  setOrder: (order) => set({ order }),
}))

/** The ids of the project's types among these keys (a library block's key is not one). */
export const projectIds = (keys: readonly string[]): string[] => keys.filter((k) => draggedBlock(k) === null)

// a project's type that is gone leaves the pick as soon as the project says so (undo, delete, a project loaded), whichever view is open
let types = useApp.getState().project.warehouseTypes
useApp.subscribe((s) => {
  if (s.project.warehouseTypes === types) return
  types = s.project.warehouseTypes
  const here = new Set((types ?? []).map((t) => t.id))
  const { ids, renaming } = useBlockPick.getState()
  const gone = (k: string) => draggedBlock(k) === null && !here.has(k)
  if (ids.some(gone) || (renaming !== null && gone(renaming))) useBlockPick.getState().keep([...ids.filter((k) => !gone(k)), ...(renaming !== null && !gone(renaming) ? [renaming] : [])])
})
