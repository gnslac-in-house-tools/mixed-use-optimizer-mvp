// The level's verbs in the one right-click menu (Phase AS.4 task 5, Decision "One menu"): the Layers tree's level menu, moved, for one level or several picked. Its own *Go to <level>*
// (one level only), then Delete (*Delete level* with its masses as the quiet word, or *Delete N levels*; they go with their masses, after asking), Rename (in its row), Lock (its masses:
// a level's padlock is their sum) and Properties (its building's). A building keeps one level at least, and a locked mass on them, or their locked building, refuses the delete: the row
// is greyed with the reason, in the words the old menu used.
import { buildingOfLevel } from '../../../../engine/buildings.ts'
import { buildingLocked } from '../../../../kinds/locked.ts'
import type { Ref } from '../../../../kinds/types.ts'
import type { Id, Level } from '../../../../model/schema.ts'
import { useApp } from '../../../../state/store.ts'
import { lockedAmong, lockedFirst } from '../../../layers/locks.ts'
import { deleteLevels } from '../../../panels/buildingCommands.ts'
import { lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'

const count = (n: number) => (n === 1 ? '1 mass' : `${n} masses`)
const ids = (refs: Ref[]): Id[] => refs.filter((r) => r.kind === 'level').map((r) => r.id)
const masses = (refs: Ref[]) => useApp.getState().project.masses.filter((m) => ids(refs).includes(m.levelId))
const levelOf = (refs: Ref[]): Level | undefined => buildingOfLevel(useApp.getState().project, ids(refs)[0])?.levels.find((l) => l.id === ids(refs)[0])

registerKind('level', {
  own: {
    'go-to': {
      present: (refs) => refs.length === 1 && levelOf(refs) !== undefined,
      label: (refs) => `Go to ${levelOf(refs)!.name}`,
      title: () => 'The plan goes to this level',
      run: (refs) => useApp.getState().setLevel(ids(refs)[0]),
    },
  },
  base: {
    delete: {
      label: (refs) => (refs.length === 1 ? 'Delete level' : `Delete ${refs.length} levels`),
      detail: (refs) => (masses(refs).length ? count(masses(refs).length) : undefined),
      enabled: (refs) => {
        const { project } = useApp.getState()
        const b = buildingOfLevel(project, ids(refs)[0])
        if (b && ids(refs).length >= b.levels.length) return `${b.name} keeps one level at least`
        if (b && buildingLocked(project, b.id)) return lockedFirst(1, 'building')
        const locked = lockedAmong(masses(refs).map((m) => m.id)).length
        return locked > 0 ? lockedFirst(locked) : true
      },
      title: (refs) => (masses(refs).length ? 'With their masses (asks first)' : undefined),
      run: (refs) => deleteLevels(ids(refs)),
    },
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to move, resize and delete again' : 'Its masses stay as they are; they cannot be deleted') },
  },
})
