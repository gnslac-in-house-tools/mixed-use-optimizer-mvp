// The building's verbs in the one right-click menu (Phase AS.4 task 5, Decision "One menu"): the Layers tree's building menu, moved, and the same one for several buildings picked.
// A building is a row of Layers, never picked on the plan. Its own verbs, in the registry's order and side by side by group:
//   Assign the selection · Select its masses  │  Context  │  Join platform with … · Own platform (with ground)  │  In another option ▸ · Make unique · Remove from the option
// then Delete (its masses go with it, after asking), and Rename (in its row), Select all buildings, Lock (its own flag: `lockBuildings`) and Hide, and Properties (it becomes the active
// building). With several picked only *Remove N from the option*, Delete, Select all, Lock and Hide stay, their labels with the count (as the several-buildings menu had them).
// A locked building holds its data, every mass in it and its place in each option: what would change them is greyed, with "A locked building: unlock first". The reasons of the rest are
// the old menu's, word for word (`panels/buildingCommands.ts` `whyNotDelete…`).
import { buildingPlatformItems } from '../../../../modules/terrain/views/platformCommands.ts'
import { buildingOf } from '../../../../engine/buildings.ts'
import { buildingLocked } from '../../../../kinds/locked.ts'
import type { Ref } from '../../../../kinds/types.ts'
import type { Building, Id } from '../../../../model/schema.ts'
import { useApp } from '../../../../state/store.ts'
import { detailOf } from '../../../commands/shortcuts.ts'
import type { MenuEntry } from '../../../controls/Menu.tsx'
import { lockedFirst } from '../../../layers/locks.ts'
import {
  assign,
  copyBuildingInto,
  deleteBuildings,
  dropBuilding,
  makeUnique,
  optionsShowing,
  removeAllFromOption,
  removeFromOption,
  selectBuildingMasses,
  showBuildingProperties,
  updateBuilding,
  whyNotDelete,
  whyNotDeleteAll,
  whyNotRemoveAll,
  whyNotRemoveFromOption,
} from '../../../panels/buildingCommands.ts'
import { showProperties } from '../../../plan/massCommands.ts'
import { pickRefs } from '../../../plan/mix.ts'
import { allOfKind } from '../../selectAll.ts'
import { hiddenAll, hideRefs, lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'

const count = (n: number) => (n === 1 ? '1 mass' : `${n} masses`)
const NOTHING = 'Select masses first (in the plan, the 3D or here)'

const state = () => useApp.getState()
/** The buildings these refs name, in the project. */
const buildingsOf = (refs: Ref[]): Building[] => {
  const ids = new Set(refs.filter((r) => r.kind === 'building').map((r) => r.id))
  return state().project.buildings.filter((b) => ids.has(b.id))
}
const first = (refs: Ref[]): Building | undefined => buildingsOf(refs)[0]
const one = (refs: Ref[]) => refs.length === 1 && first(refs) !== undefined
const optionNow = () => state().project.options.find((o) => o.id === state().option)!
/** Why a locked building cannot be changed this way; null when it is free. */
const whyLocked = (b: Building | undefined): string | null => (b && buildingLocked(state().project, b.id) ? lockedFirst(1, 'building') : null)

/** A row of the platform's (`join:<building>`, `own-platform`) for this building, greyed when it is locked: a platform is its data. */
function platformRows(refs: Ref[], pick: (key: string) => boolean): MenuEntry[] {
  const b = first(refs)
  if (!b) return []
  const { project } = state()
  const locked = whyLocked(b)
  return buildingPlatformItems(project, optionNow(), b).flatMap((item): MenuEntry[] => (item === 'separator' || !pick(item.key) ? [] : [locked ? { ...item, disabled: true, title: locked } : item]))
}

/** *In another option*: the same building shown there (*Link to*), or a copy of its own (*Copy to*), for each other option (all of them: the menu scrolls). */
function otherOptions(refs: Ref[]): MenuEntry[] {
  const b = first(refs)
  if (!b) return []
  const { project, option } = state()
  return project.options
    .filter((x) => x.id !== option)
    .flatMap((x): MenuEntry[] => {
      const there = x.buildingIds.includes(b.id)
      return [
        {
          key: `link-${x.id}`,
          label: `Link to ${x.name}`,
          disabled: there,
          title: there ? `${b.name} is in ${x.name} already` : `${x.name} shows the same building: what changes in one shows in both`,
          onSelect: () => dropBuilding(b.id, x.id, null),
        },
        { key: `copy-${x.id}`, label: `Copy to ${x.name}`, title: `A copy of its own in ${x.name}, not linked`, onSelect: () => copyBuildingInto(b.id, x.id, null) },
      ]
    })
}

/** The masses selected, for *Assign the selection*. */
const selected = (): Id[] => state().selection.massIds

registerKind('building', {
  own: {
    assign: {
      group: 'masses',
      present: one,
      label: (refs) => `Assign selection to ${first(refs)!.name}`,
      detail: () => (selected().length ? count(selected().length) : undefined),
      enabled: (refs) => {
        const b = first(refs)!
        const { project } = state()
        const n = selected().length
        const already = n > 0 && optionNow().buildingIds.includes(b.id) && selected().every((id) => ((m) => m !== undefined && buildingOf(project, m).id === b.id)(project.masses.find((x) => x.id === id)))
        return whyLocked(b) ?? (n === 0 ? NOTHING : already ? 'They are in it already' : true)
      },
      title: (refs) => `Rhino's "Change object layer": they go into ${first(refs)!.name}, in ${optionNow().name}`,
      run: (refs) => assign(selected(), state().option, first(refs)!.id),
    },
    'select-masses': {
      group: 'masses',
      present: one,
      title: () => 'The ones the plan shows',
      run: (refs) => selectBuildingMasses(state().option, first(refs)!),
    },
    context: {
      group: 'building',
      present: one,
      checked: (refs) => first(refs)?.context === true,
      enabled: (refs) => whyLocked(first(refs)) ?? true,
      title: () => 'Drawn grey, left out of the KPIs and its own checks',
      run: (refs) => updateBuilding(first(refs)!.id, { context: first(refs)!.context !== true }),
    },
    'join-platform': { group: 'platform', present: one, rows: (refs) => platformRows(refs, (k) => k.startsWith('join')) },
    'own-platform': { group: 'platform', present: one, rows: (refs) => platformRows(refs, (k) => k === 'own-platform') },
    'in-another-option': {
      group: 'option',
      present: (refs) => one(refs) && state().project.options.length > 1,
      title: () => 'The same building shown in another option, or a copy of its own',
      items: otherOptions,
    },
    'make-unique': {
      group: 'option',
      present: (refs) => one(refs) && optionsShowing(state().project, first(refs)!.id).length > 1,
      label: () => `Make unique in ${optionNow().name}`,
      enabled: (refs) => whyLocked(first(refs)) ?? true,
      title: () => `${optionNow().name} gets its own copy`,
      run: (refs) => makeUnique(first(refs)!, state().option),
    },
    // in no other option, taking one out would delete it: *Delete* is that (Decision "No loose buildings")
    'remove-from-option': {
      group: 'option',
      present: (refs) => refs.length > 1 || (one(refs) && optionsShowing(state().project, first(refs)!.id).length > 1),
      label: (refs) => (refs.length > 1 ? `Remove ${refs.length} from ${optionNow().name}` : `Remove from ${optionNow().name}`),
      enabled: (refs) => (refs.length > 1 ? whyNotRemoveAll(state().project, state().option, buildingsOf(refs).map((b) => b.id)) : whyNotRemoveFromOption(state().project, state().option, first(refs))) ?? true,
      title: (refs) => (refs.length > 1 ? 'Those in no other option are deleted, with their masses' : 'It stays in the other options'),
      run: (refs) => (refs.length > 1 ? removeAllFromOption(buildingsOf(refs), state().option) : removeFromOption(first(refs)!, state().option)),
    },
  },
  base: {
    delete: {
      label: (refs) => (refs.length > 1 ? `Delete ${refs.length} buildings` : 'Delete'),
      enabled: (refs) => (refs.length > 1 ? whyNotDeleteAll(state().project, buildingsOf(refs).map((b) => b.id)) : whyNotDelete(state().project, first(refs)!)) ?? true,
      title: (refs) => (refs.length > 1 ? 'With their masses, from every option (asks first)' : 'With its masses, from every option'),
      run: (refs) => deleteBuildings(buildingsOf(refs)),
    },
    // every building of the option, picked as rows (a locked or hidden one too: the row reaches it)
    'select-all': {
      title: () => 'Every building of the option',
      enabled: () => (allOfKind('building').length > 0 ? true : 'No buildings to select'),
      run: () => pickRefs(allOfKind('building')),
    },
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to change again, with every mass in it' : 'Its data and every mass in it stay as they are; it cannot be deleted') },
    // the count says how many (as the several-buildings menu had it); the key is Hide's
    hide: {
      label: (refs) => {
        const word = hiddenAll(refs) ? 'Show' : 'Hide'
        return refs.length > 1 ? `${word} ${refs.length} buildings` : word
      },
      detail: () => detailOf('edit.hide').detail,
      title: (refs) => (hiddenAll(refs) ? 'Drawn in the plan and the 3D again' : 'Not drawn in the plan or the 3D (the building the plan is on stays); it still counts'),
      run: (refs) => hideRefs(refs, !hiddenAll(refs)),
    },
    properties: {
      label: () => 'Properties',
      title: (refs) => (refs.length > 1 ? 'Their settings in the Properties tab' : 'Its name, colour, level height and levels (it becomes the active building)'),
      run: (refs) => (one(refs) ? showBuildingProperties(state().option, first(refs)!) : showProperties()),
    },
  },
})
