// Other levels as a reference (Decisions "Levels", "Reference reach"; port of Plaza-Practiko
// `vistas/planta/referencia.ts`): the masses of the levels below and above the active one, dashed and on top, to line
// up with them; their corners and walls snap. How far each way is the reach: none, 1, 2, 3 levels or all of them
// (the user: "how many levels down or up I want to see: the next one, several or infinite; several or infinite fade
// by distance"), the nearest darkest. UI state, not in the Project; it stays when the level changes (always counted
// from the active one).
import { create } from 'zustand'
import type { Id, Mass, Project } from '../../model/schema.ts'
import { buildingLevels } from '../../engine/buildings.ts'
import { useApp } from '../../state/store.ts'
import { otherLevels } from '../buildingView.ts'
import { useLayerView } from '../layers/layerView.ts'
import { useSnapSettings } from './snap/settings.ts'
import type { SnapLevels } from './snap/sources.ts'

/** How many levels each way: 0 none, or `ALL`. */
export const ALL = Infinity
export interface Reach {
  below: number
  above: number
}
export const REACHES = [0, 1, 2, 3, ALL] as const

interface Reference {
  /** Ref. pressed: the reach shows. */
  on: boolean
  reach: Reach
  toggle(): void
  /** A new reach turns Ref. on (off when both ways are none). */
  setReach(patch: Partial<Reach>): void
}

/** By default off; on, the level right below (the one most drawn over). */
export const REFERENCE_DEFAULT = { on: false, reach: { below: 1, above: 0 } }

export const useReference = create<Reference>()((set) => ({
  ...REFERENCE_DEFAULT,
  toggle: () => set((s) => ({ on: !s.on && (s.reach.below > 0 || s.reach.above > 0) })),
  setReach: (patch) =>
    set((s) => {
      const reach = { ...s.reach, ...patch }
      return { reach, on: reach.below > 0 || reach.above > 0 }
    }),
}))

/** A reference level: `k` levels away (1 = the next one), below or above. */
export interface RefLevel {
  id: Id
  k: number
  way: 'below' | 'above'
}

/** The active building's levels within the reach (by elevation), nearest first each way; none while Ref. is off. */
export function referenceLevels(p: Project, active: Id, ref: { on: boolean; reach: Reach }): RefLevel[] {
  if (!ref.on) return []
  const levels = buildingLevels(p, active) // the active building's (Decision "Buildings and options")
  const level = levels.find((l) => l.id === active)
  if (!level) return []
  const below = levels.filter((l) => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)
  const above = levels.filter((l) => l.elevation > level.elevation).sort((a, b) => a.elevation - b.elevation)
  return [
    ...below.slice(0, ref.reach.below).map((l, i) => ({ id: l.id, k: i + 1, way: 'below' as const })),
    ...above.slice(0, ref.reach.above).map((l, i) => ({ id: l.id, k: i + 1, way: 'above' as const })),
  ]
}

/** How dark a reference level is drawn: the next one 0.7, each one further 0.6 × lighter, never under 0.12. */
export const referenceOpacity = (k: number): number => Math.max(0.12, 0.7 * 0.6 ** (k - 1))

/** The reference's masses, each with how far its level is. */
export function referenceMasses(p: Project, active: Id, ref: { on: boolean; reach: Reach }): { mass: Mass; k: number }[] {
  const levels = new Map(referenceLevels(p, active, ref).map((r) => [r.id, r.k]))
  return p.masses.flatMap((mass) => (levels.has(mass.levelId) ? [{ mass, k: levels.get(mass.levelId)! }] : []))
}

/** What snaps now: the active level, the reference's and the option's other buildings as the plan shows them. */
export function snapLevels(): SnapLevels {
  const { project, level, option } = useApp.getState()
  const others = otherLevels(project, level, option, useLayerView.getState().hidden)
  // and the site's drawings, as Snap ▾'s *Snap to* says and the tree shows them (Decision "Drawing layers")
  const drawn = { to: useSnapSettings.getState().settings.to, hidden: useLayerView.getState().hidden }
  return { level, reference: referenceLevels(project, level, useReference.getState()).map((r) => r.id), others, drawn }
}

/** "1", "3" or "all" levels. */
export const reachText = (n: number): string => (n === ALL ? 'all' : String(n))
