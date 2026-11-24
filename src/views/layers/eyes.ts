// What a row's eye does (Phase AS.3, Decision "Layers"; moved here in Phase AS.4 task 5 so a branch row's menu, *Hide* / *Show*, does exactly what its eye does): it hides
// the keys of the layer store the row holds (`tree.ts` `eyeKeys`) or runs one of the three switches (`switches.ts`), a building's goes through `toggleHidden`, which keeps the
// building the plan is on drawn, and Buildings' through `toggleAllHidden`. A row that is shown or mixed hides all it holds; one that is hidden shows all. View state: never an undo step.
import { useApp } from '../../state/store.ts'
import { toggleAllHidden, toggleHidden } from '../panels/buildingCommands.ts'
import { hiddenNow, useLayerView } from './layerView.ts'
import { setSwitch, switchOn } from './switches.ts'
import { eyeKeys, eyeState, eyeSwitches, type EyeState, type LayerRow } from './tree.ts'

/** The three switches' state now, for what is not a view. */
const switchesNow = () => ({ grid: switchOn('grid'), graph: switchOn('graph'), terrain: switchOn('terrain') })

/** Whether the row's eye is open, closed or half (null: it has no eye), as the keys and switches stand now. */
export const rowEyeNow = (row: LayerRow): EyeState | null => eyeState(row.eyes, hiddenNow(), switchesNow())

/** The row's eye pressed: all hidden → show all; otherwise hide all. */
export function toggleRowEye(row: LayerRow): void {
  const state = rowEyeNow(row)
  if (state === null) return
  const project = useApp.getState().project
  if (row.kind === 'building' && row.ref?.building) {
    const b = project.buildings.find((x) => x.id === row.ref!.building)
    return b ? toggleHidden(b) : undefined
  }
  if (row.kind === 'buildings') {
    const bs = (row.children ?? []).flatMap((r) => project.buildings.filter((b) => b.id === r.ref?.building))
    return toggleAllHidden(bs)
  }
  const show = state === 'hidden'
  useLayerView.getState().setHidden(eyeKeys(row.eyes), !show)
  for (const s of eyeSwitches(row.eyes)) setSwitch(s, show)
}
