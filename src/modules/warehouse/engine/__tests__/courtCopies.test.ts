// A copy's courts with shapes, to the site (Phase D.3, task 4; Decisions "Court shape", "Courts in the circulation"): `copyParts` writes every court of a
// wall as an entry of its own in `Mass.blockCourts` (its id, its shape in the wall's frame as the site reads it, several to a wall after a split), the
// depth of one without a shape as it was; `deriveDocks` reads several entries on a wall.
import { describe, expect, it } from 'vitest'
import type { Contour, CourtByEdge, Project } from '../../../../model/schema.ts'
import { deriveMassing } from '../../../../engine/derive.ts'
import { footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { dockableWalls } from '../../../docks/engine/docks.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, placeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { copyParts, onPlace, onWall } from '../copies.ts'
import { fromWall, wallFrame } from '../courts.ts'
import { generate } from '../generate.ts'

const slab = (x0: number, x1: number, depth: number, chamfer = false): Contour => ({
  vertices: [
    { x: x0, y: 0, r: 0 },
    { x: x1, y: 0, r: 0 },
    { x: x1, y: depth, r: 0, ...(chamfer ? { chamfer: [3, 3] as [number, number] } : {}) },
    { x: x0, y: depth, r: 0 },
  ],
})

/** A block 36 × 24 m with these courts by edge, placed at 30° on the site: its type, its copy and its hall's mass. */
function placed(courts: CourtByEdge[], angle = 30) {
  let { project: p, id } = addWarehouseType(demoProject())
  p = updateWarehouseStep(p, id, 'grid', { x: 12, y: 12, modules: 4 })
  p = updateWarehouseStep(p, id, 'hall', { length: 36, width: 24, ends: 'both' })
  p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, courts } : t)) }
  const r = placeWarehouse(p, id, { x: 200, y: 150 }, angle, p.options[0].id)!
  const levels = new Set(r.project.buildings.find((b) => b.id === r.id)!.levels.map((l) => l.id))
  const hall = r.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
  const copy = r.project.buildings.find((b) => b.id === r.id)!.warehouse!
  return { p: r.project, type: r.project.warehouseTypes!.find((t) => t.id === id)!, copy, hall }
}

describe('copyParts writes every court of a wall', () => {
  it('two courts after a split: an entry each, with its id and shape; the wall docked once', () => {
    const { type, copy, hall } = placed([
      { edge: 'e1', id: 'c1', shape: slab(0, 12, 20) },
      { edge: 'e1', id: 'c2', shape: slab(24, 36, 20) },
    ])
    const part = copyParts(type, copy).find((x) => x.part === 'hall')!
    expect(part.blockCourts).toHaveLength(2)
    expect(part.blockCourts.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(new Set(part.blockCourts.map((c) => c.t)).size).toBe(1)
    expect(part.blockCourts.every((c) => c.shape && c.depth === undefined)).toBe(true)
    expect(part.docks.filter((t) => t === part.blockCourts[0].t)).toHaveLength(1)
    // what the placed mass holds is what copyParts says
    expect(hall.blockCourts).toEqual(part.blockCourts)
  })

  it('a court without a shape stays {t, depth}, as it was; a shaped one without an id has none', () => {
    const { type, copy } = placed([{ edge: 'e1', depth: 30 }, { edge: 'e3', shape: slab(6, 30, 20) }, { edge: 'e2' }])
    const part = copyParts(type, copy).find((x) => x.part === 'hall')!
    const front = part.blockCourts.find((c) => c.depth !== undefined)!
    const back = part.blockCourts.find((c) => c.shape)!
    expect(front).toEqual({ t: front.t, depth: 30 })
    expect(Object.keys(back).sort()).toEqual(['shape', 't'])
    // a court with neither a depth nor a shape puts a court in front of its wall and no entry
    expect(part.blockCourts).toHaveLength(2)
    expect(part.docks.length).toBeGreaterThanOrEqual(3)
  })

  it('a shape is the plan’s points the type’s frame names, through the copy’s place, turned 30°, in the wall’s own frame', () => {
    const shape = slab(6, 30, 20, true)
    const { type, copy } = placed([{ edge: 'e1', id: 'c1', shape }])
    const part = copyParts(type, copy).find((x) => x.part === 'hall')!
    const entry = part.blockCourts[0]
    const w = dockableWalls(footprintPolygon(part.footprint)).find((x) => x.t === entry.t)!
    const e1 = generate(type).edges.find((e) => e.id === 'e1')!
    const frame = wallFrame(e1)
    const u = { x: (w.b.x - w.a.x) / Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), y: (w.b.y - w.a.y) / Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) }
    for (const [i, v] of shape.vertices.entries()) {
      const want = onPlace(copy.place, fromWall(frame, v))
      const q = entry.shape!.vertices[i]
      const got = { x: w.a.x + u.x * q.x + w.out.x * q.y, y: w.a.y + u.y * q.x + w.out.y * q.y }
      expect(got.x).toBeCloseTo(want.x, 5)
      expect(got.y).toBeCloseTo(want.y, 5)
    }
    // the chamfer goes with its corner; the wall side stays on the wall's line
    expect(entry.shape!.vertices[2].chamfer).toEqual([3, 3])
    expect(entry.shape!.vertices[0].y).toBeCloseTo(0, 5)
    // the frame's start is the reference line's: the wall's face starts a thickness before it
    expect(entry.shape!.vertices[0].x).toBeCloseTo(6 + e1.thickness, 5)
  })

  it('an edge not along the grid has no frame: no entry', () => {
    const e = generate(placed([]).type).edges[0]
    expect(onWall(slab(0, 5, 10), { ...e, axis: null }, placed([]).copy.place, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, out: { x: 0, y: -1 } })).toBeNull()
  })
})

describe('deriveDocks reads several entries of a wall', () => {
  it('the first entry that says a depth is the wall’s (a court without one before it does not hide it)', () => {
    const { p, hall } = placed([{ edge: 'e3', depth: 22 }], 0)
    const t = hall.blockCourts![0].t
    const q: Project = { ...p, masses: p.masses.map((m) => (m.id === hall.id ? { ...m, blockCourts: [{ t, id: 'c1' }, { t, depth: 25 }] } : m)) }
    const back = deriveMassing(q).docks.docks.find((d) => d.massId === hall.id && d.out.y > 0.5)!
    expect(back.depth).toBe(25)
    expect(back.shapes).toBeUndefined()
  })

  it('a court without a shape and one with: the shape is the wall’s court', () => {
    const { p, hall } = placed([{ edge: 'e3', depth: 22 }], 0)
    const t = hall.blockCourts![0].t
    const shape = slab(6, 30, 18)
    const q: Project = { ...p, masses: p.masses.map((m) => (m.id === hall.id ? { ...m, blockCourts: [{ t, depth: 25 }, { t, id: 'c1', shape }] } : m)) }
    const back = deriveMassing(q).docks.docks.find((d) => d.massId === hall.id && d.out.y > 0.5)!
    expect(back.shapes).toHaveLength(1)
    expect(back.depth).toBeCloseTo(18, 6)
  })

  it('the wall’s own depth (Mass.courts) is above its block’s shapes, as it is above its block’s depth', () => {
    const { p, hall } = placed([{ edge: 'e3', id: 'c1', shape: slab(6, 30, 18) }], 0)
    const t = hall.blockCourts![0].t
    const q: Project = { ...p, masses: p.masses.map((m) => (m.id === hall.id ? { ...m, courts: [{ t, depth: 33 }] } : m)) }
    const back = deriveMassing(q).docks.docks.find((d) => d.massId === hall.id && d.out.y > 0.5)!
    expect(back).toMatchObject({ depth: 33, ownDepth: true })
    expect(back.shapes).toBeUndefined()
  })
})

describe('copyParts holds a court’s wall side to its wall as the copy is now (review S3)', () => {
  it('a copy shorter than the court’s wall side: its wall side stays on the wall', () => {
    const { type, copy } = placed([{ edge: 'e1', id: 'c1', shape: slab(24, 36.3, 20) }], 0)
    const short = { ...copy, overrides: { ...copy.overrides, hall: { ...copy.overrides?.hall, length: 24 } } }
    const part = copyParts(type, short).find((x) => x.part === 'hall')!
    const walls = dockableWalls(footprintPolygon(part.footprint))
    expect(part.blockCourts).toHaveLength(1)
    const w = walls.find((x) => x.t === part.blockCourts[0].t)!
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
    const onWall = part.blockCourts[0].shape!.vertices.filter((v) => Math.abs(v.y) < 1e-6).map((v) => v.x)
    expect(onWall.length).toBeGreaterThan(1)
    for (const x of onWall) expect(x).toBeLessThanOrEqual(len + 1e-3)
  })
})
