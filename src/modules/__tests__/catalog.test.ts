// The catalog (Decisions "Modules", "Catalog", "What is not there is not shown"): a module is offered by the project's
// typology and on when the project has something it acts on; the KPI lists follow, and a KPI the project chose stays in
// its list while its module is off. The optimizer's kinds and measures are the modules' too (Phase M.2): listed in the
// write order, offered while their module is on, and a saved template naming one that is off still makes its problem.
import { describe, expect, it } from 'vitest'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { derive } from '../../engine/derive.ts'
import { contourFromPolygon } from '../../engine/geom/contour.ts'
import { DEFAULT_KPIS } from '../../engine/kpis.ts'
import type { GroundPoint, Project, Terrain } from '../../model/schema.ts'
import { updateBuilding } from '../../state/actions/buildings.ts'
import { addGate, setMassDocks, setProgramDocks, updateStandards } from '../../state/actions/circulation.ts'
import { addRoad } from '../../state/__tests__/road.ts'
import { setParking } from '../parking/actions.ts'
import { moveKpi } from '../../state/actions/kpis.ts'
import { addMass } from '../../state/actions/masses.ts'
import { addProgram, setProgramDemand } from '../../state/actions/programs.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { addWarehouseType } from '../warehouse/actions.ts'
import { demoProject } from '../../state/demo.ts'
import { problemOf } from '../../plugins/optimizer/engine/problem.ts'
import { blank } from '../../typologies/blank.ts'
import { newProject, TYPOLOGIES } from '../../typologies/index.ts'
import { MASSES } from '../../typologies/plans.ts'
import { chosenKpis, isOffered, isOn, kpiCatalog, kpiOwner, kpisOn, measureCatalog, measuresOn, modulesOf, paramKinds, paramKindsOn, readKpi, readKpis } from '../catalog.ts'
import { MODULES } from '../index.ts'

/** The plane the terrain tests stand on (terrainChecks.test.ts): rising 5 % east from 100 m at x 0. */
const someTerrain = (): Terrain => {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 700; x += 50) for (let y = -100; y <= 500; y += 50) points.push({ x, y, z: 100 + 0.05 * x })
  return { contours: [], points }
}

/** The demo (docks on its warehouses, the industrial standards' parking) with a terrain, a warehouse type and a demand. */
function projectWithEverything(): Project {
  let p = setTerrain(demoProject(), someTerrain())
  p = addWarehouseType(p).project
  return setProgramDemand(p, 'office', { carStalls: 25 })
}

describe('what a typology offers and what a project turns on', () => {
  it('offers by typology and turns on by presence', () => {
    const p = newProject('industrial')
    expect(isOffered(p, 'docks')).toBe(true)
    expect(isOn(p, 'terrain')).toBe(false)
    expect(isOn({ ...p, site: { ...p.site, terrain: someTerrain() } }, 'terrain')).toBe(true)
    expect(isOffered(newProject('blank'), 'docks')).toBe(false)
  })

  it('an unknown typology offers every module', () => {
    const p = { ...newProject('blank'), typology: 'gone' }
    for (const m of MODULES) expect(isOffered(p, m.id)).toBe(true)
    expect(modulesOf('gone')).toEqual(MODULES.map((m) => m.id).filter((id) => id !== 'core'))
  })

  it('the core is always offered and always on; a typology lists the modules it offers', () => {
    for (const t of ['industrial', 'blank', 'gone']) {
      const p = { ...newProject('blank'), typology: t }
      expect(isOffered(p, 'core')).toBe(true)
      expect(isOn(p, 'core')).toBe(true)
    }
    expect(modulesOf('industrial')).toEqual(['warehouse', 'docks', 'terrain', 'parking'])
    // every typology offers the warehouse: its buildings are blocks (Phase D.2); only the industrial offers its docks
    expect(modulesOf('blank')).toEqual(['warehouse', 'terrain', 'parking'])
    expect(isOffered(newProject('industrial'), 'not-a-module')).toBe(false)
  })

  it('a module the typology does not offer is never on, whatever the project holds', () => {
    // a typology that offers neither the warehouse nor its docks (none of the known ones: every one offers the warehouse since Phase D.2)
    TYPOLOGIES.push({ ...blank, id: 'bare', name: 'Bare', modules: ['terrain', 'parking'] })
    const { project, id } = addProgram({ ...newProject('blank'), typology: 'bare' }, {})
    const docked = addMass(setProgramDocks(project, id, { per: 'm2', every: 700 }), { programId: id, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 40, depth: 20, rotation: 0 } }).project
    const q = { ...docked, warehouseTypes: projectWithEverything().warehouseTypes }
    expect(isOn(q, 'warehouse')).toBe(false)
    expect(isOn(q, 'docks')).toBe(false)
    expect(chosenKpis({ ...q, kpis: ['columns', 'dock-doors', 'issues'] })).toEqual(['issues'])
    TYPOLOGIES.pop()
  })
})

describe('presence', () => {
  it('warehouse: a warehouse type in the project', () => {
    const p = newProject('industrial')
    expect(isOn(p, 'warehouse')).toBe(false)
    expect(isOn(addWarehouseType(p).project, 'warehouse')).toBe(true)
  })

  it('docks: some mass gets dock walls, its own or its program’s', () => {
    expect(isOn(newProject('industrial'), 'docks')).toBe(false) // a program with docks, but no mass yet
    const p = demoProject()
    expect(isOn(p, 'docks')).toBe(true) // the warehouses take their program’s
    const none = p.masses.reduce((q, m) => setMassDocks(q, m.id, []), p) // [] = no docks of their own
    expect(isOn(none, 'docks')).toBe(false)
    const warehouse = p.masses.find((m) => m.programId === 'warehouse')!
    expect(isOn(setMassDocks(none, warehouse.id, [0.25]), 'docks')).toBe(true)
    expect(isOn(setProgramDocks(p, 'warehouse', null), 'docks')).toBe(false) // no walls of their own, no program docks
  })

  it('terrain: the site has a terrain', () => {
    expect(isOn(demoProject(), 'terrain')).toBe(false)
    expect(isOn(setTerrain(demoProject(), someTerrain()), 'terrain')).toBe(true)
  })

  it('parking: a program asks for stalls', () => {
    const { project, id } = addProgram(newProject('blank'), {})
    expect(isOn(project, 'parking')).toBe(false)
    expect(isOn(setProgramDemand(project, id, { carStalls: 50 }), 'parking')).toBe(true)
    expect(isOn(setProgramDemand(project, id, { trailerStalls: 1 }), 'parking')).toBe(true)
  })

  // the engine's question (parkingOf): the option's side, else the standards', which default to double; and the roads it
  // draws along: gates and streets (since ST.4 no ring is derived round a building)
  describe('parking: stalls are drawn along the circulation', () => {
    const gated = (p: Project) => addGate(p, 'o1', 0.1).project
    // a site (no site, no stalls) and no standards of its own: the engine's default is double
    const blank = {
      ...newProject('blank'),
      site: { ...newProject('blank').site, boundary: contourFromPolygon([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]) },
    }
    const building = (p: Project) => p.buildings[0].id
    /** A built design mass on the ground: no road of its own since ST.4. */
    const massed = (p: Project) => addMass(p, { programId: null, footprint: { kind: 'rect', center: { x: 200, y: 150 }, width: 60, depth: 40, rotation: 0 } }).project
    const stalls = (p: Project) => derive(p).circulation.totals.stalls

    it('a gate and no parking stated: the default draws stalls', () => {
      expect(isOn(gated(blank), 'parking')).toBe(true)
    })

    it('the standards say none: off; the option says otherwise: on', () => {
      const none = updateStandards(gated(blank), { parking: 'none' })
      expect(isOn(none, 'parking')).toBe(false)
      expect(isOn(setParking(none, 'o1', 'single'), 'parking')).toBe(true)
      expect(isOn(updateStandards(gated(blank), { parking: 'single' }), 'parking')).toBe(true)
    })

    it('an option’s own side wins over the standards’', () => {
      expect(isOn(setParking(updateStandards(gated(blank), { parking: 'none' }), 'o1', 'double'), 'parking')).toBe(true)
      expect(isOn(setParking(gated(blank), 'o1', 'none'), 'parking')).toBe(false)
    })

    it('no gates, no roads and no mass: nothing to park along, whatever the standards say', () => {
      expect(isOn(blank, 'parking')).toBe(false)
      expect(isOn(updateStandards(blank, { parking: 'double' }), 'parking')).toBe(false)
      expect(isOn(setParking(blank, 'o1', 'double'), 'parking')).toBe(false)
      expect(isOn(newProject('industrial'), 'parking')).toBe(false)
    })

    it('a road drawn by hand is circulation too; the site’s gates count for an option with none of its own', () => {
      const road = addRoad(blank, 'o1', [{ x: 0, y: 0 }, { x: 50, y: 0 }])!.project
      expect(isOn(road, 'parking')).toBe(true)
      const siteGate = { ...blank, site: { ...blank.site, gates: gatesOf(gated(blank), 'o1') } }
      expect(siteGate.options[0].gates).toBeUndefined()
      expect(isOn(siteGate, 'parking')).toBe(true)
    })

    it('a built design mass alone is no road (no ring since ST.4): off, and no stalls; an unbuilt one or a context building neither', () => {
      const p = massed(blank)
      expect(isOn(p, 'parking')).toBe(false)
      expect(stalls(p)).toBe(0)
      const { project, id } = addProgram(blank, { built: false })
      const open = addMass(project, { programId: id, footprint: { kind: 'rect', center: { x: 200, y: 150 }, width: 60, depth: 40, rotation: 0 } }).project
      expect(isOn(open, 'parking')).toBe(false)
      expect(isOn(updateBuilding(massed(blank), building(blank), { context: true }), 'parking')).toBe(false)
    })

    it('no site, no stalls: a gate or a mass without a boundary does not turn it on', () => {
      const noSite = { ...blank, site: { ...blank.site, boundary: null } }
      expect(isOn(gated(noSite), 'parking')).toBe(false)
      expect(isOn(massed(noSite), 'parking')).toBe(false)
      expect(stalls(massed(noSite))).toBe(0)
    })

    it('the demo stripped of its gates, streets and parking: off, no stalls (no ring is derived since ST.4)', () => {
      const demo = demoProject()
      const stripped: Project = {
        ...demo,
        standards: undefined,
        site: { ...demo.site, gates: undefined, existingRoads: undefined },
        options: demo.options.map((o) => ({ ...o, gates: undefined, streets: undefined, parking: undefined })),
      }
      expect(gatesOf(stripped, 'o1')).toEqual([])
      expect(isOn(stripped, 'parking')).toBe(false)
      expect(stalls(stripped)).toBe(0)
    })
  })
})

describe('the KPIs', () => {
  it('lists the KPIs of the modules that are on, and resolves every id', () => {
    const p = newProject('industrial') // no terrain
    expect(kpisOn(p).some((k) => k.id === 'cut')).toBe(false)
    expect(kpiCatalog(p).some((k) => k.id === 'cut')).toBe(true)
    expect(kpiOwner(p, 'dock-doors')).toBe('docks')
    // each module's own, and the core's with one per program and per building
    expect(kpiOwner(p, 'columns')).toBe('warehouse')
    expect(kpiOwner(p, 'stalls-short')).toBe('parking')
    expect(kpiOwner(p, 'steepest-road')).toBe('terrain')
    expect(kpiOwner(p, 'gfa')).toBe('core')
    expect(kpiOwner(p, 'program:warehouse')).toBe('core')
    expect(kpiOwner(p, `building:${p.buildings[0].id}`)).toBe('core')
    expect(kpiOwner(p, 'program:gone')).toBeNull()
  })

  it('every KPI id is unique across the catalog', () => {
    const p = projectWithEverything()
    const ids = kpiCatalog(p).map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
    // with everything on, the lists meet: nothing is offered twice and nothing is left out
    for (const m of MODULES) expect(isOn(p, m.id)).toBe(true)
    expect(kpisOn(p).map((k) => k.id)).toEqual(ids)
  })

  it('the strip shows the chosen KPIs of the modules that are on; the others stay chosen, unread', () => {
    const p = { ...newProject('industrial'), kpis: ['gfa', 'cut', 'coverage', 'columns'] }
    expect(chosenKpis(p)).toEqual(['gfa', 'coverage'])
    expect(readKpis(p, derive(p)).map((k) => k.id)).toEqual(['gfa', 'coverage'])
    // the id still resolves (a saved template reads it): its figure is just not there
    expect(readKpi('cut', p, derive(p))).toMatchObject({ id: 'cut', value: null })
    const t = { ...p, site: { ...p.site, terrain: someTerrain() } }
    expect(chosenKpis(t)).toEqual(['gfa', 'cut', 'coverage'])
    expect(chosenKpis({ ...p, kpis: undefined })).toEqual(DEFAULT_KPIS)
  })

  it('keeps a chosen KPI of an off module when another KPI moves', () => {
    const p = { ...newProject('industrial'), kpis: ['gfa', 'cut', 'coverage'] }
    const q = moveKpi(p, 0, 1)
    expect(q.kpis).toContain('cut')
    expect(chosenKpis(q)).not.toContain('cut')
  })
})

describe('the optimizer’s kinds and measures', () => {
  /** The stage window's order of the kinds before Phase M.2 (its KINDS), and of the optimizer's own measures (MEASURES). */
  const WINDOW_ORDER = [
    'warehouse.hall', 'court.depth', 'mass.position', 'mass.rotation', 'mass.proportion', 'level.height', 'level.floors',
    'platform.level', 'grid.bay', 'grid.module', 'grid.angle', 'grid.origin', 'dock.pattern', 'dimension.length',
    'gate.position', 'gate.vehicles', 'parking.side', 'road.width', 'streets.connect',
  ]
  const MEASURES_ORDER = [
    'brief-gap', 'rules-gap', 'required-gap', 'dock-to-gate', 'free-ground', 'circulation-issues', 'outside-buildable',
    'overlap', 'coverage-over', 'court-clash', 'road-room',
  ]

  /** The demo without docks (no mass gets dock walls) and, as it is, without terrain. */
  const projectWithMasses = () => {
    const p = demoProject()
    return p.masses.reduce((q, m) => setMassDocks(q, m.id, []), p)
  }

  it('lists the kinds in the write order of today', () => {
    expect(paramKinds().map((k) => k.id)).toEqual([
      'warehouse.hall', 'court.depth', 'grid.bay', 'grid.module', 'grid.angle', 'grid.origin',
      'dimension.length', 'level.height', 'level.floors', 'mass.proportion', 'mass.rotation', 'mass.position',
      'platform.level', 'dock.pattern', 'gate.position', 'gate.vehicles', 'parking.side', 'road.width', 'streets.connect',
    ])
  })

  it('offers only the kinds and measures of the modules that are on', () => {
    const p = newProject('industrial') // no terrain, no warehouse type, no docks
    expect(paramKindsOn(p).map((k) => k.id)).not.toContain('platform.level')
    expect(paramKindsOn(p).map((k) => k.id)).not.toContain('warehouse.hall')
    expect(measuresOn(p).map((m) => m.id)).not.toContain('court-clash')
    expect(measureCatalog(p).map((m) => m.id)).toContain('court-clash')
    // with everything, nothing is held back, and each list keeps the order it had (the window's, not the write order)
    const all = projectWithEverything()
    expect(paramKindsOn(all).map((k) => k.id)).toEqual(WINDOW_ORDER)
    expect(measuresOn(all).map((m) => m.id)).toEqual(measureCatalog(all).map((m) => m.id))
    // the core's alone (no site, so no parking either), each in its place
    expect(paramKindsOn(p).map((k) => k.id)).toEqual(WINDOW_ORDER.filter((id) => !['warehouse.hall', 'court.depth', 'platform.level', 'dock.pattern', 'parking.side'].includes(id)))
  })

  it('every kind, measure and KPI id is unique', () => {
    const p = projectWithEverything()
    const measures = MODULES.flatMap((m) => m.measures.map((x) => x.id))
    const ids = [...paramKinds().map((k) => k.id), ...measures, ...kpiCatalog(p).map((k) => k.id)]
    expect(new Set(ids).size).toBe(ids.length)
    // the modules' measures in the order they had, then every KPI as a measure: none left out
    expect(measureCatalog(p).map((m) => m.id)).toEqual([...MEASURES_ORDER, ...kpiCatalog(p).map((k) => k.id)])
    expect(new Set(measures)).toEqual(new Set(MEASURES_ORDER))
  })

  it('a saved template with off kinds and measures still makes a problem', () => {
    const p = projectWithMasses() // no terrain, no docks
    expect(isOn(p, 'terrain') || isOn(p, 'docks')).toBe(false)
    const t = {
      ...MASSES,
      variables: [...MASSES.variables, { kind: 'platform.level', step: 0.5, range: 3 }],
      objectives: [...MASSES.objectives, { measure: 'court-clash', sense: 'min' as const }],
    }
    const problem = problemOf(p, p.options[0].id, t)
    expect(problem.missing).toEqual([])
    expect(problem.variables.some((v) => v.kind === 'platform.level')).toBe(false) // no ground, no platform
  })
})
