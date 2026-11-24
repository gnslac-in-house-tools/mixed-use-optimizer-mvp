// The programs' verbs (Decision "Brief"): change one, set or clear its target, add one, remove one no mass uses.
import { describe, expect, it } from 'vitest'
import { ProjectSchema } from '../../model/schema.ts'
import { addMass, removeMasses } from '../actions/masses.ts'
import { addProgram, moveProgram, removeProgram, setProgramTarget, updateBriefFromDesign, updateProgram } from '../actions/programs.ts'
import { demoProject } from '../demo.ts'

const program = (p: ReturnType<typeof demoProject>, id: string) => p.programs.find((g) => g.id === id)!

describe('program verbs', () => {
  it('updateProgram changes its fields; an unknown one changes nothing', () => {
    const p = demoProject()
    const q = updateProgram(p, 'office', { name: 'HQ', size: { width: 30, depth: 30 } })
    expect(program(q, 'office')).toMatchObject({ name: 'HQ', size: { width: 30, depth: 30 }, built: true })
    expect(updateProgram(p, 'nope', { name: 'x' })).toBe(p)
  })

  it('moveProgram puts it at a position of the brief; out of range or where it is changes nothing', () => {
    const p = demoProject()
    const ids = (q: typeof p) => q.programs.map((g) => g.id)
    expect(ids(moveProgram(p, 'outdoor-storage', 0))).toEqual(['outdoor-storage', 'warehouse', 'office', 'guardhouse'])
    expect(ids(moveProgram(p, 'warehouse', 2))).toEqual(['office', 'guardhouse', 'warehouse', 'outdoor-storage'])
    expect(moveProgram(p, 'warehouse', 0)).toBe(p)
    expect(moveProgram(p, 'warehouse', 4)).toBe(p)
    expect(moveProgram(p, 'warehouse', -1)).toBe(p)
    expect(moveProgram(p, 'nope', 1)).toBe(p)
  })

  it('setProgramTarget sets part of it; the same value changes nothing; clearing both removes it', () => {
    const p = demoProject()
    const q = setProgramTarget(p, 'outdoor-storage', { area: 5000 })
    expect(program(q, 'outdoor-storage').target).toEqual({ area: 5000, count: null })
    expect(setProgramTarget(q, 'outdoor-storage', { area: 5000 })).toBe(q)
    const r = setProgramTarget(q, 'outdoor-storage', { count: 2 })
    expect(program(r, 'outdoor-storage').target).toEqual({ area: 5000, count: 2 })
    const none = setProgramTarget(r, 'outdoor-storage', { area: null, count: null })
    expect('target' in program(none, 'outdoor-storage')).toBe(false)
    expect(ProjectSchema.safeParse(none).success).toBe(true)
  })

  it('addProgram: the first free id and name, a colour no other program has; it validates', () => {
    const p = demoProject()
    const a = addProgram(p)
    expect(a.id).toBe('p1')
    const g = program(a.project, 'p1')
    expect(g).toMatchObject({ name: 'Program 1', built: true })
    expect(p.programs.map((x) => x.color)).not.toContain(g.color)
    const b = addProgram(a.project, { name: 'Yard', built: false })
    expect(program(b.project, b.id)).toMatchObject({ id: 'p2', name: 'Yard', built: false })
    expect(addProgram(b.project).project.programs.at(-1)!.name).toBe('Program 2')
    expect(ProjectSchema.safeParse(b.project).success).toBe(true)
  })

  it('removeProgram: only one no mass uses', () => {
    const p = demoProject()
    expect(removeProgram(p, 'warehouse')).toBe(p)
    const q = removeProgram(p, 'guardhouse')
    expect(q.programs.map((g) => g.id)).toEqual(['warehouse', 'office', 'outdoor-storage'])
  })
})

describe('Update brief (Decision "Brief sync")', () => {
  it('the brief takes the option’s counts: a deleted warehouse, a guard house none placed, storage drawn freely', () => {
    let p = removeMasses(demoProject(), ['m2'])
    p = addMass(p, { programId: 'outdoor-storage', footprint: { kind: 'rect', center: { x: 250, y: 30 }, width: 20, depth: 10, rotation: 0 } }).project
    const q = updateBriefFromDesign(p, 'o1')
    expect(program(q, 'warehouse').target).toEqual({ area: 24000, count: 1 }) // its area stays
    expect(program(q, 'office').target).toEqual({ area: 1200, count: 1 })
    expect(program(q, 'guardhouse').target).toEqual({ area: 24, count: null })
    expect(program(q, 'outdoor-storage').target).toEqual({ area: null, count: 1 })
    expect(ProjectSchema.safeParse(q).success).toBe(true)
  })

  it('when they agree, the same project', () => {
    const p = setProgramTarget(demoProject(), 'guardhouse', { count: null })
    expect(updateBriefFromDesign(p, 'o1')).toBe(p)
  })
})
