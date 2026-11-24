// The areas (Decision "Areas", Phase Q.1): each kind, measure and KPI says which area it belongs to, and what is never an
// objective (a KPI the user keeps as a KPI, what is hidden, the fixed rules and COS) says `aim: false`. The stage window
// and the left rail group by them. The ids are the spec's, checked against the catalog's.
import { describe, expect, it } from 'vitest'
import type { GroundPoint, Project, Terrain } from '../../model/schema.ts'
import { addWarehouseType } from '../warehouse/actions.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { setProgramDemand } from '../../state/actions/programs.ts'
import { demoProject } from '../../state/demo.ts'
import { AREAS, kpiCatalog, measureCatalog, objectivesOn, paramKinds, type Area } from '../catalog.ts'

/** The plane the terrain tests stand on: rising 5 % east from 100 m at x 0. */
const someTerrain = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}

/** The industrial demo with every module on: a terrain, a warehouse type, a demand for stalls. */
function projectWithEverything(): Project {
  let p = setTerrain(demoProject(), someTerrain())
  p = addWarehouseType(p).project
  return setProgramDemand(p, 'office', { carStalls: 25 })
}

const AREA: Record<string, Area> = {
  'grid.angle': 'site', 'grid.bay': 'site', 'grid.module': 'site', 'grid.origin': 'site', 'platform.level': 'site',
  'dimension.length': 'massing', 'mass.position': 'massing', 'mass.rotation': 'massing', 'mass.proportion': 'massing',
  'level.floors': 'massing', 'level.height': 'massing', 'warehouse.hall': 'massing', 'dock.pattern': 'massing',
  'gate.position': 'flow', 'gate.vehicles': 'flow', 'road.width': 'flow', 'parking.side': 'flow',
  cut: 'site', fill: 'site', 'earth-balance': 'site', 'earth-moved': 'site', 'largest-step': 'site', 'steepest-ground': 'site',
  'built-footprint': 'massing', coverage: 'massing', 'open-area': 'massing', gfa: 'massing', 'dock-doors': 'massing', 'doors-short': 'massing',
  'road-area': 'flow', 'truck-courts': 'flow', 'dock-gate-distance': 'flow', stalls: 'flow', 'stalls-asked': 'flow', 'stalls-short': 'flow', 'trailer-stalls': 'flow', 'steepest-road': 'flow',
  'required-gap': 'massing', 'outside-buildable': 'massing', overlap: 'massing', 'coverage-over': 'massing',
  'road-room': 'flow', 'circulation-issues': 'flow', 'court-clash': 'flow', 'dock-to-gate': 'flow',
  'brief-gap': 'massing', 'rules-gap': 'massing', 'free-ground': 'massing',
}
const NOT_AIMED = ['site-area', 'buildings', 'masses', 'corridor-area', 'wall-area', 'issues', 'brief',
  'buildable-area', 'built-volume', 'columns',
  'brief-gap', 'rules-gap', 'free-ground', 'circulation-issues', 'road-room', 'dock-to-gate', 'court-clash']

describe('the areas of the catalog', () => {
  it('every kind, measure and KPI has an area, as the spec maps them', () => {
    const p = projectWithEverything()
    const kinds = paramKinds()
    const measures = measureCatalog(p)
    const kpis = kpiCatalog(p)
    for (const x of [...kinds, ...measures, ...kpis]) expect(AREAS, x.id).toContain(x.area)
    // the program's and the building's KPIs are Massing's
    for (const k of kpis.filter((k) => k.id.startsWith('program:') || k.id.startsWith('building:'))) expect(k.area, k.id).toBe('massing')
    for (const [id, area] of Object.entries(AREA)) {
      const found = [...kinds, ...measures, ...kpis].filter((x) => x.id === id)
      expect(found.length, `${id} is in the catalog`).toBeGreaterThan(0)
      for (const x of found) expect(x.area, id).toBe(area)
    }
  })

  it('objectivesOn leaves out what is never an objective', () => {
    const p = projectWithEverything()
    const offered = objectivesOn(p).map((m) => m.id)
    const all = measureCatalog(p).map((m) => m.id)
    for (const id of NOT_AIMED) {
      expect(offered, id).not.toContain(id)
      expect(all, id).toContain(id)
    }
    expect(offered).toContain('built-footprint')
    expect(offered).toContain('cut')
    // the same order as the measures that are on
    const order = measureCatalog(p).map((m) => m.id)
    expect([...offered].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(offered)
  })

  it('the fixed rules and COS are not offered as objectives', () => {
    const offered = objectivesOn(projectWithEverything()).map((m) => m.id)
    for (const id of ['outside-buildable', 'overlap', 'required-gap', 'coverage-over']) expect(offered, id).not.toContain(id)
  })
})
