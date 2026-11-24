// What is shown of the ground (Decision "Terrain layout", Show's *Terrain ▾*, the same in every step): its contours,
// its slope, the platforms' cut and fill (Decision "Platforms"), or nothing. The plan draws it (TerrainLayer.tsx) and
// the 3D the surface. The viewer's, for the session, as Detail: no undo step, not in the file.
import { create } from 'zustand'

export type TerrainShow = 'off' | 'contours' | 'slope' | 'earthwork'

export const TERRAIN_SHOWS: { key: TerrainShow; label: string; title: string; off?: boolean }[] = [
  { key: 'off', label: 'Terrain off', title: 'The ground is not drawn: the plan and the 3D flat' },
  { key: 'contours', label: 'Contours', title: 'The contours with their heights (every fifth labelled); the 3D, the surface' },
  { key: 'slope', label: 'Slope', title: 'The ground coloured by its slope, flat to steep; the 3D, the surface' },
  { key: 'earthwork', label: 'Cut & fill', title: 'The platforms’ cut and fill, by depth; their levels on the plan; the 3D, the surface' },
]

/** The 3D's vertical exaggeration (Decision "Vertical exaggeration"): the ground's heights drawn so many times. */
export const EXAGGERATIONS = [1, 2, 3, 5] as const

export const useTerrainView = create<{ show: TerrainShow; setShow(s: TerrainShow): void; exaggeration: number; setExaggeration(k: number): void }>()((set) => ({
  show: 'contours',
  setShow: (show) => set({ show }),
  exaggeration: 1,
  setExaggeration: (exaggeration) => set({ exaggeration }),
}))
