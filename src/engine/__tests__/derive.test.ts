import { describe, expect, it } from 'vitest'
import type { Mass, Project } from '../../model/schema.ts'
import { contourFromPolygon } from '../geom/contour.ts'
import { derive } from '../derive.ts'

// A 300 × 200 m site (60,000 m²), setback 10 m, 20 m between buildings, coverage ≤ 60 %.
// Buildable area: 280 × 180 = 50,400 m², from (10,10) to (290,190).
function project(masses: Mass[], maxCoverage: number | null = 0.6): Project {
  return {
    version: 20,
    id: 'p-test',
    name: 'test',
    typology: 'industrial',
    site: {
      boundary: contourFromPolygon([
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 },
      ]),
      rules: { setback: 10, maxCoverage },
    },
    programs: [
      { id: 'warehouse', name: 'Warehouse', color: '#000', built: true },
      { id: 'yard', name: 'Yard', color: '#000', built: false },
    ],
    buildings: [{ id: 'b1', name: 'Building 1', color: '#000', levelHeight: 12, levels: [{ id: 'l1', name: 'L1', elevation: 0, height: 12, repeat: 1 }] }],
    options: [{ id: 'o1', name: 'Option 1', buildingIds: ['b1'] }],
    masses,
  }
}

function warehouse(id: string, cx: number, cy: number, w = 100, d = 60, programId = 'warehouse'): Mass {
  return { id, name: id, levelId: 'l1', programId, height: 12, footprint: { kind: 'rect', center: { x: cx, y: cy }, width: w, depth: d, rotation: 0 } }
}

const codes = (p: Project) => derive(p).issues.map((i) => i.code)

describe('derive — massing', () => {
  it('two warehouses well placed: no issues, correct metrics', () => {
    // A spans x 20–120, B spans x 160–260: 40 m apart, both inside the setback.
    const d = derive(project([warehouse('A', 70, 100), warehouse('B', 210, 100)]))
    expect(d.issues).toEqual([])
    expect(d.metrics.siteArea).toBeCloseTo(60000)
    expect(d.metrics.buildableArea).toBeCloseTo(50400)
    expect(d.metrics.builtFootprint).toBeCloseTo(12000)
    expect(d.metrics.coverage).toBeCloseTo(0.2)
    expect(d.metrics.footprintByProgram).toEqual({ warehouse: 12000 })
  })

  it('a warehouse crossing the setback is reported with its outside area', () => {
    // x 0–100: the strip 0–10 is inside the setback → 10 × 60 = 600 m² outside.
    const d = derive(project([warehouse('A', 50, 100)]))
    expect(d.issues).toHaveLength(1)
    expect(d.issues[0]).toMatchObject({ code: 'outside-buildable', massIds: ['A'] })
    expect(d.issues[0].message).toContain('600 m²')
  })

  it('overlapping warehouses', () => {
    expect(codes(project([warehouse('A', 70, 100), warehouse('B', 120, 100)]))).toEqual(['overlap'])
  })

  it('no spacing between masses: side by side is fine (how far apart is an apart rule, Decision "Spacing by rules")', () => {
    // A ends at x 120, B starts at x 120: they touch, they do not overlap.
    expect(codes(project([warehouse('A', 70, 100), warehouse('B', 170, 100)]))).toEqual([])
  })

  it('open programs (yards) ignore overlap and coverage rules', () => {
    const d = derive(project([warehouse('A', 70, 100), warehouse('Y', 80, 100, 100, 60, 'yard')]))
    expect(d.issues).toEqual([])
    expect(d.metrics.builtFootprint).toBeCloseTo(6000)
  })

  it('coverage above the limit', () => {
    // One 270 × 170 warehouse = 45,900 m² = 76.5 % > 60 %.
    expect(codes(project([warehouse('A', 150, 100, 270, 170)]))).toEqual(['coverage-exceeded'])
  })

  it('without a site, only a warning; spacing is still checked', () => {
    const p = project([warehouse('A', 70, 100), warehouse('B', 120, 100)])
    p.site.boundary = null
    expect(codes(p)).toEqual(['no-site', 'overlap'])
  })
})
