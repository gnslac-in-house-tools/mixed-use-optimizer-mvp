// The existing road's verbs in the one right-click menu (Phase AS.4 task 4): Delete, Rename, Select all existing roads, Lock (its own flag, Phase PE.2), Hide, Group and Ungroup (Phase PE.2),
// *Equal sides* (its drawn line to the middle of its paving) and *Equal lanes*. It is the site's, not the design's. Rename opens its Properties on the name field (`editing/rename.ts`); Select all picks every one that is neither locked nor hidden.
import { registerKind } from '../verbs.ts'
import { equalLanesRunner, equalSidesRunner, groupRunners, selectAllRunner } from './common.ts'

registerKind('existing-road', {
  own: { ...groupRunners(), 'equal-sides': { group: 'path', ...equalSidesRunner() }, 'equal-lanes': { group: 'path', ...equalLanesRunner() } },
  base: { 'select-all': selectAllRunner('existing-road') },
})
