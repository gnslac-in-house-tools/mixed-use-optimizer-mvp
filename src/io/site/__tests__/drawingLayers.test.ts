// A site file's other layers (Phase DL.1, Decision "Drawing layers"): its arcs, circles and the arcs of its polylines
// kept as lines, each layer's colour; the kinds Parcels and Reference, guessed and read on the plan; the import that
// keeps them, a second drawing for its references alone, and a drawing taken out.
import { describe, expect, it } from 'vitest'
import type { Contour } from '../../../model/schema.ts'
import { importSiteFile, removeSiteDrawing } from '../../../state/actions/site.ts'
import { demoProject } from '../../../state/demo.ts'
import { dwgDrawing } from '../dwg.ts'
import { drawingOf, readDxf, strokeOf, type Entity } from '../dxf.ts'
import { guessedKinds, readChosen, surveyLayers } from '../survey.ts'

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]
const lw = (layer: string, vertices: { x: number; y: number; bulge?: number }[], shape = false): Entity => ({ type: 'LWPOLYLINE', layer, shape, vertices })

describe('the lines a reference keeps', () => {
  it('arcs and circles as lines of corners, a polyline’s arcs too, each layer’s colour', () => {
    const d = drawingOf(
      [
        { type: 'ARC', layer: 'TREES', center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 },
        { type: 'CIRCLE', layer: 'TREES', center: { x: 10, y: 0 }, radius: 1 },
        // a half circle from (0, 0) to (2, 0): bulge 1
        lw('WALLS', [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0 }]),
      ],
      6,
      { TREES: 3 },
    )
    expect(d.colors).toEqual({ TREES: 3 })
    const [arc, circle] = d.curves
    expect(arc.closed).toBe(false)
    expect(arc.points[0]).toMatchObject({ x: 2, y: 0 })
    expect(arc.points.at(-1)!.x).toBeCloseTo(0)
    expect(arc.points.at(-1)!.y).toBeCloseTo(2)
    expect(circle.closed).toBe(true)
    expect(circle.points.every((p) => Math.abs(Math.hypot(p.x - 10, p.y) - 1) < 1e-9)).toBe(true)
    // the polyline keeps its bulge, and its stroke goes round the arc: below the chord (counter-clockwise from 0, 0)
    const wall = d.lines.find((l) => l.layer === 'WALLS')!
    expect(wall.bulges).toEqual([1, 0])
    const stroke = strokeOf(wall)
    expect(stroke.length).toBeGreaterThan(10)
    expect(Math.min(...stroke.map((p) => p.y))).toBeCloseTo(-1)
    expect(stroke.at(-1)!.x).toBeCloseTo(2)
  })

  it('a DXF’s layer table gives the colours', () => {
    const text = [
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER',
      '0', 'LAYER', '2', 'A-SITE', '70', '0', '62', '3', '6', 'CONTINUOUS',
      '0', 'ENDTAB', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'A-SITE', '10', '0', '20', '0', '30', '0', '11', '5', '21', '0', '31', '0',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n')
    expect(readDxf(text).colors).toEqual({ 'A-SITE': 3 })
  })
})

describe('parcels and references, surveyed', () => {
  // the user's civil drawing, in small: the parcel, three subdivisions inside it, buildings and trees round it, and a
  // title block far off
  const d = drawingOf(
    [
      lw('POLIGONAL', square(0, 0, 100), true),
      lw('AUX-BOUNDARY', square(10, 10, 30), true),
      lw('AUX-BOUNDARY', square(50, 10, 20), true),
      lw('A-SITE', [{ x: 5, y: 90 }, { x: 95, y: 90 }]),
      { type: 'CIRCLE', layer: 'ARBOLES', center: { x: 80, y: 80 }, radius: 2 },
      lw('An-Pie de plano', square(5000, 5000, 800), true),
    ],
    6,
    { 'A-SITE': 251, ARBOLES: 3 },
  )
  const layers = surveyLayers(d)
  const kinds = guessedKinds(layers)

  it('subdivisions are parcels before they are a boundary; lines round the site are references, a title block far off is not', () => {
    expect(kinds).toMatchObject({ POLIGONAL: 'boundary', 'AUX-BOUNDARY': 'parcels', 'A-SITE': 'reference', ARBOLES: 'reference', 'An-Pie de plano': 'ignore' })
    expect(layers.find((l) => l.name === 'ARBOLES')).toMatchObject({ curves: 1, shapes: 1 })
  })

  it('read on the plan: the parcels named by layer and number, biggest first; each reference with its lines and colour', () => {
    const r = readChosen(d, { units: 'm', coordinates: { kind: 'local' }, kinds })
    expect(r.candidates.map((c) => c.name)).toEqual(['POLIGONAL'])
    expect(r.parcels.map((p) => [p.name, Math.round(p.area)])).toEqual([
      ['AUX-BOUNDARY 1', 900],
      ['AUX-BOUNDARY 2', 400],
    ])
    expect(r.references.map((l) => [l.name, l.color, l.lines.length])).toEqual([
      ['A-SITE', 251, 1],
      ['ARBOLES', 3, 1],
    ])
    // the middle of the site at the origin (the references do not move it), the circle closed
    expect(r.references[0].lines[0]).toEqual({ points: [{ x: -45, y: 40 }, { x: 45, y: 40 }] })
    expect(r.references[1].lines[0].closed).toBe(true)
  })
})

describe('the import of drawings', () => {
  const sq = (s: number): Contour => ({ vertices: square(0, 0, s).map((p) => ({ ...p, r: 0 })) })
  const drawing = (file: string, layer = 'A-SITE') => ({ file, layers: [{ name: layer, lines: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] }] })
  const parcel = (file: string, name: string) => ({ name, contour: sq(5), file })

  it('a site brings its drawing and parcels; a second file adds its own; the same file again replaces its own', () => {
    const p = importSiteFile(demoProject(), { name: 'civil.dwg', boundary: sq(100), drawing: drawing('civil.dwg'), parcels: [parcel('civil.dwg', 'AUX 1')] })
    expect(p.site.drawings?.map((d) => d.file)).toEqual(['civil.dwg'])
    expect(p.site.parcels?.map((x) => x.name)).toEqual(['AUX 1'])
    // references alone: the boundary stays
    const q = importSiteFile(p, { name: 'frisa.dwg', drawing: drawing('frisa.dwg') })
    expect(q.site.boundary).toBe(p.site.boundary)
    expect(q.site.drawings?.map((d) => d.file)).toEqual(['civil.dwg', 'frisa.dwg'])
    const again = importSiteFile(q, { name: 'frisa.dwg', drawing: drawing('frisa.dwg', 'ARQ-EDIF') })
    expect(again.site.drawings?.map((d) => [d.file, d.layers[0].name])).toEqual([
      ['civil.dwg', 'A-SITE'],
      ['frisa.dwg', 'ARQ-EDIF'],
    ])
    // a new boundary is another frame: the old site's drawings and parcels go
    const other = importSiteFile(again, { name: 'other.dxf', boundary: sq(50) })
    expect(other.site.drawings).toBeUndefined()
    expect(other.site.parcels).toBeUndefined()
  })

  it('a drawing taken out goes with the parcels it brought', () => {
    const p = importSiteFile(demoProject(), { name: 'civil.dwg', boundary: sq(100), drawing: drawing('civil.dwg'), parcels: [parcel('civil.dwg', 'AUX 1')] })
    const q = importSiteFile(p, { name: 'frisa.dwg', drawing: drawing('frisa.dwg') })
    const r = removeSiteDrawing(q, 'civil.dwg')
    expect(r.site.drawings?.map((d) => d.file)).toEqual(['frisa.dwg'])
    expect(r.site.parcels).toBeUndefined()
    expect(removeSiteDrawing(r, 'nothing.dwg')).toBe(r)
  })
})

describe('blocks, placed as lines of reference', () => {
  // a tree: a circle of 1 and a cross, its base at its middle; a block inside a block
  const blocks = {
    TREE: { base: { x: 0, y: 0 }, entities: [{ type: 'CIRCLE', layer: '0', center: { x: 0, y: 0 }, radius: 1 }, lw('0', [{ x: -1, y: 0 }, { x: 1, y: 0 }])] as Entity[] },
    GROVE: { base: { x: 0, y: 0 }, entities: [{ type: 'INSERT', layer: 'ARBOLES', name: 'TREE', position: { x: 10, y: 0 } }] as Entity[] },
  }

  it('scaled, turned and moved as its INSERT says; what is on layer 0 takes the INSERT’s layer; a block in a block too', () => {
    const d = drawingOf(
      [
        { type: 'INSERT', layer: 'ARBOLES', name: 'TREE', position: { x: 100, y: 50 }, xScale: 2, yScale: 2, rotation: 90 },
        { type: 'INSERT', layer: 'MISC', name: 'GROVE', position: { x: 0, y: 0 } },
        { type: 'INSERT', layer: 'MISC', name: 'NONE', position: { x: 0, y: 0 } },
      ],
      6,
      {},
      blocks,
    )
    const trees = d.curves.filter((l) => l.layer === 'ARBOLES')
    expect(trees).toHaveLength(4)
    // the circle: radius 2 round (100, 50); the cross line turned 90°: from (100, 48) to (100, 52)
    expect(trees[0].points.every((p) => Math.abs(Math.hypot(p.x - 100, p.y - 50) - 2) < 1e-9)).toBe(true)
    expect(trees[1].points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [100, 48],
      [100, 52],
    ])
    // the grove's tree, at (10, 0): its own layer (ARBOLES), not the grove's
    expect(trees[2].points.every((p) => Math.abs(Math.hypot(p.x - 10, p.y) - 1) < 1e-9)).toBe(true)
    // a block with no definition is left out, as before
    expect(d.warnings).toEqual(['1 blocks (explode them to read them) left out'])
  })

  it('a DWG’s block: its rotation in radians, its definition from the block records', () => {
    const d = dwgDrawing(
      [{ type: 'INSERT', layer: 'ARBOLES', name: 'T', insertionPoint: { x: 5, y: 5 }, xScale: 1, yScale: 1, rotation: Math.PI / 2 }],
      6,
      [],
      [
        { name: '*Model_Space', entities: [] },
        { name: 'T', basePoint: { x: 0, y: 0, z: 0 }, entities: [{ type: 'LINE', layer: '0', startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 0 } }] },
      ],
    )
    expect(d.curves.map((l) => l.points.map((p) => [Math.round(p.x), Math.round(p.y)]))).toEqual([
      [
        [5, 5],
        [5, 6],
      ],
    ])
    expect(surveyLayers(d).find((l) => l.name === 'ARBOLES')?.curves).toBe(1)
  })
})
