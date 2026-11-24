// The one builder of the right-click menu (Phase AS.4, Decision "One menu"): from what is picked (`Ref`s) and where the menu was asked for, the
// entries of the AS.1 `Menu` (`controls/Menu.tsx`), in the user's order, the same in the plan, the 3D, Layers and the Blocks tab:
//   the kind's own verbs  │  Copy · Paste · Paste here · Duplicate · Delete  │  Rename · Select all <kind> · Lock · Hide  │  Properties
// A part that has nothing is left out with its separator: no leading, trailing or doubled one. What each kind takes is the registry's
// (`kinds/`: `kindOf`, `ownVerbsOf`); what a verb does is its runner (`verbs.ts`). **A base verb the kind does not take is absent** (a gate has
// no name: no Rename); **one that cannot run now is greyed**, its reason as the title (Group with one mass picked): a base verb's row is the
// registry's command, so its label, its key and its reason are the command's (Lock and Hide are the two that read the refs the menu is of, not what is
// picked: their rows say Unlock and Show when all of them are locked or hidden, and act on them, with the commands' keys). A kind's own verb with no runner registered is left out
// (the kinds of the plan's other things register theirs as they get their menu).
// Several kinds picked: the shared own verbs every kind has (Group, Ungroup) first, no other own verb, no Rename, Duplicate or Select all; Copy (with Paste and Paste here), Delete, Lock and Hide show when
// every kind takes them; Properties stays. Nothing picked: Paste · Paste here, then Select all. **Paste here is where the menu has a point** (`at`: the plan's click):
// Layers, the 3D and the Blocks tab have Paste only. The menu is named after what it is of (`menuName`): the thing's name, "3 masses", "2 things"; Delete keeps its count in its
// label ("Delete 3 masses"). Unlock of a mass or a level its locked building holds is greyed with the Layers row's reason. A kind says a base verb in its own way with a runner
// (`baseRunner`: the grid's Hide and Properties, a drawing file's Remove, every kind's Select all); the rest are the registry's commands. `at`: where the
// plan's click was (Paste here goes there; the grid's split asks which line is nearest).
import { kindOf, ownVerbsOf } from '../../../kinds/index.ts'
import type { BaseVerb, Kind, Ref } from '../../../kinds/types.ts'
import type { Point } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import type { MenuEntry } from '../../controls/Menu.tsx'
import { clipboardHolds, paste } from '../../plan/clipboard.ts'
import { DRAWING_STAYS } from '../../plan/massCommands.ts'
import { detailOf } from '../../commands/shortcuts.ts'
import { nameOfRef } from '../../layers/locks.ts'
import { hiddenAll, hideRefs, lockedAll, lockRefs, renameRef, renameWhy, takesOps, whyNotUnlock, type RefVerb } from '../refOps.ts'
import { BRANCH, branchMenu, branchName } from './kinds/branch.ts'
import { groupRunners } from './kinds/common.ts'
import './kinds/index.ts'
import './modules.ts'
import { baseRunner, commandRow, nameRunner, ownRunner, rowsOf, type MenuPlace, type Runner } from './verbs.ts'

export type { MenuPlace } from './verbs.ts'

/** The place's name: the menu's name only when nothing is picked (there is no thing to name it after). */
export const MENU_LABEL: Record<MenuPlace, string> = { plan: 'Plan', '3d': '3D', layers: 'Layers', blocks: 'Blocks' }

/** What a person calls one of these: the kind's say (a block's name), else the core's (`nameOfRef`: a mass, a lot, a building, a level…), else the kind's label. */
const nameOfOne = (r: Ref): string => nameRunner(r) ?? nameOfRef(r)

/**
 * The menu's name, for its `aria-label` (a screen reader says what the menu is of, not where it opened): one thing, its name (or its kind's label where it has none: a block's part, the
 * grid); several of one kind, "3 masses"; of several kinds, "3 things"; a branch row, its kind's plural; nothing picked, the place's.
 */
export function menuName(refs: Ref[], place: MenuPlace): string {
  if (refs.length === 0) return MENU_LABEL[place]
  const project = useApp.getState().project
  if (refs.length === 1 && refs[0].kind === BRANCH) return branchName(refs[0].id) ?? MENU_LABEL[place]
  const known = refs.filter((r) => kindOf(r.kind, project) !== undefined)
  if (known.length === 0) return MENU_LABEL[place]
  const kinds = [...new Set(known.map((r) => r.kind))].map((id) => kindOf(id, project)!)
  return known.length === 1 ? nameOfOne(known[0]) : thing(kinds, known.length)
}

/** The verbs only one kind picked takes: with several kinds they are left out. */
const ONE_KIND: BaseVerb[] = ['rename', 'duplicate', 'select-all']
/** The verbs that need a row in the kind's table of `refOps.ts` (how to lock, hide or rename it) to be offered. */
const NEEDS_OPS: BaseVerb[] = ['rename', 'lock', 'hide']

/** The kinds whose name is edited in their row of Layers, not in Properties. */
const ROW_NAMED = ['building', 'level']

/** The kinds of the site's drawings: not copied, removed from their file's row in Layers. */
const DRAWING_KINDS = ['drawing', 'drawing-layer', 'parcels']

const thing = (kinds: Kind[], n: number): string => (kinds.length === 1 ? `${n} ${(n === 1 ? kinds[0].label : kinds[0].plural).toLowerCase()}` : `${n} things`)

/** The entries of the menu for what is picked; none when nothing in it is known. */
export function menuFor(refs: Ref[], place: MenuPlace, at: Point | null = null): MenuEntry[] {
  void place // the same entries wherever it was asked: the place only names the menu (`MENU_LABEL`)
  const project = useApp.getState().project
  if (refs.length === 0) return nothingPicked(at)
  // a branch row of Layers (Streets, Gates…) is not an object: its own short menu
  if (refs.length === 1 && refs[0].kind === BRANCH) return branchMenu(refs[0].id)
  const known = refs.filter((r) => kindOf(r.kind, project) !== undefined)
  const kinds = [...new Set(known.map((r) => r.kind))].map((id) => kindOf(id, project)!)
  if (kinds.length === 0) return []
  const single = kinds.length === 1 ? kinds[0] : null
  const noun = thing(kinds, known.length)

  /** Whether every kind picked takes this base verb (and, where the verb needs it, has a way to do it). */
  const takes = (verb: BaseVerb): boolean =>
    (single !== null || !ONE_KIND.includes(verb)) &&
    kinds.every(
      (k) =>
        k.base.includes(verb) &&
        // a kind that renames in its own way (a block's card) needs no row in the ops table
        (!NEEDS_OPS.includes(verb) || takesOps(k.id, verb as RefVerb) || (verb === 'rename' && baseRunner(k.id, verb)?.run !== undefined)) &&
        (verb !== 'select-all' || baseRunner(k.id, verb) !== undefined) &&
        // a runner may leave its verb out for these refs (Duplicate with a library block among the blocks picked)
        (baseRunner(k.id, verb)?.present?.(known.filter((r) => r.kind === k.id)) ?? true),
    )
  /** A base verb's row: the kind's own way of saying it (a runner with a run or a reason), else the registry's command. */
  const row = (verb: BaseVerb, command: string, title: string): MenuEntry => {
    const r = single ? baseRunner(single.id, verb) : undefined
    if (single && r && (r.enabled || r.run)) return baseRow(single, verb, r, known, at)
    return commandRow(verb, command, r?.title?.(known) ?? title)
  }

  /** Delete picked for several things says how many ("Delete 3 masses"), unless the kind words it itself ("Delete 3 buildings"). */
  const counted = (entry: MenuEntry): MenuEntry => (entry === 'separator' || known.length < 2 || (single && baseRunner(single.id, 'delete')?.label) ? entry : { ...entry, label: `Delete ${noun}` })

  // 1. the kind's own verbs, in the registry's order, side by side by group
  const own: MenuEntry[] = []
  if (single) {
    let last: string | undefined
    for (const verb of ownVerbsOf(single.id, project)) {
      const r = ownRunner(single.id, verb.id)
      if (!r || (r.present && !r.present(known))) continue
      const rows = rowsOf(verb, r, known, at)
      if (rows.length === 0) continue
      const group = r.group ?? verb.id
      if (last !== undefined && group !== last) own.push('separator')
      last = group
      own.push(...rows)
    }
  } else {
    // several kinds: the shared own verbs (Group, Ungroup; Phase AS.5 task 6) that every kind picked has, first. They are the same two commands for
    // every kind, so one runner (`groupRunners`, worded for things) says them for all
    const shared = groupRunners() as Record<string, Runner>
    for (const verb of ownVerbsOf(kinds[0].id, project)) {
      if (verb.shared !== true || shared[verb.id] === undefined) continue
      if (!kinds.every((k) => ownVerbsOf(k.id, project).some((v) => v.id === verb.id && v.shared === true) && ownRunner(k.id, verb.id) !== undefined)) continue
      own.push(...rowsOf(verb, shared[verb.id], known, at))
    }
  }

  // 2. the clipboard: Copy with Paste and Paste here, Duplicate, Delete
  const clip: MenuEntry[] = []
  if (takes('copy')) {
    const copied = clipboardHolds()
    clip.push(commandRow('copy', 'edit.copy', `Copy ${noun}`))
    clip.push(commandRow('paste', 'edit.paste', `${copied}, in place: where it was copied from`))
    // the key pastes at the pointer; the row, where the menu was opened: only a menu with a point (the plan's) has it, the others have Paste
    if (at !== null) clip.push(commandRow('paste-here', 'edit.paste-here', `${copied}, centred where you right-clicked`, () => void paste('pointer', at)))
  }
  if (takes('duplicate')) clip.push(row('duplicate', 'edit.duplicate', 'A copy beside them'))
  // a drawing picked alone is removed from its file's row in Layers (Decision "Drawing pick"): Delete says where
  const drawings = known.every((r) => DRAWING_KINDS.includes(r.kind))
  if (takes('delete')) clip.push(counted(row('delete', 'edit.delete', drawings ? DRAWING_STAYS : `Delete ${noun}`)))

  // 3. Rename, Select all <kind>, Lock, Hide
  const base: MenuEntry[] = []
  // Rename reads, and acts on, the refs the menu is of (a building's right-click keeps the masses selected, for Assign: what is picked is not what the menu is of); its label and key are the command's
  const renamer = single ? baseRunner(single.id, 'rename') : undefined
  if (takes('rename') && single && renamer?.run) {
    // a kind that renames in its own way (a block's card) says it in its runner
    base.push(baseRow(single, 'rename', renamer, known, at))
  } else if (takes('rename')) {
    const why = known.length === 1 ? renameWhy(known[0]) : 'Rename one thing at a time'
    base.push({ key: 'rename', label: 'Rename', ...detailOf('edit.rename'), disabled: why !== null, title: why ?? (single && ROW_NAMED.includes(single.id) ? 'Edit its name in its row' : 'Edit its name in Properties'), onSelect: () => renameRef(known[0]) })
  }
  if (single && takes('select-all')) base.push(baseRow(single, 'select-all', baseRunner(single.id, 'select-all')!, known, at))
  // Lock and Hide read, and act on, the refs the menu is of (their keys are the commands'): Unlock and Show when all of them are locked or hidden
  if (takes('lock')) {
    const all = lockedAll(known)
    const title = (single && baseRunner(single.id, 'lock')?.title?.(known)) || (all ? 'Free to move, resize and delete again' : 'Its shape stays as it is; it cannot be deleted')
    // what its building's padlock holds is not freed by its own: the row is greyed with the Layers row's reason
    base.push(stateRow('lock', 'edit.lock', all, ['Lock', 'Unlock'], title, () => lockRefs(known, !all), whyNotUnlock(known)))
  }
  if (takes('hide')) {
    const all = hiddenAll(known)
    // a kind with its own way to hide (the grid's switch) says it in its runner
    base.push(single && baseRunner(single.id, 'hide')?.run ? row('hide', 'edit.hide', '') : stateRow('hide', 'edit.hide', all, ['Hide', 'Show'], all ? 'Drawn in the plan and the 3D again, and picked' : 'Not drawn in the plan or the 3D, not picked; it still counts', () => hideRefs(known, !all)))
  }

  // 4. Properties, alone and last
  const props: MenuEntry[] = takes('properties') ? [row('properties', 'edit.properties', 'Their fields in the Properties tab')] : []

  return joined([own, clip, base, props])
}

/** A row of a verb that has two states, one label each (Lock · Unlock, Hide · Show), on the refs the menu is of: its key is its command's; greyed only with a reason (`why`). */
function stateRow(key: BaseVerb, commandId: string, on: boolean, labels: [string, string], title: string, run: () => void, why: string | null = null): MenuEntry {
  return { key, label: on ? labels[1] : labels[0], ...detailOf(commandId), disabled: why !== null, title: why ?? title, onSelect: run }
}

/** A base verb a kind says in its own way (the mass's Delete, its Select all): the row its runner makes. */
function baseRow(kind: Kind, verb: BaseVerb, r: Runner, refs: Ref[], at: Point | null): MenuEntry {
  const why = r.enabled?.(refs) ?? true
  const label = r.label?.(refs) ?? (verb === 'select-all' ? `Select all ${kind.plural.toLowerCase()}` : verb === 'delete' ? 'Delete' : verb)
  const detail = r.detail?.(refs)
  return { key: verb, label, ...(detail ? { detail } : {}), disabled: why !== true, title: why === true ? r.title?.(refs) : why, onSelect: () => r.run?.(refs, at) }
}

/** A right-click on empty ground, nothing picked: Paste · Paste here, then Select all. */
function nothingPicked(at: Point | null): MenuEntry[] {
  const copied = clipboardHolds()
  return joined([
    [
      commandRow('paste', 'edit.paste', `${copied}, in place: where it was copied from`),
      ...(at !== null ? [commandRow('paste-here', 'edit.paste-here', `${copied}, centred where you right-clicked`, () => void paste('pointer', at))] : []),
    ],
    [commandRow('select-all', 'edit.select-all', 'Every block of this level')],
  ])
}

/** The parts with a separator between each two that have something: none leading, trailing or doubled. */
function joined(parts: MenuEntry[][]): MenuEntry[] {
  return parts.filter((p) => p.length > 0).flatMap((p, i) => (i === 0 ? p : ['separator' as const, ...p]))
}
