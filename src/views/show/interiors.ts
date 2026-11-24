// mixed-use-mvp: the plan's interiors, one switch for every module: Programs shows the spaces a module lays out inside
// its masses (the residential module: each unit's rooms; later the industrial one: its plant's areas, column details),
// Furniture the furniture or equipment in them (the units' furniture; machinery, later). A view state, not the project's.
// `clipZ`: a module showing one storey's interiors in 3D sets the height (m) above which the scene is cut away
// (SectionClip in the scene), so that storey's plan reads from above; outside Schematic only, where blocks stay solid.
import { create } from 'zustand'

type Toggle = 'interiors' | 'furniture'
export const useInteriors = create<{ interiors: boolean; furniture: boolean; clipZ: number | null; toggle: (k: Toggle) => void; setClip: (z: number | null) => void }>((set) => ({
  interiors: true,
  furniture: true,
  clipZ: null,
  toggle: (k) => set((s) => ({ ...s, [k]: !s[k] })),
  setClip: (clipZ) => set({ clipZ }),
}))
