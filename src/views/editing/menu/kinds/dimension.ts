// The dimension's verbs in the one right-click menu (Phase AS.4 task 4): its own *Fixed length*, ticked when its length is fixed (moving one of its masses
// drags the other: it is not the padlock, Decision "One padlock"), then Delete, Select all dimensions and Hide. It has no Lock row: *Fixed length* is its lock.
import type { Ref } from '../../../../kinds/types.ts'
import { actions } from '../../../../state/actions/index.ts'
import { useApp } from '../../../../state/store.ts'
import { registerKind } from '../verbs.ts'
import { groupRunners, selectAllRunner } from './common.ts'

const ids = (refs: Ref[]) => refs.filter((r) => r.kind === 'dimension').map((r) => r.id)
const fixed = (id: string) => useApp.getState().project.dimensions?.find((d) => d.id === id)?.locked === true

registerKind('dimension', {
  own: {
    'fixed-length': {
      title: (refs) => (ids(refs).every(fixed) ? 'Its length is kept: moving one of its masses drags the other. Free its length' : 'Fix its length: moving one of its masses drags the other'),
      checked: (refs) => ids(refs).length > 0 && ids(refs).every(fixed),
      // every one picked takes the state the first asks for: all fixed, or all freed (one undo step)
      run: (refs) => {
        const all = ids(refs).every(fixed)
        useApp.getState().apply((p) => ids(refs).reduce((q, id) => (fixed(id) === all ? actions.toggleDimensionLock(q, id) : q), p))
      },
    },
    ...groupRunners(),
  },
  base: { 'select-all': selectAllRunner('dimension') },
})
