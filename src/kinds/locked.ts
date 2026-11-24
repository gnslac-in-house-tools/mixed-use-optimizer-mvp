// What "locked" means for a `Ref` in a project (Phase AS.4, Decision "Padlocks by kind"; the user, 2026-11-13: the padlock is CAD's).
// Pure: a project in, an answer out, so `state/settle.ts` (which holds every lock against any verb, tool or optimizer), the agent's tools
// and the views ask the same questions and none reads a `locked` flag on its own where "is it locked" is the question.
//   mass       its own flag, or its building's (`massLocked`, `massIsLocked`): a mass in a locked building is a locked mass everywhere
//   building   its own flag (`buildingLocked`), not the sum of its masses: it holds its own data and every mass in it, now and later
//   level      the sum of its masses (all of them locked, and at least one)
//   street     its segments' flags (`StreetSegment.locked`: the derived road's id changes when it is split): locked when all its
//              segments are, mixed when some (`streetLockState`)
//   lot, gate  their own flag; a gate is the option's (its own copy, else the site's)
//   existing road  its own flag (the site's: no option is asked; Phase PE.2)
//   reference line, note  their own flag (the project's: no option is asked); a locked one is not changed or deleted (state/settle.ts, Phase AS.5)
// A dimension's lock is not this: it fixes a length (state/dimensionAnchors.ts), and says so.
import { standardsOf } from '../engine/circulation/standards.ts'
import { streetRoads, streetTypesOf } from '../engine/circulation/streets.ts'
import { buildingLocked, lockedMassIds, massIsLocked, setLocked } from '../model/locks.ts'
import type { DesignOption, Gate, Id, Project } from '../model/schema.ts'
import type { Ref } from './types.ts'

// the plain facts live in the model (the engine and the modules ask them too); this is where a view, a tool and settle find them
export { buildingLocked, lockedMassIds, massIsLocked, setLocked }

/** What a street's padlock reads: all its segments locked, none, or some. */
export type LockState = 'locked' | 'unlocked' | 'mixed'

const optionOf = (p: Project, option: Id | null | undefined): DesignOption | undefined => p.options.find((o) => o.id === option)

/** The options to look in: the one asked for, else every option. */
const optionsFor = (p: Project, option: Id | null | undefined): DesignOption[] => (option === undefined || option === null ? p.options : (optionOf(p, option) ? [optionOf(p, option)!] : []))

// ---- buildings and masses ----

/**
 * Whether the mass is locked (false for one that is not in the project). `option`: the option in view; a building's flag is the
 * project's, so it does not change the answer, and every kind's helper is asked the same way.
 */
export function massLocked(p: Project, _option: Id | null | undefined, massId: Id): boolean {
  const m = p.masses.find((x) => x.id === massId)
  return m !== undefined && massIsLocked(p, m)
}

// ---- streets ----

/** Whether a street segment of the option is locked. */
export function segmentLocked(p: Project, option: Id | null | undefined, segmentId: Id): boolean {
  return optionsFor(p, option).some((o) => o.streets?.segments.some((g) => g.id === segmentId && g.locked === true))
}

/** A street's padlock from its segments' ids (the caller derives them: `DerivedRoad.segments`): all locked, none, or some. */
export function streetLockState(p: Project, option: Id | null | undefined, segmentIds: Id[]): LockState {
  const flags = segmentIds.map((id) => segmentLocked(p, option, id))
  if (!flags.some(Boolean)) return 'unlocked'
  return flags.every(Boolean) ? 'locked' : 'mixed'
}

/** The segments of the street with this id (`street:<its earliest segment>`: every run of it), or of the run with it, in the option or in any; none when there is no such road. */
export function roadSegments(p: Project, option: Id | null | undefined, roadId: Id): Id[] {
  for (const o of optionsFor(p, option)) {
    const roads = streetRoads(o.streets, streetTypesOf(p, o), standardsOf(p, o).laneWidth).filter((r) => (r.street ?? r.id) === roadId || r.id === roadId)
    if (roads.length > 0) return roads.flatMap((r) => r.segments ?? [r.sourceId ?? roadId.replace(/^street:/, '')])
  }
  return []
}

// ---- lots and gates ----

/** Whether the lot is locked. */
export const lotLocked = (p: Project, option: Id | null | undefined, lotId: Id): boolean => optionsFor(p, option).some((o) => o.lots?.some((l) => l.id === lotId && l.locked === true))

/** The gates an option answers for: its own copy, else the site's. */
const gatesIn = (p: Project, o: DesignOption): Gate[] => o.gates ?? p.site.gates ?? []

/**
 * Whether the gate is locked: the option's (its own copy when it has one, else the site's); with no option, the site's or any
 * option's copy of that id.
 */
export function gateLocked(p: Project, option: Id | null | undefined, gateId: Id): boolean {
  if (option !== undefined && option !== null) {
    const o = optionOf(p, option)
    return (o ? gatesIn(p, o) : (p.site.gates ?? [])).some((g) => g.id === gateId && g.locked === true)
  }
  return [...(p.site.gates ?? []), ...p.options.flatMap((o) => o.gates ?? [])].some((g) => g.id === gateId && g.locked === true)
}

// ---- existing roads ----

/** The existing road a ref names (its id, or its derived road's `existing:<id>` / `existing:<id>:<k>`), as the path verbs read it. */
function existingRoadOf(p: Project, id: Id) {
  const list = p.site.existingRoads ?? []
  const exact = list.find((r) => r.id === id)
  if (exact || !id.startsWith('existing:')) return exact
  const named = id.slice('existing:'.length)
  return list.find((r) => r.id === named) ?? list.find((r) => named.startsWith(`${r.id}:`))
}

/** Whether the existing road is locked (the site's: no option is asked). */
export const existingRoadLocked = (p: Project, id: Id): boolean => existingRoadOf(p, id)?.locked === true

// ---- reference lines and notes ----

/** Whether the reference line is locked (the project's, so no option is named). */
export const referenceLineLocked = (p: Project, lineId: Id): boolean => p.referenceLines?.some((r) => r.id === lineId && r.locked === true) === true

/** Whether the note is locked. */
export const noteLocked = (p: Project, noteId: Id): boolean => p.notes?.some((n) => n.id === noteId && n.locked === true) === true

// ---- a Ref ----

/**
 * Whether what the `Ref` names is locked. A street `Ref` is the derived road: locked when all its segments are. A kind with no padlock
 * of this kind (a dimension…), or something that is not there, is not locked.
 */
export function isLocked(p: Project, ref: Ref, option?: Id | null): boolean {
  switch (ref.kind) {
    case 'mass':
      return massLocked(p, option, ref.id)
    case 'building':
      return buildingLocked(p, ref.id)
    case 'level': {
      const masses = p.masses.filter((m) => m.levelId === ref.id)
      return masses.length > 0 && masses.every((m) => massIsLocked(p, m))
    }
    case 'street':
      return streetLockState(p, option, roadSegments(p, option, ref.id)) === 'locked'
    case 'lot':
      return lotLocked(p, option, ref.id)
    case 'gate':
      return gateLocked(p, option, ref.id)
    case 'existing-road':
      return existingRoadLocked(p, ref.id)
    case 'reference-line':
      return referenceLineLocked(p, ref.id)
    case 'note':
      return noteLocked(p, ref.id)
    default:
      return false
  }
}

/** The refs among these that are locked, in the order given. */
export const lockedAmong = (p: Project, refs: Ref[], option?: Id | null): Ref[] => refs.filter((r) => isLocked(p, r, option))

/** The nodes the locked segments of the option hold (each locked segment's two ends): they do not move, whoever drags the street. */
export function lockedNodeIds(p: Project, option: Id | null | undefined): Set<Id> {
  const held = new Set<Id>()
  for (const o of optionsFor(p, option)) for (const g of o.streets?.segments ?? []) if (g.locked === true) held.add(g.a).add(g.b)
  return held
}
