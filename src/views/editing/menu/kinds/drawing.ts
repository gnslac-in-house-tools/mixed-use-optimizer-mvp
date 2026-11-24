// The imported drawings' verbs in the one right-click menu (Phase AS.4 task 4), as the rows of Layers have them: a file has *Separate layers* / *Join layers* and
// *On top* of its own, *Remove* in Delete's place (it takes its layers out of the site, and the parcels it brought), Lock, Hide and Properties; a layer and a file's
// parcels only Lock, Hide and Properties. A drawing is never copied (no Copy, no Paste). Locked, a layer is not picked on the plan; this menu is of what is picked.
import type { Ref } from '../../../../kinds/types.ts'
import { useApp } from '../../../../state/store.ts'
import { removeDrawing, setSplit } from '../../../layers/drawingCommands.ts'
import { toggleOnTop, useLayerView } from '../../../layers/layerView.ts'
import { eyeKeysOf } from '../../refOps.ts'
import { registerKind } from '../verbs.ts'

const files = (refs: Ref[]) => refs.filter((r) => r.kind === 'drawing').map((r) => r.file ?? r.id)
const split = (file: string) => useApp.getState().project.site.drawings?.find((d) => d.file === file)?.split === true
const named = (refs: Ref[]) => (files(refs).length === 1 ? `${files(refs)[0]}’s` : 'their')

registerKind('drawing', {
  own: {
    'split-layers': {
      group: 'layout',
      label: (refs) => (files(refs).every(split) ? 'Join layers' : 'Separate layers'),
      title: (refs) => (files(refs).every(split) ? `Join ${named(refs)} layers: it is picked and moved as one piece` : `Separate ${named(refs)} layers: each is picked, locked and moved on its own`),
      run: (refs) => {
        const on = !files(refs).every(split)
        files(refs).forEach((f) => setSplit(f, on))
      },
    },
    'on-top': {
      group: 'layout',
      title: () => 'Drawn over the model, under the dimensions; it never hides anything',
      checked: (refs) => {
        const onTop = new Set(useLayerView.getState().onTop)
        const keys = eyeKeysOf(refs)
        return keys.length > 0 && keys.every((k) => onTop.has(k))
      },
      run: (refs) => toggleOnTop(eyeKeysOf(refs)),
    },
  },
  base: {
    delete: {
      label: () => 'Remove',
      title: (refs) => `Take ${named(refs)} layers out of the site, and the parcels ${files(refs).length === 1 ? 'it' : 'they'} brought`,
      run: (refs) => files(refs).forEach(removeDrawing),
    },
  },
})
