// What a CAD plan carries (Phase DX.2, `planOf`): the option's masses with their labels (a block cut at its floor,
// DI.1: its walls, columns, zones, axes and module lines), docks and doors, the one paving (DI.2: streets, existing
// roads, courts and approaches unioned, curb returns as arcs) and the roads' centrelines, lots, the dimensions, the
// site's lines, the contours and the imported drawings' layers; every point where it was in the survey (the frame's
// origin), in the project's units.
import DxfParser from 'dxf-parser'
import { describe, expect, it } from 'vitest'
import { buildingOf, massesOfOption, optionOf } from '../../engine/buildings.ts'
import { stripOutlines } from '../../engine/path/strip.ts'
import { derive } from '../../engine/derive.ts'
import { footprintPolygon } from '../../engine/geom/footprint.ts'
import { area, bounds, distancePointSegment, pointInPolygon } from '../../engine/geom/polygon.ts'
import { lineName } from '../../engine/grid/index.ts'
import type { Derived } from '../../engine/types.ts'
import type { GroundPoint, Mass, Point, Polygon, Project } from '../../model/schema.ts'
import { copyGenerated } from '../../modules/warehouse/engine/copies.ts'
import { actions } from '../../state/actions/index.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { sampleProject } from '../../state/sample.ts'
import { newProject } from '../../typologies/index.ts'
import { NOTES, REFERENCE_LINES, note, referenceLine } from '../../views/layers/keys.ts'
import { useLayerView } from '../../views/layers/layerView.ts'
import { dxfOf } from '../exportDxf.ts'
import { modelOf } from '../exportModel.ts'
import { PLAN_LAYERS, TEXT_M, cadLayerName, planOf, type PlanEntity } from '../exportPlan.ts'

const flat = { threeD: false }
const on = (es: PlanEntity[], layer: string) => es.filter((e) => e.layer === layer)
const polys = (es: PlanEntity[], layer: string) => on(es, layer).filter((e): e is Extract<PlanEntity, { kind: 'poly' }> => e.kind === 'poly')
const textsOf = (es: PlanEntity[], layer: string) => on(es, layer).flatMap((e) => (e.kind === 'text' ? [e.text] : []))

/** The option's blocks: each hall mass with its copy and its type. */
function blocksOf(p: Project, d: Derived) {
  return massesOfOption(p, optionOf(p, d.option)).flatMap((m) => {
    const copy = buildingOf(p, m).warehouse
    const t = copy && p.warehouseTypes?.find((x) => x.id === copy.type)
    return m.part === 'hall' && copy && t ? [{ m, copy, t, g: copyGenerated(t, copy) }] : []
  })
}

/** Inside the polygon or on its edge (within the booleans' 0.1 mm). */
const inOrOn = (q: Point, r: Polygon) => pointInPolygon(q, r) || r.some((c, i) => distancePointSegment(q, c, r[(i + 1) % r.length]) <= 1e-4)

/** Points along the arc a → b of that bulge (DXF's sign: counter-clockwise positive), its two ends left out. */
function arcPoints(a: Point, b: Point, bulge: number, n = 32): Point[] {
  const theta = 4 * Math.atan(bulge)
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2))
  const u = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord }
  // the centre to the left of a → b for a counter-clockwise arc, to the right for a clockwise one
  const h = Math.sign(theta) * r * Math.cos(theta / 2)
  const c = { x: (a.x + b.x) / 2 - u.y * h, y: (a.y + b.y) / 2 + u.x * h }
  const a0 = Math.atan2(a.y - c.y, a.x - c.x)
  return Array.from({ length: n - 1 }, (_, k) => ({ x: c.x + r * Math.cos(a0 + (theta * (k + 1)) / n), y: c.y + r * Math.sin(a0 + (theta * (k + 1)) / n) }))
}

/** A blank project (its typology's grid, no site), with what a test gives it. */
function blank(edit: (p: Project) => void = () => {}): Project {
  const p = newProject('blank', 'Test')
  edit(p)
  return p
}

const square = (side: number, at = { x: 0, y: 0 }) => ({
  vertices: [
    { x: at.x, y: at.y, r: 0 },
    { x: at.x + side, y: at.y, r: 0 },
    { x: at.x + side, y: at.y + side, r: 0 },
    { x: at.x, y: at.y + side, r: 0 },
  ],
})

const mass = (id: string, side: number): Mass => ({
  id,
  name: 'Almacén',
  levelId: 'l1',
  programId: null,
  footprint: { kind: 'rect', center: { x: side / 2, y: side / 2 }, width: side, depth: side, rotation: 0 },
})

describe('planOf', () => {
  it('(a) an empty project: no entities, every layer of the table', () => {
    const p = blank()
    const plan = planOf(p, derive(p), flat)
    expect(plan.entities).toEqual([])
    expect(Object.keys(plan.layers)).toEqual(expect.arrayContaining(Object.keys(PLAN_LAYERS)))
    expect(plan).toMatchObject({ name: 'Test', units: 'm', threeD: false })
  })

  it('the palette the user approved in AutoCAD: white for what is built, one muted hue per family', () => {
    const colour = Object.fromEntries(Object.entries(PLAN_LAYERS).map(([k, s]) => [k, s.color]))
    expect(colour).toEqual({
      'A-WALL': 7, 'S-COLS': 7, 'A-AREA': 201, 'A-AREA-IDEN': 201, 'A-AREA-OTLN': 9, 'A-DOOR-DOCK': 31, 'A-DOOR': 33,
      'A-GRID': 153, 'A-GRID-IDEN': 153, 'A-GRID-MODL': 155, 'A-ANNO-DIMS': 51, 'A-ANNO-TEXT': 7, 'C-PROP': 11,
      'C-PROP-SETB': 13, 'C-PROP-LOTS': 213, 'C-TOPO-MAJR': 33, 'C-TOPO-MINR': 35, 'C-ROAD': 254, 'C-ROAD-CNTR': 253,
      'C-ROAD-EXST': 8, 'C-ROAD-STRP': 252, 'C-PKNG-STRP': 123, 'C-PKNG-OTLN': 123, 'A-ANNO-REFR': 8, 'A-ANNO-NOTE': 7,
      // mixed-use-mvp: la planta tipo residencial
      'A-FLOR-UNIT': 41, 'A-FLOR-UNIT-IDEN': 41, 'A-FLOR-ROOM': 43, 'A-FLOR-CORE': 7,
    })
    expect(PLAN_LAYERS['A-ROOF-OTLN']).toBeUndefined()
    expect(PLAN_LAYERS['A-GRID'].weight).toBe(0.13)
    expect(PLAN_LAYERS['C-PKNG-STRP'].weight).toBe(0.13)
  })

  it('the cut plan’s layers (DI.1): walls and columns white, zones and module lines a hue of their own', () => {
    expect(PLAN_LAYERS['A-WALL']).toEqual({ weight: 0.5, linetype: 'CONTINUOUS', color: 7 })
    expect(PLAN_LAYERS['S-COLS']).toEqual({ weight: 0.35, linetype: 'CONTINUOUS', color: 7 })
    expect(PLAN_LAYERS['A-AREA']).toEqual({ weight: 0.25, linetype: 'DASHED', color: 201 })
    expect(PLAN_LAYERS['A-AREA-IDEN']).toEqual({ weight: 0.18, linetype: 'CONTINUOUS', color: 201 })
    expect(PLAN_LAYERS['A-GRID-MODL']).toEqual({ weight: 0.09, linetype: 'CONTINUOUS', color: 155 })
  })

  it('(b) the demo: one closed A-WALL poly per built mass, a label of three lines each; no grid, no columns', () => {
    const p = demoProject()
    const d = derive(p)
    const built = modelOf(p, d, 'geometry').masses.filter((m) => m.built)
    expect(built.length).toBeGreaterThan(0)
    const plan = planOf(p, d, flat)
    const roofs = polys(plan.entities, 'A-WALL')
    expect(roofs).toHaveLength(built.length + built.reduce((n, m) => n + m.holes.length, 0))
    expect(roofs.every((r) => r.closed)).toBe(true)
    // the project grid left the plan (DI.1): only a block's own axes are drawn, and the demo has none
    expect(on(plan.entities, 'A-GRID')).toEqual([])
    expect(on(plan.entities, 'A-GRID-IDEN')).toEqual([])
    expect(on(plan.entities, 'S-COLS')).toEqual([])
    const texts = on(plan.entities, 'A-ANNO-TEXT')
    expect(texts).toHaveLength(3 * modelOf(p, d, 'geometry').masses.length)
    const first = built[0]
    expect(texts.filter((t) => t.kind === 'text').map((t) => (t as { text: string }).text)).toEqual(expect.arrayContaining([first.name, first.program]))
    expect(texts.every((t) => t.kind === 'text' && t.height === TEXT_M && t.align === 'center')).toBe(true)
  })

  it('(c) a frame origin: every point is where it was in the survey', () => {
    const origin = { x: 500000, y: 2800000 }
    const p = blank((q) => {
      q.site.boundary = square(100, { x: 10, y: 20 })
      q.site.frame = { units: 'm', origin }
    })
    const plan = planOf(p, derive(p), flat)
    const [boundary] = polys(plan.entities, 'C-PROP')
    expect(boundary.points[0]).toEqual({ x: 10 + origin.x, y: 20 + origin.y })
    expect(boundary.closed).toBe(true)
  })

  it('(d) a project in feet: lengths ÷ 0.3048, the label in ft²', () => {
    const p = blank((q) => {
      q.units = 'ft'
      q.masses.push(mass('m1', 10))
    })
    const plan = planOf(p, derive(p), flat)
    expect(plan.units).toBe('ft')
    const [roof] = polys(plan.entities, 'A-WALL')
    const [a, b] = roof.points
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(32.808399, 6)
    const texts = on(plan.entities, 'A-ANNO-TEXT').map((t) => (t as { text: string }).text)
    expect(texts).toEqual(['Almacén', 'No program', '1,076 ft²'])
    expect(on(plan.entities, 'A-ANNO-TEXT').every((t) => t.kind === 'text' && Math.abs(t.height - TEXT_M / 0.3048) < 1e-9)).toBe(true)
  })

  it('the area label: thousands with a comma, no decimals, in m²', () => {
    const p = blank((q) => q.masses.push(mass('m1', 111.11)))
    const texts = on(planOf(p, derive(p), flat).entities, 'A-ANNO-TEXT').map((t) => (t as { text: string }).text)
    expect(texts[2]).toBe('12,345 m²')
  })

  it('(e) a boundary with one arc keeps it as a bulge, in DXF’s sign (counter-clockwise positive)', () => {
    // GFit's bulge −0.5 on the first edge of a counter-clockwise outline bulges outwards (to the right of a → b):
    // DXF writes that arc, counter-clockwise from its start, as +0.5
    const p = blank((q) => {
      q.site.boundary = { ...square(100), arcs: { '0': -0.5 } }
    })
    const [boundary] = polys(planOf(p, derive(p), flat).entities, 'C-PROP')
    expect(boundary.points).toHaveLength(4)
    expect(boundary.bulges).toHaveLength(4)
    expect(boundary.bulges[0]).toBeCloseTo(0.5, 9)
    expect(boundary.bulges.slice(1)).toEqual([0, 0, 0])
  })

  it('a mass’s hole with an arc edge keeps it as a bulge, never chords', () => {
    const p = blank((q) => {
      const m = mass('m1', 40)
      m.holes = [{ ...square(10, { x: 15, y: 15 }), arcs: { '0': -0.5 } }]
      q.masses.push(m)
    })
    const roofs = polys(planOf(p, derive(p), flat).entities, 'A-WALL')
    expect(roofs).toHaveLength(2)
    const hole = roofs[1]
    expect(hole.closed).toBe(true)
    expect(hole.points).toHaveLength(4)
    expect(hole.bulges[0]).toBeCloseTo(0.5, 9)
    expect(hole.bulges.slice(1)).toEqual([0, 0, 0])
  })

  it('a rounded corner is an arc too, not chords', () => {
    const p = blank((q) => {
      const s = square(100)
      s.vertices[2] = { ...s.vertices[2], r: 10 }
      q.site.boundary = s
    })
    const [boundary] = polys(planOf(p, derive(p), flat).entities, 'C-PROP')
    expect(boundary.points).toHaveLength(5)
    // a quarter circle turning left (counter-clockwise): tan(90° / 4)
    expect(boundary.bulges.filter((b) => b !== 0).map((b) => Math.round(b * 1e9) / 1e9)).toEqual([Math.round(Math.tan(Math.PI / 8) * 1e9) / 1e9])
  })

  it('(f) docks: a closed A-DOOR-DOCK rectangle per derived door', () => {
    const p = demoProject()
    const d = derive(p)
    const doors = d.circulation.docks.reduce((n, k) => n + k.doors.length, 0)
    expect(doors).toBeGreaterThan(0)
    const docks = polys(planOf(p, d, flat).entities, 'A-DOOR-DOCK')
    expect(docks).toHaveLength(doors)
    expect(docks.every((x) => x.closed && x.points.length === 4)).toBe(true)
    const [q] = docks
    const side = (i: number) => Math.hypot(q.points[i + 1].x - q.points[i].x, q.points[i + 1].y - q.points[i].y)
    expect([side(0), side(1)].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([3, 0.6])
  })

  it('courts in the paving, lots apart, a centreline per street (the demo)', () => {
    const p = demoProject()
    const d = derive(p)
    const plan = planOf(p, d, flat)
    expect(d.circulation.docks.length).toBeGreaterThan(0)
    // the courts are paved with the streets (DI.2): C-PKNG-OTLN keeps the lots only
    expect(polys(plan.entities, 'C-PKNG-OTLN')).toHaveLength(d.circulation.lots.length)
    const paving = polys(plan.entities, 'C-ROAD')
    for (const dock of d.circulation.docks) for (const q of dock.court) expect(paving.some((x) => inOrOn(q, x.points))).toBe(true)
    const streets = d.circulation.roads.filter((r) => r.kind === 'street')
    expect(streets.length).toBeGreaterThan(0)
    expect(polys(plan.entities, 'C-ROAD-CNTR')).toHaveLength(streets.length)
    expect(polys(plan.entities, 'C-ROAD-CNTR').every((x) => !x.closed)).toBe(true)
    expect(paving.length).toBeGreaterThan(0)
    expect(paving.every((x) => x.closed)).toBe(true)
    // two streets that meet end to end at a right angle, (211,170) and (29,170): their outer corner closed square
    // (8 m wide meets 6 m wide), no notch and no curb return in it
    const points = paving.flatMap((x) => x.points)
    const near = (q: Point, x: number, y: number) => Math.hypot(q.x - x, q.y - y) < 1e-6
    expect(points.some((q) => near(q, 215, 173))).toBe(true)
    expect(points.some((q) => near(q, 25, 173))).toBe(true)
    const inBox = (q: Point, x0: number, x1: number, y0: number, y1: number) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1
    expect(points.filter((q) => inBox(q, 210.99, 214.99, 169.99, 172.99) || inBox(q, 25.01, 29.01, 169.99, 172.99))).toEqual([])
  })

  it('the demo’s curb returns run clear of every stall, lot and mass (they stand just off the paving)', () => {
    const p = demoProject()
    const d = derive(p)
    const plan = planOf(p, d, flat)
    expect(p.site.frame).toBeUndefined()
    const arcs = polys(plan.entities, 'C-ROAD').flatMap((r) => r.points.flatMap((a, i) => (r.bulges[i] ? [arcPoints(a, r.points[(i + 1) % r.points.length], r.bulges[i])] : [])))
    expect(arcs.length).toBeGreaterThan(0)
    expect(d.circulation.stalls.length).toBeGreaterThan(0)
    const masses = massesOfOption(p, optionOf(p, d.option)).flatMap((m) => (d.masses[m.id]?.polygon.length >= 3 ? [d.masses[m.id].polygon] : []))
    expect(masses.length).toBeGreaterThan(0)
    const blockers = [...d.circulation.stalls, ...d.circulation.lots.map((l) => l.polygon), ...masses]
    const overlaps = arcs.reduce((n, arc) => n + blockers.filter((b) => arc.some((q) => pointInPolygon(q, b))).length, 0)
    expect(overlaps).toBe(0)
  })

  it('one paving (DI.2): the roads’ strips, courts and the south street (an existing one) unioned on C-ROAD, curb returns as arcs', () => {
    const p = sampleProject()
    const d = derive(p)
    const plan = planOf(p, d, flat)
    const paving = polys(plan.entities, 'C-ROAD')
    expect(paving.length).toBeGreaterThan(0)
    expect(paving.every((x) => x.closed && x.bulges.length === x.points.length)).toBe(true)
    // unioned: fewer outlines than the roads' strips, each written on its own before
    const strips = d.circulation.roads.reduce((n, r) => n + stripOutlines(r.points, r.width).length, 0)
    expect(paving.length).toBeLessThan(strips)
    // the curb returns: arcs, not chords
    expect(paving.some((x) => x.bulges.some((b) => b !== 0))).toBe(true)
    // the courts and the existing south street are in it
    expect(d.circulation.docks.length).toBeGreaterThan(0)
    for (const dock of d.circulation.docks) for (const q of dock.court) expect(paving.some((x) => inOrOn(q, x.points))).toBe(true)
    const south = d.circulation.roads.filter((r) => r.kind === 'existing')
    expect(south.length).toBeGreaterThan(0)
    for (const r of south) for (const q of stripOutlines(r.points, r.width).flat()) expect(paving.some((x) => inOrOn(q, x.points))).toBe(true)
    // the lots keep their own outline; a centreline per street; the existing street's own on C-ROAD-EXST
    expect(polys(plan.entities, 'C-PKNG-OTLN')).toHaveLength(d.circulation.lots.length)
    expect(polys(plan.entities, 'C-ROAD-CNTR')).toHaveLength(d.circulation.roads.filter((r) => r.kind === 'street').length)
    expect(polys(plan.entities, 'C-ROAD-EXST')).toHaveLength(south.length)
  })

  it('an existing road: its paving in the one outline, its centreline open on C-ROAD-EXST', () => {
    const p = sampleProject()
    p.site.existingRoads = [{ id: 'r1', points: [{ x: -50, y: -30 }, { x: 600, y: -30 }], stretches: [{ left: 6, right: 6 }] }]
    const d = derive(p)
    const existing = d.circulation.roads.find((r) => r.kind === 'existing')!
    expect(existing).toBeDefined()
    const plan = planOf(p, d, flat)
    const centre = polys(plan.entities, 'C-ROAD-EXST')
    expect(centre).toHaveLength(1)
    expect(centre[0].closed).toBe(false)
    expect(centre[0].points).toEqual(existing.points.map((q) => ({ x: q.x, y: q.y })))
    const paving = polys(plan.entities, 'C-ROAD')
    for (const q of stripOutlines(existing.points, existing.width).flat()) expect(paving.some((x) => inOrOn(q, x.points))).toBe(true)
    // its centreline is not a street's
    expect(polys(plan.entities, 'C-ROAD-CNTR')).toHaveLength(d.circulation.roads.filter((r) => r.kind === 'street').length)
  })

  it('lanes (Phase PE.2): a 3-lane street has its two dividers open on C-ROAD-STRP, a 1-lane street none, an existing street its own', () => {
    expect(PLAN_LAYERS['C-ROAD-STRP']).toEqual({ weight: 0.13, linetype: 'DASHED', color: 252 })
    const line = [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    const wide = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', line, undefined, 10.5)!.project
    const strp = polys(planOf(wide, derive(wide), flat).entities, 'C-ROAD-STRP')
    expect(strp).toHaveLength(2)
    expect(strp.every((e) => !e.closed)).toBe(true)
    // walking +x the left is +y: the dividers lie 1.75 m either side of the centre line, where the lanes meet
    expect(strp.map((e) => e.points.map((q) => q.y))).toEqual([[1.75, 1.75], [-1.75, -1.75]])
    expect(strp[0].points.map((q) => q.x)).toEqual([0, 80])
    const one = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', line, undefined, 3.5)!.project
    expect(on(planOf(one, derive(one), flat).entities, 'C-ROAD-STRP')).toEqual([])
    const road = blank((q) => {
      q.site.existingRoads = [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 60, y: 0 }], stretches: [{ left: 3.5, right: 3.5 }] }]
    })
    const existing = polys(planOf(road, derive(road), flat).entities, 'C-ROAD-STRP')
    expect(existing.map((e) => e.points.map((q) => q.y))).toEqual([[0, 0]])
  })

  it('stored lanes of different widths put the dividers where they meet; a street with several runs has lines for each run', () => {
    const line = [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    const p = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', line, undefined, 11)!.project
    p.options[0].streets!.segments[0].lanes = [4, 3.5, 3.5]
    const strp = polys(planOf(p, derive(p), flat).entities, 'C-ROAD-STRP')
    expect(strp.map((e) => e.points[0].y)).toEqual([1.5, -2])
  })

  it('in 3D the lane lines are polylines at the graded heights of the centre line, as modelOf has them', () => {
    const p = drawStreet(sampleProject(), 'o1', [{ x: 0, y: -40 }, { x: 200, y: -40 }], undefined, 10.5)!.project
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    expect(polys(plan.entities, 'C-ROAD-STRP')).toEqual([])
    const lines = poly3ds(plan.entities, 'C-ROAD-STRP')
    const expected = model.roads.flatMap((r) => (r.lanes.length > 1 ? Array.from({ length: r.lanes.length - 1 }, () => r) : []))
    expect(expected.length).toBeGreaterThan(0)
    expect(lines).toHaveLength(expected.length)
    lines.forEach((l, i) => {
      expect(l.closed).toBe(false)
      expect(l.points.map((q) => q.z)).toEqual(expected[i].centre.map((q) => q.z))
    })
    expect(new Set(lines.flatMap((l) => l.points.map((q) => Math.round(q.z * 10)))).size).toBeGreaterThan(1)
  })

  it('the paving in feet with a survey frame: the metres plan’s points (q + origin) ÷ 0.3048, bulges unchanged', () => {
    const p = sampleProject()
    const origin = { x: 1000, y: 2000 }
    const ft: Project = { ...p, units: 'ft', site: { ...p.site, frame: { units: 'm', origin } } }
    const inMetres = planOf(p, derive(p), flat).entities
    const inFeet = planOf(ft, derive(ft), flat).entities
    for (const layer of ['C-ROAD', 'C-ROAD-CNTR']) {
      const m = polys(inMetres, layer)
      const f = polys(inFeet, layer)
      expect(m.length, layer).toBeGreaterThan(0)
      expect(f).toHaveLength(m.length)
      f.forEach((e, i) => {
        expect(e.bulges).toEqual(m[i].bulges)
        expect(e.points).toHaveLength(m[i].points.length)
        e.points.forEach((q, k) => {
          expect(q.x).toBeCloseTo((m[i].points[k].x + origin.x) / 0.3048, 6)
          expect(q.y).toBeCloseTo((m[i].points[k].y + origin.y) / 0.3048, 6)
        })
      })
    }
  })

  it('(g) contours: every fifth interval major, each at its elevation', () => {
    const p = setTerrain(
      blank((q) => (q.site.boundary = square(200))),
      { contours: Array.from({ length: 11 }, (_, k) => ({ points: [{ x: 0, y: 10 * k }, { x: 200, y: 10 * k }], z: 480 + k })), points: [] },
    )
    const plan = planOf(p, derive(p), flat)
    const major = polys(plan.entities, 'C-TOPO-MAJR')
    const minor = polys(plan.entities, 'C-TOPO-MINR')
    expect(major.map((c) => c.elevation)).toEqual([480, 485, 490])
    expect(minor.map((c) => c.elevation)).toEqual([481, 482, 483, 484, 486, 487, 488, 489])
    expect([...major, ...minor].every((c) => c.thickness === 0 && !c.closed)).toBe(true)
    expect(plan.entities.some((e) => e.kind === 'poly3d')).toBe(false)
  })

  it('contours: one known height, no interval, all minor', () => {
    const p = setTerrain(blank((q) => (q.site.boundary = square(200))), { contours: [{ points: [{ x: 0, y: 0 }, { x: 9, y: 9 }], z: 485 }], points: [] })
    const plan = planOf(p, derive(p), flat)
    expect(polys(plan.entities, 'C-TOPO-MAJR')).toEqual([])
    expect(polys(plan.entities, 'C-TOPO-MINR').map((c) => c.elevation)).toEqual([485])
  })

  it('(h) a dimension: its length in the output unit, two decimals; its line `offset` to the left', () => {
    const p = blank((q) => {
      q.dimensions = [
        { id: 'd1', levelId: 'l1', a: { x: 0, y: 0 }, b: { x: 25, y: 0 }, offset: 5 },
        { id: 'd2', levelId: 'elsewhere', a: { x: 0, y: 0 }, b: { x: 9, y: 0 }, offset: 1 },
      ]
    })
    const dims = on(planOf(p, derive(p), flat).entities, 'A-ANNO-DIMS')
    expect(dims).toEqual([{ kind: 'dim', layer: 'A-ANNO-DIMS', a: { x: 0, y: 0 }, b: { x: 25, y: 0 }, line: { x: 0, y: 5 }, text: '25.00' }])
    const ft = on(planOf({ ...p, units: 'ft' }, derive(p), flat).entities, 'A-ANNO-DIMS')
    expect(ft[0]).toMatchObject({ text: '82.02' })
  })

  it('(i) an imported drawing’s layer: by its file and name, its own colour (8 without one)', () => {
    const p = blank((q) => {
      q.site.drawings = [
        {
          file: 'survey.dwg',
          layers: [
            { name: 'Árboles/Trees', color: 3, lines: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] },
            { name: 'Walls', lines: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true }] },
          ],
        },
      ]
    })
    const plan = planOf(p, derive(p), flat)
    expect(plan.layers['X-survey-Árboles_Trees']).toEqual({ weight: 0.13, linetype: 'CONTINUOUS', color: 3 })
    expect(plan.layers['X-survey-Walls']).toEqual({ weight: 0.13, linetype: 'CONTINUOUS', color: 8 })
    expect(polys(plan.entities, 'X-survey-Árboles_Trees')).toMatchObject([{ closed: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }])
    expect(polys(plan.entities, 'X-survey-Walls')).toMatchObject([{ closed: true }])
  })

  it('(i2) layers that differ only in case are one layer (CAD is case-insensitive): the first spelling serves them all', () => {
    const p = blank((q) => {
      q.site.drawings = [
        {
          file: 'survey.dwg',
          layers: [
            { name: 'Árboles/Trees', color: 3, lines: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] },
            { name: 'árboles/trees', lines: [{ points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] }] },
          ],
        },
      ]
    })
    const plan = planOf(p, derive(p), flat)
    const keys = Object.keys(plan.layers).filter((k) => k.toLowerCase().startsWith('x-'))
    expect(keys).toEqual(['X-survey-Árboles_Trees'])
    expect(plan.layers['X-survey-Árboles_Trees']).toMatchObject({ color: 3 })
    expect(plan.entities.filter((e) => e.layer.toLowerCase().startsWith('x-')).map((e) => e.layer)).toEqual(['X-survey-Árboles_Trees', 'X-survey-Árboles_Trees'])
  })

  it('a mass with no name (or no program) writes no empty text: the other lines stay where they were', () => {
    const p = blank((q) => {
      const m = mass('m1', 10)
      m.name = ''
      q.masses.push(m)
    })
    const texts = on(planOf(p, derive(p), flat).entities, 'A-ANNO-TEXT')
    expect(texts.map((t) => (t as { text: string }).text)).toEqual(['No program', '100 m²'])
    expect(texts.every((t) => t.kind === 'text' && t.text.trim() !== '')).toBe(true)
  })

  it('cadLayerName: the characters CAD refuses become _, letters stay', () => {
    expect(cadLayerName('Nave Ñ <a>/b\\c"d:e;f?g*h|i,j=k`l')).toBe('Nave Ñ _a__b_c_d_e_f_g_h_i_j_k_l')
  })

  it('(j) a block cut at its floor (DI.1): its walls, columns, axes, module lines and zones; its outline only as its walls', () => {
    const p = sampleProject()
    const d = derive(p)
    const blocks = blocksOf(p, d)
    expect(blocks.length).toBeGreaterThan(0)
    const plan = planOf(p, d, flat)
    const walls = polys(plan.entities, 'A-WALL')
    expect(walls.every((w) => w.closed)).toBe(true)
    for (const { m } of blocks) {
      const hall = d.masses[m.id].polygon
      const mine = walls.filter((w) => w.points.every((q) => inOrOn(q, hall)))
      expect(mine.length).toBeGreaterThanOrEqual(2)
      // the hall's outline is its walls' outer face, once: never written again as a mass's
      expect(mine.filter((w) => Math.abs(area(w.points) - area(hall)) < 1e-3)).toHaveLength(1)
    }
    expect(polys(plan.entities, 'A-AREA-OTLN')).toEqual([])
    // its label as a mass's
    expect(textsOf(plan.entities, 'A-ANNO-TEXT')).toEqual(expect.arrayContaining(blocks.map((b) => b.m.name)))

    const columns = polys(plan.entities, 'S-COLS')
    expect(columns).toHaveLength(blocks.reduce((n, b) => n + b.g.columns.length, 0))
    expect(columns.every((c) => c.closed && c.points.length === 4)).toBe(true)

    // its axes: a line each, a bubble and its name at both ends
    const names = blocks.flatMap(({ g }) => [...g.runs.x.lines.map((_, i) => lineName('x', i)), ...g.runs.y.lines.map((_, i) => lineName('y', i))])
    const axes = on(plan.entities, 'A-GRID')
    expect(axes).toHaveLength(names.length)
    expect(axes.every((l) => l.kind === 'line')).toBe(true)
    const circles = on(plan.entities, 'A-GRID-IDEN').filter((e) => e.kind === 'circle')
    expect(circles).toHaveLength(2 * names.length)
    expect(circles.every((c) => c.kind === 'circle' && Math.abs(c.r - 1.5 * TEXT_M) < 1e-9)).toBe(true)
    expect(textsOf(plan.entities, 'A-GRID-IDEN').sort()).toEqual(names.flatMap((n) => [n, n]).sort())

    const modules = polys(plan.entities, 'A-GRID-MODL')
    expect(modules.length).toBeGreaterThan(0)
    expect(modules.every((l) => !l.closed && l.points.length === 2)).toBe(true)
    expect(modules.every((l) => blocks.some((b) => l.points.every((q) => inOrOn(q, d.masses[b.m.id].polygon))))).toBe(true)

    // the office: its outline, its name, its program and its area
    const offices = blocks.flatMap(({ g }) => g.zones.filter((z) => z.program !== g.parts[0].program && z.area > 0))
    expect(offices.length).toBeGreaterThan(0)
    const zones = polys(plan.entities, 'A-AREA')
    expect(zones.length).toBeGreaterThanOrEqual(offices.length)
    expect(zones.every((z) => z.closed)).toBe(true)
    const office = p.programs.find((g) => g.id === 'office')!.name
    expect(textsOf(plan.entities, 'A-AREA-IDEN')).toEqual(offices.flatMap((z) => [z.name, office, `${Math.round(z.area).toLocaleString('en-US')} m²`]))
  })

  it('a block follows its hall moved on the plan, not its copy’s place as it was made', () => {
    const p = sampleProject()
    const d = derive(p)
    const [first] = blocksOf(p, d)
    const inHall = (q: Project, dq: Derived) => polys(planOf(q, dq, flat).entities, 'A-WALL').filter((w) => w.points.every((x) => inOrOn(x, dq.masses[first.m.id].polygon)))
    const before = inHall(p, d)
    expect(before.length).toBeGreaterThanOrEqual(2)
    const moved = sampleProject()
    const m = moved.masses.find((x) => x.id === first.m.id)!
    const f = m.footprint
    m.footprint = f.kind === 'rect' ? { ...f, center: { x: f.center.x + 30, y: f.center.y + 10 } } : { ...f, contour: { ...f.contour, vertices: f.contour.vertices.map((v) => ({ ...v, x: v.x + 30, y: v.y + 10 })) } }
    const after = inHall(moved, derive(moved))
    expect(after).toHaveLength(before.length)
    after.forEach((w, i) => {
      expect(w.points).toHaveLength(before[i].points.length)
      w.points.forEach((q, k) => {
        expect(q.x).toBeCloseTo(before[i].points[k].x + 30, 6)
        expect(q.y).toBeCloseTo(before[i].points[k].y + 10, 6)
      })
    })
  })

  it('a hall that is no longer its type’s shape falls back to its outline on A-WALL, nothing inside', () => {
    const p = sampleProject()
    const [first, ...others] = blocksOf(p, derive(p))
    const m = p.masses.find((x) => x.id === first.m.id)!
    const b = bounds(footprintPolygon(m.footprint))
    const triangle = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: (b.minX + b.maxX) / 2, y: b.maxY },
    ]
    m.footprint = { kind: 'contour', contour: { vertices: triangle.map((q) => ({ ...q, r: 0 })) } }
    const plan = planOf(p, derive(p), flat)
    const walls = polys(plan.entities, 'A-WALL')
    expect(walls.some((w) => w.closed && w.points.length === 3 && w.points.every((q) => triangle.some((t) => Math.hypot(q.x - t.x, q.y - t.y) < 1e-6)))).toBe(true)
    const columns = polys(plan.entities, 'S-COLS')
    expect(columns).toHaveLength(others.reduce((n, o) => n + o.g.columns.length, 0))
    expect(columns.some((c) => c.points.some((q) => pointInPolygon(q, triangle)))).toBe(false)
  })

  it('a hall reshaped with as many corners (stretched) is no longer its type’s: its outline on A-WALL, nothing inside, no doors', () => {
    const p = sampleProject()
    // a level door on every copy of the type, so each block draws one
    const t = p.warehouseTypes![0]
    const dock = t.elements.find((e) => e.kind === 'dock')!
    const taken = new Set(t.elements.filter((e) => e.edge === dock.edge).map((e) => e.module))
    let free = dock.module
    while (taken.has(free)) free++
    t.elements = [...t.elements, { id: 'x-door', kind: 'door', edge: dock.edge, module: free, width: 4 }]
    const [first, ...others] = blocksOf(p, derive(p))
    expect(others.length).toBeGreaterThan(0)
    const m = p.masses.find((x) => x.id === first.m.id)!
    const hall = footprintPolygon(m.footprint)
    const b = bounds(hall)
    const stretched = hall.map((q) => (q.x > (b.minX + b.maxX) / 2 ? { x: q.x + 20, y: q.y } : q))
    m.footprint = { kind: 'contour', contour: { vertices: stretched.map((q) => ({ ...q, r: 0 })) } }
    const d = derive(p)
    const plan = planOf(p, d, flat)
    const near = (q: Point, r: Point) => Math.hypot(q.x - r.x, q.y - r.y) < 1e-6
    const walls = polys(plan.entities, 'A-WALL')
    expect(walls.some((w) => w.closed && w.points.length === stretched.length && w.points.every((q) => stretched.some((s) => near(q, s))))).toBe(true)
    // nothing of its type's interior: the other blocks' columns, axes and module lines only
    expect(polys(plan.entities, 'S-COLS')).toHaveLength(others.reduce((n, o) => n + o.g.columns.length, 0))
    expect(on(plan.entities, 'A-GRID')).toHaveLength(others.reduce((n, o) => n + o.g.runs.x.lines.length + o.g.runs.y.lines.length, 0))
    expect(polys(plan.entities, 'A-GRID-MODL').some((l) => l.points.every((q) => inOrOn(q, d.masses[first.m.id].polygon)))).toBe(false)
    // its doors are not drawn at a place it no longer has: the other blocks' only
    const doors = on(plan.entities, 'A-DOOR')
    expect(doors.length).toBeGreaterThan(0)
    expect(doors).toHaveLength(others.reduce((n, o) => n + o.g.doors.filter((x) => x.kind !== 'dock').length, 0))
  })

  it('a block in feet with a survey frame: where the survey has it, ÷ 0.3048', () => {
    const { frame: _, ...site } = sampleProject().site
    const p: Project = { ...sampleProject(), site }
    const origin = { x: 1000, y: 2000 }
    const ft: Project = { ...p, units: 'ft', site: { ...site, frame: { units: 'm', origin } } }
    const inMetres = planOf(p, derive(p), flat).entities
    const inFeet = planOf(ft, derive(ft), flat).entities
    for (const layer of ['A-WALL', 'S-COLS', 'A-AREA', 'A-GRID-MODL']) {
      const m = polys(inMetres, layer)
      const f = polys(inFeet, layer)
      expect(m.length, layer).toBeGreaterThan(0)
      expect(f).toHaveLength(m.length)
      f.forEach((e, i) =>
        e.points.forEach((q, k) => {
          expect(q.x).toBeCloseTo((m[i].points[k].x + origin.x) / 0.3048, 6)
          expect(q.y).toBeCloseTo((m[i].points[k].y + origin.y) / 0.3048, 6)
        }),
      )
    }
  })

  it('(k) 2D: no 3D polylines, every mass flat at 0', () => {
    const p = demoProject()
    const plan = planOf(p, derive(p), flat)
    expect(plan.entities.some((e) => e.kind === 'poly3d')).toBe(false)
    const masses = [...polys(plan.entities, 'A-WALL'), ...polys(plan.entities, 'A-AREA-OTLN')]
    expect(masses.length).toBeGreaterThan(0)
    expect(masses.every((m) => m.thickness === 0 && m.elevation === 0)).toBe(true)
    expect(plan.entities.filter((e) => e.kind === 'poly' && !e.layer.startsWith('C-TOPO')).every((e) => e.kind === 'poly' && e.elevation === 0)).toBe(true)
  })

  it('a block’s level doors and patterns: a line across each opening on A-DOOR', () => {
    const p = sampleProject()
    const t = p.warehouseTypes![0]
    // a level door on a free module between two docks of the front
    const dock = t.elements.find((e) => e.kind === 'dock')!
    const taken = new Set(t.elements.filter((e) => e.edge === dock.edge).map((e) => e.module))
    let free = dock.module
    while (taken.has(free)) free++
    t.elements = [...t.elements, { id: 'x-door', kind: 'door', edge: dock.edge, module: free, width: 4 }]
    const doors = on(planOf(p, derive(p), flat).entities, 'A-DOOR')
    expect(doors.length).toBeGreaterThan(0)
    expect(doors.every((l) => l.kind === 'line')).toBe(true)
    expect(doors.some((l) => l.kind === 'line' && Math.abs(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) - 4) < 1e-6)).toBe(true)
  })

  it('keeps the 3D flag it was asked for', () => {
    const p = blank()
    expect(planOf(p, derive(p), { threeD: true }).threeD).toBe(true)
  })
})

/** The model export's ground project (exportModel.test.ts): a sloped terrain, a contour of known height. */
function onGround(): Project {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
  return setTerrain(demoProject(), { contours: [{ points: [{ x: -100, y: 0 }, { x: 600, y: 0 }], z: 485 }, { points: [{ x: 0, y: 9 }, { x: 9, y: 9 }] }], points })
}
const poly3ds = (es: PlanEntity[], layer?: string) => es.filter((e): e is Extract<PlanEntity, { kind: 'poly3d' }> => e.kind === 'poly3d' && (layer === undefined || e.layer === layer))
const three = { threeD: true }

describe('planOf in 3D (DX.4)', () => {
  it('(a) masses: at the base of their floors[0], as thick as their height; the rest on the site mean ground', () => {
    const p = onGround()
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    expect(model.masses.length).toBeGreaterThan(0)
    for (const layer of ['A-WALL', 'A-AREA-OTLN']) {
      const mine = model.masses.filter((m) => (m.built ? 'A-WALL' : 'A-AREA-OTLN') === layer)
      const outlines = polys(plan.entities, layer)
      expect(outlines).toHaveLength(mine.reduce((n, m) => n + 1 + (p.masses.find((x) => x.id === m.id)?.holes?.length || m.holes.length), 0))
      for (const e of outlines) expect(e.thickness).toBeGreaterThan(0)
    }
    const first = model.masses[0]
    const roofs = polys(plan.entities, first.built ? 'A-WALL' : 'A-AREA-OTLN')
    expect(roofs[0].elevation).toBeCloseTo(first.floors[0], 9)
    expect(roofs[0].thickness).toBeCloseTo(first.height, 9)
    // a platform is not the site mean ground: the masses stand where they were graded
    expect(model.masses.some((m) => Math.abs(m.floors[0] - model.site!.z) > 1e-6)).toBe(true)
    const boundary = polys(plan.entities, 'C-PROP')[0]
    expect(boundary.elevation).toBeCloseTo(model.site!.z, 9)
    expect(boundary.thickness).toBe(0)
    const paving = polys(plan.entities, 'C-ROAD')
    expect(paving.length).toBeGreaterThan(0)
    expect(paving.every((e) => Math.abs(e.elevation - model.site!.z) < 1e-9 && e.thickness === 0)).toBe(true)
  })

  it('an unbuilt mass is a slab, a built one its height', () => {
    const p = demoProject()
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    const thick = new Set([...polys(plan.entities, 'A-WALL'), ...polys(plan.entities, 'A-AREA-OTLN')].map((e) => Math.round(e.thickness * 1e6)))
    for (const m of model.masses) expect(thick.has(Math.round(m.height * 1e6))).toBe(true)
  })

  it('(b) contours are 3D polylines at their height, none on poly, on the same layers', () => {
    const p = onGround()
    const d = derive(p)
    const plan = planOf(p, d, three)
    for (const layer of ['C-TOPO-MAJR', 'C-TOPO-MINR']) expect(polys(plan.entities, layer)).toEqual([])
    const all = [...poly3ds(plan.entities, 'C-TOPO-MAJR'), ...poly3ds(plan.entities, 'C-TOPO-MINR')]
    expect(all).toHaveLength(1)
    expect(all[0].layer).toBe('C-TOPO-MINR')
    expect(all[0].closed).toBe(false)
    expect(all[0].points).toEqual([{ x: -100, y: 0, z: 485 }, { x: 600, y: 0, z: 485 }])
  })

  it('(c) a street centreline is a 3D polyline at the graded heights of modelOf', () => {
    const p = sampleProject()
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    expect(polys(plan.entities, 'C-ROAD-CNTR')).toEqual([])
    const lines = poly3ds(plan.entities, 'C-ROAD-CNTR')
    const streets = model.roads.filter((r) => r.name === 'Street')
    expect(streets.length).toBeGreaterThan(0)
    expect(lines).toHaveLength(streets.length)
    streets.forEach((r, i) => {
      expect(lines[i].closed).toBe(false)
      expect(lines[i].points.map((q) => q.z)).toEqual(r.centre.map((q) => q.z))
    })
    expect(new Set(lines.flatMap((l) => l.points.map((q) => Math.round(q.z * 10)))).size).toBeGreaterThan(1)
  })

  it('an existing road’s centreline is a 3D polyline at modelOf’s heights, open, on C-ROAD-EXST', () => {
    const p = sampleProject()
    p.site.existingRoads = [{ id: 'r1', points: [{ x: -50, y: -30 }, { x: 600, y: -30 }], stretches: [{ left: 6, right: 6 }] }]
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    const existing = model.roads.filter((r) => r.name === 'Existing road')
    expect(existing).toHaveLength(1)
    expect(polys(plan.entities, 'C-ROAD-EXST')).toEqual([])
    const lines = poly3ds(plan.entities, 'C-ROAD-EXST')
    expect(lines).toHaveLength(1)
    expect(lines[0].closed).toBe(false)
    expect(lines[0].points).toEqual(existing[0].centre)
  })

  it('(d) the paving, its courts in it, at the site’s mean ground; heights in feet like lengths, the frame never moves z', () => {
    const p = sampleProject()
    p.units = 'ft'
    p.site.frame = { units: 'm', origin: { x: 500000, y: 2800000 } }
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const plan = planOf(p, d, three)
    // the courts are paved with the streets (DI.2), no longer apart at their level: one flat outline on the ground
    expect(model.courts.length).toBeGreaterThan(0)
    expect(model.courts.some((c) => Math.abs(c.z - model.site!.z) > 1e-6)).toBe(true)
    expect(polys(plan.entities, 'C-PKNG-OTLN')).toHaveLength(d.circulation.lots.length)
    const paving = polys(plan.entities, 'C-ROAD')
    expect(paving.length).toBeGreaterThan(0)
    expect(paving.every((e) => Math.abs(e.elevation - model.site!.z / 0.3048) < 1e-9 && e.thickness === 0)).toBe(true)
    // a plain mass (the engine's own: every building the app draws is a block since Phase D.2): its outline from its base, as thick as it is tall
    const plain = actions.addMass(p, { programId: 'guardhouse', footprint: { kind: 'rect', center: { x: 60, y: 60 }, width: 8, depth: 6, rotation: 0 }, levelId: p.buildings[0].levels[0].id })
    Object.assign(p, plain.project)
    const d2 = derive(p)
    const model2 = modelOf(p, d2, 'geometry')
    const plan2 = planOf(p, d2, three)
    const m = model2.masses.find((x) => x.id === plain.id)!
    const outlines = polys(plan2.entities, m.built ? 'A-WALL' : 'A-AREA-OTLN')
    expect(outlines.some((e) => Math.abs(e.elevation - m.floors[0] / 0.3048) < 1e-9 && Math.abs(e.thickness - m.height / 0.3048) < 1e-9)).toBe(true)
    const cl = poly3ds(plan.entities, 'C-ROAD-CNTR')[0]
    // the first street's (the sample's south street, an existing street, is on C-ROAD-EXST)
    expect(cl.points[0].z).toBeCloseTo(model.roads.find((r) => r.name !== 'Existing road')!.centre[0].z / 0.3048, 9)
    expect(cl.points[0].x).toBeGreaterThan(500000 / 0.3048)
  })

  it('(e) the writer: POLYLINE, VERTEX 32, SEQEND and a thickness (39) on the masses; dxf-parser reads it', () => {
    const p = onGround()
    const text = dxfOf(planOf(p, derive(p), three))
    const lines = text.split('\r\n')
    const count = (code: string, value?: string) => lines.filter((l, i) => i % 2 === 0 && l.trim() === code && (value === undefined || lines[i + 1] === value)).length
    expect(count('0', 'POLYLINE')).toBeGreaterThan(0)
    expect(count('0', 'VERTEX')).toBeGreaterThan(0)
    expect(count('70', '32')).toBe(count('0', 'VERTEX'))
    expect(count('0', 'SEQEND')).toBe(count('0', 'POLYLINE'))
    expect(count('39')).toBeGreaterThan(0)
    const dxf = new DxfParser().parseSync(text)!
    expect(dxf.entities.some((e) => e.type === 'POLYLINE')).toBe(true)
    expect(dxf.entities.some((e) => e.type === 'LWPOLYLINE')).toBe(true)
  })

  it('(f) labels, door lines and the dimensions stand at the site ground, a block’s axes, bubbles and names at its floors[0], not at 0', () => {
    // the sample: blocks (their axes the plan's only lines and circles since DI.1) on a terrain
    const p = sampleProject()
    p.dimensions = [{ id: 'd1', levelId: p.buildings[0].levels[0].id, a: { x: 0, y: 0 }, b: { x: 25, y: 0 }, offset: 5 }]
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const z = model.site!.z
    expect(z).toBeGreaterThan(0)
    const plan = planOf(p, d, three)
    const flatKinds = plan.entities.filter((e) => e.kind === 'line' || e.kind === 'circle' || e.kind === 'text' || e.kind === 'dim')
    for (const kind of ['line', 'circle', 'text', 'dim']) expect(flatKinds.some((e) => e.kind === kind), kind).toBe(true)
    // a block's interior (DI.3) stands on its mass's floors[0]; which block is the DI.3 tests' job
    const interior = new Set(['A-GRID', 'A-GRID-IDEN', 'A-AREA-IDEN'])
    const bases = blocksOf(p, d).map(({ m }) => model.masses.find((x) => x.id === m.id)!.floors[0])
    const elevation = (e: PlanEntity) => ('elevation' in e ? e.elevation! : NaN)
    expect(flatKinds.filter((e) => interior.has(e.layer)).every((e) => bases.some((b) => Math.abs(elevation(e) - b) < 1e-9))).toBe(true)
    expect(flatKinds.filter((e) => !interior.has(e.layer)).every((e) => Math.abs(elevation(e) - z) < 1e-9)).toBe(true)
    // everything else is a 3D polyline, a mass or a block's interior (DI.3), or a poly at the ground (the paving with its courts too, DI.2)
    const masses = new Set(['A-WALL', 'A-AREA-OTLN', 'S-COLS', 'A-AREA', 'A-GRID-MODL'])
    const loose = plan.entities.filter((e): e is Extract<PlanEntity, { kind: 'poly' }> => e.kind === 'poly' && !masses.has(e.layer))
    expect(loose.some((e) => e.layer === 'C-ROAD')).toBe(true)
    expect(loose.every((e) => Math.abs(e.elevation - z) < 1e-9)).toBe(true)
  })

  it('(f2) in feet, the flat entities’ elevation is the ground ÷ 0.3048', () => {
    const p = onGround()
    p.units = 'ft'
    const d = derive(p)
    const z = modelOf(p, d, 'geometry').site!.z
    const texts = on(planOf(p, d, three).entities, 'A-ANNO-TEXT')
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((t) => t.kind === 'text' && Math.abs(t.elevation! - z / 0.3048) < 1e-9)).toBe(true)
  })

  it('(g) the written LINE, CIRCLE, TEXT and DIMENSION carry that z; 2D keeps 0 and no elevation', () => {
    const p = sampleProject()
    p.dimensions = [{ id: 'd1', levelId: p.buildings[0].levels[0].id, a: { x: 0, y: 0 }, b: { x: 25, y: 0 }, offset: 5 }]
    const d = derive(p)
    const model = modelOf(p, d, 'geometry')
    const z = model.site!.z
    const bases = blocksOf(p, d).map(({ m }) => model.masses.find((x) => x.id === m.id)!.floors[0])
    const interior = new Set(['A-GRID', 'A-GRID-IDEN', 'A-AREA-IDEN'])
    const dxf = new DxfParser().parseSync(dxfOf(planOf(p, d, three)))!
    for (const type of ['LINE', 'CIRCLE', 'TEXT', 'DIMENSION']) expect(dxf.entities.some((e) => e.type === type), type).toBe(true)
    const zOf = (e: any): number[] => (e.type === 'LINE' ? e.vertices.map((v: any) => v.z) : e.type === 'CIRCLE' ? [e.center.z] : e.type === 'TEXT' ? [e.startPoint.z] : [e.anchorPoint.z, e.middleOfText.z, e.linearOrAngularPoint1.z, e.linearOrAngularPoint2.z])
    for (const e of dxf.entities.filter((x) => ['LINE', 'CIRCLE', 'TEXT', 'DIMENSION'].includes(x.type)))
      for (const v of zOf(e)) {
        // the ground, or (a block's axes, bubbles, names: DI.3) the base of one of the blocks
        if (interior.has(e.layer)) expect(bases.some((b) => Math.abs(v - b) < 1e-6)).toBe(true)
        else expect(v).toBeCloseTo(z, 6)
      }
    const twoD = planOf(p, d, flat)
    expect(twoD.entities.some((e) => 'elevation' in e && e.kind !== 'poly')).toBe(false)
    const flatDxf = new DxfParser().parseSync(dxfOf(twoD))!
    for (const e of flatDxf.entities.filter((x) => ['LINE', 'CIRCLE', 'TEXT'].includes(x.type))) for (const v of zOf(e)) expect(v ?? 0).toBe(0)
  })

  it('2D stays as it was: no 3D polylines, the masses flat', () => {
    const p = onGround()
    const plan = planOf(p, derive(p), flat)
    expect(poly3ds(plan.entities)).toEqual([])
    expect(polys(plan.entities, 'A-WALL').every((e) => e.elevation === 0 && e.thickness === 0)).toBe(true)
    expect(polys(plan.entities, 'C-TOPO-MINR')).toHaveLength(1)
  })
})

/** The sample (it has blocks) on the same sloped terrain as `onGround()`, without a frame so x and y stay as drawn. */
function blocksOnGround(units: 'm' | 'ft' = 'm') {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
  const p = setTerrain(sampleProject(), { contours: [{ points: [{ x: -100, y: 0 }, { x: 600, y: 0 }], z: 485 }], points })
  delete p.site.frame
  p.units = units
  const d = derive(p)
  const model = modelOf(p, d, 'geometry')
  const k = units === 'ft' ? 0.3048 : 1
  const blocks = blocksOf(p, d).map(({ m }) => {
    const mm = model.masses.find((x) => x.id === m.id)!
    return { id: m.id, polygon: mm.polygon, base: mm.floors[0] / k, height: mm.height / k }
  })
  /** The block an entity belongs to: the one whose outline is nearest (0 inside it). */
  const owner = (q: Point) => {
    const dist = (r: Polygon) => (pointInPolygon(q, r) ? 0 : Math.min(...r.map((c, i) => distancePointSegment(q, c, r[(i + 1) % r.length]))))
    return blocks.reduce((best, b) => (dist(b.polygon) < dist(best.polygon) ? b : best))
  }
  return { p, d, model, blocks, owner, k }
}

describe('planOf in 3D, a block’s interior (DI.3)', () => {
  it('walls and columns rise from the block’s floors[0] by its height; zones, axes, bubbles, names, module lines stand flat at that base', () => {
    const { p, d, model, blocks, owner } = blocksOnGround()
    expect(blocks.length).toBeGreaterThan(0)
    // the blocks are graded: their base is not the site's mean ground, and no two share one, so each entity below is
    // held to its own block's base, never another's
    expect(blocks.some((b) => Math.abs(b.base - model.site!.z) > 1e-6)).toBe(true)
    expect(blocks.length).toBeGreaterThan(1)
    expect(new Set(blocks.map((b) => b.base.toFixed(3))).size).toBe(blocks.length)
    const es = planOf(p, d, three).entities
    for (const layer of ['A-WALL', 'S-COLS']) {
      const mine = polys(es, layer).filter((e) => blocks.some((b) => pointInPolygon(e.points[0], b.polygon) || b.polygon.some((c, i) => distancePointSegment(e.points[0], c, b.polygon[(i + 1) % b.polygon.length]) <= 1e-4)))
      expect(mine.length, layer).toBeGreaterThan(0)
      for (const e of mine) {
        const b = owner(e.points[0])
        expect(e.elevation, layer).toBeCloseTo(b.base, 9)
        expect(e.thickness, layer).toBeCloseTo(b.height, 9)
        expect(e.thickness, layer).toBeGreaterThan(0)
      }
    }
    for (const layer of ['A-AREA', 'A-GRID-MODL']) {
      const flatPolys = polys(es, layer)
      expect(flatPolys.length, layer).toBeGreaterThan(0)
      for (const e of flatPolys) {
        const b = owner(e.points[0])
        expect(e.elevation, layer).toBeCloseTo(b.base, 9)
        expect(e.thickness, layer).toBe(0)
      }
    }
    const at = (e: PlanEntity): Point => (e.kind === 'line' ? { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } : e.kind === 'circle' ? e.c : e.kind === 'text' ? e.at : { x: 0, y: 0 })
    for (const layer of ['A-GRID', 'A-GRID-IDEN', 'A-AREA-IDEN']) {
      const flats = on(es, layer).filter((e) => e.kind === 'line' || e.kind === 'circle' || e.kind === 'text')
      expect(flats.length, layer).toBeGreaterThan(0)
      for (const e of flats) expect((e as { elevation?: number }).elevation, layer).toBeCloseTo(owner(at(e)).base, 9)
    }
    expect(on(es, 'A-GRID-IDEN').some((e) => e.kind === 'circle')).toBe(true)
    expect(on(es, 'A-GRID-IDEN').some((e) => e.kind === 'text')).toBe(true)
  })

  it('in feet, those z and thicknesses are ÷ 0.3048', () => {
    const { p, d, blocks, owner } = blocksOnGround('ft')
    const es = planOf(p, d, three).entities
    for (const layer of ['A-WALL', 'S-COLS']) {
      const mine = polys(es, layer).filter((e) => e.thickness > 0)
      expect(mine.length, layer).toBeGreaterThan(0)
      for (const e of mine.filter((x) => blocks.some((b) => b.polygon.some((c, i) => distancePointSegment({ x: x.points[0].x * 0.3048, y: x.points[0].y * 0.3048 }, c, b.polygon[(i + 1) % b.polygon.length]) <= 1e-3)))) {
        const b = owner({ x: e.points[0].x * 0.3048, y: e.points[0].y * 0.3048 })
        expect(e.elevation, layer).toBeCloseTo(b.base, 9)
        expect(e.thickness, layer).toBeCloseTo(b.height, 9)
      }
    }
    const axes = on(es, 'A-GRID').filter((e) => e.kind === 'line')
    expect(axes.length).toBeGreaterThan(0)
    for (const e of axes) {
      const b = owner({ x: ((e.kind === 'line' ? e.a.x + e.b.x : 0) / 2) * 0.3048, y: ((e.kind === 'line' ? e.a.y + e.b.y : 0) / 2) * 0.3048 })
      expect((e as { elevation?: number }).elevation).toBeCloseTo(b.base, 9)
    }
  })

  it('2D unchanged: all at 0, no elevation on the lines, circles and texts', () => {
    const { p, d } = blocksOnGround()
    const es = planOf(p, d, flat).entities
    for (const layer of ['A-WALL', 'S-COLS', 'A-AREA', 'A-GRID-MODL']) {
      expect(polys(es, layer).length, layer).toBeGreaterThan(0)
      expect(polys(es, layer).every((e) => e.elevation === 0 && e.thickness === 0), layer).toBe(true)
    }
    for (const layer of ['A-GRID', 'A-GRID-IDEN', 'A-AREA-IDEN']) {
      const flats = on(es, layer)
      expect(flats.length, layer).toBeGreaterThan(0)
      expect(flats.some((e) => 'elevation' in e), layer).toBe(false)
    }
  })
})

// ---- Reference lines and notes (Phase AS.5, task 7) ------------------------------------------------------------------

type Text = Extract<PlanEntity, { kind: 'text' }>
const textsAt = (es: PlanEntity[], layer: string) => on(es, layer).filter((e): e is Text => e.kind === 'text')

/** A building that no option shows, with its one level `l2`: a note on it is not the option's. */
const hiddenBuilding = (p: Project) =>
  p.buildings.push({ id: 'b2', name: 'Elsewhere', color: '#000000', levelHeight: 5, levels: [{ id: 'l2', name: 'Level 2', elevation: 0, height: 5, repeat: 1 }] })

describe('planOf: reference lines and notes (AS.5)', () => {
  it('the two layers: A-ANNO-REFR dashed, colour 8, 0.13 mm; A-ANNO-NOTE as A-ANNO-TEXT, colour 7, 0.18 mm', () => {
    expect(PLAN_LAYERS['A-ANNO-REFR']).toEqual({ weight: 0.13, linetype: 'DASHED', color: 8 })
    expect(PLAN_LAYERS['A-ANNO-NOTE']).toEqual({ weight: 0.18, linetype: 'CONTINUOUS', color: 7 })
    expect(PLAN_LAYERS['A-ANNO-NOTE']).toEqual(PLAN_LAYERS['A-ANNO-TEXT'])
  })

  it('a reference line is an open polyline on A-ANNO-REFR with its points as they are, straight', () => {
    const p = blank((q) => {
      q.referenceLines = [{ id: 'r1', points: [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 12 }] }]
    })
    const es = planOf(p, derive(p), flat).entities
    expect(on(es, 'A-ANNO-REFR')).toEqual([
      { kind: 'poly', layer: 'A-ANNO-REFR', points: [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 12 }], bulges: [0, 0, 0], closed: false, elevation: 0, thickness: 0 },
    ])
  })

  it('every reference line of the project is written: they are the project’s, on no level', () => {
    const p = blank((q) => {
      q.referenceLines = [
        { id: 'r1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
        { id: 'r2', points: [{ x: 0, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 9 }], locked: true, group: 'g1' },
      ]
    })
    const lines = polys(planOf(p, derive(p), flat).entities, 'A-ANNO-REFR')
    expect(lines.map((l) => l.points.length)).toEqual([2, 3])
    expect(lines.every((l) => !l.closed)).toBe(true)
  })

  it('a reference line in feet and in the survey’s frame: (q + origin) ÷ 0.3048', () => {
    const origin = { x: 500000, y: 2800000 }
    const p = blank((q) => {
      q.units = 'ft'
      q.site.frame = { units: 'ft', origin }
      q.referenceLines = [{ id: 'r1', points: [{ x: 10, y: 20 }, { x: 40, y: 20 }] }]
    })
    const [l] = polys(planOf(p, derive(p), flat).entities, 'A-ANNO-REFR')
    expect(l.points[0].x).toBeCloseTo((10 + origin.x) / 0.3048, 6)
    expect(l.points[0].y).toBeCloseTo((20 + origin.y) / 0.3048, 6)
    expect(l.points[1].x - l.points[0].x).toBeCloseTo(30 / 0.3048, 6)
  })

  it('a note is a left-aligned text on A-ANNO-NOTE at its point, TEXT_M high, at its angle', () => {
    const p = blank((q) => {
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 10, y: 20 }, text: 'Fire lane', angle: 30 }]
    })
    expect(textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')).toEqual([
      { kind: 'text', layer: 'A-ANNO-NOTE', at: { x: 10, y: 20 }, height: TEXT_M, text: 'Fire lane', align: 'left', angle: 30 },
    ])
  })

  it('a note with no angle is written at 0; its size does not change the CAD height', () => {
    const p = blank((q) => {
      q.notes = [
        { id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'a' },
        { id: 't2', levelId: 'l1', at: { x: 0, y: 5 }, text: 'b', size: 'small' },
        { id: 't3', levelId: 'l1', at: { x: 0, y: 10 }, text: 'c', size: 'large' },
      ]
    })
    const ts = textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')
    expect(ts.map((t) => t.angle)).toEqual([0, 0, 0])
    expect(ts.map((t) => t.height)).toEqual([TEXT_M, TEXT_M, TEXT_M])
  })

  it('a note of three lines: three texts, each line 1.5 text heights below the last, as the labels’ lines are', () => {
    const p = blank((q) => {
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 10, y: 20 }, text: 'one\ntwo\nthree' }]
    })
    const ts = textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')
    expect(ts.map((t) => t.text)).toEqual(['one', 'two', 'three'])
    expect(ts.map((t) => t.at)).toEqual([{ x: 10, y: 20 }, { x: 10, y: 20 - 1.5 * TEXT_M }, { x: 10, y: 20 - 3 * TEXT_M }])
    expect(ts.every((t) => t.align === 'left')).toBe(true)
  })

  it('the lines split on \\r\\n, \\r and \\n; a blank line writes nothing and the others keep their place', () => {
    const p = blank((q) => {
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'a\r\nb\rc\n\nd' }]
    })
    const ts = textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')
    expect(ts.map((t) => t.text)).toEqual(['a', 'b', 'c', 'd'])
    expect(ts.map((t) => t.at.y)).toEqual([0, -1.5 * TEXT_M, -3 * TEXT_M, -6 * TEXT_M])
    const empty = blank((q) => {
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: '  \n' }]
    })
    expect(on(planOf(empty, derive(empty), flat).entities, 'A-ANNO-NOTE')).toEqual([])
  })

  it('a turned note’s lines stay stacked square to its text: down is (sin a, −cos a)', () => {
    const p = blank((q) => {
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 10, y: 20 }, text: 'one\ntwo\nthree', angle: 90 }]
    })
    const ts = textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')
    expect(ts.map((t) => t.angle)).toEqual([90, 90, 90])
    ts.forEach((t, i) => {
      expect(t.at.x).toBeCloseTo(10 + i * 1.5 * TEXT_M, 9)
      expect(t.at.y).toBeCloseTo(20, 9)
    })
    // at 45° each step is along (sin, −cos) of the angle
    const q = blank((x) => {
      x.notes = [{ id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'a\nb', angle: 45 }]
    })
    const [a, b] = textsAt(planOf(q, derive(q), flat).entities, 'A-ANNO-NOTE')
    const step = 1.5 * TEXT_M
    expect(b.at.x - a.at.x).toBeCloseTo(step * Math.sin(Math.PI / 4), 9)
    expect(b.at.y - a.at.y).toBeCloseTo(-step * Math.cos(Math.PI / 4), 9)
  })

  it('only the notes on the levels of the option’s buildings', () => {
    const p = blank((q) => {
      hiddenBuilding(q)
      q.notes = [
        { id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'shown' },
        { id: 't2', levelId: 'l2', at: { x: 5, y: 5 }, text: 'elsewhere' },
      ]
    })
    expect(textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE').map((t) => t.text)).toEqual(['shown'])
  })

  it('a note in feet and in the survey’s frame: point and height ÷ 0.3048, the step too; the angle is the angle', () => {
    const origin = { x: 500000, y: 2800000 }
    const p = blank((q) => {
      q.units = 'ft'
      q.site.frame = { units: 'ft', origin }
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 10, y: 20 }, text: 'one\ntwo', angle: 90 }]
    })
    const [a, b] = textsAt(planOf(p, derive(p), flat).entities, 'A-ANNO-NOTE')
    expect(a.at.x).toBeCloseTo((10 + origin.x) / 0.3048, 6)
    expect(a.at.y).toBeCloseTo((20 + origin.y) / 0.3048, 6)
    expect(a.height).toBeCloseTo(TEXT_M / 0.3048, 9)
    expect(b.at.x - a.at.x).toBeCloseTo((1.5 * TEXT_M) / 0.3048, 6)
    expect(a.angle).toBe(90)
  })

  it('2D: no elevation on a note; the line stands at 0', () => {
    const p = blank((q) => {
      q.referenceLines = [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }]
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'a' }]
    })
    const es = planOf(p, derive(p), flat).entities
    expect(textsAt(es, 'A-ANNO-NOTE').some((t) => 'elevation' in t)).toBe(false)
    expect(polys(es, 'A-ANNO-REFR')[0].elevation).toBe(0)
  })

  it('3D: both stand at the site’s ground, as the dimensions and the other flat things do', () => {
    const p = onGround()
    const level = p.buildings[0].levels[0].id
    p.referenceLines = [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }]
    p.notes = [{ id: 't1', levelId: level, at: { x: 0, y: 0 }, text: 'one\ntwo' }]
    p.dimensions = [{ id: 'd1', levelId: level, a: { x: 0, y: 0 }, b: { x: 25, y: 0 }, offset: 5 }]
    const d = derive(p)
    const z = modelOf(p, d, 'geometry').site!.z
    expect(z).toBeGreaterThan(0)
    const es = planOf(p, d, three).entities
    expect(polys(es, 'A-ANNO-REFR')[0]).toMatchObject({ elevation: z, thickness: 0, closed: false })
    const ts = textsAt(es, 'A-ANNO-NOTE')
    expect(ts).toHaveLength(2)
    expect(ts.every((t) => Math.abs(t.elevation! - z) < 1e-9)).toBe(true)
    expect(on(es, 'A-ANNO-DIMS').every((e) => e.kind === 'dim' && Math.abs(e.elevation! - z) < 1e-9)).toBe(true)
    // in feet the elevation is ÷ 0.3048 like every length
    p.units = 'ft'
    const ft = planOf(p, derive(p), three).entities
    expect(polys(ft, 'A-ANNO-REFR')[0].elevation).toBeCloseTo(z / 0.3048, 9)
    expect(textsAt(ft, 'A-ANNO-NOTE').every((t) => Math.abs(t.elevation! - z / 0.3048) < 1e-9)).toBe(true)
  })

  it('what is hidden or locked is still written: the export never reads view state', () => {
    const p = blank((q) => {
      q.referenceLines = [{ id: 'r1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], locked: true }]
      q.notes = [{ id: 't1', levelId: 'l1', at: { x: 0, y: 0 }, text: 'kept', locked: true }]
    })
    const keys = [REFERENCE_LINES, referenceLine('r1'), NOTES, note('t1')]
    useLayerView.getState().setHidden(keys, true)
    try {
      expect(keys.every((k) => useLayerView.getState().hidden.includes(k))).toBe(true)
      const es = planOf(p, derive(p), flat).entities
      expect(polys(es, 'A-ANNO-REFR')).toHaveLength(1)
      expect(textsAt(es, 'A-ANNO-NOTE').map((t) => t.text)).toEqual(['kept'])
    } finally {
      useLayerView.getState().setHidden(keys, false)
    }
  })

  it('a project with none: nothing on the two layers (they are declared, as every layer of the table is), the demo’s entities as they were', () => {
    const p = demoProject()
    const plan = planOf(p, derive(p), flat)
    expect(on(plan.entities, 'A-ANNO-REFR')).toEqual([])
    expect(on(plan.entities, 'A-ANNO-NOTE')).toEqual([])
    expect(Object.keys(plan.layers)).toEqual(expect.arrayContaining(['A-ANNO-REFR', 'A-ANNO-NOTE']))
    // the labels carry no angle: written exactly as before
    expect(textsAt(plan.entities, 'A-ANNO-TEXT').every((t) => !('angle' in t))).toBe(true)
    expect(plan.entities.every((e) => e.layer !== 'A-ANNO-REFR' && e.layer !== 'A-ANNO-NOTE')).toBe(true)
  })
})
