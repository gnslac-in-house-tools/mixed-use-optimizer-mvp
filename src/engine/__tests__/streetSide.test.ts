// The drawing side (Phase SE.2, Decision "Drawing side"): a street segment keeps the paving each side of its drawn line (`left`
// and `right`, project 19; a street drawn by its edge has 0 on that side). `streetRoads` alone turns the drawn line into the centre line, so every
// consumer keeps reading `points` as a centre line; an old project derives exactly what it derived before.
import { describe, expect, it } from 'vitest'
import { NOTHING_PICKED } from '../../model/picked.ts'
import type { Id, Point, Project, StreetSegment, StreetType, Streets } from '../../model/schema.ts'
import { Draft } from '../circulation/draft.ts'
import { streetRoads, streetTypesOf } from '../circulation/streets.ts'
import { offsetLine } from '../path/offset.ts'
import { rounded } from '../path/round.ts'
import { copyPicked } from '../../state/actions/selection.ts'
import { drawStreet, removeStreetNode, setStreetEdges, setStreetSegmentWidth, mirrorStreetNodes } from '../../state/actions/streets.ts'
import { demoProject } from '../../state/demo.ts'
import { sampleProject } from '../../state/sample.ts'

/** The sides of a 10 m street (the types' default trucks is 8: these fixtures state their own): none for centred. */
const TYPES: StreetType[] = [{ id: 'trucks', name: 'Trucks', width: 10, radius: 15, vehicles: 'trucks' }]
const by = (side?: 'left' | 'right'): { left: number; right: number } => (side === 'left' ? { left: 0, right: 10 } : side === 'right' ? { left: 10, right: 0 } : { left: 5, right: 5 })
const net = (nodes: [Id, number, number][], segments: (Pick<StreetSegment, 'id' | 'a' | 'b'> & { side?: 'left' | 'right' })[]): Streets => ({
  nodes: nodes.map(([id, x, y]) => ({ id, x, y })),
  segments: segments.map(({ side, ...g }) => ({ type: 'trucks', ...by(side), ...g })),
})
const hand = (r: { left?: number; right?: number }): 'left' | 'centre' | 'right' => (r.left === 0 ? 'left' : r.right === 0 ? 'right' : 'centre')
const close = (ps: Point[], qs: Point[]) => {
  expect(ps).toHaveLength(qs.length)
  ps.forEach((q, i) => {
    expect(q.x).toBeCloseTo(qs[i].x, 9)
    expect(q.y).toBeCloseTo(qs[i].y, 9)
  })
}

describe('offsetLine', () => {
  const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
  it('shifts a polyline to its left by d (to its right by −d), its inner corner mitred', () => {
    close(offsetLine(L, 1), [{ x: 0, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 10 }])
    close(offsetLine(L, -1), [{ x: 0, y: -1 }, { x: 11, y: -1 }, { x: 11, y: 10 }])
  })
  it('a point between two segments in line keeps the shifted point; by 0 the line itself', () => {
    close(offsetLine([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 2), [{ x: 0, y: 2 }, { x: 5, y: 2 }, { x: 10, y: 2 }])
    expect(offsetLine(L, 0)).toBe(L)
  })
})

describe('streetRoads honours the sides', () => {
  const straight = (side?: 'left' | 'right') => net([['n1', 0, 0], ['n2', 100, 0]], [{ id: 's1', a: 'n1', b: 'n2', side }])

  it('a segment drawn by its left edge, 10 m wide: its centre line 5 m to its right; the handles stay on the drawn line', () => {
    const [r] = streetRoads(straight('left'), TYPES)
    close(r.points, [{ x: 0, y: -5 }, { x: 100, y: -5 }])
    expect(r.nodePoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect([r.left, r.right, r.width]).toEqual([0, 10, 10])
    const [q] = streetRoads(straight('right'), TYPES)
    close(q.points, [{ x: 0, y: 5 }, { x: 100, y: 5 }])
    expect([q.left, q.right]).toEqual([10, 0])
    expect(hand(streetRoads(straight(), TYPES)[0])).toBe('centre')
  })

  it('sides of its own: 2 + 6 m, the centre line 2 m to the left of the drawn one', () => {
    const s: Streets = { nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 100, y: 0 }], segments: [{ id: 's1', a: 'n1', b: 'n2', type: 'trucks', left: 2, right: 6 }] }
    const [r] = streetRoads(s, TYPES)
    close(r.points, [{ x: 0, y: -2 }, { x: 100, y: -2 }])
    expect([r.left, r.right, r.width]).toEqual([2, 6, 8])
  })

  it('an L drawn by its left edge: the centre line is the drawn line offset, then rounded (SE.3: its corner turning to the drawn edge by half the width, the edge kept sharp)', () => {
    const s = net([['n1', 0, 0], ['n2', 100, 0], ['n3', 100, 100]], [{ id: 's1', a: 'n1', b: 'n2', side: 'left' }, { id: 's2', a: 'n2', b: 'n3', side: 'left' }])
    const [r] = streetRoads(s, TYPES)
    expect(r.segments).toEqual(['s1', 's2'])
    expect(r.points).toEqual(rounded(offsetLine(r.nodePoints!, -5), [15, 5, 15]))
    close([r.points[0], r.points.at(-1)!], [{ x: 0, y: -5 }, { x: 105, y: 100 }])
  })

  // Review Focus 1: old projects unchanged
  it('a network of centred streets derives exactly today’s points (the sample’s and the demo’s)', () => {
    for (const p of [sampleProject(), demoProject()]) {
      for (const o of p.options) {
        const roads = streetRoads(o.streets, streetTypesOf(p, o))
        for (const r of roads) {
          expect(r.left).toBe(r.right)
          expect(r.points).toEqual(rounded(r.nodePoints!, r.radius!))
        }
      }
    }
    expect(sampleProject().options.some((o) => (o.streets?.segments.length ?? 0) > 0)).toBe(true)
  })

  // Review Focus 2: a segment walked backwards in a run
  it('a segment stored b → a with its right at 0 reads as left along the run, and joins a neighbour stored a → b by the same hand', () => {
    const s = net([['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]], [{ id: 's1', a: 'n1', b: 'n2', side: 'right' }, { id: 's2', a: 'n3', b: 'n2', side: 'left' }])
    const roads = streetRoads(s, TYPES)
    expect(roads).toHaveLength(1)
    expect(roads[0].segments).toEqual(['s1', 's2'])
    expect([roads[0].left, roads[0].right]).toEqual([10, 0])
    close(roads[0].points, [{ x: 0, y: 5 }, { x: 50, y: 5 }, { x: 100, y: 5 }])
  })

  it('two segments with different sides make two streets', () => {
    const s = net([['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]], [{ id: 's1', a: 'n1', b: 'n2', side: 'right' }, { id: 's2', a: 'n2', b: 'n3' }])
    const roads = streetRoads(s, TYPES)
    expect(roads.map(hand).sort()).toEqual(['centre', 'right'])
  })

  it('a street of 4 + 4, 0 + 8 and 6 + 2 stretches in a row: three streets, each with its own sides', () => {
    const s: Streets = {
      nodes: [0, 1, 2, 3].map((i) => ({ id: `n${i}`, x: i * 50, y: 0 })),
      segments: [[4, 4], [0, 8], [6, 2]].map(([left, right], i) => ({ id: `s${i}`, a: `n${i}`, b: `n${i + 1}`, type: 'trucks', left, right })),
    }
    expect(streetRoads(s, TYPES).map((r) => [r.left, r.right])).toEqual([[4, 4], [0, 8], [6, 2]])
  })
})

describe('Draft.onPaving reads the sides', () => {
  // a 10 m street along y 0 drawn by its left edge: its paving is y −10…0, none above the line
  const p = demoProject({ streets: false })
  const d = () => new Draft(p, net([['n1', 0, 0], ['n2', 100, 0]], [{ id: 's1', a: 'n1', b: 'n2', side: 'left' }]))
  it('an end inside the sided paving joins it; one beside the drawn line on the other side does not', () => {
    const a = d()
    const n = a.onPaving({ x: 50, y: -8 })
    expect(n).not.toBeNull()
    expect(a.at(n!)).toEqual({ x: 50, y: 0 })
    expect(d().onPaving({ x: 50, y: 3 })).toBeNull()
  })
})

describe('the sides’ verbs', () => {
  const o1 = 'o1'
  const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
  const base = () => drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])!
  const sides = (p: Project) => streets(p).segments.map((g) => [g.left, g.right])
  const typeWidth = streetTypesOf(base().project, base().project.options[0])[0].width

  it('drawStreet clamps a width under 0.5 m to 0.5 m (PE.1 review)', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }], undefined, 0.2)!
    const g = r.project.options[0].streets!.segments[0]
    expect(g.left + g.right).toBeCloseTo(0.5, 9)
  })

  it('drawStreet’s opts.side: every segment it makes, its paving left of the line for a right edge, as wide as the type', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], undefined, undefined, undefined, { side: 'left' })!
    expect(sides(r.project)).toEqual([[0, typeWidth], [0, typeWidth]])
    const c = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }], undefined, undefined, undefined, { side: 'centre' })!
    expect(sides(c.project)).toEqual([[typeWidth / 2, typeWidth / 2]])
  })

  it('drawStreet by the right edge with a width of 10: 10 + 0; centred: 5 + 5', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }], undefined, 10, undefined, { side: 'right' })!
    expect(sides(r.project)).toEqual([[10, 0]])
    const l = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }], undefined, 10, undefined, { side: 'left' })!
    expect(sides(l.project)).toEqual([[0, 10]])
  })

  it('mirrorStreetNodes swaps the sides of a segment mirrored whole', () => {
    const r = drawStreet(demoProject({ streets: false }), o1, [{ x: 0, y: 0 }, { x: 50, y: 0 }], undefined, 10, undefined, { side: 'left' })!
    const q = mirrorStreetNodes(r.project, o1, r.nodes, { x: 0, y: 0 }, { x: 1, y: 0 })
    expect(sides(q)).toEqual([[10, 0]])
  })

  it('setStreetEdges stores each segment’s left and right', () => {
    const b = base()
    const [s1, s2] = b.segments
    let p = setStreetEdges(b.project, o1, { [s1]: { left: 0, right: 8 }, [s2]: { left: 8, right: 0 } })
    expect(sides(p)).toEqual([[0, 8], [8, 0]])
    p = setStreetEdges(p, o1, { [s1]: { left: 3, right: 5 } })
    expect(sides(p)).toEqual([[3, 5], [8, 0]])
    expect(setStreetEdges(p, o1, { nope: { left: 1, right: 1 } })).toBe(p)
    expect(setStreetEdges(p, o1, { [s2]: { left: 8, right: 0 } })).toBe(p)
    expect(setStreetEdges(p, o1, { [s2]: { left: 0.1, right: 0.1 } })).toBe(p)
  })

  it('setStreetSegmentWidth keeps the shares: 12 on 0 + 8 is 0 + 12, on 4 + 4 is 6 + 6; null, the type’s width with them', () => {
    const b = base()
    const [s1, s2] = b.segments
    const edge = setStreetEdges(b.project, o1, { [s1]: { left: 0, right: 8 } })
    let p = setStreetSegmentWidth(edge, o1, [s1, s2], 12)
    expect(sides(p)).toEqual([[0, 12], [6, 6]])
    p = setStreetSegmentWidth(p, o1, [s1, s2], null)
    expect(sides(p)).toEqual([[0, typeWidth], [typeWidth / 2, typeWidth / 2]])
    expect(setStreetSegmentWidth(p, o1, [s1], 0.2)).toBe(p)
    expect(setStreetSegmentWidth(p, o1, [s1], null)).toBe(p)
  })

  it('a node removed between two segments of the same sides along the street: one segment, the sides read to its a → b', () => {
    // s2 stored backwards (n3 → n2) with its left at 0: its right along the street is 0, as s1
    const s = net([['n1', 0, 0], ['n2', 50, 0], ['n3', 100, 0]], [{ id: 's1', a: 'n1', b: 'n2', side: 'right' }, { id: 's2', a: 'n3', b: 'n2', side: 'left' }])
    const p0 = demoProject({ streets: false })
    const p = { ...p0, options: p0.options.map((o) => (o.id === o1 ? { ...o, streets: s } : o)) }
    const q = removeStreetNode(p, o1, 'n2')
    const [g] = streets(q).segments
    expect(streets(q).segments).toHaveLength(1)
    expect(hand(streetRoads(streets(q), TYPES)[0])).toBe('right')
    expect([g.left, g.right]).toEqual(g.a === 'n1' ? [10, 0] : [0, 10])
    // different sides along the street: the segments that meet there go
    const r = { ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { ...s, segments: [s.segments[0], { ...s.segments[1], left: 10, right: 0 }] } } : o)) }
    expect(streets(removeStreetNode(r, o1, 'n2')).segments).toHaveLength(0)
  })

  it('copyPicked keeps each segment’s sides', () => {
    const b = base()
    const [s1, s2] = b.segments
    const p = setStreetEdges(b.project, o1, { [s1]: { left: 0, right: 8 }, [s2]: { left: 8, right: 0 } })
    const r = copyPicked(p, o1, { ...NOTHING_PICKED, nodes: b.nodes }, { x: 0, y: 100 })
    const copies = streets(r.project).segments.filter((g) => !b.segments.includes(g.id))
    expect(copies.map((g) => [g.left, g.right])).toEqual([[0, 8], [8, 0]])
  })
})
