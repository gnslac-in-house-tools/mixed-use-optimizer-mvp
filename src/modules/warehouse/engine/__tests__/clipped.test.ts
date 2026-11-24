// The grid clipped by a free outline (Phase D.2, task 4): the bays between the column lines cut by the face (its outer
// wall face) less the holes: whole cells are bays, cut ones partial bays, outside ones none; the module and column
// lines clipped to the same; the columns where a column fits (an angled, curved or chamfered wall's inner face takes
// none that its square would cross); walls along every edge; docks only on walls along the grid.
import { describe, expect, it } from 'vitest'
import { area } from '../../../../engine/geom/polygon.ts'
import type { HallElement, Morphology, OutlineCorner, Point, WarehouseType } from '../../../../model/schema.ts'
import { newWarehouseType } from '../defaults.ts'
import { figuresOf } from '../figures.ts'
import { generate } from '../generate.ts'
import { edgeModules, rectContour } from '../shape.ts'

/** 48 × 36 m on 12 m bays in 4 modules (3 m): 4 × 3 bays, 5 × 4 column lines, 20 columns; walls 0.3 m, no elements. */
const base = (m: Partial<Morphology> = {}, elements: HallElement[] = []): WarehouseType => ({
  ...newWarehouseType('wt1', 'W', { program: 'warehouse' }),
  hall: { length: 48, width: 36, ends: 'both' },
  elements,
  morphology: { outline: [], holes: [], ...m },
})

const corners = (...xy: [number, number][]): OutlineCorner[] => xy.map(([x, y], i) => ({ id: `e${i + 1}`, x, y }))
const box = (): OutlineCorner[] => corners([0, 0], [48, 0], [48, 36], [0, 36])
const withCorner = (i: number, patch: Partial<OutlineCorner>): OutlineCorner[] => box().map((c, k) => (k === i ? { ...c, ...patch } : c))

/** The box with its far corner (48, 36) cut by a chamfer of `a` × `a` m. */
const chamfered = (a = 6, elements: HallElement[] = []) => base({ outline: withCorner(2, { chamfer: [a, a] }) }, elements)
/** A trapezoid: its right wall (e2) runs from (48, 0) to (36, 36). */
const trapezoid = (elements: HallElement[] = []) => base({ outline: corners([0, 0], [48, 0], [36, 36], [0, 36]) }, elements)
/** The box with its right wall (e2) bowed inwards (a positive bulge turns inwards on a counter-clockwise outline). */
const bowed = () => base({ outline: box(), arcs: { '1': 0.3 } })

const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const near = (p: Point, x: number, y: number, tol = 1e-6) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol
const has = (cs: Point[], x: number, y: number) => cs.some((c) => near(c, x, y))
/** Whether the square of side `s` round `c` meets the segment a → b (its inside, not just its edge). */
function crosses(c: Point, s: number, a: Point, b: Point): boolean {
  const h = s / 2
  let t0 = 0
  let t1 = 1
  const d = { x: b.x - a.x, y: b.y - a.y }
  for (const [p, q, lo, hi] of [
    [a.x, d.x, c.x - h, c.x + h],
    [a.y, d.y, c.y - h, c.y + h],
  ] as const) {
    if (Math.abs(q) < 1e-12) {
      if (p <= lo + 1e-9 || p >= hi - 1e-9) return false
    } else {
      const u0 = (lo - p) / q
      const u1 = (hi - p) / q
      t0 = Math.max(t0, Math.min(u0, u1))
      t1 = Math.min(t1, Math.max(u0, u1))
    }
  }
  return t1 - t0 > 1e-9
}

describe('an orthogonal block keeps what it had', () => {
  const g = generate(base())

  it('every cell a whole bay: 4 × 3, each between its column lines', () => {
    expect(g.cells).toHaveLength(12)
    expect(g.cells.every((c) => c.whole)).toBe(true)
    expect(g.cells.map((c) => c.area)).toEqual(Array(12).fill(144))
    expect(g.cells[0]).toMatchObject({ x: [0, 1], y: [0, 1] })
    expect(g.cells.at(-1)).toMatchObject({ x: [3, 4], y: [2, 3] })
    expect(g.cells[0].regions).toHaveLength(1)
  })

  it('a column at every grid intersection, a module line each 3 m that is no column line, in full', () => {
    expect(g.columns).toHaveLength(20)
    expect(g.lines.columns).toHaveLength(5 + 4)
    const x = g.lines.columns.filter((l) => l.axis === 'x')
    expect(x.map((l) => l.line)).toEqual([0, 1, 2, 3, 4])
    // from the face to the face (0.3 m past the box)
    for (const l of x) expect([l.a.y, l.b.y]).toEqual([-0.3, 36.3])
    expect(g.lines.modules).toHaveLength(12 + 9)
    for (const [a, b] of g.lines.modules.slice(0, 12)) expect([a.x === b.x, a.y, b.y]).toEqual([true, -0.3, 36.3])
  })

  it('its figures: no partial bay', () => {
    expect(figuresOf(g)).toMatchObject({ partialBays: 0, partialArea: 0, columns: 20 })
  })
})

describe('a corner chamfered 6 × 6 m', () => {
  const g = generate(chamfered())

  it('the cut cell is a partial bay of the right area, the others whole bays', () => {
    const cut = g.cells.filter((c) => !c.whole)
    expect(cut).toHaveLength(1)
    expect(cut[0]).toMatchObject({ x: [3, 4], y: [2, 3] })
    // the face's chamfer runs from (48.3, 30.3) to (42.3, 36.3): it takes a triangle of 5.4 m legs off the cell
    expect(cut[0].area).toBeCloseTo(144 - (5.4 * 5.4) / 2, 6)
    expect(cut[0].regions).toHaveLength(1)
    expect(area(cut[0].regions[0][0])).toBeCloseTo(cut[0].area, 6)
    expect(g.cells.filter((c) => c.whole)).toHaveLength(11)
  })

  it('the column at the cut corner goes, the others stay', () => {
    expect(g.columns).toHaveLength(19)
    expect(has(g.columns, 48, 36)).toBe(false)
    for (const [x, y] of [[48, 24], [36, 36], [36, 24], [48, 0]]) expect(has(g.columns, x, y)).toBe(true)
  })

  it('its module and column lines stop at the chamfer', () => {
    // the module line x = 45 and the line y = 33 end on the face's chamfer, x + y = 78.6
    const up = g.lines.modules.find(([a, b]) => a.x === 45 && b.x === 45)!
    expect(up[1].y).toBeCloseTo(33.6, 6)
    const across = g.lines.modules.find(([a, b]) => a.y === 33 && b.y === 33)!
    expect(Math.max(across[0].x, across[1].x)).toBeCloseTo(45.6, 6)
    // the column line A at x = 48 ends there too, 30.6 up
    const a4 = g.lines.columns.find((l) => l.axis === 'x' && l.line === 4)!
    expect(a4.b.y).toBeCloseTo(30.6, 6)
    for (const [a, b] of g.lines.modules) for (const q of [a, b]) expect(q.x + q.y).toBeLessThanOrEqual(78.6 + 1e-6)
  })

  it('walls along every edge, the chamfer one more; the first wall of an edge is its own straight one', () => {
    const cut = g.walls.filter((w) => w.corner)
    expect(cut).toHaveLength(1)
    expect(len(cut[0].a, cut[0].b)).toBeCloseTo(6 * Math.SQRT2, 6)
    expect(g.walls).toHaveLength(5)
    // edge e3 starts at the cut corner: its wall is the straight one, not the cut
    expect(g.walls.find((w) => w.edge === 'e3')!.corner).toBeUndefined()
    expect(len(g.walls.find((w) => w.edge === 'e3')!.a, g.walls.find((w) => w.edge === 'e3')!.b)).toBeCloseTo(42.6, 6)
  })

  it('its figures: a partial bay, 19 columns, the wall as long as the face', () => {
    const f = figuresOf(g)
    expect(f).toMatchObject({ partialBays: 1, columns: 19, bays: { x: 4, y: 3 } })
    expect(f.partialArea).toBeCloseTo(144 - (5.4 * 5.4) / 2, 6)
    const perimeter = 2 * (48.6 + 36.6) - 12 + 6 * Math.SQRT2
    expect(f.wallLength).toBeCloseTo(perimeter, 6)
    expect(f.wallArea).toBeCloseTo(perimeter * 12, 6)
  })

  it('a dock on the straight part of a wall along the grid stands; on the part the chamfer takes, none', () => {
    // e2 (the right wall) is cut from y = 30: module 8 (24 to 27 m) is clear, module 11 (33 to 36 m) is not
    const els: HallElement[] = [
      { id: 'd1', kind: 'dock', edge: 'e2', module: 8, width: 3 },
      { id: 'd2', kind: 'dock', edge: 'e2', module: 11, width: 3 },
    ]
    const made = generate(chamfered(6, els))
    expect(made.doors.map((d) => d.element)).toEqual(['d1'])
  })
})

describe('a trapezoid: its right wall is angled', () => {
  const g = generate(trapezoid([{ id: 'd1', kind: 'dock', edge: 'e1', module: 3, width: 3 }, { id: 'd2', kind: 'dock', edge: 'e2', module: 3, width: 3 }]))

  it('no column whose square crosses the angled wall’s inner face, or that stands outside it', () => {
    const e2 = g.edges.find((e) => e.id === 'e2')!
    expect(g.columns).toHaveLength(15)
    for (const c of g.columns) expect(crosses(c, g.columnSize, e2.a, e2.b)).toBe(false)
    // the two ends of the wall, and every one beyond it
    for (const [x, y] of [[48, 0], [36, 36], [48, 12], [48, 24]]) expect(has(g.columns, x, y)).toBe(false)
    for (const [x, y] of [[36, 0], [36, 12], [36, 24], [0, 0], [24, 36]]) expect(has(g.columns, x, y)).toBe(true)
  })

  it('the angled edge spans no modules, its wall stands, a dock on it is not generated', () => {
    const e2 = g.edges.find((e) => e.id === 'e2')!
    expect(e2.axis).toBeNull()
    expect(edgeModules(e2)).toEqual({ lo: 0, hi: 0 })
    const wall = g.walls.find((w) => w.edge === 'e2')!
    expect(len(wall.a, wall.b)).toBeGreaterThan(36)
    expect(wall.thickness).toBe(0.3)
    expect(g.doors.map((d) => d.element)).toEqual(['d1'])
  })

  it('the cells the wall cuts are partial bays; the lines are cut by it', () => {
    expect(g.cells.filter((c) => !c.whole).length).toBeGreaterThan(0)
    for (const c of g.cells.filter((x) => x.whole)) expect(c.x[1]).toBeLessThan(4)
    // the line y = 36 (the last of the rows) runs from the face on the left to where the angled face meets it
    const top = g.lines.columns.find((x) => x.axis === 'y' && x.line === 3)!
    expect(top.a.x).toBeCloseTo(-0.3, 6)
    expect(top.b.x).toBeLessThan(37)
  })

  it('its figures: the columns, and a wall area that follows the face', () => {
    const f = figuresOf(g)
    const poly = g.parts[0].polygon
    const perimeter = poly.reduce((s, q, i) => s + len(q, poly[(i + 1) % poly.length]), 0)
    expect(f.columns).toBe(15)
    expect(f.wallLength).toBeCloseTo(perimeter, 6)
    expect(f.wallArea).toBeCloseTo(perimeter * 12, 6)
    expect(f.partialBays).toBeGreaterThan(0)
  })
})

describe('an arc wall', () => {
  const g = generate(bowed())

  it('its wall in segments, all of its edge; its exact curve kept in the face', () => {
    const pieces = g.walls.filter((w) => w.edge === 'e2')
    expect(pieces.length).toBeGreaterThan(3)
    expect(pieces.every((w) => !w.corner)).toBe(true)
    // the chords run from one end to the other
    expect(len(pieces[0].a, pieces.at(-1)!.b)).toBeGreaterThan(30)
    expect(g.face.arcs && Object.keys(g.face.arcs).length).toBe(1)
  })

  it('the cells it cuts are partial; no column on it or beyond it', () => {
    expect(g.cells.filter((c) => !c.whole).map((c) => c.x[0])).toEqual([3, 3, 3])
    expect(g.cells.filter((c) => c.whole)).toHaveLength(9)
    expect(g.columns).toHaveLength(16)
    expect(g.columns.every((c) => c.x < 47)).toBe(true)
  })
})

describe('a hole', () => {
  const g = generate(base({ holes: [{ id: 'h1', vertices: rectContour(10, 10, 26, 26) }] }))
  const inside = (q: Point) => q.x > 10.3 + 1e-9 && q.x < 25.7 - 1e-9 && q.y > 10.3 + 1e-9 && q.y < 25.7 - 1e-9

  it('no cell inside it: the one it covers goes, those it touches are partial', () => {
    expect(g.cells).toHaveLength(11)
    expect(g.cells.find((c) => c.x[0] === 1 && c.y[0] === 1)).toBeUndefined()
    expect(g.cells.filter((c) => !c.whole)).toHaveLength(8)
    for (const c of g.cells) for (const r of c.regions) for (const q of r[0]) expect(inside(q)).toBe(false)
    // the box less the hole’s face
    expect(g.cells.reduce((s, c) => s + c.area, 0)).toBeCloseTo(48 * 36 - 15.4 * 15.4, 6)
  })

  it('no line and no column inside it', () => {
    expect(g.columns).toHaveLength(16)
    for (const [a, b] of g.lines.modules) expect(inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })).toBe(false)
    for (const l of g.lines.columns) expect(inside({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 })).toBe(false)
    // a module line through it comes in two pieces
    expect(g.lines.modules.filter(([a, b]) => a.x === 15 && b.x === 15)).toHaveLength(2)
  })
})

describe('a zone cut by the outline', () => {
  /** The zone from module line 15 to the end and 11 to 12: the last module of the front, 3 × 3 m at the corner. */
  const zone = { id: 'z1', x: [15, 16] as [number, number], y: [11, 12] as [number, number], program: 'office' }
  /** And a larger one, 12 × 9 m at the corner. */
  const bigZone = { id: 'z2', x: [12, 16] as [number, number], y: [9, 12] as [number, number], program: 'office' }

  it('its floor is its rectangle within the face', () => {
    const g = generate(base({ outline: withCorner(2, { chamfer: [6, 6] }), zones: [bigZone] }))
    // from 36 to the face (48.3) and from 27 to the face (36.3), less the chamfer’s triangle of 6 m legs
    expect(g.zones[0].area).toBeCloseTo(12.3 * 9.3 - 18, 2)
  })

  it('left with no floor by the outline it counts nothing, and comes back when the outline grows', () => {
    const cut = generate(base({ outline: withCorner(2, { chamfer: [12, 12] }), zones: [zone] }))
    expect(cut.zones).toHaveLength(1)
    expect(cut.zones[0]).toMatchObject({ area: 0, pieces: [] })
    const grown = generate(base({ outline: box(), zones: [zone] }))
    expect(grown.zones[0].area).toBeGreaterThan(9)
  })
})

describe('a block of an open program', () => {
  it('is not built: no columns, no walls counted; its area counts as it did', () => {
    const g = generate(chamfered())
    const built = figuresOf(g)
    const open = figuresOf(g, false)
    expect(open).toMatchObject({ columns: 0, wallLength: 0, wallArea: 0 })
    expect(open.area).toBe(built.area)
    expect(open.partialBays).toBe(built.partialBays)
  })
})
