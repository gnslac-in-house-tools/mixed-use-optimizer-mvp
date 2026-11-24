// One set of operations for any contour (Phase D.1): a mass's outline, a hole, later a block's. `runShapeOp` runs an op on a
// plain contour and answers what `edit.ts` answers; an op a contour cannot take comes back with its reason, the contour as it was.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { contourToPolygon } from '../contour.ts'
import { insertVertex, moveVertex, moveWallLimited, pushWallLimited, removeVertex, setChamfer, setCornerRadius } from '../edit.ts'
import { area } from '../polygon.ts'
import { opName, runShapeOp } from '../shapeOp.ts'

/** A 10 m square from (0, 0), counter-clockwise: wall i runs from corner i. */
const square = (): Contour => ({
  vertices: [
    { x: 0, y: 0, r: 0 },
    { x: 10, y: 0, r: 0 },
    { x: 10, y: 10, r: 0 },
    { x: 0, y: 10, r: 0 },
  ],
})
const areaOf = (c: Contour) => area(contourToPolygon(c))

describe('runShapeOp', () => {
  it('push: square as pushWallLimited, with `applied`; free as moveWallLimited', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'push', wall: 1, by: 4 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.applied).toBe(4)
    expect(r.contour).toEqual(pushWallLimited(c, 1, 4).contour)
    expect(areaOf(r.contour)).toBeCloseTo(140, 9)
    const f = runShapeOp(c, { op: 'push', wall: 1, by: 4, free: true })
    expect(f.ok && f.contour).toEqual(moveWallLimited(c, 1, 4).contour)
  })

  it('push: as far as it goes, and says so; a wall pushed through the opposite one is refused with the reason', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'push', wall: 1, by: -50 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.applied).toBeLessThan(0)
      expect(r.applied).toBeGreaterThan(-10)
      expect(r.notes.join(' ')).toMatch(/limited/)
    }
    const none = runShapeOp(c, { op: 'push', wall: 1, by: 0 })
    expect(none.ok && none.applied).toBe(0)
    expect(none.contour).toBe(c)
  })

  it('vertex: moves one corner; a corner that would cross the shape is refused', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'vertex', vertex: 2, to: { x: 12, y: 13 } })
    expect(r.ok && r.contour).toEqual(moveVertex(c, 2, { x: 12, y: 13 }).contour)
    const bad = runShapeOp(c, { op: 'vertex', vertex: 2, to: { x: 5, y: -30 } })
    expect(bad.ok).toBe(false)
    expect(bad.contour).toBe(c)
    if (!bad.ok) expect(bad.reason).toMatch(/crosses|flips/)
  })

  it('insert: a corner on a wall; none on top of an existing corner', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'insert', wall: 0, at: { x: 4, y: -3 } })
    expect(r.ok && r.contour).toEqual(insertVertex(c, 0, { x: 4, y: -3 }))
    expect(r.ok && r.contour.vertices[1]).toEqual({ x: 4, y: 0, r: 0 })
    const on = runShapeOp(c, { op: 'insert', wall: 0, at: { x: 10, y: 0 } })
    expect(on.ok).toBe(false)
    expect(on.contour).toBe(c)
  })

  it('remove: takes a corner out; a triangle keeps its three', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'remove', vertex: 2 })
    expect(r.ok && r.contour).toEqual(removeVertex(c, 2).contour)
    const tri = runShapeOp(r.contour, { op: 'remove', vertex: 0 })
    expect(tri.ok).toBe(false)
    if (!tri.ok) expect(tri.reason).toMatch(/3 corners/)
  })

  it('radius and chamfer: as setCornerRadius and setChamfer; one takes the other away; the same radius changes nothing', () => {
    const c = square()
    const round = runShapeOp(c, { op: 'radius', vertex: 0, r: 2 })
    expect(round.ok && round.contour).toEqual(setCornerRadius(c, 0, 2).contour)
    if (!round.ok) return
    expect(runShapeOp(round.contour, { op: 'radius', vertex: 0, r: 2 }).contour).toBe(round.contour)
    const cut = runShapeOp(round.contour, { op: 'chamfer', vertex: 0, a: 2, b: 3 })
    expect(cut.ok && cut.contour).toEqual(setChamfer(round.contour, 0, 2, 3).contour)
    expect(cut.ok && cut.contour.vertices[0]).toMatchObject({ r: 0, chamfer: [2, 3] })
    expect(runShapeOp(c, { op: 'radius', vertex: 0, r: 500 }).ok).toBe(false)
    expect(runShapeOp(c, { op: 'chamfer', vertex: 0, a: 11, b: 1 }).ok).toBe(false)
  })

  it('a chamfer that changes nothing is the same contour: none where there is none, the same again; a radius 0 leaves a chamfer alone', () => {
    const c = square()
    expect(runShapeOp(c, { op: 'chamfer', vertex: 0, a: 0, b: 0 }).contour).toBe(c)
    const cut = runShapeOp(c, { op: 'chamfer', vertex: 0, a: 2, b: 3 })
    if (!cut.ok) throw new Error(cut.reason)
    expect(runShapeOp(cut.contour, { op: 'chamfer', vertex: 0, a: 2, b: 3 }).contour).toBe(cut.contour)
    expect(runShapeOp(cut.contour, { op: 'chamfer', vertex: 0, a: 2, b: 4 }).contour).not.toBe(cut.contour)
    // [0, 0] takes it away; a radius 0 does not (there is no radius to take away), a radius over 0 does
    const gone = runShapeOp(cut.contour, { op: 'chamfer', vertex: 0, a: 0, b: 0 })
    expect(gone.ok && gone.contour.vertices[0].chamfer).toBeUndefined()
    expect(runShapeOp(cut.contour, { op: 'radius', vertex: 0, r: 0 }).contour).toBe(cut.contour)
    const round = runShapeOp(cut.contour, { op: 'radius', vertex: 0, r: 1 })
    expect(round.ok && round.contour.vertices[0]).toMatchObject({ r: 1 })
    expect(round.ok && round.contour.vertices[0].chamfer).toBeUndefined()
  })

  it('bump: two corners on the wall and the middle one pushed, out or in, square', () => {
    const c = square()
    // wall 0 is the bottom one: its outward normal points down, so a push of 2 out is `by: 2`
    const r = runShapeOp(c, { op: 'bump', wall: 0, from: 3, to: 7, by: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.contour.vertices).toHaveLength(8)
    expect(r.applied).toBe(2)
    expect(areaOf(r.contour)).toBeCloseTo(100 + 4 * 2, 9)
    const ys = r.contour.vertices.map((v) => v.y)
    expect(Math.min(...ys)).toBeCloseTo(-2, 9)
    const xs = r.contour.vertices.filter((v) => v.y < 0).map((v) => v.x)
    expect(xs.sort((a, b) => a - b)).toEqual([3, 7])
    const notch = runShapeOp(c, { op: 'bump', wall: 0, from: 3, to: 7, by: -2 })
    expect(notch.ok && areaOf(notch.contour)).toBeCloseTo(100 - 4 * 2, 9)
  })

  it('bump: from the wall’s start needs one corner only; `from`/`to` may come in any order; no length or an arc wall is refused', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'bump', wall: 0, from: 0, to: 4, by: 1 })
    // one corner added at `to`; the start corner slides with its wall (a step out of the end, as a push), so 4 + 1 + the step's 1
    expect(r.ok && r.contour.vertices).toHaveLength(6)
    expect(r.ok && areaOf(r.contour)).toBeCloseTo(100 + 4, 9)
    const swapped = runShapeOp(c, { op: 'bump', wall: 0, from: 7, to: 3, by: 2 })
    expect(swapped.ok && swapped.contour.vertices).toHaveLength(8)
    expect(runShapeOp(c, { op: 'bump', wall: 0, from: 4, to: 4, by: 2 }).ok).toBe(false)
    const arc: Contour = { ...square(), arcs: { '0': 0.2 } }
    const a = runShapeOp(arc, { op: 'bump', wall: 0, from: 2, to: 5, by: 1 })
    expect(a.ok).toBe(false)
    expect(a.contour).toBe(arc)
  })

  it('move: the whole contour by a vector, as a hole moves', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'move', by: { x: 5, y: -2 } })
    expect(r.ok && r.contour.vertices[0]).toEqual({ x: 5, y: -2, r: 0 })
    expect(r.ok && areaOf(r.contour)).toBeCloseTo(100, 9)
    expect(runShapeOp(c, { op: 'move', by: { x: 0, y: 0 } }).contour).toBe(c)
  })

  it('a refused op comes back with the contour it was given', () => {
    const c = square()
    const r = runShapeOp(c, { op: 'push', wall: 0, by: Number.NaN })
    expect(r.ok).toBe(false)
    expect(r.contour).toBe(c)
  })
})

describe('opName', () => {
  it('names an op as a kind refuses it: a free push is its own', () => {
    expect(opName({ op: 'push', wall: 0, by: 1 })).toBe('push')
    expect(opName({ op: 'push', wall: 0, by: 1, free: true })).toBe('push-free')
    expect(opName({ op: 'chamfer', vertex: 0, a: 1, b: 1 })).toBe('chamfer')
    expect(opName({ op: 'move', by: { x: 1, y: 0 }, copy: true })).toBe('move')
  })
})
