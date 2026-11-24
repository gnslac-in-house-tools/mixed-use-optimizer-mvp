// Every shape operation says where each new edge came from (Phase D.2, task 1): `runShapeOp(...).from` has one entry per edge of
// the contour after, the index of the edge it came from before, or null for an edge the op made (a step, a bump's side).
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { runShapeOp, type ShapeOp } from '../shapeOp.ts'

const square = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 10, y: 0, r: 0 },
    { x: 10, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
})
/** The square with a corner on the middle of its bottom wall: edges 0 and 1 run in one line. */
const withMiddle = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 5, y: 0, r: 0 },
    { x: 10, y: 0, r: 0 },
    { x: 10, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
})
const identity = (c: Contour) => c.vertices.map((_, i) => i)

function run(c: Contour, op: ShapeOp) {
  const r = runShapeOp(c, op)
  expect(r.ok).toBe(true)
  // one entry per edge of the contour after
  expect(r.from).toHaveLength(r.contour.vertices.length)
  return r
}

describe('runShapeOp lineage (from)', () => {
  it('push on a free contour (no corner that runs on): identity', () => {
    const r = run(square(), { op: 'push', wall: 1, by: 3, free: true })
    expect(r.from).toEqual([0, 1, 2, 3])
    expect(run(square(), { op: 'push', wall: 1, by: 3 }).from).toEqual([0, 1, 2, 3])
  })

  it('push square with a step at the start: the step edge is null, the rest keep their index', () => {
    // wall 1 runs from (5,0) to (10,0); wall 0 runs on in its line, so a step goes out from (5,0)
    const r = run(withMiddle(), { op: 'push', wall: 1, by: 2 })
    expect(r.contour.vertices).toHaveLength(6)
    expect(r.from).toEqual([0, null, 1, 2, 3, 4])
  })

  it('push square with a step at the end', () => {
    // wall 0 runs from (0,0) to (5,0); wall 1 runs on after it
    const r = run(withMiddle(), { op: 'push', wall: 0, by: 2 })
    expect(r.contour.vertices).toHaveLength(6)
    expect(r.from).toEqual([0, null, 1, 2, 3, 4])
  })

  it('push square with steps at both ends', () => {
    const c: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 4, y: 0, r: 0 },
        { x: 7, y: 0, r: 0 },
        { x: 10, y: 0, r: 0 },
        { x: 10, y: 10, r: 0 },
        { x: 0, y: 10, r: 0 },
      ],
    }
    const r = run(c, { op: 'push', wall: 1, by: 2 })
    expect(r.contour.vertices).toHaveLength(8)
    expect(r.from).toEqual([0, null, 1, null, 2, 3, 4, 5])
  })

  it('push of the last wall (the contour wraps): the lineage follows the vertex order', () => {
    // wall 4 runs from (0,10) back to (0,0)... put the corner on the closing wall instead
    const c: Contour = {
      vertices: [
        { x: 0, y: 0, r: 0 },
        { x: 10, y: 0, r: 0 },
        { x: 10, y: 10, r: 0 },
        { x: 0, y: 10, r: 0 },
        { x: 0, y: 5, r: 0 },
      ],
    }
    // wall 4 (0,5) -> (0,0) and wall 3 (0,10) -> (0,5) run in one line: pushing wall 4 steps out at its start
    const r = run(c, { op: 'push', wall: 4, by: 2 })
    expect(r.from.filter((f) => f === null)).toHaveLength(1)
    expect([...r.from].filter((f): f is number => f !== null).sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('bump in the middle of a wall: [i, null, i, null, i]', () => {
    const r = run(square(), { op: 'bump', wall: 0, from: 3, to: 7, by: 2 })
    expect(r.from).toEqual([0, null, 0, null, 0, 1, 2, 3])
  })

  it('bump at a wall start: one side only', () => {
    const r = run(square(), { op: 'bump', wall: 0, from: 0, to: 4, by: 2 })
    expect(r.contour.vertices).toHaveLength(6)
    expect(r.from).toEqual([0, null, 0, 1, 2, 3])
  })

  it('bump at a wall end: one side only', () => {
    const r = run(square(), { op: 'bump', wall: 0, from: 6, to: 10, by: 2 })
    expect(r.contour.vertices).toHaveLength(6)
    expect(r.from).toEqual([0, null, 0, 1, 2, 3])
  })

  it('a notch on the last wall (the contour wraps)', () => {
    const r = run(square(), { op: 'bump', wall: 3, from: 3, to: 7, by: -2 })
    expect(r.from).toEqual([0, 1, 2, 3, null, 3, null, 3])
  })

  it('vertex, radius, chamfer and move: identity', () => {
    expect(run(square(), { op: 'vertex', vertex: 2, to: { x: 12, y: 13 } }).from).toEqual([0, 1, 2, 3])
    expect(run(square(), { op: 'radius', vertex: 0, r: 2 }).from).toEqual([0, 1, 2, 3])
    expect(run(square(), { op: 'chamfer', vertex: 0, a: 2, b: 3 }).from).toEqual([0, 1, 2, 3])
    expect(run(square(), { op: 'move', by: { x: 4, y: 5 } }).from).toEqual([0, 1, 2, 3])
  })

  it('insert: wall i twice', () => {
    expect(run(square(), { op: 'insert', wall: 0, at: { x: 4, y: -3 } }).from).toEqual([0, 0, 1, 2, 3])
    expect(run(square(), { op: 'insert', wall: 2, at: { x: 4, y: 12 } }).from).toEqual([0, 1, 2, 2, 3])
    expect(run(square(), { op: 'insert', wall: 3, at: { x: -2, y: 4 } }).from).toEqual([0, 1, 2, 3, 3])
  })

  it('remove of corner i: the merged edge comes from i - 1', () => {
    expect(run(withMiddle(), { op: 'remove', vertex: 1 }).from).toEqual([0, 2, 3, 4])
    expect(run(withMiddle(), { op: 'remove', vertex: 3 }).from).toEqual([0, 1, 2, 4])
    // corner 0: the merged edge is the last one, from n - 1
    expect(run(square(), { op: 'remove', vertex: 0 }).from).toEqual([1, 2, 3])
  })

  it('a refused op: the identity of the contour given', () => {
    const c = square()
    const bad = runShapeOp(c, { op: 'vertex', vertex: 2, to: { x: 5, y: -30 } })
    expect(bad.ok).toBe(false)
    expect(bad.from).toEqual(identity(c))
    const tri = runShapeOp(runShapeOp(c, { op: 'remove', vertex: 2 }).contour, { op: 'remove', vertex: 0 })
    expect(tri.ok).toBe(false)
    expect(tri.from).toEqual([0, 1, 2])
    const flat = runShapeOp(c, { op: 'bump', wall: 0, from: 4, to: 4, by: 2 })
    expect(flat.ok).toBe(false)
    expect(flat.from).toEqual(identity(c))
  })

  it('an op that changes nothing: the identity', () => {
    const c = square()
    expect(run(c, { op: 'push', wall: 1, by: 0 }).from).toEqual(identity(c))
    expect(run(c, { op: 'bump', wall: 0, from: 2, to: 6, by: 0 }).from).toEqual(identity(c))
    expect(run(c, { op: 'move', by: { x: 0, y: 0 } }).from).toEqual(identity(c))
  })
})
