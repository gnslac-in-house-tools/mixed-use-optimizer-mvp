// derive() in two parts (Phase C.1, Decision "Flow step"): the masses' part (deriveMassing, Massing's) and the
// circulation on top of it (withCirculation, Flow's). Together they are what derive() always gave; the masses' part
// never reads a road, so what the roads decide (a street drawn) leaves it as it is.
import { describe, expect, it } from 'vitest'
import { addRoad } from '../../state/__tests__/road.ts'
import { demoProject } from '../../state/demo.ts'
import { derive, deriveMassing, withCirculation } from '../derive.ts'
import { many, pairs, rectangle, site, siteShapes, withMasses } from './stress/scenarios.ts'

const FLOW = new Set(['gate', 'access', 'road'])
const projects = () => [demoProject(), ...siteShapes().slice(0, 4).map((s) => s.project), ...pairs().slice(0, 6).map((s) => s.project), ...many().slice(0, 3).map((s) => s.project)]

describe('the masses’ part', () => {
  it('has every figure derive() gives but the circulation, and none of its Issues', () => {
    for (const p of projects()) {
      const d = derive(p)
      const m = deriveMassing(p)
      expect(m.metrics).toEqual(d.metrics)
      expect(m.relations).toEqual(d.relations)
      expect(m.masses).toEqual(d.masses)
      expect(m.buildings).toEqual(d.buildings)
      expect(m.docks.docks).toEqual(d.circulation.docks)
      expect(m.docks.covered).toEqual(d.circulation.covered)
      expect([m.docks.doors, m.docks.courtArea]).toEqual([d.circulation.totals.doors, d.circulation.totals.courtArea])
      expect(m.issues.some((i) => FLOW.has(i.code))).toBe(false)
      expect(m.issues).toEqual(d.issues.filter((i) => !FLOW.has(i.code)))
      expect('circulation' in m).toBe(false)
    }
  })

  it('the courts’ Issues are the masses’: a court that runs into a mass is told in Massing', () => {
    // a warehouse 15 m from one to its south and one to its north: no wall has room for its court
    const p = withMasses(site(rectangle(600, 600)), [
      { x: 300, y: 300, w: 140, d: 60 },
      { x: 300, y: 215, w: 140, d: 80 },
      { x: 300, y: 385, w: 140, d: 80 },
    ])
    expect(derive(p).issues.some((i) => i.code === 'court')).toBe(true)
    expect(deriveMassing(p).issues.filter((i) => i.code === 'court')).toEqual(derive(p).issues.filter((i) => i.code === 'court'))
  })

  it('never reads a road: a street drawn leaves it as it was (and since ST.4 it has no road room: no ring is derived)', () => {
    const p = demoProject()
    const before = deriveMassing(p)
    const drawn = addRoad(p, 'o1', [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
    ])!.project
    expect(derive(drawn).circulation.roads).not.toEqual(derive(p).circulation.roads)
    expect(deriveMassing(drawn)).toEqual(before)
    expect('roadRoom' in before).toBe(false)
  })
})
describe('the circulation on top', () => {
  it('derive() is the masses’ part with the circulation on top, the brief’s Issues still last', () => {
    for (const p of projects()) {
      const d = derive(p)
      expect(withCirculation(p, deriveMassing(p))).toEqual(d)
      const brief = d.issues.findIndex((i) => i.code === 'brief')
      if (brief >= 0) expect(d.issues.slice(brief).every((i) => i.code === 'brief')).toBe(true)
    }
  })

  it('every option has its own, from its own masses', () => {
    const p = demoProject()
    const d = derive(p)
    for (const o of p.options) expect(d.options[o.id].circulation.docks).toEqual(deriveMassing(p).options[o.id].docks.docks)
  })

  it('without the network: the access (gates, docks) and no roads, stalls or circulation Issues', () => {
    const p = demoProject()
    const d = derive(p)
    const a = withCirculation(p, deriveMassing(p), { network: false })
    expect(a.circulation.gates).toEqual(d.circulation.gates)
    expect(a.circulation.docks).toEqual(d.circulation.docks)
    expect([a.circulation.roads, a.circulation.stalls, a.circulation.approaches]).toEqual([[], [], []])
    expect(a.circulation.totals).toEqual({ ...d.circulation.totals, roadArea: 0, carRoadArea: 0, stalls: 0, lotStalls: 0 })
    expect(a.issues).toEqual(deriveMassing(p).issues)
  })
})
