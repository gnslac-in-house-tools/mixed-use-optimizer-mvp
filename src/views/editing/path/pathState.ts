// What is picked of a path (Phase PE.1 task 10, Decision "Path engine"): the street or existing street whose handles are shown, and
// the node of it clicked (Delete or a double click removes it). UI state, never in the Project. A street is picked in `useRoads`, an
// existing street in `useAccess`; the node is told by its id (an existing street's: its index as a string), and is let go when the
// pick changes. Pure of the viewport: `host.ts` and `drags.ts` read it.
import { create } from 'zustand'
import type { Id } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { useAccess } from '../../plan/access/accessState.ts'
import { useRoads } from '../../plan/circulation/roadState.ts'
import { tellLockedPick } from '../../layers/locks.ts'
import { useToast } from '../../layout/toast.ts'

/** The `key` a ref has in the pick. */
export const pathKey = (ref: Ref): string => `${ref.kind}:${ref.id}`

export const usePathPick = create<{ key: string | null; node: Id | null; pick(ref: Ref | null, node: Id | null): void }>()((set) => ({
  key: null,
  node: null,
  pick: (ref, node) => set({ key: ref ? pathKey(ref) : null, node }),
}))

/** The street or existing street whose handles are shown now, or null. */
export function pickedPathRef(): Ref | null {
  const street = useRoads.getState().picked
  if (street !== null) return { kind: 'street', id: street }
  const site = useAccess.getState().picked
  return site?.kind === 'existing' ? { kind: 'existing-road', id: site.id } : null
}

/** The street or existing street picked, as a hook (what the handles are drawn for). */
export function usePathRef(): Ref | null {
  const street = useRoads((s) => s.picked)
  const site = useAccess((s) => s.picked)
  return street !== null ? { kind: 'street', id: street } : site?.kind === 'existing' ? { kind: 'existing-road', id: site.id } : null
}

/** The node of `ref` picked, or null. */
export function pickedPathNode(ref: Ref | null = pickedPathRef()): Id | null {
  const { key, node } = usePathPick.getState()
  return ref && key === pathKey(ref) ? node : null
}

/** A node picked on a street also tells the street's own pick (Properties reads it). */
export function pickPathNode(ref: Ref, node: Id | null): void {
  usePathPick.getState().pick(ref, node)
  if (ref.kind === 'street') useRoads.getState().pickNode(node)
}

/** The node `id` of `ref` removed (its two stretches merging): one undo step. False when it is no node or it was refused (said). */
export function removePathNode(ref: Ref, id: Id): boolean {
  const { project, option } = useApp.getState()
  const read = actions.pathOf(project, ref, option)
  const i = read ? read.nodes.indexOf(id) : -1
  if (!read || i < 0) return false
  const w = actions.editPath(project, ref, { op: 'remove', i }, option)
  if (w.reason) {
    useToast.getState().show('info', w.reason)
    return true
  }
  useApp.getState().apply((p) => actions.editPath(p, ref, { op: 'remove', i }, option).project)
  pickPathNode(ref, null)
  return true
}

/**
 * One lane added (`by` 1) or taken (-1) on stretch `k` of `ref`, or on every stretch when `whole` (Shift): one undo step. A locked stretch
 * says so and a refusal says its reason (one lane at least), the project staying as it was; what the edit clamped is told too. True when
 * the project changed.
 */
export function stepLanes(ref: Ref, k: number, by: 1 | -1, whole: boolean): boolean {
  const { project, option } = useApp.getState()
  const op = { op: 'lanes', k: whole ? 'all' : k, by } as const
  const w = actions.editPath(project, ref, op, option)
  if (w.reason) {
    if (/locked/.test(w.reason)) tellLockedPick()
    else useToast.getState().show('info', w.reason)
    return false
  }
  if (w.project === project) return false
  useApp.getState().apply((p) => actions.editPath(p, ref, op, option).project)
  if (w.notes?.length) useToast.getState().show('info', w.notes.join('. '))
  return true
}

/** Delete with a node picked: it goes. False when none is picked. */
export function removePickedPathNode(): boolean {
  const ref = pickedPathRef()
  const id = ref && pickedPathNode(ref)
  return ref && id ? removePathNode(ref, id) : false
}

// an edit that takes the picked node away lets it go: a street's node ids are its own (gone when it is), an existing street's are indexes,
// so one that stays in range but means another node (the count changed: an undo, a remove) goes too
useApp.subscribe((s, before) => {
  if (s.project === before.project && s.option === before.option) return
  const { key, node } = usePathPick.getState()
  const ref = pickedPathRef()
  if (node === null || !ref || key !== pathKey(ref)) return
  const now = actions.pathOf(s.project, ref, s.option)
  const was = actions.pathOf(before.project, ref, before.option)
  const gone = !now || !now.nodes.includes(node) || (ref.kind === 'existing-road' && was !== null && was.nodes.length !== now.nodes.length)
  if (gone) pickPathNode(ref, null)
})

// a pick that changes lets the node go
useRoads.subscribe((s, before) => {
  if (s.picked !== before.picked) usePathPick.getState().pick(null, null)
})
useAccess.subscribe((s, before) => {
  if (s.picked !== before.picked) usePathPick.getState().pick(null, null)
})
