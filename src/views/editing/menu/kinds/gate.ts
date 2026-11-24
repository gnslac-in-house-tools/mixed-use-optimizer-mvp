// The gate's verbs in the one right-click menu (Phase AS.4 task 4): Delete, Select all gates, Lock and Hide. A gate has no name (no Rename) and no own verb; its
// padlock is the option's copy's, else the site's (`editing/refOps.ts`).
import { lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'
import { groupRunners, selectAllRunner } from './common.ts'

registerKind('gate', {
  own: { ...groupRunners() },
  base: {
    'select-all': selectAllRunner('gate'),
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to slide and delete again' : 'It stays where it is; it cannot be deleted') },
  },
})
