// A block of an open program (Phase D.2, Decision Q2 A) is open ground: the Columns and Wall area KPIs count none of it,
// its area counts as it did.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { readKpi } from '../../catalog.ts'
import { addWarehouseType, placeWarehouse } from '../actions.ts'

describe('the warehouse KPIs of a block of an open program', () => {
  it('a built program: columns and wall area; open: none', () => {
    const p0 = demoProject()
    const { project, id } = addWarehouseType(p0)
    const placed = placeWarehouse(project, id, { x: 200, y: 150 }, 0, p0.options[0].id)!
    const p = placed.project
    const type = p.warehouseTypes![0]
    const kpi = (q: typeof p, k: string) => readKpi(k, q, derive(q))!.value
    expect(kpi(p, 'columns')).toBeGreaterThan(0)
    expect(kpi(p, 'wall-area')).toBeGreaterThan(0)
    const open = { ...p, programs: p.programs.map((g) => (g.id === type.program ? { ...g, built: false } : g)) }
    expect(kpi(open, 'columns')).toBe(0)
    expect(kpi(open, 'wall-area')).toBe(0)
  })
})
