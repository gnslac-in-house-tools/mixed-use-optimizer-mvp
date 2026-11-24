// Level actions (Decision "Levels"; port of Plaza-Practiko `estado/acciones/niveles.ts`, `agregarNivelExtremo` of
// `vistas/paneles/pestanas/sitio/agregarNivel.ts`, and `nivelLibre` / `duplicarMasa` / `moverANivel` of
// `estado/acciones/transformar.ts`). Pure, like the mass actions; nothing changed → the same project. A level with
// masses, or its building's only one, is not removed.
// Levels belong to a building (Decision "Buildings and options"): a verb works on the levels of the building that holds
// the level (or the mass) it is given; a new level gets an id unique in the whole project.
import { lockedMassIds, massIsLocked } from '../../model/locks.ts'
import type { Dimension, Id, Level, Mass, Point, Project } from '../../model/schema.ts'
import { allLevels, buildingOf, buildingOfLevel } from '../../engine/buildings.ts'
import { intersection, regionsArea } from '../../engine/geom/boolean.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { isBasement, levelAt, levelOf, levelSpan, levelTop, levelsByElevation, massHeight } from '../../engine/levels.ts'
import { copyMass, isBlockMass, newId, removeMasses } from './masses.ts'

/** m²: two masses sharing less than this only touch (Practiko's `TRASLAPE_MIN`). */
const OVERLAP_MIN = 0.01
/** m: a level this close to another's top sits on it. */
const EPS = 1e-6

/** To the micrometre: a sum of elevations does not drift (4.5 + 5 stays 9.5). */
const round = (v: number) => Math.round(v * 1e6) / 1e6

function valid(l: Omit<Level, 'id'>): boolean {
  return (
    l.name.trim() !== '' &&
    Number.isFinite(l.elevation) &&
    Number.isFinite(l.height) &&
    l.height > 0 &&
    Number.isInteger(l.repeat) &&
    l.repeat >= 1
  )
}

/** A name not taken: `L<n>` upwards, `B<n>` (a basement) downwards, after the highest one in use. */
function levelName(levels: Level[], direction: 1 | -1): string {
  const prefix = direction > 0 ? 'L' : 'B'
  const nums = levels.map((l) => new RegExp(`^${prefix}(\\d+)$`).exec(l.name)).flatMap((k) => (k ? [Number(k[1])] : []))
  const taken = new Set(levels.map((l) => l.name))
  let k = nums.length ? Math.max(...nums) + 1 : 1
  while (taken.has(`${prefix}${k}`)) k++
  return `${prefix}${k}`
}

/** The project with building `buildingId`'s levels replaced. */
export function withLevels(p: Project, buildingId: Id, levels: Level[]): Project {
  return { ...p, buildings: p.buildings.map((b) => (b.id === buildingId ? { ...b, levels } : b)) }
}

/** A level id no building uses. */
export const newLevelId = (p: Project) => newId('l', allLevels(p).map((l) => l.id))

/** The level whose stack ends highest. */
const highest = (levels: Level[]) => levels.reduce((a, b) => (levelTop(b) > levelTop(a) ? b : a))

/** The building with that id; absent or unknown, the first one (as a mass with no level goes to the ground floor). */
const buildingFor = (p: Project, id: Id | undefined) => p.buildings.find((b) => b.id === id) ?? p.buildings[0]

/** Adds a level to a building (absent: the first); null when a value is not valid (an empty name, a height ≤ 0, a ×N
 *  that is not a whole number ≥ 1). */
export function addLevel(p: Project, init: Omit<Level, 'id'>, buildingId?: Id): { project: Project; id: Id } | null {
  const b = buildingFor(p, buildingId)
  if (!valid(init)) return null
  const id = newLevelId(p)
  return { project: withLevels(p, b.id, [...b.levels, { ...init, name: init.name.trim(), id }]), id }
}

/** A level on top of the building's highest stack (absent: the first building's), as tall as that level; or under its
 *  lowest one, as tall as it (a basement). `height` (the building's level height, from the Buildings tab) instead. */
export function addLevelAtEnd(p: Project, where: 'above' | 'below', buildingId?: Id, height?: number): { project: Project; id: Id } {
  const b = buildingFor(p, buildingId)
  const id = newLevelId(p)
  const tall = height !== undefined && height > 0 ? height : undefined
  if (where === 'above') {
    const top = highest(b.levels)
    const level: Level = { id, name: levelName(b.levels, 1), elevation: round(levelTop(top)), height: tall ?? top.height, repeat: 1 }
    return { project: withLevels(p, b.id, [...b.levels, level]), id }
  }
  const low = levelsByElevation(b.levels)[0]
  const h = tall ?? low.height
  const level: Level = { id, name: levelName(b.levels, -1), elevation: round(low.elevation - h), height: h, repeat: 1 }
  return { project: withLevels(p, b.id, [level, ...b.levels]), id }
}

/**
 * Changes some fields of a level. A height or ×N that changes its stack keeps the others sitting where they sat: above
 * ground the levels on top of it move by the difference; a basement grows downwards (its top stays, it and the levels
 * under it move down). Its elevation moves it alone. An invalid value changes nothing.
 */
export function updateLevel(p: Project, id: Id, patch: Partial<Omit<Level, 'id'>>): Project {
  const b = buildingOfLevel(p, id)
  const l = b?.levels.find((x) => x.id === id)
  if (!b || !l) return p
  let next: Level = { ...l, ...patch, id, name: (patch.name ?? l.name).trim() }
  if (!valid(next)) return p
  if (next.name === l.name && next.elevation === l.elevation && next.height === l.height && next.repeat === l.repeat) return p
  const shift = levelSpan(next) - levelSpan(l)
  if (shift === 0) return withLevels(p, b.id, b.levels.map((x) => (x.id === id ? next : x)))
  const down = isBasement(l)
  if (down && patch.elevation === undefined) next = { ...next, elevation: round(l.elevation - shift) }
  const levels = b.levels.map((x) => {
    if (x.id === id) return next
    if (!down && x.elevation >= levelTop(l) - EPS) return { ...x, elevation: round(x.elevation + shift) }
    if (down && levelTop(x) <= l.elevation + EPS) return { ...x, elevation: round(x.elevation - shift) }
    return x
  })
  return withLevels(p, b.id, levels)
}

/** Removes a level with no masses (not its building's only one); its dimensions and notes go with it. */
export function removeLevel(p: Project, id: Id): Project {
  const b = buildingOfLevel(p, id)
  if (!b || b.levels.length <= 1) return p
  if (p.masses.some((m) => m.levelId === id)) return p
  return {
    ...withLevels(p, b.id, b.levels.filter((l) => l.id !== id)),
    ...(p.dimensions ? { dimensions: p.dimensions.filter((d) => d.levelId !== id) } : {}),
    ...(p.notes ? { notes: p.notes.filter((n) => n.levelId !== id) } : {}),
  }
}

/**
 * Removes levels with their masses, dimensions and notes (Decision "Lists select in runs": several at once, from a level's menu in
 * Layers). A building keeps one level at least: levels that would leave one with none are refused (the project
 * comes back as it was).
 */
export function removeLevels(p: Project, ids: Id[]): Project {
  const gone = new Set(ids)
  let next = p
  for (const b of p.buildings) {
    if (!b.levels.some((l) => gone.has(l.id))) continue
    const left = b.levels.filter((l) => !gone.has(l.id))
    if (left.length === 0) return p
    next = withLevels(next, b.id, left)
  }
  if (next === p) return p
  next = removeMasses(next, next.masses.filter((m) => gone.has(m.levelId)).map((m) => m.id))
  return {
    ...next,
    ...(next.dimensions ? { dimensions: next.dimensions.filter((d) => !gone.has(d.levelId)) } : {}),
    ...(next.notes ? { notes: next.notes.filter((n) => !gone.has(n.levelId)) } : {}),
  }
}

function polygonOf(m: Mass): Point[] {
  try {
    return footprintPolygon(m.footprint)
  } catch {
    return []
  }
}

/**
 * The first level of its building above (1) or below (−1) the mass's own where it overlaps no other mass; if there is
 * none, a new one as tall as the mass: above, on top of the highest stack; below, under the lowest level (its
 * elevation minus that height). The project comes back with that new level in it.
 */
function freeLevel(p: Project, m: Mass, direction: 1 | -1): { project: Project; levelId: Id } {
  const own = levelOf(p, m)
  const b = buildingOf(p, m)
  const polygon = polygonOf(m)
  const candidates = b.levels
    .filter((l) => (direction > 0 ? l.elevation > own.elevation : l.elevation < own.elevation))
    .sort((a, b) => direction * (a.elevation - b.elevation))
  const free = candidates.find((l) =>
    p.masses.every(
      (o) =>
        o.id === m.id ||
        o.levelId !== l.id ||
        polygon.length < 3 ||
        regionsArea(intersection([polygon], [polygonOf(o)])) < OVERLAP_MIN,
    ),
  )
  if (free) return { project: p, levelId: free.id }
  const height = massHeight(p, m)
  const id = newLevelId(p)
  const name = levelName(b.levels, direction)
  if (direction > 0) {
    const level = { id, name, elevation: round(levelTop(highest(b.levels))), height, repeat: 1 }
    return { project: withLevels(p, b.id, [...b.levels, level]), levelId: id }
  }
  const low = levelsByElevation(b.levels)[0]
  return { project: withLevels(p, b.id, [{ id, name, elevation: round(low.elevation - height), height, repeat: 1 }, ...b.levels]), levelId: id }
}

/** A copy of the mass on the first free level above (1) or below (−1); if there is none, on a new one. Null for a block's hall: a block is a building of its own, its levels its building's. */
export function copyMassToLevel(p: Project, massId: Id, direction: 1 | -1): { project: Project; id: Id; levelId: Id } | null {
  const m = p.masses.find((x) => x.id === massId)
  if (!m || isBlockMass(p, m)) return null
  const { project, levelId } = freeLevel(p, m, direction)
  const r = copyMass(project, m, { x: 0, y: 0 }, levelId)
  return { project: r.project, id: r.id, levelId }
}

/** The dimension without its ends on that mass (they keep their place, no longer following it). */
export function release(d: Dimension, massId: Id): Dimension {
  if (d.anchorA?.massId !== massId && d.anchorB?.massId !== massId) return d
  const { anchorA, anchorB, ...rest } = d
  return {
    ...rest,
    ...(anchorA && anchorA.massId !== massId ? { anchorA } : {}),
    ...(anchorB && anchorB.massId !== massId ? { anchorB } : {}),
  }
}

/**
 * The mass to the first free level above (1) or below (−1); if there is none, to a new one. The dimensions of the
 * level it leaves let go of it.
 */
export function moveMassToLevel(p: Project, massId: Id, direction: 1 | -1): { project: Project; levelId: Id } | null {
  const m = p.masses.find((x) => x.id === massId)
  // a locked mass stays where it stands (the padlock is CAD's)
  if (!m || massIsLocked(p, m)) return null
  const { project, levelId } = freeLevel(p, m, direction)
  return {
    project: {
      ...project,
      masses: p.masses.map((x) => (x.id === massId ? { ...x, levelId } : x)),
      ...(p.dimensions ? { dimensions: p.dimensions.map((d) => release(d, massId)) } : {}),
    },
    levelId,
  }
}

/**
 * The masses to the level of their building whose floor is at `elevation` (the 3D gumball's up and down, Decision
 * "Gumball"); the dimensions of the levels they leave let go of them. A level all of whose masses move, where its
 * building has no level, goes with them, its dimensions too (Decision "Levels follow the masses"). Else, a building
 * with no level there: null, unless `create`, which adds one there to it (as tall as the level its first mass leaves;
 * named L<n>, or B<n> under the ground). The levels they leave empty go when the edit is settled (tidyLevels).
 * Nothing to move: the same project. A locked mass is not moved.
 */
export function moveMassesToElevation(p: Project, all: Id[], elevation: number, create = false): Project | null {
  // a locked mass stays where it stands (the padlock is CAD's): it is not among them
  const locked = new Set(lockedMassIds(p))
  const ids = all.filter((id) => !locked.has(id))
  const moving = p.masses.filter((m) => ids.includes(m.id))
  let next = p
  for (const levelId of new Set(moving.map((m) => m.levelId))) {
    const b = buildingOfLevel(next, levelId)
    if (!b || levelAt(b.levels, elevation) || next.masses.some((m) => m.levelId === levelId && !ids.includes(m.id))) continue
    next = withLevels(next, b.id, b.levels.map((l) => (l.id === levelId ? { ...l, elevation: round(elevation) } : l)))
  }
  const to = new Map<Id, Id>()
  for (const m of moving) {
    const b = buildingOf(next, m)
    const there = levelAt(b.levels, elevation)
    if (there) {
      to.set(m.id, there.id)
      continue
    }
    if (!create) return null
    const id = newLevelId(next)
    const level: Level = { id, name: levelName(b.levels, elevation < 0 ? -1 : 1), elevation: round(elevation), height: levelOf(next, m).height, repeat: 1 }
    next = withLevels(next, b.id, [...b.levels, level])
    to.set(m.id, id)
  }
  const moved = moving.filter((m) => to.get(m.id) !== m.levelId)
  if (moved.length === 0) return next
  const gone = new Set(moved.map((m) => m.id))
  return {
    ...next,
    masses: next.masses.map((m) => (gone.has(m.id) ? { ...m, levelId: to.get(m.id)! } : m)),
    ...(next.dimensions ? { dimensions: next.dimensions.map((d) => moved.reduce((x, m) => release(x, m.id), d)) } : {}),
  }
}
