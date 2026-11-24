// What is picked of the two kinds the plan's annotations make (Phase AS.5): the project's reference lines and its notes. One store for both, view state, never in the
// Project or the history, as each kind's store is (`useDimensions`, `useLots`…). It holds the ids picked, in the order they were picked; whether a pick stands (the line is
// still there, shown, free) is the bridge's and the let-go subscriptions' (`views/plan/mix.ts`, `views/layers/letGo.ts`), which are also the only readers that ask what is picked
// across kinds: the layers read it for their own marks (`useAnnotations((s) => s.lines)`). The "one kind at a time" rule (a plain click picks one thing alone, a Shift+click and
// the window mix) is kept by the bridge too, so this file imports no other selection store.
import { create } from 'zustand'
import type { Id } from '../../../model/schema.ts'

export const useAnnotations = create<{
  /** The reference lines picked, in the order they were picked. */
  lines: Id[]
  /** The notes picked, in the order they were picked. */
  notes: Id[]
  /** Picks exactly these (a plain click: one thing alone; a list: the window's, or the bridge's `setPicked`). */
  set(lines: Id[], notes?: Id[]): void
  /** Shift+click: the line joins what is picked, or leaves it. */
  toggleLine(id: Id): void
  /** Shift+click: the note joins what is picked, or leaves it. */
  toggleNote(id: Id): void
  /** Lets go of both kinds. */
  clear(): void
}>()((set, get) => ({
  lines: [],
  notes: [],
  set: (lines, notes = []) => set({ lines, notes }),
  toggleLine: (id) => {
    const { lines } = get()
    set({ lines: lines.includes(id) ? lines.filter((x) => x !== id) : [...lines, id] })
  },
  toggleNote: (id) => {
    const { notes } = get()
    set({ notes: notes.includes(id) ? notes.filter((x) => x !== id) : [...notes, id] })
  },
  clear: () => {
    if (get().lines.length > 0 || get().notes.length > 0) set({ lines: [], notes: [] })
  },
}))
