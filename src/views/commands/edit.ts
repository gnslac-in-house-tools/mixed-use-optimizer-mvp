// The Edit menu's commands (Project C, AS.1): Undo, Redo, Copy, Paste, Paste here, Duplicate, Delete, Select all, Group,
// Ungroup, Rename, Lock, Hide, Rotate 90°, Properties, and after a separator Keyboard shortcuts… (the window where every command's key is seen and
// given another: ShortcutsWindow.tsx; no key of its own) (Merge is Tools › Massing › Union now: tools.ts). Each `run` calls what the plan's right-click menu and the keys call (the store's
// undo and redo, plan/clipboard.ts, plan/massCommands.ts, plan/deletePicked.ts) and each `enabled` is the reason that
// menu greys the row with (`groupRefusal`, `mergeRefusal`…: one rule, one wording): the key of a disabled command does
// nothing and says why. Keys (spec "Shortcuts"): Ctrl for the edits, Delete and Backspace for Delete, Shift+R for Rotate 90°.
// Rename (F2), Lock (Ctrl+Shift+L) and Hide (Ctrl+H) act on what is picked as `Ref`s through the small table by kind of `editing/refOps.ts` (a mass, a street,
// a lot, a gate, the site's roads, a dimension, the drawings: each kind that has the verb), and Properties (no key: F3 is the snap's) opens the Properties tab; they are the rows the one right-click menu
// (`editing/menu/`) shows for these verbs. Group stands in the Tools strip too (`tool`, `once`), its menu stays Edit.
// Undo, Redo (and Save) also answer in the Rules window, the block editor and any other window; Copy, Paste, Paste here and
// Select all are `native`: with nothing to do their key is the browser's again.
import { kindOf } from '../../kinds/index.ts'
import { useApp } from '../../state/store.ts'
import { hiddenAll, hideRefs, lockedAll, lockRefs, pickedFor, renameRef, renameWhy, whyNotUnlock } from '../editing/refOps.ts'
import { clipboardHolds, copyRefusal, copySelection, duplicateRefusal, duplicateSelection, paste, PICK_SOMETHING } from '../plan/clipboard.ts'
import { deletePicked, deleteRefusal, NOTHING_TO_DELETE } from '../plan/deletePicked.ts'
import {
  drawingsPicked,
  groupRefusal,
  groupSelection,
  PICK_A_MASS,
  rotateRefusal,
  rotateSelection,
  selectAllHere,
  selectAllRefusal,
  showProperties,
  ungroupRefusal,
  ungroupSelection,
} from '../plan/massCommands.ts'
import { pickedRefs } from '../plan/mix.ts'
import { register } from './registry.ts'
import { openShortcuts } from './shortcutsWindowState.ts'
import type { Command } from './types.ts'

const EDIT = ['Edit']
/** A refusal (`null`: allowed; a string: why not) as `enabled()` says it. */
const ok = (refusal: () => string | null) => (): true | string => refusal() ?? true
const clipboard = (): true | string => (clipboardHolds() ? true : 'Copy something first')

/** A kind as a reason says it, with its article: *A street*, *An existing road*. */
const aKind = (kind: string): string => {
  const name = (kindOf(kind)?.label ?? 'thing').toLowerCase()
  return `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name}`
}

/** Rename: one thing picked, of a kind that takes it, and not locked. A kind with no name says so; one that has a name but is renamed in Layers (a building, a level) says where. */
function renameEnabled(): true | string {
  const picked = pickedRefs()
  if (picked.length === 0) return PICK_SOMETHING
  if (picked.length > 1) return 'Rename one thing at a time'
  const [ref] = pickedFor('rename')
  if (!ref) return kindOf(picked[0].kind)?.base.includes('rename') ? `${aKind(picked[0].kind)} is renamed from its row in Layers` : `${aKind(picked[0].kind)} has no name`
  return renameWhy(ref) ?? true
}

/** Lock: something picked that has a padlock (a mass, a street, a lot, a gate, a drawing); the dimension's is its *Fixed length*. Unlock of masses or levels a locked building holds says where its lock comes off. */
function lockEnabled(): true | string {
  if (pickedFor('lock').length > 0) return whyNotUnlock(pickedFor('lock')) ?? true
  const picked = pickedRefs()
  return picked.length === 0 ? PICK_A_MASS : `${aKind(picked[0].kind)} has no padlock`
}

export const EDIT_COMMANDS: Command[] = [
  {
    id: 'edit.undo',
    label: 'Undo',
    menu: EDIT,
    key: 'Ctrl+Z',
    where: ['project', 'rules', 'block-editor', 'dialog'],
    run: () => useApp.getState().undo(),
    enabled: () => (useApp.getState().history.past.length > 0 ? true : 'Nothing to undo'),
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    menu: EDIT,
    key: ['Ctrl+Y', 'Ctrl+Shift+Z'],
    where: ['project', 'rules', 'block-editor', 'dialog'],
    run: () => useApp.getState().redo(),
    enabled: () => (useApp.getState().history.future.length > 0 ? true : 'Nothing to redo'),
  },
  { id: 'edit.copy', label: 'Copy', menu: EDIT, key: 'Ctrl+C', native: () => !drawingsPicked(), separatorBefore: true, run: () => void copySelection(), enabled: ok(copyRefusal) },
  { id: 'edit.paste', label: 'Paste', menu: EDIT, key: 'Ctrl+V', native: true, run: () => void paste('place'), enabled: clipboard },
  { id: 'edit.paste-here', label: 'Paste here', menu: EDIT, key: 'Ctrl+Shift+V', native: true, run: () => void paste('pointer'), enabled: clipboard },
  { id: 'edit.duplicate', label: 'Duplicate', menu: EDIT, key: 'Ctrl+D', run: () => void duplicateSelection(), enabled: ok(duplicateRefusal) },
  { id: 'edit.delete', label: 'Delete', menu: EDIT, key: ['Del', 'Backspace'], quiet: () => deleteRefusal() === NOTHING_TO_DELETE, run: () => void deletePicked(), enabled: ok(deleteRefusal) },
  { id: 'edit.select-all', label: 'Select all', menu: EDIT, key: 'Ctrl+A', native: true, run: selectAllHere, enabled: ok(selectAllRefusal) },
  {
    id: 'edit.group',
    label: 'Group',
    menu: EDIT,
    key: 'Ctrl+G',
    // in the Tools strip's General group, last (`once`: it groups what is picked and is no tool in hand); its menu stays Edit
    tool: { group: 'general', icon: 'group', hint: 'Group what is picked, of any kind: it moves, copies and rotates as one', once: true },
    separatorBefore: true,
    run: () => void groupSelection(),
    enabled: ok(groupRefusal),
  },
  { id: 'edit.ungroup', label: 'Ungroup', menu: EDIT, key: 'Ctrl+Shift+G', run: () => void ungroupSelection(), enabled: ok(ungroupRefusal) },
  { id: 'edit.rename', label: 'Rename', menu: EDIT, key: 'F2', run: () => renameRef(pickedFor('rename')[0]), enabled: renameEnabled },
  {
    id: 'edit.lock',
    label: () => (lockedAll(pickedFor('lock')) ? 'Unlock' : 'Lock'),
    menu: EDIT,
    key: 'Ctrl+Shift+L',
    run: () => {
      const refs = pickedFor('lock')
      lockRefs(refs, !lockedAll(refs))
    },
    enabled: lockEnabled,
  },
  {
    id: 'edit.hide',
    label: () => (hiddenAll(pickedFor('hide')) ? 'Show' : 'Hide'),
    menu: EDIT,
    key: 'Ctrl+H',
    run: () => {
      const refs = pickedFor('hide')
      hideRefs(refs, !hiddenAll(refs))
    },
    enabled: () => (pickedFor('hide').length === 0 ? PICK_SOMETHING : true),
  },
  { id: 'edit.rotate90', label: 'Rotate 90°', menu: EDIT, key: 'Shift+R', run: () => rotateSelection(90), enabled: ok(rotateRefusal) },
  { id: 'edit.properties', label: 'Properties', menu: EDIT, run: showProperties, enabled: () => (pickedRefs().length === 0 ? PICK_SOMETHING : true) },
  { id: 'edit.shortcuts', label: 'Keyboard shortcuts…', menu: EDIT, separatorBefore: true, run: openShortcuts },
]

export function registerEdit(): void {
  register(EDIT_COMMANDS)
}
