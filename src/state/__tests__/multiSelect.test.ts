// B.0 in the store and the verbs (Decision "Multi-selection"): a selection of several masses, and the group verbs.
// Demo masses: m1 (120, 110) 160 × 80 and m2 (320, 110) 140 × 80, warehouses; m3 (120, 200) 40 × 20, office.
import { describe, expect, it } from 'vitest'
import { addLevelAtEnd } from '../actions/levels.ts'
import { addMass, lockMasses, moveMasses, removeMasses, rotateMasses, updateMasses } from '../actions/masses.ts'
import { demoProject } from '../demo.ts'
import { createAppStore, selectionOf } from '../store.ts'

const rectOf = (p: ReturnType<typeof demoProject>, id: string) => {
  const f = p.masses.find((m) => m.id === id)!.footprint
  if (f.kind !== 'rect') throw new Error('not a rect')
  return f
}

describe('selection of several masses', () => {
  it('massId is the mass only when it is alone; a corner only then', () => {
    expect(selectionOf(['m1'], 2)).toEqual({ massId: 'm1', vertex: 2, massIds: ['m1'] })
    expect(selectionOf(['m1', 'm2', 'm1'], 2)).toEqual({ massId: null, vertex: null, massIds: ['m1', 'm2'] })
    expect(selectionOf([])).toEqual({ massId: null, vertex: null, massIds: [] })
  })

  it('Shift+click adds a mass and takes it out again; a plain select picks one alone', () => {
    const s = createAppStore(demoProject())
    s.getState().select('m1')
    s.getState().toggleSelect('m2')
    expect(s.getState().selection).toEqual({ massId: null, vertex: null, massIds: ['m1', 'm2'] })
    s.getState().toggleSelect('m1')
    expect(s.getState().selection).toEqual({ massId: 'm2', vertex: null, massIds: ['m2'] })
    s.getState().toggleSelect('m3')
    s.getState().select('m3')
    expect(s.getState().selection.massIds).toEqual(['m3'])
  })

  it('selectMany keeps only the active level; add keeps what was selected', () => {
    const up = addLevelAtEnd(demoProject(), 'above')
    const p = addMass(up.project, { programId: null, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 10, depth: 10, rotation: 0 }, levelId: up.id })
    const s = createAppStore(p.project)
    s.getState().selectMany(['m1', p.id])
    expect(s.getState().selection.massIds).toEqual(['m1'])
    s.getState().selectMany(['m2', 'm3'], true)
    expect(s.getState().selection.massIds).toEqual(['m1', 'm2', 'm3'])
    // a mass on another level cannot join: it is picked alone, and the plan goes to it
    s.getState().toggleSelect(p.id)
    expect(s.getState()).toMatchObject({ level: up.id, selection: { massIds: [p.id] } })
  })

  it('deleting or undoing away some masses lets go of only those', () => {
    const s = createAppStore(demoProject())
    s.getState().selectMany(['m1', 'm2', 'm3'])
    s.getState().apply((p) => removeMasses(p, ['m3']))
    expect(s.getState().selection.massIds).toEqual(['m1', 'm2'])
    s.getState().apply((p) => removeMasses(p, ['m2']))
    expect(s.getState().selection).toEqual({ massId: 'm1', vertex: null, massIds: ['m1'] })
  })
})

describe('group verbs', () => {
  it('moveMasses moves them all by the same offset; removeMasses deletes them all; one step each', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => moveMasses(p, ['m1', 'm2'], { x: 5, y: -3 }))
    const p = s.getState().project
    expect(rectOf(p, 'm1').center).toEqual({ x: 125, y: 107 })
    expect(rectOf(p, 'm2').center).toEqual({ x: 325, y: 107 })
    expect(rectOf(p, 'm3').center).toEqual({ x: 120, y: 200 })
    s.getState().apply((q) => removeMasses(q, ['m1', 'm2']))
    expect(s.getState().project.masses.map((m) => m.id)).toEqual(['m3'])
    expect(s.getState().history.past).toHaveLength(2)
  })

  it('rotateMasses turns them as one piece around the centre of their bounds; one mass turns in place', () => {
    // m1 + m2 span x 40…390, y 70…150: the pivot is (215, 110)
    const p = rotateMasses(demoProject(), ['m1', 'm2'], 90)
    expect(rectOf(p, 'm1')).toMatchObject({ center: { x: 215, y: 15 }, rotation: 90 })
    expect(rectOf(p, 'm2')).toMatchObject({ center: { x: 215, y: 215 }, rotation: 270 }) // it stood turned round
    expect(rectOf(rotateMasses(demoProject(), ['m3'], 90), 'm3')).toMatchObject({ center: { x: 120, y: 200 }, rotation: 90 })
  })

  it('updateMasses and lockMasses change them all; a locked one in the group refuses the move', () => {
    const s = createAppStore(demoProject())
    s.getState().apply((p) => updateMasses(p, ['m1', 'm3'], { programId: 'office', height: 9 }))
    expect(s.getState().project.masses.map((m) => [m.programId, m.height])).toEqual([
      ['office', 9],
      ['warehouse', undefined],
      ['office', 9],
    ])
    s.getState().apply((p) => lockMasses(p, ['m1'], true))
    const before = s.getState().project
    s.getState().apply((p) => moveMasses(p, ['m1', 'm2'], { x: 10, y: 0 }))
    expect(s.getState().project).toBe(before)
    expect(s.getState().refusal).not.toBeNull()
    s.getState().apply((p) => lockMasses(p, ['m1', 'm2'], false))
    expect(s.getState().project.masses.some((m) => m.locked)).toBe(false)
  })
})
