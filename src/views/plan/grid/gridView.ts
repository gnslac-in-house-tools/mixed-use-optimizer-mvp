// The grid's look (Decision "Grid in 3D"): its colour and opacity, the viewer's for the session (the last part of
// the drafting bar's *Grid ▾* menu). Whether the plan and the 3D draw it is the drafting bar's Grid chip, the snap's (Decision "Grid chip":
// `useGridShown`).
import { create } from 'zustand'
import { useSnapSettings } from '../snap/settings.ts'

/** Whether the grid is drawn: the drafting bar's Grid chip (F9), which also snaps to it. */
export const useGridShown = (): boolean => useSnapSettings((s) => s.settings.grid)

/** The grid's colours: a token each (src/styles/tokens.css). */
export const GRID_COLORS = [
  { key: 'blue', label: 'Blue', token: '--grid-line' },
  { key: 'grey', label: 'Grey', token: '--ink-tertiary' },
  { key: 'ink', label: 'Ink', token: '--ink' },
] as const

export type GridColor = (typeof GRID_COLORS)[number]['key']

/** The token of a grid colour. */
export const gridToken = (c: GridColor): string => GRID_COLORS.find((x) => x.key === c)!.token

export const useGridView = create<{
  color: GridColor
  setColor(c: GridColor): void
  /** 0.1 to 1. */
  opacity: number
  setOpacity(o: number): void
}>()((set) => ({
  color: 'blue',
  setColor: (color) => set({ color }),
  opacity: 1,
  setOpacity: (opacity) => set({ opacity: Math.min(1, Math.max(0.1, opacity)) }),
}))
