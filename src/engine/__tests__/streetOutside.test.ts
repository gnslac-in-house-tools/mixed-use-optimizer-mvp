// The Street tool keeps outside buildings on its own (Phase SE.3, Decision "Street side when drawing"): a segment
// whose paving would run over a mass takes the edge that keeps it outside (a centred one too); neither switches when
// both ways run over one. Only the Street tool asks for it (`drawStreet`'s `opts.outside`). Where two segments of
// different sides meet at a node, their pavings meet there with no gap.
import { describe, expect, it } from 'vitest'
import type { Id, Point, Polygon, Project, StreetSegment, StreetSide, StreetType, Streets } from '../../model/schema.ts'
import { deriveMassing } from '../derive.ts'
import { intersection, regionsArea, union } from '../geom/boolean.ts'
import { area, toCounterClockwise } from '../geom/polygon.ts'
import { stripOutlines } from '../path/strip.ts'
import { OUTSIDE_TOL, drawnStreetLines, onTheGround, outsideSide, sideReach, streetFootprints, streetRoads, streetTypesOf } from '../circulation/streets.ts'
import { cornerRadii, rounded } from '../path/round.ts'
import { stretchStrip } from '../path/strip.ts'

/** A segment's paving drawn by a side: its stretch strip. */
const sidedStrip = (a: Point, b: Point, width: number, side: StreetSide) => {
  const { left, right } = sideReach(side, width)
  return stretchStrip(a, b, left, right)
}
import { derive } from '../derive.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'

const P = (x: number, y: number): Point => ({ x, y })
const SQUARE: Polygon = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]
const overArea = (q: Polygon | null, f: Polygon) => (q ? regionsArea(intersection([q], [f])) : 0)

describe('outsideSide', () => {
  // along the square's top edge, walked east → west: its left is the square's inside (south), its right outside
  const a = P(10, 10)
  const b = P(0, 10)
  it('centre chosen, half over the mass: the side that keeps it outside (its drawn line the edge against the mass)', () => {
    expect(outsideSide(a, b, 6, 'centre', [SQUARE])).toBe('left')
    // drawn by its left edge, the paving is to its right: north, outside
    expect(overArea(sidedStrip(a, b, 6, 'left'), SQUARE)).toBeLessThanOrEqual(OUTSIDE_TOL)
  })
  it('walked east → west: chosen right (its paving to its left, south, inside) → left; chosen left (outside) → left', () => {
    expect(outsideSide(a, b, 6, 'right', [SQUARE])).toBe('left')
    expect(outsideSide(a, b, 6, 'left', [SQUARE])).toBe('left')
  })
  it('walked west → east: chosen left (paving to its right, inside) → right; chosen right (outside) → right', () => {
    expect(outsideSide(b, a, 6, 'left', [SQUARE])).toBe('right')
    expect(outsideSide(b, a, 6, 'right', [SQUARE])).toBe('right')
    expect(outsideSide(b, a, 6, 'centre', [SQUARE])).toBe('right')
  })
  it('between two masses, both sides over one: the side chosen', () => {
    const north: Polygon = [P(0, 12), P(10, 12), P(10, 20), P(0, 20)]
    for (const side of ['left', 'centre', 'right'] as const) expect(outsideSide(b, a, 6, side, [SQUARE, north])).toBe(side)
  })
  it('an overlap within the tolerance is a touch: the side stays', () => {
    // a centred 6 m street 3.004 m above the top edge: 0.04 m² over it, under OUTSIDE_TOL
    const y = 10 + 3 - 0.004
    expect(overArea(sidedStrip(P(0, y), P(10, y), 6, 'centre'), SQUARE)).toBeLessThan(OUTSIDE_TOL)
    expect(outsideSide(P(0, y), P(10, y), 6, 'centre', [SQUARE])).toBe('centre')
    expect(outsideSide(P(0, 10.5), P(10, 10.5), 6, 'centre', [SQUARE])).toBe('right')
  })
  it('no footprints, or a segment of no length: the side chosen', () => {
    expect(outsideSide(a, b, 6, 'centre', [])).toBe('centre')
    expect(outsideSide(a, a, 6, 'centre', [SQUARE])).toBe('centre')
  })
})

describe('drawStreet with opts.outside', () => {
  const o1 = 'o1'
  const p0 = demoProject({ streets: false })
  const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
  const types = streetTypesOf(p0, p0.options[0])
  const width = types[0].width
  const handOf = (g: StreetSegment): 'left' | 'centre' | 'right' => (g.left === 0 ? 'left' : g.right === 0 ? 'right' : 'centre')
  // a mass of the demo with nothing else built within two street widths of it: the street round it runs over no other
  const masses = Object.values(deriveMassing(p0).masses)
  const footprints = streetFootprints(masses, p0.options[0].buildingIds)
  const box = (f: Polygon) => {
    const xs = f.map((q) => q.x)
    const ys = f.map((q) => q.y)
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
  }
  const lone = footprints.find((f) => {
    const b = box(f)
    const rect = Math.abs(Math.abs(area(f)) - (b.maxX - b.minX) * (b.maxY - b.minY)) < 1e-6
    const m = 2 * width
    const around: Polygon = [P(b.minX - m, b.minY - m), P(b.maxX + m, b.minY - m), P(b.maxX + m, b.maxY + m), P(b.minX - m, b.maxY + m)]
    return rect && footprints.every((g) => g === f || overArea(around, g) === 0)
  })!
  const b = box(lone)
  // its four edges in one go, anticlockwise: the mass on the left walking it
  const ring = [P(b.minX, b.minY), P(b.maxX, b.minY), P(b.maxX, b.maxY), P(b.minX, b.maxY), P(b.minX, b.minY)]
  const loneId = masses.find((m) => onTheGround(m) && m.polygon === lone)!.id
  // and the other way round, clockwise: the mass on the right
  const back = [...ring].reverse()
  /** The street-over-a-mass issues the derived project raises on the lone mass. */
  const overIssues = (p: Project) => derive(p, o1).issues.filter((i) => i.code === 'road' && i.massIds.includes(loneId))
  const at = (s: Streets, id: Id) => s.nodes.find((n) => n.id === id)!
  const paving = (s: Streets, g: StreetSegment) => stretchStrip(at(s, g.a), at(s, g.b), g.left, g.right)

  it('round a mass’s four edges, centre chosen: every segment’s paving is outside the mass', () => {
    expect(lone).toBeDefined()
    const r = drawStreet(p0, o1, ring, undefined, undefined, undefined, { side: 'centre', outside: true })!
    const s = streets(r.project)
    expect(s.segments).toHaveLength(4)
    // walked anticlockwise, the mass is on the left: each segment's drawn line is its left edge, its paving outside
    expect(s.segments.map(handOf)).toEqual(['left', 'left', 'left', 'left'])
    for (const g of s.segments) expect(overArea(paving(s, g), lone)).toBeLessThanOrEqual(OUTSIDE_TOL)
  })
  it('round a mass with the default trucks type, any side chosen, either way round: the derived street is clear of it', () => {
    // trucks: 15 m turning radius, wider than half the street; the corners hugging the mass keep the drawn edge sharp
    expect(types[0]).toMatchObject({ id: 'trucks', radius: 15 })
    expect(overIssues(p0)).toEqual([])
    for (const pts of [ring, back])
      for (const side of ['left', 'centre', 'right'] as const) {
        const r = drawStreet(p0, o1, pts, undefined, undefined, undefined, { side, outside: true })!
        expect(streets(r.project).segments).toHaveLength(4)
        expect(overIssues(r.project)).toEqual([])
      }
  })
  it('the preview is the street made: its centre lines as the derived project has them', () => {
    const r = drawStreet(p0, o1, ring, undefined, undefined, undefined, { side: 'centre', outside: true })!
    const road = derive(r.project, o1).circulation.roads.find((x) => x.kind === 'street')!
    expect(drawnStreetLines(ring, width, types[0].radius, 'centre', footprints)).toEqual([road.points])
  })
  it('without outside the sides are stored as given (over the mass or not)', () => {
    const r = drawStreet(p0, o1, ring, undefined, undefined, undefined, { side: 'centre' })!
    expect(streets(r.project).segments.every((g) => handOf(g) === 'centre')).toBe(true)
    const l = drawStreet(p0, o1, ring, undefined, undefined, undefined, { side: 'right' })!
    expect(streets(l.project).segments.map(handOf)).toEqual(['right', 'right', 'right', 'right'])
  })
  it('a segment away from every mass keeps the side chosen; only the one along it switches', () => {
    // up the mass's west edge, then off west, away from it: the first switches, the second stays centred
    const pts = [P(b.minX, b.minY), P(b.minX, b.maxY), P(b.minX - 3 * width, b.maxY)]
    const r = drawStreet(p0, o1, pts, undefined, undefined, undefined, { outside: true })!
    // walking north up the west edge, the mass is on the right: drawn by its right edge, paving to the west
    expect(streets(r.project).segments.map(handOf)).toEqual(['right', 'centre'])
  })
})

describe('two segments of different sides meet at their node', () => {
  const TYPES: StreetType[] = [{ id: 'trucks', name: 'Trucks', width: 10, radius: 0, vehicles: 'trucks' }]
  const net = (pts: Point[], sides: ('left' | 'right' | undefined)[]): Streets => ({
    nodes: pts.map((q, i) => ({ id: `n${i}`, ...q })),
    segments: sides.map((side, i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}`, type: 'trucks', ...sideReach(side ?? 'centre', 10) })),
  })
  const pavings = (s: Streets) => streetRoads(s, TYPES).map((r) => stripOutlines(r.points, r.width).map(toCounterClockwise))
  /** The union of the two streets' pavings: one region with no hole, and the two overlap (not a touch at a point). */
  const joined = (s: Streets) => {
    const [p1, p2] = pavings(s)
    const u = union([...p1, ...p2], [])
    expect(u).toHaveLength(1)
    expect(u[0]).toHaveLength(1)
    return regionsArea(intersection(p1, p2))
  }

  it('a turn from a sided segment to a centred one: their centre lines’ ends meet', () => {
    // east along y 0 by its right edge (paving north), then north, centred
    const s = net([P(0, 0), P(50, 0), P(50, 50)], ['right', undefined])
    const [r1, r2] = streetRoads(s, TYPES)
    expect(r1.points[r1.points.length - 1]).toEqual(r2.points[0])
    expect(joined(s)).toBeGreaterThan(0)
  })
  it('a turn from a centred segment to a sided one, and between two sides', () => {
    for (const sides of [[undefined, 'left'], ['left', 'right'], ['right', 'left']] as const) {
      const s = net([P(0, 0), P(50, 0), P(50, 50)], [...sides])
      const [r1, r2] = streetRoads(s, TYPES)
      const e1 = r1.points[r1.points.length - 1]
      expect(Math.hypot(e1.x - r2.points[0].x, e1.y - r2.points[0].y)).toBeLessThan(1e-9)
      expect(joined(s)).toBeGreaterThan(0)
    }
  })
  it('straight on, switching from one edge to the other: each runs on half its width past the node, one region', () => {
    const s = net([P(0, 0), P(50, 0), P(100, 0)], ['left', 'right'])
    const [r1, r2] = streetRoads(s, TYPES)
    // drawn by its left edge the first is south of the line, the second north: they share the line for 10 m
    expect(r1.points).toEqual([P(0, -5), P(55, -5)])
    expect(r2.points).toEqual([P(45, 5), P(100, 5)])
    expect(union(pavings(s).flat(), [])).toHaveLength(1)
  })
  it('straight on from centred to an edge: overlapping pavings', () => {
    expect(joined(net([P(0, 0), P(50, 0), P(100, 0)], [undefined, 'right']))).toBeGreaterThan(0)
  })
  // the final review of Phase SE: the centre lines' crossing was taken up to ten widths off, and ends of one side ran
  // on half a width in line
  const dir = (deg: number) => P(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180))
  const ahead = (q: Point, u: Point, k: number) => P(q.x + u.x * k, q.y + u.y * k)
  /** Each road's centre line ends where its drawn line does, shifted by its side: nothing carried past its nodes. */
  const square = (s: Streets) => {
    for (const r of streetRoads(s, TYPES.map((t) => ({ ...t })))) {
      const d = (r.left! - r.right!) / 2
      const [a, b] = [r.nodePoints![0], r.nodePoints![1]]
      const [c, e] = [r.nodePoints![r.nodePoints!.length - 2], r.nodePoints![r.nodePoints!.length - 1]]
      const at = (q: Point, p: Point, o: Point) => {
        const l = Math.hypot(o.x - p.x, o.y - p.y)
        return P(q.x - ((o.y - p.y) / l) * d, q.y + ((o.x - p.x) / l) * d)
      }
      const [first, last] = [r.points[0], r.points[r.points.length - 1]]
      expect(Math.hypot(first.x - at(a, a, b).x, first.y - at(a, a, b).y), r.id).toBeLessThan(1e-6)
      expect(Math.hypot(last.x - at(e, c, e).x, last.y - at(e, c, e).y), r.id).toBeLessThan(1e-6)
    }
  }
  it('a widened segment of a street drawn by its edge, in line: each paving spans its own nodes only (flush)', () => {
    const s = net([P(0, 0), P(30, 0), P(60, 0), P(90, 0)], ['left', 'left', 'left'])
    s.segments[1] = { ...s.segments[1], left: 0, right: 14 }
    expect(streetRoads(s, TYPES).map((r) => r.points)).toEqual([
      [P(0, -5), P(30, -5)],
      [P(30, -7), P(60, -7)],
      [P(60, -5), P(90, -5)],
    ])
  })
  it('a widened segment with 2° bends: the same, no end carried along to where the centre lines cross', () => {
    const q1 = P(80, 0)
    const q2 = ahead(q1, dir(2), 80)
    const s = net([P(0, 0), q1, q2, ahead(q2, dir(0), 80)], ['left', 'left', 'left'])
    s.segments[1] = { ...s.segments[1], left: 0, right: 14 }
    square(s)
  })
  it('centred, then along a mass by its edge at a gentle bend: the centred end stays, off the mass; the pavings overlap', () => {
    for (const deg of [10, 30, 60]) {
      const u = dir(deg)
      const v = dir(deg + 90)
      const N = P(50, 0)
      // the mass on the second segment’s left, 6 m on from the node (clear of the first): the side the Street tool keeps it off
      const c = ahead(N, u, 6)
      const mass: Polygon = [c, ahead(c, u, 80), ahead(ahead(c, u, 80), v, 30), ahead(c, v, 30)]
      const s = net([P(0, 0), N, ahead(N, u, 100)], [undefined, 'left'])
      const [r1, r2] = streetRoads(s, TYPES)
      expect(r1.points[r1.points.length - 1], `${deg}°`).toEqual(N)
      const over = [r1, r2].map((r) => regionsArea(intersection(stripOutlines(r.points, r.width).map(toCounterClockwise), [mass])))
      expect(over.every((a) => a <= OUTSIDE_TOL), `${deg}°: ${over}`).toBe(true)
      expect(joined(s), `${deg}°`).toBeGreaterThan(0)
    }
  })
  it('a network without sides is left as it was: two types meeting at a node keep their ends on it', () => {
    const s: Streets = { ...net([P(0, 0), P(50, 0), P(50, 50)], [undefined, undefined]) }
    s.segments[1] = { ...s.segments[1], type: 'cars' }
    const roads = streetRoads(s, [...TYPES, { id: 'cars', name: 'Cars', width: 6, radius: 0, vehicles: 'cars' }])
    expect(roads.map((r) => r.points)).toEqual([
      [P(0, 0), P(50, 0)],
      [P(50, 0), P(50, 50)],
    ])
  })
})

describe('drawnStreetLines (the Street tool’s preview)', () => {
  it('each segment by its side, switched as outsideSide says; centre lines as streetRoads derives them', () => {
    // along the square's top edge west → east, centred: it switches to its right edge; then north, away, centred
    const lines = drawnStreetLines([P(0, 10), P(10, 10), P(10, 30)], 6, 0, 'centre', [SQUARE])
    expect(lines).toHaveLength(2)
    expect(lines[0][0]).toEqual(P(0, 13))
    expect(lines[1][lines[1].length - 1]).toEqual(P(10, 30))
    // without footprints, the side chosen throughout: one line
    expect(drawnStreetLines([P(0, 10), P(10, 10), P(10, 30)], 6, 0, 'centre', [])).toEqual([[P(0, 10), P(10, 10), P(10, 30)]])
  })
})

describe('a corner hugging the drawn edge keeps it sharp', () => {
  // east then north (a left turn), then east again (a right turn); 12 m wide, 15 m radius
  const drawn = [P(0, 0), P(100, 0), P(100, 100), P(200, 100)]
  it('cornerRadii: half the width where the drawn edge is the turn’s inside, the type’s elsewhere; centred, the type’s', () => {
    expect(cornerRadii(drawn, 0, 12, 15)).toEqual([15, 6, 15, 15])
    expect(cornerRadii(drawn, 12, 0, 15)).toEqual([15, 15, 6, 15])
    expect(cornerRadii(drawn, 6, 6, 15)).toBe(15)
    // a type that keeps its corners sharp keeps them sharp
    expect(cornerRadii(drawn, 0, 12, 0)).toBe(0)
  })
  it('the hugging corner’s centre line is an arc of half the width about the drawn corner', () => {
    const TYPES: StreetType[] = [{ id: 'trucks', name: 'Trucks', width: 12, radius: 15, vehicles: 'trucks' }]
    const s: Streets = {
      nodes: drawn.map((q, i) => ({ id: `n${i}`, ...q })),
      segments: drawn.slice(1).map((_, i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}`, type: 'trucks', ...sideReach('left', 12) })),
    }
    const [r] = streetRoads(s, TYPES)
    // the arc's points between the two straight runs: each 6 m from (100, 0)
    const arc = r.points.filter((q) => q.x > 100 && q.x < 106 && q.y > -6 && q.y < 0)
    expect(arc.length).toBeGreaterThan(0)
    for (const q of arc) expect(Math.hypot(q.x - 100, q.y)).toBeCloseTo(6, 9)
    // the right turn, its drawn edge outside: the type's 15 m as before, about (121, 79) (its centre line's corner is
    // at (106, 94))
    const outer = r.points.filter((q) => q.x > 106 && q.x < 121 && q.y > 79 && q.y < 94)
    expect(outer.length).toBeGreaterThan(0)
    for (const q of outer) expect(Math.hypot(q.x - 121, q.y - 79)).toBeCloseTo(15, 9)
  })
  it('rounded takes each corner’s own radius', () => {
    const L = [P(0, 0), P(50, 0), P(50, 50), P(100, 50)]
    expect(rounded(L, [0, 0, 10, 0]).slice(0, 2)).toEqual([P(0, 0), P(50, 0)])
    expect(rounded(L, [0, 0, 0, 0])).toBe(L)
  })
})
