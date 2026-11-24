// The site's verbs (Phase 5.1, Decision "Site files"): the boundary replaced, the georeference, Place and the map.
// The demo has a boundary, a gate on it, its south street (an existing street) and no georeference.
import { describe, expect, it } from 'vitest'
import { ProjectSchema, type Contour, type SiteMap } from '../../model/schema.ts'
import { toPlan } from '../../engine/geo/local.ts'
import { signedArea } from '../../engine/geom/polygon.ts'
import { siteCenter } from '../../engine/geo/site.ts'
import { gatesOf } from '../../engine/circulation/gates.ts'
import { addExistingRoad, addGateOn, ownGates } from '../actions/circulation.ts'
import { locateSite, placeSite, setBoundary, setGeo, setMap, updateGeo } from '../actions/site.ts'
import { demoProject } from '../demo.ts'

const square: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 0, y: 100, r: 0 }, { x: 100, y: 100, r: 0 }, { x: 100, y: 0, r: 0 }] }
const map: SiteMap = { source: 'street', lat: 20.66, lon: -103.35, zoom: 18, image: 'data:image/jpeg;base64,', width: 500, height: 498, attribution: '© OpenStreetMap contributors' }
const gdl = { lat: 20.6597, lon: -103.3496 }

describe('site verbs', () => {
  it('setBoundary: a new boundary, counter-clockwise, with its source; the gates go, the roads stay', () => {
    const demo = demoProject()
    const p0 = ownGates(demo, demo.options[0].id)
    expect(p0.site.existingRoads?.length).toBeGreaterThan(0)
    expect(p0.options[0].gates?.length).toBeGreaterThan(0)
    const p = setBoundary(p0, square, 'parcel.kml')
    expect(p.site.source).toBe('parcel.kml')
    expect(p.site.gates).toBeUndefined()
    expect(p.options[0].gates).toBeUndefined()
    expect(p.site.existingRoads).toEqual(p0.site.existingRoads)
    // normalized: the clockwise square comes back counter-clockwise
    expect(signedArea(p.site.boundary!.vertices)).toBeCloseTo(10000, 6)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    expect(setBoundary(p, null).site.boundary).toBeNull()
    expect(setBoundary(p, null).site.source).toBeUndefined()
  })

  it('setBoundary keeps the gates on a street or an existing street, and drops those on the old boundary (review E3)', () => {
    const demo = demoProject()
    const road = addExistingRoad(demo, [{ x: 0, y: -50 }, { x: 80, y: -50 }], 10)!
    const withSite = addGateOn(road.project, demo.options[0].id, { kind: 'existing-road', id: road.id, side: 'right', at: 40 })
    const own = ownGates(withSite.project, demo.options[0].id)
    expect(own.site.gates!.some((g) => g.t !== undefined)).toBe(true)
    const p = setBoundary(own, square)
    expect(p.site.gates?.map((g) => g.id)).toEqual([withSite.id])
    expect(p.options[0].gates?.map((g) => g.id)).toEqual([withSite.id])
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('setBoundary: an option whose own gates were all on the boundary keeps an empty list, not the site’s street gates (review R3)', () => {
    const demo = demoProject()
    const road = addExistingRoad(demo, [{ x: 0, y: -50 }, { x: 80, y: -50 }], 10)!
    const withSite = addGateOn(road.project, demo.options[0].id, { kind: 'existing-road', id: road.id, side: 'right', at: 40 })
    // the option's own copy holds only the boundary gate; the site's list keeps the one on the existing street
    const own = ownGates(demo, demo.options[0].id)
    const q = { ...withSite.project, options: withSite.project.options.map((o, i) => (i === 0 ? { ...o, gates: own.options[0].gates!.filter((g) => g.t !== undefined) } : o)) }
    expect(q.options[0].gates!.length).toBeGreaterThan(0)
    const p = setBoundary(q, square)
    expect(p.site.gates?.map((g) => g.id)).toEqual([withSite.id])
    expect(gatesOf(p, demo.options[0].id)).toEqual([])
    expect(ProjectSchema.safeParse(p).success).toBe(true)
  })

  it('setGeo and updateGeo; removing it takes the map too', () => {
    const p = setGeo(demoProject(), { ...gdl, north: 370 })
    expect(p.site.geo).toEqual({ ...gdl, north: 10 })
    expect(updateGeo(p, { north: 10 })).toBe(p)
    expect(updateGeo(p, { lat: 21 }).site.geo?.lat).toBe(21)
    expect(updateGeo(demoProject(), { lat: 21 }).site.geo).toBeUndefined()
    const withMap = setMap(p, map)
    expect(withMap.site.map).toBe(map)
    const gone = setGeo(withMap, null)
    expect(gone.site.geo).toBeUndefined()
    expect(gone.site.map).toBeUndefined()
  })

  it('locateSite puts the place at the site’s centre', () => {
    const p = locateSite(demoProject(), gdl)
    const c = siteCenter(p)
    const at = toPlan(p.site.geo!, gdl)
    expect(at.x).toBeCloseTo(c.x, 2)
    expect(at.y).toBeCloseTo(c.y, 2)
    expect(p.site.geo!.north).toBe(0)
  })

  it('placeSite moves and turns the Earth under the plan; without a georeference it does nothing', () => {
    const p = locateSite(demoProject(), gdl)
    const c = siteCenter(p)
    const q = placeSite(p, { x: 5, y: 0 }, 30, c)
    const at = toPlan(q.site.geo!, gdl)
    expect(at.x).toBeCloseTo(c.x + 5, 2)
    expect(at.y).toBeCloseTo(c.y, 2)
    expect(q.site.geo!.north).toBeCloseTo(30, 9)
    const demo = demoProject()
    expect(placeSite(demo, { x: 5, y: 0 }, 0, c)).toBe(demo)
  })

  it('setMap needs the georeference', () => {
    const demo = demoProject()
    expect(setMap(demo, map)).toBe(demo)
    expect(ProjectSchema.safeParse({ ...demo, site: { ...demo.site, map } }).success).toBe(false)
    const p = setMap(setGeo(demo, { ...gdl, north: 0 }), map)
    expect(ProjectSchema.safeParse(p).success).toBe(true)
    expect(setMap(p, null).site.map).toBeUndefined()
  })
})
