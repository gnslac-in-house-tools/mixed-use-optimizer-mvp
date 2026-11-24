import { describe, expect, it } from 'vitest'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import { newProject } from '../../typologies/index.ts'
import { addMass, moveMass, newId, removeMass, rotateMass, updateMass } from '../actions/masses.ts'
import { updateSiteRules } from '../actions/site.ts'

const rect = { kind: 'rect', center: { x: 0, y: 0 }, width: 100, depth: 60, rotation: 0 } as const

describe('mass actions', () => {
  it('newId takes the first free number', () => {
    expect(newId('m', ['m1', 'm3'])).toBe('m2')
  })

  it('addMass names masses after their program and never mutates the input', () => {
    const p0 = newProject('industrial')
    const a = addMass(p0, { programId: 'warehouse', footprint: rect })
    const b = addMass(a.project, { programId: 'warehouse', footprint: rect })
    expect(p0.masses).toHaveLength(0) // the original is untouched: that is what makes undo possible
    expect(b.project.masses.map((m) => [m.id, m.name])).toEqual([
      ['m1', 'Warehouse 1'],
      ['m2', 'Warehouse 2'],
    ])
  })

  it('moveMass moves a rect centre and every contour vertex', () => {
    let p = addMass(newProject('industrial'), { programId: 'warehouse', footprint: rect }).project
    const square = contourFromPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
    p = addMass(p, { programId: 'office', footprint: { kind: 'contour', contour: square } }).project
    p = moveMass(moveMass(p, 'm1', { x: 5, y: -3 }), 'm2', { x: 5, y: -3 })
    expect(p.masses[0].footprint).toMatchObject({ center: { x: 5, y: -3 } })
    const f = p.masses[1].footprint
    expect(f.kind === 'contour' && f.contour.vertices[0]).toMatchObject({ x: 5, y: -3 })
  })

  it('returns the same object when nothing changes (no empty undo steps)', () => {
    const p = addMass(newProject('industrial'), { programId: 'warehouse', footprint: rect }).project
    expect(moveMass(p, 'm1', { x: 0, y: 0 })).toBe(p)
    expect(moveMass(p, 'nope', { x: 1, y: 0 })).toBe(p)
    expect(removeMass(p, 'nope')).toBe(p)
    expect(updateSiteRules(p, { setback: p.site.rules.setback })).toBe(p)
  })

  it('rotateMass wraps around 360°, updateMass and removeMass', () => {
    let p = addMass(newProject('industrial'), { programId: 'warehouse', footprint: { ...rect, rotation: 300 } }).project
    p = rotateMass(p, 'm1', 90)
    expect(p.masses[0].footprint).toMatchObject({ rotation: 30 })
    p = updateMass(p, 'm1', { height: 15 })
    expect(p.masses[0].height).toBe(15)
    expect(removeMass(p, 'm1').masses).toEqual([])
  })
})
