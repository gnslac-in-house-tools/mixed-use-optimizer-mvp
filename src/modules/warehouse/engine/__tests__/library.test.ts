// The block library (Decision "Block library"): a type as a block and back in another project, linked, on a program of
// its own, its zones' programs found or added; brought up to date when its block is newer; unlinked, left as it is.
import { describe, expect, it } from 'vitest'
import { BlockSchema, type Block, type Project } from '../../../../model/schema.ts'
import { derive } from '../../../../engine/derive.ts'
import { sampleProject } from '../../../../state/sample.ts'
import { newProject } from '../../../../typologies/index.ts'
import { bringBlock, placeWarehouse, unlinkBlock, updateFromLibrary } from '../../actions.ts'
import { blockOf, isNewer, programIdsOf } from '../library.ts'

const sample = sampleProject()
const cross = sample.warehouseTypes!.find((t) => t.name === 'Cross-dock')!
const block = blockOf(sample, cross.id, 'gfit-cross-dock', 1, 0)!

function withSite(): Project {
  const p = newProject('industrial', 'Elsewhere')
  return { ...p, site: { ...p.site, boundary: sample.site.boundary } }
}

describe('a type as a block', () => {
  it('its type, not its link, and the programs it names (its hall’s first), without their targets; it reads as a block', () => {
    expect(BlockSchema.safeParse(block).success).toBe(true)
    expect(block.programs.map((g) => g.id)).toEqual(programIdsOf(cross))
    expect(block.programs[0].id).toBe(cross.program)
    expect(block.programs.some((g) => g.target)).toBe(false)
    expect(block.type.library).toBeUndefined()
  })
})

describe('a block brought into another project', () => {
  it('a linked type on the project’s own Warehouse while no type defines it, else on one of its own; the office its zone takes is the project’s; its copies place', () => {
    const p = withSite()
    const r = bringBlock(p, block)
    const t = r.project.warehouseTypes!.find((x) => x.id === r.id)!
    expect(t.name).toBe('Cross-dock')
    expect(t.library).toEqual({ id: 'gfit-cross-dock', version: 1 })
    expect(t.program).toBe('warehouse')
    expect(r.project.programs.find((g) => g.id === t.program)!.kind).toBe('warehouse')
    // a second block of that program: the Warehouse is defined now, so a program of its own
    const again = bringBlock(r.project, { ...block, id: 'other' })
    const t2 = again.project.warehouseTypes!.find((x) => x.id === again.id)!
    expect(r.project.programs.some((g) => g.id === t2.program)).toBe(false)
    expect(again.project.programs.find((g) => g.id === t2.program)!.kind).toBe('warehouse')
    expect(t.morphology.zones!.find((z) => z.name === 'Office')!.program).toBe('office')
    const placed = placeWarehouse(r.project, r.id, { x: 135, y: 165 }, 90, 'o1')!
    expect(derive(placed.project, 'o1').issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it('brought again, it is the same type; a zone’s program the project lacks is added as a copy', () => {
    const r = bringBlock(withSite(), block)
    expect(bringBlock(r.project, block)).toEqual(r)
    const odd: Block = { ...block, id: 'odd', programs: [...block.programs.filter((g) => g.id !== 'office'), { id: 'office', name: 'Mezzanine', color: '#808080', built: true }] }
    const q = bringBlock(withSite(), odd)
    const t = q.project.warehouseTypes!.find((x) => x.id === q.id)!
    const office = q.project.programs.find((g) => g.id === t.morphology.zones!.find((z) => z.name === 'Office')!.program)!
    expect(office.name).toBe('Mezzanine')
    expect(office.id).not.toBe('office')
  })
})

describe('linked types brought up to date', () => {
  const r = bringBlock(withSite(), block)
  const placed = placeWarehouse(r.project, r.id, { x: 135, y: 165 }, 90, 'o1')!.project
  const v2: Block = { ...block, version: 2, type: { ...block.type, hall: { ...block.type.hall, length: 192 } } }

  it('a newer version: its steps, its copies made again, its name and hall program kept', () => {
    const before = placed.warehouseTypes!.find((x) => x.id === r.id)!
    expect(isNewer(before, v2)).toBe(true)
    const u = updateFromLibrary(placed, [v2])
    expect(u.updated).toEqual([r.id])
    const t = u.project.warehouseTypes!.find((x) => x.id === r.id)!
    expect(t.hall.length).toBe(192)
    expect(t.library!.version).toBe(2)
    expect(t.program).toBe(before.program)
    expect(u.project.masses).not.toEqual(placed.masses)
  })

  it('the same version, or unlinked, it stays as it is', () => {
    expect(updateFromLibrary(placed, [block])).toEqual({ project: placed, updated: [] })
    const free = unlinkBlock(placed, r.id)
    expect(free.warehouseTypes!.find((x) => x.id === r.id)!.library).toBeUndefined()
    expect(updateFromLibrary(free, [v2]).updated).toEqual([])
  })
})
