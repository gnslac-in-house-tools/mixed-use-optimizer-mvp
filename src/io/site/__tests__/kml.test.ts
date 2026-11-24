// A site from Google Earth's files (Phase 5.3): KML and KMZ read, projected round their middle, and imported
// georeferenced; one polygon is imported at once, several are picked on the plan.
import { zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { area } from '../../../engine/geom/polygon.ts'
import { toPlan } from '../../../engine/geo/local.ts'
import { demoProject } from '../../../state/demo.ts'
import { useApp } from '../../../state/store.ts'
import { useSiteImport } from '../../../views/plan/site/importState.ts'
import { KML_UNREADABLE, KMZ_UNREADABLE, readKml, readKmz } from '../kml.ts'
import { placeGeoShapes } from '../place.ts'
import { readSiteFile } from '../siteFile.ts'

const LAT = 20.6597
const LON = -103.3496
const D = 0.001 // degrees: a square about 104 × 111 m

/** Degree lengths at a latitude (the standard series, independent of engine/geo): m per degree of lat and of lon. */
function degree(lat: number) {
  const f = (lat * Math.PI) / 180
  return {
    lat: 111132.954 - 559.822 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f),
    lon: 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f),
  }
}

const coords = (pts: [number, number][]) => pts.map(([lon, lat]) => `${lon},${lat},0`).join(' ')
const square = (lon: number, lat: number, d: number): [number, number][] => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]

function kml(placemarks: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Parcels</name>${placemarks}</Document></kml>`
}
const polygon = (name: string, outer: [number, number][], inner?: [number, number][]) => `<Placemark><name>${name}</name><Polygon>
  <outerBoundaryIs><LinearRing><coordinates>${coords(outer)}</coordinates></LinearRing></outerBoundaryIs>
  ${inner ? `<innerBoundaryIs><LinearRing><coordinates>${coords(inner)}</coordinates></LinearRing></innerBoundaryIs>` : ''}
</Polygon></Placemark>`
const path = (name: string, pts: [number, number][]) => `<Placemark><name>${name}</name><LineString><coordinates>${coords(pts)}</coordinates></LineString></Placemark>`

describe('readKml and readKmz', () => {
  it('a placemark’s polygon is a shape named by it, in lat / lon, the closing point dropped; holes left out', () => {
    const { shapes, warnings } = readKml(kml(polygon('Lot 7', square(LON, LAT, D), square(LON + D / 4, LAT + D / 4, D / 4))))
    expect(shapes).toHaveLength(1)
    expect(shapes[0].name).toBe('Lot 7')
    expect(shapes[0].ring).toHaveLength(4)
    expect(shapes[0].ring[0]).toEqual({ lat: LAT, lon: LON })
    expect(warnings).toEqual(['1 hole in polygons left out'])
  })

  it('a closed path is a shape; an open one is left out', () => {
    const { shapes, warnings } = readKml(kml(path('Drawn', square(LON, LAT, D)) + path('Street', [[LON, LAT], [LON + D, LAT]])))
    expect(shapes.map((s) => s.name)).toEqual(['Drawn'])
    expect(warnings).toEqual(['1 open path left out (not closed)'])
  })

  it('a KMZ is read through its doc.kml; what is not a KML or a zip throws', () => {
    const text = kml(polygon('Lot 7', square(LON, LAT, D)))
    const zip = zipSync({ 'doc.kml': new TextEncoder().encode(text), 'files/photo.jpg': new Uint8Array([1, 2]) })
    expect(readKmz(zip).shapes).toHaveLength(1)
    expect(() => readKml('<html></html>')).toThrow(KML_UNREADABLE)
    expect(() => readKmz(new Uint8Array([1, 2, 3]))).toThrow(KMZ_UNREADABLE)
    expect(() => readKmz(zipSync({ 'a.txt': new Uint8Array([1]) }))).toThrow(KMZ_UNREADABLE)
  })
})

describe('placeGeoShapes', () => {
  it('the middle of the shapes is the georeference, north up; the area is the Earth’s', () => {
    const { shapes } = readKml(kml(polygon('Lot 7', square(LON, LAT, D))))
    const { candidates, geo } = placeGeoShapes(shapes)
    expect(geo!.lat).toBeCloseTo(LAT + D / 2, 9)
    expect(geo!.lon).toBeCloseTo(LON + D / 2, 9)
    expect(geo!.north).toBe(0)
    const g = degree(LAT + D / 2)
    const truth = g.lat * D * g.lon * D
    expect(Math.abs(candidates[0].area - truth) / truth).toBeLessThan(1e-4)
    // its corners are where the georeference says
    const pts = contourToPolygon(candidates[0].contour)
    const sw = toPlan(geo!, { lat: LAT, lon: LON })
    expect(pts.some((q) => Math.hypot(q.x - sw.x, q.y - sw.y) < 1e-6)).toBe(true)
  })
})

describe('the import', () => {
  beforeEach(() => {
    useApp.getState().open(demoProject())
    useSiteImport.getState().cancel()
  })
  const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

  it('one polygon: imported at once, georeferenced, in one undo step', async () => {
    useSiteImport.getState().begin(await readSiteFile('lot.kml', bytes(kml(polygon('Lot 7', square(LON, LAT, D))))))
    expect(useSiteImport.getState().pending).toBeNull()
    const p = useApp.getState().project
    expect(p.site.source).toBe('lot.kml')
    expect(p.site.geo!.lat).toBeCloseTo(LAT + D / 2, 9)
    expect(area(contourToPolygon(p.site.boundary!))).toBeGreaterThan(11000)
    useApp.getState().undo()
    expect(useApp.getState().project.site.geo).toBeUndefined()
  })

  it('several polygons: picked on the plan', async () => {
    const two = kml(polygon('Lot 7', square(LON, LAT, D)) + polygon('Lot 8', square(LON + 2 * D, LAT, D / 2)))
    useSiteImport.getState().begin(await readSiteFile('lots.kmz', zipSync({ 'doc.kml': new TextEncoder().encode(two) }).buffer as ArrayBuffer))
    const pending = useSiteImport.getState().pending!
    expect(pending.candidates.map((c) => c.name)).toEqual(['Lot 7', 'Lot 8'])
    useSiteImport.getState().pick(1)
    expect(useApp.getState().project.site.source).toBe('lots.kmz')
    expect(area(contourToPolygon(useApp.getState().project.site.boundary!))).toBeLessThan(4000)
  })
})
