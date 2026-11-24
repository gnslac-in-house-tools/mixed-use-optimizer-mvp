// Rename of a building or a level (Phase AS.4 task 5, Decision "One menu"): their name is edited in the row of Layers, where a double-click already
// edits a building's, so F2, Edit › Rename and the right-click menu's Rename ask for that field instead of Properties' (`editing/refOps.ts` `renameRef`):
// `askRowRename` shows Layers and leaves the row's id asked; the tree (`LayersTab.tsx`) takes it, puts the row's name in its field and clears the request.
// UI state, never in the Project or the history.
import { create } from 'zustand'
import { showPanel, useUi } from '../layout/ui.ts'

interface RowRename {
  /** The id of the row whose name is asked for (`building:<id>`, `level:<id>`); null when nothing waits. */
  asked: string | null
  /** The tree took it: the request is over. */
  take(): void
}

export const useRowRename = create<RowRename>()((set) => ({ asked: null, take: () => set({ asked: null }) }))

/** Asks for the name of this row to be edited in the tree: the Layers tab opens on it. */
export function askRowRename(rowId: string): void {
  useUi.getState().setRail('layers')
  showPanel('left')
  useRowRename.setState({ asked: rowId })
}
