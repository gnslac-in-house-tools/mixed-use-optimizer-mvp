// mixed-use-mvp: the height handle's rule (HeightHandle.tsx): a drag up or down of dz metres gives the mass a whole
// number of storeys of its level's height, one at least. Pure. `usePushPull`: what the drag shows over the viewport.
import { create } from 'zustand'

export function pushPullHeight(h0: number, dz: number, step: number): number {
  const s = step > 0 ? step : 1
  return Math.max(1, Math.round((h0 + dz) / s)) * s
}

export const usePushPull = create<{ label: string | null; set: (label: string | null) => void }>((set) => ({ label: null, set: (label) => set({ label }) }))

/** The drag's height over the viewport (top centre), while a height handle is dragged. */
export const pushPullLabel = (h: number, step: number, h0: number) =>
  `Height ${h.toFixed(1)} m · ${Math.round(h / (step || 1))} storeys${h !== h0 ? ` (${h > h0 ? '+' : '−'}${Math.round(Math.abs(h - h0) / (step || 1))})` : ''}`
