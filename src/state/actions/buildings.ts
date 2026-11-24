// Building and option actions (Decision "Buildings and options"). Pure, like the rest: nothing changed → the same
// project. A building is a named group of masses with its own levels; an option is the buildings it shows, and a
// building in several options is the same one (linked) until it is made unique.
//   buildings  addBuilding · updateBuilding · removeBuilding · assignMasses · makeBuildingUnique
//   options    addOption · renameOption · duplicateOption · importOption · removeOption · addBuildingToOption ·
//              moveBuildingInOption · removeBuildingFromOption
import { buildingColor } from '../../model/buildingColors.ts'
import type { Building, DesignOption, Dimension, Id, Level, Note, Project } from '../../model/schema.ts'
import { buildingOf } from '../../engine/buildings.ts'
import { groupIdsIn } from '../../engine/groups.ts'
import { massIsLocked, setLocked } from '../../model/locks.ts'
import { newLevelId, release } from './levels.ts'
import { copyName, newId } from './masses.ts'

/** m: two elevations this close are the same floor. */
const EPS = 1e-6

/** `<base> <n>`, the first n not taken. */
function nextName(taken: string[], base: string): string {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

// ---- Buildings ---------------------------------------------------------------------------------------------------

/**
 * A new building with one level, L1 at the ground, as tall as the first building's typical level; the next colour.
 * With `optionId`, it joins that option. Returns its id and its level's.
 */
export function addBuilding(p: Project, init: { name?: string; optionId?: Id } = {}): { project: Project; id: Id; levelId: Id } {
  const id = newId('b', p.buildings.map((b) => b.id))
  const levelId = newLevelId(p)
  const height = p.buildings[0].levelHeight
  const building: Building = {
    id,
    name: init.name?.trim() || nextName(p.buildings.map((b) => b.name), 'Building'),
    color: buildingColor(p.buildings.length),
    levelHeight: height,
    levels: [{ id: levelId, name: 'L1', elevation: 0, height, repeat: 1 }],
  }
  const options = p.options.map((o) => (o.id === init.optionId ? { ...o, buildingIds: [...o.buildingIds, id] } : o))
  return { project: { ...p, buildings: [...p.buildings, building], options }, id, levelId }
}

/** Changes its name, colour, typical level height or *Context*. An empty name or a height ≤ 0 changes nothing. */
export function updateBuilding(p: Project, id: Id, patch: Partial<Pick<Building, 'name' | 'color' | 'levelHeight' | 'context'>>): Project {
  const b = p.buildings.find((x) => x.id === id)
  if (!b) return p
  const name = patch.name === undefined ? b.name : patch.name.trim()
  const levelHeight = patch.levelHeight ?? b.levelHeight
  if (!name || !(levelHeight > 0)) return p
  const { context: _, ...rest } = b
  const context = patch.context ?? b.context === true
  const next: Building = { ...rest, name, color: patch.color ?? b.color, levelHeight, ...(context ? { context: true } : {}) }
  const same = next.name === b.name && next.color === b.color && next.levelHeight === b.levelHeight && context === (b.context === true)
  return same ? p : { ...p, buildings: p.buildings.map((x) => (x.id === id ? next : x)) }
}

/**
 * Removes a building (not the only one): its levels and their dimensions and notes go, and every option lets go of it. One with
 * masses stays, unless `withMasses`: then its masses go too (a locked one refuses it, as any delete).
 */
export function removeBuilding(p: Project, id: Id, withMasses = false): Project {
  const b = p.buildings.find((x) => x.id === id)
  if (!b || p.buildings.length <= 1) return p
  const levels = new Set(b.levels.map((l) => l.id))
  const own = p.masses.some((m) => levels.has(m.levelId))
  if (own && !withMasses) return p
  return {
    ...p,
    buildings: p.buildings.filter((x) => x.id !== id),
    ...(own ? { masses: p.masses.filter((m) => !levels.has(m.levelId)) } : {}),
    options: p.options.map((o) => {
      if (!o.buildingIds.includes(id)) return o
      return { ...o, buildingIds: o.buildingIds.filter((x) => x !== id) }
    }),
    ...(p.dimensions ? { dimensions: p.dimensions.filter((d) => !levels.has(d.levelId)) } : {}),
    ...(p.notes ? { notes: p.notes.filter((n) => !levels.has(n.levelId)) } : {}),
  }
}

/** Whether a building has masses. */
const hasMasses = (p: Project, b: Building) => {
  const levels = new Set(b.levels.map((l) => l.id))
  return p.masses.some((m) => levels.has(m.levelId))
}

/**
 * No empty layers (Decision "No empty buildings"; the user: "the empty layers of objects that no longer exist should
 * not appear"): the buildings that had masses in `before` and have none in `after` go, as removeBuilding takes them;
 * without `before` (a project read), every building without masses. One that is the only building of an option it is
 * in stays (the option keeps a building to draw in), and so does the project's last. A building just made with
 * *+ Building* never had masses: it stays.
 */
export function withoutEmptyBuildings(after: Project, before?: Project): Project {
  const emptied = after.buildings.filter((b) => {
    if (hasMasses(after, b)) return false
    if (!before) return true
    const was = before.buildings.find((x) => x.id === b.id)
    return was !== undefined && hasMasses(before, was)
  })
  return emptied.reduce((q, b) => {
    const alone = q.options.some((o) => o.buildingIds.length === 1 && o.buildingIds[0] === b.id)
    return alone ? q : removeBuilding(q, b.id)
  }, after)
}

/**
 * Masses into a building (the Buildings panel's *Assign*). Each lands on the target's level with the same name, else
 * the one at the same elevation, else a new one like the level it leaves (so it stays where it was, in plan and in
 * height). With `optionId`, the building joins that option if it was not in it. The dimensions it leaves let go of
 * it. Masses already in that building stay as they are, and so do the locked ones (the padlock is CAD's: a locked mass
 * is not moved to another building's level).
 */
export function assignMasses(p: Project, massIds: Id[], buildingId: Id, optionId?: Id): Project {
  const target = p.buildings.find((b) => b.id === buildingId)
  if (!target) return p
  let levels = target.levels
  const moved = new Map<Id, Id>() // mass → its new level
  for (const id of massIds) {
    const m = p.masses.find((x) => x.id === id)
    if (!m || massIsLocked(p, m) || buildingOf(p, m).id === buildingId) continue
    const from = buildingOf(p, m).levels.find((l) => l.id === m.levelId)
    if (!from) continue
    let to = levels.find((l) => l.name === from.name) ?? levels.find((l) => Math.abs(l.elevation - from.elevation) < EPS)
    if (!to) {
      const taken = new Set([...p.buildings.flatMap((b) => b.levels.map((l) => l.id)), ...levels.map((l) => l.id)])
      const level: Level = { ...from, id: newId('l', taken) }
      levels = [...levels, level]
      to = level
    }
    moved.set(id, to.id)
  }
  const option = p.options.find((o) => o.id === optionId)
  const joins = option && !option.buildingIds.includes(buildingId)
  if (moved.size === 0 && !joins) return p
  return {
    ...p,
    buildings: levels === target.levels ? p.buildings : p.buildings.map((b) => (b.id === buildingId ? { ...b, levels } : b)),
    options: joins ? p.options.map((o) => (o.id === optionId ? { ...o, buildingIds: [...o.buildingIds, buildingId] } : o)) : p.options,
    masses: p.masses.map((m) => (moved.has(m.id) ? { ...m, levelId: moved.get(m.id)! } : m)),
    ...(p.dimensions ? { dimensions: p.dimensions.map((d) => [...moved.keys()].reduce((x, id) => release(x, id), d)) } : {}),
  }
}

/**
 * The building in `optionId` stops being shared: that option gets a copy of it (its levels, masses and dimensions, with
 * new ids), named "<building> · <option>"; the other options keep the original. Null when the building is not in that
 * option or no other option shows it (it is unique already).
 */
export function makeBuildingUnique(p: Project, buildingId: Id, optionId: Id): { project: Project; id: Id } | null {
  const b = p.buildings.find((x) => x.id === buildingId)
  const option = p.options.find((o) => o.id === optionId)
  if (!b || !option?.buildingIds.includes(buildingId)) return null
  if (!p.options.some((o) => o.id !== optionId && o.buildingIds.includes(buildingId))) return null
  const { project, id } = cloneBuilding(p, b, { name: `${b.name} · ${option.name}` })
  return { project: { ...project, options: project.options.map((o) => (o.id === optionId ? { ...o, buildingIds: o.buildingIds.map((x) => (x === buildingId ? id : x)) } : o)) }, id }
}

/**
 * A copy of the building of its own (Decision "Alt+drag copies": a building Alt+dragged in the Buildings tree), not
 * linked: its levels, masses and dimensions with new ids, named "<building> copy", in the next colour. It joins
 * `optionId` at `index` of its list (absent: last). Null when the building or the option is not there.
 */
export function copyBuilding(p: Project, buildingId: Id, optionId: Id, index?: number): { project: Project; id: Id } | null {
  const b = p.buildings.find((x) => x.id === buildingId)
  if (!b || !p.options.some((o) => o.id === optionId)) return null
  const made = cloneBuilding(p, b, { name: copyName(p.buildings.map((x) => x.name), b.name), color: buildingColor(p.buildings.length) })
  return { project: addBuildingToOption(made.project, optionId, made.id, index), id: made.id }
}

/**
 * The building copied into the project with new ids (its levels, its masses and their groups, its dimensions and their
 * anchors, its notes), in no option yet; `look` names (and colours) the copy. Its masses and dimensions are read in `from`
 * (another project with the same building: a specimen), the project itself by default.
 */
function cloneBuilding(p: Project, b: Building, look: Pick<Building, 'name'> & Partial<Pick<Building, 'color'>>, from: Project = p): { project: Project; id: Id } {
  const id = newId('b', p.buildings.map((x) => x.id))
  const levelIds = new Map<Id, Id>()
  const takenLevels = p.buildings.flatMap((x) => x.levels.map((l) => l.id))
  for (const l of b.levels) {
    const nid = newId('l', [...takenLevels, ...levelIds.values()])
    levelIds.set(l.id, nid)
  }
  const massIds = new Map<Id, Id>()
  // its masses' groups are groups of the copy's own (Decision "Groups")
  const groupIds = new Map<Id, Id>()
  // (the first free among every kind's: a group may hold a street, a note…)
  const takenGroups = groupIdsIn(p)
  const copies = from.masses
    .filter((m) => levelIds.has(m.levelId))
    .map((m) => {
      const nid = newId('m', [...p.masses.map((x) => x.id), ...massIds.values()])
      massIds.set(m.id, nid)
      if (m.group !== undefined && !groupIds.has(m.group)) groupIds.set(m.group, newId('g', [...takenGroups, ...groupIds.values()]))
      return { ...m, id: nid, levelId: levelIds.get(m.levelId)!, ...(m.group !== undefined ? { group: groupIds.get(m.group)! } : {}) }
    })
  const dims = p.dimensions ?? []
  const dimIds: Id[] = []
  const dimCopies: Dimension[] = (from.dimensions ?? [])
    .filter((d) => levelIds.has(d.levelId))
    .map((d) => {
      const nid = newId('d', [...dims.map((x) => x.id), ...dimIds])
      dimIds.push(nid)
      const anchor = (k: Dimension['anchorA']) => (k && massIds.has(k.massId) ? { ...k, massId: massIds.get(k.massId)! } : undefined)
      const { anchorA, anchorB, group, ...rest } = d
      const a = anchor(anchorA)
      const c = anchor(anchorB)
      const g = group !== undefined ? groupIds.get(group) : undefined
      return { ...rest, id: nid, levelId: levelIds.get(d.levelId)!, ...(a ? { anchorA: a } : {}), ...(c ? { anchorB: c } : {}), ...(g !== undefined ? { group: g } : {}) }
    })
  // its notes, on the copy's levels; one in a group of masses of this building is in that group's copy, any other group is left behind
  // (a group of one is none)
  const notes = p.notes ?? []
  const noteIds: Id[] = []
  const noteCopies: Note[] = (from.notes ?? [])
    .filter((n) => levelIds.has(n.levelId))
    .map((n) => {
      const nid = newId('t', [...notes.map((x) => x.id), ...noteIds])
      noteIds.push(nid)
      const { group, ...rest } = n
      const g = group !== undefined ? groupIds.get(group) : undefined
      return { ...rest, id: nid, levelId: levelIds.get(n.levelId)!, ...(g !== undefined ? { group: g } : {}) }
    })
  const copy: Building = { ...b, ...look, id, levels: b.levels.map((l) => ({ ...l, id: levelIds.get(l.id)! })) }
  // its steps are its copies' (Decision "Platforms"), with ids of their own
  if (b.platform?.steps) {
    const taken = p.buildings.flatMap((x) => x.platform?.steps?.map((s) => s.id) ?? [])
    const steps = b.platform.steps.flatMap((s) => {
      const masses = s.masses.flatMap((m) => (massIds.has(m) ? [massIds.get(m)!] : []))
      if (!masses.length) return []
      const sid = newId('s', taken)
      taken.push(sid)
      return [{ ...s, id: sid, masses }]
    })
    const { steps: _s, ...platform } = b.platform
    copy.platform = steps.length ? { ...platform, steps } : platform
    if (Object.keys(copy.platform).length === 0) delete copy.platform
  }
  return {
    project: {
      ...p,
      buildings: [...p.buildings, copy],
      masses: [...p.masses, ...copies],
      ...(dimCopies.length ? { dimensions: [...dims, ...dimCopies] } : {}),
      ...(noteCopies.length ? { notes: [...notes, ...noteCopies] } : {}),
    },
    id,
  }
}

// ---- Options -----------------------------------------------------------------------------------------------------

/** A new option ("Option <n>"), with these buildings (none: empty). */
export function addOption(p: Project, init: { name?: string; buildingIds?: Id[] } = {}): { project: Project; id: Id } {
  const id = newId('o', p.options.map((o) => o.id))
  const known = new Set(p.buildings.map((b) => b.id))
  const buildingIds = [...new Set(init.buildingIds ?? [])].filter((b) => known.has(b))
  const name = init.name?.trim() || nextName(p.options.map((o) => o.name), 'Option')
  return { project: { ...p, options: [...p.options, { id, name, buildingIds }] }, id }
}

export function renameOption(p: Project, id: Id, name: string): Project {
  const o = p.options.find((x) => x.id === id)
  const n = name.trim()
  if (!o || !n || n === o.name) return p
  return { ...p, options: p.options.map((x) => (x.id === id ? { ...x, name: n } : x)) }
}

/** An option shown folded under another, in a group of that name (Decision "Stage options"); `undefined`: on its own. */
export function setOptionGroup(p: Project, id: Id, group: { under: Id; name: string } | undefined): Project {
  const o = p.options.find((x) => x.id === id)
  if (!o || id === group?.under || (group && !p.options.some((x) => x.id === group.under))) return p
  if (JSON.stringify(o.group) === JSON.stringify(group)) return p
  return {
    ...p,
    options: p.options.map((x) => {
      if (x.id !== id) return x
      const { group: _, ...rest } = x
      return group ? { ...rest, group: { ...group } } : rest
    }),
  }
}

/** A new option showing the same buildings (linked: the same ones, not copies). */
export function duplicateOption(p: Project, id: Id): { project: Project; id: Id } | null {
  const o = p.options.find((x) => x.id === id)
  if (!o) return null
  const added = addOption(p, { buildingIds: o.buildingIds })
  // its circulation too (Decision "Exterior circulation"): own gates, its streets, its parking (Decision
  // "Circulation optimization"); and its own grid (Decision "Structural grid")
  const { gates, streets, parking, grid } = structuredClone(o)
  const extra = {
    ...(gates ? { gates } : {}),
    ...(streets ? { streets } : {}),
    ...(parking ? { parking } : {}),
    ...(grid ? { grid } : {}),
  }
  if (Object.keys(extra).length === 0) return added
  return { project: { ...added.project, options: added.project.options.map((x) => (x.id === added.id ? { ...x, ...extra } : x)) }, id: added.id }
}

/**
 * Another project's option (a specimen of the optimizer: Decision "Keep a specimen") as an option of this one: copies of
 * its buildings as they are there (levels, masses, dimensions; new ids, not linked), named "<building> · <label>", and
 * its circulation. A new option named "<option> · <label>", or, with `into`, that option shows them instead of its
 * buildings and takes that circulation, its name kept; those of its buildings no other option shows go, with their
 * masses (Decision "No loose buildings"). Null when either is not there.
 */
export function importOption(p: Project, from: Project, optionId: Id, label: string, into?: Id): { project: Project; id: Id } | null {
  const o = from.options.find((x) => x.id === optionId)
  if (!o || (into !== undefined && !p.options.some((x) => x.id === into))) return null
  let q = p
  const ids = new Map<Id, Id>()
  for (const id of o.buildingIds) {
    const b = from.buildings.find((x) => x.id === id)
    if (!b) continue
    const made = cloneBuilding(q, b, { name: `${b.name} · ${label}` }, from)
    q = made.project
    ids.set(id, made.id)
  }
  const cloned = structuredClone(o)
  const { parking, standards } = cloned
  // its streets and gates leave their groups behind: a group's id means something in the project it came from (its masses were copied with groups of their own)
  const ungrouped = <T extends { group?: Id }>(xs: T[]): T[] => xs.map(({ group: _group, ...x }) => x as T)
  const gates = cloned.gates && ungrouped(cloned.gates)
  const streets = cloned.streets && { ...cloned.streets, segments: ungrouped(cloned.streets.segments) }
  // the grid it stood on, as its own when it is not this project's (Decision "Structural grid")
  const stood = o.grid ?? from.grid
  const grid = stood && JSON.stringify(stood) !== JSON.stringify(p.grid) ? structuredClone(stood) : undefined
  const circulation = {
    ...(gates ? { gates } : {}),
    ...(streets ? { streets } : {}),
    ...(parking ? { parking } : {}),
    ...(grid ? { grid } : {}),
    ...(standards ? { standards } : {}),
  }
  const target = into ?? newId('o', q.options.map((x) => x.id))
  const made: DesignOption = { id: target, name: `${o.name} · ${label}`, buildingIds: [...ids.values()], ...circulation }
  if (into === undefined) return { project: { ...q, options: [...q.options, made] }, id: target }
  const before = q.options.find((x) => x.id === into)!.buildingIds
  const replaced = { ...q, options: q.options.map((x) => (x.id === into ? { id: x.id, name: x.name, buildingIds: made.buildingIds, ...circulation } : x)) }
  return { project: withoutUnshown(replaced, before), id: target }
}

/**
 * Removes an option (not the only one), and the buildings no other option shows, with their masses and their levels'
 * dimensions (Decision "No loose buildings": a building lives in an option or not at all).
 */
export function removeOption(p: Project, id: Id): Project {
  const o = p.options.find((x) => x.id === id)
  if (p.options.length <= 1 || !o) return p
  return withoutUnshown({ ...p, options: p.options.filter((x) => x.id !== id) }, o.buildingIds)
}

/** Of these buildings, those no option shows go, with their masses (the project keeps one building at least). */
function withoutUnshown(p: Project, ids: Id[]): Project {
  return ids.reduce((q, b) => (q.options.some((o) => o.buildingIds.includes(b)) ? q : removeBuilding(q, b, true)), p)
}

/** The option shows the building too (linked: the same one), at `index` of its list (absent: last). */
export function addBuildingToOption(p: Project, optionId: Id, buildingId: Id, index?: number): Project {
  const o = p.options.find((x) => x.id === optionId)
  if (!o || o.buildingIds.includes(buildingId) || !p.buildings.some((b) => b.id === buildingId)) return p
  const ids = [...o.buildingIds]
  ids.splice(Math.max(0, Math.min(index ?? ids.length, ids.length)), 0, buildingId)
  return { ...p, options: p.options.map((x) => (x.id === optionId ? { ...x, buildingIds: ids } : x)) }
}

/** A building to another place in its option's list (the tree's order; the first one is where the plan goes). */
export function moveBuildingInOption(p: Project, optionId: Id, buildingId: Id, index: number): Project {
  const o = p.options.find((x) => x.id === optionId)
  const from = o?.buildingIds.indexOf(buildingId) ?? -1
  if (!o || from < 0) return p
  const ids = o.buildingIds.filter((x) => x !== buildingId)
  const to = Math.max(0, Math.min(index, ids.length))
  if (to === from) return p
  ids.splice(to, 0, buildingId)
  return { ...p, options: p.options.map((x) => (x.id === optionId ? { ...x, buildingIds: ids } : x)) }
}

/** The option stops showing the building: it stays in the other options, and with none left it goes, with its masses. */
export function removeBuildingFromOption(p: Project, optionId: Id, buildingId: Id): Project {
  const o = p.options.find((x) => x.id === optionId)
  if (!o || !o.buildingIds.includes(buildingId)) return p
  const q = { ...p, options: p.options.map((x) => (x.id === optionId ? { ...x, buildingIds: x.buildingIds.filter((b) => b !== buildingId) } : x)) }
  return withoutUnshown(q, [buildingId])
}

/**
 * Locks or frees buildings (Decision "Padlocks by kind": a building's padlock is its own flag, not the sum of its masses). A locked
 * building keeps its own data and every mass in it (state/settle.ts), and its masses are locked masses. Freeing it also frees the
 * masses that were locked one by one, so "unlocked" reads unlocked. Nothing to change: the project as it was.
 */
export function lockBuildings(p: Project, ids: Id[], on: boolean): Project {
  const these = new Set(ids)
  const going = p.buildings.filter((b) => these.has(b.id))
  const levels = new Set(going.flatMap((b) => b.levels.map((l) => l.id)))
  const buildings = p.buildings.map((b) => (these.has(b.id) ? setLocked(b, on) : b))
  const masses = on ? p.masses : p.masses.map((m) => (levels.has(m.levelId) ? setLocked(m, false) : m))
  const flagged = buildings.some((b, i) => b !== p.buildings[i])
  const freed = masses.some((m, i) => m !== p.masses[i])
  if (!flagged && !freed) return p
  return { ...p, buildings, masses }
}
