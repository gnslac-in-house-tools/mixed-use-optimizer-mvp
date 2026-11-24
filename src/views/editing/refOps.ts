// How a kind is locked, hidden and renamed (Phase AS.4, Decision "One menu"): one small table by kind, so the commands `edit.lock`,
// `edit.hide` and `edit.rename` and the right-click menu's rows act on `Ref`s (what is picked, `views/plan/mix.ts`) and each kind
// adds a row here, not a rewrite. A kind with no entry for a verb is left out of it: Lock with an existing road picked is no Lock.
//   mass        lock (its own flag or its building's), eye `mass:<id>`, rename
//   street      lock (its segments': all of them), eye `street:<segment>` for each segment, no name
//   lot         lock, eye `lot:<id>`, rename           gate   lock (the option's copy, else the site's), eye `gate:<id>`, no name
//   existing road   lock (its own flag: the site's), eye, rename       dimension   eye `dimension:<id>` (its lock is its *Fixed length*, an own verb)
//   reference line   lock (the project's, no option), eye `reference-line:<id>`, no name (it is *Reference line N*)
//   note        lock (its own flag), eye `note:<id>`, rename (its text is its name: the field in its Properties)
//   drawing file, layer, parcels   lock (the drawings' own padlocks), eye(s)       grid   its eye is the snap's *Grid* switch (`layers/switches.ts`)
//   building    lock (its own flag: `lockBuildings`), eye `building:<id>` (it keeps the building the plan is on drawn), rename in its row of Layers
//   level       lock (the sum of its masses), no eye, rename in its row of Layers (a level is a row, never picked on the plan)
//   pickedFor(verb)      the refs picked that the verb acts on
//   lockedAll / lockRefs / hiddenAll / hideRefs      the state of a verb over refs, and setting it (one undo step for a lock; a view
//                        state, never an undo step, for an eye)
//   whyNotUnlock         why Unlock frees nothing: every one of the refs is a mass or a level that a locked building holds (its own padlock is the building's); the Layers row's
//                        words. Unlocking some of them and not others says so after (`lockRefs`)
//   renameWhy / renameRef                            whether a ref can be renamed now (the reason when not), and asking for it
import { buildingOfLevel } from '../../engine/buildings.ts'
import { isLocked, roadSegments } from '../../kinds/locked.ts'
import type { Ref } from '../../kinds/types.ts'
import { isLayerLocked, parcelsLocked } from '../../model/drawings.ts'
import type { Project } from '../../model/schema.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { building as buildingKey, dimension, drawingLayer, existingRoad, gate, lot, mass as massKey, note, parcel, referenceLine, street } from '../layers/keys.ts'
import { hiddenNow, isHidden, useLayerView } from '../layers/layerView.ts'
import { heldByBuilding, holdingBuilding, isRefLocked, LOCKED_TITLE, nameOfRef } from '../layers/locks.ts'
import { useToast } from '../layout/toast.ts'
import { setFilesLocked, setLayerLocked, setParcelsOfLocked } from '../layers/drawingCommands.ts'
import { setSwitch, switchOn } from '../layers/switches.ts'
import { toggleHidden } from '../panels/buildingCommands.ts'
import { pickedRefs } from '../plan/mix.ts'
import { askRowRename } from '../layers/rowRename.ts'
import { useRename } from './rename.ts'

export type RefVerb = 'lock' | 'hide' | 'rename'

/** What a kind does for the three verbs; a missing one is a verb the kind does not take. */
interface KindOps {
  /** Whether this one is locked, and the padlock set on all these (one undo step). */
  lock?: { is(ref: Ref): boolean; set(refs: Ref[], on: boolean): void }
  /** The keys of its eye (`layers/keys.ts`; a hidden one is not drawn, picked or snapped to), or the switch that is its eye (the grid's). */
  hide?: { key(ref: Ref): string | string[] } | { is(ref: Ref): boolean; set(refs: Ref[], hidden: boolean): void }
  /** Why it cannot be renamed now; null when it can. Asking for it opens its Properties on the name field. */
  rename?: { why(ref: Ref): string | null }
}

const ids = (refs: Ref[]) => refs.map((r) => r.id)
const project = () => useApp.getState().project
const option = () => useApp.getState().option
const apply = (f: (p: Project) => Project) => useApp.getState().apply(f)

/** Free to rename unless locked. */
const unlessLocked = { why: (r: Ref): string | null => (isRefLocked(r) ? LOCKED_TITLE : null) }
/** A name field and nothing in the way. */
const named = { why: (): string | null => null }

/** A building's name is its own data: a locked building holds it. */
const unlessBuildingLocked = { why: (r: Ref): string | null => (isRefLocked({ kind: 'building', id: r.id }) ? LOCKED_TITLE : null) }

const layersOf = (file: string) => project().site.drawings?.find((d) => d.file === file)?.layers ?? []
const parcelsOf = (file: string) => (project().site.parcels ?? []).filter((x) => x.file === file)

export const KIND_OPS: Record<string, KindOps> = {
  // a building's padlock is its own flag (freeing it also frees the masses locked one by one); its eye keeps the building the plan is on drawn
  building: {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockBuildings(p, ids(refs), on)) },
    hide: {
      is: (r) => isHidden(buildingKey(r.id)),
      set: (refs, hidden) =>
        refs.forEach((r) => {
          const b = project().buildings.find((x) => x.id === r.id)
          if (b && isHidden(buildingKey(b.id)) !== hidden) toggleHidden(b)
        }),
    },
    rename: unlessBuildingLocked,
  },
  // a level's padlock is the sum of its masses'; its name is its building's data
  level: {
    lock: {
      is: (r) => isRefLocked(r),
      set: (refs, on) => apply((p) => actions.lockMasses(p, p.masses.filter((m) => ids(refs).includes(m.levelId)).map((m) => m.id), on)),
    },
    rename: { why: (r) => ((b) => (b && isRefLocked({ kind: 'building', id: b.id }) ? LOCKED_TITLE : null))(buildingOfLevel(project(), r.id)) },
  },
  mass: {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockMasses(p, ids(refs), on)) },
    hide: { key: (r) => massKey(r.id) },
    rename: unlessLocked,
  },
  street: {
    // locked when all its segments are: a street with some locked is mixed, its row reads Lock and locks all
    lock: {
      is: (r) => isLocked(project(), r, option()),
      set: (refs, on) => apply((p) => actions.lockStreets(p, refs.flatMap((r) => roadSegments(p, option(), r.id)), on, option())),
    },
    hide: { key: (r) => roadSegments(project(), option(), r.id).map(street) },
  },
  lot: {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockLots(p, ids(refs), on)) },
    hide: { key: (r) => lot(r.id) },
    rename: unlessLocked,
  },
  gate: {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockGates(p, ids(refs), on, option())) },
    hide: { key: (r) => gate(r.id) },
  },
  // an existing road's padlock is its own flag (the site's: no option is asked; Phase PE.2)
  'existing-road': {
    lock: { is: (r) => isLocked(project(), r), set: (refs, on) => apply((p) => actions.lockExistingRoads(p, ids(refs), on)) },
    hide: { key: (r) => existingRoad(r.id) },
    rename: named,
  },
  dimension: { hide: { key: (r) => dimension(r.id) } },
  // a reference line is the project's: its padlock is its own flag, its eye its own key (the kind's `reference-lines` hides them all)
  'reference-line': {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockReferenceLines(p, ids(refs), on)) },
    hide: { key: (r) => referenceLine(r.id) },
  },
  // a note is on a level and its padlock is its own flag; its text is its name, so Rename selects the text in its Properties
  note: {
    lock: { is: (r) => isRefLocked(r), set: (refs, on) => apply((p) => actions.lockNotes(p, ids(refs), on)) },
    hide: { key: (r) => note(r.id) },
    rename: unlessLocked,
  },
  drawing: {
    lock: {
      is: (r) => {
        const file = r.file ?? r.id
        const layers = layersOf(file)
        return layers.length > 0 && layers.every(isLayerLocked) && (parcelsOf(file).length === 0 || parcelsLocked(project().site, file))
      },
      set: (refs, on) => setFilesLocked(refs.map((r) => r.file ?? r.id), on),
    },
    hide: { key: (r) => [...layersOf(r.file ?? r.id).map((l) => drawingLayer(r.file ?? r.id, l.name)), ...parcelsOf(r.file ?? r.id).map((x) => parcel(x.name, x.file))] },
  },
  'drawing-layer': {
    lock: {
      is: (r) => layersOf(r.file ?? '').some((l) => l.name === r.id && isLayerLocked(l)),
      set: (refs, on) => refs.forEach((r) => setLayerLocked(r.file ?? '', r.id, on)),
    },
    hide: { key: (r) => drawingLayer(r.file ?? '', r.id) },
  },
  parcels: {
    lock: { is: (r) => parcelsLocked(project().site, r.file ?? r.id), set: (refs, on) => refs.forEach((r) => setParcelsOfLocked(r.file ?? r.id, on)) },
    hide: { key: (r) => parcelsOf(r.file ?? r.id).map((x) => parcel(x.name, x.file)) },
  },
  // its eye is the snap's *Grid* switch: hidden is the switch off
  grid: { hide: { is: () => !switchOn('grid'), set: (_refs, hidden) => setSwitch('grid', !hidden) } },
}

/** Whether the kind takes the verb (it has a row in the table). */
export const takesOps = (kind: string, verb: RefVerb): boolean => KIND_OPS[kind]?.[verb] !== undefined

/** The refs picked now that the verb acts on. */
export const pickedFor = (verb: RefVerb): Ref[] => pickedRefs().filter((r) => takesOps(r.kind, verb))

/** Every one of these is locked (and there is one at least): Lock then reads Unlock. A street with only some segments locked is not. */
export function lockedAll(refs: Ref[]): boolean {
  return refs.length > 0 && refs.every((r) => KIND_OPS[r.kind]?.lock?.is(r) === true)
}

/** What is said of these masses or levels when a locked building holds them: its padlock frees them, not their own. */
function heldReason(held: Ref[]): string {
  const names = [...new Set(held.map((r) => holdingBuilding(r)!.name))]
  if (held.length === 1) return heldByBuilding(nameOfRef(held[0]), names[0])
  return `${held.length} are locked with their building${names.length > 1 ? 's' : ''}: unlock ${names.join(' and ')} to free them.`
}

/** Why Unlock would do nothing for these (every one is held by its building's padlock: the Layers row says the same); null when it frees something, or when they are not all locked. */
export function whyNotUnlock(refs: Ref[]): string | null {
  if (!lockedAll(refs) || !refs.every((r) => holdingBuilding(r) !== undefined)) return null
  return heldReason(refs)
}

/** Locks (or unlocks) these, kind by kind. A mass or a level its locked building holds stays locked when unlocked: a notice says where the lock comes off. */
export function lockRefs(refs: Ref[], on: boolean): void {
  for (const kind of new Set(refs.map((r) => r.kind))) KIND_OPS[kind]?.lock?.set(refs.filter((r) => r.kind === kind), on)
  const held = on ? [] : refs.filter((r) => holdingBuilding(r) !== undefined)
  if (held.length > 0) useToast.getState().show('info', heldReason(held))
}

/** The keys of the eyes of these refs (the kinds whose eye is a switch have none): what *On top* and the eyes' readers ask. */
export const eyeKeysOf = (refs: Ref[]): string[] =>
  refs.flatMap((r) => {
    const h = KIND_OPS[r.kind]?.hide
    return h && 'key' in h ? h.key(r) : []
  })

/** This ref's eye is closed: all its keys are hidden, or its switch is off. */
function hiddenRef(ref: Ref, off: ReadonlySet<string>): boolean {
  const h = KIND_OPS[ref.kind]?.hide
  if (!h) return false
  if ('is' in h) return h.is(ref)
  const keys = [h.key(ref)].flat()
  return keys.length > 0 && keys.every((k) => off.has(k))
}

/** Every one of these is hidden (and there is one at least): Hide then reads Show. */
export function hiddenAll(refs: Ref[]): boolean {
  const off = hiddenNow()
  return refs.length > 0 && refs.every((r) => hiddenRef(r, off))
}

/** Hides these (or shows them): their eyes. What is hidden and picked is let go (`layers/letGo.ts`). */
export function hideRefs(refs: Ref[], hidden: boolean): void {
  useLayerView.getState().setHidden(eyeKeysOf(refs), hidden)
  for (const r of refs) {
    const h = KIND_OPS[r.kind]?.hide
    if (h && 'set' in h) h.set([r], hidden)
  }
}

/** Why this ref cannot be renamed now; null when it can. */
export const renameWhy = (ref: Ref): string | null => KIND_OPS[ref.kind]?.rename?.why(ref) ?? null

/** Asks for the name of this ref to be edited: the Properties tab opens on it. */
export const renameRef = (ref: Ref): void => (ref.kind === 'building' || ref.kind === 'level' ? askRowRename(`${ref.kind}:${ref.id}`) : useRename.getState().ask(ref))
