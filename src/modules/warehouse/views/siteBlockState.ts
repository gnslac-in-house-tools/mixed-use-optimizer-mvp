// The block tools on the site (Decision "Blocks on the site", GT.8): Dock, Door, Pattern and Court on a placed
// warehouse block, pressed on the site plan, editing that copy alone. UI state, never in the Project or the history;
// the site's own, apart from the block editor's tool (`useWarehouse`). The tool is the hand's: `views/tools/hand.ts` writes
// `tool` (one tool takes the plan at a time) and lets it go when the picked block goes away or the 3D view shows alone.
import { create } from 'zustand'
import type { IconName } from '../../../views/controls/Icon.tsx'
import type { Id, Project } from '../../../model/schema.ts'
import { buildingOf } from '../../../engine/buildings.ts'
import { useApp } from '../../../state/store.ts'

export type SiteBlockTool = 'dock' | 'door' | 'pattern' | 'court'

/** The element tools (Decision "Elements by module"): a press inside a wall's module puts one there or takes it away,
 *  a press outside the block in front of a bay fills it (or, full, empties it), a drag along the wall the modules it
 *  passes; Court, a wall's truck court (Decision "Truck court"). The site's block tools are these (GT.8). `title` is the
 *  sentence of each button, plain text: the strip's `hint` reads it. */
export const ELEMENT_TOOLS: { tool: 'dock' | 'door' | 'pattern' | 'court'; icon: IconName; label: string; title: string }[] = [
  { tool: 'dock', icon: 'dock', label: 'Dock', title: 'Docks, one a module: press inside a wall’s module to put one or take it away; press outside the block in front of a bay to fill it (full: empty it); drag along the wall for more' },
  { tool: 'door', icon: 'door', label: 'Door', title: 'Level doors, one a module: press inside a wall’s module to put one or take it away; press outside the block in front of a bay to fill it (full: empty it); drag along the wall for more' },
  { tool: 'pattern', icon: 'pattern', label: 'Pattern', title: 'A mark of your own (a downpipe), one a module: press inside a wall’s module to put one or take it away; press outside in front of a bay to fill it (full: empty it); drag for more' },
  { tool: 'court', icon: 'truck', label: 'Court', title: 'A truck court in front of a wall: press a wall without docks to put one or take it away (a docked wall always has its own); drag its pill for a depth of its own' },
]

/** The element tools a project's typology offers: Dock and Court stand on docks (*What is not there is not shown*), so a typology without the docks module has Door and Pattern only. */
export const elementToolsFor = (docks: boolean): typeof ELEMENT_TOOLS => ELEMENT_TOOLS.filter((x) => docks || (x.tool !== 'dock' && x.tool !== 'court'))

export const useSiteBlock = create<{ tool: SiteBlockTool | null }>()(() => ({ tool: null }))

/** The placed block picked in `p`: exactly one mass picked, whose building is a copy of a type the project has. */
export function siteBlockIn(p: Project, massIds: readonly Id[]): Id | null {
  if (massIds.length !== 1) return null
  const m = p.masses.find((x) => x.id === massIds[0])
  if (!m) return null
  const b = buildingOf(p, m)
  const copy = b.warehouse
  return copy && (p.warehouseTypes ?? []).some((t) => t.id === copy.type) ? b.id : null
}

/** The placed block picked: exactly one mass picked whose building is a warehouse copy; its building id. */
export function siteBlockOf(): Id | null {
  const s = useApp.getState()
  return siteBlockIn(s.project, s.selection.massIds)
}

/** The placed block picked, as the project and the selection change. */
export const useSiteBlockOf = (): Id | null => useApp((s) => siteBlockIn(s.project, s.selection.massIds))
