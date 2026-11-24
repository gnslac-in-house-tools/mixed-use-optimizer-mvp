// The CAD plan's one paving (Phase DI.2, planPaving.ts): where streets meet (`junctionsOf`), and the streets, roads,
// courts and approaches unioned as one outline with its inside corners rounded there, as arcs (`pavingRings`).
import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../../engine/geom/polygon.ts'
import type { Point, Polygon } from '../../model/schema.ts'
import { CURB_RADIUS, TOUCH, junctionsOf, pavingRings } from '../planPaving.ts'
import type { PavingRoad } from '../../engine/path/join.ts'

const P = (x: number, y: number): Point => ({ x, y })
/** Points rounded to 1e-6 and ordered, to compare rings whatever vertex they start at. */
const sorted = (qs: Point[]) => qs.map((q) => ({ x: Math.round(q.x * 1e6) / 1e6 + 0, y: Math.round(q.y * 1e6) / 1e6 + 0 })).sort((a, b) => a.x - b.x || a.y - b.y)
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]
/** The T: a through road 10 m wide with its turning radius, a road 8 m wide ending on it. */
const through: PavingRoad = { points: [P(-50, 0), P(50, 0)], width: 10, radius: 12 }
const branch: PavingRoad = { points: [P(0, 0), P(0, 40)], width: 8 }

describe('junctionsOf', () => {
  it('the constants of the spec', () => {
    expect(CURB_RADIUS).toBe(9)
    expect(TOUCH).toBe(0.5)
  })

  it('a T: one junction where the road ends, the larger radius, 1.5 × the widest as its reach', () => {
    const js = junctionsOf([through, branch])
    expect(js).toHaveLength(1)
    expect(js[0].at.x).toBeCloseTo(0, 9)
    expect(js[0].at.y).toBeCloseTo(0, 9)
    expect(js[0]).toMatchObject({ radius: 12, reach: 15 })
  })

  it('a cross without a shared vertex: where they cross, CURB_RADIUS when neither has a radius', () => {
    const js = junctionsOf([{ points: [P(-50, 0), P(50, 0)], width: 10 }, { points: [P(0, -50), P(0, 50)], width: 8 }])
    expect(js).toHaveLength(1)
    expect(js[0].at.x).toBeCloseTo(0, 9)
    expect(js[0].at.y).toBeCloseTo(0, 9)
    expect(js[0]).toMatchObject({ radius: CURB_RADIUS, reach: 15 })
  })

  it('a cross through a vertex both share, neither ending there: one junction too', () => {
    const js = junctionsOf([{ points: [P(-50, 0), P(0, 0), P(50, 0)], width: 10 }, { points: [P(0, -50), P(0, 0), P(0, 50)], width: 8 }])
    expect(js).toHaveLength(1)
    expect(js[0].at.x).toBeCloseTo(0, 9)
    expect(js[0].at.y).toBeCloseTo(0, 9)
  })

  it('a road ending within half the other’s width + TOUCH of its centreline: a junction at its end; farther, none', () => {
    const main: PavingRoad = { points: [P(-50, 0), P(50, 0)], width: 8 }
    const near = junctionsOf([main, { points: [P(0, 4.4), P(0, 40)], width: 6 }])
    expect(near).toEqual([{ at: P(0, 4.4), radius: CURB_RADIUS, reach: 12 }])
    expect(junctionsOf([main, { points: [P(0, 6), P(0, 40)], width: 6 }])).toEqual([])
  })

  it('parallel streets never meet', () => {
    expect(junctionsOf([{ points: [P(0, 0), P(100, 0)], width: 10 }, { points: [P(0, 13), P(100, 13)], width: 10 }])).toEqual([])
  })

  it('junctions closer than 1 m are one: the larger radius and reach', () => {
    const js = junctionsOf(
      [
        through,
        { points: [P(0, 0), P(0, 40)], width: 8, radius: 20 },
        { points: [P(0.6, 0), P(0.6, -40)], width: 12 },
      ],
    )
    expect(js).toHaveLength(1)
    expect(js[0]).toMatchObject({ radius: 20, reach: 18 })
  })
})

describe('pavingRings', () => {
  it('the T: one ring, its two curb returns arcs, nothing else rounded', () => {
    const rings = pavingRings({ roads: [through, branch], areas: [] })
    expect(rings).toHaveLength(1)
    const arcs = rings[0].bulges.filter((b) => b !== 0)
    expect(arcs).toHaveLength(2)
    // each a quarter turn, clockwise (DXF's negative): the road meets the other square
    for (const b of arcs) expect(b).toBeCloseTo(-Math.tan(Math.PI / 8), 6)
    expect(rings[0].bulges).toHaveLength(rings[0].points.length)
    // tangent where the radius (12) puts it: 12 m along the through road's edge from the corner (4, 5)
    expect(rings[0].points.some((q) => Math.abs(q.x - 16) < 1e-6 && Math.abs(q.y - 5) < 1e-6)).toBe(true)
  })

  it('parallel streets 13 m apart: two rings, never bridged, no arc', () => {
    const rings = pavingRings({ roads: [{ points: [P(0, 0), P(100, 0)], width: 10 }, { points: [P(0, 13), P(100, 13)], width: 10 }], areas: [] })
    expect(rings).toHaveLength(2)
    expect(rings.every((r) => r.bulges.every((b) => b === 0))).toBe(true)
  })

  it('a court touching the through road is paved with it: still one ring', () => {
    const rings = pavingRings({ roads: [through, branch], areas: [rect(10, 5, 40, 25)] })
    expect(rings).toHaveLength(1)
  })

  it('a street ending on a migrated frontage street (an existing road along the boundary) gets its curb returns, and the two are one paving', () => {
    const frontage: PavingRoad = { points: [P(-100, -10), P(100, -10)], width: 20 }
    const rings = pavingRings({ roads: [frontage, { points: [P(0, 0), P(0, 40)], width: 8 }], areas: [] })
    expect(rings).toHaveLength(1)
    expect(rings[0].bulges.filter((b) => b !== 0)).toHaveLength(2)
    expect(junctionsOf([frontage, { points: [P(0, 0), P(0, 40)], width: 8 }])).toHaveLength(1)
  })

  describe('curb returns clear of what stands by the paving', () => {
    const has = (qs: Point[], q: Point) => qs.some((x) => Math.hypot(x.x - q.x, x.y - q.y) < 1e-6)

    it('a stall along the through road’s curb, from 2 m off the inside corner: that return shrinks to reach it', () => {
      // the T's inside corners are (4, 5) and (−4, 5), each a return of 12 m; the stall stands in the first one's way
      const stall = rect(6, 5, 8.5, 10)
      const [ring, ...more] = pavingRings({ roads: [through, branch], areas: [], blockers: [[stall]] })
      expect(more).toEqual([])
      const arcs = ring.bulges.filter((b) => b !== 0)
      expect(arcs).toHaveLength(2)
      for (const b of arcs) expect(b).toBeCloseTo(-Math.tan(Math.PI / 8), 6)
      expect(has(ring.points, P(6, 5))).toBe(true)
      expect(has(ring.points, P(4, 7))).toBe(true)
      // the other return as it was
      expect(has(ring.points, P(-16, 5))).toBe(true)
      expect(has(ring.points, P(-4, 17))).toBe(true)
    })

    it('a stall in the inside corner itself: no return there', () => {
      const [ring] = pavingRings({ roads: [through, branch], areas: [], blockers: [[rect(4, 5, 6.5, 10)]] })
      expect(ring.bulges.filter((b) => b !== 0)).toHaveLength(1)
      expect(has(ring.points, P(4, 5))).toBe(true)
    })

    it('a court 1 m off the branch, a ring of its own: the return stops at its corner, never across it', () => {
      const court = rect(5, 7, 30, 25)
      const rings = pavingRings({ roads: [{ ...through, radius: 15 }, branch], areas: [court] })
      expect(rings).toHaveLength(2)
      const road = rings.find((r) => r.points.some((q) => q.y < 0))!
      // the court's corner (5, 7) is 1 + 2 = 3 m into the return's corner (α + β)
      expect(has(road.points, P(7, 5))).toBe(true)
      expect(has(road.points, P(4, 8))).toBe(true)
    })
  })

  it('a hole under 1 m² where two road ends nearly meet is no hole; an outer ring that small stays', () => {
    // the ends 0.36 m apart: their strips and the closing leave a sliver between them
    const rings = pavingRings({ roads: [{ points: [P(-50, 0), P(0, 0)], width: 10 }, { points: [P(0.3, 0.2), P(0.3, 50)], width: 10 }], areas: [] })
    expect(rings).toHaveLength(1)
    const lone = pavingRings({ roads: [through], areas: [rect(100, 100, 100.5, 100.5)] })
    expect(lone).toHaveLength(2)
  })

  it('a road ending up to TOUCH short of another’s edge runs on to it: one ring, its two returns', () => {
    const short: PavingRoad = { points: [P(0, 5.3), P(0, 40)], width: 8 }
    expect(junctionsOf([through, short])).toHaveLength(1)
    const rings = pavingRings({ roads: [through, short], areas: [] })
    expect(rings).toHaveLength(1)
    expect(rings[0].bulges.filter((b) => b !== 0)).toHaveLength(2)
    // farther than TOUCH: no junction, nothing joined
    expect(pavingRings({ roads: [through, { points: [P(0, 5.6), P(0, 40)], width: 8 }], areas: [] })).toHaveLength(2)
  })

  it('a branch at 30°: both returns, the acute one too (its corner beyond 1.5 × the widest)', () => {
    const c = Math.cos(Math.PI / 6)
    const s = Math.sin(Math.PI / 6)
    const acute: PavingRoad = { points: [P(0, 0), P(60 * c, 60 * s)], width: 8 }
    const [ring, ...more] = pavingRings({ roads: [through, acute], areas: [] })
    expect(more).toEqual([])
    const arcs = ring.bulges.filter((b) => b !== 0)
    expect(arcs).toHaveLength(2)
    // the acute corner turns 150°, the obtuse one 30°
    const [sharp, gentle] = [...arcs].sort((a, b) => a - b)
    expect(sharp).toBeCloseTo(-Math.tan((5 * Math.PI) / 24), 6)
    expect(gentle).toBeCloseTo(-Math.tan(Math.PI / 24), 6)
    // a junction at a right angle keeps 1.5 × the widest; the reach never passes 4 × the widest
    expect(junctionsOf([through, branch])[0].reach).toBe(15)
    const flat: PavingRoad = { points: [P(0, 0), P(30, 0.5)], width: 8 }
    expect(junctionsOf([through, flat]).find((j) => Math.hypot(j.at.x, j.at.y) < 1e-9)!.reach).toBeCloseTo(40, 9)
  })

  it('a loop of streets: its hole a ring of its own, its inside corners near the junctions rounded too', () => {
    const loop: PavingRoad[] = [
      { points: [P(0, 0), P(60, 0)], width: 8 },
      { points: [P(60, 0), P(60, 60)], width: 8 },
      { points: [P(60, 60), P(0, 60)], width: 8 },
      { points: [P(0, 60), P(0, 0)], width: 8 },
    ]
    const rings = pavingRings({ roads: loop, areas: [] })
    expect(rings).toHaveLength(2)
    // the hole's four corners are where the streets meet: each rounded
    const hole = rings.find((r) => r.points.every((q) => q.x > 1 && q.x < 59 && q.y > 1 && q.y < 59))!
    expect(hole.bulges.filter((b) => b !== 0)).toHaveLength(4)
    // the roads meet end to end: their outer corners closed square, no notch and no arc
    const outer = rings.find((r) => r !== hole)!
    expect(sorted(outer.points)).toEqual(sorted([P(-4, -4), P(64, -4), P(64, 64), P(-4, 64)]))
    expect(outer.bulges).toEqual([0, 0, 0, 0])
  })

  describe('roads that meet end to end close their outer corner', () => {
    const east: PavingRoad = { points: [P(0, 0), P(50, 0)], width: 10 }
    const has = (qs: Point[], q: Point) => qs.some((x) => Math.hypot(x.x - q.x, x.y - q.y) < 1e-4) // the booleans' 0.1 mm

    it('at a right angle: the outer corner square, the inner one its curb return', () => {
      const [ring, ...more] = pavingRings({ roads: [east, { points: [P(50, 0), P(50, 50)], width: 10 }], areas: [] })
      expect(more).toEqual([])
      expect(has(ring.points, P(55, -5))).toBe(true)
      // nothing of the notch the two square ends left (5 × 5 m at the outer corner)
      expect(ring.points.filter((q) => q.x > 50 - 1e-6 && q.x < 55 - 1e-6 && q.y > -5 + 1e-6 && q.y < 1e-6)).toEqual([])
      expect(ring.bulges.filter((b) => b !== 0)).toHaveLength(1)
    })

    it('of different widths: each road’s outer edge runs on, at its own half width, to their mitre point', () => {
      const [ring] = pavingRings({ roads: [east, { points: [P(50, 0), P(50, 50)], width: 6 }], areas: [] })
      expect(has(ring.points, P(53, -5))).toBe(true)
    })

    it('at a gentle bend: closed at the mitre point, nothing left at the node', () => {
      const bend: PavingRoad = { points: [P(50, 0), P(50 + 50 * Math.cos(Math.PI / 6), 50 * Math.sin(Math.PI / 6))], width: 10 }
      const [ring] = pavingRings({ roads: [east, bend], areas: [] })
      expect(has(ring.points, P(50 + 5 * Math.tan(Math.PI / 12), -5))).toBe(true)
      expect(ring.points.filter((q) => Math.hypot(q.x - 50, q.y) < 1)).toEqual([])
    })

    it('past 120°: bevelled between the two outer edges, never past them', () => {
      const back: PavingRoad = { points: [P(50, 0), P(50 + 50 * Math.cos((5 * Math.PI) / 6), 50 * Math.sin((5 * Math.PI) / 6))], width: 10 }
      const [ring] = pavingRings({ roads: [east, back], areas: [] })
      // the tip beyond the node is paved up to the bevel from (50,−5) to (52.5, 4.33)
      expect(pointInPolygon(P(51, 0), ring.points)).toBe(true)
      expect(has(ring.points, P(50, -5))).toBe(true)
      expect(has(ring.points, P(50 + 5 * Math.sin(Math.PI / 6), 5 * Math.cos(Math.PI / 6)))).toBe(true)
      expect(ring.points.every((q) => Math.hypot(q.x - 50, q.y) < 5 + 1e-4 || q.x <= 50 + 1e-4)).toBe(true)
    })

    it('three ends at one point: the two round the open side close it, nothing pokes past another road', () => {
      // east, north and north-west, all ending at the origin: the open side (225°, from the north-west road round to
      // the east one) has the notch; the north road's corner with the east one lies inside the north-west road
      const ends: PavingRoad[] = [
        { points: [P(50, 0), P(0, 0)], width: 8 },
        { points: [P(0, 50), P(0, 0)], width: 8 },
        { points: [P(-35, 35), P(0, 0)], width: 8 },
      ]
      const [ring, ...more] = pavingRings({ roads: ends, areas: [] })
      expect(more).toEqual([])
      // the north-west road's outer edge runs on to the east road's, at their mitre point
      expect(has(ring.points, P(-4 * Math.tan(Math.PI / 8), -4))).toBe(true)
      expect(pointInPolygon(P(-1, -3), ring.points)).toBe(true)
      expect(ring.points.filter((q) => Math.hypot(q.x, q.y) < 1)).toEqual([])
      // never the north and east roads' square corner: it would stand out of the north-west road's edge
      expect(pointInPolygon(P(-3.9, -3.9), ring.points)).toBe(false)
      expect(ring.points.filter((q) => q.y < -4 + 1e-4).map((q) => Math.round(q.x * 1e3) / 1e3).sort((a, b) => a - b)).toEqual([-1.657, 50])
    })

    it('a road passing through the node, not ending there, closes the side it covers: nothing added there', () => {
      // two ends, north and at 170°, on a road straight through west to east: without it, the open side would be the
      // south-east, and the two ends' mitre would stand at (4, −4.77), below the through road's edge
      const through: PavingRoad = { points: [P(-50, 0), P(50, 0)], width: 8 }
      const north: PavingRoad = { points: [P(0, 50), P(0, 0)], width: 8 }
      const west: PavingRoad = { points: [P(50 * Math.cos((17 * Math.PI) / 18), 50 * Math.sin((17 * Math.PI) / 18)), P(0, 0)], width: 8 }
      const [ring, ...more] = pavingRings({ roads: [through, north, west], areas: [] })
      expect(more).toEqual([])
      expect(ring.points.every((q) => q.y >= -4 - 1e-4)).toBe(true)
    })
  })
})
