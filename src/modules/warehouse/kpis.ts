// The warehouse module's KPI definitions (Decisions "Warehouse type", "Catalog"): columns and wall area of its copies, as data like the
// core's (engine/kpis.ts has the type and the rest). Ids never change: saved projects keep the ones they chose.
import { optionOf } from '../../engine/buildings.ts'
import type { KpiDef } from '../../engine/kpis.ts'
import type { Derived } from '../../engine/types.ts'
import type { Project } from '../../model/schema.ts'
import { copyGenerated } from './engine/copies.ts'
import { figuresOf, type WarehouseFigures } from './engine/figures.ts'

/** A figure summed over the option's warehouse copies (Decision "Warehouse type"); null with none. A block of an open program (not built: Phase D.2) counts no columns or walls. */
function copiesSum(p: Project, d: Derived, f: (x: WarehouseFigures) => number): number | null {
  const ids = new Set(optionOf(p, d.option).buildingIds)
  const copies = p.buildings.filter((b) => ids.has(b.id) && b.warehouse)
  if (copies.length === 0) return null
  return copies.reduce((s, b) => {
    const t = p.warehouseTypes?.find((x) => x.id === b.warehouse!.type)
    if (!t) return s
    const w = b.warehouse!
    const program = w.overrides?.program !== undefined ? w.overrides.program : t.program
    const built = program === null || p.programs.find((g) => g.id === program)?.built !== false
    return s + f(figuresOf(copyGenerated(t, w), built))
  }, 0)
}

/** The warehouse module's: its copies' figures. */
export const WAREHOUSE_KPIS: KpiDef[] = [
  {
    id: 'columns',
    area: 'massing',
    aim: false,
    label: 'Columns',
    unit: 'count',
    help: 'The columns of the option’s warehouses, as their types make them (the Program window).',
    read: (p, d) => copiesSum(p, d, (x) => x.columns),
  },
  {
    id: 'wall-area',
    area: 'massing',
    aim: false,
    label: 'Wall area',
    unit: 'm2',
    help: 'The envelope’s wall area of the option’s warehouses, as their types make them (the Program window).',
    read: (p, d) => copiesSum(p, d, (x) => x.wallArea),
  },
]
