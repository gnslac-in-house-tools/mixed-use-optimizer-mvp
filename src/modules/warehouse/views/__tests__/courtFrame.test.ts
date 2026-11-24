// A truck court's frame is the block editor's court (Phase D.3, tasks 3 and 4): the wall's face, its start where the outline enters the wall, x along it
// and y out of it. The rectangle a court is without a shape lands on the corners `courtBand` draws in the block editor, for each of a block's four
// walls, and, turned by a copy's place and given the wall's face span (`faceSpan`), on the court the site derives for its wall.
// The frame span (task 4's choice, the plan's *Frame span* decision): ONE frame, its x = 0 at the reference line's start, so a shape means the same
// points on the plan in both viewports; the span a court's wall side may stand in and a court without a shape fills is the frame's own (0 to the
// reference line's length) in the block editor, as `courtBand` draws it, and the wall's face (a wall's thickness more at a convex end) on the site,
// where the footprint's wall is the face: today's numbers on both sides, nothing moved.
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { deriveMassing } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { addWarehouseType, lockWarehouseStep, placeWarehouse, updateWarehouseStep } from '../../actions.ts'
import { courtContour, faceSpan, fromWall, wallFrame } from '../../engine/courts.ts'
import { onPlace } from '../../engine/copies.ts'
import { generate } from '../../engine/generate.ts'
import { courtBand } from '../handleMath.ts'

function block() {
  const base = demoProject()
  let { project: p, id } = addWarehouseType(base)
  p = updateWarehouseStep(p, id, 'grid', { x: 12, y: 12, modules: 4 })
  p = updateWarehouseStep(p, id, 'hall', { length: 36, width: 24, ends: 'both' })
  for (const s of ['grid', 'hall', 'columns', 'envelope'] as const) p = lockWarehouseStep(p, id, s)
  return { p, id, option: base.options[0].id }
}

const key = (q: Point) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`
const sameSet = (a: Point[], b: Point[]) => expect(a.map(key).sort()).toEqual(b.map(key).sort())

describe('a court without a shape, in the wall’s frame', () => {
  it('lands where the block editor’s court band puts it, on each of the four walls', () => {
    const { p, id } = block()
    const g = generate(p.warehouseTypes!.find((t) => t.id === id)!)
    expect(g.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    for (const e of g.edges) {
      const depth = 35
      const frame = wallFrame(e)
      const corners = courtContour({}, e, depth).vertices.map((v) => fromWall(frame, v))
      const band = courtBand(e, depth).rect
      sameSet(corners, [
        { x: band.x, y: band.y },
        { x: band.x + band.w, y: band.y },
        { x: band.x + band.w, y: band.y + band.h },
        { x: band.x, y: band.y + band.h },
      ])
    }
  })
})

describe('the frame span', () => {
  it('the face’s span is a wall’s thickness past the reference line’s, 0 to its length, at each convex end', () => {
    const { p, id } = block()
    const g = generate(p.warehouseTypes!.find((t) => t.id === id)!)
    for (const e of g.edges) {
      const frame = wallFrame(e)
      const face = faceSpan(e, g.walls)!
      expect(face.lo).toBeCloseTo(-e.thickness, 6)
      expect(face.hi).toBeCloseTo(frame.length + e.thickness, 6)
    }
  })

  it('a court without a shape fills the frame’s span: the editor’s by default, the face’s when given', () => {
    const { p, id } = block()
    const g = generate(p.warehouseTypes!.find((t) => t.id === id)!)
    const e1 = g.edges.find((e) => e.id === 'e1')!
    const xs = (c: ReturnType<typeof courtContour>) => c.vertices.map((v) => v.x)
    expect(Math.min(...xs(courtContour({}, e1, 30)))).toBe(0)
    expect(Math.max(...xs(courtContour({}, e1, 30)))).toBeCloseTo(wallFrame(e1).length, 9)
    const face = faceSpan(e1, g.walls)!
    expect(Math.min(...xs(courtContour({}, e1, 30, face)))).toBeCloseTo(-e1.thickness, 9)
    expect(Math.max(...xs(courtContour({}, e1, 30, face)))).toBeCloseTo(wallFrame(e1).length + e1.thickness, 9)
    // a shape is as it is, whatever the span
    const shape = { vertices: [{ x: 5, y: 0, r: 0 }, { x: 9, y: 0, r: 0 }, { x: 9, y: 6, r: 0 }, { x: 5, y: 6, r: 0 }] }
    expect(courtContour({ shape }, e1, 30, face)).toBe(shape)
  })
})

describe('on the site', () => {
  it('a copy turned 30°: the frame through its place, given the face’s span, lands on the court the site derives for the wall, corner for corner', () => {
    const { p, id, option } = block()
    const placed = placeWarehouse(p, id, { x: 200, y: 150 }, 30, option)!
    const copy = placed.project.buildings.find((b) => b.id === placed.id)!.warehouse!
    const levels = new Set(placed.project.buildings.find((b) => b.id === placed.id)!.levels.map((l) => l.id))
    const hall = placed.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
    const g = generate(placed.project.warehouseTypes!.find((t) => t.id === id)!)
    const e1 = g.edges.find((e) => e.id === 'e1')!
    const face = faceSpan(e1, g.walls)!
    // one frame (the reference line's start is x = 0 in both viewports), the face's span only for the rectangle
    const frame = wallFrame(e1)
    // e1's way out on the plan: the type's (0, -1) turned by the place
    const o0 = onPlace(copy.place, { x: 0, y: 0 })
    const o1 = onPlace(copy.place, { x: 0, y: -1 })
    const way = { x: o1.x - o0.x, y: o1.y - o0.y }
    const d = deriveMassing(placed.project).docks.docks.find((x) => x.massId === hall.id && Math.hypot(x.out.x - way.x, x.out.y - way.y) < 1e-6)!
    expect(d).toBeTruthy()
    sameSet(courtContour({}, e1, d.depth, face).vertices.map((v) => onPlace(copy.place, fromWall(frame, v))), d.court)
    // the editor's own rectangle (the reference line's span) is the same court less a wall's thickness at each end: inside it
    const mine = courtContour({}, e1, d.depth).vertices.map((v) => onPlace(copy.place, fromWall(wallFrame(e1), v)))
    expect(mine).toHaveLength(4)
    const t = e1.thickness
    expect(Math.hypot(mine[1].x - mine[0].x, mine[1].y - mine[0].y)).toBeCloseTo(Math.hypot(d.court[1].x - d.court[0].x, d.court[1].y - d.court[0].y) - 2 * t, 6)
  })
})
