// Associative dimensions: anchored to mass corners, they follow them; locked, they keep their length; a typed length
// moves the geometry. Port of Plaza-Practiko `estado/__tests__/acotacionesAsociativas.test.ts`, plus what GFit adds:
// the mass lock and the store settling every edit (a refusal says why, once per drag).
import { describe, expect, it } from 'vitest'
import type { Footprint, Project } from '../../model/schema.ts'
import { readGft, writeGft } from '../../io/gft.ts'
import { newProject } from '../../typologies/index.ts'
import { addDimension, removeDimension, setDimensionLength, setDimensionOffset, toggleDimensionLock } from '../actions/dimensions.ts'
import { moveMass, removeMass, rotateMass, toggleMassLock, updateMass } from '../actions/masses.ts'
import { insertVertex, moveVertex, moveWall, removeVertex } from '../actions/shape.ts'
import { adjustDimensions, LOCKED_DIMENSION } from '../dimensionAnchors.ts'
import { settle } from '../settle.ts'
import { createAppStore } from '../store.ts'

const rect = (cx: number, cy: number, width: number, depth: number): Footprint => ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation: 0 })

// Two 20 × 10 rects: A at x 0–20 and B at x 30–50. A rect's corners: 0 (0,0), 1 (20,0), 2 (20,10), 3 (0,10).
const base = (): Project => ({
  ...newProject('industrial'),
  masses: [
    { id: 'A', name: 'A', levelId: 'l1', programId: null, footprint: rect(10, 5, 20, 10), height: 10 },
    { id: 'B', name: 'B', levelId: 'l1', programId: null, footprint: rect(40, 5, 20, 10), height: 10 },
  ],
})
const add = (p: Project, a: { x: number; y: number }, b: { x: number; y: number }) => addDimension(p, a, b, -3)!.project
/** A's width (corners 0 and 1) as d1, and A to B (A's corner 1 to B's corner 0) as d2; `lock` locks some of them. */
const withDims = (lock: string[] = []) => {
  let p = add(add(base(), { x: 0, y: 0 }, { x: 20, y: 0 }), { x: 20, y: 0 }, { x: 30, y: 0 })
  for (const id of lock) p = toggleDimensionLock(p, id)
  return p
}
/** The project after the edit, its dimensions adjusted; the test fails if a lock refuses it. */
const followAnchors = (before: Project, after: Project) => {
  const r = adjustDimensions(before, after)
  if ('refused' in r) throw new Error(r.refused)
  return r.project
}
/** The left edge of a mass. */
const xOf = (p: Project, id: string) => {
  const f = p.masses.find((m) => m.id === id)!.footprint
  return f.kind === 'rect' ? f.center.x - f.width / 2 : Math.min(...f.contour.vertices.map((v) => v.x))
}
const dim = (p: Project, id: string) => p.dimensions!.find((d) => d.id === id)!
const length = (p: Project, id: string) => {
  const d = dim(p, id)
  return Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
}

describe('anchors', () => {
  it('an end placed on a corner is anchored; off a corner, it is not', () => {
    const p = withDims()
    expect(dim(p, 'd1')).toMatchObject({ anchorA: { massId: 'A', vertex: 0 }, anchorB: { massId: 'A', vertex: 1 } })
    expect(dim(p, 'd2')).toMatchObject({ anchorA: { massId: 'A', vertex: 1 }, anchorB: { massId: 'B', vertex: 0 } })
    const free = add(base(), { x: 5, y: -2 }, { x: 20, y: 0 })
    expect(dim(free, 'd1').anchorA).toBeUndefined()
    expect(dim(free, 'd1').anchorB).toEqual({ massId: 'A', vertex: 1 })
  })

  it('a fraction of a millimetre off a corner: anchored, and exactly on it', () => {
    const p = add(base(), { x: 0.0004, y: -0.0003 }, { x: 20, y: 0 })
    expect(dim(p, 'd1')).toMatchObject({ a: { x: 0, y: 0 }, anchorA: { massId: 'A', vertex: 0 } })
  })

  it('a corner shared by two masses: anchored to the mass of the other end', () => {
    // C starts where A ends (they share the corner (20, 0)) and comes first in the list
    const p = base()
    const c = { id: 'C', name: 'C', levelId: 'l1', programId: null, footprint: rect(22.5, 5, 5, 10), height: 10 }
    const r = add({ ...p, masses: [c, ...p.masses] }, { x: 0, y: 0 }, { x: 20, y: 0 })
    expect(dim(r, 'd1')).toMatchObject({ anchorA: { massId: 'A', vertex: 0 }, anchorB: { massId: 'A', vertex: 1 } })
  })
})

describe('they follow the mass', () => {
  it('a moved mass takes its dimensions along; an end on another mass stays', () => {
    const p = withDims()
    const r = followAnchors(p, moveMass(p, 'A', { x: 0, y: 5 }))
    expect(dim(r, 'd1')).toMatchObject({ a: { x: 0, y: 5 }, b: { x: 20, y: 5 } })
    expect(dim(r, 'd2')).toMatchObject({ a: { x: 20, y: 5 }, b: { x: 30, y: 0 } })
  })

  it('a rotated mass, a moved corner or wall: each end goes with its corner', () => {
    const p = withDims()
    expect(length(followAnchors(p, rotateMass(p, 'A', 90)), 'd1')).toBeCloseTo(20)
    expect(dim(followAnchors(p, moveVertex(p, 'A', 1, { x: 24, y: 0 })), 'd1').b).toEqual({ x: 24, y: 0 })
    // wall 1 is A's right side: moving it out 4 m widens A, and the gap to B shrinks
    const wider = followAnchors(p, moveWall(p, 'A', 1, 4).project)
    expect(length(wider, 'd1')).toBeCloseTo(24)
    expect(length(wider, 'd2')).toBeCloseTo(6)
  })

  it('a corner added or deleted elsewhere keeps the anchor; deleting its corner lets go where it was', () => {
    const p = withDims()
    // a corner on the top wall (wall 2): corner 1 stays corner 1
    const more = followAnchors(p, insertVertex(p, 'A', 2, { x: 10, y: 10 }))
    expect(dim(more, 'd1').anchorB).toEqual({ massId: 'A', vertex: 1 })
    // a dimension on the left side (corners 3 and 0), then a corner on the right wall (wall 1): corner 3 becomes 4
    const left = add(p, { x: 0, y: 10 }, { x: 0, y: 0 })
    const r = followAnchors(left, insertVertex(left, 'A', 1, { x: 20, y: 5 }))
    expect(dim(r, 'd3').anchorA).toEqual({ massId: 'A', vertex: 4 })
    // deleting corner 1 (A becomes a triangle): d1 lets go of it and stays put
    const gone = followAnchors(p, removeVertex(p, 'A', 1))
    expect(dim(gone, 'd1').anchorB).toBeUndefined()
    expect(dim(gone, 'd1').b).toEqual({ x: 20, y: 0 })
  })

  it('a deleted mass lets go of its anchors', () => {
    const p = withDims()
    const r = followAnchors(p, removeMass(p, 'B'))
    expect(dim(r, 'd2').anchorB).toBeUndefined()
    expect(dim(r, 'd2').anchorA).toEqual({ massId: 'A', vertex: 1 })
  })

  it('no mass reshaped (another field, a renamed mass): the same project', () => {
    const p = withDims()
    const q = { ...p, name: 'other' }
    expect(followAnchors(p, q)).toBe(q)
    const renamed = updateMass(p, 'A', { name: 'Renamed' })
    expect(followAnchors(p, renamed)).toBe(renamed)
  })

  it('a broken anchor (a hand-edited file) moves nothing and lets go at the next edit of its mass', () => {
    const p = withDims()
    const broken = { ...p, dimensions: p.dimensions!.map((d) => (d.id === 'd1' ? { ...d, anchorB: { massId: 'A', vertex: 9 } } : d)) }
    const r = followAnchors(broken, moveMass(broken, 'A', { x: 1, y: 0 }))
    expect(dim(r, 'd1').anchorB).toBeUndefined()
    expect(dim(r, 'd1').b).toEqual({ x: 20, y: 0 })
  })

  it('anchors travel in the .gft; a file without them is still valid', () => {
    const p = withDims()
    const back = readGft(writeGft(p))
    expect(back.ok && back.project.dimensions).toEqual(p.dimensions)
    const old = readGft(writeGft({ ...p, dimensions: [{ id: 'd1', levelId: 'l1', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, offset: 2 }] }))
    expect(old.ok).toBe(true)
  })
})

describe('the lock', () => {
  it('between two masses: moving one drags the other along, in a chain', () => {
    let p = withDims(['d2'])
    const c = { id: 'C', name: 'C', levelId: 'l1', programId: null, footprint: rect(62.5, 2.5, 5, 5), height: 10 }
    p = { ...p, masses: [...p.masses, c] }
    p = toggleDimensionLock(add(p, { x: 50, y: 0 }, { x: 60, y: 0 }), 'd3')
    const r = followAnchors(p, moveMass(p, 'A', { x: 3, y: 0 }))
    expect([xOf(r, 'A'), xOf(r, 'B'), xOf(r, 'C')]).toEqual([3, 33, 63])
    expect(length(r, 'd2')).toBeCloseTo(10)
  })

  it('with one anchor, the free end goes along with the mass', () => {
    const p = toggleDimensionLock(add(base(), { x: 20, y: 0 }, { x: 25, y: -1 }), 'd1')
    expect(dim(followAnchors(p, moveMass(p, 'A', { x: 0, y: 4 })), 'd1').b).toEqual({ x: 25, y: 3 })
  })

  it('an edit that changes its length is refused; moving the whole mass is not', () => {
    const p = withDims(['d1'])
    expect(adjustDimensions(p, moveVertex(p, 'A', 1, { x: 24, y: 0 }))).toEqual({ refused: LOCKED_DIMENSION })
    expect('project' in adjustDimensions(p, moveMass(p, 'A', { x: 1, y: 1 }))).toBe(true)
  })

  it('a dimension with a fixed length cannot take a typed length; free, it can', () => {
    const p = withDims(['d1'])
    expect(setDimensionLength(p, 'd1', 25).notice).toMatch(/dimension with a fixed length/)
    expect(dim(toggleDimensionLock(p, 'd1'), 'd1').locked).toBeUndefined()
  })
})

describe('typing the length moves the geometry', () => {
  it('both ends on one mass: it stretches on the side of b (a rect stays a rect), and the dimension to B follows', () => {
    const p = withDims()
    const r = setDimensionLength(p, 'd1', 25).project
    expect(r.masses[0].footprint).toMatchObject({ kind: 'rect', width: 25, center: { x: 12.5, y: 5 } })
    expect(length(r, 'd1')).toBeCloseTo(25)
    expect(length(r, 'd2')).toBeCloseTo(5)
  })

  it('b on another mass moves it; only a anchored moves the mass of a back; no anchors moves b', () => {
    const p = withDims()
    expect(xOf(setDimensionLength(p, 'd2', 14).project, 'B')).toBeCloseTo(34)
    const onlyA = add(base(), { x: 20, y: 0 }, { x: 25, y: -1 })
    const l0 = length(onlyA, 'd1')
    const r = setDimensionLength(onlyA, 'd1', l0 + 2).project
    expect(length(r, 'd1')).toBeCloseTo(l0 + 2)
    expect(xOf(r, 'A')).toBeLessThan(0)
    const free = add(base(), { x: 0, y: -5 }, { x: 4, y: -5 })
    expect(dim(setDimensionLength(free, 'd1', 6).project, 'd1').b).toEqual({ x: 6, y: -5 })
  })

  it('a length that is not valid, or that the mass cannot take, says so and changes nothing', () => {
    const p = withDims()
    expect(setDimensionLength(p, 'd1', 0)).toMatchObject({ project: p, notice: expect.stringMatching(/above 0/) })
    // stretched back past its other side, the outline would flip
    expect(setDimensionLength(p, 'd1', 0.005).project).toBe(p)
  })

  it('a fixed-length dimension elsewhere holds: a stretch that would shorten it is refused with its reason', () => {
    // only a mass moved as a whole drags the other one along; stretching A would shorten the locked gap to B
    const p = withDims(['d2'])
    expect(setDimensionLength(p, 'd1', 25)).toEqual({ project: p, notice: LOCKED_DIMENSION })
    // moving B by typing d2 is a whole move of B: allowed only with d2 unlocked
    expect(setDimensionLength(p, 'd2', 14).notice).toMatch(/dimension with a fixed length/)
  })

  it('the offset moves the line, nothing else', () => {
    const p = withDims()
    expect(dim(setDimensionOffset(p, 'd1', 5), 'd1').offset).toBe(5)
    expect(setDimensionOffset(p, 'd1', -3)).toBe(p)
    expect(removeDimension(p, 'nope')).toBe(p)
  })
})

describe('the mass lock', () => {
  it('a locked mass cannot change its shape or be deleted, nor its name or program (the verbs skip them); unlocked, it moves again', () => {
    const p = toggleMassLock(base(), 'A')
    expect(p.masses[0].locked).toBe(true)
    expect(settle(p, moveMass(p, 'A', { x: 1, y: 0 }))).toEqual({ refused: 'A is locked: unlock it to change its shape.' })
    expect(settle(p, removeMass(p, 'A'))).toEqual({ refused: 'A is locked: unlock it to delete it.' })
    expect(settle(p, updateMass(p, 'A', { height: 20 }))).toMatchObject({ refused: expect.stringMatching(/locked/) })
    // its name and program are the verbs': updateMass leaves them, so the project is the same one
    expect(updateMass(p, 'A', { name: 'Kept', programId: 'office' })).toBe(p)
    const free = toggleMassLock(p, 'A')
    expect(free.masses[0].locked).toBeUndefined()
    expect('project' in settle(free, moveMass(free, 'A', { x: 1, y: 0 }))).toBe(true)
  })

  it('a locked dimension cannot drag a locked mass along', () => {
    const p = toggleMassLock(withDims(['d2']), 'B')
    expect(settle(p, moveMass(p, 'A', { x: 2, y: 0 }))).toMatchObject({ refused: expect.stringMatching(/B is locked/) })
  })
})

describe('the store', () => {
  it('a refused edit changes nothing and says why; in a drag, once', () => {
    const s = createAppStore(toggleMassLock(withDims(), 'B'))
    const before = s.getState().project
    s.getState().apply((p) => moveMass(p, 'B', { x: 5, y: 0 }))
    expect(s.getState().project).toBe(before)
    expect(s.getState().refusal?.text).toMatch(/B is locked/)
    const n = s.getState().refusal!.n
    s.getState().preview((p) => moveMass(p, 'B', { x: 1, y: 0 }))
    s.getState().preview((p) => moveMass(p, 'B', { x: 2, y: 0 }))
    expect(s.getState().refusal!.n).toBe(n + 1)
    s.getState().commit()
    expect(s.getState().project).toBe(before)
    s.getState().undo()
    expect(s.getState().project).toBe(before) // nothing was recorded
  })

  it('apply and preview follow (the dimension moves while the mass is dragged); cancel and undo bring it back', () => {
    const s = createAppStore(withDims())
    s.getState().preview((p) => moveMass(p, 'B', { x: 5, y: 0 }))
    expect(length(s.getState().project, 'd2')).toBeCloseTo(15)
    s.getState().preview((p) => moveMass(p, 'B', { x: 8, y: 0 })) // from the start of the drag
    expect(length(s.getState().project, 'd2')).toBeCloseTo(18)
    s.getState().cancel()
    expect(length(s.getState().project, 'd2')).toBeCloseTo(10)
    s.getState().apply((p) => moveMass(p, 'B', { x: -4, y: 0 }))
    expect(length(s.getState().project, 'd2')).toBeCloseTo(6)
    s.getState().undo()
    expect(length(s.getState().project, 'd2')).toBeCloseTo(10)
  })
})
