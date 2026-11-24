// The block editor reads a court's shape (Phase D.3, task 5): a court drawn as its contour (a path with its corners), a wall of two split courts drawn as
// two, a press between them or a window beside them picking neither, a window round one picking its wall; a court with no shape the rectangle it was.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Contour, CourtByEdge, WarehouseType } from '../../../../model/schema.ts'
import { rawPolygon } from '../../../../engine/geom/contour.ts'
import { pointInPolygon } from '../../../../engine/geom/polygon.ts'
import { newWarehouseType } from '../../engine/defaults.ts'
import { fromWall, wallFrame } from '../../engine/courts.ts'
import { generate } from '../../engine/generate.ts'
import { bubblesOf, courtPolygons, pickedInBox } from '../blockSelect.ts'
import { Courts } from '../Courts.tsx'
import { courtBand, courtsOf } from '../handleMath.ts'

const slab = (x0: number, x1: number, depth: number, chamfer = false): Contour => ({
  vertices: [
    { x: x0, y: 0, r: 0 },
    { x: x1, y: 0, r: 0 },
    { x: x1, y: depth, r: 0, ...(chamfer ? { chamfer: [6, 6] as [number, number] } : {}) },
    { x: x0, y: depth, r: 0 },
  ],
})

/** The new block (200 × 96 m, its docks on the front e1) with these courts. */
const blockWith = (courts: CourtByEdge[]): WarehouseType => ({ ...newWarehouseType('wt1', 'Warehouse A', { program: 'warehouse' }), courts })
const SPLIT: CourtByEdge[] = [
  { edge: 'e1', id: 'c1', shape: slab(0, 60, 30, true) },
  { edge: 'e1', id: 'c2', shape: slab(100, 160, 30) },
]

describe('courtsOf and courtPolygons', () => {
  it('a wall of two courts: one entry, two parts, each the shape’s contour in the type’s frame', () => {
    const t = blockWith(SPLIT)
    const g = generate(t)
    const [c] = courtsOf(t, g, 40)
    expect(courtsOf(t, g, 40)).toHaveLength(1)
    expect(c.parts.map((x) => x.id)).toEqual(['c1', 'c2'])
    const e = g.edges.find((x) => x.id === 'e1')!
    const frame = wallFrame(e)
    const want = rawPolygon(SPLIT[0].shape!).map((q) => fromWall(frame, q))
    expect(c.parts[0].polygon).toHaveLength(want.length)
    c.parts[0].polygon.forEach((q, i) => {
      expect(q.x).toBeCloseTo(want[i].x, 6)
      expect(q.y).toBeCloseTo(want[i].y, 6)
    })
    expect(courtPolygons(t, g, 40).map((x) => x.edge)).toEqual(['e1', 'e1'])
  })

  it('a court without a shape is the rectangle courtBand draws, at the block’s depth', () => {
    const t0 = blockWith([])
    const g = generate(t0)
    const [c] = courtsOf(t0, g, 40)
    expect(c.parts).toHaveLength(1)
    expect(c.parts[0].shaped).toBe(false)
    const r = courtBand(c.edge, 40).rect
    expect(c.parts[0].polygon).toEqual([
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ])
  })
})

describe('picking a shaped court', () => {
  const t = blockWith(SPLIT)
  const g = generate(t)
  const courts = courtPolygons(t, g, 40)
  const e1 = g.edges.find((x) => x.id === 'e1')!
  /** A point of the block's frame x m along its front wall and `out` m out of the face (y runs up the plan: the front is the low y). */
  const at = (x: number, out: number) => fromWall(wallFrame(e1), { x, y: out })
  const kinds = (box: { a: { x: number; y: number }; b: { x: number; y: number } }) => pickedInBox(g, box, [], courts).filter((p) => p.kind === 'court').map((p) => p.id)

  it('a press between the two courts is on neither; on one it is', () => {
    expect(courts.some((c) => pointInPolygon(at(80, 10), c.polygon))).toBe(false)
    expect(courts.some((c) => pointInPolygon(at(30, 10), c.polygon))).toBe(true)
    expect(courts.some((c) => pointInPolygon(at(130, 10), c.polygon))).toBe(true)
    // the chamfered corner of the first: the cut-off triangle is not the court
    expect(courts.some((c) => pointInPolygon(at(59.5, 29.5), c.polygon))).toBe(false)
  })

  it('a window round one court picks its wall, once; a crossing in the gap picks nothing', () => {
    const a = at(-5, -5)
    const b = at(65, 35)
    const box = { a: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, b: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } }
    expect(kinds(box)).toEqual(['e1'])
    const gap = { a: at(85, 8), b: at(95, 12) }
    expect(kinds({ a: { x: Math.max(gap.a.x, gap.b.x), y: Math.max(gap.a.y, gap.b.y) }, b: { x: Math.min(gap.a.x, gap.b.x), y: Math.min(gap.a.y, gap.b.y) } })).toEqual([])
    // both courts in a window round all of it: the wall once
    expect(kinds({ a: { x: -300, y: -300 }, b: { x: 300, y: 300 } })).toEqual(['e1'])
    expect(bubblesOf(g, 5).length).toBeGreaterThan(0)
  })
})

describe('Courts draws the contour', () => {
  const render1 = (t: WarehouseType) => {
    const g = generate(t)
    return render(
      <svg>
        <Courts t={t} g={g} standard={40} />
      </svg>,
    )
  }

  it('a shaped court is a path of its corners, one for each court of the wall; the chamfer’s two', () => {
    const { container } = render1(blockWith(SPLIT))
    const paths = [...container.querySelectorAll('path[data-court="e1"]')]
    expect(paths).toHaveLength(2)
    expect(container.querySelector('rect[data-court="e1"]')).toBeNull()
    expect(paths[0].getAttribute('data-court-part')).toBe('c1')
    // five corners on the first (its far corner chamfered), four on the second
    expect(((paths[0].getAttribute('d') ?? '').match(/L/g) ?? []).length).toBe(4)
    expect(((paths[1].getAttribute('d') ?? '').match(/L/g) ?? []).length).toBe(3)
  })

  it('a court with no shape is the rectangle it was; Courts only draws: the pills are the shape handles’ (task 7)', () => {
    const plain = render1(blockWith([]))
    expect(plain.container.querySelector('rect[data-court="e1"]')).not.toBeNull()
    expect(plain.container.querySelector('[data-court-pill]')).toBeNull()
    plain.unmount()
    const shaped = render1(blockWith(SPLIT))
    expect(shaped.container.querySelector('[data-court-pill]')).toBeNull()
  })
})
