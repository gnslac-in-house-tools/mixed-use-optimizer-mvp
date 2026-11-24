// A new warehouse type's figures (Decision "Warehouse type"), pure: a distribution warehouse as a designer starts one,
// on the project's grid (12 × 12 m in 4 modules where it has none), every step open.
import type { HallElement, Id, WarehouseType } from '../../../model/schema.ts'
import type { Run } from './bays.ts'
import { hallRuns } from './generate.ts'

/** m: a new type's wall, column and clear height. */
export const NEW_TYPE = { length: 200, width: 96, thickness: 0.3, column: 0.5, height: 12, dockWidth: 3 }

/** The modules of a run's interior bays (its end bays left out), each its index. */
export function interiorModules(r: Run): number[] {
  const out: number[] = []
  let k = 0
  for (const b of r.bays) {
    if (!b.end) for (let i = 0; i < b.modules; i++) out.push(k + i)
    k += b.modules
  }
  return out
}

export function newWarehouseType(
  id: Id,
  name: string,
  { grid = { x: 12, y: 12, modules: 4 }, program = null, height = NEW_TYPE.height }: { grid?: WarehouseType['grid']; program?: Id | null; height?: number } = {},
): WarehouseType {
  const t = NEW_TYPE.thickness
  const type: WarehouseType = {
    id,
    name,
    program,
    grid: { ...grid },
    hall: { length: NEW_TYPE.length, width: NEW_TYPE.width, ends: 'both' },
    columns: { size: NEW_TYPE.column, every: { x: 1, y: 1 } },
    envelope: { height, thickness: t },
    // the box (Decision "Block shape"): its edges e1 front, e2 right, e3 back, e4 left
    morphology: { outline: [], holes: [] },
    elements: [],
  }
  // docks along the front: one on every module of its interior bays (Decision "Elements by module")
  const elements = interiorModules(hallRuns(type).x).map((module, i): HallElement => ({ id: `e${i + 1}`, kind: 'dock', edge: 'e1', module, width: NEW_TYPE.dockWidth }))
  return { ...type, elements }
}
