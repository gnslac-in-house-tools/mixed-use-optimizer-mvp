// Past the range by hand (Decision "Past the range by hand", RB.1): a block's size typed in step 2 past the range it
// sets for the optimizer is not held back; each copy at it is a warning, named with its length and its range.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, placeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { pastRange, rangeIssues } from '../range.ts'

describe('past its range', () => {
  it('step 2 at 250 m, its range 200–230 m: the copy is a warning on its mass; back inside, none', () => {
    let { project: p, id } = addWarehouseType(demoProject())
    p = updateWarehouseStep(p, id, 'hall', { length: 200, range: { length: [200, 230] } })
    const placed = placeWarehouseOrThrow(p, id)
    p = updateWarehouseStep(placed.project, id, 'hall', { length: 250 })
    expect(p.warehouseTypes![0].hall.length).toBe(250)
    // brought back to 229 m: the last length on the block's modules (from its 250 m) inside the range
    expect(pastRange(p, placed.id)).toEqual([{ key: 'length', now: 250, lo: 200, hi: 230, to: 229 }])
    const issue = derive(p).issues.find((i) => i.code === 'range')!
    expect(issue.severity).toBe('warning')
    expect(issue.message).toContain('250 m long, its range 200–230 m')
    expect(issue.massIds).toHaveLength(1)
    expect(p.masses.find((m) => m.id === issue.massIds[0])!.part).toBe('hall')
    // an option that does not show it: none there
    expect(rangeIssues(p, [])).toEqual([])
    expect(derive(updateWarehouseStep(p, id, 'hall', { length: 230 })).issues.some((i) => i.code === 'range')).toBe(false)
  })
})

function placeWarehouseOrThrow(p: Parameters<typeof placeWarehouse>[0], id: string) {
  const r = placeWarehouse(p, id, { x: 100, y: 100 }, 0, p.options[0].id)
  if (!r) throw new Error('not placed')
  return r
}
