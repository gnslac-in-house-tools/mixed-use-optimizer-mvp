// A site from Google Earth's files (Phase 5.3, Decision "Site files"): KML, and KMZ (a zip with a KML inside). Each
// placemark's polygons (their outer ring; holes are left out, with a warning) and its closed paths are shapes, in
// lat / lon, named by the placemark. Read with the browser's DOMParser and fflate (MIT) for the zip.
import { unzipSync } from 'fflate'
import type { LatLon } from '../../engine/geo/local.ts'
import type { GeoShape } from './place.ts'

export const KML_UNREADABLE = 'This file could not be read as a KML'
export const KMZ_UNREADABLE = 'This file could not be read as a KMZ (a zip with a .kml inside)'

/** "lon,lat[,alt] lon,lat…" → points, the closing one dropped. */
function ring(text: string): LatLon[] {
  const pts: LatLon[] = []
  for (const tuple of text.trim().split(/\s+/)) {
    const [lon, lat] = tuple.split(',').map(Number)
    if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pts.push({ lat, lon })
  }
  const [a, b] = [pts[0], pts[pts.length - 1]]
  if (pts.length > 1 && Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12) pts.pop()
  return pts
}

const byName = (root: Element | Document, name: string) => [...root.getElementsByTagNameNS('*', name)]
const textOf = (e: Element | undefined) => e?.textContent ?? ''

export function readKml(text: string): { shapes: GeoShape[]; warnings: string[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (byName(doc, 'parsererror').length || doc.documentElement?.localName !== 'kml') throw new Error(KML_UNREADABLE)
  const shapes: GeoShape[] = []
  let holes = 0
  let open = 0
  const placemarks = byName(doc, 'Placemark')
  placemarks.forEach((pm, k) => {
    const name = textOf(byName(pm, 'name')[0]).trim() || `Shape ${k + 1}`
    const polygons = byName(pm, 'Polygon')
    polygons.forEach((poly, j) => {
      const outer = byName(poly, 'outerBoundaryIs')[0]
      const r = ring(textOf(outer && byName(outer, 'coordinates')[0]))
      holes += byName(poly, 'innerBoundaryIs').length
      if (r.length >= 3) shapes.push({ name: polygons.length > 1 ? `${name} ${j + 1}` : name, ring: r })
    })
    // a path drawn round the parcel and closed (its last point on its first) is a shape too
    for (const ls of byName(pm, 'LineString')) {
      const raw = textOf(byName(ls, 'coordinates')[0]).trim().split(/\s+/)
      const closed = raw.length > 3 && raw[0] === raw[raw.length - 1]
      const r = ring(raw.join(' '))
      if (closed && r.length >= 3) shapes.push({ name, ring: r })
      else open++
    }
  })
  const warnings: string[] = []
  if (holes) warnings.push(`${holes} hole${holes === 1 ? '' : 's'} in polygons left out`)
  if (open) warnings.push(`${open} open path${open === 1 ? '' : 's'} left out (not closed)`)
  return { shapes, warnings }
}

/** A KMZ: its doc.kml, or the first .kml in it. */
export function readKmz(bytes: Uint8Array): { shapes: GeoShape[]; warnings: string[] } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error(KMZ_UNREADABLE)
  }
  const names = Object.keys(files).filter((n) => n.toLowerCase().endsWith('.kml'))
  const main = names.find((n) => n.toLowerCase() === 'doc.kml') ?? names[0]
  if (!main) throw new Error(KMZ_UNREADABLE)
  return readKml(new TextDecoder().decode(files[main]))
}
