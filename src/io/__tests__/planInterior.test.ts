// A block's interior as the CAD plan draws it (Phase DI.1, planInterior.ts): its walls as bands with both faces, the
// reflex corners closed; its columns, its zones of other programs inside the walls, its axes past its box with their
// names, its module lines cut to inside the walls; all following the copy's place.
import { describe, expect, it } from 'vitest'
import { regionsArea } from '../../engine/geom/boolean.ts'
import { bounds, distancePointSegment, pointInPolygon } from '../../engine/geom/polygon.ts'
import { lineName } from '../../engine/grid/index.ts'
import type { Point, Polygon, WarehouseType } from '../../model/schema.ts'
import { onPlace } from '../../modules/warehouse/engine/copies.ts'
import { newWarehouseType } from '../../modules/warehouse/engine/defaults.ts'
import { generate } from '../../modules/warehouse/engine/generate.ts'
import { rectContour } from '../../modules/warehouse/engine/shape.ts'
import { BUBBLE_OUT, blockInterior, wallRegions } from '../planInterior.ts'

const t: WarehouseType = { ...newWarehouseType('t', 'T'), hall: { length: 48, width: 36, ends: 'both' }, program: 'warehouse' }
const origin = { x: 0, y: 0, angle: 0 }
const g = generate(t)
const thick = t.envelope.thickness

const withMorphology = (m: Partial<WarehouseType['morphology']>): WarehouseType => ({ ...t, morphology: { ...t.morphology, ...m } })
const holed = withMorphology({ holes: [{ id: 'h1', vertices: rectContour(12, 12, 24, 24) }] })
const zoned = withMorphology({
  zones: [
    { id: 'z1', name: 'Office', x: [0, 4], y: [0, 12], program: 'office' },
    { id: 'z2', x: [4, 16], y: [0, 12] },
  ],
})

const sizeOf = (r: Polygon) => {
  const b = bounds(r)
  return { w: b.maxX - b.minX, h: b.maxY - b.minY, ...b }
}
/** Inside the ring or on its edge. */
const inOrOn = (q: Point, r: Polygon) => pointInPolygon(q, r) || r.some((c, i) => distancePointSegment(q, c, r[(i + 1) % r.length]) <= 1e-6)
const tidy = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 + 0 : x)))
const key = (q: Point) => `${Math.round(q.x * 1e6) / 1e6 + 0},${Math.round(q.y * 1e6) / 1e6 + 0}`

describe('wallRegions', () => {
  it('an L of walls 1 m thick: one band, its reflex corner closed (no notch), its convex ones cut to the mass', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ]
    const walls = L.map((a, i) => ({ a, b: L[(i + 1) % L.length], thickness: 1 }))
    const r = wallRegions(walls, [L])
    expect(r).toHaveLength(1)
    expect(r[0]).toHaveLength(2)
    const inner = [
      { x: 1, y: 1 },
      { x: 19, y: 1 },
      { x: 19, y: 9 },
      { x: 9, y: 9 },
      { x: 9, y: 19 },
      { x: 1, y: 19 },
    ]
    expect(r[0][1].map(key).sort()).toEqual(inner.map(key).sort())
    expect(regionsArea(r)).toBeCloseTo(76, 6)
  })

  it('the L with walls 1 and 2 m thick in turn: each face at its own wall’s thickness, the reflex corner closed', () => {
    // bottom 1, right 2, inner step 1, inner rise 2, top 1, left 2: the inner face (2,1) (18,1) (18,9) (8,9) (8,19) (2,19),
    // 16 × 8 + 6 × 10 = 188 m² of the L's 300
    const L = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ]
    const thickness = [1, 2, 1, 2, 1, 2]
    const r = wallRegions(
      L.map((a, i) => ({ a, b: L[(i + 1) % L.length], thickness: thickness[i] })),
      [L],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toHaveLength(2)
    const inner = [
      { x: 2, y: 1 },
      { x: 18, y: 1 },
      { x: 18, y: 9 },
      { x: 8, y: 9 },
      { x: 8, y: 19 },
      { x: 2, y: 19 },
    ]
    expect(r[0][1].map(key).sort()).toEqual(inner.map(key).sort())
    expect(regionsArea(r)).toBeCloseTo(112, 6)
  })

  it('a side split in two walls of their own thickness (1 and 2): one band, a step where they meet, no corner that does not turn', () => {
    // the bottom split at x = 10: the inner face steps from y = 1 to y = 2 there; 18 × 8 − 9 × 1 = 135 m² inside the 200
    const outline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]
    const thickness = [1, 2, 1, 1, 1]
    const r = wallRegions(
      outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length], thickness: thickness[i] })),
      [[outline[0], outline[2], outline[3], outline[4]]],
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toHaveLength(2)
    expect(r[0][0].map(key).sort()).toEqual(['0,0', '0,10', '20,0', '20,10'])
    const inner = [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 2 },
      { x: 19, y: 2 },
      { x: 19, y: 9 },
      { x: 1, y: 9 },
    ]
    expect(r[0][1].map(key).sort()).toEqual(inner.map(key).sort())
    expect(regionsArea(r)).toBeCloseTo(65, 6)
  })
})

describe('blockInterior', () => {
  it('a box: its walls one band of two faces, as thick as its envelope', () => {
    const { walls } = blockInterior(g, origin)
    expect(walls).toHaveLength(1)
    expect(walls[0]).toHaveLength(2)
    const { w: L, h: W } = sizeOf(g.parts[0].polygon)
    expect(regionsArea(walls)).toBeCloseTo(L * W - (L - 2 * thick) * (W - 2 * thick), 6)
  })

  it('a square at each column, of its size', () => {
    const { columns } = blockInterior(g, origin)
    expect(columns).toHaveLength(g.columns.length)
    for (const c of columns) {
      expect(c).toHaveLength(4)
      const s = sizeOf(c)
      expect(s.w).toBeCloseTo(g.columnSize, 9)
      expect(s.h).toBeCloseTo(g.columnSize, 9)
    }
  })

  it('its axes: each column line named A, B… and 1, 2…, BUBBLE_OUT past its box each way', () => {
    const { axes } = blockInterior(g, origin)
    expect(BUBBLE_OUT).toBe(3)
    const { x, y } = g.runs
    expect(axes).toHaveLength(x.lines.length + y.lines.length)
    x.lines.forEach((at, i) => expect(tidy(axes[i])).toEqual(tidy({ a: { x: at, y: g.box.y0 - 3 }, b: { x: at, y: g.box.y1 + 3 }, name: lineName('x', i) })))
    y.lines.forEach((at, i) => expect(tidy(axes[x.lines.length + i])).toEqual(tidy({ a: { x: g.box.x0 - 3, y: at }, b: { x: g.box.x1 + 3, y: at }, name: lineName('y', i) })))
    expect(axes.slice(0, 2).map((a) => a.name)).toEqual(['A', 'B'])
    expect(axes.slice(x.lines.length, x.lines.length + 2).map((a) => a.name)).toEqual(['1', '2'])
  })

  it('its module lines: one piece for each that is no column line, inside the walls’ inner face', () => {
    const { modules, walls } = blockInterior(g, origin)
    const off = (ms: number[], ls: number[]) => ms.filter((m) => !ls.some((l) => Math.abs(l - m) < 1e-6))
    const xs = off(g.runs.x.modules, g.runs.x.lines)
    const ys = off(g.runs.y.modules, g.runs.y.lines)
    expect(xs.length + ys.length).toBeGreaterThan(0)
    expect(modules).toHaveLength(xs.length + ys.length)
    const inner = walls[0][1]
    for (const [a, b] of modules) {
      expect(inOrOn(a, inner)).toBe(true)
      expect(inOrOn(b, inner)).toBe(true)
    }
    expect(modules.filter(([a, b]) => Math.abs(a.x - b.x) < 1e-9).map(([a]) => a.x)).toEqual(xs)
    expect(modules.filter(([a, b]) => Math.abs(a.y - b.y) < 1e-9).map(([a]) => a.y)).toEqual(ys)
  })

  it('its zones: those of another program than its own, inside the walls, with name, program, area and a place', () => {
    const made = generate(zoned)
    const { zones, walls } = blockInterior(made, origin)
    expect(zones).toHaveLength(1)
    const [z] = zones
    expect(z).toMatchObject({ name: 'Office', program: 'office', area: made.zones.find((x) => x.id === 'z1')!.area })
    expect(z.regions.length).toBeGreaterThan(0)
    const inner = walls[0][1]
    for (const r of z.regions) for (const ring of r) for (const q of ring) expect(inOrOn(q, inner)).toBe(true)
    expect(z.regions.some((r) => pointInPolygon(z.at, r[0]))).toBe(true)
  })

  it('a hole: a band round it, no column in it, its module lines cut by it', () => {
    const made = generate(holed)
    const { walls, columns, modules } = blockInterior(made, origin)
    expect(walls).toHaveLength(2)
    const { w: L, h: W } = sizeOf(made.parts[0].polygon)
    const h = sizeOf(made.parts[0].holes[0])
    expect(regionsArea(walls)).toBeCloseTo(L * W - (L - 2 * thick) * (W - 2 * thick) + (h.w + 2 * thick) * (h.h + 2 * thick) - h.w * h.h, 6)
    const inHole = (q: Point) => q.x > h.minX + 1e-9 && q.x < h.maxX - 1e-9 && q.y > h.minY + 1e-9 && q.y < h.maxY - 1e-9
    expect(columns.some((c) => c.some(inHole))).toBe(false)
    expect(modules.length).toBeGreaterThan(blockInterior(g, origin).modules.length)
    expect(modules.some(([a, b]) => inHole({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }))).toBe(false)
  })

  it('turned and moved: every point where its place puts it', () => {
    const both = withMorphology({ holes: holed.morphology.holes, zones: zoned.morphology.zones })
    const place = { x: 100, y: 50, angle: 90 }
    const mapped = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(mapped)
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        if (Object.keys(o).length === 2 && typeof o.x === 'number' && typeof o.y === 'number') return onPlace(place, o as unknown as Point)
        return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, mapped(x)]))
      }
      return v
    }
    const there = blockInterior(generate(both), place)
    expect(there.zones).toHaveLength(1)
    expect(tidy(there)).toEqual(tidy(mapped(blockInterior(generate(both), origin))))
  })
})

describe('blockInterior of a block with a chamfered corner (Phase D.2: the grid clipped by a free outline)', () => {
  // the box's far corner (48, 36) cut 6 × 6 m: the face's cut runs from (48.3, 30.3) to (42.3, 36.3)
  const cut = withMorphology({ outline: [{ id: 'e1', x: 0, y: 0 }, { id: 'e2', x: 48, y: 0 }, { id: 'e3', x: 48, y: 36, chamfer: [6, 6] }, { id: 'e4', x: 0, y: 36 }] })
  const made = generate(cut)
  const interior = blockInterior(made, origin)

  it('its module lines stop at the cut, inside its wall', () => {
    expect(interior.modules.length).toBeGreaterThan(0)
    const inner = interior.walls[0][1]
    for (const [a, b] of interior.modules) {
      expect(inOrOn(a, inner)).toBe(true)
      expect(inOrOn(b, inner)).toBe(true)
    }
    const up = interior.modules.find(([a, b]) => a.x === 45 && b.x === 45)!
    expect(up[1].y).toBeGreaterThan(32.9)
    expect(up[1].y).toBeLessThan(33.6)
  })

  it('the angled wall has its band: the walls’ inner face runs along the cut', () => {
    expect(interior.walls).toHaveLength(1)
    const inner = interior.walls[0][1]
    expect(inner.some((q, i) => { const n = inner[(i + 1) % inner.length]; return Math.abs((n.x - q.x) + (n.y - q.y)) < 1e-6 && n.x - q.x > 3 })).toBe(true)
    // the face’s own corners
    expect(interior.walls[0][0].some((q) => Math.abs(q.x - 48.3) < 1e-6 && Math.abs(q.y - 30.3) < 1e-6)).toBe(true)
  })

  it('its axes follow the column lines cut: the line at x = 48 ends at the cut, a bubble beyond', () => {
    const a = interior.axes.find((x) => x.name === lineName('x', 4))!
    expect(a.b.y).toBeCloseTo(30.6 + BUBBLE_OUT, 6)
    expect(a.a.y).toBeCloseTo(made.box.y0 - BUBBLE_OUT, 6)
    expect(interior.columns).toHaveLength(19)
  })
})
