// The site's own tools (Decision "Site step layout", Phase 5.5): *Draw* (the boundary, point by point),
// *Place* (the map moved and turned under a drawing), (Phase E.2b, Decision "Terrain layout") *Heights* (a contour's
// height typed) and (Phase G.2a, Decision "Grid layout") *Grid* (the structural grid moved and turned: the bottom bar's
// *Move pivot*, Decision "Grid menu"). UI state, never in the Project or the history, like the access tools
// (access/accessState.ts). The tool is the hand's: `tools/hand.ts` writes `tool` (one tool at a time, with every other
// store) and lets it go when an import starts or another project opens, the ground goes (Heights), the grid goes or the 3D
// view alone shows (Grid).
import { create } from 'zustand'

export type SiteTool = 'draw' | 'place' | 'heights' | 'grid'

export const useSiteTool = create<{ tool: SiteTool | null }>()(() => ({ tool: null }))
