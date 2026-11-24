// The pure core of making a block from a footprint (Phase D.2 task 7; Decision "Draw makes a block"): the frame it stands in
// (a rectangle's rotation, else its longest straight wall) and the reference outline in metres its stroke is the outer face of.
import { describe, expect, it } from 'vitest'
import type { Contour, Footprint, Hole, WarehouseType } from '../../../../model/schema.ts'
import { footprintContour, footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { blockFrame, outlineFromFace } from '../blocks.ts'
import { newWarehouseType } from '../defaults.ts'
import { generate } from '../generate.ts'
import { onPlace } from '../copies.ts'

const rect = (cx: number, cy: number, width: number, depth: number, rotation = 0): Footprint => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation })
const poly = (...pts: [number, number][]): Contour => ({ vertices: pts.map(([x, y]) => ({ x, y, r: 0 })) })
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)

/** The type a block outline makes, as a block drawn would be: its box and its outline (none for a box). */
function typeOf(o: NonNullable<ReturnType<typeof outlineFromFace>>): WarehouseType {
  const t = newWarehouseType('wt1', 'Test', {})
  return { ...t, elements: [], hall: { ...t.hall, length: o.length, width: o.width }, morphology: { outline: o.box ? [] : o.outline, ...(o.arcs ? { arcs: o.arcs } : {}), holes: o.holes } }
}

describe('blockFrame', () => {
  it('a rectangle: its rotation', () => {
    expect(blockFrame(rect(100, 50, 60, 30, 0))).toBe(0)
    expect(blockFrame(rect(100, 50, 60, 30, 30))).toBe(30)
  })
  it('a contour: its longest straight wall along x', () => {
    // a trapezoid whose longest wall runs at 20°
    const a = 20
    const c = Math.cos((a * Math.PI) / 180)
    const s = Math.sin((a * Math.PI) / 180)
    const at = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c]
    const f: Footprint = { kind: 'contour', contour: poly(at(0, 0), at(80, 0), at(70, 30), at(10, 30)) }
    near(blockFrame(f), 20, 1e-6)
  })
  it('only curves: the axes', () => {
    const c: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 0 }, { x: 5, y: 8, r: 0 }], arcs: { 0: -0.3, 1: -0.3, 2: -0.3 } }
    expect(blockFrame({ kind: 'contour', contour: c })).toBe(0)
  })
})

describe('outlineFromFace', () => {
  it('a rectangle: the box, its walls inset by the thickness, its column line A / 1 at the reference corner', () => {
    const f = rect(100, 50, 60, 30)
    const o = outlineFromFace(footprintContour(f), [], 0.3, 0)!
    expect(o.box).toBe(true)
    near(o.length, 59.4)
    near(o.width, 29.4)
    near(o.place.x, 70.3)
    near(o.place.y, 35.3)
    expect(o.place.angle).toBe(0)
    expect(o.outline).toHaveLength(4)
    expect(o.holes).toEqual([])
    expect(o.dropped).toBe(0)
  })

  it('a rotated rectangle: the frame turned with it, the box its sides', () => {
    const f = rect(200, 120, 48, 24, 30)
    const o = outlineFromFace(footprintContour(f), [], 0.3, blockFrame(f))!
    expect(o.box).toBe(true)
    near(o.length, 47.4)
    near(o.width, 23.4)
    expect(o.place.angle).toBe(30)
    // the frame's origin is the reference box's low corner: back on the site, the face's corner moved in by the wall, along the frame
    const q = onPlace(o.place, { x: -0.3, y: -0.3 })
    const c = footprintPolygon(f)
    expect(c.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6)).toBe(true)
  })

  it('a stroke drawn clockwise is the same block', () => {
    const cw = outlineFromFace({ vertices: [{ x: 0, y: 0, r: 0 }, { x: 0, y: 20, r: 0 }, { x: 40, y: 20, r: 0 }, { x: 40, y: 0, r: 0 }] }, [], 0.3, 0)!
    const ccw = outlineFromFace(poly([0, 0], [40, 0], [40, 20], [0, 20]), [], 0.3, 0)!
    near(cw.length, ccw.length)
    near(cw.width, ccw.width)
    expect(cw.box).toBe(true)
  })

  it('a trapezoid: a free outline, its corners in metres from the box, the face the stroke again', () => {
    const stroke = poly([0, 0], [60, 0], [48, 24], [6, 24])
    const o = outlineFromFace(stroke, [], 0.3, 0)!
    expect(o.box).toBe(false)
    expect(o.outline).toHaveLength(4)
    expect(Math.min(...o.outline.map((c) => c.x))).toBe(0)
    expect(Math.min(...o.outline.map((c) => c.y))).toBe(0)
    near(o.length, Math.max(...o.outline.map((c) => c.x)), 1e-3)
    // made as a type, its outer face is the stroke (the corners stored to the millimetre: the area to a millimetre of its perimeter)
    const g = generate(typeOf(o))
    near(Math.abs(area(g.parts[0].polygon)), Math.abs(area(footprintPolygon({ kind: 'contour', contour: stroke }))), 0.1)
  })

  it('a chamfer and an arc are kept', () => {
    const stroke: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 60, y: 0, r: 0, chamfer: [6, 6] }, { x: 60, y: 30, r: 0 }, { x: 0, y: 30, r: 0 }], arcs: { 3: -0.2 } }
    const o = outlineFromFace(stroke, [], 0.3, 0)!
    expect(o.box).toBe(false)
    expect(o.outline[1].chamfer).toEqual([6, 6])
    expect(Object.keys(o.arcs ?? {})).toEqual(['3'])
  })

  it('a hole inside the block: its reference line grown by the wall, its corridor kept; one outside is dropped', () => {
    const holes: Hole[] = [
      { ...poly([20, 8], [30, 8], [30, 16], [20, 16]), corridor: 3 },
      { ...poly([80, 8], [90, 8], [90, 16], [80, 16]) },
    ]
    const o = outlineFromFace(poly([0, 0], [60, 0], [60, 30], [0, 30]), holes, 0.3, 0)!
    expect(o.holes).toHaveLength(1)
    expect(o.holes[0]).toMatchObject({ id: 'h1', corridor: 3 })
    expect(o.dropped).toBe(1)
    // the reference line stands a wall out from the cut, and the cut is the hole drawn
    const g = generate(typeOf(o))
    const cut = g.parts[0].holes[0]
    near(Math.abs(area(cut)), 80, 1e-3)
  })

  it('too small for its walls: null', () => {
    expect(outlineFromFace(poly([0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]), [], 0.3, 0)).toBeNull()
  })
})

describe('what is stored is rounded to the millimetre (Phase D.3, task 1)', () => {
  /** Whether every number has three decimals at most. */
  const mm = (v: number) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9
  const turned = (deg: number, ...pts: [number, number][]): Contour => {
    const a = (deg * Math.PI) / 180
    return poly(...pts.map(([x, y]): [number, number] => [200 + x * Math.cos(a) - y * Math.sin(a), 100 + x * Math.sin(a) + y * Math.cos(a)]))
  }

  it('a stroke at 17°: every outline corner has three decimals at most, and its face is the stroke within 1 mm', () => {
    const stroke = turned(17, [0, 0], [60, 0], [48, 24], [6, 24])
    const angle = blockFrame({ kind: 'contour', contour: stroke })
    near(angle, 17, 1e-6)
    const o = outlineFromFace(stroke, [], 0.3, angle)!
    expect(o.outline).toHaveLength(4)
    for (const c of o.outline) {
      expect(mm(c.x), `x ${c.x}`).toBe(true)
      expect(mm(c.y), `y ${c.y}`).toBe(true)
    }
    expect(mm(o.length)).toBe(true)
    expect(mm(o.width)).toBe(true)
    // made as a type, its outer face is the stroke again, on the site
    const g = generate(typeOf(o))
    const face = g.parts[0].polygon.map((p) => onPlace(o.place, p))
    for (const v of stroke.vertices) expect(Math.min(...face.map((p) => Math.hypot(p.x - v.x, p.y - v.y))), `corner ${v.x}, ${v.y}`).toBeLessThan(1e-3)
  })

  it('a hole: its corners have three decimals at most too', () => {
    const stroke = turned(17, [0, 0], [60, 0], [48, 24], [6, 24])
    const hole = turned(17, [20, 8], [31.123456, 8.098765], [30.2, 16.3333333], [21, 15.6666667])
    const o = outlineFromFace(stroke, [hole], 0.3, blockFrame({ kind: 'contour', contour: stroke }))!
    expect(o.holes).toHaveLength(1)
    for (const v of o.holes[0].vertices) {
      expect(mm(v.x), `x ${v.x}`).toBe(true)
      expect(mm(v.y), `y ${v.y}`).toBe(true)
    }
  })
})
