// Dimension verbs and copyMass: pure, nothing changed → the same project.
import { describe, expect, it } from 'vitest'
import { addDimension, removeDimension, setDimensionOffset } from '../actions/dimensions.ts'
import { actions } from '../actions/index.ts'
import { copyMass } from '../actions/masses.ts'
import { demoProject } from '../demo.ts'

describe('dimensions', () => {
  it('add gives ids d1, d2…; a and b on the same point give nothing; remove takes it out', () => {
    const p = demoProject()
    const a = addDimension(p, { x: 0, y: 0 }, { x: 10, y: 0 }, 3)!
    const b = addDimension(a.project, { x: 0, y: 0 }, { x: 0, y: 5 }, -2)!
    expect([a.id, b.id]).toEqual(['d1', 'd2'])
    expect(b.project.dimensions).toHaveLength(2)
    expect(addDimension(p, { x: 1, y: 1 }, { x: 1, y: 1 }, 2)).toBeNull()
    expect(removeDimension(b.project, 'd1').dimensions!.map((d) => d.id)).toEqual(['d2'])
    expect(removeDimension(b.project, 'nope')).toBe(b.project)
  })

  it('on a type (BE.10): its own list, ids of its own, no anchors; the site’s untouched; remove and offset there too', () => {
    const p = actions.addWarehouseType(demoProject()).project
    const t = p.warehouseTypes![0]
    const on = { type: t.id }
    // a corner of the site's mass is not an anchor for a block's dimension
    const a = addDimension(p, { x: 0, y: 0 }, { x: 10, y: 0 }, 3, undefined, on)!
    expect(a.id).toBe('d1')
    expect(a.project.dimensions).toBe(p.dimensions)
    const dims = a.project.warehouseTypes![0].dimensions!
    expect(dims).toEqual([{ id: 'd1', levelId: t.id, a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, offset: 3 }])
    expect(setDimensionOffset(a.project, 'd1', -2, on).warehouseTypes![0].dimensions![0].offset).toBe(-2)
    expect(removeDimension(a.project, 'd1', on).warehouseTypes![0].dimensions).toEqual([])
    expect(removeDimension(a.project, 'nope', on)).toBe(a.project)
    expect(addDimension(p, { x: 0, y: 0 }, { x: 10, y: 0 }, 3, undefined, { type: 'nope' })).toBeNull()
  })
})

describe('copyMass', () => {
  it('a moved copy with the same height and program, the next name of its program', () => {
    const p = demoProject()
    const w1 = p.masses[0]
    const r = copyMass(p, w1, { x: 200, y: 0 })
    const copy = r.project.masses.find((m) => m.id === r.id)!
    expect(copy).toMatchObject({ programId: w1.programId, levelId: w1.levelId, name: 'Warehouse 3' })
    expect(copy.height).toBe(w1.height)
    expect(copy.footprint.kind === 'rect' && copy.footprint.center.x).toBe(w1.footprint.kind === 'rect' ? w1.footprint.center.x + 200 : NaN)
  })

  it('a mass from a project whose program is not here comes without a program', () => {
    const p = demoProject()
    const r = copyMass(p, { ...p.masses[0], programId: 'retail' }, { x: 0, y: 0 })
    expect(r.project.masses.find((m) => m.id === r.id)!.programId).toBeNull()
  })
})
