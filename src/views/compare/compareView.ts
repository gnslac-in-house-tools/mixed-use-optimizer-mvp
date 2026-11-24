// Compare options (Decision "Compare options", B.5): the options side by side, in plan or 3D, with one camera for all
// of them, and a table of their KPIs. View state, like the active option: not in the Project, the history or the file.
// Opening it lets go of the selection: nothing is edited while comparing (*Edit* on an option goes back to it).
import { create } from 'zustand'
import type { Id } from '../../model/schema.ts'
import type { View } from '../plan/camera.ts'

export type CompareMode = 'plan' | '3d'

/** The 3D camera the panes share, in three's axes; `from`: the pane that moved it (the others follow it). */
export interface SharedCamera {
  position: [number, number, number]
  target: [number, number, number]
  from: Id
}

interface CompareState {
  open: boolean
  /** The options compared (the view shows them in the project's order). */
  optionIds: Id[]
  mode: CompareMode
  /** The plan camera every pane shares; null: each one fits the content (the same, as they are the same size). */
  plan: View | null
  /** The 3D camera every pane shares; null: each one frames the model. */
  camera: SharedCamera | null
  /** Bumped to frame every 3D pane again. */
  framing: number
  start(optionIds: Id[]): void
  close(): void
  /** An option in or out of the comparison; the last one stays. */
  toggle(id: Id): void
  setMode(m: CompareMode): void
  setPlan(v: View | null): void
  setCamera(c: SharedCamera): void
  reframe(): void
}

export const useCompare = create<CompareState>()((set, get) => ({
  open: false,
  optionIds: [],
  mode: 'plan',
  plan: null,
  camera: null,
  framing: 0,
  start: (optionIds) => set({ open: true, optionIds, plan: null, camera: null }),
  close: () => set({ open: false }),
  toggle: (id) => {
    const ids = get().optionIds
    if (ids.includes(id)) {
      if (ids.length > 1) set({ optionIds: ids.filter((x) => x !== id) })
    } else set({ optionIds: [...ids, id] })
  },
  setMode: (mode) => set({ mode }),
  setPlan: (plan) => set({ plan }),
  setCamera: (camera) => set({ camera }),
  reframe: () => set({ camera: null, framing: get().framing + 1 }),
}))
