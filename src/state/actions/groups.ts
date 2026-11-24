// Groups of masses (Decision "Groups"): the plan's right-click menu, Ctrl+G and Ctrl+Shift+G, and the agent's tools.
//   groupMasses     two or more masses become one group (the groups they were in join it)
//   ungroupMasses   the groups of these masses are undone, every member
// and, since Phase AS.5 task 6, of any kind (the commands act on these when what is picked is not masses alone):
//   groupRefs       two or more things, of any kind, become one group; ungroupRefs: the groups they are in come apart
// Pure, one undo step each; the same project when nothing changes. A locked mass keeps its group (the padlock is CAD's):
// a group that would change one of its members is refused (null, the same project), never half done.
import { groupIdsIn, isGroupable, isThere, membersOfGroup, refGroup, refGroupMembers, roadSegmentIds, withGroupOn, withRefGroups } from '../../engine/groups.ts'
import { isLocked, streetLockState } from '../../kinds/locked.ts'
import { massIsLocked } from '../../model/locks.ts'
import type { Id, Project } from '../../model/schema.ts'
import { newId } from './masses.ts'

/** Two or more masses become one group; null with fewer than two, or when a locked mass would change group. */
export function groupMasses(p: Project, ids: Id[]): { project: Project; id: Id } | null {
  const picked = new Set(ids.filter((id) => p.masses.some((m) => m.id === id)))
  if (picked.size < 2) return null
  // the groups they were in join the new one, whole
  const joining = new Set(p.masses.filter((m) => picked.has(m.id) && m.group !== undefined).map((m) => m.group!))
  if (p.masses.some((m) => massIsLocked(p, m) && (picked.has(m.id) || (m.group !== undefined && joining.has(m.group))))) return null
  // (the first free among every kind's: a lot and a note may be in a group of their own)
  const id = newId('g', groupIdsIn(p))
  return { project: { ...p, masses: p.masses.map((m) => (picked.has(m.id) || (m.group !== undefined && joining.has(m.group)) ? { ...m, group: id } : m)) }, id }
}

// Groups of any kind (Phase AS.5 task 6): a mass, a street, a lot, a gate, a dimension, a reference line and a note, in one group (Decision "Groups of
// any kind"). The reader and the group's rules are `engine/groups.ts`; these are the verbs, in an option (streets, lots and gates are the option's).
//   groupRefs    two or more things become one group (the groups they were in join it, whole)
//   ungroupRefs  the groups these things are in come apart, every member
// One undo step each; the same project (null for Group) when nothing changes: fewer than two things, something that cannot be grouped, or a
// member that is locked (the padlock is CAD's: a locked thing keeps its group, so a group that would change one is refused whole).

/** Whether a thing, or a segment of it, is locked: a street with only some segments locked holds its group too. */
function holdsLock(p: Project, option: Id, ref: { kind: string; id: Id }): boolean {
  if (ref.kind === 'street') return streetLockState(p, option, roadSegmentIds(p, option, ref.id)) !== 'unlocked'
  return isLocked(p, ref, option)
}

/** Two or more things become one group; null with fewer than two, with something that cannot be in a group, or when a locked thing would change group. Returns the group's id. */
export function groupRefs(p: Project, option: Id, refs: { kind: string; id: Id }[]): { project: Project; id: Id } | null {
  if (refs.some((r) => !isGroupable(r.kind))) return null
  const things = refs.filter((r, i) => refs.findIndex((x) => x.kind === r.kind && x.id === r.id) === i && isThere(p, option, r))
  if (things.length < 2) return null
  // the groups they were in join the new one, whole
  const all = withRefGroups(p, option, things)
  if (all.some((r) => holdsLock(p, option, r))) return null
  const id = newId('g', groupIdsIn(p))
  return { project: withGroupOn(p, option, all, id), id }
}

/** The groups these things are in are undone: every member, whatever its kind, not only these. The same project when a member is locked or none is in a group. */
export function ungroupRefs(p: Project, option: Id, refs: { kind: string; id: Id }[]): Project {
  const there = refs.filter((r) => isGroupable(r.kind) && isThere(p, option, r))
  const groups = new Set(there.flatMap((r) => (refGroupMembers(p, option, r).length > 1 ? [refGroup(p, option, r)!] : [])))
  if (groups.size === 0) return p
  const members = [...groups].flatMap((g) => membersOfGroup(p, option, g))
  if (members.some((r) => holdsLock(p, option, r))) return p
  return withGroupOn(p, option, members, undefined)
}

/** The groups these masses are in are undone: every member, not only these. The same project when a member is locked. */
export function ungroupMasses(p: Project, ids: Id[]): Project {
  const groups = new Set(p.masses.filter((m) => ids.includes(m.id) && m.group !== undefined).map((m) => m.group!))
  if (groups.size === 0) return p
  if (p.masses.some((m) => massIsLocked(p, m) && m.group !== undefined && groups.has(m.group))) return p
  return {
    ...p,
    masses: p.masses.map((m) => {
      if (m.group === undefined || !groups.has(m.group)) return m
      const { group: _, ...free } = m
      return free
    }),
  }
}
