// The warehouse module (Decision "Warehouse type"): the project's warehouse types, their copies and the Program window's
// steps; for the optimizer, a type's hall and elements on its copies (params.ts). Present once the project has a
// warehouse type; it brings the block type and the block's parts as kinds (kinds.ts); the Mass tool's entry follows the typology's offer instead.
import type { Module } from '../types.ts'
import { WAREHOUSE_KINDS } from './kinds.ts'
import { WAREHOUSE_KPIS } from './kpis.ts'
import { WAREHOUSE_PARAMS } from './params.ts'

export const warehouse: Module = {
  id: 'warehouse',
  label: 'Warehouse',
  // its copies take their docks' walls from the docks' code (modules/warehouse/engine/copies.ts uses modules/docks/engine/docks.ts)
  requires: ['docks'],
  present: (p) => (p.warehouseTypes?.length ?? 0) > 0,
  kpis: () => WAREHOUSE_KPIS,
  measures: [],
  params: WAREHOUSE_PARAMS,
  // the block type of the Blocks tab and the parts of a block in its editor (Phase AS.4)
  kinds: WAREHOUSE_KINDS,
}
