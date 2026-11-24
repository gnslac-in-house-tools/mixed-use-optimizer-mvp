// What the rest of the app may ask of the mounted plan: its fit, from the viewport's Frame button. The plan registers
// itself here while it is mounted (only one at a time) and clears it on unmount, as the 3D does in
// `scene/sceneRef.ts`. Null: no plan on screen (the 3D view alone).
import { create } from 'zustand'

interface PlanRef {
  fit: (() => void) | null
  register(fit: (() => void) | null): void
}

export const usePlanRef = create<PlanRef>()((set) => ({
  fit: null,
  register: (fit) => set({ fit }),
}))
