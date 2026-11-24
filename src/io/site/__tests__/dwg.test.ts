// A DWG read as a DXF (Decision "DWG as DXF") and the survey's points and roads (Decision "Survey points and roads"):
// a DWG's entities as dxf-parser's, a surveyor's point blocks, a TIN's corners and spot heights as points of the
// ground, a roads layer's lines as existing roads. The WebAssembly itself is not loaded here: its entities are.
import { describe, expect, it } from 'vitest'
import { asDxfEntity, dwgDrawing, readDwg, type DwgEntityLike } from '../dwg.ts'
import { drawingOf, heightOf, plainText, type Entity } from '../dxf.ts'
import { readChosen, surveyLayers } from '../survey.ts'

const base = { layer: 'L' }

describe('a text that is a height', () => {
  it('a number alone, an MTEXT’s formatting taken off; anything else is no height', () => {
    expect(plainText('{\\fCalibri Light|b0|i0|c0|p2;452.5}')).toBe('452.5')
    expect(heightOf('{\\fCalibri Light|b0|i0|c0|p2;452.5}')).toBe(452.5)
    expect(heightOf('+1,203.5')).toBeNull()
    expect(heightOf('1203,5 m')).toBe(1203.5)
    expect(heightOf('N 300166.700')).toBeNull()
    expect(heightOf('PLG')).toBeNull()
  })
})

describe('the ground of a drawing', () => {
  it('a block at a height and a text that is a number are points; a 3D face’s corners once each; a flat block is left out', () => {
    const entities: Entity[] = [
      { type: 'INSERT', layer: 'POINTS', position: { x: 1, y: 2, z: 465.96 } },
      { type: 'INSERT', layer: 'POINTS', position: { x: 3, y: 4, z: 0 }, attribs: [{ tag: 'POINT', text: '7' }, { tag: 'ELEV', text: '466.250' }] },
      { type: 'INSERT', layer: 'NORTE', position: { x: 0, y: 0, z: 0 } },
      { type: '3DFACE', layer: 'TIN', vertices: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }, { x: 0, y: 1, z: 3 }, { x: 0, y: 1, z: 3 }] },
      { type: '3DFACE', layer: 'TIN', vertices: [{ x: 1, y: 0, z: 2 }, { x: 1, y: 1, z: 4 }, { x: 0, y: 1, z: 3 }] },
      { type: 'TEXT', layer: 'COTAS', text: '450.25', startPoint: { x: 9, y: 9 } },
      { type: 'MTEXT', layer: 'COTAS', text: 'Elev.', position: { x: 8, y: 8 } },
    ]
    const d = drawingOf(entities, 6)
    expect(d.units).toBe('m')
    expect(d.points.filter((p) => p.layer === 'POINTS').map((p) => p.z)).toEqual([465.96, 466.25])
    expect(d.points.filter((p) => p.layer === 'TIN')).toHaveLength(4)
    expect(d.labels).toEqual([{ x: 9, y: 9, z: 450.25, layer: 'COTAS' }])
    expect(d.texts).toEqual({ COTAS: 2 })
    expect(d.warnings).toEqual(['1 blocks (explode them to read them) left out'])
    const layers = surveyLayers(d)
    expect(Object.fromEntries(layers.map((l) => [l.name, l.guess]))).toMatchObject({ POINTS: 'points', TIN: 'points', COTAS: 'points' })
  })

  it('a roads layer’s lines are the site’s existing roads, on the plan; its name guesses it', () => {
    const d = drawingOf(
      [
        { type: 'LWPOLYLINE', layer: 'EJES', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] },
        { type: 'LWPOLYLINE', layer: 'C-ROAD-CNTR-N', vertices: [{ x: 0, y: 10 }, { x: 50, y: 10 }] },
        { type: 'LWPOLYLINE', layer: 'C-ROAD-PROF', vertices: [{ x: 0, y: 20 }, { x: 50, y: 20 }] },
      ],
      6,
    )
    const layers = surveyLayers(d)
    expect(Object.fromEntries(layers.map((l) => [l.name, l.guess]))).toEqual({ EJES: 'roads', 'C-ROAD-CNTR-N': 'roads', 'C-ROAD-PROF': 'reference' })
    const r = readChosen(d, { units: 'm', coordinates: { kind: 'local' }, kinds: { EJES: 'roads' } })
    // local: the middle of what was chosen at the origin
    expect(r.roads).toEqual([
      [
        { x: -50, y: -25 },
        { x: 50, y: -25 },
        { x: 50, y: 25 },
      ],
    ])
    expect(r.contours).toEqual([])
  })
})

describe('a DWG’s entities, as a DXF’s', () => {
  const lw = (flag: number): DwgEntityLike => ({
    ...base,
    type: 'LWPOLYLINE',
    flag,
    elevation: 447.5,
    extrusionDirection: { x: 0, y: 0, z: 0 },
    vertices: [
      { x: 0, y: 0, bulge: 0 },
      { x: 10, y: 0, bulge: 0 },
      { x: 10, y: 10, bulge: 0 },
    ],
  })

  it('a polyline closed by LibreDWG’s flag (512) is a closed shape; its elevation its height; no extrusion is up', () => {
    expect(asDxfEntity(lw(520))).toMatchObject({ type: 'LWPOLYLINE', shape: true, elevation: 447.5, extrusionDirectionZ: 1 })
    expect(asDxfEntity(lw(264))).toMatchObject({ shape: false })
    const d = dwgDrawing([lw(520), lw(8)], 6)
    expect(d.shapes).toHaveLength(1)
    expect(d.lines.map((l) => [l.closed, l.points[0].z])).toEqual([
      [true, 447.5],
      [false, 447.5],
    ])
  })

  it('lines, 3D polylines, texts, a point block with its ELEV, a 3D face; what a site never reads is left', () => {
    const d = dwgDrawing(
      [
        { ...base, type: 'LINE', startPoint: { x: 0, y: 0, z: 455 }, endPoint: { x: 2, y: 1, z: 455 } },
        { ...base, type: 'POLYLINE3D', flag: 0, vertices: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }] },
        { ...base, type: 'MTEXT', text: '{\\fArial|b0;452.5}', insertionPoint: { x: 5, y: 5, z: 452.5 } },
        { type: 'INSERT', layer: 'POINTS', insertionPoint: { x: 3, y: 3, z: 0 }, attribs: [{ tag: 'ELEV', text: { text: '465.960' } }] },
        { type: '3DFACE', layer: 'TINN', corner1: { x: 0, y: 0, z: 1 }, corner2: { x: 1, y: 0, z: 2 }, corner3: { x: 0, y: 1, z: 3 }, corner4: { x: 0, y: 1, z: 3 } },
        { ...base, type: 'DIMENSION' },
        { ...base, type: 'HATCH' },
      ],
      6,
    )
    expect(d.lines.map((l) => l.points.map((p) => p.z))).toEqual([
      [455, 455],
      [1, 2],
    ])
    expect(d.labels).toEqual([{ x: 5, y: 5, z: 452.5, layer: 'L' }])
    expect(d.points.map((p) => [p.layer, p.z])).toEqual([
      ['POINTS', 465.96],
      ['TINN', 1],
      ['TINN', 2],
      ['TINN', 3],
    ])
    // the point block is read, not left out as a block; the line and the 3D polyline are open ones
    expect(d.warnings).toEqual(['2 open lines left out (not closed)'])
  })
})

describe('a DWG read after another', () => {
  // LibreDWG's state does not survive a read: the same instance throws on the next file (the user: "after I cancel an
  // import, any DWG I import says it could not be read")
  it('each read gets an instance of its own, so the second file reads as the first', async () => {
    let made = 0
    const open = async () => {
      made++
      let used = false
      const dwg = {
        dwg_read_data: () => ({}),
        convert: () => {
          if (used) throw new Error('null function or function signature mismatch')
          used = true
          return { entities: [{ type: 'POINT', layer: 'P', position: { x: 1, y: 2, z: 3 } }], header: { INSUNITS: 6 } }
        },
        dwg_free: () => {},
      }
      return { lib: { Dwg_File_Type: { DWG: 0 } }, dwg } as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof readDwg>[1]>>>
    }
    const first = await readDwg(new ArrayBuffer(8), open)
    const second = await readDwg(new ArrayBuffer(8), open)
    expect(second).toEqual(first)
    expect(second.points).toEqual([{ x: 1, y: 2, z: 3, layer: 'P' }])
    expect(made).toBe(2)
  })
})
