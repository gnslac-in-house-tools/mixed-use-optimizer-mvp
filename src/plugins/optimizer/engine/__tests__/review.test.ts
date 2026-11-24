// A stage's review (Decision "Stage review"): its objectives and must-holds before → after, the other measures that
// changed, and what it moved of earlier stages within their margins (a specimen of its input only).
import { describe, expect, it } from 'vitest'
import type { Grid, Project } from '../../../../model/schema.ts'
import { importOption } from '../../../../state/actions/buildings.ts'
import { setGrid } from '../../../../state/actions/grid.ts'
import { removeMass } from '../../../../state/actions/masses.ts'
import { demoProject } from '../../../../state/demo.ts'
import { problemOf } from '../problem.ts'
import { reviewOf } from '../review.ts'
import { approve, runTemplateOf, typologyPlan } from '../stages.ts'
import { stagesFor } from '../../data.ts'
import type { Template } from '../template.ts'

const grid: Grid = { x: 10, y: 10, modules: 4, origin: { x: 40, y: 70 }, angle: 0 }
const footprint: Template = {
  id: 't',
  name: 'Footprint',
  from: 'user',
  variables: [{ kind: 'mass.position', step: 1 }],
  objectives: [{ measure: 'built-footprint', sense: 'min' }],
  constraints: [{ measure: 'overlap', max: 0 }],
  budget: { population: 8, generations: 2, seed: 1 },
}

describe('a stage’s review', () => {
  it('its objectives and must-holds before → after, better by their sense; the other measures that changed', () => {
    const project = demoProject()
    const r = reviewOf({ project, option: 'o1' }, { project: removeMass(project, 'm1'), option: 'o1' }, footprint)
    expect(r.objectives).toHaveLength(1)
    const [o] = r.objectives
    expect(o).toMatchObject({ id: 'built-footprint', sense: 'min', better: true })
    expect(o.after).toBeLessThan(o.before)
    // the stage names overlap; the run also held the other fixed rules and a strict COS (Decision "Fixed constraints")
    expect(r.constraints.map((c) => c.id)).toEqual(['overlap', 'outside-buildable', 'required-gap', 'coverage-over'])
    expect(r.constraints[0]).toMatchObject({ id: 'overlap', max: 0, held: true })
    // the rest: what changed, and what did not; neither repeats an objective or a must-hold
    expect(r.changed.length).toBeGreaterThan(0)
    expect(r.changed.every((f) => f.better === null)).toBe(true)
    expect([...r.changed, ...r.same].some((f) => f.id === 'built-footprint' || f.id === 'overlap')).toBe(false)
    expect(r.same.some((f) => f.id === 'site-area')).toBe(true)
    expect(r.moved).toEqual([])
  })

  it('a max objective is better up; nothing changed, nothing better', () => {
    const project = demoProject()
    const t: Template = { ...footprint, objectives: [{ measure: 'built-footprint', sense: 'max' }] }
    expect(reviewOf({ project, option: 'o1' }, { project: removeMass(project, 'm1'), option: 'o1' }, t).objectives[0].better).toBe(false)
    const same = reviewOf({ project, option: 'o1' }, { project, option: 'o1' }, t)
    expect(same.objectives[0].better).toBeNull()
    expect(same.changed).toEqual([])
  })

  it('what it moved of earlier stages, within their margins', () => {
    const project: Project = setGrid(demoProject(), grid)
    const plan = approve(typologyPlan('o1', stagesFor(demoProject())), 'stage-1', 'o1')
    const t = runTemplateOf(plan, 'stage-2')
    const problem = problemOf(project, 'o1', t)
    const genome = [...problem.seeds[0]]
    genome[problem.variables.findIndex((v) => v.key === 'grid.angle')] = 5
    const pick = problem.decode(genome)
    const r = reviewOf({ project, option: 'o1' }, { project: pick, option: 'o1' }, t)
    expect(r.moved).toEqual([{ key: 'grid.angle', label: 'Grid · angle', unit: '°', before: 0, after: 5, margin: 1, step: 5 }])
  })

  it('an option kept apart: no moved (its masses are its own), nor the buildings only one shows', () => {
    const project = demoProject()
    const kept = importOption(project, project, 'o1', 'kept')!
    const r = reviewOf({ project: kept.project, option: 'o1' }, { project: kept.project, option: kept.id }, footprint)
    expect(r.moved).toBeNull()
    expect([...r.changed, ...r.same].some((f) => f.id.startsWith('building:'))).toBe(false)
    expect(r.objectives[0].better).toBeNull()
  })
})
