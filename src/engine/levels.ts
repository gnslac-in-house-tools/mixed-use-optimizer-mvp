// Levels as the engine reads them (Decision "Levels"; port of Plaza-Practiko's `nivelDe` / `alturaDe` in
// `modelo/proyecto.ts`): where a level's stack ends, which one is the ground floor, how tall a mass is. Pure.
// Levels belong to buildings (Decision "Buildings and options"): `levels` here is one building's.
import type { Id, Level, Mass, Project } from '../model/schema.ts'
import { allLevels, buildingOf } from './buildings.ts'

/** How tall a level's stack is: its height × its repeats (m). */
export const levelSpan = (l: Level): number => l.height * l.repeat

/** Where its stack ends: the floor of a level that sits right on it (m). */
export const levelTop = (l: Level): number => l.elevation + levelSpan(l)

/** Its whole stack is at or under the site's ground (0): it counts in the floor area, not in the coverage. */
export const isBasement = (l: Level): boolean => levelTop(l) <= 1e-9

/** The levels from the lowest up (a new array). */
/** m: two elevations this close are one (a level "at" a height). */
export const SAME_ELEVATION = 0.005

/** The level of these whose floor is at that elevation, if one is. */
export const levelAt = (levels: Level[], elevation: number): Level | undefined => levels.find((l) => Math.abs(l.elevation - elevation) <= SAME_ELEVATION)

export function levelsByElevation(levels: Level[]): Level[] {
  return [...levels].sort((a, b) => a.elevation - b.elevation)
}

/** The ground floor: the lowest level above ground (all below it: the highest). Where a mass goes when no level is said. */
export function groundLevel(levels: Level[]): Level {
  const up = levelsByElevation(levels)
  return up.find((l) => !isBasement(l)) ?? up[up.length - 1]
}

/** The level a mass stands on (its own, or its building's ground floor if it names none that exists). */
export function levelOf(p: Project, m: Pick<Mass, 'levelId'>): Level {
  return allLevels(p).find((l) => l.id === m.levelId) ?? groundLevel(buildingOf(p, m).levels)
}

/** Where a mass's stack starts and ends (m): from its level's floor to the top of its last copy when the level repeats. */
export function massSpan(p: Project, m: Pick<Mass, 'levelId' | 'height'>): [number, number] {
  const l = levelOf(p, m)
  return [l.elevation, l.elevation + l.height * (l.repeat - 1) + massHeight(p, m)]
}

/** A mass's height: its own, or its level's (m). */
export function massHeight(p: Project, m: Pick<Mass, 'levelId' | 'height'>): number {
  return m.height ?? levelOf(p, m).height
}

/** That level if it exists; else the ground floor of the first building (where something goes when no level is said). */
export function levelOrGround(p: Project, levelId: Id | null | undefined): Id {
  return levelId && allLevels(p).some((l) => l.id === levelId) ? levelId : groundLevel(p.buildings[0].levels).id
}

// ---- Levels follow the masses (Decision "Levels follow the masses") ------------------------------------------------

/** m: a level this near another's floor, and not on it, may mean that floor: the app asks (*Same floor*). */
export const SAME_FLOOR = 0.5

/** The level of these whose floor is within SAME_FLOOR of this one's, not on it (the nearest), if one is. */
export function nearFloor(levels: Level[], level: Level): Level | null {
  const near = levels
    .filter((l) => l.id !== level.id)
    .map((l) => ({ l, d: Math.abs(l.elevation - level.elevation) }))
    .filter(({ d }) => d > SAME_ELEVATION && d <= SAME_FLOOR + 1e-9)
    .sort((a, b) => a.d - b.d)[0]
  return near?.l ?? null
}

/**
 * The levels the masses make: in each building, levels at one elevation become one (the one with the most masses
 * stays, the first on a tie; the others' masses, dimensions and notes go onto it), and a level with no masses goes, with its
 * dimensions and notes. A building keeps one level at least: with no masses at all, its lowest. Nothing to tidy: the same project.
 */
export function tidyLevels(p: Project): Project {
  const count = new Map<Id, number>()
  for (const m of p.masses) count.set(m.levelId, (count.get(m.levelId) ?? 0) + 1)
  const onto = new Map<Id, Id>() // a level that joins another → that one
  const gone = new Set<Id>() // levels that go, joined or empty
  let changed = false
  const buildings = p.buildings.map((b) => {
    // the fullest first, so it is the one that stays (sort is stable: the first on a tie)
    const stays: Level[] = []
    for (const l of [...b.levels].sort((x, y) => (count.get(y.id) ?? 0) - (count.get(x.id) ?? 0))) {
      const same = stays.find((k) => Math.abs(k.elevation - l.elevation) <= SAME_ELEVATION)
      if (same) {
        onto.set(l.id, same.id)
        count.set(same.id, (count.get(same.id) ?? 0) + (count.get(l.id) ?? 0))
        gone.add(l.id)
      } else stays.push(l)
    }
    const full = stays.filter((l) => (count.get(l.id) ?? 0) > 0)
    const kept = new Set((full.length > 0 ? full : [levelsByElevation(stays)[0]]).map((l) => l.id))
    for (const l of stays) if (!kept.has(l.id)) gone.add(l.id)
    if (kept.size === b.levels.length) return b
    changed = true
    return { ...b, levels: b.levels.filter((l) => kept.has(l.id)) }
  })
  if (!changed) return p
  const moved = (levelId: Id) => onto.get(levelId) ?? levelId
  const dimensions = p.dimensions?.flatMap((d) => {
    const to = moved(d.levelId)
    if (gone.has(to)) return []
    return to === d.levelId ? [d] : [{ ...d, levelId: to }]
  })
  const notes = p.notes?.flatMap((n) => {
    const to = moved(n.levelId)
    if (gone.has(to)) return []
    return to === n.levelId ? [n] : [{ ...n, levelId: to }]
  })
  return {
    ...p,
    buildings,
    ...(onto.size > 0 ? { masses: p.masses.map((m) => (onto.has(m.levelId) ? { ...m, levelId: moved(m.levelId) } : m)) } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(notes ? { notes } : {}),
  }
}
