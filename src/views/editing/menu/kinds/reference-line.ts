// The reference line's verbs in the one right-click menu (Phase AS.5 task 2): its own *On top*, ticked while the guides are drawn over the model (the Reference lines row's
// toggle: it is the kind's, not one line's, as a drawing file's is its layers'), then Delete, Select all reference lines, Lock, Hide and Properties, which are the registry's.
// It has no Copy: a guide is copied by the Copy tool. *Group* and *Ungroup* are its own verbs too (Decision "Groups of any kind"): the same two commands as every kind's.
import { REFERENCE_LINES } from '../../../layers/keys.ts'
import { toggleOnTop, useLayerView } from '../../../layers/layerView.ts'
import { registerKind } from '../verbs.ts'
import { groupRunners, selectAllRunner } from './common.ts'

registerKind('reference-line', {
  own: {
    'on-top': {
      title: () => 'Drawn over the model, under the dimensions; it never hides anything',
      checked: () => useLayerView.getState().onTop.includes(REFERENCE_LINES),
      run: () => toggleOnTop([REFERENCE_LINES]),
    },
    ...groupRunners(),
  },
  base: { 'select-all': selectAllRunner('reference-line') },
})
