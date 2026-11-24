// The note's verbs in the one right-click menu (Phase AS.5 task 3): Delete, Rename (its text is its name: Properties opens with the words selected), Select all notes, Lock, Hide and
// Properties, which are the registry's, in the user's order; its own verbs are *Group* and *Ungroup* (Decision "Groups of any kind"), the same two commands as every kind's.
import { registerKind } from '../verbs.ts'
import { groupRunners, selectAllRunner } from './common.ts'

registerKind('note', {
  own: { ...groupRunners() },
  base: { 'select-all': selectAllRunner('note') },
})
