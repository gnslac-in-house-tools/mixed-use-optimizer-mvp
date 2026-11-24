// A truck court's own shape on its wall (Phase D.3, task 3; Decision "Truck court"): its contour in the wall's frame, the rule on write, the
// court split by a line, its id. Pure: no project, no store.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../../model/schema.ts'
import { signedArea } from '../../../../engine/geom/polygon.ts'
import { rawPolygon } from '../../../../engine/geom/contour.ts'
import { IN_FRONT, STAYS_ON_WALL, courtContour, courtDepth, courtRule, freeCourtId, fromWall, splitCourt, toWall, wallFrame, wentNote } from '../courts.ts'
import type { ShapeEdge } from '../shape.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  vertices: [
    { x: x0, y: y0, r: 0 },
    { x: x1, y: y0, r: 0 },
    { x: x1, y: y1, r: 0 },
    { x: x0, y: y1, r: 0 },
  ],
})
const poly = (...q: [number, number][]): Contour => ({ vertices: q.map(([x, y]) => ({ x, y, r: 0 })) })
const area = (c: Contour) => Math.abs(signedArea(rawPolygon(c)))
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(tol)

/** A block's wall as its outline reads it: the reference line a → b (counter-clockwise outline: the wall's way out is its right), its wall 0.3 m thick. */
const wall = (a: [number, number], b: [number, number], side: ShapeEdge['side']): Pick<ShapeEdge, 'a' | 'b' | 'horizontal' | 'side' | 'offset' | 'thickness'> => ({
  a: { x: a[0], y: a[1] },
  b: { x: b[0], y: b[1] },
  horizontal: Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]),
  side,
  offset: 0,
  thickness: 0.3,
})

describe('the wall’s frame', () => {
  it('x along the face from the end where the outline enters the wall, y out of it, for each of a block’s four walls', () => {
    // a block 36 × 24 m: south (e1) runs east, east (e2) north, north (e3) west, west (e4) south
    const south = wallFrame(wall([0, 0], [36, 0], 'front'))
    expect(south).toEqual({ origin: { x: 0, y: -0.3 }, along: { x: 1, y: 0 }, out: { x: 0, y: -1 }, length: 36 })
    const east = wallFrame(wall([36, 0], [36, 24], 'right'))
    expect(east).toEqual({ origin: { x: 36.3, y: 0 }, along: { x: 0, y: 1 }, out: { x: 1, y: 0 }, length: 24 })
    const north = wallFrame(wall([36, 24], [0, 24], 'back'))
    expect(north).toEqual({ origin: { x: 36, y: 24.3 }, along: { x: -1, y: 0 }, out: { x: 0, y: 1 }, length: 36 })
    const west = wallFrame(wall([0, 24], [0, 0], 'left'))
    expect(west).toEqual({ origin: { x: -0.3, y: 24 }, along: { x: 0, y: -1 }, out: { x: -1, y: 0 }, length: 24 })
  })

  it('toWall and fromWall are inverses; the wall’s start is its x 0 on its face', () => {
    for (const e of [wall([0, 0], [36, 0], 'front'), wall([36, 0], [36, 24], 'right'), wall([36, 24], [0, 24], 'back'), wall([0, 24], [0, 0], 'left')]) {
      const f = wallFrame(e)
      expect(fromWall(f, { x: 0, y: 0 })).toEqual(f.origin)
      for (const q of [{ x: 3, y: 5 }, { x: f.length, y: 40 }, { x: -2, y: 0 }]) {
        const back = toWall(f, fromWall(f, q))
        near(back.x, q.x)
        near(back.y, q.y)
      }
    }
  })

  it('a wall with a facade offset has its face out by the offset and the wall', () => {
    const f = wallFrame({ ...wall([0, 0], [36, 0], 'front'), offset: 0.2 })
    near(f.origin.y, -0.5)
  })
})

describe('a court’s contour', () => {
  const e = wall([0, 0], [36, 0], 'front')

  it('with no shape: today’s rectangle across the wall’s face span, as deep as it says', () => {
    expect(courtContour({}, e, 35)).toEqual(rect(0, 0, 36, 35))
  })

  it('with a shape: the shape as it is, whatever the depth', () => {
    const shape = poly([0, 0], [20, 0], [20, 12], [0, 12])
    expect(courtContour({ shape }, e, 35)).toBe(shape)
  })

  it('its depth: the deepest point, an arc’s bulge counted', () => {
    expect(courtDepth(rect(0, 0, 36, 35))).toBe(35)
    const bulged: Contour = { ...rect(0, 0, 36, 30), arcs: { '2': -0.2 } }
    expect(courtDepth(bulged)).toBeGreaterThan(30)
  })
})

describe('the rule on write', () => {
  const L = 36
  const ok = (r: ReturnType<typeof courtRule>) => {
    expect('reason' in r, JSON.stringify(r)).toBe(false)
    return r as Extract<ReturnType<typeof courtRule>, { contour: Contour }>
  }

  it('a rectangle on its wall is as it is, with nothing to say', () => {
    const c = rect(0, 0, 36, 30)
    expect(courtRule(c, L)).toEqual({ contour: c, notes: [] })
  })

  it('the wall side pushed off the wall: refused, a court stays on its wall', () => {
    expect(courtRule(rect(0, 2, 36, 30), L)).toEqual({ reason: STAYS_ON_WALL })
    expect(STAYS_ON_WALL).toBe('A truck court stays on its wall')
    // pushed behind it too
    expect(courtRule(rect(0, -2, 36, 30), L)).toEqual({ reason: STAYS_ON_WALL })
  })

  it('a corner behind the face: refused, a court stands in front of its wall', () => {
    const behind = poly([0, 0], [20, 0], [20, -3], [30, -3], [30, 0], [36, 0], [36, 30], [0, 30])
    expect(courtRule(behind, L)).toEqual({ reason: IN_FRONT })
    expect(IN_FRONT).toBe('A truck court stands in front of its wall')
  })

  it('a corner on the wall slides along it and the court stays a court', () => {
    const r = ok(courtRule(poly([4, 0], [36, 0], [36, 30], [0, 30]), L))
    expect(r.notes).toEqual([])
  })

  it('230 m deep: held to 200 m, with the note; 3 m deep: held to 5 m', () => {
    const deep = ok(courtRule(rect(0, 0, 36, 230), L))
    expect(courtDepth(deep.contour)).toBe(200)
    expect(deep.notes).toEqual(['Held to 200 m: a court is 5–200 m deep'])
    const shallow = ok(courtRule(rect(0, 0, 36, 3), L))
    expect(courtDepth(shallow.contour)).toBe(5)
    expect(shallow.notes).toEqual(['Held to 5 m: a court is 5–200 m deep'])
  })

  it('the wall side past the wall’s end: clipped to it', () => {
    const r = ok(courtRule(rect(-5, 0, 40, 20), L))
    const xs = r.contour.vertices.map((v) => v.x)
    near(Math.min(...xs), 0)
    near(Math.max(...xs), 36)
    near(area(r.contour), 36 * 20, 1e-6)
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toMatch(/wall/i)
  })

  it('a far part that flares past the wall’s ends is kept', () => {
    const flare = poly([0, 0], [36, 0], [46, 20], [-10, 20])
    expect(courtRule(flare, L)).toEqual({ contour: flare, notes: [] })
  })

  it('a corner with a chamfer, and an arc on a side, are kept', () => {
    const c: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 36, y: 0, r: 0 }, { x: 36, y: 30, r: 0, chamfer: [6, 6] }, { x: 0, y: 30, r: 0 }], arcs: { '3': -0.1 } }
    const r = ok(courtRule(c, L))
    expect(r.contour.vertices[2].chamfer).toEqual([6, 6])
    expect(r.contour.arcs).toEqual({ '3': -0.1 })
  })

  it('what is stored is rounded to the millimetre, a corner a hair off the wall on it', () => {
    const r = ok(courtRule(poly([0, 0.00004], [36.0004, -0.00004], [36, 30.123456], [0, 30.123456]), L))
    expect(r.contour.vertices[0].y).toBe(0)
    expect(r.contour.vertices[1].y).toBe(0)
    expect(r.contour.vertices[2].y).toBe(30.123)
    expect(r.contour.vertices[1].x).toBe(36)
  })

  it('a contour that crosses itself, or runs clockwise, is refused', () => {
    expect('reason' in courtRule(poly([0, 0], [36, 0], [0, 30], [36, 30]), L)).toBe(true)
    expect('reason' in courtRule(poly([0, 0], [0, 30], [36, 30], [36, 0]), L)).toBe(true)
  })
})

describe('a court split by a line', () => {
  const c = rect(0, 0, 36, 30)
  const byX = (a: Contour, b: Contour) => Math.min(...a.vertices.map((v) => v.x)) - Math.min(...b.vertices.map((v) => v.x))

  it('square to its wall: two courts, each touching the wall, nothing went', () => {
    const r = splitCourt(c, { x: 12, y: 0 }, { x: 12, y: 1 })
    expect(r.cut).toBe(true)
    expect(r.went).toBe(0)
    const [a, b] = [...r.pieces].sort(byX)
    expect(r.pieces).toHaveLength(2)
    near(area(a) + area(b), 36 * 30, 1e-6)
    for (const p of r.pieces) expect(p.vertices.filter((v) => Math.abs(v.y) < 1e-9).length).toBeGreaterThanOrEqual(2)
    near(area(a), 12 * 30, 1e-6)
  })

  it('a line parallel to the wall at 10 m: the near part stays, the far one goes (one went)', () => {
    const r = splitCourt(c, { x: 0, y: 10 }, { x: 1, y: 10 })
    expect(r.cut).toBe(true)
    expect(r.went).toBe(1)
    expect(r.pieces).toHaveLength(1)
    expect(courtDepth(r.pieces[0])).toBe(10)
    near(area(r.pieces[0]), 36 * 10, 1e-6)
    expect(wentNote(1)).toBe('1 piece off the wall went')
    expect(wentNote(2)).toBe('2 pieces off the wall went')
  })

  it('a line that misses it: the court, not cut', () => {
    const r = splitCourt(c, { x: 50, y: 0 }, { x: 50, y: 1 })
    expect(r).toEqual({ pieces: [c], went: 0, cut: false })
  })

  it('a slanted line keeps both pieces that reach the wall', () => {
    const r = splitCourt(c, { x: 0, y: 30 }, { x: 36, y: 0 })
    expect(r.pieces.length).toBeGreaterThanOrEqual(1)
    expect(r.pieces.length + r.went).toBe(2)
  })

  it('a piece with under a metre on the wall is off it', () => {
    const r = splitCourt(c, { x: 0.5, y: 0 }, { x: 0.5, y: 1 })
    expect(r.pieces).toHaveLength(1)
    expect(r.went).toBe(1)
    near(area(r.pieces[0]), 35.5 * 30, 1e-6)
  })
})

describe('a court’s id', () => {
  it('the first of c1, c2… not taken', () => {
    expect(freeCourtId([])).toBe('c1')
    expect(freeCourtId([{ id: 'c1' }, { id: 'c3' }, {}])).toBe('c2')
    expect(freeCourtId([{ id: 'c1' }, { id: 'c2' }])).toBe('c3')
  })
})
