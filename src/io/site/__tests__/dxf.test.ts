// A site from a DXF (Phase 5.2): the closed shapes, their arcs, loose lines chained, the units and UTM; and the
// import's flow, from the file to the boundary in one undo step.
import { beforeEach, describe, expect, it } from 'vitest'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { area, signedArea } from '../../../engine/geom/polygon.ts'
import { toLatLon } from '../../../engine/geo/local.ts'
import { fromUtm, toUtm } from '../../../engine/geo/utm.ts'
import { useApp } from '../../../state/store.ts'
import { demoProject } from '../../../state/demo.ts'
import { useSiteImport, type SurveyImport } from '../../../views/plan/site/importState.ts'
import { DXF_UNREADABLE, readDxf } from '../dxf.ts'
import { looksLikeUtm, placeDrawing } from '../place.ts'
import { isSiteFile, readSiteFile } from '../siteFile.ts'

/** An ASCII DXF: the header's $INSUNITS (absent: none) and the entities, each as its group codes and values. */
function dxf(entities: (string | number)[][], insunits?: number): string {
  const lines: (string | number)[] = []
  if (insunits !== undefined) lines.push(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, insunits, 0, 'ENDSEC')
  lines.push(0, 'SECTION', 2, 'ENTITIES')
  for (const e of entities) lines.push(...e)
  lines.push(0, 'ENDSEC', 0, 'EOF')
  return lines.join('\n') + '\n'
}

/** A closed LWPOLYLINE on `layer`; a vertex's third number is its bulge. */
function lwpolyline(layer: string, vs: [number, number, number?][], closed = true): (string | number)[] {
  const out: (string | number)[] = [0, 'LWPOLYLINE', 8, layer, 90, vs.length, 70, closed ? 1 : 0]
  for (const [x, y, b] of vs) {
    out.push(10, x, 20, y)
    if (b) out.push(42, b)
  }
  return out
}

const line = (layer: string, a: [number, number], b: [number, number]) => [0, 'LINE', 8, layer, 10, a[0], 20, a[1], 30, 0, 11, b[0], 21, b[1], 31, 0]
const arc = (layer: string, c: [number, number], r: number, from: number, to: number) => [0, 'ARC', 8, layer, 10, c[0], 20, c[1], 30, 0, 40, r, 50, from, 51, to]

const areaOf = (c: Parameters<typeof contourToPolygon>[0]) => area(contourToPolygon(c))

describe('readDxf', () => {
  it('a closed polyline is a shape, in the drawing’s units, with the layer it is on', () => {
    const d = readDxf(dxf([lwpolyline('BOUNDARY', [[0, 0], [100, 0], [100, 60], [0, 60]])], 6))
    expect(d.units).toBe('m')
    expect(d.shapes).toHaveLength(1)
    expect(d.shapes[0].layer).toBe('BOUNDARY')
    expect(areaOf(d.shapes[0].contour)).toBeCloseTo(6000, 6)
    expect(signedArea(d.shapes[0].contour.vertices)).toBeGreaterThan(0)
  })

  it('a bulge is an arc edge: a half circle out of the square’s top', () => {
    // bulge 1 from (10, 10) to (0, 10): a counter-clockwise half circle, outside the square
    const d = readDxf(dxf([lwpolyline('0', [[0, 0], [10, 0], [10, 10, 1], [0, 10]])]))
    expect(d.units).toBeNull()
    const c = d.shapes[0].contour
    expect(Object.values(c.arcs ?? {})).toHaveLength(1)
    expect(areaOf(c)).toBeCloseTo(100 + (Math.PI * 25) / 2, 1)
  })

  it('loose lines and an arc are chained into one closed shape; an open line is left out with a warning', () => {
    const d = readDxf(
      dxf([
        line('L', [0, 0], [7, 0]),
        arc('L', [7, 3], 3, 270, 360), // (7, 0) → (10, 3): a fillet
        line('L', [10, 10], [10, 3]), // drawn backwards
        line('L', [10, 10], [0, 10]),
        line('L', [0, 10], [0, 0]),
        line('X', [50, 50], [60, 60]),
      ]),
    )
    expect(d.shapes).toHaveLength(1)
    const c = d.shapes[0].contour
    expect(c.vertices).toHaveLength(4)
    expect(c.vertices.some((v) => Math.abs(v.r - 3) < 1e-6)).toBe(true)
    expect(d.warnings.some((w) => w.includes('open line'))).toBe(true)
  })

  it('circles are shapes; blocks are left out with a warning; not a DXF throws', () => {
    const d = readDxf(dxf([[0, 'CIRCLE', 8, '0', 10, 5, 20, 5, 30, 0, 40, 5], [0, 'INSERT', 8, '0', 2, 'TREE', 10, 0, 20, 0]]))
    expect(d.shapes).toHaveLength(1)
    expect(areaOf(d.shapes[0].contour)).toBeCloseTo(Math.PI * 25, 1)
    expect(d.warnings.some((w) => w.includes('blocks'))).toBe(true)
    expect(() => readDxf('hello')).toThrow(DXF_UNREADABLE)
  })
})

describe('placeDrawing', () => {
  const mm = readDxf(dxf([lwpolyline('A', [[0, 0], [100000, 0], [100000, 50000], [0, 50000]]), lwpolyline('B', [[10000, 10000], [20000, 10000], [20000, 20000], [10000, 20000]])], 4))

  it('scaled to metres, the middle of its shapes at the origin, biggest first', () => {
    const { candidates, geo } = placeDrawing(mm, { units: 'mm', utm: null })
    expect(geo).toBeNull()
    expect(candidates.map((c) => c.name)).toEqual(['A', 'B'])
    expect(candidates[0].area).toBeCloseTo(5000, 6)
    const xs = contourToPolygon(candidates[0].contour).map((q) => q.x)
    expect(Math.min(...xs)).toBeCloseTo(-50, 6)
    expect(Math.max(...xs)).toBeCloseTo(50, 6)
  })

  it('in UTM: georeferenced, its middle’s lat / lon at the origin and true north from the grid', () => {
    const ll = { lat: 20.6597, lon: -103.3496 }
    const u = toUtm(ll, 13)
    const d = readDxf(dxf([lwpolyline('LOT', [[u.x - 40, u.y - 30], [u.x + 40, u.y - 30], [u.x + 40, u.y + 30], [u.x - 40, u.y + 30]])], 6))
    expect(looksLikeUtm(d, 'm')).toBe(true)
    expect(looksLikeUtm(mm, 'mm')).toBe(false)
    const { candidates, geo } = placeDrawing(d, { units: 'm', utm: { zone: 13, south: false } })
    expect(geo!.lat).toBeCloseTo(ll.lat, 6)
    expect(geo!.lon).toBeCloseTo(ll.lon, 6)
    // east of zone 13's central meridian (−105°), in the north: true north leans west of the grid's
    expect(geo!.north).toBeGreaterThan(0)
    // a corner's lat / lon through the georeference is its UTM point's (to a few cm: the grid's scale)
    const corner = contourToPolygon(candidates[0].contour).find((q) => q.x > 0 && q.y > 0)!
    const there = toLatLon(geo!, corner)
    const truth = fromUtm({ zone: 13, south: false, x: u.x + 40, y: u.y + 30 })
    expect(Math.abs(there.lat - truth.lat) * 111000).toBeLessThan(0.1)
    expect(Math.abs(there.lon - truth.lon) * 104000).toBeLessThan(0.1)
  })
})

describe('the import', () => {
  beforeEach(() => {
    useApp.getState().open(demoProject())
    useSiteImport.getState().cancel()
  })

  it('a .dxf is a site file; another extension is refused', async () => {
    expect(isSiteFile('Parcel.DXF')).toBe(true)
    expect(isSiteFile('model.gft')).toBe(false)
    await expect(readSiteFile('a.pdf', new ArrayBuffer(0))).rejects.toThrow(/does not read \.pdf/)
  })

  it('a drawing is surveyed: its closed shapes are the candidates, one is picked on the plan, Import makes one undo step', async () => {
    const text = dxf([lwpolyline('A', [[0, 0], [100, 0], [100, 50], [0, 50]]), lwpolyline('B', [[10, 10], [20, 10], [20, 20], [10, 20]])], 6)
    const file = await readSiteFile('lot.dxf', new TextEncoder().encode(text).buffer as ArrayBuffer)
    const before = useApp.getState().project.site.boundary
    const imp = useSiteImport.getState()
    const pending = () => useSiteImport.getState().pending as SurveyImport
    imp.begin(file)
    // no layer named as a boundary: those with closed shapes are
    expect(pending().choice.kinds).toEqual({ A: 'boundary', B: 'boundary' })
    expect(pending().candidates).toHaveLength(2)
    imp.setUnits('cm')
    expect(pending().candidates[0].area).toBeCloseTo(0.5, 6)
    imp.setUnits('m')
    imp.pick(1)
    expect(pending().picked).toBe(1)
    expect(useApp.getState().project.site.boundary).toEqual(before)
    imp.commit()
    expect(useSiteImport.getState().pending).toBeNull()
    const p = useApp.getState().project
    expect(p.site.source).toBe('lot.dxf')
    expect(areaOf(p.site.boundary!)).toBeCloseTo(100, 6)
    expect(p.site.frame).toMatchObject({ units: 'm', layers: { A: 'boundary', B: 'boundary' } })
    useApp.getState().undo()
    expect(useApp.getState().project.site.boundary).toEqual(before)
  })
})
