// UTM on WGS 84 (Decision "Site files"): a DXF drawn in real coordinates gives easting and northing in metres of a
// zone; these turn them into latitude and longitude and back (Snyder, *Map Projections: A Working Manual*, USGS 1987,
// pp. 61–64: transverse Mercator on the ellipsoid; under a millimetre inside a zone). Pure.
import type { LatLon } from './local.ts'

const A = 6378137
const E2 = 6.69437999014e-3
const EP2 = E2 / (1 - E2)
const K0 = 0.9996
const FALSE_EAST = 500000
const FALSE_NORTH_SOUTH = 10000000
const RAD = Math.PI / 180

export interface Utm {
  zone: number // 1 … 60
  south: boolean
  x: number // easting, m
  y: number // northing, m
}

/** A zone's central meridian, degrees. */
export const centralMeridian = (zone: number) => -183 + 6 * zone

/** The zone a longitude falls in (no Norway or Svalbard exceptions). */
export const zoneOf = (lon: number) => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1))

/** Is it a zone number GFit takes? */
export const isZone = (z: number) => Number.isInteger(z) && z >= 1 && z <= 60

/** Length of the meridian from the equator to latitude φ (radians). */
function meridianArc(phi: number): number {
  const e4 = E2 * E2
  const e6 = e4 * E2
  return (
    A *
    ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  )
}

/** Latitude and longitude to UTM, in `zone` (default: the one the point falls in). */
export function toUtm(ll: LatLon, zone = zoneOf(ll.lon)): Utm {
  const phi = ll.lat * RAD
  const lam = (ll.lon - centralMeridian(zone)) * RAD
  const s = Math.sin(phi)
  const c = Math.cos(phi)
  const t = Math.tan(phi)
  const n = A / Math.sqrt(1 - E2 * s * s)
  const T = t * t
  const C = EP2 * c * c
  const a = c * lam
  const m = meridianArc(phi)
  const x =
    K0 * n * (a + ((1 - T + C) * a ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5) / 120) + FALSE_EAST
  let y =
    K0 *
    (m +
      n * t * ((a * a) / 2 + ((5 - T + 9 * C + 4 * C * C) * a ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6) / 720))
  const south = ll.lat < 0
  if (south) y += FALSE_NORTH_SOUTH
  return { zone, south, x, y }
}

/** UTM to latitude and longitude. */
export function fromUtm(u: Utm): LatLon {
  const x = u.x - FALSE_EAST
  const y = u.south ? u.y - FALSE_NORTH_SOUTH : u.y
  const m = y / K0
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const s = Math.sin(phi1)
  const c = Math.cos(phi1)
  const t = Math.tan(phi1)
  const C1 = EP2 * c * c
  const T1 = t * t
  const n1 = A / Math.sqrt(1 - E2 * s * s)
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5
  const d = x / (n1 * K0)
  const lat =
    phi1 -
    ((n1 * t) / r1) *
      ((d * d) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * d ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * d ** 6) / 720)
  const lon = (d - ((1 + 2 * T1 + C1) * d ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * d ** 5) / 120) / c
  return { lat: lat / RAD, lon: centralMeridian(u.zone) + lon / RAD }
}

/**
 * Where true north points at a UTM point, as degrees counter-clockwise from the grid's +y (the grid convergence's
 * sign turned round): east of the central meridian in the north, true north leans west of grid north (positive).
 * Measured, not by formula: a step north on the Earth, projected.
 */
export function trueNorthOnGrid(u: Utm): number {
  const ll = fromUtm(u)
  const step = toUtm({ lat: ll.lat + 1e-4, lon: ll.lon }, u.zone)
  const here = toUtm(ll, u.zone)
  const dy = step.y - here.y + (step.south !== here.south ? (here.south ? -FALSE_NORTH_SOUTH : FALSE_NORTH_SOUTH) : 0)
  return Math.atan2(-(step.x - here.x), dy) / RAD
}
