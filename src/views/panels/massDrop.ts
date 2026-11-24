// What can be dropped on a mass, in the plan or the 3D (Decisions "Layout by function", "Tree menus and drops"):
//   a building  from the Layers tree's Buildings branch: the mass (with the selection, if it was in it) is assigned to it, in
//               the option the building was dragged from (Rhino's "Change object layer", by dragging)
// The tree's items travel as JSON under their own data type; during the drag browsers show only the types. Neither a program nor an
// option is dropped on a mass any more (Phase AS.3: the palette and the options' rows went): the plan's menu gives a program
// (*Program ▸*), and a building's menu links or copies it into another option (*In another option ▸*).
import type { DragEvent } from 'react'
import type { Id } from '../../model/schema.ts'
import { useApp } from '../../state/store.ts'
import { assign } from './buildingCommands.ts'

/** The tree's drag data type. */
export const TREE_MIME = 'application/x-gfit-tree'

/** A tree item that can land on a mass. `optionId`: the option it was dragged from (null: no option shows it). */
export type TreeDrag = { kind: 'building'; id: Id; optionId: Id | null }

/** Puts a tree item in the drag, for the plan and the 3D (the tree itself reads its own drags directly). */
export function carryTreeItem(e: DragEvent, item: TreeDrag, name: string): void {
  e.dataTransfer?.setData(TREE_MIME, JSON.stringify(item))
  e.dataTransfer?.setData('text/plain', name) // Firefox starts a drag only with data
}

const isTreeDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes(TREE_MIME)

/** Does this drag land on a mass? (a building) */
export const isMassDrop = (e: DragEvent): boolean => isTreeDrag(e)

function treeItem(e: DragEvent): TreeDrag | null {
  if (!isTreeDrag(e)) return null
  try {
    const item = JSON.parse(e.dataTransfer.getData(TREE_MIME)) as TreeDrag
    return item && item.kind === 'building' && typeof item.id === 'string' ? item : null
  } catch {
    return null
  }
}

/** Drops what the drag carries on the mass; false when it carries nothing a mass takes. */
export function dropOnMass(e: DragEvent, massId: Id): boolean {
  const item = treeItem(e)
  const s = useApp.getState()
  const m = s.project.masses.find((x) => x.id === massId)
  if (!item || !m) return false
  const ids = s.selection.massIds.includes(massId) ? s.selection.massIds : [massId]
  assign(ids, item.optionId ?? s.option, item.id)
  return true
}
