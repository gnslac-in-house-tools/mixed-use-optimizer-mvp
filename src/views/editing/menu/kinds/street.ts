// The street's verbs in the one right-click menu (Phase AS.4 task 4, Decision "One menu"): Copy · Paste · Paste here, Delete, Select all streets, Lock and Hide.
// A street as a person sees it is the derived road (`street:<its first segment>`); its padlock and its eye are its segments' (`editing/refOps.ts`). Its own verbs are *Equal sides* (Phase PE.1) and
// *Equal lanes* (Phase PE.2); it has no name. The street says two of the base verbs in its own words (Select all, and the title of Lock); the rest are the registry's commands.
import { lockedAll } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'
import { equalLanesRunner, equalSidesRunner, groupRunners, selectAllRunner } from './common.ts'

registerKind('street', {
  own: { ...groupRunners(), 'equal-sides': { group: 'path', ...equalSidesRunner() }, 'equal-lanes': { group: 'path', ...equalLanesRunner() } },
  base: {
    'select-all': selectAllRunner('street'),
    lock: { title: (refs) => (lockedAll(refs) ? 'Free to move, reshape and delete again' : 'Its segments and their nodes stay as they are; it cannot be deleted') },
  },
})
