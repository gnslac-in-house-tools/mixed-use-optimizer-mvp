// The block editor from Home (Phase BL.4, Decision "Block library"; the user: "in Home, if I open a Block, the block
// editor appears, I press save, it asks overwrite or copy, and on closing I go back to Home… much as Revit does"): a
// block is edited in the Program window on a project of its own (`BLOCK_EDITOR_ID`, an industrial project with that
// block alone), never kept in this browser's projects. *Save to library* saves it (overwrite or a copy); closing the
// window goes back to Home and to the project the store held, asking first when the block changed since it was saved.
// Edited from a project, a block keeps the Program window over that project, and closing it goes back there. Ctrl+S in
// the editor does what *Save to library* does (saving.ts) but never skips its question.
import { create } from 'zustand'
import type { Id, Project } from '../../model/schema.ts'
import { libraryBlock, libraryCopyName } from '../../modules/warehouse/views/blockLibrary.ts'
import { saveToLibrary, useSaveAsk } from '../../modules/warehouse/views/SaveBlock.tsx'
import { useWarehouse } from '../../modules/warehouse/views/warehouseState.ts'
import { actions } from '../../state/actions/index.ts'
import { useApp } from '../../state/store.ts'
import { newProject } from '../../typologies/index.ts'
import { holdProject, onEditorSave, restoreProject, type HeldProject } from '../layout/saving.ts'
import { useToast } from '../layout/toast.ts'
import { useUi } from '../layout/ui.ts'
import { BLOCK_EDITOR_ID } from './editorId.ts'
import { showHome, useScreen } from './screen.ts'

export { BLOCK_EDITOR_ID } from './editorId.ts'

export const UNSAVED_BLOCK = 'This block changed since it was last saved to the library, and the changes will be lost. Close it anyway?'

interface BlockEditorState {
  open: boolean
  /** The type being edited, in the editor's project. */
  typeId: Id | null
  /** The type as last saved (or as it opened from the library); null: never saved. */
  saved: string | null
  /** What the store held before: given back on closing. */
  back: HeldProject | null
}

export const useBlockEditor = create<BlockEditorState>()(() => ({ open: false, typeId: null, saved: null, back: null }))

/** The type's steps as they are, not its link (what saving compares). */
function snapshot(p: Project, id: Id | null): string | null {
  const t = id ? p.warehouseTypes?.find((x) => x.id === id) : undefined
  if (!t) return null
  const { library: _, ...rest } = t
  return JSON.stringify(rest)
}

/**
 * Opens the block editor on a library block, or on a new block (`null`). `copy`: a new block that starts as that one
 * (Create new's block types), not linked to it, never saved, named as a copy is ("<name> copy"). False when the block
 * is not there.
 */
export function openBlockEditor(blockId: Id | null, { copy = false }: { copy?: boolean } = {}): boolean {
  const s = useApp.getState()
  const back = holdProject()
  const block = blockId ? libraryBlock(blockId)?.block : undefined
  if (blockId && !block) return false
  const blank: Project = { ...newProject('industrial', 'Block editor'), id: BLOCK_EDITOR_ID }
  const made = block ? actions.bringBlock(blank, block) : actions.addWarehouseType(blank)
  // a copy unlinked is saved as a block of its own under its name: a name no block has, as Save's copy gets
  const project = block && copy ? actions.renameWarehouseType(actions.unlinkBlock(made.project, made.id), made.id, libraryCopyName(block.type.name)) : made.project
  s.open(project)
  useWarehouse.getState().pick(made.id)
  useBlockEditor.setState({ open: true, typeId: made.id, saved: block && !copy ? snapshot(project, made.id) : null, back })
  // the window over the editor's project; the address stays Home's (a reload goes back there)
  useScreen.setState({ home: false })
  useUi.getState().openDialog('program')
  return true
}

/**
 * Ctrl+S in the editor (saving.ts): what its Save to library button does, never a way round its question. Nothing
 * changed since the last save: nothing is saved, and it says so (no new version on every press). A block linked to the
 * library: the button asks Overwrite or a copy, so Ctrl+S opens that question. One not linked becomes a new block at once.
 */
export function saveEditedBlock(): void {
  const { open, typeId } = useBlockEditor.getState()
  const t = useApp.getState().project.warehouseTypes?.find((x) => x.id === typeId)
  if (!open || !t) return
  if (!blockUnsaved()) return useToast.getState().show('info', 'This block is already saved in the library.')
  if (t.library) {
    // the question lives in the Program window's foot
    if (useUi.getState().dialog !== 'program') useUi.getState().openDialog('program')
    useSaveAsk.setState({ typeId: t.id })
    return
  }
  if (saveToLibrary(t, 'copy')) blockSaved()
}
onEditorSave(BLOCK_EDITOR_ID, saveEditedBlock)

/** The block was saved to the library: what closing compares with now. */
export function blockSaved(): void {
  const { open, typeId } = useBlockEditor.getState()
  if (open) useBlockEditor.setState({ saved: snapshot(useApp.getState().project, typeId) })
}

/** Whether the block changed since it was last saved (a new block never saved counts as changed). */
export function blockUnsaved(): boolean {
  const { open, typeId, saved } = useBlockEditor.getState()
  return open && snapshot(useApp.getState().project, typeId) !== saved
}

/** Ends the editor: its window closed, the store's project back as it was. */
function end(): void {
  const { back } = useBlockEditor.getState()
  // closed first: its window closing then is not taken for a Close (followBlockEditor)
  useBlockEditor.setState({ open: false, typeId: null, saved: null, back: null })
  useSaveAsk.setState({ typeId: null })
  if (useUi.getState().dialog) useUi.getState().closeDialog()
  if (back) {
    restoreProject(back)
  }
}

/**
 * Leaves the editor, then `then`: asking first when the block has changes not saved, its window kept while it asks.
 * Its window is over the app, but Back (or a .gft dropped) can still open another project: through files.ts's `leave`
 * that ends the editor too, as the terrain editor's.
 */
export function leaveBlockEditor(then: () => void): void {
  if (!useBlockEditor.getState().open) return then()
  const go = () => {
    end()
    then()
  }
  if (!blockUnsaved()) return go()
  if (useUi.getState().dialog !== 'program') useUi.getState().openDialog('program')
  useToast.getState().confirm(UNSAVED_BLOCK, go)
}

/** Closes the editor (asking first when changed): Home again. */
export function closeBlockEditor(): void {
  if (!useBlockEditor.getState().open) return
  leaveBlockEditor(showHome)
}

/** While the editor is open, its window closing (✕, Escape, a click outside) closes the editor; returns the way to stop. */
export function followBlockEditor(): () => void {
  return useUi.subscribe((s, prev) => {
    if (prev.dialog === 'program' && s.dialog !== 'program' && useBlockEditor.getState().open) closeBlockEditor()
  })
}
