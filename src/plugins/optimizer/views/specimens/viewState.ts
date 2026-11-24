// How the Specimens tab looks at a run (Decision "Specimens tab"): the scatter's two axes, what the list shows and its
// order, the ranges dragged on the parallel coordinates, the specimen picked and the one under the pointer, and what
// the viewport shows while the run goes (Decision "Following a run"). One store for the tab in its panel and wide
// under the viewport, so ⤢ keeps everything; another run starts it over (its objectives may be others), all but the
// viewport's mode, which is the designer's.
import { create } from 'zustand'
import { useRun } from '../../run/store.ts'
import type { Axis, Filters, Show, Sort } from './rows.ts'

/** The viewport while a run goes (Galapagos' display modes): every specimen as it is tried, the front's ★, or none. */
export type Follow = 'all' | 'best' | 'none'

export interface SpecimenView {
  /** The scatter's axes: null, its own (rows.ts `defaultAxes`), until the designer picks. */
  x: Axis | null
  y: Axis | null
  show: Show
  sort: Sort
  filters: Filters
  /** The specimen picked (its id): the scatter, the lines and the list mark it, the list says what it is. */
  picked: number | null
  /** The specimen under the pointer, in any of the three. */
  hover: number | null
  /** How many rows the list draws: more on demand. */
  rows: number
  follow: Follow
  /** The designer took the viewport back (Back to my design, an edit): this run is not followed any more. */
  held: boolean
  set(p: Partial<Omit<SpecimenView, 'set' | 'filter' | 'reset'>>): void
  /** A range on an objective's axis, or none. */
  filter(objective: number, range: [number, number] | null): void
  reset(): void
}

export const LIST_ROWS = 100

const START = { x: null, y: null, show: 'front', sort: 'balanced', filters: {}, picked: null, hover: null, rows: LIST_ROWS, held: false } as const

export const useSpecimenView = create<SpecimenView>()((set) => ({
  ...START,
  follow: 'best',
  set: (p) => set(p),
  filter: (objective, range) =>
    set((s) => {
      const filters = { ...s.filters }
      if (range) filters[objective] = range
      else delete filters[objective]
      return { filters, rows: LIST_ROWS }
    }),
  reset: () => set({ ...START, filters: {} }),
}))

// another run: its objectives may be others, its specimens are
useRun.subscribe((s, before) => {
  if (s.run?.id !== before.run?.id) useSpecimenView.getState().reset()
})
