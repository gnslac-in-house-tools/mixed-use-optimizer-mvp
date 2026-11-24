// Which road is picked on the Massing plan (Decision "Exterior circulation", 4.4): UI state, never in the Project. A
// road is picked by its derived id (`street:<its earliest segment>`, `existing:<id>`); an edit that renames the street (its earliest
// segment goes, or joins another) moves the pick to the new id. One thing is picked at a time: a mass or a dimension lets the road go; streets may be
// several, Shift+clicked (their parking set together, Decision "Street parking by side").
import { create } from 'zustand'
import type { Id, StreetSide } from '../../../model/schema.ts'
import type { DerivedRoad } from '../../../engine/types.ts'
import { useApp } from '../../../state/store.ts'
import { useDimensions } from '../tools/toolState.ts'
import { mixing } from '../mixing.ts'

/**
 * The street type the Street tool draws with (the drafting bar's chip; Decision "Streets layout"): null, the
 * project's first. UI state, this session.
 */
export const useStreetType = create<{ type: Id | null; setType(t: Id | null): void }>()((set) => ({
  type: null,
  setType: (type) => set({ type }),
}))

const SIDES: StreetSide[] = ['left', 'centre', 'right']

/** The sides' names, for the chips, the label at the pointer and the ghost. */
export const SIDE_NAMES: Record<StreetSide, string> = { left: 'Left', centre: 'Centre', right: 'Right' }

/**
 * The side the Street tool draws by (the chips Left · Centre · Right beside its type; Decision "Street side when
 * drawing"): which edge of the street the drawn line is, walking it, or its centre. The last one used is kept for the
 * next street; UI state, this session. `cycle`: Space (or Tab while drawing), the next one (`back`, Shift: the one before).
 */
export const useStreetSide = create<{ side: StreetSide; setSide(s: StreetSide): void; cycle(back?: boolean): void }>()((set, get) => ({
  side: 'centre',
  setSide: (side) => set({ side }),
  cycle: (back = false) => set({ side: SIDES[(SIDES.indexOf(get().side) + (back ? SIDES.length - 1 : 1)) % SIDES.length] }),
}))

/**
 * `node`: a street's node picked on the picked street (its handle clicked): Delete removes it. `also`: the other streets
 * picked with Shift+click beside it (Decision "Street parking by side"): their parking is set together.
 */
export const useRoads = create<{
  picked: string | null
  node: Id | null
  also: string[]
  pick(id: string | null): void
  pickNode(id: Id | null): void
  /** Shift+click: the street joins what is picked, or leaves it; it lets go of nothing else (Decision "Mixed selection"). */
  toggle(id: string): void
}>()((set, get) => ({
  picked: null,
  node: null,
  also: [],
  pick: (picked) => {
    if (picked !== null) {
      useApp.getState().select(null)
      useDimensions.getState().select(null)
    }
    set({ picked, node: null, also: [] })
  },
  pickNode: (node) => set({ node }),
  toggle: (id) => {
    const { picked, also } = get()
    if (picked === null) return set({ picked: id, node: null, also: [] })
    if (id === picked) return set({ picked: also[0] ?? null, also: also.slice(1), node: null })
    set({ also: also.includes(id) ? also.filter((x) => x !== id) : [...also, id], node: null })
  },
}))

/** Every street picked: the one first, then those Shift+clicked beside it. */
export const pickedIds = (s: { picked: string | null; also: string[] }): string[] => (s.picked === null ? [] : [s.picked, ...s.also])

/** The runs of a street (Phase PE.1: the segments between crossings; a run is a stretch of one width): `id` is the street's (`street:<its earliest segment>`). */
export const runsOf = (roads: readonly DerivedRoad[], id: string): DerivedRoad[] => roads.filter((r) => r.kind === 'street' && (r.street ?? r.id) === id)

/** The street's id of a derived road (a run's `street`; an existing road's own id). */
export const streetIdOf = (r: DerivedRoad): string => r.street ?? r.id

/** Every segment of the street with this id. */
export const segmentsOfStreet = (roads: readonly DerivedRoad[], id: string): Id[] => runsOf(roads, id).flatMap((r) => r.segments ?? [])

/** A run of a street that runs along this segment, as the active option draws it (its `street` is the street). */
export function streetOfSegment(segId: Id): DerivedRoad | null {
  return useApp.getState().derived.circulation.roads.find((r) => r.kind === 'street' && r.segments?.includes(segId)) ?? null
}

/** The picked street's run that holds its earliest segment (its other runs: `runsOf`), as the active option draws it; null when none (or it is gone). */
export function pickedRoad(): DerivedRoad | null {
  const id = useRoads.getState().picked
  if (id === null) return null
  const roads = useApp.getState().derived.circulation.roads
  return roads.find((r) => r.id === id) ?? roads.find((r) => r.street === id) ?? null
}

/**
 * The id the street `id` has among `roads` now (an edit can rename it: it is its earliest segment's), found by a segment it had among `before`; null
 * when it is gone. A road that is not a street (an existing one) keeps its id or is gone.
 */
export function streetNow(before: readonly DerivedRoad[], roads: readonly DerivedRoad[], id: string): string | null {
  if (roads.some((r) => streetIdOf(r) === id)) return id
  for (const seg of segmentsOfStreet(before, id)) {
    const r = roads.find((x) => x.kind === 'street' && x.segments?.includes(seg))
    if (r) return streetIdOf(r)
  }
  return null
}

// a mass picked, or the road gone (an undo, the massing changed, another option), lets it go; one renamed by an edit stays picked
useApp.subscribe((s, before) => {
  const id = useRoads.getState().picked
  if (id === null) return
  const massPicked = !mixing.on && s.selection.massIds.length > 0 && s.selection.massIds !== before.selection.massIds
  const roads = s.derived.circulation.roads
  const now = massPicked ? null : streetNow(before.derived.circulation.roads, roads, id)
  if (now === null) return useRoads.getState().pick(null)
  // a street beside it gone (joined, removed) leaves the others picked; one renamed stays, under its new id (a node picked on the old id goes)
  const was = useRoads.getState().also
  const also = [...new Set(was.map((x) => streetNow(before.derived.circulation.roads, roads, x)).filter((x): x is string => x !== null && x !== now))]
  if (now !== id || also.length !== was.length || also.some((x, i) => x !== was[i])) useRoads.setState({ picked: now, also, ...(now !== id ? { node: null } : {}) })
})
useDimensions.subscribe((s, before) => {
  if (mixing.on || s.selected === null || (s.selected === before.selected && s.also === before.also)) return
  if (useRoads.getState().picked !== null) useRoads.setState({ picked: null, node: null, also: [] })
})
