// The mass's verbs in the one right-click menu (Phase AS.4, Decision "One menu"; the user: "selecting a mass and right-clicking should give me
// tools; selecting two should enable Group… the menu should show the options enabled and disabled", Decision "Plan menu and groups"). Its own
// verbs, in the registry's order (`kinds/core.ts`) and side by side as they were in the plan's menu:
//   Group · Ungroup · Union  │  Rotate 90°  │  Own platform · Back to the building's (with ground) · Split at line … (on a grid)  │
//   To building ▸ (To a new building, then every other building of the option)  │  Program ▸ (each program, then No program)
// and the warehouse's two (`modules/warehouse/views/menuVerbs.ts`) above them. A row that is a command (Group, Ungroup, Union, Rotate 90°) is
// that command: its label, its key and, greyed, its reason are the registry's. The reasons of the others are the plan menu's, word for word.
// Of the base verbs the mass says three in its own way: Delete (it removes the selected masses, as the row always did: the Delete key removes
// what is picked, a corner or a hole first), Select all masses (the level's, but for the locked and the hidden) and the title of its Lock.
import type { Ref } from '../../../../kinds/types.ts'
import { buildingOf, optionOf } from '../../../../engine/buildings.ts'
import { massPlatformRows } from '../../../../modules/terrain/views/platformCommands.ts'
import { useApp } from '../../../../state/store.ts'
import type { MenuEntry } from '../../../controls/Menu.tsx'
import { detailOf } from '../../../commands/shortcuts.ts'
import { buildingLocked } from '../../../../kinds/locked.ts'
import { lockedFirst } from '../../../layers/locks.ts'
import { assign, NEW_BUILDING } from '../../../panels/buildingCommands.ts'
import { splitItems } from '../../../panels/gridCommands.ts'
import { assignProgramToSelection } from '../../../panels/programCommands.ts'
import { deleteSelection, lockedRefusal, selectAllHere, selectAllRefusal } from '../../../plan/massCommands.ts'
import { lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'

// the kind's label is *Block* (Decision "Draw makes a block"): its titles count blocks
const count = (n: number) => (n === 1 ? '1 block' : `${n} blocks`)
const idsOf = (refs: Ref[]) => refs.filter((r) => r.kind === 'mass').map((r) => r.id)

/** The selection to a new building, or to another building of the active option (Decision "Masses to a building"): a sub-menu, with no cap. */
function buildingItems(refs: Ref[]): MenuEntry[] {
  const ids = idsOf(refs)
  const { project, option } = useApp.getState()
  const o = optionOf(project, option)
  const theirs = new Set(project.masses.filter((m) => ids.includes(m.id)).map((m) => buildingOf(project, m).id))
  const others = o.buildingIds
    .filter((id) => !(theirs.size === 1 && theirs.has(id)))
    .flatMap((id) => project.buildings.filter((b) => b.id === id))
  return [
    { key: 'to-new-building', label: 'To a new building', title: `${count(ids.length)} into a new building of ${o.name}, each on its level`, onSelect: () => assign(ids, o.id, NEW_BUILDING) },
    // a locked building holds its masses: nothing goes into it (its own *Assign* is greyed for the same reason)
    ...others.map((b): MenuEntry => {
      const locked = buildingLocked(project, b.id)
      return { key: `to-${b.id}`, label: `To ${b.name}`, ...(locked ? { disabled: true } : {}), title: locked ? lockedFirst(1, 'building') : `${count(ids.length)} into ${b.name}, each on its level`, onSelect: () => assign(ids, o.id, b.id) }
    }),
  ]
}

/** The programs of the brief, one row each (all of them: the menu scrolls when it is long), ticked when every selected mass has it, and *No program*. */
function programItems(refs: Ref[]): MenuEntry[] {
  const ids = idsOf(refs)
  const { project } = useApp.getState()
  const masses = project.masses.filter((m) => ids.includes(m.id))
  const ticked = (programId: string | null) => masses.length > 0 && masses.every((m) => m.programId === programId)
  const row = (key: string, label: string, programId: string | null): MenuEntry => ({
    key,
    label,
    checked: ticked(programId),
    title: programId === null ? `${count(ids.length)} without a program` : `${count(ids.length)} become ${label}`,
    onSelect: () => assignProgramToSelection(programId),
  })
  return [...project.programs.map((p) => row(`program-${p.id}`, p.name, p.id)), row('program-none', 'No program', null)]
}

/** The platform's row of the mass kind: `step` is *Own platform*, `unstep` *Back to the building's*. */
const platformRow = (key: 'step' | 'unstep') => (refs: Ref[]): MenuEntry[] => massPlatformRows(idsOf(refs)).filter((r) => r !== 'separator' && r.key === key)

registerKind('mass', {
  own: {
    group: { group: 'edit', command: 'edit.group', title: (refs) => `${count(refs.length)} become one group: picked, moved and turned as one` },
    ungroup: { group: 'edit', command: 'edit.ungroup', title: () => 'Their group comes apart: each block on its own' },
    union: { group: 'edit', command: 'tool.union', title: (refs) => `${count(refs.length)} become one block: their outlines united, no walls between them` },
    rotate90: { group: 'turn', command: 'edit.rotate90', title: () => 'A quarter turn anticlockwise' },
    'own-platform': { group: 'placement', rows: platformRow('step') },
    'back-to-building': { group: 'placement', rows: platformRow('unstep') },
    'split-at-line': { group: 'placement', rows: (refs, at) => splitItems(idsOf(refs), at) },
    'to-building': { group: 'building', items: buildingItems },
    program: { group: 'program', items: programItems },
  },
  base: {
    delete: { enabled: () => lockedRefusal() ?? true, title: (refs) => `Delete ${count(refs.length)}`, run: () => deleteSelection() },
    'select-all': {
      title: () => 'Every block of this level, but the locked and the hidden',
      enabled: () => selectAllRefusal() ?? true,
      detail: () => detailOf('edit.select-all').detail,
      run: () => selectAllHere(),
    },
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to move, resize and delete again' : 'Its footprint and height stay as they are; it cannot be deleted') },
  },
})
