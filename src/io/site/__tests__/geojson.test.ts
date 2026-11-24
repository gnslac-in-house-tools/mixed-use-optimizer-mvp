// A site from GeoJSON and from a zipped Shapefile (Phase 5.6): read through the same path as KML; a UTM `crs` and a
// UTM .prj are turned to lat / lon; projected coordinates without one are refused.
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { toPlan } from '../../../engine/geo/local.ts'
import { toUtm } from '../../../engine/geo/utm.ts'
import { GEOJSON_UNREADABLE, NOT_LON_LAT, readGeoJson, readShapefile, SHAPEFILE_UNREADABLE } from '../geojson.ts'
import { placeGeoShapes } from '../place.ts'
import { isSiteFile, readSiteFile } from '../siteFile.ts'

const LAT = 20.6597
const LON = -103.3496
const D = 0.001
const square = (lon: number, lat: number, d: number) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]

describe('readGeoJson', () => {
  it('features’ polygons and multipolygons, named by their properties; holes and open lines left out', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { NOMBRE: 'Predio 12' }, geometry: { type: 'Polygon', coordinates: [square(LON, LAT, D), square(LON + D / 4, LAT + D / 4, D / 4)] } },
        { type: 'Feature', id: 'lots', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[square(LON + 2 * D, LAT, D)], [square(LON + 4 * D, LAT, D)]] } },
        { type: 'Feature', properties: { name: 'Street' }, geometry: { type: 'LineString', coordinates: [[LON, LAT], [LON + D, LAT]] } },
      ],
    }
    const { shapes, warnings } = readGeoJson(JSON.stringify(fc))
    expect(shapes.map((s) => s.name)).toEqual(['Predio 12', 'lots 1', 'lots 2'])
    expect(shapes[0].ring).toHaveLength(4)
    expect(warnings).toEqual(['1 hole in polygons left out', '1 open line left out (not closed)'])
  })

  it('a bare geometry, and a closed line, are shapes too', () => {
    expect(readGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [square(LON, LAT, D)] })).shapes).toHaveLength(1)
    expect(readGeoJson(JSON.stringify({ type: 'LineString', coordinates: square(LON, LAT, D) })).shapes).toHaveLength(1)
  })

  it('an older file in a UTM zone (its crs) is turned to lat / lon', () => {
    const u = toUtm({ lat: LAT, lon: LON }, 13)
    const ring = [[u.x, u.y], [u.x + 100, u.y], [u.x + 100, u.y + 80], [u.x, u.y + 80], [u.x, u.y]]
    const fc = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32613' } }, features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] }
    const { shapes } = readGeoJson(JSON.stringify(fc))
    expect(shapes[0].ring[0].lat).toBeCloseTo(LAT, 7)
    expect(shapes[0].ring[0].lon).toBeCloseTo(LON, 7)
    const { candidates } = placeGeoShapes(shapes)
    expect(Math.abs(candidates[0].area / 8000 - 1)).toBeLessThan(0.002) // UTM's scale near the zone's edge
  })

  it('projected coordinates without a crs, or not JSON, are refused', () => {
    expect(() => readGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [[[670000, 2285000], [670100, 2285000], [670100, 2285100], [670000, 2285000]]] }))).toThrow(NOT_LON_LAT)
    expect(() => readGeoJson('nope')).toThrow(GEOJSON_UNREADABLE)
  })
})

// ---- a Shapefile, byte by byte: one polygon (type 5), its outer ring clockwise as the format asks ----

function shp(ring: number[][]): { shp: Uint8Array; shx: Uint8Array } {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  const content = 4 + 32 + 4 + 4 + 4 + 16 * ring.length
  const total = 100 + 8 + content
  const b = new DataView(new ArrayBuffer(total))
  b.setInt32(0, 9994, false)
  b.setInt32(24, total / 2, false)
  b.setInt32(28, 1000, true)
  b.setInt32(32, 5, true)
  box.forEach((v, i) => b.setFloat64(36 + 8 * i, v, true))
  b.setInt32(100, 1, false)
  b.setInt32(104, content / 2, false)
  let o = 108
  b.setInt32(o, 5, true)
  box.forEach((v, i) => b.setFloat64(o + 4 + 8 * i, v, true))
  o += 36
  b.setInt32(o, 1, true)
  b.setInt32(o + 4, ring.length, true)
  b.setInt32(o + 8, 0, true)
  o += 12
  ring.forEach(([x, y], i) => {
    b.setFloat64(o + 16 * i, x, true)
    b.setFloat64(o + 16 * i + 8, y, true)
  })
  const x = new DataView(new ArrayBuffer(108))
  for (let i = 0; i < 100; i++) x.setUint8(i, b.getUint8(i))
  x.setInt32(24, 54, false)
  x.setInt32(100, 50, false)
  x.setInt32(104, content / 2, false)
  return { shp: new Uint8Array(b.buffer), shx: new Uint8Array(x.buffer) }
}

const WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
const UTM13N =
  'PROJCS["WGS_1984_UTM_Zone_13N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-105.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'

const zipOf = (ring: number[][], prj: string) => {
  const { shp: s, shx } = shp(ring)
  return zipSync({ 'lot.shp': s, 'lot.shx': shx, 'lot.prj': new TextEncoder().encode(prj) })
}
// clockwise: up the west side first
const cw = (x: number, y: number, w: number, h: number) => [[x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]]

describe('readShapefile', () => {
  it('a zipped Shapefile in WGS 84', async () => {
    const { shapes } = await readShapefile(zipOf(cw(LON, LAT, D, D), WGS84))
    expect(shapes).toHaveLength(1)
    expect(shapes[0].ring).toHaveLength(4)
    expect(shapes[0].ring.some((q) => Math.abs(q.lat - LAT) < 1e-9 && Math.abs(q.lon - LON) < 1e-9)).toBe(true)
  })

  it('one in UTM is projected to lat / lon from its .prj', async () => {
    const u = toUtm({ lat: LAT, lon: LON }, 13)
    const { shapes } = await readShapefile(zipOf(cw(u.x, u.y, 100, 80), UTM13N))
    const sw = shapes[0].ring.reduce((a, q) => (q.lat + q.lon < a.lat + a.lon ? q : a))
    const off = toPlan({ lat: LAT, lon: LON, north: 0 }, sw)
    expect(Math.hypot(off.x, off.y)).toBeLessThan(0.01)
  })

  it('not a zipped Shapefile: refused', async () => {
    await expect(readShapefile(zipSync({ 'a.txt': new Uint8Array([1]) }))).rejects.toThrow(SHAPEFILE_UNREADABLE)
  })

  it('.geojson, .json and .zip are site files', async () => {
    expect(['a.geojson', 'b.json', 'c.zip'].every(isSiteFile)).toBe(true)
    const f = await readSiteFile('lot.zip', zipOf(cw(LON, LAT, D, D), WGS84).buffer as ArrayBuffer)
    expect(f.kind).toBe('geo')
  })
})
