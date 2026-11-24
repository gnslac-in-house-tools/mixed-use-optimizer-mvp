// The lot's verbs in the one right-click menu (Phase AS.4 task 4): Delete, Rename, Select all lots, Lock and Hide. No own verb: a lot's walls, rows and entrance
// are its Properties' and its handles'.
import { lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'
import { groupRunners, selectAllRunner } from './common.ts'

registerKind('lot', {
  own: { ...groupRunners() },
  base: {
    'select-all': selectAllRunner('lot'),
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to move, resize and delete again' : 'Its place and size stay as they are; it cannot be deleted') },
  },
})
