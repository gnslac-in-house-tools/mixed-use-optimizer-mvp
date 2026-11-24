// A platform's level in the optimizer (Phase E.4b, Decision "Platforms"): one variable per design platform of the
// option (a building's, buildings joined, a step), ± its range around its balanced level as the problem found it, on
// whole steps the designer sets (0.5 m by default); decoded, the level is typed; with no ground, none. Cut and fill
// are KPIs, so they are its objectives at once. The demo on a plane rising 5 % east from 100 m at x 0.
import { describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import type { GroundPoint, Project, Terrain } from '../../../../model/schema.ts'
import { stepMasses } from '../../../../modules/terrain/actions.ts'
import { actions } from '../../../../state/actions/index.ts'
import { setTerrain } from '../../../../state/actions/site.ts'
import { demoProject } from '../../../../state/demo.ts'
import { problemOf } from '../problem.ts'
import type { Template } from '../template.ts'
import { MASSES } from '../../../../typologies/plans.ts'

const plane = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}
const levels = (step = 0.5, range?: number): Template => ({
  ...MASSES,
  variables: [{ kind: 'platform.level', step, ...(range ? { range } : {}) }],
  objectives: [{ measure: 'earth-balance', sense: 'min' }],
})

describe('platform levels', () => {
  it('none without ground; one per platform, ± 3 m around its balance on whole half metres; the design reads its balance', () => {
    expect(problemOf(demoProject(), 'o1', levels()).variables).toEqual([])
    const p = setTerrain(demoProject(), plane())
    const balanced = derive(p).earthwork!.platforms[0].balanced!
    const t = problemOf(p, 'o1', levels())
    expect(t.variables.map((v) => [v.key, v.label])).toEqual([['b1.level', 'Building 1 · platform level']])
    const g = t.variables[0].gene
    expect(g.kind === 'real' && [g.min, g.max, g.step]).toEqual([Math.floor((balanced - 3) * 2) / 2, Math.ceil((balanced + 3) * 2) / 2, 0.5])
    expect(t.variables[0].read(p)).toBeCloseTo(balanced, 9)
    // the designer's step and range
    const coarse = problemOf(p, 'o1', levels(1, 5)).variables[0].gene
    expect(coarse.kind === 'real' && coarse.step).toBe(1)
  })

  it('a locked building’s platform, and a step of it, are not offered', () => {
    const p = setTerrain(demoProject(), plane())
    const locked = actions.lockBuildings(p, ['b1'], true)
    expect(problemOf(locked, 'o1', levels()).variables).toEqual([])
    const stepped = actions.lockBuildings(stepMasses(p, ['m2']).project, ['b1'], true)
    expect(problemOf(stepped, 'o1', levels()).variables).toEqual([])
  })

  it('decoded, the level is typed (a step’s too); balanced, the earth balance is least', () => {
    const p: Project = stepMasses(setTerrain(demoProject(), plane()), ['m2']).project
    const t = problemOf(p, 'o1', levels())
    expect(t.variables.map((v) => v.label)).toEqual(['Building 1 · platform level', 'Warehouse 2 · platform level'])
    const [a, b] = t.variables.map((v) => v.gene as { min: number })
    const q = t.decode([a.min + 1, b.min + 2])
    expect(q.buildings[0].platform!.level).toBe(a.min + 1)
    expect(q.buildings[0].platform!.steps![0].level).toBe(b.min + 2)
    expect(t.variables.map((v) => v.read(q))).toEqual([a.min + 1, b.min + 2])
    // the earth balance as an objective: further from the balance, more
    const near = t.problem.evaluate(t.variables.map((v) => Math.round(v.read(p) * 2) / 2)).objectives[0]
    const far = t.problem.evaluate([a.min, b.min]).objectives[0]
    expect(near).toBeLessThan(far)
  })
})
