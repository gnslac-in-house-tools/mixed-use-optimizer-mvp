// Phase PE.2, task 6: a saved frontage becomes an existing street when a file of version 19 opens at 20 (Decision 12 of the
// PE.2 plan): its drawn line the boundary's run, the paving all outside it. The main axis follows the existing streets that
// lie along the boundary (Decision 13). A library terrain goes through the same site step.
import { beforeEach, describe, expect, it } from 'vitest'
import { contourFromPolygon, contourToPolygon } from '../../engine/geom/contour.ts'
import { mainAxis } from '../../engine/geom/axis.ts'
import { perimeterPath, vertexTs } from '../../engine/geom/perimeter.ts'
import { boundaryRoads } from '../../engine/circulation/streets.ts'
import { fitGrid } from '../../engine/grid/index.ts'
import { browserTerrains, readTerrainFile, terrainOf, writeTerrainFile } from '../../io/terrains.ts'
import { readGft } from '../../io/gft.ts'
import { demoProject } from '../../state/demo.ts'
import { sampleProject } from '../../state/sample.ts'
import { migrate, migrateNotes, migrateSite } from '../migrate.ts'
import { ProjectSchema, type Polygon, type Project } from '../schema.ts'

type Json = Record<string, unknown>

const rect: Polygon = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 0, y: 100 },
]
const site = (extra: Json = {}): Json => ({ boundary: contourFromPolygon(rect), rules: { setback: 0, maxCoverage: 1 }, ...extra })
const frontage = (extra: Json = {}) => ({ id: 'f1', from: 0, to: vertexTs(rect)[1], ...extra })
const roads = (s: Json) => s.existingRoads as { id: string; points: { x: number; y: number }[]; stretches: { left: number; right: number }[]; name?: string }[]

/** A project as a version 19 file would hold it: these frontages, none of the existing roads it has now and no street end linked to one (the demo links its own). */
function as19(p: Project, frontages: Json[]): Json {
  const json = JSON.parse(JSON.stringify(p, (k, v) => (k === 'road' ? undefined : v))) as { site: Json } & Json
  const { existingRoads: _, ...rest } = json.site
  return { ...json, version: 19, site: { ...rest, frontage: frontages } }
}

describe('migrateSite: a frontage becomes an existing street', () => {
  it('its street width: an existing road along the run, every stretch {0, width}, its name and its id', () => {
    const { site: s, notes } = migrateSite(site({ frontage: [frontage({ streetWidth: 15, name: 'South street' })] }), {})
    expect(roads(s)).toEqual([
      { id: 'f1', name: 'South street', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], stretches: [{ left: 0, right: 15 }] },
    ])
    expect('frontage' in s).toBe(false)
    expect(notes).toEqual(["The site's frontage became 1 existing street."])
  })

  it('without a width: the standards’ road width, else 8 m; without a name: Street', () => {
    const f = { frontage: [frontage()] }
    expect(roads(migrateSite(site(f), { roadWidth: 9 }).site)[0]).toMatchObject({ name: 'Street', stretches: [{ left: 0, right: 9 }] })
    expect(roads(migrateSite(site(f), {}).site)[0].stretches).toEqual([{ left: 0, right: 8 }])
  })

  it('its id taken by an existing road: <id>-street', () => {
    const taken = { id: 'f1', points: [{ x: 5, y: 50 }, { x: 150, y: 50 }], stretches: [{ left: 4, right: 4 }] }
    const s = migrateSite(site({ existingRoads: [taken], frontage: [frontage({ streetWidth: 12 })] }), {}).site
    expect(roads(s).map((r) => r.id)).toEqual(['f1', 'f1-street'])
    expect(roads(s)[0]).toEqual(taken)
  })

  it('a run across a corner has the corner for a point: three points, a pair of sides per stretch', () => {
    const ts = vertexTs(rect)
    const s = migrateSite(site({ frontage: [{ id: 'f1', from: ts[0] + 0.05, to: ts[2] - 0.05, streetWidth: 10 }] }), {}).site
    const path = perimeterPath(rect, ts[0] + 0.05, ts[2] - 0.05)
    expect(path).toHaveLength(3)
    expect(roads(s)[0].points).toEqual(path)
    expect(roads(s)[0].stretches).toEqual([{ left: 0, right: 10 }, { left: 0, right: 10 }])
  })

  it('a run past the first vertex comes back to it (to below from)', () => {
    const s = migrateSite(site({ frontage: [{ id: 'f1', from: 0.9, to: 0.1, streetWidth: 10 }] }), {}).site
    expect(roads(s)[0].points.length).toBeGreaterThanOrEqual(3)
    expect(roads(s)[0].stretches).toHaveLength(roads(s)[0].points.length - 1)
  })

  it('no boundary: it is dropped and the report says so; the frontage is gone all the same', () => {
    const { site: s, notes } = migrateSite({ boundary: null, rules: {}, frontage: [frontage({ streetWidth: 15 })] }, {})
    expect(s.existingRoads).toBeUndefined()
    expect('frontage' in s).toBe(false)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/dropped/)
  })

  it('a run with no length is dropped too; the others stay', () => {
    const { site: s, notes } = migrateSite(site({ frontage: [{ id: 'f1', from: 0.3, to: 0.3, streetWidth: 10 }, frontage({ id: 'f2', streetWidth: 10 })] }), {})
    expect(roads(s).map((r) => r.id)).toEqual(['f2'])
    expect(notes).toHaveLength(2)
  })

  it('the report counts them: 2 existing streets', () => {
    const ts = vertexTs(rect)
    const f = [frontage({ streetWidth: 12 }), { id: 'f2', from: ts[2], to: ts[3], streetWidth: 12 }]
    expect(migrateSite(site({ frontage: f }), {}).notes).toEqual(["The site's frontage became 2 existing streets."])
  })

  it('a site with no frontage, or an empty list, says nothing; the list goes', () => {
    expect(migrateSite(site(), {})).toEqual({ site: site(), notes: [] })
    const { site: s, notes } = migrateSite(site({ frontage: [] }), {})
    expect(notes).toEqual([])
    expect('frontage' in s).toBe(false)
  })

  it('an existing road of version 18 (a width) gets its sides, as step 18 gives them', () => {
    const old = { id: 'e1', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 80 }], width: 10 }
    expect(roads(migrateSite(site({ existingRoads: [old] }), {}).site)[0].stretches).toEqual([{ left: 5, right: 5 }, { left: 5, right: 5 }])
  })
})

describe('a file of version 19 with frontages opens at 20', () => {
  const along = (p: Project, a: number, b: number) => perimeterPath(contourToPolygon(p.site.boundary!), a, b)

  it('migrate: the frontage is an existing road, the version 20, nothing else changed', () => {
    const p = demoProject()
    const f = { id: 'f1', from: 0.04, to: 0.28, name: 'South street', streetWidth: 15 }
    const v19 = as19(p, [f])
    const read = migrate(v19)
    expect(read.version).toBe(20)
    const s = read.site as Json
    expect('frontage' in s).toBe(false)
    expect(roads(s)).toEqual([
      { id: 'f1', name: 'South street', points: along(p, f.from, f.to), stretches: along(p, f.from, f.to).slice(1).map(() => ({ left: 0, right: 15 })) },
    ])
    // the options are as they were, but for the link of the street end on the new street (the next test)
    expect(JSON.parse(JSON.stringify(read.options), (k, v) => (k === 'road' ? undefined : v))).toEqual(v19.options)
    expect((s as Json).gates).toEqual((v19.site as Json).gates)
  })

  it('the street ends on its drawn line (the way a gate had) are linked to it, as settle links an end on a line; the others are not', () => {
    const p = demoProject()
    const f = { id: 'f1', from: 0.04, to: 0.28, streetWidth: 15 }
    const read = ProjectSchema.parse(migrate(as19(p, [f])))
    const nodes = read.options[0].streets!.nodes
    const g = p.site.gates![0]
    const at = nodes.filter((n) => Math.abs(n.y) < 1e-6 && Math.abs(n.x - 225) < 1e-6)
    expect(g).toBeDefined()
    expect(at).toHaveLength(1)
    expect(at[0].road).toBe('f1')
    expect(nodes.filter((n) => n.road).map((n) => n.id)).toEqual([at[0].id])
    // a frontage that does not reach the gate links nothing
    const far = ProjectSchema.parse(migrate(as19(p, [{ id: 'f1', from: 0.5, to: 0.6, streetWidth: 15 }])))
    expect(far.options[0].streets!.nodes.some((n) => n.road)).toBe(false)
  })

  it('migrateNotes carries the report', () => {
    expect(migrateNotes(as19(demoProject(), [{ id: 'f1', from: 0.04, to: 0.28, streetWidth: 15 }]))).toEqual(["The site's frontage became 1 existing street."])
  })

  it('a .gft of 19 with a frontage opens at 20 with its existing street, and the report', () => {
    const p = demoProject()
    const r = readGft(JSON.stringify({ format: 'gfit', ...as19(p, [{ id: 'f1', from: 0.04, to: 0.28, name: 'South street', streetWidth: 15 }]) }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.version).toBe(20)
    expect(r.project.site.existingRoads).toHaveLength(1)
    expect(r.project.site.existingRoads![0]).toMatchObject({ id: 'f1', name: 'South street' })
    expect((r.project.site as Json).frontage).toBeUndefined()
    expect(r.notes).toEqual(["The site's frontage became 1 existing street."])
    expect(ProjectSchema.safeParse(r.project).success).toBe(true)
  })

  it('a file of version 20 that still has site.frontage is read with it stripped (the schema has none)', () => {
    const json = JSON.parse(JSON.stringify(demoProject())) as { site: Json } & Json
    const read = ProjectSchema.parse({ ...json, site: { ...json.site, frontage: [{ id: 'f9', from: 0, to: 0.2, streetWidth: 15 }] } })
    expect((read.site as Json).frontage).toBeUndefined()
    expect(read.site.existingRoads).toEqual(demoProject().site.existingRoads)
    expect(ProjectSchema.parse(JSON.parse(JSON.stringify(read))).site).toEqual(read.site)
  })

  it('the sample and the demo carry their frontage as an existing street today', () => {
    for (const p of [sampleProject(), demoProject()]) {
      expect((p.site as Json).frontage).toBeUndefined()
      expect(p.site.existingRoads).toHaveLength(1)
      expect(p.site.existingRoads![0].name).toBe('South street')
      expect(p.site.existingRoads![0].stretches.every((t) => t.left === 0 && t.right > 0)).toBe(true)
    }
  })
})

describe('the main axis follows the existing streets along the boundary', () => {
  // the third side runs from (300, 100) to (40, 140): -8.7° off the x axis; the longest side of the whole outline (300 m) lies on it
  const quad: Polygon = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    { x: 40, y: 140 },
  ]
  const project = (existing: { points: { x: number; y: number }[] }[]): Project => {
    const p = demoProject()
    return { ...p, grid: undefined, site: { ...p.site, boundary: contourFromPolygon(quad), existingRoads: existing.map((r, i) => ({ id: `e${i}`, points: r.points, stretches: r.points.slice(1).map(() => ({ left: 0, right: 10 })) })) } }
  }
  const size = { x: 12, y: 12, modules: 3 }
  const ts = vertexTs(quad)
  const side = perimeterPath(quad, ts[2], ts[3])

  it('mainAxis takes runs: the longest straight stretch of them, else of the whole boundary', () => {
    expect(mainAxis(quad)).toBeCloseTo(0, 6)
    expect(mainAxis(quad, [side])).toBeCloseTo(((Math.atan2(40, -260) * 180) / Math.PI + 180) % 90 - 90, 6)
    expect(mainAxis(quad, [])).toBeCloseTo(0, 6)
  })

  it('a site whose frontage was its third side: the grid’s angle is the same before (the frontage run) and after (the existing street)', () => {
    const before = mainAxis(quad, [side]) // what the frontage gave (version 19)
    expect(Math.abs(before)).toBeGreaterThan(5)
    const after = migrate(as19(project([]), [{ id: 'f1', from: ts[2], to: ts[3], streetWidth: 15 }]))
    const read = ProjectSchema.parse(after)
    expect(read.site.existingRoads![0].points).toEqual(side)
    expect(fitGrid(read, size).angle).toBeCloseTo(before, 4)
    expect(fitGrid(project([]), size).angle).toBeCloseTo(0, 4)
  })

  it('an existing street along the boundary counts; one through the middle does not', () => {
    const through = [{ points: [{ x: 20, y: 60 }, { x: 260, y: 20 }] }]
    expect(boundaryRoads(project(through).site)).toEqual([])
    expect(fitGrid(project(through), size).angle).toBeCloseTo(0, 4)
    const along = [{ points: side }]
    expect(boundaryRoads(project(along).site)).toEqual([side])
    expect(fitGrid(project(along), size).angle).toBeCloseTo(mainAxis(quad, [side]), 4)
  })

  it('a street whose points lie on the boundary but whose stretch cuts across the site does not count', () => {
    const chord = [{ points: [{ x: 0, y: 0 }, { x: 300, y: 100 }] }]
    expect(boundaryRoads(project(chord).site)).toEqual([])
  })
})

describe('a library terrain with a frontage reads with an existing road', () => {
  beforeEach(() => localStorage.clear())
  const withFrontage = () => {
    const t = terrainOf(demoProject().site, { id: 't1', name: 'Plot', savedAt: 5 })
    const { existingRoads: _, ...rest } = t.site
    return { ...t, site: { ...rest, frontage: [{ id: 'f1', from: 0.04, to: 0.28, name: 'South street', streetWidth: 15 }] } }
  }

  it('its .gfs', () => {
    const r = readTerrainFile(JSON.stringify(withFrontage()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.terrain.site.existingRoads).toHaveLength(1)
    expect(r.terrain.site.existingRoads![0]).toMatchObject({ id: 'f1', name: 'South street' })
    expect((r.terrain.site as Json).frontage).toBeUndefined()
  })

  it('this browser’s shelf', () => {
    localStorage.setItem('gfit.terrains', JSON.stringify([withFrontage()]))
    const [t] = browserTerrains.list()
    expect(t.site.existingRoads).toHaveLength(1)
    expect((t.site as Json).frontage).toBeUndefined()
  })

  it('a terrain that has none reads as it was', () => {
    const t = terrainOf(demoProject().site, { id: 't2', name: 'Plain', savedAt: 5 })
    expect(readTerrainFile(writeTerrainFile(t))).toEqual({ ok: true, terrain: t })
  })
})
