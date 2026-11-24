import { describe, expect, it } from 'vitest'
import type { Project } from '../../../model/schema.ts'
import { demoProject } from '../../demo.ts'
import { actions } from '../../actions/index.ts'
import { recordCalls, traced } from '../calls.ts'

const p: Project = demoProject()
const id = p.masses[0].id

describe('traced', () => {
  it('records the module, the verb, its args (without the project) and its time inside a frame', () => {
    const { calls } = recordCalls(() => actions.moveMass(p, id, { x: 5, y: 0 }))
    expect(calls).toEqual([{ module: 'state/actions/masses', name: 'moveMass', args: [id, { x: 5, y: 0 }], ms: expect.any(Number) }])
    expect(calls[0].ms).toBeGreaterThanOrEqual(0)
  })

  it('returns what the verb returns, untouched', () => {
    const { result } = recordCalls(() => actions.moveWall(p, id, 0, 3))
    expect(result.applied).toBeCloseTo(3)
    expect(result.project).not.toBe(p)
  })

  it('records every verb a lambda chains, in order', () => {
    const { calls } = recordCalls(() => actions.rotateMass(actions.moveMass(p, id, { x: 1, y: 1 }), id, 90))
    expect(calls.map((c) => c.name)).toEqual(['moveMass', 'rotateMass'])
  })

  it('records nothing outside a frame, and frames do not leak into each other', () => {
    actions.removeMass(p, id) // no frame open: ignored
    const outer = recordCalls(() => {
      const inner = recordCalls(() => actions.updateMass(p, id, { height: 20 }))
      expect(inner.calls.map((c) => c.name)).toEqual(['updateMass'])
      return actions.updateSiteRules(p, { setback: 5 })
    })
    expect(outer.calls.map((c) => c.name)).toEqual(['updateSiteRules'])
  })

  it('closes the frame even when the verb throws', () => {
    const boom = traced('test', { boom: (_p: Project) => { throw new Error('boom') } })
    expect(() => recordCalls(() => boom.boom(p))).toThrow('boom')
    expect(recordCalls(() => actions.removeMass(p, id)).calls).toHaveLength(1)
  })

  it('keeps every verb of every module', () => {
    for (const name of ['addMass', 'moveMass', 'rotateMass', 'moveWall', 'dragVertex', 'setCornerRadius', 'updateSiteRules']) {
      expect(typeof (actions as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
