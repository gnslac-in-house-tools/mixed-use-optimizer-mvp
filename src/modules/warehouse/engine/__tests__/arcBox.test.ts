// An outward arc lies inside its block's box (Phase D.3, task 1; Decisions "Block shape", "Clipped grid"). The box is the bounding box
// of the reference outline with its arcs (an arc's farthest point, not its chord), so the grid lies under the bulge: partial bays,
// module lines and columns by the rule of the clipped grid, and no coordinate is negative. An inward arc leaves the box as it was.
import { describe, expect, it } from 'vitest'
import { arcBox } from '../../../../engine/geom/contour.ts'
import type { Contour, OutlineCorner, WarehouseType } from '../../../../model/schema.ts'
import { outlineFromFace } from '../blocks.ts'
import { newWarehouseType } from '../defaults.ts'
import { generate } from '../generate.ts'
import { runOutlineOp } from '../outlineOp.ts'
import { ownBox } from '../shape.ts'

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)
const sharp = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x, y, r: 0 }))

/** A 48 × 36 m stroke whose edge `edge` bulges `s` m outward (a negative bulge turns outward on a counter-clockwise contour). */
const stroke = (edge: number, s: number): Contour => ({ vertices: sharp([0, 0], [48, 0], [48, 36], [0, 36]), arcs: { [edge]: -(2 * s) / (edge % 2 === 0 ? 48 : 36) } })

/** The type a block outline makes, as a block drawn would be: its box and its outline. */
function typeOf(o: NonNullable<ReturnType<typeof outlineFromFace>>): WarehouseType {
  const t = newWarehouseType('wt1', 'Test', {})
  return { ...t, elements: [], hall: { ...t.hall, length: o.length, width: o.width }, morphology: { outline: o.outline, ...(o.arcs ? { arcs: o.arcs } : {}), holes: o.holes } }
}

describe('arcBox: the bounding box of a contour with its arcs', () => {
  it('straight edges: the corners’ box', () => {
    expect(arcBox({ vertices: sharp([0, 0], [10, 0], [10, 6], [0, 6]) })).toEqual({ x0: 0, y0: 0, x1: 10, y1: 6 })
  })

  it('an outward arc reaches past its chord by its sagitta, on any side', () => {
    const north = arcBox(stroke(2, 4))
    near(north.y1, 40)
    near(north.y0, 0)
    near(north.x0, 0)
    near(north.x1, 48)
    const south = arcBox(stroke(0, 4))
    near(south.y0, -4)
    near(south.y1, 36)
    const east = arcBox(stroke(1, 5))
    near(east.x1, 53)
    const west = arcBox(stroke(3, 5))
    near(west.x0, -5)
  })

  it('an inward arc leaves the corners’ box as it was', () => {
    const c: Contour = { vertices: sharp([0, 0], [48, 0], [48, 36], [0, 36]), arcs: { 2: 1 / 6 } }
    expect(arcBox(c)).toEqual({ x0: 0, y0: 0, x1: 48, y1: 36 })
  })

  it('an arc on a slanted chord: its farthest points are not at its middle (checked against the circle sampled)', () => {
    // the triangle’s long edge (10, 10) → (0, 0) bulges outward by a 240° sweep: its left-most and top-most points are not its apex
    const c: Contour = { vertices: sharp([0, 0], [10, 0], [10, 10]), arcs: { 2: -Math.tan(Math.PI / 3) } }
    const chord = Math.hypot(10, 10)
    const theta = (4 * Math.PI) / 3
    const radius = chord / 2 / Math.sin(theta / 2)
    const mid = { x: 5, y: 5 }
    // the way out: to the right of (10, 10) → (0, 0), up and to the left
    const side = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
    // a sweep past a half turn has its centre on the bulge’s side of the chord (cos of its half is negative)
    const centre = { x: mid.x - side.x * radius * Math.cos(theta / 2), y: mid.y - side.y * radius * Math.cos(theta / 2) }
    let x0 = Infinity
    let y1 = -Infinity
    for (let k = 0; k < 36000; k++) {
      const p = { x: centre.x + radius * Math.cos((k / 36000) * 2 * Math.PI), y: centre.y + radius * Math.sin((k / 36000) * 2 * Math.PI) }
      if ((p.x - mid.x) * side.x + (p.y - mid.y) * side.y < 0) continue
      x0 = Math.min(x0, p.x)
      y1 = Math.max(y1, p.y)
    }
    const box = arcBox(c)
    near(box.x0, Math.min(0, x0), 1e-3)
    near(box.y1, Math.max(10, y1), 1e-3)
    expect(box.x0).toBeLessThan(-1)
  })
})

describe('ownBox reads an arc’s farthest point', () => {
  it('the outline with its arcs: 40 m deep, as it bulges', () => {
    const outline: OutlineCorner[] = [
      { id: 'e1', x: 0, y: 0 },
      { id: 'e2', x: 48, y: 0 },
      { id: 'e3', x: 48, y: 36 },
      { id: 'e4', x: 0, y: 36 },
    ]
    const b = ownBox(outline, { '2': -1 / 6 })
    near(b.x, 48)
    near(b.y, 40)
    // an inward arc, or none: the corners’
    expect(ownBox(outline, { '2': 1 / 6 })).toEqual({ x: 48, y: 36 })
    expect(ownBox(outline)).toEqual({ x: 48, y: 36 })
  })
})

describe('a block whose north wall bulges 4 m outward', () => {
  const o = outlineFromFace(stroke(2, 4), [], 0.3, 0)!

  it('its box holds the bulge: 40 m deep less the walls (the reference line stands a wall in)', () => {
    near(o.length, 47.4)
    // the apex is 4 m past the face’s chord, the reference line 0.3 m inside it, the south wall 0.3 m in: 40 − 0.3 − 0.3
    near(o.width, 39.4, 1e-3)
    expect(o.box).toBe(false)
  })

  it('no corner or arc reaches a negative coordinate: the box’s low corner is the outline’s', () => {
    expect(Math.min(...o.outline.map((c) => c.x))).toBe(0)
    expect(Math.min(...o.outline.map((c) => c.y))).toBe(0)
    const box = arcBox({ vertices: o.outline.map((c) => ({ x: c.x, y: c.y, r: 0 })), ...(o.arcs ? { arcs: o.arcs } : {}) })
    near(box.x0, 0)
    near(box.y0, 0)
    near(box.x1, o.length, 1e-3)
    near(box.y1, o.width, 1e-3)
  })

  it('the outline stays where it was drawn on the box it makes (the box was not read short, so no corner is moved)', () => {
    const t = typeOf(o)
    const g = generate(t)
    g.outline.forEach((c, i) => {
      near(c.x, o.outline[i].x)
      near(c.y, o.outline[i].y)
    })
  })

  it('the cells under the bulge are partial bays, and no line has a negative coordinate', () => {
    const g = generate(typeOf(o))
    const top = g.runs.y.lines.length - 1
    const under = g.cells.filter((c) => c.y[1] === top && c.area > 0)
    expect(under.length).toBeGreaterThan(0)
    // the cells above the straight wall (35.7 m) are cut by the arc: the row has partial bays (those at its ends at least)
    expect(under.some((c) => !c.whole)).toBe(true)
    // the lines run to the outer face (a wall, 0.3 m, outside the reference outline): none further out than that, the columns on the grid’s own lines
    const pts = [...g.lines.modules.flat(), ...g.lines.columns.flatMap((l) => [l.a, l.b])]
    for (const p of pts) {
      expect(p.x, 'x').toBeGreaterThan(-0.3 - 1e-6)
      expect(p.y, 'y').toBeGreaterThan(-0.3 - 1e-6)
    }
    for (const p of g.columns) {
      expect(p.x, 'column x').toBeGreaterThan(-1e-6)
      expect(p.y, 'column y').toBeGreaterThan(-1e-6)
    }
    expect(Math.min(...g.runs.x.lines, ...g.runs.y.lines)).toBeGreaterThan(-1e-6)
  })

  it('an edit that moves nothing leaves the box as it is (it was read short: the arc left outside the box)', () => {
    const t = typeOf(o)
    const g = generate(t)
    const r = runOutlineOp(t, g, { op: 'radius', vertex: 0, r: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      near(r.edit.fit.hall.length, 47.4, 1e-3)
      near(r.edit.fit.hall.width, 39.4, 1e-3)
      expect(Math.min(...r.edit.outline.map((c) => c.y))).toBe(0)
    }
  })
})

describe('a block whose south wall bulges 4 m outward', () => {
  it('the outline is moved up by the bulge, so no coordinate is negative', () => {
    const o = outlineFromFace(stroke(0, 4), [], 0.3, 0)!
    expect(Math.min(...o.outline.map((c) => c.y))).toBeGreaterThan(3)
    const box = arcBox({ vertices: o.outline.map((c) => ({ x: c.x, y: c.y, r: 0 })), ...(o.arcs ? { arcs: o.arcs } : {}) })
    near(box.y0, 0, 1e-3)
    near(box.x0, 0, 1e-3)
    near(o.width, 39.4, 1e-3)
  })
})

describe('an inward arc', () => {
  it('leaves the box as it was: the corners’', () => {
    const inward: Contour = { vertices: sharp([0, 0], [48, 0], [48, 36], [0, 36]), arcs: { 2: 1 / 6 } }
    const o = outlineFromFace(inward, [], 0.3, 0)!
    near(o.length, 47.4)
    // the corners’ own box: the reference line of an inward arc ends a little lower than its chord’s wall (the arc is inset with its centre kept)
    near(o.width, Math.max(...o.outline.map((c) => c.y)), 1e-3)
    expect(o.width).toBeLessThan(35.4)
  })
})
