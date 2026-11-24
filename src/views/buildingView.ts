// What the plan and the 3D show of the buildings (Decisions "Buildings and options", "Buildings layout"):
// - only the active option's buildings, less the hidden ones (hiding only hides: a hidden building still counts; what
//   is hidden is layers/layerView.ts's, per project, and these helpers take its list of keys);
// - the plan edits the active building's active level; the option's other buildings show as context, each at the level
//   that stands at the active level's height (else its ground floor), to see, snap to and pick;
// - a context building is neutral grey whatever its program; the others take their program's colour, or their
//   building's with *Color by: Building*.
// `colorBy` is view state (not in the Project or the history), like the snap settings. `planes`: each level as a plane
// at its height in the 3D, Show's *Levels* (Decision "Level planes"; for the session). Which buildings are hidden and
// whether the labels show (the masses' names and areas on the plan) are layerView.ts's. `buildingDrawn` and `massDrawn` are the
// one answer to "is this building's thing drawn here" (`massDrawn` also asks the mass's own eye, `mass:<id>`, Phase AS.4): the 3D draws nothing of a hidden building, the plan draws nothing of
// it either but for the building the plan is on (Decision "Hidden per project"); the courts, docks, fixtures, bubbles and
// picks of a building follow them instead of each writing the condition.
import { create } from 'zustand'
import type { Building, Id, Level, Mass, Project } from '../model/schema.ts'
import { buildingOf, buildingOfLevel, optionBuildings, optionOf } from '../engine/buildings.ts'
import { groundLevel, levelTop } from '../engine/levels.ts'
import { building, mass } from './layers/keys.ts'

export type ColorBy = 'program' | 'building'

/** *Color by*'s two choices, as the Buildings tab and View › Colour by list them. */
export const COLOR_BY: { key: ColorBy; label: string; title: string }[] = [
  { key: 'program', label: 'Program', title: 'Each mass in its program’s colour: programs read across buildings' },
  { key: 'building', label: 'Building', title: 'Each mass in its building’s colour' },
]

interface BuildingView {
  colorBy: ColorBy
  planes: boolean
  setColorBy(c: ColorBy): void
  togglePlanes(): void
}

export const useBuildingView = create<BuildingView>()((set) => ({
  colorBy: 'program',
  planes: false,
  setColorBy: (colorBy) => set({ colorBy }),
  togglePlanes: () => set((s) => ({ planes: !s.planes })),
}))

type Off = readonly string[] | ReadonlySet<string>

/**
 * Is this building's eye on, so that what stands on it is drawn? The one answer to "is this mass's building shown here":
 * in the 3D (no `planOn`: hidden is hidden) and on the plan (`planOn`: the id of the building the plan is on, which
 * stays drawn where it is edited, Decision "Hidden per project"). Readers (a court, a dock, a fixture, a bubble) ask it
 * instead of writing the condition again; `off`: the layer store's hidden keys, as a list or a Set.
 */
export function buildingDrawn(off: Off, buildingId: Id, planOn?: Id | null): boolean {
  if (planOn !== undefined && planOn !== null && buildingId === planOn) return true
  return Array.isArray(off) ? !off.includes(building(buildingId)) : !(off as ReadonlySet<string>).has(building(buildingId))
}

/** Is this key one the viewer hides? */
const offHas = (off: Off, key: string): boolean => (Array.isArray(off) ? off.includes(key) : (off as ReadonlySet<string>).has(key))

/** Is this mass's own eye off (Phase AS.4, Hide for one object: the key `mass:<id>`)? No exception: not on the plan, not in the 3D. */
export const massEyeOff = (off: Off, massId: Id): boolean => offHas(off, mass(massId))

/**
 * `buildingDrawn` for what stands on a mass (a court, a dock, a bubble), and the mass's own eye: a mass the engine did not derive is
 * not asked about its building. A mass hidden by its own eye is not drawn whatever its building says, the plan's building included.
 */
export function massDrawn(masses: Record<Id, { buildingId: Id }>, massId: Id, off: Off, planOn?: Id | null): boolean {
  if (massEyeOff(off, massId)) return false
  const b = masses[massId]?.buildingId
  return b === undefined || buildingDrawn(off, b, planOn)
}

/** The building the plan is on: the one the active level belongs to. */
export const planBuilding = (p: Project, level: Id): Id | null => buildingOfLevel(p, level)?.id ?? null

/** Is this mass one the plan does not draw (its own eye is off, or its building's is and it is not the building the plan is on)? What a group's pick leaves out. */
export function massHiddenOnPlan(p: Project, level: Id, id: Id, off: Off): boolean {
  const m = p.masses.find((x) => x.id === id)
  return m !== undefined && (massEyeOff(off, id) || !buildingDrawn(off, buildingOf(p, m).id, planBuilding(p, level)))
}

/** The buildings drawn: the option's (in its order), less the hidden ones (`hidden`: the layer store's keys). */
export function shownBuildings(p: Project, option: Id, hidden: readonly string[]): Building[] {
  return optionBuildings(p, optionOf(p, option)).filter((b) => buildingDrawn(hidden, b.id))
}

/** The level whose stack holds height z (from its floor up to, not including, its top); else the ground floor. */
export function levelAt(levels: Level[], z: number): Level {
  return levels.find((l) => z >= l.elevation - 1e-9 && z < levelTop(l) - 1e-9) ?? groundLevel(levels)
}

/** The level each other shown building of the option is seen at: the one standing at the active level's height. */
export function otherLevels(p: Project, level: Id, option: Id, hidden: readonly string[]): Id[] {
  const active = buildingOfLevel(p, level)
  const z = active?.levels.find((l) => l.id === level)?.elevation ?? 0
  return shownBuildings(p, option, hidden)
    .filter((b) => b.id !== active?.id)
    .map((b) => levelAt(b.levels, z).id)
}

/** The masses on those levels: the option's other buildings, as the plan shows them (a mass whose own eye is off is not one). */
export function otherMasses(p: Project, level: Id, option: Id, hidden: readonly string[]): Mass[] {
  const levels = new Set(otherLevels(p, level, option, hidden))
  return p.masses.filter((m) => levels.has(m.levelId) && !massEyeOff(hidden, m.id))
}

/** Is the mass in a context building? */
export const isContext = (p: Project, m: Pick<Mass, 'levelId'>) => buildingOf(p, m).context === true

/** A design mass's colour: its building's, or its program's (null: no program). Context masses are drawn grey apart. */
export function fillOf(p: Project, m: Mass, colorBy: ColorBy): string | null {
  if (colorBy === 'building') return buildingOf(p, m).color
  return (m.programId && p.programs.find((g) => g.id === m.programId)?.color) || null
}

