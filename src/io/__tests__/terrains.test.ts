// A terrain of the library (Decision "Home libraries"): a site without its rules, given back under a project's own; its
// .gfs read back as it was; its DXF read by GFit's own reader, on its layers, at its heights, in the frame's units and
// coordinates when the site came from a file; this browser's shelf.
import { beforeEach, describe, expect, it } from 'vitest'
import { contourToPolygon } from '../../engine/geom/contour.ts'
import { area } from '../../engine/geom/polygon.ts'
import type { Site } from '../../model/schema.ts'
import { sampleProject } from '../../state/sample.ts'
import { readDxf } from '../site/dxf.ts'
import { browserTerrains, DXF_LAYERS, readTerrainFile, siteOf, terrainDxf, terrainFileName, terrainOf, writeTerrainFile } from '../terrains.ts'

const site = (): Site => sampleProject().site

beforeEach(() => localStorage.clear())

describe('terrains', () => {
  it('a site as a terrain: all but its rules; back as a site under the project’s rules', () => {
    const s = site()
    const t = terrainOf(s, { id: 't1', name: 'Plot' })
    expect(t).toMatchObject({ format: 'gfit-terrain', formatVersion: 1, id: 't1', name: 'Plot', version: 1 })
    expect('rules' in t.site).toBe(false)
    const rules = { setback: 3, maxCoverage: 0.5 }
    expect(siteOf(t, rules)).toEqual({ ...s, rules })
  })

  it('a street of the site goes into a terrain and back with no group: its group is its project’s own (review E9)', () => {
    const s = site()
    const grouped: Site = { ...s, existingRoads: [{ id: 'e1', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], stretches: [{ left: 3, right: 3 }], group: 'grp-1', locked: true }] }
    const t = terrainOf(grouped, { id: 't1', name: 'Plot' })
    expect(t.site.existingRoads![0].group).toBeUndefined()
    expect(t.site.existingRoads![0].locked).toBe(true)
    // a terrain saved before that, with the group in it, comes into a project with none
    const old = { ...t, site: { ...t.site, existingRoads: grouped.existingRoads } }
    expect(siteOf(old, { setback: 3, maxCoverage: 0.5 }).existingRoads![0].group).toBeUndefined()
    expect(siteOf(old, { setback: 3, maxCoverage: 0.5 }).existingRoads![0].id).toBe('e1')
  })

  it('its .gfs read back as it was; what is not one says why', () => {
    const t = terrainOf(site(), { id: 't1', name: 'Plot', savedAt: 5 })
    expect(readTerrainFile(writeTerrainFile(t))).toEqual({ ok: true, terrain: t })
    expect(readTerrainFile('nope')).toEqual({ ok: false, error: 'it is not JSON' })
    expect(readTerrainFile('{"format":"gfit-block"}')).toEqual({ ok: false, error: 'it is not a GFit terrain' })
    expect(terrainFileName({ name: 'Quezaltepeque, El Salvador' })).toBe('quezaltepeque-el-salvador.gfs')
    expect(terrainFileName({ name: 'Plot' }, 'dxf')).toBe('plot.dxf')
  })

  it('its DXF: the boundary closed, the contours at their heights, the points, on GFIT- layers', () => {
    const s = site()
    const d = readDxf(terrainDxf({ site: s }))
    expect(d.units).toBe('m')
    const [shape] = d.shapes.filter((x) => x.layer === DXF_LAYERS.boundary)
    expect(area(contourToPolygon(shape.contour))).toBeCloseTo(area(contourToPolygon(s.boundary!)), 0)
    const contours = d.lines.filter((l) => l.layer === DXF_LAYERS.contours)
    expect(contours).toHaveLength(s.terrain!.contours.length)
    const c = s.terrain!.contours.findIndex((x) => x.z !== undefined)
    expect(contours[c].points[0].z).toBeCloseTo(s.terrain!.contours[c].z!, 4)
    expect(d.points.filter((p) => p.layer === DXF_LAYERS.points)).toHaveLength(s.terrain!.points.length)
  })

  it('its DXF is R12, which any CAD opens with no tables: POLYLINE with VERTEX and SEQEND, no LWPOLYLINE; a contour a 3D polyline', () => {
    const text = terrainDxf({ site: site() })
    const pairs = text.trim().split('\n').reduce<[string, string][]>((all, v, i, a) => (i % 2 ? all : [...all, [v.trim(), a[i + 1].trim()]]), [])
    const at = pairs.findIndex(([c, v]) => c === '9' && v === '$ACADVER')
    expect(pairs[at + 1]).toEqual(['1', 'AC1009'])
    const types = pairs.filter(([c]) => c === '0').map(([, v]) => v)
    expect(types).not.toContain('LWPOLYLINE')
    expect(types.filter((t) => t === 'POLYLINE')).toHaveLength(types.filter((t) => t === 'SEQEND').length)
    // each polyline says its vertices follow (66 1); a contour's flags have 8 (3D), the boundary's not
    const polylines = pairs.flatMap(([c, v], i) => (c === '0' && v === 'POLYLINE' ? [pairs.slice(i + 1, pairs.findIndex(([d], j) => j > i && d === '0'))] : []))
    expect(polylines.every((p) => p.some(([c, v]) => c === '66' && v === '1'))).toBe(true)
    const flags = (p: [string, string][]) => Number(p.find(([c]) => c === '70')![1])
    const layer = (p: [string, string][]) => p.find(([c]) => c === '8')![1]
    expect(polylines.filter((p) => layer(p) === DXF_LAYERS.boundary).map(flags)).toEqual([1])
    expect(polylines.filter((p) => layer(p) === DXF_LAYERS.contours).every((p) => (flags(p) & 8) === 8)).toBe(true)
  })

  it('its DXF’s contours at the heights GFit shows: the one given first, then the file’s, then counted', () => {
    const line = (y: number, west = false) => ({ points: west ? [{ x: 100, y }, { x: 0, y }] : [{ x: 0, y }, { x: 100, y }] })
    const heights = (s: Site) => readDxf(terrainDxf({ site: s })).lines.filter((l) => l.layer === DXF_LAYERS.contours).map((l) => l.points[0].z)
    // a file height the designer corrected: the corrected one
    const corrected: Site = { ...site(), terrain: { contours: [{ ...line(0), z: 100 }], points: [], given: [{ contour: 0, z: 102 }] } }
    expect(heights(corrected)).toEqual([102])
    // drawn flat, two neighbours given: the others counted on
    const flat: Site = {
      ...site(),
      terrain: { contours: [line(0), line(10), line(20, true), line(30), line(40, true)], points: [], given: [{ contour: 0, z: 100 }, { contour: 1, z: 101 }] },
    }
    expect(heights(flat)).toEqual([100, 101, 102, 103, 104])
  })

  it('a site from a file: its DXF in that file’s units and coordinates', () => {
    const s: Site = { ...site(), frame: { units: 'ft', origin: { x: 1000, y: 2000 } }, terrain: { contours: [{ points: [{ x: 0, y: 0 }, { x: 30.48, y: 0 }], z: 3.048 }], points: [] } }
    const d = readDxf(terrainDxf({ site: s }))
    expect(d.units).toBe('ft')
    const [line] = d.lines.filter((l) => l.layer === DXF_LAYERS.contours)
    // the file's point × its unit − the origin is the plan's again
    expect(line.points.map((p) => ({ x: p.x * 0.3048 - 1000, y: p.y * 0.3048 - 2000 }))).toEqual([
      { x: expect.closeTo(0, 6), y: expect.closeTo(0, 6) },
      { x: expect.closeTo(30.48, 6), y: expect.closeTo(0, 6) },
    ])
    expect(line.points[0].z).toBeCloseTo(10, 6)
  })

  it('this browser’s shelf: saved, saved over by id, removed', () => {
    const a = terrainOf(site(), { id: 'a', name: 'A' })
    expect(browserTerrains.save(a)).toBe(true)
    expect(browserTerrains.save({ ...a, version: 2 })).toBe(true)
    expect(browserTerrains.list().map((t) => [t.id, t.version])).toEqual([['a', 2]])
    browserTerrains.remove('a')
    expect(browserTerrains.list()).toEqual([])
  })
})
