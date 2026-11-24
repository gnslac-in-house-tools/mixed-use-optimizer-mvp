// A file surveyed (Phase E.1b, Decision "Site file survey"): the DXF's lines kept with their heights, its points and
// texts; each layer with what it holds and a guess by its name; the chosen layers read in one frame (local, UTM, the
// site's, or through the site's georeference), contours joined from pieces, drawn flat or at their heights, a 3D line's
// corners as points; a CSV's columns guessed; the file imported in one undo step.
import { describe, expect, it } from 'vitest'
import { toPlan } from '../../../engine/geo/local.ts'
import { fromUtm } from '../../../engine/geo/utm.ts'
import type { Contour } from '../../../model/schema.ts'
import { importSite, importSiteFile } from '../../../state/actions/site.ts'
import { demoProject } from '../../../state/demo.ts'
import { csvDrawing, readCsv } from '../csv.ts'
import { readDxf } from '../dxf.ts'
import { guessedKinds, guessedUnits, looksLikeUtmAll, readChosen, surveyLayers, type LayerKind } from '../survey.ts'

/** An ASCII DXF: the header's $INSUNITS (absent: none) and the entities, each as its group codes and values. */
function dxf(entities: (string | number)[][], insunits?: number): string {
  const lines: (string | number)[] = []
  if (insunits !== undefined) lines.push(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, insunits, 0, 'ENDSEC')
  lines.push(0, 'SECTION', 2, 'ENTITIES')
  for (const e of entities) lines.push(...e)
  lines.push(0, 'ENDSEC', 0, 'EOF')
  return lines.join('\n') + '\n'
}

/** An LWPOLYLINE on `layer` at `elevation`. */
function lw(layer: string, vs: [number, number][], closed = false, elevation?: number): (string | number)[] {
  const out: (string | number)[] = [0, 'LWPOLYLINE', 8, layer, 90, vs.length, 70, closed ? 1 : 0]
  if (elevation !== undefined) out.push(38, elevation)
  for (const [x, y] of vs) out.push(10, x, 20, y)
  return out
}

/** A 3D POLYLINE on `layer`, each corner at its own height. */
function poly3d(layer: string, vs: [number, number, number][]): (string | number)[] {
  const out: (string | number)[] = [0, 'POLYLINE', 8, layer, 66, 1, 70, 8, 10, 0, 20, 0, 30, 0]
  for (const [x, y, z] of vs) out.push(0, 'VERTEX', 8, layer, 10, x, 20, y, 30, z, 70, 32)
  out.push(0, 'SEQEND', 8, layer)
  return out
}

const line = (layer: string, a: [number, number, number], b: [number, number, number]) => [0, 'LINE', 8, layer, 10, a[0], 20, a[1], 30, a[2], 11, b[0], 21, b[1], 31, b[2]]
const point = (layer: string, x: number, y: number, z: number) => [0, 'POINT', 8, layer, 10, x, 20, y, 30, z]
const text = (layer: string, x: number, y: number, s: string) => [0, 'TEXT', 8, layer, 10, x, 20, y, 30, 0, 40, 2.5, 1, s]

/** A surveyor's file, mixed: a parcel, master and minor contours, points, height labels and a stray line. */
const MIXED = dxf([
  lw('POLIGONAL', [[0, 0], [100, 0], [100, 60], [0, 60]], true),
  lw('CN_MAESTRAS', [[0, 10], [100, 10]], false, 1200),
  lw('CN_MAESTRAS', [[0, 50], [100, 50]], false, 1205),
  lw('CN_SECUND', [[0, 20], [100, 20]], false, 1201),
  point('PUNTOS', 50, 30, 1202.5),
  point('PUNTOS', 20, 40, 1203.7),
  text('COTAS', 50, 10, '1200'),
  line('0', [0, 0, 0], [5, 5, 0]),
])

const kinds = (k: Record<string, LayerKind>) => k

describe('the drawing, for the ground', () => {
  it('keeps each line as drawn with its heights, the points and how many texts each layer has', () => {
    const d = readDxf(dxf([lw('CN', [[0, 0], [10, 0]], false, 1205), poly3d('BRK', [[0, 0, 1], [5, 0, 2], [10, 0, 4]]), line('L', [0, 0, 3], [1, 1, 3]), point('P', 1, 2, 3), text('T', 0, 0, 'a'), text('T', 0, 0, 'b')]))
    expect(d.lines.map((l) => [l.layer, l.points.map((p) => p.z)])).toEqual([
      ['CN', [1205, 1205]],
      ['BRK', [1, 2, 4]],
      ['L', [3, 3]],
    ])
    expect(d.points).toEqual([{ x: 1, y: 2, z: 3, layer: 'P' }])
    expect(d.texts).toEqual({ T: 2 })
  })
})

describe('the survey', () => {
  it('each layer with what it holds and its heights, guessed by its name and what it has', () => {
    const layers = surveyLayers(readDxf(MIXED))
    expect(layers.map((l) => [l.name, l.guess])).toEqual([
      ['POLIGONAL', 'boundary'],
      ['CN_MAESTRAS', 'contours'],
      ['CN_SECUND', 'contours'],
      // a text that is a number is a spot height: points (Decision "Survey points and roads")
      ['COTAS', 'points'],
      ['PUNTOS', 'points'],
      // lines round the site that no name says what they are: a reference (Decision "Drawing layers")
      ['0', 'reference'],
    ])
    expect(layers.find((l) => l.name === 'POLIGONAL')).toMatchObject({ shapes: 1, lines: 1, heights: null })
    expect(layers.find((l) => l.name === 'CN_MAESTRAS')).toMatchObject({ lines: 2, heights: { min: 1200, max: 1205 } })
    expect(layers.find((l) => l.name === 'COTAS')).toMatchObject({ texts: 1, labels: 1, lines: 0 })
  })

  it('a name guesses only what the layer holds; accents and case do not matter', () => {
    const layers = surveyLayers(readDxf(dxf([lw('Límite del Predio', [[0, 0], [9, 0], [9, 9]], true), text('TOPO', 0, 0, 'x'), point('curvas', 0, 0, 1)])))
    expect(guessedKinds(layers)).toEqual({ 'Límite del Predio': 'boundary', TOPO: 'ignore', curvas: 'ignore' })
  })
})

describe('the chosen layers, read', () => {
  const chosen = kinds({ POLIGONAL: 'boundary', CN_MAESTRAS: 'contours', CN_SECUND: 'contours', PUNTOS: 'points' })

  it('local: moved so the middle of what was chosen is the origin, the frame kept; contours at their heights, points', () => {
    const r = readChosen(readDxf(MIXED), { units: 'm', coordinates: { kind: 'local' }, kinds: chosen })
    expect(r.frame).toEqual({ units: 'm', origin: { x: 50, y: 30 } })
    expect(r.geo).toBeNull()
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].area).toBeCloseTo(6000, 6)
    expect(r.contours.map((c) => [c.z, c.points[0]])).toEqual(
      expect.arrayContaining([
        [1200, { x: -50, y: -20 }],
        [1205, { x: -50, y: 20 }],
        [1201, { x: -50, y: -10 }],
      ]),
    )
    expect(r.points).toEqual([
      { x: 0, y: 0, z: 1202.5 },
      { x: -30, y: 10, z: 1203.7 },
    ])
    expect(r.layers.sort()).toEqual(['CN_MAESTRAS', 'CN_SECUND', 'PUNTOS'])
  })

  it('a contour drawn as pieces is one; a layer all at 0 is drawn flat; a closed one stays closed; a 3D line gives points', () => {
    const d = readDxf(
      dxf([
        line('CN', [0, 0, 0], [10, 0, 0]),
        line('CN', [20, 0, 0], [10, 0, 0]),
        line('CN', [20, 0, 0], [30, 5, 0]),
        lw('CN', [[0, 20], [10, 20], [10, 30]], true),
        poly3d('BRK', [[0, 40, 1], [10, 40, 2]]),
      ]),
    )
    const r = readChosen(d, { units: 'm', coordinates: { kind: 'local' }, kinds: { CN: 'contours', BRK: 'contours' } })
    expect(r.contours).toHaveLength(2)
    const open = r.contours.find((c) => !c.closed)!
    expect(open.points).toHaveLength(4)
    expect(open.z).toBeUndefined()
    expect(r.contours.find((c) => c.closed)!.points).toHaveLength(3)
    expect(r.points.map((p) => p.z)).toEqual([1, 2])
  })

  it('a drawing in mm comes in metres, its heights too; points all at 0 are left out with why', () => {
    const r = readChosen(readDxf(dxf([lw('CN', [[0, 0], [10000, 0]], false, 1205000), point('P', 0, 0, 0)], 4)), {
      units: 'mm',
      coordinates: { kind: 'local' },
      kinds: { CN: 'contours', P: 'points' },
    })
    expect(r.contours[0]).toMatchObject({ z: 1205, points: [{ x: -5, y: 0 }, { x: 5, y: 0 }] })
    expect(r.points).toEqual([])
    expect(r.warnings).toEqual([expect.stringMatching(/^P: its points are all at 0/)])
  })

  it('UTM: the georeference its zone gives the middle, the zone kept with the frame', () => {
    const u = { zone: 14, south: false, x: 480000, y: 2140000 }
    const r = readChosen(readDxf(dxf([lw('LOT', [[u.x - 50, u.y - 30], [u.x + 50, u.y - 30], [u.x + 50, u.y + 30], [u.x - 50, u.y + 30]], true)])), {
      units: 'm',
      coordinates: { kind: 'utm', zone: 14, south: false },
      kinds: { LOT: 'boundary' },
    })
    expect(r.frame).toEqual({ units: 'm', origin: { x: u.x, y: u.y }, utm: { zone: 14, south: false } })
    expect(r.geo!.lat).toBeCloseTo(fromUtm(u).lat, 9)
    expect(looksLikeUtmAll(readDxf(dxf([point('P', u.x, u.y, 1)])), 'm')).toBe(true)
    expect(looksLikeUtmAll(readDxf(MIXED), 'm')).toBe(false)
  })

  it('as the site’s: another file of the same coordinates, in other units, lands on the first', () => {
    const first = readChosen(readDxf(MIXED), { units: 'm', coordinates: { kind: 'local' }, kinds: chosen })
    const mm = readDxf(dxf([point('P', 50000, 30000, 1202500)], 4))
    const r = readChosen(mm, { units: 'mm', coordinates: { kind: 'site' }, kinds: { P: 'points' } }, { frame: first.frame! })
    expect(r.points).toEqual([{ x: 0, y: 0, z: 1202.5 }])
    expect(r.frame).toBe(first.frame)
    expect(() => readChosen(mm, { units: 'mm', coordinates: { kind: 'site' }, kinds: { P: 'points' } }, {})).toThrow(/came from no file/)
  })

  it('a UTM file of ground alone, on a site located without a frame, lands through its georeference', () => {
    const geo = { lat: 19.35, lon: -99.2, north: 0 }
    const r = readChosen(readDxf(dxf([point('P', 478000, 2139500, 2300)])), { units: 'm', coordinates: { kind: 'utm', zone: 14, south: false }, kinds: { P: 'points' } }, { geo })
    const at = toPlan(geo, fromUtm({ zone: 14, south: false, x: 478000, y: 2139500 }))
    expect(r.points[0].x).toBeCloseTo(at.x, 6)
    expect(r.points[0].y).toBeCloseTo(at.y, 6)
    expect(r.geo).toBeNull()
  })

  it('ground alone in its own coordinates, on a site from a file: it says it may not land there', () => {
    const r = readChosen(readDxf(dxf([point('P', 1, 1, 1)])), { units: 'm', coordinates: { kind: 'local' }, kinds: { P: 'points' } }, { frame: { units: 'm', origin: { x: 0, y: 0 } } })
    expect(r.warnings).toEqual([expect.stringMatching(/not the site’s/)])
  })
})

describe('a CSV of points', () => {
  it('a header’s names say the columns; with ; a number may have a decimal comma', () => {
    const t = readCsv('Punto;Este;Norte;Cota;Descripción\n1;480000,5;2140000,25;1205,3;TN\n2;480010;2140010;1206;TN\n')
    expect(t.columns).toEqual(['Punto', 'Este', 'Norte', 'Cota', 'Descripción'])
    expect(t.guess).toEqual({ x: 1, y: 2, z: 3 })
    expect(t.rows[0].slice(0, 4)).toEqual([1, 480000.5, 2140000.25, 1205.3])
  })

  it('no header: three numbers are x, y, z; more, a point number first (P, E, N, Z), a description column is not a header', () => {
    expect(readCsv('10 20 30\n11 21 31').guess).toEqual({ x: 0, y: 1, z: 2 })
    const t = readCsv('1,480000,2140000,1205,TN\n2,480010,2140010,1206,TN')
    expect(t.rows).toHaveLength(2)
    expect(t.guess).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('its points read as a layer of the survey', () => {
    const t = readCsv('x,y,z\n0,0,100\n10,0,101\n,,\n')
    const d = csvDrawing(t, t.guess!, 'levantamiento.csv')
    expect(d.warnings).toEqual(['1 row without x, y and z left out'])
    const r = readChosen(d, { units: 'm', coordinates: { kind: 'local' }, kinds: { 'levantamiento.csv': 'points' } })
    expect(r.points).toEqual([
      { x: -5, y: 0, z: 100 },
      { x: 5, y: 0, z: 101 },
    ])
  })
})

describe('the import', () => {
  const r = readChosen(readDxf(MIXED), { units: 'm', coordinates: { kind: 'local' }, kinds: { POLIGONAL: 'boundary', CN_MAESTRAS: 'contours', PUNTOS: 'points' } })
  const terrain = { contours: r.contours, points: r.points, source: { file: 'site.dxf', layers: r.layers } }

  it('one step: the boundary with its frame, and the ground', () => {
    const p = importSiteFile(demoProject(), { name: 'site.dxf', boundary: r.candidates[0].contour, frame: r.frame, geo: r.geo, terrain })
    expect(p.site.source).toBe('site.dxf')
    expect(p.site.frame).toEqual(r.frame)
    // the ground as read, carried to the boundary where the survey stops short of it (Decision "Ground to the boundary")
    expect(p.site.terrain).toMatchObject(terrain)
    expect(p.site.terrain?.edge?.length).toBeGreaterThan(0)
    // ground alone: the boundary and its frame stay
    const again = importSiteFile(p, { name: 'more.dxf', terrain: { ...terrain, points: [] } })
    expect(again.site.boundary).toBe(p.site.boundary)
    expect(again.site.frame).toBe(p.site.frame)
    // a geolocated file lays the plan out again: the drawing's frame goes
    const square: Contour = { vertices: [{ x: 0, y: 0, r: 0 }, { x: 10, y: 0, r: 0 }, { x: 10, y: 10, r: 0 }, { x: 0, y: 10, r: 0 }] }
    expect(importSite(p, square, 'lot.kml', { lat: 19, lon: -99, north: 0 }).site.frame).toBeUndefined()
  })
})

describe('the units a civil drawing is read in', () => {
  // the user's DWG: drawn in metres in UTM (x ≈ 490 000, y ≈ 2 158 000), saved with $INSUNITS millimetres, and its
  // title block near the origin; read as said, the parcel was 0.3 m² and the ground 1000 times flatter
  const parcel: [number, number][] = [[490000, 2158000], [490400, 2158000], [490400, 2158300], [490000, 2158300]]
  const drawing = readDxf(
    dxf(
      [
        lw('POLIGONAL', parcel, true),
        lw('C-TOPO-MAJR', [[490050, 2158100], [490350, 2158120]], false, 2250),
        lw('C-TOPO-MINR', [[490050, 2158150], [490350, 2158170]], false, 2251),
        lw('C-TOPO-TEXT', [[490060, 2158110], [490070, 2158115]], false, 2250.4),
        lw('An-Pie de plano', [[0, 0], [841, 0], [841, 594], [0, 594]], true),
      ],
      4,
    ),
  )

  it('metres and UTM when its numbers look like UTM in metres, not in the units its header says', () => {
    const kinds = guessedKinds(surveyLayers(drawing))
    expect(drawing.units).toBe('mm')
    // judged by the layers guessed something: the title block near the origin does not hide the UTM
    expect(looksLikeUtmAll(drawing, 'm')).toBe(false)
    expect(guessedUnits(drawing, kinds)).toEqual({ units: 'm', utm: true, overridden: true })
  })

  it('the header’s units when its numbers agree, or look like no UTM at all', () => {
    const mm = readDxf(dxf([lw('POLIGONAL', parcel.map(([x, y]) => [x * 1000, y * 1000] as [number, number]), true)], 4))
    expect(guessedUnits(mm, guessedKinds(surveyLayers(mm)))).toEqual({ units: 'mm', utm: true, overridden: false })
    const local = readDxf(dxf([lw('POLIGONAL', [[0, 0], [400, 0], [400, 300], [0, 300]], true)], 4))
    expect(guessedUnits(local, guessedKinds(surveyLayers(local)))).toEqual({ units: 'mm', utm: false, overridden: false })
  })

  it('a layer of annotations is no ground: its leaders are no contours, but lines of reference', () => {
    const kinds = guessedKinds(surveyLayers(drawing))
    expect(kinds['C-TOPO-MAJR']).toBe('contours')
    expect(kinds['C-TOPO-MINR']).toBe('contours')
    expect(kinds['C-TOPO-TEXT']).toBe('reference')
    // the title block, far off by the origin, is no reference
    expect(kinds['An-Pie de plano']).toBe('ignore')
    expect(kinds.POLIGONAL).toBe('boundary')
    // majors and minors are one ground
    const r = readChosen(drawing, { units: 'm', coordinates: { kind: 'local' }, kinds })
    expect(r.contours.map((c) => c.z)).toEqual([2250, 2251])
    expect(r.candidates[0].area).toBeCloseTo(120000)
  })
})
