// Arrange (Decisions "Rules", "Arrange" and "Solve"): the option's masses slide to meet the brief's rules, keep the
// site's spacing and stay in the buildable area; the smaller of two moves and the dominant one stays (floor area: ×
// its floors, a stack summed); locked and context masses stay; a mass that moves with another takes its leader's
// moves; the same input, the same answer. The demo: Warehouse 1 (m1, 160 × 80, x 40–200, y 70–150), Warehouse 2 (m2,
// 140 × 80, x 250–390), Office 1 (m3, 40 × 20, 40 m above Warehouse 1), all on l1; 20 m between buildings, 10 m
// setback.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../model/schema.ts'
import { addRule, arrange, solve, solveIssue } from '../../state/actions/graph.ts'
import { addLevel } from '../../state/actions/levels.ts'
import { addMass, moveMass, toggleMassLock, updateMass } from '../../state/actions/masses.ts'
import { setProgramTarget } from '../../state/actions/programs.ts'
import { demoProject } from '../../state/demo.ts'
import { derive } from '../derive.ts'

const only = (...rules: Parameters<typeof addRule>[1][]): Project => rules.reduce((p, r) => addRule(p, r)!.project, { ...demoProject(), rules: undefined } as Project)
const allMet = (p: Project) => derive(p).relations.every((r) => r.met)
const placement = (p: Project) => derive(p).issues.filter((i) => ['overlap', 'outside-buildable'].includes(i.code))
const centre = (p: Project, id: string) => {
  const f = p.masses.find((m) => m.id === id)!.footprint
  return f.kind === 'rect' ? f.center : null
}
const moved = (p: Project, q: Project, id: string) => {
  const a = centre(p, id)!
  const b = centre(q, id)!
  return { x: b.x - a.x, y: b.y - a.y }
}
/** A level of `repeat` floors over l1, in the demo's building. */
const upper = (p: Project, repeat: number) => addLevel(p, { name: 'Upper', elevation: 12, height: 4, repeat })!

describe('arrange', () => {
  it('the demo: its office comes against its warehouse, and nothing else breaks', () => {
    const p = demoProject()
    expect(allMet(p)).toBe(false)
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    // (but the guard house the brief asks for: Decision "Brief issues"; and a street drawn before is where it was: the office stands on it, a warning (Decision "Streets": buildings first, then the streets))
    expect(derive(q).issues.filter((i) => i.code !== 'brief' && i.code !== 'road')).toEqual([])
    expect(derive(q).relations[0].value).toBeGreaterThan(1)
  })

  it('nothing broken, or no rules: nothing moves (the same project)', () => {
    const p = only({ kind: 'near', a: 'office', b: 'warehouse', max: 60 })
    expect(arrange(p, 'o1')).toBe(p)
    const none = { ...demoProject(), rules: undefined }
    expect(arrange(none, 'o1')).toBe(none)
  })

  it('near: the office comes within reach of its nearest warehouse, keeping the site’s spacing', () => {
    // the office over Warehouse 2 (nearest), 40 m above it; it must be within 25 m
    const p = only({ kind: 'near', a: 'office', b: 'warehouse', max: 25 })
    const moved = moveMass(p, 'm3', { x: 200, y: 0 })
    expect(allMet(moved)).toBe(false)
    const q = arrange(moved, 'o1')
    expect(allMet(q)).toBe(true)
    expect(placement(q)).toEqual([])
  })

  it('apart: the warehouses move away from each other, inside the buildable area', () => {
    const p = only({ kind: 'apart', a: 'warehouse', b: 'warehouse', min: 70 })
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    expect(placement(q)).toEqual([])
  })

  it('a locked mass stays: the other takes all of the move', () => {
    const p = toggleMassLock(demoProject(), 'm1')
    const q = arrange(p, 'o1')
    expect(centre(q, 'm1')).toEqual(centre(p, 'm1'))
    expect(allMet(q)).toBe(true)
  })

  it('moves with: the office takes every move of its warehouse', () => {
    // the office moves with Warehouse 1; Warehouse 1 must be within 20 m of Warehouse 2 (it is 50 m), and Warehouse 2
    // is locked, so Warehouse 1 is the one that moves
    const p = toggleMassLock(only({ kind: 'attached', a: 'office', b: 'warehouse' }, { kind: 'near', a: 'warehouse', b: 'warehouse', max: 20 }), 'm2')
    const q = arrange(p, 'o1')
    const d1 = { x: centre(q, 'm1')!.x - centre(p, 'm1')!.x, y: centre(q, 'm1')!.y - centre(p, 'm1')!.y }
    const d3 = { x: centre(q, 'm3')!.x - centre(p, 'm3')!.x, y: centre(q, 'm3')!.y - centre(p, 'm3')!.y }
    expect(d1.x).not.toBe(0)
    expect(d3.x).toBeCloseTo(d1.x)
    expect(d3.y).toBeCloseTo(d1.y)
  })

  it('the smaller moves, the dominant stays: the office goes to its warehouse, not the warehouse to it', () => {
    const p = demoProject()
    const q = arrange(p, 'o1')
    expect(moved(p, q, 'm1')).toEqual({ x: 0, y: 0 })
    expect(moved(p, q, 'm3').y).toBeLessThan(0)
  })

  it('of two warehouses, the smaller moves (Warehouse 2: 140 × 80 against 160 × 80)', () => {
    const p = only({ kind: 'near', a: 'warehouse', b: 'warehouse', max: 20 })
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    expect(moved(p, q, 'm1')).toEqual({ x: 0, y: 0 })
    expect(moved(p, q, 'm2').x).toBeLessThan(0)
  })

  it('equal sizes: the one drawn later moves', () => {
    const p = updateMass(only({ kind: 'near', a: 'warehouse', b: 'warehouse', max: 20 }), 'm2', { footprint: { kind: 'rect', center: { x: 330, y: 110 }, width: 160, depth: 80, rotation: 0 } })
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    expect(moved(p, q, 'm1')).toEqual({ x: 0, y: 0 })
  })

  it('floors count: an office of 20 floors (16 000 m²) outweighs its warehouse (12 800 m²), so the warehouse moves', () => {
    const { project, id } = upper(only({ kind: 'adjacent', a: 'office', b: 'warehouse' }), 20)
    const p = updateMass(project, 'm3', { levelId: id })
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    expect(moved(p, q, 'm3')).toEqual({ x: 0, y: 0 })
    expect(moved(p, q, 'm1').y).toBeGreaterThan(0)
  })

  it('a stack moves as one, its floors summed: Warehouse 2 with a floor over it outweighs Warehouse 1', () => {
    const { project, id } = upper(only({ kind: 'near', a: 'warehouse', b: 'warehouse', max: 20 }), 1)
    const top = addMass(project, { programId: null, levelId: id, footprint: { kind: 'rect', center: { x: 320, y: 110 }, width: 140, depth: 80, rotation: 0 } })
    const p = top.project
    // 11 200 + 11 200 m² against 12 800: Warehouse 1 moves; Warehouse 2 and its upper floor stay
    const q = arrange(p, 'o1')
    expect(allMet(q)).toBe(true)
    expect(moved(p, q, 'm2')).toEqual({ x: 0, y: 0 })
    expect(moved(p, q, top.id)).toEqual({ x: 0, y: 0 })
    expect(moved(p, q, 'm1').x).toBeGreaterThan(0)
    // Warehouse 1 locked: the stack moves, both floors by the same
    const r = arrange(toggleMassLock(p, 'm1'), 'o1')
    expect(moved(p, r, 'm2').x).toBeLessThan(0)
    expect(moved(p, r, top.id)).toEqual(moved(p, r, 'm2'))
  })

  it('the same input, the same answer', () => {
    const p = only({ kind: 'near', a: 'office', b: 'warehouse', max: 25 }, { kind: 'apart', a: 'warehouse', b: 'warehouse', min: 60 })
    expect(arrange(p, 'o1')).toEqual(arrange(p, 'o1'))
  })
})

describe('solve', () => {
  it('the demo: places the guard house the brief asks for, brings the office to its warehouse, and breaks nothing', () => {
    const p = demoProject()
    const r = solve(p, 'o1', 'l1')
    expect(r.added).toHaveLength(1)
    expect(r.missing).toBe(0)
    expect(r.project.masses.find((m) => m.id === r.added[0])?.programId).toBe('guardhouse')
    expect(allMet(r.project)).toBe(true)
    // (a street drawn before is where it was: the office stands on it, a warning (Decision "Streets": buildings first, then the streets))
    expect(derive(r.project).issues.filter((i) => i.code !== 'road')).toEqual([])
    expect(moved(p, r.project, 'm1')).toEqual({ x: 0, y: 0 })
  })

  it('from an empty site: the brief’s masses, the biggest first, every rule met', () => {
    let p: Project = { ...demoProject(), masses: [] }
    p = setProgramTarget(p, 'outdoor-storage', { count: 1 })
    const r = solve(p, 'o1', 'l1')
    const programs = r.project.masses.map((m) => m.programId)
    expect(programs[0]).toBe('warehouse')
    expect(programs.filter((g) => g === 'warehouse')).toHaveLength(2)
    expect(programs).toEqual(expect.arrayContaining(['office', 'guardhouse', 'outdoor-storage']))
    expect(r.missing).toBe(0)
    expect(allMet(r.project)).toBe(true)
    expect(placement(r.project)).toEqual([])
  })
})

describe('one issue solved alone (Decision "Issues, one list")', () => {
  it('a broken rule: its two masses meet it; nothing else moves, nor is the brief’s guard house placed', () => {
    const p = demoProject()
    const issue = derive(p).issues.find((i) => i.code === 'relation')!
    const r = solveIssue(p, 'o1', 'l1', issue)
    expect(derive(r.project).relations.find((x) => x.rule === 'rule1')!.met).toBe(true)
    expect(moved(p, r.project, 'm2')).toEqual({ x: 0, y: 0 })
    expect(r.project.masses).toHaveLength(p.masses.length)
  })

  it('an overlap: those two apart, a third mass stays where it was; the brief’s gap: that program’s masses alone', () => {
    // Warehouse 2 over Warehouse 1; the office broken against its warehouse stays broken
    const p = moveMass(demoProject(), 'm2', { x: -150, y: 0 })
    const overlap = derive(p).issues.find((i) => i.code === 'overlap')!
    const r = solveIssue(p, 'o1', 'l1', overlap)
    expect(derive(r.project).issues.filter((i) => i.code === 'overlap')).toEqual([])
    expect(moved(p, r.project, 'm3')).toEqual({ x: 0, y: 0 })
    const gap = derive(p).issues.find((i) => i.code === 'brief')!
    const b = solveIssue(p, 'o1', 'l1', gap)
    expect(b.added).toHaveLength(1)
    expect(b.project.masses.find((m) => m.id === b.added[0])!.programId).toBe('guardhouse')
    expect(moved(p, b.project, 'm2')).toEqual({ x: 0, y: 0 })
    // an issue Solve does not settle: the same project
    expect(solveIssue(p, 'o1', 'l1', { code: 'coverage-exceeded', massIds: [] }).project).toBe(p)
  })
})
