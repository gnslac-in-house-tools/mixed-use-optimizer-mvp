// The three eyes that run a switch that exists (Phase AS.3, Decision "Layers"): the Grid (the snap's switch, F9), the
// Terrain (the ground's look: off, or the last look chosen in View › Terrain) and the Program graph (the mode that ghosts
// the masses and draws the graph over them). They are not in the store of hidden keys (layerView.ts): their state is where
// it always was, and the eye runs the command that flips it (`view.grid`, `view.terrain.*`, `view.overlay.graph`), so the
// menu, the key and the eye are one. The terrain's eye puts back the last look that was on (contours at first).
import { useMemo } from 'react'
import { TERRAIN_SHOWS, useTerrainView, type TerrainShow } from '../../modules/terrain/views/terrainView.ts'
import { runCommand } from '../commands/index.ts'
import { useGraph } from '../graph/graphState.ts'
import { useSnapSettings } from '../plan/snap/settings.ts'
import type { SwitchName } from './tree.ts'

/** The last look of the ground that was on: what the terrain's eye puts back. */
let lastLook: Exclude<TerrainShow, 'off'> = 'contours'
useTerrainView.subscribe((s) => {
  if (s.show !== 'off') lastLook = s.show
})

/** Is this switch on now (its thing shown)? */
export function switchOn(name: SwitchName): boolean {
  if (name === 'grid') return useSnapSettings.getState().settings.grid
  if (name === 'graph') return useGraph.getState().graph
  return useTerrainView.getState().show !== 'off'
}

/** The three switches' state, in a view: it re-renders only when one changes. */
export function useSwitches(): Record<SwitchName, boolean> {
  const grid = useSnapSettings((s) => s.settings.grid)
  const graph = useGraph((s) => s.graph)
  const terrain = useTerrainView((s) => s.show !== 'off')
  return useMemo(() => ({ grid, graph, terrain }), [grid, graph, terrain])
}

/** Turns a switch on or off through its command; nothing happens when it is as asked. */
export function setSwitch(name: SwitchName, on: boolean): void {
  if (switchOn(name) === on) return
  if (name === 'grid') runCommand('view.grid')
  else if (name === 'graph') runCommand('view.overlay.graph')
  else {
    const look = on ? lastLook : 'off'
    if (!runCommand(`view.terrain.${look}`)) useTerrainView.getState().setShow(look)
  }
}

/** The names the switches' eyes carry. */
export const SWITCH_TITLES: Record<SwitchName, string> = {
  grid: 'The grid snap (F9)',
  terrain: `The ground's look: off, or the last one (${TERRAIN_SHOWS.filter((t) => t.key !== 'off').map((t) => t.label).join(', ')})`,
  graph: 'The program graph over the masses',
}
