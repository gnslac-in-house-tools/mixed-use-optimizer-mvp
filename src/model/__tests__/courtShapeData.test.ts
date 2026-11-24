// A truck court's own shape in the data (Phase D.3, task 3; project version 18, block format 6): a court with a shape and an id, by edge on a block and
// by wall on a placed copy; both versions are version-only steps, so what an older file holds reads as it was.
import { describe, expect, it } from 'vitest'
import { BLOCK_FORMAT, BLOCK_VERSION, BlockSchema, CourtByEdgeSchema, PROJECT_VERSION, ProjectSchema, type Contour, type Project } from '../schema.ts'
import { migrate } from '../migrate.ts'
import { readBlockFile, writeBlockFile } from '../../io/blocks.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { demoProject } from '../../state/demo.ts'
import { addWarehouseType } from '../../modules/warehouse/actions.ts'
import { blockOf } from '../../modules/warehouse/engine/library.ts'
import { migrateBlock } from '../../modules/warehouse/engine/migrate.ts'

/** A court of 36 m on its wall, its far corners cut and its far edge an arc. */
const shape: Contour = {
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 36, y: 0, r: 0 },
    { x: 36, y: 30, r: 0, chamfer: [6, 4] },
    { x: 0, y: 30, r: 0, chamfer: [6, 6] },
  ],
  arcs: { '2': -0.1 },
}

/** The demo project with a warehouse type: no court of its own yet. */
const withType = (): Project => addWarehouseType(demoProject()).project

/** The same with two courts of its own on the type's front, one with a shape and an id, and two courts on its first mass's wall. */
function shaped(): Project {
  const p = withType()
  const types = p.warehouseTypes!.map((t, i) => (i === 0 ? { ...t, courts: [{ edge: 'e1', id: 'c1', shape }, { edge: 'e1', id: 'c2', shape: { vertices: shape.vertices.slice(0, 3) } }] } : t))
  const masses = p.masses.map((m, i) => (i === 0 ? { ...m, blockCourts: [{ t: 0.1, id: 'c1', shape }, { t: 0.1, depth: 20 }] } : m))
  return { ...p, warehouseTypes: types, masses }
}

describe('a court’s shape and id', () => {
  it('a court by edge takes an id and a shape; both are optional, and a depth stays', () => {
    expect(CourtByEdgeSchema.safeParse({ edge: 'e1' }).success).toBe(true)
    expect(CourtByEdgeSchema.safeParse({ edge: 'e1', depth: 30 }).success).toBe(true)
    const r = CourtByEdgeSchema.safeParse({ edge: 'e1', id: 'c1', shape })
    expect(r.success).toBe(true)
    expect(r.data).toEqual({ edge: 'e1', id: 'c1', shape })
    // a shape is a contour: three corners at least
    expect(CourtByEdgeSchema.safeParse({ edge: 'e1', shape: { vertices: shape.vertices.slice(0, 2) } }).success).toBe(false)
  })

  it('a placed block’s courts on a mass: by wall, each a depth or a shape with its id', () => {
    const p = shaped()
    const r = ProjectSchema.safeParse(p)
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    const hall = r.data!.masses.find((m) => m.blockCourts)!
    expect(hall.blockCourts).toEqual([{ t: 0.1, id: 'c1', shape }, { t: 0.1, depth: 20 }])
    // a court with a shape has no depth: the shape's deepest point is it
    expect(ProjectSchema.safeParse({ ...p, masses: p.masses.map((m) => (m.blockCourts ? { ...m, blockCourts: [{ t: 0.2 }] } : m)) }).success).toBe(true)
  })

  it('a project with such courts reads back equal from its .gft', () => {
    const p = shaped()
    expect(PROJECT_VERSION).toBe(20)
    expect(readGft(writeGft(p))).toEqual({ ok: true, project: p })
  })

  it('a block with such courts reads back equal from its .gfb', () => {
    const p = shaped()
    const block = blockOf(p, p.warehouseTypes![0].id, 'b1', 1, 0)!
    expect(block.formatVersion).toBe(6)
    expect(block.type.courts).toHaveLength(2)
    const r = readBlockFile(writeBlockFile(block))
    expect(r).toEqual({ ok: true, block })
  })
})

describe('older files read to project 18 and block 6', () => {
  it('a version 17 project reads to 18, nothing else changed', () => {
    const p = shaped()
    const v17 = { ...JSON.parse(writeGft(p)), version: 17 }
    const r = readGft(JSON.stringify(v17))
    expect(r).toEqual({ ok: true, project: p })
    expect((migrate(v17) as { version: number }).version).toBe(20)
    const { version: _, ...rest } = v17
    expect({ ...(migrate(v17) as object), version: 17 }).toEqual({ ...rest, version: 17 })
  })

  it('a project of version 18 is left as it is, and one of a later version is refused', () => {
    const file = JSON.parse(writeGft(shaped()))
    expect(migrate(file)).toEqual(file)
    expect(readGft(JSON.stringify({ ...file, version: 21 })).ok).toBe(false)
  })

  it('a block file of format 5 reads as format 6, its type as it was', () => {
    const p = withType()
    const block = blockOf(p, p.warehouseTypes![0].id, 'b1', 1, 0)!
    const v5 = { ...block, formatVersion: 5 }
    const read = BlockSchema.safeParse(migrateBlock(v5))
    expect(read.success).toBe(true)
    expect(read.data).toEqual(block)
    expect(readBlockFile(JSON.stringify(v5))).toEqual({ ok: true, block })
    expect(BlockSchema.safeParse(v5).success).toBe(false)
  })

  it('the versions: project 18, block 6', () => {
    expect(PROJECT_VERSION).toBe(20)
    expect(BLOCK_VERSION).toBe(6)
    expect(BLOCK_FORMAT).toBe('gfit-block')
  })
})
