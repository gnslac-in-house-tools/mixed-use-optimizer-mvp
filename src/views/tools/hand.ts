// The tool in hand (Project C, AS.2): one store says which tool the pointer holds on the project's plan, and this file is
// the only one that writes the five stores that follow it, from one table. UI state, never in the Project or the history.
//   Hand        every tool the plan can hold: a drawing or general tool (`Tool`), the ruler, an access tool, a site tool
//               (Draw, Place, Heights, Grid) or a block tool (Dock, Door, Pattern, Court)
//   take        a tool taken: the other stores let go, the stores' side effects follow (a drawing tool leaves *All levels*,
//               a tool that draws one kind shows that kind: Dimension the dimensions, Street the streets…); false when refused (a block tool with the 3D alone or no placed block picked)
//   toggle      the tool in hand again goes back to Select; letGo: Select
//   inHand      what the buttons' ticks and the commands' `checked` read
// The five stores keep their field for their readers (`useTool.tool`, `useRuler.active`, `useAccess.tool`,
// `useSiteTool.tool`, `useSiteBlock.tool`) and have no setter: this file writes them, so exactly one tool is in hand and
// they agree with it. Every rule that drops a tool is here too: *All levels* turned on, the picked block going, the 3D
// alone, an import starting or another project opening (any tool), Heights without ground, Grid without a grid. No panel tab drops
// a tool: a tool works whatever the left panel shows, and taking one leaves the panel as it is.
import { create } from 'zustand'
import { useApp } from '../../state/store.ts'
import { useUi } from '../layout/ui.ts'
import { useSiteImport } from '../plan/site/importState.ts'
import { useAccess, type AccessTool } from '../plan/access/accessState.ts'
import { useSiteTool, type SiteTool } from '../plan/site/siteTools.ts'
import { COURTS, DIMENSIONS, EXISTING_ROADS, GATES, LOTS, NOTES, REFERENCE_LINES, STREETS } from '../layers/keys.ts'
import { showLayers } from '../layers/layerView.ts'
import { useRuler, useTool, type Tool } from '../plan/tools/toolState.ts'
import { siteBlockOf, useSiteBlock, type SiteBlockTool } from '../../modules/warehouse/views/siteBlockState.ts'

/** Every tool the pointer can hold on the project's plan. */
export type Hand = Tool | 'ruler' | AccessTool | SiteTool | SiteBlockTool

/** Which store a tool lives in: the table's columns. */
type Kind = 'tool' | 'ruler' | 'access' | 'site' | 'block'

const KIND: Record<Hand, Kind> = {
  select: 'tool',
  mass: 'tool',
  hole: 'tool',
  corner: 'tool',
  chamfer: 'tool',
  split: 'tool',
  dimension: 'tool',
  referenceLine: 'tool',
  note: 'tool',
  street: 'tool',
  lot: 'tool',
  move: 'tool',
  copy: 'tool',
  rotate: 'tool',
  mirror: 'tool',
  array: 'tool',
  align: 'tool',
  ruler: 'ruler',
  gate: 'access',
  existing: 'access',
  draw: 'site',
  place: 'site',
  heights: 'site',
  grid: 'site',
  dock: 'block',
  door: 'block',
  pattern: 'block',
  court: 'block',
}

/** What a tool draws or works on, shown again when it is taken (an eye may have hidden it: a tool that draws it shows it). */
const SHOWS: Partial<Record<Hand, string[]>> = {
  dimension: [DIMENSIONS],
  referenceLine: [REFERENCE_LINES],
  note: [NOTES],
  street: [STREETS],
  lot: [LOTS],
  gate: [GATES],
  existing: [EXISTING_ROADS],
  court: [COURTS],
}

export const useHand = create<{ tool: Hand }>()(() => ({ tool: 'select' }))

/** Is `tool` the one in hand? Select: no other tool has the pointer. */
export const inHand = (tool: Hand): boolean => useHand.getState().tool === tool

/** Writes a store's field only when it changes (a `setState` with the same value still wakes every subscriber). */
function follow(): void {
  const h = useHand.getState().tool
  const kind = KIND[h]
  const tool: Tool = kind === 'tool' ? (h as Tool) : 'select'
  if (useTool.getState().tool !== tool) useTool.setState({ tool })
  const ruler = kind === 'ruler'
  // the measurement in progress goes whenever the ruler is taken or let go
  if (ruler || useRuler.getState().active) useRuler.setState({ active: ruler, a: null, b: null })
  const access = kind === 'access' ? (h as AccessTool) : null
  if (useAccess.getState().tool !== access) useAccess.setState({ tool: access })
  const site = kind === 'site' ? (h as SiteTool) : null
  if (useSiteTool.getState().tool !== site) useSiteTool.setState({ tool: site })
  const block = kind === 'block' ? (h as SiteBlockTool) : null
  if (useSiteBlock.getState().tool !== block) useSiteBlock.setState({ tool: block })
}

/**
 * Takes `tool`: it is the only one in hand, the five stores follow. A drawing tool (any of `useTool`'s but Select) taken
 * while *All levels* shows goes back to the active level (one draws on a level, Practiko); a tool that draws one kind shows it (`SHOWS`: Dimension
 * the dimensions, Street the streets, Gate the gates…). False, and nothing changed, when it is refused: a block tool with the 3D alone (the tools work on the plan) or
 * with no placed block picked (it works on that block).
 */
export function take(tool: Hand): boolean {
  const kind = KIND[tool]
  if (kind === 'block' && (useUi.getState().view === '3d' || siteBlockOf() === null)) return false
  if (kind === 'tool' && tool !== 'select' && useApp.getState().showAll) useApp.getState().setShowAll(false)
  const shows = SHOWS[tool]
  if (shows) showLayers(...shows)
  useHand.setState({ tool })
  follow()
  return true
}

/** The tool in hand again goes back to Select; any other is taken. */
export function toggle(tool: Hand): void {
  if (inHand(tool)) letGo()
  else take(tool)
}

/** Select: whatever is in hand is let go. */
export function letGo(): void {
  take('select')
}

// *All levels* is a view: turned on, it leaves the drawing tools for Select (Practiko's `setVerTodos`)
useApp.subscribe((s, before) => {
  if (s.showAll && !before.showAll && useTool.getState().tool !== 'select') letGo()
})
// Heights needs the ground, Grid needs a grid: removed (or undone), the tool goes
useApp.subscribe((s, before) => {
  if (!s.project.site.terrain && before.project.site.terrain && inHand('heights')) letGo()
  if (!s.project.grid && before.project.grid && !s.project.options.some((o) => o.grid) && inHand('grid')) letGo()
})
// a project opened in its place (`opened` counts them) is another project: nothing carries over, not a tool in hand
useApp.subscribe((s, before) => {
  if (s.opened !== before.opened) letGo()
})
// a block tool works on the placed block picked: the pick gone (another pick, nothing picked, undone away), it goes
useApp.subscribe(() => {
  if (KIND[useHand.getState().tool] === 'block' && siteBlockOf() === null) letGo()
})
// the 3D view alone: the Grid tool's handles and the block tools work on the plan
useUi.subscribe((s, before) => {
  if (s.view !== '3d' || before.view === '3d') return
  const h = useHand.getState().tool
  if (h === 'grid' || KIND[h] === 'block') letGo()
})
// an import starting takes the plan (its layer is on it): whatever is in hand goes
useSiteImport.subscribe((s, before) => {
  if (s.pending && !before.pending) letGo()
})
