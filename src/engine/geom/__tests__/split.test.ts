// A contour cut by a line (Phase D.3, task 2): its pieces on either side of the infinite line, each counter-clockwise, arcs, radii and
// chamfers kept where the line misses them, and `from` for each edge of each piece: the edge it came from, null for what the cut made.
import { describe, expect, it } from 'vitest'
import type { Contour, Point } from '../../../model/schema.ts'
import { arcOfEdge, bulgeAt, rawPolygon } from '../contour.ts'
import { signedArea } from '../polygon.ts'
import { splitByLine, type SplitPiece } from '../split.ts'

const rect = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  vertices: [
    { x: x0, y: y0, r: 0 },
    { x: x1, y: y0, r: 0 },
    { x: x1, y: y1, r: 0 },
    { x: x0, y: y1, r: 0 },
  ],
})
const square = () => rect(0, 0, 10, 10)
/** A U open to the north: arms 10 m wide, 20 m tall, a floor 5 m thick. Area 450 m². */
const U = (): Contour => ({
  vertices: [
    [0, 0],
    [30, 0],
    [30, 20],
    [20, 20],
    [20, 5],
    [10, 5],
    [10, 20],
    [0, 20],
  ].map(([x, y]) => ({ x, y, r: 0 })),
})

const area = (c: Contour) => signedArea(rawPolygon(c))
const total = (ps: SplitPiece[]) => ps.reduce((s, p) => s + area(p.contour), 0)
/** Every piece has one entry of `from` for each edge. */
const lineageFits = (ps: SplitPiece[]) => ps.every((p) => p.from.length === p.contour.vertices.length)

describe('splitByLine', () => {
  it('a square cut by a vertical line through it: two rectangles, counter-clockwise, their areas the square’s', () => {
    const r = splitByLine(square(), { x: 5, y: -1 }, { x: 5, y: 11 })
    expect(r.cut).toBe(true)
    expect(r.pieces).toHaveLength(2)
    for (const p of r.pieces) {
      expect(p.contour.vertices).toHaveLength(4)
      expect(area(p.contour)).toBeCloseTo(50, 9)
    }
    expect(total(r.pieces)).toBeCloseTo(100, 9)
    expect(lineageFits(r.pieces)).toBe(true)
    // the pieces' corners are the square's halves
    const xs = r.pieces.map((p) => p.contour.vertices.map((q) => q.x).sort((a, b) => a - b))
    expect(xs).toContainEqual([0, 0, 5, 5])
    expect(xs).toContainEqual([5, 5, 10, 10])
  })

  it('a line at any angle: the pieces are counter-clockwise and add up', () => {
    const r = splitByLine(square(), { x: -3, y: -3 }, { x: 4, y: 11 })
    expect(r.pieces).toHaveLength(2)
    for (const p of r.pieces) expect(area(p.contour)).toBeGreaterThan(0)
    expect(total(r.pieces)).toBeCloseTo(100, 9)
  })

  it('the line’s direction only says which piece comes first: the same pieces either way', () => {
    const up = splitByLine(square(), { x: 5, y: -1 }, { x: 5, y: 11 })
    const down = splitByLine(square(), { x: 5, y: 11 }, { x: 5, y: -1 })
    expect(down.pieces).toHaveLength(2)
    expect(down.pieces.map((p) => area(p.contour)).sort()).toEqual(up.pieces.map((p) => area(p.contour)).sort())
    // the first piece starts at the crossing the line meets first: going up, the south one, whose walk runs east
    expect(Math.min(...up.pieces[0].contour.vertices.map((q) => q.x))).toBe(5)
    expect(Math.max(...down.pieces[0].contour.vertices.map((q) => q.x))).toBe(5)
  })

  it('a line along an edge, one that touches a corner, and one that misses: one piece, the contour as it was, no cut', () => {
    const c = square()
    for (const [a, b] of [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 10, y: 0 }, { x: 0, y: 0 }],
      [{ x: 0, y: 10 }, { x: 10, y: 10 }],
      [{ x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 10, y: -2 }, { x: 14, y: 12 }],
      [{ x: 20, y: 0 }, { x: 20, y: 1 }],
      [{ x: -5, y: 5 }, { x: -5, y: 6 }],
    ] as [Point, Point][]) {
      const r = splitByLine(c, a, b)
      expect(r.cut, `${a.x},${a.y} → ${b.x},${b.y}`).toBe(false)
      expect(r.pieces).toHaveLength(1)
      expect(r.pieces[0].contour).toBe(c)
      expect(r.pieces[0].from).toEqual([0, 1, 2, 3])
    }
  })

  it('a line through two opposite corners: two triangles', () => {
    const r = splitByLine(square(), { x: -1, y: -1 }, { x: 11, y: 11 })
    expect(r.pieces).toHaveLength(2)
    for (const p of r.pieces) {
      expect(p.contour.vertices).toHaveLength(3)
      expect(area(p.contour)).toBeCloseTo(50, 9)
    }
  })

  it('a U cut across both arms: three pieces', () => {
    const r = splitByLine(U(), { x: -1, y: 10 }, { x: 31, y: 10 })
    expect(r.cut).toBe(true)
    expect(r.pieces).toHaveLength(3)
    expect(r.pieces.map((p) => Math.round(area(p.contour))).sort((a, b) => a - b)).toEqual([100, 100, 250])
    expect(total(r.pieces)).toBeCloseTo(450, 9)
    expect(lineageFits(r.pieces)).toBe(true)
    // the notch between the arms is not crossed: a piece with corners on both arms has the floor
    const floor = r.pieces.find((p) => Math.round(area(p.contour)) === 250)!
    expect(floor.contour.vertices.length).toBe(8)
  })

  it('a line along an arm’s inner wall crosses the floor under it: the arm with its floor, and the rest', () => {
    // x = 10 runs along the left arm's inner wall (y 5..20), and through the floor (y 0..5) below it
    const r = splitByLine(U(), { x: 10, y: -1 }, { x: 10, y: 21 })
    expect(r.cut).toBe(true)
    expect(r.pieces.map((p) => Math.round(area(p.contour))).sort((a, b) => a - b)).toEqual([200, 250])
    expect(total(r.pieces)).toBeCloseTo(450, 9)
  })

  it('an arc cut through the arc: each part an arc, both with the arc’s centre and radius', () => {
    // 10 × 10, its east wall a half circle out (centre (10, 5), radius 5): bulge −1 (outward, counter-clockwise)
    const c: Contour = { ...square(), arcs: { 1: -1 } }
    const whole = arcOfEdge(c.vertices[1], c.vertices[2], bulgeAt(c, 1))
    expect(whole.center).toEqual({ x: 10, y: 5 })
    const r = splitByLine(c, { x: 0, y: 5 }, { x: 20, y: 5 })
    expect(r.pieces).toHaveLength(2)
    expect(total(r.pieces)).toBeCloseTo(100 + (Math.PI * 25) / 2, 6)
    for (const p of r.pieces) {
      const edges = p.contour.vertices.map((_, i) => i).filter((i) => bulgeAt(p.contour, i) !== 0)
      expect(edges).toHaveLength(1)
      const i = edges[0]
      const arc = arcOfEdge(p.contour.vertices[i], p.contour.vertices[(i + 1) % p.contour.vertices.length], bulgeAt(p.contour, i))
      expect(arc.center.x).toBeCloseTo(10, 9)
      expect(arc.center.y).toBeCloseTo(5, 9)
      expect(arc.radius).toBeCloseTo(5, 9)
      expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI / 2, 9)
      // each part still bulges out: the same sign as the arc it came from
      expect(Math.sign(bulgeAt(p.contour, i))).toBe(-1)
      expect(p.from[i]).toBe(1)
    }
  })

  it('an arc missed by the line is kept as it was, whole', () => {
    const c: Contour = { ...square(), arcs: { 1: -1 } }
    const r = splitByLine(c, { x: 5, y: -1 }, { x: 5, y: 11 })
    const right = r.pieces.find((p) => p.contour.vertices.some((q) => q.x === 10))!
    expect(Object.values(right.contour.arcs ?? {})).toEqual([-1])
  })

  it('a chamfer and a radius on corners the line misses are kept', () => {
    const c = square()
    c.vertices[0] = { ...c.vertices[0], chamfer: [3, 3] }
    c.vertices[2] = { ...c.vertices[2], r: 2 }
    const r = splitByLine(c, { x: 5, y: -1 }, { x: 5, y: 11 })
    expect(r.pieces).toHaveLength(2)
    const chamfered = r.pieces.find((p) => p.contour.vertices.some((q) => q.x === 0 && q.y === 0))!
    expect(chamfered.contour.vertices.find((q) => q.x === 0 && q.y === 0)!.chamfer).toEqual([3, 3])
    const rounded = r.pieces.find((p) => p.contour.vertices.some((q) => q.x === 10 && q.y === 10))!
    expect(rounded.contour.vertices.find((q) => q.x === 10 && q.y === 10)!.r).toBe(2)
    expect(total(r.pieces)).toBeCloseTo(area(c), 9)
  })

  it('a chamfer the line cuts through: the pieces follow the cut, their areas the contour’s', () => {
    const c = square()
    c.vertices[0] = { ...c.vertices[0], chamfer: [3, 3] }
    const r = splitByLine(c, { x: 1, y: -1 }, { x: 1, y: 11 })
    expect(r.pieces).toHaveLength(2)
    const areas = r.pieces.map((p) => area(p.contour)).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(7.5, 9)
    expect(areas[1]).toBeCloseTo(88, 9)
    expect(total(r.pieces)).toBeCloseTo(95.5, 9)
  })

  it('a radius the line cuts through: the corner arc is split, its parts keep its centre', () => {
    const c = square()
    c.vertices[0] = { ...c.vertices[0], r: 4 }
    const r = splitByLine(c, { x: 1, y: -1 }, { x: 1, y: 11 })
    expect(r.pieces).toHaveLength(2)
    expect(total(r.pieces)).toBeCloseTo(area(c), 6)
    for (const p of r.pieces) {
      for (let i = 0; i < p.contour.vertices.length; i++) {
        if (bulgeAt(p.contour, i) === 0) continue
        const arc = arcOfEdge(p.contour.vertices[i], p.contour.vertices[(i + 1) % p.contour.vertices.length], bulgeAt(p.contour, i))
        expect(arc.center.x).toBeCloseTo(4, 9)
        expect(arc.center.y).toBeCloseTo(4, 9)
        expect(arc.radius).toBeCloseTo(4, 9)
      }
    }
  })

  it('`from`: the edge each came from, null for the cut', () => {
    const r = splitByLine(square(), { x: 5, y: -1 }, { x: 5, y: 11 })
    const edges = [
      [
        [0, 0],
        [10, 0],
      ],
      [
        [10, 0],
        [10, 10],
      ],
      [
        [10, 10],
        [0, 10],
      ],
      [
        [0, 10],
        [0, 0],
      ],
    ]
    const distTo = (q: Point, [[ax, ay], [bx, by]]: number[][]) => {
      const t = Math.max(0, Math.min(1, ((q.x - ax) * (bx - ax) + (q.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
      return Math.hypot(q.x - (ax + t * (bx - ax)), q.y - (ay + t * (by - ay)))
    }
    for (const p of r.pieces) {
      const n = p.contour.vertices.length
      expect(p.from.filter((f) => f === null)).toHaveLength(1)
      p.from.forEach((f, i) => {
        const a = p.contour.vertices[i]
        const b = p.contour.vertices[(i + 1) % n]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (f === null) expect(a.x === 5 && b.x === 5).toBe(true)
        else expect(distTo(mid, edges[f])).toBeLessThan(1e-9)
      })
    }
    expect(r.pieces.map((p) => [...p.from].sort())).toContainEqual([0, 1, 2, null])
    expect(r.pieces.map((p) => [...p.from].sort())).toContainEqual([0, 2, 3, null])
  })

  it('a line that is not a line (two equal points) cuts nothing', () => {
    const r = splitByLine(square(), { x: 5, y: 5 }, { x: 5, y: 5 })
    expect(r.cut).toBe(false)
    expect(r.pieces).toHaveLength(1)
  })

  it('a sliver of less than a square millimetre is no piece', () => {
    const r = splitByLine(square(), { x: 1e-8, y: -1 }, { x: 1e-8, y: 11 })
    expect(r.cut).toBe(false)
    expect(r.pieces).toHaveLength(1)
  })


  it('a few hundred lines through shapes with corners, arcs, radii and chamfers: the pieces are counter-clockwise, add up to the contour, and fit their lineage', () => {
    const chamfered = square()
    chamfered.vertices[0] = { ...chamfered.vertices[0], chamfer: [2, 3] }
    chamfered.vertices[2] = { ...chamfered.vertices[2], r: 3 }
    const bulged: Contour = { ...rect(0, 0, 12, 8), arcs: { 1: -0.6, 3: 0.4 } }
    const shapes = [square(), U(), chamfered, bulged, { ...U(), arcs: { 0: -0.3 } }]
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    let cuts = 0
    for (const c of shapes)
      for (let k = 0; k < 60; k++) {
        const a = { x: rnd() * 40 - 5, y: rnd() * 30 - 5 }
        const b = { x: rnd() * 40 - 5, y: rnd() * 30 - 5 }
        const r = splitByLine(c, a, b)
        expect(lineageFits(r.pieces)).toBe(true)
        if (!r.cut) {
          expect(r.pieces).toHaveLength(1)
          continue
        }
        cuts++
        for (const p of r.pieces) expect(area(p.contour)).toBeGreaterThan(0)
        expect(total(r.pieces)).toBeCloseTo(area(c), 1) // an arc is drawn as chords: its pieces’ chords differ from the whole’s by a hair
      }
    expect(cuts).toBeGreaterThan(100)
  })
})
