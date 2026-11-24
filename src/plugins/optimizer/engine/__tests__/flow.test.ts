// The masses' measures without the roads (Phase C.1): a template none of whose measures reads the roads
// (`Measure.flow`) derives the masses and the access alone. Every measure not marked so must read the same either way:
// one that reads a road and is not marked fails here.
import { describe, expect, it } from 'vitest'
import { derive, deriveMassing, withCirculation } from '../../../../engine/derive.ts'
import { deriveSite } from '../../../../engine/massing/site.ts'
import { many, pairs, siteShapes } from '../../../../engine/__tests__/stress/scenarios.ts'
import type { Project } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { measureCatalog as catalog } from '../../../../modules/catalog.ts'
import { gridOf, type Evaluated } from '../../../../modules/measure.ts'
import { problemOf } from '../problem.ts'
import { MASSES, MASSES_CIRCULATION } from '../../../../typologies/plans.ts'

const projects = (): Project[] => [demoProject(), ...siteShapes().slice(0, 3).map((s) => s.project), ...pairs().slice(4, 8).map((s) => s.project), ...many().slice(0, 2).map((s) => s.project)]

describe('measures without the roads', () => {
  it('every measure not marked `flow` reads the same with or without the network', () => {
    for (const p of projects()) {
      const option = p.options[0]
      const ctx = { option, grid: gridOf(deriveSite(p.site).buildable, 0) }
      const full: Evaluated = { project: p, derived: derive(p, option.id), ctx }
      const access: Evaluated = { project: p, derived: withCirculation(p, deriveMassing(p, option.id), { network: false }), ctx }
      for (const m of catalog(p).filter((x) => !x.flow)) expect([m.id, m.read(access)]).toEqual([m.id, m.read(full)])
    }
  })

  it('the roads’ measures are marked: roads, stalls, the steepest road, Issues, circulation Issues', () => {
    const flow = catalog(demoProject())
      .filter((m) => m.flow)
      .map((m) => m.id)
    // the KPIs come by module (the catalog's order), so the set is what is asserted
    expect([...flow].sort()).toEqual(['circulation-issues', 'issues', 'road-area', 'stalls', 'stalls-short', 'steepest-road'])
  })

  it('the Masses template reads no road, so it skips the network; Masses + Circulation reads them', () => {
    const p = demoProject()
    const masses = problemOf(p, 'o1', MASSES)
    const both = problemOf(p, 'o1', MASSES_CIRCULATION)
    expect([...masses.objectives, ...masses.constraints].some((o) => o.measure.flow)).toBe(false)
    expect(both.objectives.some((o) => o.measure.flow)).toBe(true)
  })
})
