// Connected streets stay connected (Phase SE.1, Decision "Streets stay connected"): a street dragged by its body takes
// the streets that share its nodes along; a street end drawn or dragged onto another street's paving joins it there (a
// T), ends only, never the points in between.
import { describe, expect, it } from 'vitest'
import type { Id, Project, Streets } from '../../model/schema.ts'
import { streetRoads, streetTypesOf } from '../../engine/circulation/streets.ts'
import { drawStreet, moveStreetNode, moveStreetNodes } from '../actions/streets.ts'
import { demoProject } from '../demo.ts'

const o1 = 'o1'
const bare = () => demoProject({ streets: false })
const streets = (p: Project): Streets => p.options.find((o) => o.id === o1)!.streets ?? { nodes: [], segments: [] }
const drawn = (p: Project, points: { x: number; y: number }[]) => drawStreet(p, o1, points)!.project
const runs = (p: Project) => streetRoads(streets(p), streetTypesOf(p, p.options.find((o) => o.id === o1)))
const nodeAt = (p: Project, x: number, y: number) => streets(p).nodes.find((n) => Math.hypot(n.x - x, n.y - y) < 1e-6)
const degree = (p: Project, id: Id) => streets(p).segments.filter((g) => g.a === id || g.b === id).length
/** The node ids of the segments that meet at the node at (x, y). */
const around = (p: Project, x: number, y: number) => {
  const n = nodeAt(p, x, y)!
  return streets(p).segments.filter((g) => g.a === n.id || g.b === n.id)
}

describe('a street dragged by its body', () => {
  it('(a) takes the streets that share its inner nodes along: they stay joined and stretch', () => {
    // a three-segment street, two others leaving its inner nodes
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }, { x: 120, y: 0 }])
    p = drawn(p, [{ x: 40, y: 0 }, { x: 40, y: 60 }])
    p = drawn(p, [{ x: 80, y: 0 }, { x: 80, y: -60 }])
    const inner = [nodeAt(p, 40, 0)!.id, nodeAt(p, 80, 0)!.id]
    const main = streets(p).nodes.filter((n) => n.y === 0).map((n) => n.id)
    expect(main).toHaveLength(4)
    for (const ids of [main, ...runs(p).filter((r) => r.nodes!.some((n) => main.includes(n)) && r.nodes!.every((n) => main.includes(n))).map((r) => r.nodes!)]) {
      const q = moveStreetNodes(p, o1, ids, { x: 0, y: 10 })
      for (const id of inner.filter((n) => ids.includes(n))) {
        expect(degree(q, id)).toBe(3)
        expect(streets(q).nodes.find((n) => n.id === id)).toMatchObject({ y: 10 })
      }
      // the far ends of the others stay where they were: they stretch
      expect(nodeAt(q, 40, 60)).toBeDefined()
      expect(nodeAt(q, 80, -60)).toBeDefined()
      expect(streets(q).segments).toHaveLength(5)
    }
  })

  it('(b) a middle segment of its own width dragged: its neighbours stretch and stay joined', () => {
    let p = drawn(bare(), [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }, { x: 120, y: 0 }])
    const mid = streets(p).segments.find((g) => g.a === nodeAt(p, 40, 0)!.id && g.b === nodeAt(p, 80, 0)!.id)!
    p = { ...p, options: p.options.map((o) => (o.id === o1 ? { ...o, streets: { ...streets(p), segments: streets(p).segments.map((g) => (g.id === mid.id ? { ...g, left: 6, right: 6 } : g)) } } : o)) }
    expect(runs(p)).toHaveLength(3)
    const middle = runs(p).find((r) => r.segments!.includes(mid.id))!
    const q = moveStreetNodes(p, o1, middle.nodes!, { x: 0, y: 10 })
    const s = streets(q)
    expect(s.segments).toHaveLength(3)
    expect(s.nodes).toHaveLength(4)
    expect(nodeAt(q, 0, 0)).toBeDefined()
    expect(nodeAt(q, 120, 0)).toBeDefined()
    expect(degree(q, nodeAt(q, 40, 10)!.id)).toBe(2)
    expect(degree(q, nodeAt(q, 80, 10)!.id)).toBe(2)
  })
})

describe('a street end on another’s paving', () => {
  // a trucks street: 8 m wide, its paving 4 m each side of the drawn line
  const base = () => drawn(bare(), [{ x: 0, y: 0 }, { x: 100, y: 0 }])

  it('(c) drawn there, joins it: a T on its drawn line', () => {
    const r = drawStreet(base(), o1, [{ x: 50, y: 50 }, { x: 50, y: 2 }])!
    const t = nodeAt(r.project, 50, 0)
    expect(t).toBeDefined()
    expect(degree(r.project, t!.id)).toBe(3)
    expect(r.nodes[r.nodes.length - 1]).toBe(t!.id)
    expect(nodeAt(r.project, 50, 2)).toBeUndefined()
    // the first point too
    const f = drawStreet(base(), o1, [{ x: 30, y: -3.5 }, { x: 30, y: -40 }])!
    expect(degree(f.project, nodeAt(f.project, 30, 0)!.id)).toBe(3)
  })

  it('drawn just past its paving, stays apart', () => {
    const r = drawStreet(base(), o1, [{ x: 50, y: 50 }, { x: 50, y: 4.5 }])!
    expect(streets(r.project).segments).toHaveLength(2)
    expect(nodeAt(r.project, 50, 4.5)).toBeDefined()
  })

  it('near another’s end, joins that end (no segment of no length)', () => {
    const r = drawStreet(base(), o1, [{ x: 100, y: 50 }, { x: 100, y: 3 }])!
    const end = nodeAt(r.project, 100, 0)!
    expect(degree(r.project, end.id)).toBe(2)
    expect(streets(r.project).segments).toHaveLength(2)
  })

  it('on a node or the drawn line itself, joins as before', () => {
    const r = drawStreet(base(), o1, [{ x: 50, y: 50 }, { x: 50, y: 0.01 }])!
    expect(around(r.project, 50, 0)).toHaveLength(3)
  })

  it('only the ends join: a street drawn parallel inside its paving, its ends clear of it, splits nothing', () => {
    const r = drawStreet(base(), o1, [{ x: 10, y: 30 }, { x: 10, y: 2 }, { x: 90, y: 2 }, { x: 90, y: 30 }])!
    const s = streets(r.project)
    const first = s.segments.filter((g) => [g.a, g.b].some((n) => s.nodes.find((x) => x.id === n)!.y === 0))
    expect(first).toHaveLength(1)
    expect(s.nodes.filter((n) => n.y === 0)).toHaveLength(2)
    expect(s.segments).toHaveLength(4)
  })

  it('dragged there by its end node, joins it', () => {
    const p = drawn(base(), [{ x: 50, y: 50 }, { x: 50, y: 20 }])
    const q = moveStreetNode(p, o1, nodeAt(p, 50, 20)!.id, { x: 50, y: 2 })
    expect(around(q, 50, 0)).toHaveLength(3)
    expect(nodeAt(q, 50, 2)).toBeUndefined()
  })

  it('dragged there by its body, joins it; a street already touching joins when next dragged', () => {
    const p = drawn(base(), [{ x: 50, y: 50 }, { x: 50, y: 20 }])
    const r = runs(p).find((x) => x.nodes!.includes(nodeAt(p, 50, 20)!.id))!
    const q = moveStreetNodes(p, o1, r.nodes!, { x: 0, y: -18 })
    expect(around(q, 50, 0)).toHaveLength(3)
    expect(nodeAt(q, 50, 32)).toBeDefined()
  })

  it('never joins the run it ends nor the segments moved with it: an end dragged onto its own paving stays an end', () => {
    // an L, its end dragged back beside its own first leg
    const p = drawn(bare(), [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }])
    const q = moveStreetNode(p, o1, nodeAt(p, 60, 40)!.id, { x: 20, y: 3 })
    expect(streets(q).segments).toHaveLength(2)
    expect(nodeAt(q, 20, 3)).toBeDefined()
  })

  it('a node with two segments dragged onto paving is no end: it does not join', () => {
    let p = drawn(base(), [{ x: 30, y: 50 }, { x: 50, y: 20 }, { x: 70, y: 50 }])
    p = moveStreetNode(p, o1, nodeAt(p, 50, 20)!.id, { x: 50, y: 2 })
    expect(streets(p).segments).toHaveLength(3)
    expect(nodeAt(p, 50, 2)).toBeDefined()
  })
})
