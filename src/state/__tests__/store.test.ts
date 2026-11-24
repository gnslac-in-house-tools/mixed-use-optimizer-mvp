import { describe, expect, it } from 'vitest'
import { addMass, moveMass, removeMass } from '../actions/masses.ts'
import { newProject } from '../../typologies/index.ts'
import { renameProject, setProjectUnits } from '../actions/project.ts'
import { unitsOf } from '../../engine/units.ts'
import { ProjectSchema } from '../../model/schema.ts'
import { demoProject } from '../demo.ts'
import { createAppStore } from '../store.ts'

const centerX = (s: ReturnType<typeof createAppStore>) => {
  const f = s.getState().project.masses[0].footprint
  return f.kind === 'rect' ? f.center.x : NaN
}

describe('store', () => {
  it('apply records one step, and derived follows the project', () => {
    const s = createAppStore(demoProject())
    const before = s.getState().derived.metrics.builtFootprint
    s.getState().apply((p) => removeMass(p, 'm1'))
    expect(s.getState().history.past).toHaveLength(1)
    expect(s.getState().derived.metrics.builtFootprint).toBeLessThan(before)
    s.getState().undo()
    expect(s.getState().derived.metrics.builtFootprint).toBeCloseTo(before)
    s.getState().redo()
    expect(s.getState().project.masses.some((m) => m.id === 'm1')).toBe(false)
  })

  it('open puts another project in place: fresh history, nothing selected, derived recomputed', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => removeMass(p, 'm1'))
    s.getState().select('m2')
    s.getState().open(newProject('blank', 'Other'))
    const { project, history, selection, derived } = s.getState()
    expect(project.name).toBe('Other')
    expect(history).toEqual({ past: [], future: [] })
    expect(selection).toEqual({ massId: null, vertex: null, massIds: [] })
    expect(derived.metrics.builtFootprint).toBe(0)
  })

  it('renameProject trims the name; blank or the same changes nothing', () => {
    const p = demoProject()
    expect(renameProject(p, '  Planta Norte ').name).toBe('Planta Norte')
    expect(renameProject(p, '   ')).toBe(p)
    expect(renameProject(p, 'Demo site')).toBe(p)
  })

  it('the project units: ft sets them, m removes the field, the same unit is the same project', () => {
    const p = demoProject()
    const ft = setProjectUnits(p, 'ft')
    expect(ft.units).toBe('ft')
    expect(unitsOf(ft)).toBe('ft')
    const back = setProjectUnits(ft, 'm')
    expect('units' in back).toBe(false)
    expect(setProjectUnits(p, 'm')).toBe(p)
    expect(setProjectUnits(ft, 'ft')).toBe(ft)
    expect(unitsOf({ ...p, units: undefined })).toBe('m')
    expect(ProjectSchema.parse(p).units).toBeUndefined()
    expect(ProjectSchema.parse(ft).units).toBe('ft')
    expect(ProjectSchema.safeParse({ ...p, units: 'yd' }).success).toBe(false)
  })

  it('an action that changes nothing records nothing', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => moveMass(p, 'm1', { x: 0, y: 0 }))
    expect(s.getState().history.past).toHaveLength(0)
  })

  it('a drag is many previews but ONE undo step; offsets are cumulative from the start', () => {
    const s = createAppStore(demoProject())
    const x0 = centerX(s)
    for (const dx of [1, 2, 3, 10]) s.getState().preview((p) => moveMass(p, 'm1', { x: dx, y: 0 }))
    expect(centerX(s)).toBe(x0 + 10) // not 1 + 2 + 3 + 10
    s.getState().commit()
    expect(s.getState().history.past).toHaveLength(1)
    s.getState().undo()
    expect(centerX(s)).toBe(x0)
  })

  it('cancel (Esc) restores the project from before the drag', () => {
    const s = createAppStore(demoProject())
    const x0 = centerX(s)
    s.getState().preview((p) => moveMass(p, 'm1', { x: 50, y: 0 }))
    s.getState().cancel()
    expect(centerX(s)).toBe(x0)
    expect(s.getState().history.past).toHaveLength(0)
  })

  it('undo clears a selection that points to a mass that no longer exists', () => {
    const s = createAppStore(demoProject())
    let id = ''
    s.getState().apply((p) => {
      const r = addMass(p, { programId: 'warehouse', footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 10, depth: 10, rotation: 0 } })
      id = r.id
      return r.project
    })
    s.getState().select(id)
    s.getState().undo()
    expect(s.getState().selection.massId).toBeNull()
  })
})
