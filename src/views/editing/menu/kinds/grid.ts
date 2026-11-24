// The structural grid's verbs in the one right-click menu (Phase AS.4 task 4): its own *Restore original* (the Grid tool's handles' right-click, and its double-click),
// Hide (its eye is the snap's *Grid* switch, F9: `layers/switches.ts`) and Properties (the Grid row of Layers: its fields, Move pivot and Restore original included).
// The grid is not picked on the plan: the handle's right-click opens this menu on the grid itself, so its Hide and Properties are its own runners.
import { pickLayer } from '../../../layers/layerPick.ts'
import { setSwitch, switchOn } from '../../../layers/switches.ts'
import { restoreGrid } from '../../../plan/grid/GridToolLayer.tsx'
import { showProperties } from '../../../plan/massCommands.ts'
import { registerKind } from '../verbs.ts'

registerKind('grid', {
  own: {
    'restore-original': {
      title: () => 'Along the site’s main axis again, from the buildable area’s corner (its bays and modules kept)',
      run: () => restoreGrid(),
    },
  },
  base: {
    hide: {
      label: () => (switchOn('grid') ? 'Hide' : 'Show'),
      title: () => 'The grid is not drawn or snapped to (the snap’s Grid switch, F9)',
      run: () => setSwitch('grid', !switchOn('grid')),
    },
    properties: {
      label: () => 'Properties',
      title: () => 'The grid’s fields in the Properties tab',
      run: () => {
        pickLayer('grid')
        showProperties()
      },
    },
  },
})
