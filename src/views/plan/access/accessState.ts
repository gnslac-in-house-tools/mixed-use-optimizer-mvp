// The access tools and what is picked (Decision "Exterior circulation", 4.2): UI state, never in the Project or the
// history, like the plan's tools (toolState.ts). The tool is the hand's (`tools/hand.ts` writes `tool`: taking one lets
// the others go, never what is picked). One thing is picked at a time: a mass, a
// road or a dimension lets it go, and it lets them go. Shift+click and the selection window mix kinds
// (`views/plan/mix.ts`, Decision "Mixed selection"): `alsoGates` holds the gates picked beside the first.
//   tool    Gate (a click on a street's side or near the boundary) · Existing road (by points); none: pick
//   picked  a gate or an existing road: its row in the Layers is marked, Delete removes it
//   alsoSite  the other existing roads picked beside `picked` (Shift+click, the window, Select all existing roads); a gate and existing roads are picked together (Phase PE.2 task 12):
//             `picked` is the first of them, `alsoGates` the other gates and `alsoSite` the other existing roads
import { create } from 'zustand'
import type { Id } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { gatesOf } from '../../../engine/circulation/gates.ts'
import { useRoads } from '../circulation/roadState.ts'
import { useDimensions } from '../tools/toolState.ts'
import { mixing } from '../mixing.ts'

export type AccessTool = 'gate' | 'existing'
export type AccessKind = 'gate' | 'existing'
/** An existing road picked. */
export type SitePick = { kind: 'existing'; id: Id }

export const ACCESS_TOOLS: { key: AccessTool; label: string; title: string }[] = [
  { key: 'gate', label: 'Gate', title: 'Gate: click a street’s side or the site’s boundary to place one; drag its handle to slide it along its side' },
  { key: 'existing', label: 'Existing road', title: 'Existing road: click its drawn side point by point (Left, Centre or Right), Enter or a double click ends it' },
]

interface AccessState {
  tool: AccessTool | null
  picked: { kind: AccessKind; id: Id } | null
  /** The gates picked beside `picked` (Shift+click, the window: Decision "Mixed selection"); whatever kind `picked` is. */
  alsoGates: Id[]
  /** The existing roads picked beside `picked` (Shift+click, the window, *Select all existing roads*); whatever kind `picked` is. */
  alsoSite: SitePick[]
  pick(p: { kind: AccessKind; id: Id } | null): void
  /** Picks exactly these gates and existing roads (the first of them is `picked`: a gate when both are given). */
  set(gates: Id[], roads: Id[]): void
  /** Shift+click: the gate joins what is picked, or leaves it; it lets go of nothing else. */
  toggleGate(id: Id): void
  /** Shift+click: the existing road joins what is picked, or leaves it; it lets go of nothing else. */
  toggleSite(id: Id): void
}

type Item = { kind: AccessKind; id: Id }

/** The state that holds these items, the first as `picked`. */
function holding(items: Item[]): Pick<AccessState, 'picked' | 'alsoGates' | 'alsoSite'> {
  const [first, ...rest] = items
  return {
    picked: first ?? null,
    alsoGates: rest.filter((x) => x.kind === 'gate').map((x) => x.id),
    alsoSite: rest.filter((x) => x.kind === 'existing').map((x): SitePick => ({ kind: 'existing', id: x.id })),
  }
}

/** Everything picked here, in order: `picked`, then the gates, then the existing roads. */
const itemsOf = (s: Pick<AccessState, 'picked' | 'alsoGates' | 'alsoSite'>): Item[] => [...(s.picked ? [s.picked] : []), ...s.alsoGates.map((id): Item => ({ kind: 'gate', id })), ...s.alsoSite]

export const useAccess = create<AccessState>()((set, get) => ({
  tool: null,
  picked: null,
  alsoGates: [],
  alsoSite: [],
  pick: (picked) => {
    if (picked !== null) {
      useApp.getState().select(null)
      useDimensions.getState().select(null)
      useRoads.getState().pick(null)
    }
    set({ picked, alsoGates: [], alsoSite: [] })
  },
  set: (gates, roads) => set(holding([...gates.map((id): Item => ({ kind: 'gate', id })), ...roads.map((id): Item => ({ kind: 'existing', id }))])),
  toggleGate: (id) => toggle(get, set, { kind: 'gate', id }),
  toggleSite: (id) => toggle(get, set, { kind: 'existing', id }),
}))

/** An item joins what is picked here, or leaves it (the first of what is left is the one picked). */
function toggle(get: () => AccessState, set: (s: Partial<AccessState>) => void, item: Item): void {
  const items = itemsOf(get())
  const there = items.some((x) => x.kind === item.kind && x.id === item.id)
  set(holding(there ? items.filter((x) => !(x.kind === item.kind && x.id === item.id)) : [...items, item]))
}

/** Whether an access tool is in hand (what the plan reads to let the masses be: it is not what is picked). */
export const useAccessTool = (): boolean => useAccess((s) => s.tool !== null)
export const accessToolOn = (): boolean => useAccess.getState().tool !== null

/** Every gate picked: the one first, then those Shift+clicked beside it. */
export const pickedGateIds = (s: Pick<AccessState, 'picked' | 'alsoGates'>): Id[] => (s.picked?.kind === 'gate' ? [s.picked.id, ...s.alsoGates] : s.alsoGates)

/** Every existing road picked: the one, then those picked beside it (the gate may be the first: they are picked beside it). */
export const pickedSiteItems = (s: Pick<AccessState, 'picked' | 'alsoSite'>): SitePick[] => (s.picked?.kind === 'existing' ? [s.picked as SitePick, ...s.alsoSite] : s.alsoSite)

/** Does the picked thing still exist (an undo can take it away)? */
export function pickedExists(picked: AccessState['picked']): boolean {
  if (!picked) return false
  const { project, option } = useApp.getState()
  if (picked.kind === 'gate') return gatesOf(project, option).some((g) => g.id === picked.id)
  return (project.site.existingRoads ?? []).some((r) => r.id === picked.id)
}

// a mass, a road or a dimension picked lets it go
useApp.subscribe((s, before) => {
  if (mixing.on) return
  if (useAccess.getState().picked && s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds) useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
})
useRoads.subscribe((s, before) => {
  if (mixing.on || s.picked === null || (s.picked === before.picked && s.also === before.also)) return
  if (useAccess.getState().picked) useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
})
useDimensions.subscribe((s, before) => {
  if (mixing.on || s.selected === null || (s.selected === before.selected && s.also === before.also)) return
  if (useAccess.getState().picked) useAccess.setState({ picked: null, alsoGates: [], alsoSite: [] })
})

// what is picked and is gone (undone, deleted from the panel, another option without it) is let go; the rest of what is picked stays
useApp.subscribe(() => {
  const items = itemsOf(useAccess.getState())
  const kept = items.filter(pickedExists)
  if (kept.length !== items.length) useAccess.setState(holding(kept))
})
