// The active level and All in the store (Decision "Levels"; port of Plaza-Practiko's `nivelActivoId`, `verTodos`,
// `seleccionar` and `setNivelActivo`, `estado/store.ts`).
import { describe, expect, it } from 'vitest'
import { addLevelAtEnd, removeLevels } from '../actions/levels.ts'
import { addMass, removeMasses } from '../actions/masses.ts'
import { demoProject } from '../demo.ts'
import { createAppStore } from '../store.ts'

/** The demo, plus L2 above (with m4) and B1 below. */
function project() {
  let p = demoProject()
  const up = addLevelAtEnd(p, 'above')
  p = addLevelAtEnd(up.project, 'below').project
  return addMass(p, { programId: 'office', footprint: { kind: 'rect', center: { x: 120, y: 110 }, width: 60, depth: 40, rotation: 0 }, levelId: up.id }).project
}

describe('the active level', () => {
  it('starts on the ground floor; opening a project goes to its ground floor and out of All', () => {
    const s = createAppStore(project())
    expect(s.getState()).toMatchObject({ level: 'l1', showAll: false })
    s.getState().setLevel('l2')
    s.getState().setShowAll(true)
    s.getState().open(project())
    expect(s.getState()).toMatchObject({ level: 'l1', showAll: false })
  })

  it('selecting a mass on another level goes there; changing level lets go of it (port)', () => {
    const s = createAppStore(project())
    s.getState().select('m4')
    expect(s.getState()).toMatchObject({ level: 'l2', selection: { massId: 'm4' } })
    s.getState().setLevel('l2')
    expect(s.getState().selection.massId).toBe('m4')
    s.getState().setLevel('l1')
    expect(s.getState().selection.massId).toBeNull()
    s.getState().setLevel('nowhere')
    expect(s.getState().level).toBe('l1')
  })

  it('All is a view: it lets go of the selection and keeps the level to come back to (port)', () => {
    const s = createAppStore(project())
    s.getState().select('m1')
    s.getState().setShowAll(true)
    expect(s.getState()).toMatchObject({ showAll: true, level: 'l1', selection: { massId: null } })
    s.getState().setLevel('l3')
    expect(s.getState()).toMatchObject({ showAll: false, level: 'l3' })
    s.getState().setShowAll(true)
    s.getState().select('m4')
    expect(s.getState()).toMatchObject({ showAll: false, level: 'l2' })
  })

  it('a level that goes away (emptied: Decision "Levels follow the masses") leaves the plan in its building, on the nearest level; undo brings it back', () => {
    const s = createAppStore(project())
    s.getState().setLevel('l2')
    s.getState().apply((p) => removeMasses(p, ['m4']))
    // L2 and the empty B1 went with the edit
    expect(s.getState().project.buildings[0].levels.map((l) => l.id)).toEqual(['l1'])
    expect(s.getState().level).toBe('l1')
    s.getState().undo()
    expect(s.getState().project.buildings[0].levels.map((l) => l.id)).toContain('l2')
    s.getState().setLevel('l2')
    expect(s.getState().level).toBe('l2')
    // a level removed by hand, with its masses: the same
    s.getState().apply((p) => removeLevels(p, ['l2']))
    expect(s.getState().level).toBe('l1')
  })
})
