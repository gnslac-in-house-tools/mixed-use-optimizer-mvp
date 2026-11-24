// Buildings and options as the engine reads them (Decision "Buildings and options"). Pure.
// A mass points only to its level; level ids are unique in the project, so the level says the building.
import type { Building, DesignOption, Id, Level, Mass, Project } from '../model/schema.ts'

/** Every level of every building. */
export const allLevels = (p: Project): Level[] => p.buildings.flatMap((b) => b.levels)

/** The building a level belongs to. */
export function buildingOfLevel(p: Project, levelId: Id): Building | undefined {
  return p.buildings.find((b) => b.levels.some((l) => l.id === levelId))
}

/** The building a mass belongs to (the first one if its level is not found). */
export function buildingOf(p: Project, m: Pick<Mass, 'levelId'>): Building {
  return buildingOfLevel(p, m.levelId) ?? p.buildings[0]
}

/** The option with that id, or the first one. */
export function optionOf(p: Project, id: Id | null | undefined): DesignOption {
  return p.options.find((o) => o.id === id) ?? p.options[0]
}

/** An option and the groups folded under it (Decision "Stage options"). */
export interface OptionEntry {
  option: DesignOption
  groups: { name: string; options: DesignOption[] }[]
}

/**
 * The options as the switch and the tree list them: each one on its own, the options grouped under it after it, by
 * group, the latest first. An option grouped under one that is gone (or under a grouped one) stands on its own.
 */
export function optionGroups(p: Project): OptionEntry[] {
  const top = (o: DesignOption) => !o.group || !p.options.some((x) => x.id === o.group!.under && !x.group)
  return p.options.filter(top).map((option) => {
    const under = p.options.filter((o) => !top(o) && o.group!.under === option.id).reverse()
    const names = [...new Set(under.map((o) => o.group!.name))]
    return { option, groups: names.map((name) => ({ name, options: under.filter((o) => o.group!.name === name) })) }
  })
}

/** The option's buildings, in its order (the Buildings tree's, which the first one leads). */
export function optionBuildings(p: Project, option: DesignOption): Building[] {
  return option.buildingIds.flatMap((id) => p.buildings.find((b) => b.id === id) ?? [])
}

/**
 * The buildings no option shows. None after a verb (Decision "No loose buildings": what leaves its last option goes),
 * only one just made without an option, before it joins one.
 */
export function looseBuildings(p: Project): Building[] {
  return p.buildings.filter((b) => !p.options.some((o) => o.buildingIds.includes(b.id)))
}

/** The masses of an option: those of the buildings it shows. */
export function massesOfOption(p: Project, option: DesignOption): Mass[] {
  const levels = new Set(p.buildings.filter((b) => option.buildingIds.includes(b.id)).flatMap((b) => b.levels.map((l) => l.id)))
  return p.masses.filter((m) => levels.has(m.levelId))
}

/** The levels of the building that holds `levelId` (the active one's: what the levels rail and the building's Properties show). */
export function buildingLevels(p: Project, levelId: Id): Level[] {
  return (buildingOfLevel(p, levelId) ?? p.buildings[0]).levels
}
