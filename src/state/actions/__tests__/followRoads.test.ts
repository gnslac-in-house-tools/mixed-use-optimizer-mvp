// A street end on an existing street links to it and follows it (Phase PE.1, task 9; Decision "Street links"):
// an end of a created street dropped on an existing street's end or paving goes onto its drawn line, linked (`StreetNode.road`);
// `followRoads` (in settle) keeps the link: the road gone drops it, the road's node dragged takes the end with it, an end dragged
// away lets go, an end within JOIN of a drawn line is linked.
import { describe, expect, it } from 'vitest'
import type { Point, Project, StreetNode } from '../../../model/schema.ts'
import { JOIN } from '../../../engine/path/ends.ts'
import { settle } from '../../settle.ts'
import { addExistingRoad, removeExistingRoad } from '../circulation.ts'
import { editPath } from '../path.ts'
import { drawStreet, followRoads, moveStreetNode } from '../streets.ts'
import { demoProject } from '../../demo.ts'

const o1 = 'o1'
const nodes = (p: Project): StreetNode[] => p.options.find((o) => o.id === o1)!.streets?.nodes ?? []
const segments = (p: Project) => p.options.find((o) => o.id === o1)!.streets?.segments ?? []
const go = (before: Project, after: Project): Project => {
  const r = settle(before, after)
  if ('refused' in r) throw new Error(r.refused)
  return r.project
}
/** The demo with no streets and one existing street along y = 250, from x = 50 to 650. */
function withRoad(points: Point[] = [{ x: 50, y: 250 }, { x: 650, y: 250 }]) {
  const r = addExistingRoad(demoProject({ streets: false }), points)!
  return { p: r.project, road: r.id }
}
const ref = (road: string) => ({ kind: 'existing-road' as const, id: road })

describe('an end dropped on an existing street', () => {
  it('on its paving goes to the nearest point of its drawn line, linked', () => {
    const { p, road } = withRoad()
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 252 }])!
    const end = nodes(r.project).find((n) => n.id === r.nodes[1])!
    expect(end).toMatchObject({ x: 350, y: 250, road })
    expect(nodes(r.project).find((n) => n.id === r.nodes[0])!.road).toBeUndefined()
  })
  it('on its end goes there, linked', () => {
    const { p, road } = withRoad()
    const r = drawStreet(p, o1, [{ x: 50, y: 100 }, { x: 48, y: 252 }])!
    expect(nodes(r.project).find((n) => n.id === r.nodes[1])).toMatchObject({ x: 50, y: 250, road })
  })
  it('its first point links as well', () => {
    const { p, road } = withRoad()
    const r = drawStreet(p, o1, [{ x: 350, y: 252 }, { x: 350, y: 100 }])!
    expect(nodes(r.project).find((n) => n.id === r.nodes[0])).toMatchObject({ x: 350, y: 250, road })
  })
  it('an inner point of the street is not linked', () => {
    const { p } = withRoad()
    const r = drawStreet(p, o1, [{ x: 300, y: 100 }, { x: 350, y: 252 }, { x: 400, y: 100 }])!
    expect(nodes(r.project).find((n) => n.id === r.nodes[1])!.road).toBeUndefined()
  })
  it('a created street’s node is shared, with no link', () => {
    const { p } = withRoad()
    const a = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 180 }])!
    const b = drawStreet(a.project, o1, [{ x: 350, y: 180 }, { x: 450, y: 180 }])!
    expect(b.nodes[0]).toBe(a.nodes[1])
    expect(nodes(b.project).every((n) => n.road === undefined)).toBe(true)
  })
  it('a street end dragged onto the paving goes onto the line, linked', () => {
    const { p, road } = withRoad()
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 200 }])!
    const q = moveStreetNode(r.project, o1, r.nodes[1], { x: 360, y: 253 })
    const n = nodes(q).find((x) => x.id === r.nodes[1])!
    expect(n.road).toBe(road)
    expect(n.x).toBeCloseTo(360, 6)
    expect(n.y).toBeCloseTo(250, 6)
  })
  it('an existing street’s end dragged onto a street is only snapped: no link, no split', () => {
    const { p } = withRoad()
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 200 }])!
    const q = editPath(r.project, ref(withRoad().road), { op: 'node', i: 1, to: { x: 350, y: 150 } }, o1).project
    expect(nodes(q).every((n) => n.road === undefined)).toBe(true)
    expect(segments(q)).toHaveLength(1)
  })
})

describe('followRoads', () => {
  /** A street from (350, 100) down to a link at (350, 250) on the road. */
  function linked(points?: Point[]) {
    const { p, road } = withRoad(points)
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 250 }])!
    return { p: r.project, road, end: r.nodes[1], far: r.nodes[0] }
  }
  it('(1) the road deleted: the link drops, the node stays', () => {
    const w = linked()
    const q = go(w.p, removeExistingRoad(w.p, w.road))
    const n = nodes(q).find((x) => x.id === w.end)!
    expect(n.road).toBeUndefined()
    expect(n).toMatchObject({ x: 350, y: 250 })
  })
  it('(2) the road’s node dragged: the end goes to the same fraction of the same stretch, its segment stretching', () => {
    const w = linked()
    const after = editPath(w.p, ref(w.road), { op: 'node', i: 1, to: { x: 650, y: 350 } }, o1).project
    const q = go(w.p, after)
    // the stretch (50,250)-(650,350): fraction 0.5 of the first stretch was x = 350
    const n = nodes(q).find((x) => x.id === w.end)!
    expect(n.road).toBe(w.road)
    expect(n.x).toBeCloseTo(350, 6)
    expect(n.y).toBeCloseTo(300, 6)
    expect(nodes(q).find((x) => x.id === w.far)).toMatchObject({ x: 350, y: 100 })
    expect(segments(q)).toHaveLength(1)
  })
  it('(2) a stretch added before it (the point count changed): the nearest point of the line', () => {
    const w = linked()
    const after = editPath(w.p, ref(w.road), { op: 'insert', k: 0, at: { x: 100, y: 250 } }, o1).project
    const q = go(w.p, after)
    const n = nodes(q).find((x) => x.id === w.end)!
    expect(n.road).toBe(w.road)
    expect(n.x).toBeCloseTo(350, 6)
    expect(n.y).toBeCloseTo(250, 6)
  })
  it('(3) an end dragged 2 m off by itself lets go', () => {
    const w = linked()
    const q = go(w.p, moveStreetNode(w.p, o1, w.end, { x: 350, y: 240 }))
    expect(nodes(q).find((x) => x.id === w.end)!.road).toBeUndefined()
  })
  it('(3) 0.3 m off stays linked', () => {
    const w = linked()
    const q = go(w.p, moveStreetNode(w.p, o1, w.end, { x: 350, y: 249.7 }))
    expect(nodes(q).find((x) => x.id === w.end)!.road).toBe(w.road)
  })
  it('(4) an end within JOIN of a drawn line, linked to nothing, is linked', () => {
    const { p, road } = withRoad()
    // a node made by hand a hair off the line, as an old project or a copy has it
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 200 }])!
    const moved = moveStreetNode(r.project, o1, r.nodes[1], { x: 350, y: 250 - JOIN / 2 })
    const bare = { ...moved, options: moved.options.map((o) => (o.id === o1 ? { ...o, streets: { ...o.streets!, nodes: o.streets!.nodes.map(({ road: _r, ...n }) => n) } } : o)) }
    const q = followRoads(r.project, bare)
    expect(nodes(q).find((x) => x.id === r.nodes[1])!.road).toBe(road)
  })
  it('an end far from every line stays unlinked', () => {
    const { p } = withRoad()
    const r = drawStreet(p, o1, [{ x: 350, y: 100 }, { x: 350, y: 200 }])!
    expect(nodes(go(p, r.project)).every((n) => n.road === undefined)).toBe(true)
  })
  it('nothing changed: the same project', () => {
    const w = linked()
    expect(followRoads(w.p, w.p)).toBe(w.p)
  })
  it('an option’s copy: each option’s links follow on their own', () => {
    const w = linked()
    const second = { ...w.p.options.find((o) => o.id === o1)!, id: 'o2' }
    const two = { ...w.p, options: [...w.p.options, second] }
    const after = editPath(two, ref(w.road), { op: 'node', i: 1, to: { x: 650, y: 350 } }, o1).project
    const q = go(two, after)
    for (const id of [o1, 'o2']) {
      const n = q.options.find((o) => o.id === id)!.streets!.nodes.find((x) => x.id === w.end)!
      expect(n.road).toBe(w.road)
      expect(n.y).toBeCloseTo(300, 6)
    }
  })
})
