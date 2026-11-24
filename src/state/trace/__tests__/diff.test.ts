import { describe, expect, it } from 'vitest'
import type { Issue } from '../../../engine/types.ts'
import { addMass, moveMass, removeMass, updateMass } from '../../actions/masses.ts'
import { updateSiteRules } from '../../actions/site.ts'
import { demoProject } from '../../demo.ts'
import { diffIssues, diffProject } from '../diff.ts'

const p = demoProject()

describe('diffProject', () => {
  it('the same project: nothing changed', () => {
    expect(diffProject(p, p)).toEqual([])
  })

  it('a moved mass: only its footprint', () => {
    expect(diffProject(p, moveMass(p, 'm1', { x: 5, y: 0 }))).toEqual([{ kind: 'changed', path: 'masses.m1.footprint' }])
  })

  it('a renamed mass and a changed rule, by field', () => {
    expect(diffProject(p, updateMass(p, 'm1', { name: 'X', height: 20 }))).toEqual([
      { kind: 'changed', path: 'masses.m1.name' },
      { kind: 'changed', path: 'masses.m1.height' },
    ])
    expect(diffProject(p, updateSiteRules(p, { setback: 99 }))).toEqual([{ kind: 'changed', path: 'site.rules.setback' }])
  })

  it('masses are matched by id: added and removed', () => {
    const added = addMass(p, { programId: null, footprint: p.masses[0].footprint })
    expect(diffProject(p, added.project)).toEqual([{ kind: 'added', path: `masses.${added.id}` }])
    expect(diffProject(p, removeMass(p, 'm1'))).toEqual([{ kind: 'removed', path: 'masses.m1' }])
  })
})

describe('diffIssues', () => {
  const issue = (code: Issue['code'], massIds: string[]): Issue => ({ code, severity: 'error', massIds, message: '' })

  it('says which issues appeared and which were resolved, by code and masses', () => {
    const a = [issue('overlap', ['m1', 'm2']), issue('outside-buildable', ['m2', 'm3'])]
    const b = [issue('overlap', ['m1', 'm2']), issue('outside-buildable', ['m1'])]
    expect(diffIssues(a, b)).toEqual({
      added: [{ code: 'outside-buildable', severity: 'error', massIds: ['m1'] }],
      resolved: [{ code: 'outside-buildable', severity: 'error', massIds: ['m2', 'm3'] }],
      total: 2,
    })
  })
})
