// Where an imported file's shapes land on the plan (Decision "Site files"), pure. Every file is moved so the middle of
// its shapes sits at the plan's origin:
//   a drawing (DXF)   scaled from its units to metres. In local coordinates it brings no georeference (the designer
//                     places it once over the map); in UTM, the origin's lat / lon and true north come from its zone
//   a geolocated file (KML / KMZ; GeoJSON, Shapefile)   projected to local metres round the middle of its shapes,
//                     which becomes the georeference, north up
import type { Contour, Geo } from '../../model/schema.ts'
import { contourFromPolygon, contourToPolygon } from '../../engine/geom/contour.ts'
import { area, bounds } from '../../engine/geom/polygon.ts'
import { toPlan, type LatLon } from '../../engine/geo/local.ts'
import { fromUtm, trueNorthOnGrid } from '../../engine/geo/utm.ts'
import { contoursBounds, METRES, type DxfDrawing, type LengthUnit } from './dxf.ts'

/** A shape of a geolocated file: its outer ring (first point not repeated) and its name, if it has one. */
export interface GeoShape {
  name: string
  ring: LatLon[]
}

/** A shape the boundary can be, where it would land on the plan (m), and what to call it. */
export interface Candidate {
  name: string
  contour: Contour
  area: number
}

export interface Placed {
  candidates: Candidate[]
  /** The georeference the file brings; null: none (a DXF in local coordinates). */
  geo: Geo | null
}

/** How a drawing is read: its units, and its UTM zone when it is drawn in real coordinates. */
export interface DrawingSettings {
  units: LengthUnit
  utm: { zone: number; south: boolean } | null
}

const areaOf = (c: Contour) => area(contourToPolygon(c))

/** Biggest first: a parcel's boundary is usually the largest closed shape of its file. */
const bySize = (cs: Candidate[]) => cs.sort((a, b) => b.area - a.area)

function moved(c: Contour, k: number, dx: number, dy: number): Contour {
  return { ...c, vertices: c.vertices.map((v) => ({ x: v.x * k - dx, y: v.y * k - dy, r: v.r * k })) }
}

export function placeDrawing(d: DxfDrawing, s: DrawingSettings): Placed {
  const k = METRES[s.units]
  const b = contoursBounds(d.shapes.map((x) => x.contour))
  if (!b) return { candidates: [], geo: null }
  const mid = { x: ((b.minX + b.maxX) / 2) * k, y: ((b.minY + b.maxY) / 2) * k }
  const candidates = d.shapes.map((x) => {
    const contour = moved(x.contour, k, mid.x, mid.y)
    return { name: x.layer, contour, area: areaOf(contour) }
  })
  let geo: Geo | null = null
  if (s.utm) {
    const u = { ...s.utm, x: mid.x, y: mid.y }
    geo = { ...fromUtm(u), north: trueNorthOnGrid(u) }
  }
  return { candidates: bySize(candidates), geo }
}

/** Do the drawing's coordinates look like UTM (an easting of 100–900 km, a northing up to 10 000 km, in metres)? */
export function looksLikeUtm(d: DxfDrawing, units: LengthUnit): boolean {
  const b = contoursBounds(d.shapes.map((x) => x.contour))
  if (!b) return false
  const k = METRES[units]
  return b.minX * k > 100000 && b.maxX * k < 900000 && b.minY * k >= 0 && b.maxY * k <= 10000000 && (b.maxX - b.minX) * k < 50000
}

export function placeGeoShapes(shapes: GeoShape[]): Placed {
  const pts = shapes.flatMap((s) => s.ring)
  if (pts.length === 0) return { candidates: [], geo: null }
  const lat = pts.map((q) => q.lat)
  const lon = pts.map((q) => q.lon)
  const geo: Geo = { lat: (Math.min(...lat) + Math.max(...lat)) / 2, lon: (Math.min(...lon) + Math.max(...lon)) / 2, north: 0 }
  const candidates: Candidate[] = []
  for (const s of shapes) {
    if (s.ring.length < 3) continue
    const contour = contourFromPolygon(s.ring.map((q) => toPlan(geo, q)))
    const a = areaOf(contour)
    if (contour.vertices.length >= 3 && a > 1e-6) candidates.push({ name: s.name, contour, area: a })
  }
  return { candidates: bySize(candidates), geo }
}

/** The box round the candidates, for the camera. */
export const candidatesBounds = (cs: Candidate[]) => bounds(cs.flatMap((c) => contourToPolygon(c.contour)))
