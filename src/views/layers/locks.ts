// What a locked object is to the views (Phase AS.3; the user, 2026-11-13: the padlock is CAD's): seen, not picked on the plan
// or in the 3D, not changed; picked from its row in a tree alone. A mass is locked by its own flag or by its building's, and (Phase AS.4,
// Decision "Padlocks by kind") a street, a lot and a gate by theirs: `kinds/locked.ts` says it for a `Ref`, so everything a mass had here
// is the same for the five kinds, written once, over `Ref`s (a mass is still asked by its id: every caller of the masses' own helpers
// keeps its signature). The one place the views read a lock and word it:
//   isRefLocked / isMassLocked   whether this object (a ref, or a mass by its id) is locked
//   lockedAmong                  which of these are locked (refs in, refs out; mass ids in, masses out)
//   pickUnlocked                 what a pick that is not a tree's row may take among these (Go to an issue, Select the masses, the plan's
//                                window): the unlocked ones, with the notice when they are all locked
//   tellLockedPick               a click on a locked object: nothing is picked, the notice says where it comes off
//   keptByLock                   a verb that skipped locked objects, and why (a notice for the view that called it)
//   LOCKED_TITLE                 the reason a locked object's field shows as its title
//   lockedFirst                  the reason a Delete is off while a locked object would go with it (a menu's or a button's title)
//   nameOfRef                    what a person calls the object, for those notices
//   holdingBuilding / heldByBuilding   a mass or a level a locked building holds (its own flag frees nothing: the building's padlock does), and the one wording of that: the
//                                row's padlock, the menu's Unlock and Ctrl+Shift+L say it
// The dimension's lock is not this: it fixes a length (state/dimensionAnchors.ts), and says so.
import { kindOf } from '../../kinds/index.ts'
import { buildingLocked, isLocked, massIsLocked } from '../../kinds/locked.ts'
import type { Ref } from '../../kinds/types.ts'
import { noteName, referenceLineName } from '../../engine/annotations.ts'
import { buildingOf, buildingOfLevel } from '../../engine/buildings.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import type { Building, Id, Mass } from '../../model/schema.ts'
import { LOCKED } from '../../model/picked.ts'
import { useApp } from '../../state/store.ts'
import { useToast } from '../layout/toast.ts'

/** The reason a locked object's field is disabled, as its title. */
export const LOCKED_TITLE = 'Locked: unlock it to change it'

type Item = Id | Ref
const asRef = (x: Item): Ref => (typeof x === 'string' ? { kind: 'mass', id: x } : x)

/** What a Delete says (as its title) when `n` locked objects would go with it: the verb refuses it whole. `kind`: the kind's id (masses unless said); `things`: of several kinds. */
export function lockedFirst(n: number, kind = 'mass'): string {
  const k = kindOf(kind)
  const one = (k?.label ?? 'thing').toLowerCase()
  const many = (k?.plural ?? 'things').toLowerCase()
  return n === 1 ? `A locked ${one}: unlock first` : `${n} locked ${many}: unlock first`
}

/** Whether the object is locked (false for one that is not in the project), in the option in view. */
export function isRefLocked(ref: Ref): boolean {
  const { project, option } = useApp.getState()
  return isLocked(project, ref, option)
}

/** Whether the mass is locked (false for one that is not in the project). */
export const isMassLocked = (id: Id): boolean => isRefLocked({ kind: 'mass', id })

/** The locked ones among these: the masses for a list of mass ids (as ever), the refs for a list of refs. */
export function lockedAmong(ids: Id[]): Mass[]
export function lockedAmong(refs: Ref[]): Ref[]
export function lockedAmong(items: Item[]): (Mass | Ref)[] {
  if (items.every((x) => typeof x === 'string')) {
    const p = useApp.getState().project
    return p.masses.filter((m) => items.includes(m.id) && massIsLocked(p, m))
  }
  return (items as Ref[]).filter(isRefLocked)
}

/**
 * The objects of these that a pick that is not a tree's row may take: the unlocked ones (the same kind of list that came in: mass ids or
 * refs). All locked (and some asked): none, and the notice says where the lock comes off, as a click on a locked object does.
 */
export function pickUnlocked<T extends Item>(items: T[]): T[] {
  const free = items.filter((x) => !isRefLocked(asRef(x)))
  if (items.length > 0 && free.length === 0) tellLockedPick()
  return free
}

/** A click on a locked object (the plan's, the 3D's): it picks nothing, and the notice says where the lock comes off. */
export function tellLockedPick(): void {
  useToast.getState().show('info', LOCKED)
}

/** The locked building that holds this mass or level (its own flag is on), if any: unlocking the mass or the level alone frees nothing. */
export function holdingBuilding(ref: Ref): Building | undefined {
  const { project } = useApp.getState()
  let b: Building | undefined
  if (ref.kind === 'mass') {
    const m = project.masses.find((x) => x.id === ref.id)
    b = m && buildingOf(project, m)
  } else if (ref.kind === 'level') b = buildingOfLevel(project, ref.id)
  return b && buildingLocked(project, b.id) ? b : undefined
}

/** Why unlocking a mass or a level does nothing while its building is locked, and where the lock comes off. */
export const heldByBuilding = (what: string, building: string): string => `${what} is locked with its building: unlock ${building} to free it.`

/** What a person calls this object: a mass, a lot, a building, a level, an existing road by its name, a gate or a street by its number among the option's, a reference line by its place among the project's, a note by its first words, a drawing by its file; else its kind. */
export function nameOfRef(ref: Ref): string {
  const { project, derived, option } = useApp.getState()
  if (ref.kind === 'mass') return project.masses.find((m) => m.id === ref.id)?.name ?? 'Mass'
  if (ref.kind === 'lot') return project.options.find((o) => o.id === option)?.lots?.find((l) => l.id === ref.id)?.name ?? 'Lot'
  if (ref.kind === 'gate') {
    const i = gatesOf(project, option).findIndex((g) => g.id === ref.id)
    return i < 0 ? 'Gate' : `Gate ${i + 1}`
  }
  if (ref.kind === 'street') {
    const i = [...new Set(derived.circulation.roads.filter((r) => r.kind === 'street').map((r) => r.street ?? r.id))].indexOf(ref.id)
    return i < 0 ? 'Street' : `Street ${i + 1}`
  }
  if (ref.kind === 'building') return project.buildings.find((b) => b.id === ref.id)?.name ?? 'Building'
  if (ref.kind === 'level') return project.buildings.flatMap((b) => b.levels).find((l) => l.id === ref.id)?.name ?? 'Level'
  if (ref.kind === 'existing-road') return project.site.existingRoads?.find((r) => r.id === ref.id)?.name ?? kindOf(ref.kind)!.label
  if (ref.kind === 'reference-line') {
    const i = project.referenceLines?.findIndex((r) => r.id === ref.id) ?? -1
    return i < 0 ? 'Reference line' : referenceLineName(i)
  }
  if (ref.kind === 'note') return noteName(project.notes?.find((n) => n.id === ref.id)?.text ?? '')
  if (ref.kind === 'drawing') return ref.file ?? ref.id
  if (ref.kind === 'drawing-layer') return ref.id
  return kindOf(ref.kind)?.label ?? 'Thing'
}

/** What these locked objects are called together: their kind's plural (one kind) or "things", and the singular for one. */
function termOf(locked: (Mass | Ref)[]): { one: string; many: string } {
  const kinds = new Set(locked.map((x) => ('kind' in x ? x.kind : 'mass')))
  const k = kinds.size === 1 ? kindOf([...kinds][0]) : undefined
  return { one: (k?.label ?? 'thing').toLowerCase(), many: (k?.plural ?? 'things').toLowerCase() }
}

/**
 * A verb left locked objects as they were: `what` is what it would have changed ("program", "group"…), `rest` how many
 * other objects it did change (none: it changed nothing at all).
 */
export function keptByLock(locked: (Mass | Ref)[], what: string, rest = 0): string {
  const n = locked.length
  const { one, many } = termOf(locked)
  if (rest === 0) return n === 1 ? `${'kind' in locked[0] ? nameOfRef(locked[0]) : locked[0].name} is locked: unlock it to change its ${what}.` : `${n} locked ${many}: unlock them to change their ${what}.`
  return `${n} locked ${n === 1 ? `${one} kept its ${what}` : `${many} kept their ${what}`}: unlock ${n === 1 ? 'it' : 'them'} to change ${n === 1 ? 'it' : 'them'}.`
}

/** Tells it, as an info notice. */
export function tellKept(locked: (Mass | Ref)[], what: string, rest = 0): void {
  if (locked.length > 0) useToast.getState().show('info', keptByLock(locked, what, rest))
}
