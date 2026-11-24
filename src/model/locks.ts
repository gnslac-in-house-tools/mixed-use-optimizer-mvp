// The padlock's two plain facts (Phase AS.4, Decision "Padlocks by kind"), in the model so the engine, a module and a view can all ask
// them: a mass is locked by its own flag or by its building's (a locked building holds every mass in it), and a flag is set or taken away
// the one way (`locked: true`, or no `locked`). Everything a `Ref` needs (a street's segments, a lot, a gate, a level) is
// `src/kinds/locked.ts`, which builds on this and is what a view, a tool and `state/settle.ts` ask. Pure.
import type { Id, Mass, Project } from './schema.ts'

/** Whether the building holds the padlock itself (its own flag, not the sum of its masses'). */
export const buildingLocked = (p: Pick<Project, 'buildings'>, buildingId: Id): boolean => p.buildings.some((b) => b.id === buildingId && b.locked === true)

/** Whether this mass is locked: its own flag, or its building's. */
export function massIsLocked(p: Pick<Project, 'buildings'>, m: Pick<Mass, 'levelId' | 'locked'>): boolean {
  return m.locked === true || p.buildings.some((b) => b.locked === true && b.levels.some((l) => l.id === m.levelId))
}

/** The ids of the locked masses (their own flag or their building's), in the project's order; the buildings are read once. */
export function lockedMassIds(p: Pick<Project, 'buildings' | 'masses'>): Id[] {
  const levels = new Set(p.buildings.filter((b) => b.locked === true).flatMap((b) => b.levels.map((l) => l.id)))
  return p.masses.filter((m) => m.locked === true || levels.has(m.levelId)).map((m) => m.id)
}

/** The object with its padlock on (`locked: true`) or off (no `locked` at all: absent is free); the same object when it already is. */
export function setLocked<T extends { locked?: boolean }>(x: T, on: boolean): T {
  if ((x.locked === true) === on) return x
  if (on) return { ...x, locked: true }
  const { locked: _, ...free } = x
  return free as T
}
