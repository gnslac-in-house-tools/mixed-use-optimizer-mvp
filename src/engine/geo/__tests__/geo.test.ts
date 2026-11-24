// The plan on the Earth (Decision "Site files"): the local projection, the georeference's anchor and Place, and UTM.
import { describe, expect, it } from 'vitest'
import type { Geo } from '../../../model/schema.ts'
import { anchorGeo, normalizeDegrees, placedGeo, toLatLon, toPlan } from '../local.ts'
import { centralMeridian, fromUtm, toUtm, trueNorthOnGrid, zoneOf } from '../utm.ts'

const gdl: Geo = { lat: 20.6597, lon: -103.3496, north: 0 }

/** Great-circle distance in m (a sphere of the WGS 84 mean radius): an independent check, good to ~0.5 %. */
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371008.8
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

describe('local projection', () => {
  it('the origin is (0, 0), and a point goes to lat / lon and back to where it was', () => {
    expect(toPlan(gdl, gdl).x).toBeCloseTo(0, 9)
    expect(toPlan(gdl, gdl).y).toBeCloseTo(0, 9)
    for (const p of [{ x: 350, y: -120 }, { x: -800, y: 950 }, { x: 0, y: 2000 }]) {
      const q = toPlan(gdl, toLatLon(gdl, p))
      expect(q.x).toBeCloseTo(p.x, 6)
      expect(q.y).toBeCloseTo(p.y, 6)
    }
  })

  it('north 0: +y is north and +x is east; a kilometre is a kilometre', () => {
    const n = toLatLon(gdl, { x: 0, y: 1000 })
    const e = toLatLon(gdl, { x: 1000, y: 0 })
    expect(n.lat).toBeGreaterThan(gdl.lat)
    expect(n.lon).toBeCloseTo(gdl.lon, 9)
    expect(e.lon).toBeGreaterThan(gdl.lon)
    expect(haversine(gdl, n)).toBeCloseTo(1000, -1) // within 5 m: the sphere vs the ellipsoid
    expect(haversine(gdl, e)).toBeCloseTo(1000, -1)
  })

  it('north 90: true north lies along the plan’s −x', () => {
    const g = { ...gdl, north: 90 }
    const p = toPlan(g, { lat: gdl.lat + 0.001, lon: gdl.lon })
    expect(p.x).toBeLessThan(-100)
    expect(Math.abs(p.y)).toBeLessThan(1e-6)
  })

  it('anchorGeo puts a place at a plan point, whatever the north', () => {
    for (const north of [0, 30, -135]) {
      const g = anchorGeo(gdl, { x: 220, y: -340 }, north)
      const p = toPlan(g, gdl)
      expect(p.x).toBeCloseTo(220, 2)
      expect(p.y).toBeCloseTo(-340, 2)
      expect(g.north).toBe(north)
    }
  })

  it('placedGeo: the place under `about` moves by d, and the Earth turns round it', () => {
    const about = { x: 100, y: 50 }
    const under = toLatLon(gdl, about)
    const g = placedGeo(gdl, { x: 10, y: -5 }, 15, about)
    const p = toPlan(g, under)
    expect(p.x).toBeCloseTo(110, 2)
    expect(p.y).toBeCloseTo(45, 2)
    expect(g.north).toBe(15)
    expect(placedGeo({ ...gdl, north: 170 }, { x: 0, y: 0 }, 20, about).north).toBe(-170)
  })

  it('normalizeDegrees keeps (−180, 180]', () => {
    expect(normalizeDegrees(190)).toBe(-170)
    expect(normalizeDegrees(-180)).toBe(180)
    expect(normalizeDegrees(540)).toBe(180)
  })
})

describe('UTM', () => {
  it('the equator on a zone’s central meridian is (500 000, 0)', () => {
    const u = toUtm({ lat: 0, lon: centralMeridian(14) }, 14)
    expect(u.x).toBeCloseTo(500000, 3)
    expect(u.y).toBeCloseTo(0, 3)
    expect(zoneOf(-103.35)).toBe(13)
    expect(zoneOf(-99.13)).toBe(14)
  })

  it('there and back, north and south, under a millimetre', () => {
    for (const ll of [{ lat: 20.6597, lon: -103.3496 }, { lat: -33.4489, lon: -70.6693 }, { lat: 51.5, lon: -0.12 }, { lat: 64.1, lon: -21.9 }]) {
      const u = toUtm(ll)
      expect(u.south).toBe(ll.lat < 0)
      const off = toPlan({ ...ll, north: 0 }, fromUtm(u))
      expect(Math.hypot(off.x, off.y)).toBeLessThan(1e-3)
    }
  })

  it('on the central meridian the scale is k0 = 0.9996', () => {
    const a = toUtm({ lat: 20, lon: -99 }, 14)
    const b = toUtm({ lat: 20.01, lon: -99 }, 14)
    expect(a.x).toBeCloseTo(500000, 6)
    const grid = b.y - a.y
    // the meridian arc between them, from the local projection's radius (good to 1e-6 over 1 km)
    const ground = toPlan({ lat: 20, lon: -99, north: 0 }, { lat: 20.01, lon: -99 }).y
    expect(grid / ground).toBeCloseTo(0.9996, 5)
  })

  it('true north on the grid: none on the central meridian, leaning west east of it in the north', () => {
    expect(trueNorthOnGrid(toUtm({ lat: 20, lon: -99 }, 14))).toBeCloseTo(0, 6)
    const east = trueNorthOnGrid(toUtm({ lat: 20, lon: -97 }, 14))
    expect(east).toBeGreaterThan(0)
    // the convergence's formula, atan(tan(Δλ) sin φ)
    expect(east).toBeCloseTo((Math.atan(Math.tan((2 * Math.PI) / 180) * Math.sin((20 * Math.PI) / 180)) * 180) / Math.PI, 2)
    expect(trueNorthOnGrid(toUtm({ lat: -20, lon: -97 }, 14))).toBeLessThan(0)
  })
})
