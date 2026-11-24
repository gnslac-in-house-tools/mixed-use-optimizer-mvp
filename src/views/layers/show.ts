// Showing a row's settings (Phase AS.3, Decision "Settings by what is picked"): `showLayer(rowId)` picks the row of Layers, opens
// the branches above it, makes Properties the left panel's tab and opens the panel (a sheet below 880 px). The commands that
// opened a settings tab call it: Site › Location… and Site rules… (`'site'`), Terrain… (`'terrain'`), Design › Levels… (the row of
// the building the plan is on). A row the tree does not have now (a Site with nothing in it, a Terrain without ground) is not
// picked, but Properties and the panel still open. `isBranchOpen` and `openBranch` read and set a branch's fold (the tutorial's step on
// Circulation asks for it). Nothing here is undoable: a pick and a panel are the viewer's.
import { buildingOfLevel } from '../../engine/buildings.ts'
import { isOffered, isOn } from '../../modules/catalog.ts'
import { useApp } from '../../state/store.ts'
import { showPanel, useUi } from '../layout/ui.ts'
import { pickLayer } from './layerPick.ts'
import { useLayerView } from './layerView.ts'
import { foldedByDefault, layerTree, type LayerRow } from './tree.ts'

/** The rows from a branch down to the row `id` (the row last), or null when the tree has no such row. */
function pathTo(rows: readonly LayerRow[], id: string): LayerRow[] | null {
  for (const row of rows) {
    if (row.id === id) return [row]
    const below = pathTo(row.children ?? [], id)
    if (below) return [row, ...below]
  }
  return null
}

/** Picks the row `id`, unfolds what holds it, and shows Properties with the left panel open. */
export function showLayer(id: string): void {
  const { project, option, derived } = useApp.getState()
  const rows = layerTree(project, option, derived, {
    terrain: isOn(project, 'terrain'),
    parking: isOffered(project, 'parking'),
  })
  const path = pathTo(rows, id)
  if (path) {
    const view = useLayerView.getState()
    // the store holds the rows whose fold differs from the first one: a row that is not open is flipped open
    for (const row of path.slice(0, -1)) {
      const folded = view.folded.includes(row.id)
      if (foldedByDefault(row) !== folded) view.setFolded(row.id, !folded)
    }
    pickLayer(id)
  }
  useUi.getState().setRail('properties')
  showPanel('left')
}

/** Is the branch `id` open now (its rows show)? Every branch starts folded but Buildings (tree.ts), and the store lists the ones that differ. */
export function isBranchOpen(id: string): boolean {
  const changed = useLayerView.getState().folded.includes(id)
  return id === 'buildings' ? !changed : changed
}

/** Opens the branch `id` when it is folded. */
export function openBranch(id: string): void {
  if (!isBranchOpen(id)) useLayerView.getState().setFolded(id, id !== 'buildings')
}

/** The row of the building the plan is on (Design › Levels…): its settings hold its levels. */
export function showLevelsOfBuilding(): void {
  const { project, level } = useApp.getState()
  const building = buildingOfLevel(project, level)
  showLayer(building ? `building:${building.id}` : 'buildings')
}
