// The plan on the Earth (Decision "Site files"): a site's georeference puts the plan's origin (0, 0) at a latitude and
// longitude (WGS 84) and says where true north points. Plan points go to lat / lon and back through a local
// projection around the origin: sinusoidal on the ellipsoid (its radii at the origin's latitude for north–south,
// each point's own parallel for east–west), so areas stay true and the error over a parcel is millimetres.
//   plan → east / north: turned by −north;  east / north → plan: turned by +north
// Pure: the importers (io/), the map (views/map/) and MCP use the same functions.
import type { Geo, Point, SiteMap } from '../../model/schema.ts'

export interface LatLon {
  lat: number
  lon: number
}

/** WGS 84. */
const A = 6378137
const E2 = 6.69437999014e-3
const RAD = Math.PI / 180

/** Metres per radian along a meridian (M) and along a parallel (N·cos φ) at latitude φ (degrees). */
function radii(lat: number): { meridian: number; parallel: number } {
  const s = Math.sin(lat * RAD)
  const w = 1 - E2 * s * s
  return { meridian: (A * (1 - E2)) / w ** 1.5, parallel: (A / Math.sqrt(w)) * Math.cos(lat * RAD) }
}

const turn = (p: Point, degrees: number): Point => {
  const c = Math.cos(degrees * RAD)
  const s = Math.sin(degrees * RAD)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Longitude in [−180, 180). */
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** East / north metres from the origin of a point at ll. */
function toEastNorth(origin: LatLon, ll: LatLon): Point {
  const { meridian } = radii(origin.lat)
  const { parallel } = radii(ll.lat)
  return { x: wrapLon(ll.lon - origin.lon) * RAD * parallel, y: (ll.lat - origin.lat) * RAD * meridian }
}

function fromEastNorth(origin: LatLon, en: Point): LatLon {
  const { meridian } = radii(origin.lat)
  const lat = origin.lat + en.y / meridian / RAD
  const { parallel } = radii(lat)
  return { lat, lon: wrapLon(origin.lon + (parallel > 1e-9 ? en.x / parallel / RAD : 0)) }
}

/** The plan point of a latitude and longitude. */
export function toPlan(geo: Geo, ll: LatLon): Point {
  return turn(toEastNorth(geo, ll), geo.north)
}

/** The latitude and longitude of a plan point. */
export function toLatLon(geo: Geo, p: Point): LatLon {
  return fromEastNorth(geo, turn(p, -geo.north))
}

/** The georeference that puts `ll` at plan point `at`, with true north `north` degrees from the plan's +y. */
export function anchorGeo(ll: LatLon, at: Point, north: number): Geo {
  const origin = fromEastNorth(ll, turn({ x: -at.x, y: -at.y }, -north))
  return { lat: origin.lat, lon: origin.lon, north }
}

/** The plan direction of true north, as degrees counter-clockwise from +x (90 when the plan's y is north). */
export const northAngle = (geo: Geo) => 90 + geo.north

/** Degrees in (−180, 180]. */
export function normalizeDegrees(a: number): number {
  const r = ((((a + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}

/** Where the map's image lies on the plan: its centre, its turn (degrees, counter-clockwise) and its size in m. */
export function mapOnPlan(geo: Geo, map: SiteMap): { center: Point; rotation: number; width: number; height: number } {
  return { center: toPlan(geo, map), rotation: geo.north, width: map.width, height: map.height }
}

/**
 * The georeference after the Earth under the plan moves by `d` (m, plan) and turns by `degrees` (counter-clockwise)
 * round plan point `about`: what *Place* does when it drags or turns the map under a DXF.
 */
export function placedGeo(geo: Geo, d: Point, degrees: number, about: Point): Geo {
  const ll = toLatLon(geo, about)
  return anchorGeo(ll, { x: about.x + d.x, y: about.y + d.y }, normalizeDegrees(geo.north + degrees))
}
