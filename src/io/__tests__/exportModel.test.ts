// What a model export carries (Decision "Model export"): Geometry the option's masses and the site's lines, Terrain the
// ground and its contours, All both; on a flat site the levels' elevations, on a ground the terrain's own heights, the
// masses on their platforms; a ×N level a floor each; the ground's triangles facing up.
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import type { GroundPoint, Project } from '../../model/schema.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { sampleProject } from '../../state/sample.ts'
import { exportIfc, ifcString, zonesText } from '../exportIfc.ts'
import { hasGround, modelOf } from '../exportModel.ts'

function onGround(): Project {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
  return setTerrain(demoProject(), { contours: [{ points: [{ x: -100, y: 0 }, { x: 600, y: 0 }], z: 485 }, { points: [{ x: 0, y: 9 }, { x: 9, y: 9 }] }], points })
}

describe('modelOf', () => {
  it('a flat site: the masses at their levels’ elevations, the site at 0, no ground; a ×N level a floor each', () => {
    const p = demoProject()
    p.buildings[0].levels[0] = { ...p.buildings[0].levels[0], repeat: 3, height: 10 }
    const m = modelOf(p, derive(p), 'all')
    expect(hasGround(p)).toBe(false)
    expect(m.masses).toHaveLength(p.masses.length)
    expect(m.masses[0].floors).toEqual([0, 10, 20])
    expect(m.buildings[0]).toMatchObject({ base: 0, levels: [{ floors: [0, 10, 20] }] })
    expect(m.site?.z).toBe(0)
    expect(m.grounds).toEqual([])
  })

  it('a smart block is one mass (Decision "Block shape"): its zones of other programs, named, in m²; in the IFC its GFit set says them', () => {
    const p = sampleProject()
    const d = derive(p)
    const m = modelOf(p, d, 'geometry')
    const halls = m.masses.filter((x) => x.zones.length)
    expect(halls).toHaveLength(2)
    expect(halls[0].zones).toEqual([{ programId: 'office', program: 'Office', area: expect.any(Number) }])
    expect(m.masses.filter((x) => !x.zones.length).length).toBeGreaterThan(0)
    expect(zonesText(halls[0])).toMatch(/^Office \d+(\.\d)? m²$/)
    expect(exportIfc(p, d, 'geometry')).toContain(`IFCPROPERTYSINGLEVALUE('Zones',$,IFCTEXT(${ifcString(zonesText(halls[0]))}),$)`)
  })

  it('Geometry, Terrain and All take what they say', () => {
    const p = onGround()
    const d = derive(p)
    const geometry = modelOf(p, d, 'geometry')
    expect([geometry.masses.length > 0, geometry.site !== null, geometry.grounds.length, geometry.contours.length]).toEqual([true, true, 0, 0])
    const terrain = modelOf(p, d, 'terrain')
    expect([terrain.masses.length, terrain.buildings.length, terrain.site, terrain.grounds.map((g) => g.name)]).toEqual([0, 0, null, ['Existing', 'Graded']])
    // a contour whose height is not known stays out
    expect(terrain.contours).toEqual([{ points: p.site.terrain!.contours[0].points, closed: false, z: 485 }])
    expect(modelOf(p, d, 'all').grounds).toHaveLength(2)
  })

  it('on a ground: the masses on their platforms, the site’s lines on its mean ground; the triangles face up', () => {
    const p = onGround()
    const d = derive(p)
    const m = modelOf(p, d, 'all')
    for (const x of m.masses) {
      const platform = d.earthwork!.platforms.find((q) => q.massIds.includes(x.id))!
      expect(x.floors[0]).toBeCloseTo(platform.level!, 6)
    }
    expect(m.site!.z).toBeGreaterThan(480)
    expect(m.site!.z).toBeLessThan(490)
    const g = m.grounds[0]
    for (let k = 0; k < g.triangles.length; k += 3) {
      const [a, b, c] = [g.triangles[k], g.triangles[k + 1], g.triangles[k + 2]]
      expect((g.x[b] - g.x[a]) * (g.y[c] - g.y[a]) - (g.x[c] - g.x[a]) * (g.y[b] - g.y[a])).toBeGreaterThan(0)
    }
  })
})

describe('the streets and courts (ST.9)', () => {
  it('a flat site: each road its centreline at 0 and its paving, each court its outline and depth at 0; Terrain none', () => {
    const p = demoProject()
    const d = derive(p)
    const m = modelOf(p, d, 'geometry')
    expect(m.roads.map((r) => r.id)).toEqual(d.circulation.roads.map((r) => r.id))
    for (const r of m.roads) {
      // the demo's south street is an existing street (Phase PE.2)
      expect(r.name).toBe(r.id.startsWith('existing:') ? 'Existing road' : 'Street')
      if (r.name === 'Street') expect(r.type).toBeTruthy()
      expect(r.centre.length).toBeGreaterThanOrEqual(2)
      expect(r.centre.every((q) => q.z === 0)).toBe(true)
      expect(r.paving.length).toBeGreaterThan(0)
    }
    expect(m.courts.map((c) => [c.massId, c.wall, c.depth, c.z])).toEqual(d.circulation.docks.map((x) => [x.massId, x.wall, 40, 0]))
    expect(m.courts[0].name).toBe('Warehouse 1 · court 1')
    expect(modelOf(p, d, 'terrain')).toMatchObject({ roads: [], courts: [] })
  })

  it('each road lists its lanes, left to right walking it: stored ones as they are, else equal ones from the width (PE.2)', () => {
    const line = [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    const wide = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', line, undefined, 10.5)!.project
    expect(modelOf(wide, derive(wide), 'geometry').roads.map((r) => r.lanes)).toEqual([[3.5, 3.5, 3.5]])
    wide.options[0].streets!.segments[0].lanes = [4, 3.5, 3]
    expect(modelOf(wide, derive(wide), 'geometry').roads.map((r) => r.lanes)).toEqual([[4, 3.5, 3]])
    const one = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', line, undefined, 3.5)!.project
    expect(modelOf(one, derive(one), 'geometry').roads.map((r) => r.lanes)).toEqual([[3.5]])
    const road = demoProject({ streets: false })
    road.site.existingRoads = [{ id: 'r1', points: line, stretches: [{ left: 3.5, right: 3.5 }] }]
    expect(modelOf(road, derive(road), 'geometry').roads.map((r) => r.lanes)).toEqual([[3.5, 3.5]])
  })

  it('on a ground: the centreline at its graded heights, each court at its platform less the dock height', () => {
    const p = sampleProject()
    const d = derive(p)
    const m = modelOf(p, d, 'geometry')
    expect(m.roads.length).toBeGreaterThan(0)
    expect(m.roads.some((r) => new Set(r.centre.map((q) => Math.round(q.z * 10))).size > 1)).toBe(true)
    for (const c of m.courts) {
      const platform = d.earthwork!.platforms.find((x) => x.massIds.includes(c.massId))!
      expect(c.z).toBeCloseTo(platform.level! - 1.2, 6)
    }
  })
})
