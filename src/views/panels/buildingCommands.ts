// What the Layers tree's Buildings branch, Design › Options and the option switch do (Decisions "Buildings layout", "Layers"). Each
// edit is one undo step through store.apply, made of the building and option verbs; then the view follows it: the active option,
// and the active building (its level). Also why a building cannot be removed or deleted (the last one, an option's only one, a
// locked mass among its masses, or its own padlock: a locked building keeps its data, its masses and its place in each option), for the buttons' and
// the menus' titles. `pickFromRow` is the tree's pick of masses, locked ones
// included; `assign` leaves a locked mass in its building.
import { buildingLocked, massIsLocked } from '../../kinds/locked.ts'
import type { Building, Id, Project } from '../../model/schema.ts'
import { buildingOf, buildingOfLevel } from '../../engine/buildings.ts'
import { groundLevel, nearFloor } from '../../engine/levels.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { massEyeOff, otherMasses } from '../buildingView.ts'
import { building } from '../layers/keys.ts'
import { isHidden, useLayerView } from '../layers/layerView.ts'
import { lockedAmong, lockedFirst, pickUnlocked, tellKept } from '../layers/locks.ts'
import { useCompare } from '../compare/compareView.ts'
import { useToast } from '../layout/toast.ts'
import { showPanel, useUi } from '../layout/ui.ts'
import { letGoAll } from '../plan/mix.ts'

/** apply(f) for a verb that also returns something (a new id): one undo step, and what it returned. */
function applyReturning<T>(f: (p: Project) => { project: Project; value: T } | null): T | undefined {
  const out: { value?: T } = {}
  useApp.getState().apply((p) => {
    const r = f(p)
    if (!r) return p
    out.value = r.value
    return r.project
  })
  return out.value
}

// ---- Going to an option, a building, a mass ---------------------------------------------------------------------

export function goToOption(id: Id) {
  useApp.getState().setOption(id)
}

/** The building becomes the active one (in that option): the plan goes to its ground floor, unless it is there already. */
export function goToBuilding(optionId: Id, b: Building) {
  const s = useApp.getState()
  s.setOption(optionId)
  if (buildingOfLevel(s.project, useApp.getState().level)?.id !== b.id) s.setLevel(groundLevel(b.levels).id)
}

/**
 * *Properties* in a building's menu (Decision "Workspace layout"): it becomes the active one, nothing stays selected,
 * and Properties shows it: the panel's Properties tab, on every width (a sheet below 880 px: Phase AS.3, Decision "Panel tabs").
 */
export function showBuildingProperties(optionId: Id, b: Building) {
  goToBuilding(optionId, b)
  letGoAll()
  useUi.getState().setRail('properties')
  showPanel('left')
}

/**
 * Picks masses from their rows in a tree (in that option): the one way to reach a locked mass, to read it or to take its
 * lock off (the padlock is CAD's: the plan and the 3D do not pick it, `pickOnPlan`). `add`: Ctrl or Shift on one row, it joins
 * the selection or leaves it; else the masses are the selection.
 */
export function pickFromRow(optionId: Id, massIds: Id[], add = false) {
  const s = useApp.getState()
  s.setOption(optionId)
  if (add) for (const id of massIds) s.toggleSelect(id)
  else if (massIds.length === 1) s.select(massIds[0])
  else s.selectMany(massIds)
}

// ---- Options ------------------------------------------------------------------------------------------------------

/** A new option with a building of its own (as a new project starts with one), and it becomes active. */
export function newOption() {
  const made = applyReturning((p) => {
    const o = actions.addOption(p)
    const b = actions.addBuilding(o.project, { optionId: o.id })
    return { project: b.project, value: { option: o.id, level: b.levelId } }
  })
  if (!made) return
  useApp.getState().setOption(made.option)
  useApp.getState().setLevel(made.level)
}

/** A new option with an option's buildings (linked: the same ones; absent: the active one's), and it becomes active. */
export function duplicateActiveOption(of?: Id) {
  const id = applyReturning((p) => {
    const r = actions.duplicateOption(p, of ?? useApp.getState().option)
    return r && { project: r.project, value: r.id }
  })
  if (id) useApp.getState().setOption(id)
}

export function renameOption(id: Id, name: string) {
  useApp.getState().apply((p) => actions.renameOption(p, id, name))
}

/** Compare (B.5): every option side by side; nothing stays selected, nothing is edited while comparing. */
export function compareOptions() {
  useApp.getState().select(null)
  useCompare.getState().start(useApp.getState().project.options.map((o) => o.id))
}

/**
 * Removes an option (not the only one); the store falls to the first. Its buildings no other option shows go with it
 * (Decision "No loose buildings"); with masses, it asks first.
 */
export function removeOption(id: Id) {
  const p = useApp.getState().project
  if (p.options.length <= 1) return
  const run = () => useApp.getState().apply((q) => actions.removeOption(q, id))
  const { buildings, masses } = goingWith(p, id)
  if (masses === 0) return run()
  const what = p.options.find((o) => o.id === id)?.name ?? 'this option'
  useToast.getState().confirm(`Delete ${what}, ${count(buildings, 'building', 'buildings')} and ${count(masses, 'mass', 'masses')}? No other option shows them.`, run)
}

// ---- Buildings ----------------------------------------------------------------------------------------------------

/** A new building in an option (absent: the active one), which becomes active, and the building too (its L1). */
export function newBuilding(optionId?: Id) {
  const option = optionId ?? useApp.getState().option
  const level = applyReturning((p) => {
    const b = actions.addBuilding(p, { optionId: option })
    return { project: b.project, value: b.levelId }
  })
  if (!level) return
  useApp.getState().setOption(option)
  useApp.getState().setLevel(level)
}

/**
 * Hides or shows a building (view state: it still counts). Hiding lets go of its selected masses, which the plan no
 * longer draws, unless it is the active building: the plan always draws that one, where it is edited.
 */
export function toggleHidden(b: Building) {
  const hiding = !isHidden(building(b.id))
  useLayerView.getState().setHidden([building(b.id)], hiding)
  const s = useApp.getState()
  if (!hiding || buildingOfLevel(s.project, s.level)?.id === b.id) return
  const levels = new Set(b.levels.map((l) => l.id))
  const kept = s.selection.massIds.filter((id) => !levels.has(s.project.masses.find((m) => m.id === id)?.levelId ?? ''))
  if (kept.length !== s.selection.massIds.length) s.selectMany(kept)
}

export function updateBuilding(id: Id, patch: Parameters<typeof actions.updateBuilding>[2]) {
  useApp.getState().apply((p) => actions.updateBuilding(p, id, patch))
}

/**
 * After a level lands within SAME_FLOOR of another level's floor of its building, not on it (the gumball, a typed
 * elevation): a quiet notice asks whether it is that floor. *Same floor* puts it there, its masses with it, and the two
 * become one (Decision "Levels follow the masses"); ignored, nothing happens.
 */
export function offerSameFloor(levelId: Id) {
  const p = useApp.getState().project
  const b = buildingOfLevel(p, levelId)
  const l = b?.levels.find((x) => x.id === levelId)
  const near = b && l ? nearFloor(b.levels, l) : null
  if (!l || !near) return
  const d = l.elevation - near.elevation
  useToast.getState().show('info', `${l.name} is ${Math.abs(d).toFixed(2)} m ${d > 0 ? 'above' : 'below'} ${near.name}'s floor. Same floor?`, {
    label: 'Same floor',
    run: () => useApp.getState().apply((q) => actions.updateLevel(q, levelId, { elevation: near.elevation })),
  })
}

/** An option (absent: the active one) gets its own copy of the building; the plan goes to the copy, where it was. */
export function makeUnique(b: Building, optionId?: Id) {
  if (optionId) useApp.getState().setOption(optionId)
  const { option, level } = useApp.getState()
  const at = b.levels.findIndex((l) => l.id === level)
  const copy = applyReturning((p) => {
    const r = actions.makeBuildingUnique(p, b.id, option)
    return r && { project: r.project, value: r.id }
  })
  const made = copy && useApp.getState().project.buildings.find((x) => x.id === copy)
  if (made) useApp.getState().setLevel(made.levels[Math.max(0, at)].id)
}

/**
 * An option (absent: the active one) stops showing it; the plan goes to the option's first building (the store's
 * rule). In no other option, that is deleting it (Decision "No loose buildings"): it asks first, as *Delete* does.
 */
export function removeFromOption(b: Building, optionId?: Id) {
  const option = optionId ?? useApp.getState().option
  if (optionsShowing(useApp.getState().project, b.id).every((o) => o.id === option)) return deleteBuilding(b)
  useApp.getState().apply((p) => actions.removeBuildingFromOption(p, option, b.id))
}

/**
 * Selects a building's masses that the plan shows (Rhino's "Select objects" on a layer): the active level's when it is
 * the active building, else the ones at the active level's height. Its option becomes the active one. Not the locked ones (the
 * padlock is CAD's: they are picked from their rows) nor the ones whose eye is off, or whose building's is. When nothing is left,
 * the selection stays as it was and a notice says why.
 */
export function selectBuildingMasses(optionId: Id, b: Building) {
  const s = useApp.getState()
  s.setOption(optionId)
  const { project, level } = useApp.getState()
  const levels = new Set(b.levels.map((l) => l.id))
  const hidden = useLayerView.getState().hidden
  const shown = hidden.includes(building(b.id))
    ? []
    : (buildingOfLevel(project, level)?.id === b.id
        ? project.masses.filter((m) => m.levelId === level)
        : otherMasses(project, level, optionId, hidden).filter((m) => levels.has(m.levelId))
      ).filter((m) => !massEyeOff(hidden, m.id))
  if (shown.length === 0) return void useToast.getState().show('info', 'Its masses are hidden, or none is at this level')
  const free = pickUnlocked(shown.map((m) => m.id))
  if (free.length > 0) s.selectMany(free)
}

/** Deletes levels with their masses (one undo step); with masses on them, it asks first. `done`: after it has run. */
export function deleteLevels(ids: Id[], done?: () => void) {
  const p = useApp.getState().project
  const gone = new Set(ids)
  const n = p.masses.filter((m) => gone.has(m.levelId)).length
  const run = () => {
    useApp.getState().apply((q) => actions.removeLevels(q, ids))
    done?.()
  }
  if (n === 0) return run()
  const what = ids.length === 1 ? 'this level' : `these ${ids.length} levels`
  useToast.getState().confirm(`Delete ${what} and ${n === 1 ? 'its mass' : `their ${n} masses`}?`, run)
}

/**
 * Deletes a building with its levels; one with masses asks first (they go too), and says which options lose it. One
 * undo step brings it all back.
 */
export function deleteBuilding(b: Building) {
  const p = useApp.getState().project
  const levels = new Set(b.levels.map((l) => l.id))
  const n = p.masses.filter((m) => levels.has(m.levelId)).length
  const run = () => useApp.getState().apply((q) => actions.removeBuilding(q, b.id, true))
  if (n === 0) return run()
  const shown = optionsShowing(p, b.id)
  const where = shown.length > 1 ? ` It is in ${shown.map((o) => o.name).join(' and ')}.` : ''
  useToast.getState().confirm(`Delete ${b.name} and its ${n} ${n === 1 ? 'mass' : 'masses'}?${where}`, run)
}

/**
 * A building dropped in the tree: into an option it was not in (it joins it, linked: the same building), or to
 * another place in its own (the tree's order). `before`: the building it lands before (null: last).
 */
export function dropBuilding(buildingId: Id, optionId: Id, before: Id | null) {
  const p = useApp.getState().project
  const o = p.options.find((x) => x.id === optionId)
  const b = p.buildings.find((x) => x.id === buildingId)
  if (!o || !b) return
  const joins = !o.buildingIds.includes(buildingId)
  const rest = o.buildingIds.filter((x) => x !== buildingId)
  const at = before === null || !rest.includes(before) ? rest.length : rest.indexOf(before)
  useApp.getState().apply((q) =>
    joins ? actions.addBuildingToOption(q, optionId, buildingId, at) : actions.moveBuildingInOption(q, optionId, buildingId, at),
  )
  if (joins) useToast.getState().show('info', `${b.name} is in ${o.name} too: the same building, linked.`)
}

/** What goes with an option (Decision "No loose buildings"): its buildings no other option shows, and their masses. */
function goingWith(p: Project, optionId: Id): { buildings: number; masses: number } {
  const shown = new Set(p.options.filter((o) => o.id !== optionId).flatMap((o) => o.buildingIds))
  const theirs = new Set(p.options.filter((o) => o.id === optionId).flatMap((o) => o.buildingIds))
  const gone = p.buildings.filter((b) => theirs.has(b.id) && !shown.has(b.id))
  const levels = new Set(gone.flatMap((b) => b.levels.map((l) => l.id)))
  return { buildings: gone.length, masses: p.masses.filter((m) => levels.has(m.levelId)).length }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The options that show the building. */
export const optionsShowing = (p: Project, id: Id) => p.options.filter((o) => o.buildingIds.includes(id))

/** Why *Remove from option* is off (null: it can). An option keeps one building at least: the plan edits one; a locked building stays where it is. `b`: the building, to read its padlock. */
export function whyNotRemoveFromOption(p: Project, optionId: Id, b?: Building): string | null {
  const o = p.options.find((x) => x.id === optionId)
  if (o && o.buildingIds.length <= 1) return `The only building of ${o.name}`
  return b && buildingLocked(p, b.id) ? lockedFirst(1, 'building') : null
}

/** How many locked masses stand on these buildings: deleting them would delete those too, and the padlock refuses it, whole (settle.ts). */
function lockedOn(p: Project, bs: Building[]): number {
  const levels = new Set(bs.flatMap((b) => b.levels.map((l) => l.id)))
  return p.masses.filter((m) => massIsLocked(p, m) && levels.has(m.levelId)).length
}

/** Why *Delete* is off (null: it can; its masses go with it, after asking): the last building, or a locked mass among its masses. */
export function whyNotDelete(p: Project, b: Building): string | null {
  if (p.buildings.length <= 1) return 'The only building of the project'
  const alone = p.options.find((o) => o.buildingIds.length === 1 && o.buildingIds[0] === b.id)
  if (alone) return `The only building of ${alone.name}`
  if (buildingLocked(p, b.id)) return lockedFirst(1, 'building')
  const locked = lockedOn(p, [b])
  return locked > 0 ? lockedFirst(locked) : null
}

// ---- Several at once (Decision "Lists select in runs": what Shift or Ctrl picked in the tree) ---------------------

/** Why deleting these buildings together is off (null: it can): the project and every option keep one at least. */
export function whyNotDeleteAll(p: Project, ids: Id[]): string | null {
  if (ids.length >= p.buildings.length) return 'The project keeps one building at least'
  const empty = p.options.find((o) => o.buildingIds.length > 0 && o.buildingIds.every((id) => ids.includes(id)))
  if (empty) return `They are all ${empty.name}'s buildings`
  const own = ids.filter((id) => buildingLocked(p, id)).length
  if (own > 0) return lockedFirst(own, 'building')
  const locked = lockedOn(p, p.buildings.filter((b) => ids.includes(b.id)))
  return locked > 0 ? lockedFirst(locked) : null
}

/** Deletes buildings with their masses, in one undo step; with masses, it asks first. */
export function deleteBuildings(bs: Building[]) {
  if (bs.length === 1) return deleteBuilding(bs[0])
  const p = useApp.getState().project
  const ids = bs.map((b) => b.id)
  const levels = new Set(bs.flatMap((b) => b.levels.map((l) => l.id)))
  const n = p.masses.filter((m) => levels.has(m.levelId)).length
  const run = () => useApp.getState().apply((q) => ids.reduce((r, id) => actions.removeBuilding(r, id, true), q))
  if (n === 0) return run()
  useToast.getState().confirm(`Delete these ${bs.length} buildings and their ${n} ${n === 1 ? 'mass' : 'masses'}?`, run)
}

/**
 * Why taking these buildings out of an option is off (null: it can): it keeps one at least, and the ones no other option shows go
 * with their masses, which a locked one refuses.
 */
export function whyNotRemoveAll(p: Project, optionId: Id, ids: Id[]): string | null {
  const o = p.options.find((x) => x.id === optionId)
  if (o && o.buildingIds.every((id) => ids.includes(id))) return `${o.name} keeps one building at least`
  const own = ids.filter((id) => buildingLocked(p, id)).length
  if (own > 0) return lockedFirst(own, 'building')
  const going = p.buildings.filter((b) => ids.includes(b.id) && optionsShowing(p, b.id).every((x) => x.id === optionId))
  const locked = lockedOn(p, going)
  return locked > 0 ? lockedFirst(locked) : null
}

/**
 * Takes buildings out of an option, in one undo step: those in no other option go, with their masses (Decision "No
 * loose buildings"); with masses, it asks first.
 */
export function removeAllFromOption(bs: Building[], optionId: Id) {
  const p = useApp.getState().project
  const run = () => useApp.getState().apply((q) => bs.reduce((r, b) => actions.removeBuildingFromOption(r, optionId, b.id), q))
  const gone = bs.filter((b) => optionsShowing(p, b.id).every((o) => o.id === optionId))
  const levels = new Set(gone.flatMap((b) => b.levels.map((l) => l.id)))
  const n = p.masses.filter((m) => levels.has(m.levelId)).length
  if (n === 0) return run()
  useToast.getState().confirm(`Delete ${count(gone.length, 'building', 'buildings')} and ${count(n, 'mass', 'masses')}? No other option shows them.`, run)
}

/** Hides them all, or shows them all when all are hidden. */
export function toggleAllHidden(bs: Building[]) {
  const hide = bs.some((b) => !isHidden(building(b.id)))
  for (const b of bs) if (isHidden(building(b.id)) !== hide) toggleHidden(b)
}

// ---- Copies (Decision "Alt+drag copies") ----------------------------------------------------------------------------

/**
 * Masses Alt+dragged onto a building of the option in view: copies of them go into it, in place (on its level of the same
 * name or height, as *Assign*), they are the selection, and a notice says where they are. A block's hall is not a plain
 * mass to put there (Phase D.2: every building's mass is a block): its copy is a new block of its type, a building of its
 * own in the option, in place (`copyWithBlocks`, the copy Duplicate and Paste make); only the other masses go in.
 */
export function copyInto(massIds: Id[], optionId: Id, buildingId: Id) {
  const made = applyReturning((p) => {
    const sources = p.masses.filter((m) => massIds.includes(m.id))
    if (sources.length === 0) return null
    const c = actions.copyWithBlocks(p, sources, { x: 0, y: 0 }, optionId)
    if (c.ids.length === 0) return null
    const loose = c.ids.filter((id) => !actions.isBlockMass(c.project, c.project.masses.find((m) => m.id === id)!))
    return { project: actions.assignMasses(c.project, loose, buildingId, optionId), value: { ids: c.ids, blocks: c.blocks.length, loose: loose.length } }
  })
  const s = useApp.getState()
  const b = s.project.buildings.find((x) => x.id === buildingId)
  const first = made && s.project.masses.find((m) => m.id === made.ids[0])
  if (!made || !b || !first) return
  if (optionId === s.option) {
    s.setLevel(first.levelId)
    if (made.ids.length === 1) s.select(first.id)
    else s.selectMany(made.ids)
  }
  const n = made.blocks
  const name = s.project.masses.find((m) => m.id === massIds[0])?.name ?? 'it'
  const copies = n + made.loose
  const what = copies === 1 ? `A copy of ${name}` : `${copies} copies`
  const where =
    n === 0
      ? `in ${b.name}: in place.`
      : made.loose === 0
        ? `${copies === 1 ? 'is a new block' : 'are new blocks'} of its own, not in ${b.name}: in place.`
        : `in place: ${count(made.loose, 'mass', 'masses')} in ${b.name}, ${count(n, 'new block', 'new blocks')} of their own.`
  useToast.getState().show('info', `${what} ${where}`)
}

/** A building Alt+dragged in the tree: a copy of its own (not linked) joins the option, before `before` (null: last). */
export function copyBuildingInto(buildingId: Id, optionId: Id, before: Id | null) {
  const o = useApp.getState().project.options.find((x) => x.id === optionId)
  if (!o) return
  const at = before === null || !o.buildingIds.includes(before) ? o.buildingIds.length : o.buildingIds.indexOf(before)
  const id = applyReturning((p) => {
    const r = actions.copyBuilding(p, buildingId, optionId, at)
    return r && { project: r.project, value: r.id }
  })
  const made = id && useApp.getState().project.buildings.find((b) => b.id === id)
  if (made) useToast.getState().show('info', `${made.name} is in ${o.name}: a copy of its own, not linked.`)
}

// ---- Assign -------------------------------------------------------------------------------------------------------

/** *Assign*'s building when it makes one. */
export const NEW_BUILDING = 'new'

/**
 * The masses go into a building (a new one: `NEW_BUILDING`) of the option in view, which it joins, and the building becomes the
 * active one. A locked mass stays where it is (the padlock is CAD's) and a notice says so; with only locked ones nothing is
 * made, not even the new building.
 */
export function assign(massIds: Id[], optionId: Id, buildingId: Id) {
  const locked = lockedAmong(massIds)
  if (locked.length === massIds.length) return tellKept(locked, 'building')
  const target = applyReturning((p) => {
    let q = p
    let id = buildingId
    if (id === NEW_BUILDING) {
      const b = actions.addBuilding(q)
      q = b.project
      id = b.id
    }
    return { project: actions.assignMasses(q, massIds, id, optionId), value: id }
  })
  const s = useApp.getState()
  const b = target && s.project.buildings.find((x) => x.id === target)
  const first = massIds.find((id) => !locked.some((m) => m.id === id))
  const m = s.project.masses.find((x) => x.id === first)
  if (b && m && buildingOf(s.project, m).id === b.id && optionId === s.option) s.setLevel(m.levelId)
  // the ones that stayed, said last: it is what the user would not see
  tellKept(locked, 'building', massIds.length - locked.length)
}
