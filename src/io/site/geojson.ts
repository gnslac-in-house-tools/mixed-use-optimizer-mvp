// A site from GeoJSON and from a Shapefile (Phase 5.6, Decision "Site files"), through the same path as KML: each
// feature's polygons (their outer ring; holes are left out, with a warning) and closed lines are shapes in lat / lon,
// named by the feature's name (or id). GeoJSON is longitude / latitude on WGS 84 (RFC 7946); an older file that names
// a UTM zone as its `crs` (EPSG:326xx north, 327xx south) is turned to lat / lon. A Shapefile comes zipped (.shp, .dbf,
// .prj…) and is read with shpjs (MIT), which projects it to WGS 84 from its .prj with proj4; it is loaded only when
// one is imported.
import type { LatLon } from '../../engine/geo/local.ts'
import { fromUtm } from '../../engine/geo/utm.ts'
import type { GeoShape } from './place.ts'

export const GEOJSON_UNREADABLE = 'This file could not be read as a GeoJSON'
export const NOT_LON_LAT = 'Its coordinates are not longitude / latitude: export it in WGS 84 (EPSG:4326)'
export const SHAPEFILE_UNREADABLE = 'This file could not be read as a zipped Shapefile (.shp with its .dbf and .prj)'

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** A position [x, y, …] to lat / lon, through the file's UTM zone when it names one. */
type ToLatLon = (xy: number[]) => LatLon | null

function crsOf(root: Json): ToLatLon | null {
  const name = isObject(root.crs) && isObject(root.crs.properties) ? String(root.crs.properties.name ?? '') : ''
  const utm = /EPSG:{1,2}(32[67])(\d\d)\b/i.exec(name)
  if (utm) {
    const zone = Number(utm[2])
    const south = utm[1] === '327'
    if (zone >= 1 && zone <= 60) return ([x, y]) => (Number.isFinite(x) && Number.isFinite(y) ? fromUtm({ zone, south, x, y }) : null)
  }
  return null
}

const lonLat: ToLatLon = ([lon, lat]) => {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(NOT_LON_LAT)
  return { lat, lon }
}

/** A ring of positions to points, the closing one dropped; `closed`: was its last point its first? */
function ringOf(coords: unknown, to: ToLatLon): { ring: LatLon[]; closed: boolean } {
  const pts: LatLon[] = []
  const list = Array.isArray(coords) ? coords : []
  for (const c of list) {
    const q = Array.isArray(c) ? to(c as number[]) : null
    if (q) pts.push(q)
  }
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const closed = pts.length > 3 && Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12
  if (pts.length > 1 && Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12) pts.pop()
  return { ring: pts, closed }
}

const NAME_KEYS = ['name', 'Name', 'NAME', 'nombre', 'Nombre', 'NOMBRE', 'id', 'ID', 'clave', 'CLAVE']

/** Shapes of a GeoJSON object (a FeatureCollection, a Feature, a geometry, or a list of them: shpjs's layers). */
export function shapesFromGeoJson(root: unknown): { shapes: GeoShape[]; warnings: string[] } {
  const shapes: GeoShape[] = []
  let holes = 0
  let open = 0
  let k = 0

  const geometry = (g: unknown, name: string, to: ToLatLon) => {
    if (!isObject(g)) return
    const add = (ring: LatLon[], suffix = '') => ring.length >= 3 && shapes.push({ name: name + suffix, ring })
    switch (g.type) {
      case 'Polygon': {
        const rings = Array.isArray(g.coordinates) ? g.coordinates : []
        holes += Math.max(0, rings.length - 1)
        add(ringOf(rings[0], to).ring)
        break
      }
      case 'MultiPolygon': {
        const polys = Array.isArray(g.coordinates) ? g.coordinates : []
        polys.forEach((rings, j) => {
          const list = Array.isArray(rings) ? rings : []
          holes += Math.max(0, list.length - 1)
          add(ringOf(list[0], to).ring, polys.length > 1 ? ` ${j + 1}` : '')
        })
        break
      }
      case 'LineString':
      case 'MultiLineString': {
        const lines = g.type === 'LineString' ? [g.coordinates] : Array.isArray(g.coordinates) ? g.coordinates : []
        for (const l of lines) {
          const { ring, closed } = ringOf(l, to)
          if (closed) add(ring)
          else open++
        }
        break
      }
      case 'GeometryCollection':
        for (const x of Array.isArray(g.geometries) ? g.geometries : []) geometry(x, name, to)
        break
      default:
        break
    }
  }

  const feature = (f: Json, to: ToLatLon) => {
    k++
    const props = isObject(f.properties) ? f.properties : {}
    const key = NAME_KEYS.find((n) => props[n] !== undefined && props[n] !== null && String(props[n]).trim())
    const name = key ? String(props[key]).trim() : f.id !== undefined ? String(f.id) : `Shape ${k}`
    geometry(f.geometry, name, to)
  }

  const visit = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(visit)
    if (!isObject(x)) return
    const to = crsOf(x) ?? lonLat
    if (x.type === 'FeatureCollection') {
      for (const f of Array.isArray(x.features) ? x.features : []) if (isObject(f)) feature(f, to)
    } else if (x.type === 'Feature') feature(x, to)
    else geometry(x, `Shape ${++k}`, to)
  }
  visit(root)

  const warnings: string[] = []
  if (holes) warnings.push(`${holes} hole${holes === 1 ? '' : 's'} in polygons left out`)
  if (open) warnings.push(`${open} open line${open === 1 ? '' : 's'} left out (not closed)`)
  return { shapes, warnings }
}

export function readGeoJson(text: string): { shapes: GeoShape[]; warnings: string[] } {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new Error(GEOJSON_UNREADABLE)
  }
  if (!isObject(root) && !Array.isArray(root)) throw new Error(GEOJSON_UNREADABLE)
  return shapesFromGeoJson(root)
}

/** A zipped Shapefile, projected to WGS 84 from its .prj (none: taken as longitude / latitude). */
export async function readShapefile(bytes: Uint8Array): Promise<{ shapes: GeoShape[]; warnings: string[] }> {
  const { parseZip } = await import('shpjs')
  let root: unknown
  try {
    root = await parseZip(bytes)
  } catch {
    throw new Error(SHAPEFILE_UNREADABLE)
  }
  return shapesFromGeoJson(root)
}
