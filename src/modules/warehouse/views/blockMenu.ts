// The warehouse module's verbs on the `block-type` kind (Phase AS.4 task 6, Decision "One menu"): the right-click menu of a block in the Blocks tab, from the kind
// (`modules/warehouse/kinds.ts`) and the one builder (`views/editing/menu/build.ts`). A ref is a project's type (its id) or a library block (`block:<id>`,
// as a drag carries it); each row does what its button did:
//   a project's block   Place (`placeCopy`) · Edit (`openType`) · Select its copies on the site · Save to the library (`saveToLibrary`) · Download .gfb
//                       │ Duplicate · Delete (`duplicateTypes`, `removeTypes`) │ Rename (its card's name becomes a field) · Select all blocks
//   a library block     Place (it comes into the project, linked, with a copy) · Download .gfb │ Remove from the library (this browser's own only; it asks first)
//   several             Download .gfb │ Duplicate · Delete N blocks (project blocks alone: a library block among them leaves those two out)
// *Select its copies on the site* picks the masses of the buildings that are copies of the type, in the option in view, the locked and the hidden left
// out. Registered through `views/editing/menu/modules.ts`.
import { optionBuildings, optionOf } from '../../../engine/buildings.ts'
import type { Ref } from '../../../kinds/types.ts'
import { blockFileName, writeBlockFile } from '../../../io/blocks.ts'
import type { Id, WarehouseType } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { detailOf } from '../../../views/commands/shortcuts.ts'
import { registerKind, type Runner } from '../../../views/editing/menu/verbs.ts'
import { download } from '../../../views/layout/browserIo.ts'
import { useToast } from '../../../views/layout/toast.ts'
import { building as buildingKey, mass as massKey } from '../../../views/layers/keys.ts'
import { hiddenNow } from '../../../views/layers/layerView.ts'
import { isMassLocked } from '../../../views/layers/locks.ts'
import { pickRefs } from '../../../views/plan/mix.ts'
import { draggedBlock, fileOf, libraryBlock, removeBlock } from './blockLibrary.ts'
import { projectIds, useBlockPick } from './blockPick.ts'
import { duplicateTypes, openType, placeCopy, removeTypes } from './commands.ts'
import { saveToLibrary, useSaveAsk } from './SaveBlock.tsx'

const state = () => useApp.getState()

/** The project's type of a ref (absent: a library block, or gone). */
const typeOf = (r: Ref): WarehouseType | undefined => (draggedBlock(r.id) === null ? state().project.warehouseTypes?.find((t) => t.id === r.id) : undefined)
/** The type's name, or the library block's. */
const nameOf = (r: Ref): string => {
  const lib = draggedBlock(r.id)
  return typeOf(r)?.name ?? (lib !== null ? libraryBlock(lib)?.block.type.name : undefined) ?? 'This block'
}

const one = (refs: Ref[]): boolean => refs.length === 1
/** One block of the project. */
const oneOfProject = (refs: Ref[]): boolean => one(refs) && typeOf(refs[0]) !== undefined
/** Only blocks of the project (a library block among them leaves Duplicate and Delete out). */
const allOfProject = (refs: Ref[]): boolean => refs.length > 0 && refs.every((r) => typeOf(r) !== undefined)
/** Every ref is a block of this browser's own shelf: the ones that can be removed from the library. */
const allMine = (refs: Ref[]): boolean => refs.length > 0 && refs.every((r) => { const id = draggedBlock(r.id); return id !== null && libraryBlock(id)?.shelf === 'browser' })

/** The masses of the copies of this type in the option in view that Select its copies takes: neither locked nor hidden. */
export function copiesOf(typeId: Id): Id[] {
  const { project, option } = state()
  const off = hiddenNow()
  return optionBuildings(project, optionOf(project, option))
    .filter((b) => b.warehouse?.type === typeId && !off.has(buildingKey(b.id)))
    .flatMap((b) => {
      const levels = new Set(b.levels.map((l) => l.id))
      return project.masses.filter((m) => levels.has(m.levelId) && !off.has(massKey(m.id)) && !isMassLocked(m.id)).map((m) => m.id)
    })
}

/** Downloads each block's file (.gfb). */
function downloadFiles(refs: Ref[]): void {
  for (const r of refs) {
    const lib = draggedBlock(r.id)
    const block = lib !== null ? libraryBlock(lib)?.block : fileOf(state().project, r.id)
    if (!block) {
      useToast.getState().show('error', `${nameOf(r)} has no program yet: there is no file to write.`)
      continue
    }
    download(new Blob([writeBlockFile(block)], { type: 'application/json' }), blockFileName(block))
  }
}

const own: Record<string, Runner> = {
  place: {
    group: 'block',
    present: one,
    title: (refs) => (draggedBlock(refs[0].id) !== null ? `${nameOf(refs[0])} comes into the project, linked, with a copy in the middle of what can be built` : `A copy of ${nameOf(refs[0])} in the middle of what can be built`),
    run: (refs) => placeCopy(refs[0].id),
  },
  edit: {
    group: 'block',
    present: oneOfProject,
    title: (refs) => `${nameOf(refs[0])}'s rules in the Program window: every copy follows`,
    run: (refs) => openType(refs[0].id),
  },
  'select-copies': {
    group: 'block',
    present: oneOfProject,
    enabled: (refs) => (copiesOf(refs[0].id).length > 0 ? true : 'No copies of it on the site in this option, or they are locked or hidden'),
    title: (refs) => `The masses of the copies of ${nameOf(refs[0])} in this option`,
    run: (refs) => pickRefs(copiesOf(refs[0].id).map((id) => ({ kind: 'mass', id }))),
  },
  'save-to-library': {
    group: 'block',
    present: oneOfProject,
    title: (refs) => (typeOf(refs[0])?.library ? `${nameOf(refs[0])} is linked to a library block: the Program window asks to overwrite it or save a copy` : `${nameOf(refs[0])} becomes a block of the library`),
    run: (refs) => {
      const t = typeOf(refs[0])
      if (!t) return
      // a type linked to a block asks, as its button does, whether to overwrite or save a copy; one that is not becomes a new block
      if (t.library) {
        openType(t.id)
        useSaveAsk.setState({ typeId: t.id })
      } else saveToLibrary(t, 'copy')
    },
  },
  download: {
    group: 'block',
    title: (refs) => (refs.length > 1 ? 'Each one’s file (.gfb): to share it, or to publish it for the team' : 'Its file (.gfb): to share it, or to publish it for the team in src/state/blocks/'),
    run: downloadFiles,
  },
  'remove-from-library': {
    group: 'library',
    present: allMine,
    title: (refs) => `Forget ${refs.length > 1 ? 'these blocks' : 'this block'} in this browser (projects linked to ${refs.length > 1 ? 'them' : 'it'} keep ${refs.length > 1 ? 'them' : 'it'} as ${refs.length > 1 ? 'they are' : 'it is'})`,
    run: (refs) => {
      const ids = refs.flatMap((r) => draggedBlock(r.id) ?? [])
      const what = refs.length > 1 ? `these ${refs.length} blocks` : `“${nameOf(refs[0])}”`
      useToast.getState().confirm(`Remove ${what} from this browser’s blocks? Projects that use ${refs.length > 1 ? 'them' : 'it'} keep ${refs.length > 1 ? 'them' : 'it'} as ${refs.length > 1 ? 'they are' : 'it is'}.`, () => ids.forEach(removeBlock))
    },
  },
}

registerKind('block-type', {
  own,
  // the card's name (a project's block, or a library's: `block:<id>`), for the menu's own name
  name: (r) => nameOf(r),
  base: {
    // the name is edited in its card
    rename: {
      present: oneOfProject,
      label: () => 'Rename',
      detail: () => detailOf('edit.rename').detail,
      title: () => 'Edit its name in its card',
      run: (refs) => useBlockPick.getState().rename(refs[0].id),
    },
    duplicate: {
      present: allOfProject,
      label: () => 'Duplicate',
      detail: () => detailOf('edit.duplicate').detail,
      title: () => 'A copy of each, with a program of its own',
      run: (refs) => {
        const made = duplicateTypes(projectIds(refs.map((r) => r.id)))
        if (made.length > 0) useBlockPick.getState().set(made)
      },
    },
    delete: {
      present: allOfProject,
      label: (refs) => (refs.length > 1 ? `Delete ${refs.length} blocks` : 'Delete'),
      detail: () => detailOf('edit.delete').detail,
      title: () => 'Their programs keep their general level; their copies stay, unlinked',
      run: (refs) => {
        removeTypes(refs.map((r) => r.id))
        useBlockPick.getState().clear()
      },
    },
    'select-all': {
      present: oneOfProject,
      title: () => 'Every block of the project the tab shows',
      run: () => {
        const { order } = useBlockPick.getState()
        useBlockPick.getState().set(projectIds(order))
      },
    },
  },
})
