// The warehouse module's verbs on the mass kind (Phase AS.4, Decision "One menu"; `kinds/core.ts` names them, `modules/warehouse/module.ts` offers
// the module): a mass that is a block (a copy of a warehouse type, Decision "Warehouse copies") has *Edit in the block editor*, which opens the
// Program window on its type, and *Save to the library*, which saves that type to the block library (a type already linked asks, in the window,
// whether to overwrite or save a copy: the question of its *Save to library* button). They stand at the top of the mass's menu. Registered
// through `views/editing/menu/modules.ts`; a mass that is no block has neither row, and the registry lists them only while the typology offers
// the module.
import type { Ref } from '../../../kinds/types.ts'
import { buildingOf } from '../../../engine/buildings.ts'
import type { Id, WarehouseType } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { registerKind } from '../../../views/editing/menu/verbs.ts'
import { openType } from './commands.ts'
import { saveToLibrary, useSaveAsk } from './SaveBlock.tsx'

/** The warehouse type each of these masses is a copy of (absent: not a block). */
function typesOf(refs: Ref[]): (WarehouseType | undefined)[] {
  const p = useApp.getState().project
  return refs
    .filter((r) => r.kind === 'mass')
    .map((r) => {
      const m = p.masses.find((x) => x.id === r.id)
      const typeId: Id | undefined = m ? buildingOf(p, m).warehouse?.type : undefined
      return typeId === undefined ? undefined : p.warehouseTypes?.find((t) => t.id === typeId)
    })
}

/** The type when every mass picked is a copy of the same one; else why not. */
function oneType(refs: Ref[]): WarehouseType | string {
  const types = typesOf(refs)
  const first = types[0]
  if (!first) return 'Pick the masses of one block'
  return types.every((t) => t?.id === first.id) ? first : 'Pick the masses of one block'
}

/** A block among the masses picked: the verbs are listed; with a mass that is none beside it, they are greyed with why. */
const isBlock = (refs: Ref[]): boolean => typesOf(refs).some((t) => t !== undefined)

registerKind('mass', {
  own: {
    'edit-block': {
      group: 'block',
      present: isBlock,
      enabled: (refs) => {
        const t = oneType(refs)
        return typeof t === 'string' ? t : true
      },
      title: (refs) => {
        const t = oneType(refs)
        return typeof t === 'string' ? t : `The Program window on ${t.name}, the type this block is a copy of`
      },
      run: (refs) => {
        const t = oneType(refs)
        if (typeof t !== 'string') openType(t.id)
      },
    },
    'save-block': {
      group: 'block',
      present: isBlock,
      enabled: (refs) => {
        const t = oneType(refs)
        return typeof t === 'string' ? t : true
      },
      title: (refs) => {
        const t = oneType(refs)
        return typeof t === 'string' ? t : t.library ? `${t.name} is linked to a library block: the Program window asks to overwrite it or save a copy` : `${t.name} becomes a block of the library`
      },
      run: (refs) => {
        const t = oneType(refs)
        if (typeof t === 'string') return
        // a type linked to a block asks, as its button does, whether to overwrite or save a copy; one that is not becomes a new block
        if (t.library) {
          openType(t.id)
          useSaveAsk.setState({ typeId: t.id })
        } else saveToLibrary(t, 'copy')
      },
    },
  },
})
