import { describe, expect, it } from 'vitest'
import type { Footprint, Project } from '../../model/schema.ts'
import { newProject } from '../../typologies/index.ts'
import { addMass, rotateMass } from '../actions/masses.ts'
import { dragVertex, insertVertex, moveVertex, moveWall, removeVertex, setCornerRadius, toContour } from '../actions/shape.ts'
import { createAppStore } from '../store.ts'

/** A project with one 100 × 60 rect (m1) whose bottom-left corner is at the origin. */
function withRect(): Project {
  const footprint: Footprint = { kind: 'rect', center: { x: 50, y: 30 }, width: 100, depth: 60, rotation: 0 }
  return addMass(newProject('industrial'), { programId: 'warehouse', footprint }).project
}
const fp = (p: Project) => p.masses[0].footprint

describe('shape actions', () => {
  it('a rect stays a rect when a wall moves; the opposite wall stays', () => {
    const r = moveWall(withRect(), 'm1', 1, 20)
    expect(r.applied).toBe(20)
    expect(fp(r.project)).toMatchObject({ kind: 'rect', width: 120, center: { x: 60, y: 30 } })
  })

  it('a rect corner resizes the rect; a free shape moves only that corner', () => {
    expect(fp(moveVertex(withRect(), 'm1', 2, { x: 110, y: 70 }))).toMatchObject({ kind: 'rect', width: 110, depth: 70 })
    const free = moveVertex(toContour(withRect(), 'm1'), 'm1', 2, { x: 110, y: 70 })
    const f = fp(free)
    expect(f.kind === 'contour' && f.contour.vertices[2]).toEqual({ x: 110, y: 70, r: 0 })
  })

  it('a corner the geometry rejects: null while dragging, the same project otherwise', () => {
    const p = toContour(withRect(), 'm1')
    expect(dragVertex(p, 'm1', 2, { x: 50, y: -30 })).toBeNull() // the shape would cross itself
    expect(moveVertex(p, 'm1', 2, { x: 50, y: -30 })).toBe(p)
  })

  it('adding a corner to a rect makes it a free shape; removing it keeps the outline', () => {
    const p = insertVertex(withRect(), 'm1', 0, { x: 40, y: -3 })
    const f = fp(p)
    expect(f.kind).toBe('contour')
    expect(f.kind === 'contour' && f.contour.vertices[1]).toEqual({ x: 40, y: 0, r: 0 })
    const back = fp(removeVertex(p, 'm1', 1))
    expect(back.kind === 'contour' && back.contour.vertices).toHaveLength(4)
  })

  it('rounding a corner: only when it fits', () => {
    const p = setCornerRadius(withRect(), 'm1', 0, 10)
    const f = fp(p)
    expect(f.kind === 'contour' && f.contour.vertices[0].r).toBe(10)
    expect(setCornerRadius(p, 'm1', 0, 10)).toBe(p) // nothing changes: no undo step
    expect(setCornerRadius(p, 'm1', 0, 500)).toBe(p) // does not fit
  })

  it('a free shape rotates around its centroid, without float noise at 90°', () => {
    const p = rotateMass(toContour(withRect(), 'm1'), 'm1', 90)
    const f = fp(p)
    expect(f.kind === 'contour' && f.contour.vertices[0]).toEqual({ x: 80, y: -20, r: 0 })
  })
})

describe('store with shape edits', () => {
  it('a rejected preview keeps the last valid view', () => {
    const s = createAppStore(toContour(withRect(), 'm1'))
    s.getState().preview((p) => dragVertex(p, 'm1', 2, { x: 110, y: 70 }))
    const good = s.getState().project
    s.getState().preview((p) => dragVertex(p, 'm1', 2, { x: 50, y: -30 }))
    expect(s.getState().project).toBe(good)
    s.getState().commit()
    expect(s.getState().history.past).toHaveLength(1)
  })

  it('undo clears a selected corner that no longer exists', () => {
    const s = createAppStore(withRect())
    s.getState().apply((p) => insertVertex(p, 'm1', 0, { x: 40, y: 0 }))
    s.getState().select('m1', 4)
    s.getState().undo() // back to 4 corners: corner 4 is gone
    expect(s.getState().selection).toEqual({ massId: 'm1', vertex: null, massIds: ['m1'] })
  })
})
