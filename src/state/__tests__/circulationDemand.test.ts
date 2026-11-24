// The Brief's Circulation tab's model (Phase K.4, Decision "Program rule set"): what the programs ask of the parking
// (a car stall per so many m² of floor, trailer stalls per dock door) as KPIs and Flow's `parking` Issue; the road
// widths' ranges the optimizer searches (`road.width`), an option keeping what it tried as its own (Keep too); the
// Parking stage's target, none of the car stalls asked short.
import { describe, expect, it } from 'vitest'
import { demandOf, stallsShort } from '../../modules/parking/engine/demand.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { derive } from '../../engine/derive.ts'
import { readKpi } from '../../modules/catalog.ts'
import type { Project } from '../../model/schema.ts'
import { problemOf } from '../../plugins/optimizer/engine/problem.ts'
import type { Template } from '../../plugins/optimizer/engine/template.ts'
import { CIRCULATION, PARKING_STAGE, STREETS_STAGE } from '../../typologies/plans.ts'
import { setOptionStandards, setStandardSearch } from '../actions/circulation.ts'
import { importOption } from '../actions/buildings.ts'
import { drawStreet } from '../actions/streets.ts'
import { setProgramDemand } from '../actions/programs.ts'
import { demoProject } from '../demo.ts'

const only = (variables: Template['variables']): Template => ({ ...CIRCULATION, variables })

describe('the demand', () => {
  it('a car stall per m² of a program’s floor, trailer stalls per dock door of its masses; cleared by null', () => {
    let p = demoProject()
    p = setProgramDemand(p, 'office', { carStalls: 25 })
    p = setProgramDemand(p, 'warehouse', { trailerStalls: 1.5 })
    expect(p.programs.find((g) => g.id === 'office')!.demand).toEqual({ carStalls: 25 })
    const d = derive(p)
    const asked = demandOf(p, d.metrics.areaByProgram, d.circulation.docks)
    const doors = d.circulation.docks.filter((k) => p.masses.find((m) => m.id === k.massId)?.programId === 'warehouse').reduce((n, k) => n + k.doors.length, 0)
    expect(doors).toBeGreaterThan(0)
    expect(asked.carStalls).toBe(Math.ceil(d.metrics.areaByProgram.office / 25))
    expect(asked.trailerStalls).toBe(Math.ceil(doors * 1.5))
    expect(asked.rows.find((r) => r.programId === 'warehouse')!.carStalls).toBeNull()
    // the same is no change; null clears, and an empty demand goes
    expect(setProgramDemand(p, 'office', { carStalls: 25 })).toBe(p)
    expect(setProgramDemand(p, 'office', { carStalls: null }).programs.find((g) => g.id === 'office')!.demand).toBeUndefined()
    expect(setProgramDemand(p, 'office', { carStalls: 0 }).programs.find((g) => g.id === 'office')!.demand).toBeUndefined()
  })

  it('KPIs: asked, short (Flow’s, against the stalls along the roads) and trailers; none asked: —', () => {
    const p = demoProject()
    expect(readKpi('stalls-asked', p, derive(p))!.value).toBeNull()
    expect(readKpi('stalls-short', p, derive(p))!.status).toBeNull()
    const stalls = derive(p).circulation.totals.stalls
    // a demand the roads give: met
    const met = setProgramDemand(p, 'office', { carStalls: 1e6 })
    expect(readKpi('stalls-short', met, derive(met))).toMatchObject({ value: 0, status: 'within' })
    // one they do not: short, and an Issue in Flow
    const short = setProgramDemand(p, 'warehouse', { carStalls: 1 })
    const d = derive(short)
    const asked = readKpi('stalls-asked', short, d)!.value!
    expect(asked).toBeGreaterThan(stalls)
    expect(readKpi('stalls-short', short, d)).toMatchObject({ value: asked - stalls, status: 'over' })
    const issue = d.issues.find((i) => i.code === 'parking')!
    expect(issue.message).toContain(`${asked - stalls} car stalls short`)
    expect(derive(met).issues.some((i) => i.code === 'parking')).toBe(false)
    expect(stallsShort(demandOf(p, d.metrics.areaByProgram, []), 0)).toBeNull()
    const trailers = setProgramDemand(p, 'warehouse', { trailerStalls: 1 })
    expect(readKpi('trailer-stalls', trailers, derive(trailers))!.value).toBe(derive(trailers).circulation.totals.doors)
  })
})

describe('the road widths searched', () => {
  it('the standards keep a range per road width; a bad one or null clears it', () => {
    const p = demoProject()
    const q = setStandardSearch(p, 'roadWidth', [7, 10])
    expect(q.standards!.search).toEqual({ roadWidth: [7, 10] })
    expect(setStandardSearch(q, 'roadWidth', [7, 10])).toBe(q)
    expect(setStandardSearch(q, 'roadWidth', [10, 7]).standards!.search).toBeUndefined()
    expect(setStandardSearch(q, 'roadWidth', null).standards!.search).toBeUndefined()
    // the figures never carry it
    expect(standardsOf(q)).not.toHaveProperty('search')
  })

  it('an option’s own widths over the standards’: new streets take them, the streets drawn keep their sides (Q1); Keep carries them', () => {
    const p = demoProject()
    const q = setOptionStandards(p, 'o1', { roadWidth: 10 })
    expect(standardsOf(q, q.options[0]).roadWidth).toBe(10)
    expect(standardsOf(q).roadWidth).toBe(standardsOf(p).roadWidth)
    const was = derive(p).circulation.roads.filter((r) => r.streetType === 'trucks')
    expect(was.length).toBeGreaterThan(0)
    expect(derive(q).circulation.roads.filter((r) => r.streetType === 'trucks').map((r) => r.width)).toEqual(was.map((r) => r.width))
    const drawn = drawStreet(q, 'o1', [{ x: 1, y: 1 }, { x: 40, y: 1 }], 'trucks')!
    expect(drawn.project.options[0].streets!.segments.find((g) => g.id === drawn.segments[0])).toMatchObject({ left: 5, right: 5 })
    expect(setOptionStandards(q, 'o1', { roadWidth: null }).options[0].standards).toBeUndefined()
    const kept = importOption(p, q, 'o1', '#1')!
    expect(kept.project.options.find((o) => o.id === kept.id)!.standards).toEqual({ roadWidth: 10 })
  })

  it('road.width: a gene per width with a range, within it; decoded, the option’s own; none without a range', () => {
    const p = demoProject()
    const t = only([{ kind: 'road.width', step: 0.5 }])
    expect(problemOf(p, 'o1', t).variables).toHaveLength(0)
    const q = setStandardSearch(setStandardSearch(p, 'roadWidth', [7, 10]), 'carRoadWidth', [5.5, 7])
    const pr = problemOf(q, 'o1', t)
    expect(pr.variables.map((v) => [v.key, v.label, v.gene])).toEqual([
      ['o1.roadWidth', 'Road width', { kind: 'real', min: 7, max: 10, step: 0.5 }],
      ['o1.carRoadWidth', 'Car road width', { kind: 'real', min: 5.5, max: 7, step: 0.5 }],
    ])
    const r = pr.decode([9, 6.5])
    expect(r.options[0].standards).toEqual({ roadWidth: 9, carRoadWidth: 6.5 })
    expect(r.standards).toEqual(q.standards)
    // the design as it is writes nothing
    const now = standardsOf(q)
    expect(pr.decode([now.roadWidth, now.carRoadWidth]).options[0].standards).toBeUndefined()
    expect(STREETS_STAGE.variables.map((v) => v.kind)).toContain('road.width')
  })
})

describe('the Parking stage’s target', () => {
  it('none of the car stalls the programs ask short: a constraint', () => {
    expect(PARKING_STAGE.constraints).toContainEqual({ measure: 'stalls-short', max: 0 })
    const p: Project = setProgramDemand(demoProject(), 'warehouse', { carStalls: 1 })
    const pr = problemOf(p, 'o1', PARKING_STAGE)
    const m = pr.constraints.findIndex((c) => c.measure.id === 'stalls-short')
    expect(m).toBeGreaterThanOrEqual(0)
    // the design as it is falls short of it
    expect(pr.measure(p).constraints[m]).toBe(readKpi('stalls-short', p, derive(p))!.value)
    expect(pr.measure(p).constraints[m]).toBeGreaterThan(0)
  })
})
