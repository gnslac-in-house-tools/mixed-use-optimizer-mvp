// The DXF writer (Phase DX.3, `dxfOf`): a plan as R2000 text, read back by dxf-parser; its layers with colour and
// lineweight, polylines with bulges at survey-sized coordinates, dimensions with their blocks, unique handles, text in
// Windows-1252 (else `\U+XXXX`), metres or feet.
import DxfParser from 'dxf-parser'
import { describe, expect, it } from 'vitest'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { dxfBytes, dxfFileName, dxfOf } from '../exportDxf.ts'
import { PLAN_LAYERS, planOf, type PlanEntity, type PlanExport } from '../exportPlan.ts'

const parse = (text: string) => new DxfParser().parseSync(text)!

/** A plan of the given entities, on the spec's layers. */
const planWith = (entities: PlanEntity[], units: PlanExport['units'] = 'm'): PlanExport => ({
  name: 'Test',
  units,
  threeD: false,
  layers: { ...PLAN_LAYERS },
  entities,
})

const demoPlan = () => {
  const p = demoProject()
  return planOf(p, derive(p), { threeD: false })
}

/** The value after each group code `code` in the file. */
const values = (text: string, code: number): string[] => {
  const lines = text.split('\r\n')
  const out: string[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i].trim() === String(code)) out.push(lines[i + 1])
  return out
}

/** The groups after the line `marker` (its first occurrence) up to the next group 0, as text `values` reads. */
const after = (text: string, marker: string): string => {
  const rest = text.slice(text.indexOf(`\r\n${marker}\r\n`) + marker.length + 4)
  return rest.slice(0, rest.indexOf('\r\n  0\r\n'))
}

/** The header variable's value lines: `$NAME` then its groups up to the next 9. */
const header = (text: string, name: string): string[] => {
  const lines = text.split('\r\n')
  const i = lines.findIndex((l, k) => k % 2 === 1 && l === name)
  const out: string[] = []
  for (let k = i + 1; k + 1 < lines.length && lines[k].trim() !== '9' && lines[k].trim() !== '0'; k += 2) out.push(lines[k + 1])
  return out
}

describe('dxfOf', () => {
  it('(a) the demo: read back by dxf-parser, R2000, in metres; CRLF line ends', () => {
    const text = dxfOf(demoPlan())
    const dxf = parse(text)
    expect(dxf.header.$ACADVER).toBe('AC1015')
    expect(dxf.header.$INSUNITS).toBe(6)
    expect(dxf.header.$MEASUREMENT).toBe(1)
    expect(dxf.entities.length).toBeGreaterThan(0)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
    expect(text.endsWith('0\r\nEOF\r\n')).toBe(true)
  })

  it('(b) every layer of the plan with its colour, linetype and lineweight', () => {
    const plan = demoPlan()
    const text = dxfOf(plan)
    const layers = parse(text).tables.layer.layers
    expect(layers['0']).toBeDefined()
    for (const [name, s] of Object.entries(plan.layers)) {
      expect(layers[name], name).toBeDefined()
      expect(layers[name].colorIndex, name).toBe(s.color)
      // dxf-parser does not read a layer's lineweight: its record's 370, in hundredths of a mm
      expect(values(after(text, `AcDbLayerTableRecord\r\n  2\r\n${name}`), 370), name).toEqual([String(Math.round(s.weight * 100))])
    }
    // the linetypes the layers name, with their dashes (CENTER: 31.75, -6.35, 6.35, -6.35 mm, in metres)
    const types = parse(text).tables.lineType.lineTypes
    for (const t of ['CENTER', 'DASHED', 'PHANTOM', 'DIVIDE', 'Continuous', 'ByLayer', 'ByBlock']) expect(types[t], t).toBeDefined()
    expect(types.CENTER.pattern.map(Number)).toEqual([0.03175, -0.00635, 0.00635, -0.00635])
    expect(types.CENTER.patternLength).toBeCloseTo(0.0508, 9)
  })

  it('(c) a polyline at survey coordinates reads back within 1e-6, with its bulge, closed', () => {
    const points = [
      { x: 512345.654321, y: 2812345.123456 },
      { x: 512445.654321, y: 2812345.123456 },
      { x: 512445.654321, y: 2812445.123456 },
    ]
    const text = dxfOf(planWith([{ kind: 'poly', layer: 'A-WALL', points, bulges: [0, -0.414214, 0], closed: true, elevation: 0, thickness: 0 }]))
    const [e] = parse(text).entities as any[]
    expect(e.type).toBe('LWPOLYLINE')
    expect(e.layer).toBe('A-WALL')
    expect(e.shape).toBe(true)
    expect(e.vertices).toHaveLength(3)
    e.vertices.forEach((v: any, i: number) => {
      expect(Math.abs(v.x - points[i].x)).toBeLessThan(1e-6)
      expect(Math.abs(v.y - points[i].y)).toBeLessThan(1e-6)
    })
    expect(e.vertices[1].bulge).toBeCloseTo(-0.414214, 9)
    expect(e.vertices[0].bulge).toBeUndefined()
    expect(text).not.toMatch(/\d[eE][+-]?\d/)
  })

  it('(c) numbers: six decimals at most, trailing zeros trimmed, -0 as 0', () => {
    const text = dxfOf(planWith([{ kind: 'line', layer: 'A-DOOR', a: { x: -0, y: 1.5 }, b: { x: 1e-9, y: 2.0000004 } }]))
    const line = after(text, 'AcDbLine')
    expect(values(line, 10)[0]).toBe('0')
    expect(values(line, 20)[0]).toBe('1.5')
    expect(values(line, 11)[0]).toBe('0')
    expect(values(line, 21)[0]).toBe('2')
  })

  it('(c) elevation, thickness and every other kind of entity', () => {
    const text = dxfOf(
      planWith([
        { kind: 'poly', layer: 'C-TOPO-MINR', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], bulges: [0, 0], closed: false, elevation: 12.5, thickness: 0 },
        { kind: 'poly', layer: 'A-WALL', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], bulges: [0, 0, 0], closed: true, elevation: 0, thickness: 9 },
        { kind: 'poly3d', layer: 'C-ROAD-CNTR', points: [{ x: 0, y: 0, z: 1 }, { x: 10, y: 0, z: 2 }, { x: 10, y: 10, z: 3 }], closed: true },
        { kind: 'circle', layer: 'A-GRID-IDEN', c: { x: 3, y: 4 }, r: 0.75 },
        { kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 7, y: 8 }, height: 0.5, text: 'Almacén', align: 'center' },
        { kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 1, y: 2 }, height: 0.5, text: 'Left', align: 'left' },
      ]),
    )
    const es = parse(text).entities as any[]
    expect(es.map((e) => e.type)).toEqual(['LWPOLYLINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'TEXT', 'TEXT'])
    expect(es[0].elevation).toBe(12.5)
    expect(es[1].depth ?? es[1].thickness).toBe(9)
    expect(es[2].is3dPolyline).toBe(true)
    expect(es[2].shape).toBe(true)
    expect(es[2].vertices.map((v: any) => v.z)).toEqual([1, 2, 3])
    expect(es[3]).toMatchObject({ layer: 'A-GRID-IDEN', radius: 0.75, center: { x: 3, y: 4 } })
    expect(es[4]).toMatchObject({ text: 'Almacén', textHeight: 0.5, halign: 1, endPoint: { x: 7, y: 8 } })
    expect(es[5].halign ?? 0).toBe(0)
    // a 3D polyline: 70 = 8 + 1 on the POLYLINE, 32 on each VERTEX, closed by a SEQEND
    expect(text).toMatch(/POLYLINE\r\n[\s\S]*?AcDb3dPolyline\r\n[\s\S]*?\r\n 70\r\n9\r\n/)
    expect(text.match(/AcDb3dPolylineVertex\r\n 10\r\n[^\r]+\r\n 20\r\n[^\r]+\r\n 30\r\n[^\r]+\r\n 70\r\n32\r\n/g)).toHaveLength(3)
    expect(text.match(/\r\nSEQEND\r\n/g)).toHaveLength(1)
    // ByLayer: no entity names its own colour, linetype or lineweight
    expect(es.every((e) => e.colorIndex === undefined || e.colorIndex === 256)).toBe(true)
  })

  it('(d) a dimension: an aligned DIMENSION in style GFIT and its *D1 block, drawn', () => {
    const dim: PlanEntity = { kind: 'dim', layer: 'A-ANNO-DIMS', a: { x: 0, y: 0 }, b: { x: 30, y: 0 }, line: { x: 0, y: 4 }, text: '30.00' }
    const text = dxfOf(planWith([dim, { ...dim, a: { x: 0, y: 10 }, b: { x: 0, y: 40 }, line: { x: -4, y: 10 } }]))
    const dxf = parse(text)
    const dims = dxf.entities as any[]
    expect(dims.map((e) => e.type)).toEqual(['DIMENSION', 'DIMENSION'])
    expect(dims[0]).toMatchObject({ layer: 'A-ANNO-DIMS', block: '*D1', dimensionType: 33 })
    // measured, never overridden: no group 1, so CAD updates the text when the dimension is stretched
    expect(dims[0].text ?? '').toBe('')
    expect(values(after(text, 'AcDbDimension'), 1)).toEqual([])
    expect(dims[0].linearOrAngularPoint1).toMatchObject({ x: 0, y: 0 })
    expect(dims[0].linearOrAngularPoint2).toMatchObject({ x: 30, y: 0 })
    expect(dims[0].anchorPoint).toMatchObject({ x: 30, y: 4 })
    expect(dims[1].block).toBe('*D2')
    const block = dxf.blocks['*D1'] as any
    expect(block).toBeDefined()
    const kinds = block.entities.map((e: any) => e.type).sort()
    expect(kinds).toEqual(['LINE', 'LINE', 'LINE', 'LINE', 'LINE', 'TEXT'])
    expect(block.entities.find((e: any) => e.type === 'TEXT').text).toBe('30.00')
    expect(dxf.blocks['*Model_Space']).toBeDefined()
    expect(dxf.blocks['*Paper_Space']).toBeDefined()
    // the style: 2.5 mm text and ticks in metres, $DIMSCALE 200
    expect(dxf.header.$DIMSCALE).toBe(200)
    expect(text).toMatch(/\r\nDIMSTYLE\r\n105\r\n[0-9A-F]+\r\n330\r\n[0-9A-F]+\r\n100\r\nAcDbSymbolTableRecord\r\n100\r\nAcDbDimStyleTableRecord\r\n {2}2\r\nGFIT\r\n/)
    const gfit = after(text, 'AcDbDimStyleTableRecord\r\n  2\r\nGFIT')
    expect(values(gfit, 140)[0]).toBe('0.0025')
    expect(values(gfit, 41)[0]).toBe('0.0025')
    expect(values(gfit, 142)[0]).toBe('0.0025')
  })

  it('(e) handles: every one is unique, the seed above the last', () => {
    const text = dxfOf(demoPlan())
    // the objects' handles: after the header, whose $HANDSEED is a 5 too
    const objects = text.slice(text.indexOf('\r\n  0\r\nENDSEC\r\n') + 2)
    const handles = [...values(objects, 5), ...values(objects, 105)]
    expect(handles.length).toBeGreaterThan(50)
    expect(new Set(handles).size).toBe(handles.length)
    const max = Math.max(...handles.map((h) => parseInt(h, 16)))
    expect(parseInt(header(text, '$HANDSEED')[0], 16)).toBeGreaterThan(max)
    // every owner named is a handle of the file (0: the tables and the root dictionary)
    const known = new Set([...handles, '0'])
    for (const o of values(text, 330)) expect(known.has(o), o).toBe(true)
    // and so is every other reference: entries (350), styles and layouts (340), plot styles (390)
    for (const code of [340, 350, 390]) for (const r of values(objects, code)) expect(known.has(r), `${code} ${r}`).toBe(true)
  })

  it('(f) text: Windows-1252 as it is, anything else as \\U+XXXX', () => {
    const text = dxfOf(
      planWith([
        { kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 0, y: 0 }, height: 0.5, text: 'Nave Ñ', align: 'center' },
        { kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 0, y: 0 }, height: 0.5, text: '日本 €', align: 'center' },
      ]),
    )
    expect(text).toContain('\r\nNave Ñ\r\n')
    expect(text).toContain('\r\n\\U+65E5\\U+672C €\r\n')
    expect(header(text, '$DWGCODEPAGE')).toEqual(['ANSI_1252'])
  })

  it('(f) the file as Windows-1252 bytes', () => {
    expect([...dxfBytes('aÑ€\r\n')]).toEqual([0x61, 0xd1, 0x80, 0x0d, 0x0a])
  })

  it('a layer an entity names but the plan lacks is in the table too', () => {
    const plan = planWith([{ kind: 'line', layer: 'Z-EXTRA', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }])
    expect(parse(dxfOf(plan)).tables.layer.layers['Z-EXTRA']).toMatchObject({ colorIndex: 7 })
  })

  it('(g) the empty plan: read back, every layer, no entities', () => {
    const text = dxfOf(planWith([]))
    const dxf = parse(text)
    expect(dxf.entities).toEqual([])
    expect(Object.keys(dxf.tables.layer.layers)).toEqual(expect.arrayContaining(Object.keys(PLAN_LAYERS)))
    expect(text).not.toMatch(/\r\nLWPOLYLINE\r\n|\r\nDIMENSION\r\n/)
  })

  it('(h) in feet: $INSUNITS 2, $MEASUREMENT 0, the dimension style in feet', () => {
    const text = dxfOf(planWith([], 'ft'))
    const dxf = parse(text)
    expect(dxf.header.$INSUNITS).toBe(2)
    expect(dxf.header.$MEASUREMENT).toBe(0)
    const gfit = after(text, 'AcDbDimStyleTableRecord\r\n  2\r\nGFIT')
    expect(Number(values(gfit, 140)[0])).toBeCloseTo(0.0025 / 0.3048, 6)
  })

  it('(i) a plan with no 3D has no POLYLINE', () => {
    expect(dxfOf(demoPlan())).not.toContain('\r\nPOLYLINE\r\n')
  })

  it('(i2) the demo in 3D: its masses carry a thickness (39), its streets are 3D polylines', () => {
    const p = demoProject()
    const text = dxfOf(planOf(p, derive(p), { threeD: true }))
    expect(values(text, 39).some((v) => Number(v) > 0)).toBe(true)
    expect(text).toContain('\r\nPOLYLINE\r\n')
    expect(text).toContain('\r\nSEQEND\r\n')
    expect(parse(text).entities.some((e) => e.type === 'POLYLINE' && e.layer === 'C-ROAD-CNTR')).toBe(true)
  })

  it('the header: units, dimension style, lineweights shown, extents of the entities', () => {
    const text = dxfOf(planWith([{ kind: 'line', layer: 'A-DOOR', a: { x: -2, y: 3 }, b: { x: 8, y: 13 } }]))
    expect(header(text, '$LUNITS')).toEqual(['2'])
    expect(header(text, '$DIMSTYLE')).toEqual(['GFIT'])
    expect(header(text, '$LWDISPLAY')).toEqual(['1'])
    expect(header(text, '$EXTMIN')).toEqual(['-2', '3', '0'])
    expect(header(text, '$EXTMAX')).toEqual(['8', '13', '0'])
  })
})

/** A record of the file: its group 0 and the groups up to the next. */
interface DxfRecord {
  type: string
  groups: [number, string][]
}

/** The file as its records (a SECTION's header variables stay in its record). */
const records = (text: string): DxfRecord[] => {
  const lines = text.split('\r\n')
  const out: DxfRecord[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (code === 0) out.push({ type: lines[i + 1], groups: [] })
    else out.at(-1)?.groups.push([code, lines[i + 1]])
  }
  return out
}
const first = (r: DxfRecord, code: number) => r.groups.find(([c]) => c === code)?.[1]
const last = (r: DxfRecord, code: number) => r.groups.findLast(([c]) => c === code)?.[1]
const all = (r: DxfRecord, code: number) => r.groups.filter(([c]) => c === code).map(([, v]) => v)
/** A dictionary's entries: each name (3) and the handle it holds (350), in order. */
const entries = (r: DxfRecord): [string, string][] =>
  r.groups.flatMap(([c, v], i) => (c === 3 && r.groups[i + 1]?.[0] === 350 ? [[v, r.groups[i + 1][1]] as [string, string]] : []))
/** The code right after group `code` in a record. */
const next = (r: DxfRecord, code: number) => r.groups[r.groups.findIndex(([c]) => c === code) + 1]?.[0]

/** The file's records by handle (5, a DIMSTYLE's 105), and its root dictionary. */
const indexed = (text: string) => {
  const rs = records(text)
  const byHandle = new Map<string, DxfRecord>()
  for (const r of rs) {
    if (r.type === 'SECTION') continue
    const h = first(r, 5) ?? first(r, 105)
    if (h !== undefined) byHandle.set(h, r)
  }
  const root = rs.find((r) => r.type === 'DICTIONARY' && first(r, 330) === '0')!
  const get = (h: string | undefined) => byHandle.get(h ?? '')!
  const entry = (dict: DxfRecord, name: string) => get(entries(dict).find(([n]) => n === name)?.[1])
  return { rs, root, get, entry }
}

describe('dxfOf: the structure AutoCAD requires (it refused the file without it, 2026-11-09)', () => {
  const dim: PlanEntity = { kind: 'dim', layer: 'A-ANNO-DIMS', a: { x: 0, y: 0 }, b: { x: 30, y: 0 }, line: { x: 0, y: 4 }, text: '30.00' }

  it('the root dictionary lists ACAD_GROUP, ACAD_LAYOUT, ACAD_MLINESTYLE and ACAD_PLOTSTYLENAME', () => {
    const { root } = indexed(dxfOf(demoPlan()))
    expect(entries(root).map(([n]) => n)).toEqual(['ACAD_GROUP', 'ACAD_LAYOUT', 'ACAD_MLINESTYLE', 'ACAD_PLOTSTYLENAME'])
    expect(first(root, 281)).toBe('1')
  })

  it('every LAYER carries a 390 to the Normal placeholder, the default of ACAD_PLOTSTYLENAME', () => {
    const { rs, root, get, entry } = indexed(dxfOf(demoPlan()))
    const plotStyles = entry(root, 'ACAD_PLOTSTYLENAME')
    expect(plotStyles.type).toBe('ACDBDICTIONARYWDFLT')
    expect(first(plotStyles, 330)).toBe(first(root, 5))
    expect(all(plotStyles, 100)).toEqual(['AcDbDictionary', 'AcDbDictionaryWithDefault'])
    const [[name, normal]] = entries(plotStyles)
    expect(entries(plotStyles)).toHaveLength(1)
    expect(name).toBe('Normal')
    expect(first(plotStyles, 340)).toBe(normal)
    expect(get(normal).type).toBe('ACDBPLACEHOLDER')
    expect(first(get(normal), 330)).toBe(first(plotStyles, 5))
    const layers = rs.filter((r) => r.type === 'LAYER')
    expect(layers.length).toBeGreaterThan(1)
    for (const l of layers) {
      expect(all(l, 390), first(l, 2)).toEqual([normal])
      expect(next(l, 370), first(l, 2)).toBe(390)
    }
  })

  it('*Model_Space and *Paper_Space point (340) at their LAYOUT, which points back; each *D<n> at 0', () => {
    const { rs, root, get, entry } = indexed(dxfOf(planWith([dim])))
    const blockRecords = rs.filter((r) => r.type === 'BLOCK_RECORD')
    const named = (n: string) => blockRecords.find((r) => first(r, 2) === n)!
    const layouts = entry(root, 'ACAD_LAYOUT')
    expect(layouts.type).toBe('DICTIONARY')
    expect(first(layouts, 330)).toBe(first(root, 5))
    for (const [space, layoutName, tab] of [['*Model_Space', 'Model', '0'], ['*Paper_Space', 'Layout1', '1']]) {
      const br = named(space)
      expect(next(br, 2), space).toBe(340)
      const layout = get(first(br, 340))
      expect(layout.type, space).toBe('LAYOUT')
      expect(entries(layouts).find(([n]) => n === layoutName)?.[1]).toBe(first(layout, 5))
      expect(first(layout, 330), space).toBe(first(layouts, 5))
      expect(last(layout, 330), space).toBe(first(br, 5))
      expect(all(layout, 100)).toEqual(['AcDbPlotSettings', 'AcDbLayout'])
      // its name and tab order, after AcDbLayout; its extents as 1e20 written without an exponent
      const own = layout.groups.slice(layout.groups.findIndex(([c, v]) => c === 100 && v === 'AcDbLayout'))
      expect(own.find(([c]) => c === 1)?.[1]).toBe(layoutName)
      expect(own.find(([c]) => c === 71)?.[1]).toBe(tab)
      expect(own.find(([c]) => c === 14)?.[1]).toBe('100000000000000000000')
      expect(own.find(([c]) => c === 15)?.[1]).toBe('-100000000000000000000')
      expect(Number(own.find(([c]) => c === 34)?.[1])).toBe(1e20)
    }
    expect(entries(layouts).map(([n]) => n)).toEqual(['Model', 'Layout1'])
    expect(all(named('*D1'), 340)).toEqual(['0'])
    expect(next(named('*D1'), 2)).toBe(340)
  })

  it('CLASSES holds the dictionary with default, the placeholder and the layout', () => {
    const { rs } = indexed(dxfOf(demoPlan()))
    const classes = rs.filter((r) => r.type === 'CLASS').map((r) => [1, 2, 3, 90, 280, 281].map((c) => first(r, c)))
    expect(classes).toEqual([
      ['ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault', 'ObjectDBX Classes', '0', '0', '0'],
      ['ACDBPLACEHOLDER', 'AcDbPlaceHolder', 'ObjectDBX Classes', '0', '0', '0'],
      ['LAYOUT', 'AcDbLayout', 'ObjectDBX Classes', '0', '0', '0'],
    ])
    // all in the CLASSES section
    const at = rs.findIndex((r) => r.type === 'SECTION' && first(r, 2) === 'CLASSES')
    expect(rs.slice(at + 1, at + 4).map((r) => r.type)).toEqual(['CLASS', 'CLASS', 'CLASS'])
    expect(rs[at + 4].type).toBe('ENDSEC')
  })

  it('ACAD_MLINESTYLE holds Standard, an MLINESTYLE', () => {
    const { root, entry } = indexed(dxfOf(demoPlan()))
    const styles = entry(root, 'ACAD_MLINESTYLE')
    expect(styles.type).toBe('DICTIONARY')
    expect(entries(styles).map(([n]) => n)).toEqual(['Standard'])
    const standard = entry(styles, 'Standard')
    expect(standard.type).toBe('MLINESTYLE')
    expect(first(standard, 2)).toBe('Standard')
    expect(first(standard, 330)).toBe(first(styles, 5))
    expect(all(standard, 49)).toEqual(['0.5', '-0.5'])
  })

  it('dxf-parser still reads the demo in 2D and 3D, every layer', () => {
    const p = demoProject()
    for (const threeD of [false, true]) {
      const dxf = parse(dxfOf(planOf(p, derive(p), { threeD })))
      expect(dxf.entities.length, String(threeD)).toBeGreaterThan(0)
      expect(Object.keys(dxf.tables.layer.layers).length, String(threeD)).toBeGreaterThan(1)
    }
  })
})

describe('dxfFileName', () => {
  it("the project's name and the plan, 3D when asked", () => {
    const day = new Date(2026, 10, 9)
    expect(dxfFileName('Nave Sur', false, day)).toBe('Nave-Sur-plan_2026-11-09.dxf')
    expect(dxfFileName('Nave Sur', true, day)).toBe('Nave-Sur-plan-3D_2026-11-09.dxf')
  })
})

describe('dxfOf: reference lines and notes (AS.5)', () => {
  const refLine: PlanEntity = { kind: 'poly', layer: 'A-ANNO-REFR', points: [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 12 }], bulges: [0, 0, 0], closed: false, elevation: 0, thickness: 0 }
  const note = (text: string, angle?: number, at = { x: 10, y: 20 }): PlanEntity => ({ kind: 'text', layer: 'A-ANNO-NOTE', at, height: 0.5, text, align: 'left', ...(angle === undefined ? {} : { angle }) })
  /** The groups of the ENTITIES section only. */
  const entitiesOf = (text: string) => {
    const from = text.slice(text.indexOf('\r\nENTITIES\r\n'))
    return from.slice(0, from.indexOf('\r\n  0\r\nENDSEC'))
  }
  /** What the file says in each TEXT's group 1, in order. */
  const written = (text: string) => values(entitiesOf(text), 1)

  it('the LAYER table has both layers: colour, linetype, lineweight and the 390 of the plot style Normal', () => {
    const { rs, root, entry } = indexed(dxfOf(planWith([])))
    const normal = entries(entry(root, 'ACAD_PLOTSTYLENAME'))[0][1]
    const named = (n: string) => rs.find((r) => r.type === 'LAYER' && first(r, 2) === n)!
    const refr = named('A-ANNO-REFR')
    expect([first(refr, 62), first(refr, 6), first(refr, 370), all(refr, 390)]).toEqual(['8', 'DASHED', '13', [normal]])
    const noteLayer = named('A-ANNO-NOTE')
    expect([first(noteLayer, 62), first(noteLayer, 6), first(noteLayer, 370), all(noteLayer, 390)]).toEqual(['7', 'Continuous', '18', [normal]])
    // 390 straight after the lineweight, as AutoCAD writes it
    expect(next(refr, 370)).toBe(390)
    expect(next(noteLayer, 370)).toBe(390)
    // the dashed linetype it names is in the LTYPE table
    expect(rs.some((r) => r.type === 'LTYPE' && first(r, 2) === 'DASHED')).toBe(true)
  })

  it('C-ROAD-STRP (lane lines, PE.2): its LAYER has colour 252, DASHED, weight 13 and the 390, and DASHED is in the LTYPE table', () => {
    const { rs, root, entry } = indexed(dxfOf(planWith([])))
    const normal = entries(entry(root, 'ACAD_PLOTSTYLENAME'))[0][1]
    const strp = rs.find((r) => r.type === 'LAYER' && first(r, 2) === 'C-ROAD-STRP')!
    expect(strp).toBeDefined()
    expect([first(strp, 62), first(strp, 6), first(strp, 370), all(strp, 390)]).toEqual(['252', 'DASHED', '13', [normal]])
    expect(next(strp, 370)).toBe(390)
    expect(rs.some((r) => r.type === 'LTYPE' && first(r, 2) === 'DASHED')).toBe(true)
  })

  it('an entity on either layer in a plan whose table lacks them still gets a LAYER with its 390', () => {
    const plan: PlanExport = { ...planWith([refLine, note('x')]), layers: {} }
    const { rs, root, entry } = indexed(dxfOf(plan))
    const normal = entries(entry(root, 'ACAD_PLOTSTYLENAME'))[0][1]
    for (const n of ['A-ANNO-REFR', 'A-ANNO-NOTE']) {
      const l = rs.find((r) => r.type === 'LAYER' && first(r, 2) === n)!
      expect(l, n).toBeDefined()
      expect(all(l, 390), n).toEqual([normal])
    }
  })

  it('a reference line is an open LWPOLYLINE on A-ANNO-REFR, read back with its points', () => {
    const [e] = parse(dxfOf(planWith([refLine]))).entities as any[]
    expect(e.type).toBe('LWPOLYLINE')
    expect(e.layer).toBe('A-ANNO-REFR')
    expect(e.shape).toBe(false)
    expect(e.vertices.map((v: any) => [v.x, v.y])).toEqual([[1, 2], [11, 2], [11, 12]])
    // ByLayer: its dashes, colour and weight come from the layer
    expect(e.colorIndex === undefined || e.colorIndex === 256).toBe(true)
  })

  it('a note is a TEXT on A-ANNO-NOTE, left-aligned at its point, with its angle in group 50', () => {
    const text = dxfOf(planWith([note('Fire lane', 30)]))
    const [e] = parse(text).entities as any[]
    expect(e).toMatchObject({ type: 'TEXT', layer: 'A-ANNO-NOTE', text: 'Fire lane', textHeight: 0.5, startPoint: { x: 10, y: 20 } })
    expect(e.rotation).toBe(30)
    expect(e.halign ?? 0).toBe(0)
    const own = after(text, 'AcDbText')
    expect(values(own, 50)).toEqual(['30'])
    expect(values(own, 72)).toEqual([])
    expect(values(own, 10)).toEqual(['10'])
    expect(values(own, 20)).toEqual(['20'])
    expect(values(own, 40)).toEqual(['0.5'])
  })

  it('the lines of a note are separate TEXTs, each with the note’s angle', () => {
    const text = dxfOf(planWith([note('one', 90, { x: 10, y: 20 }), note('two', 90, { x: 10.75, y: 20 }), note('three', 90, { x: 11.5, y: 20 })]))
    const es = parse(text).entities as any[]
    expect(es.map((e) => e.text)).toEqual(['one', 'two', 'three'])
    expect(es.map((e) => e.rotation)).toEqual([90, 90, 90])
    expect(es.map((e) => e.startPoint.x)).toEqual([10, 10.75, 11.5])
  })

  it('a text with no angle, or an angle of 0, is written as the labels always were: no group 50', () => {
    const label = (angle?: number): PlanEntity => ({ kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 7, y: 8 }, height: 0.5, text: 'Almacén', align: 'center', ...(angle === undefined ? {} : { angle }) })
    const plain = dxfOf(planWith([label()]))
    expect(values(entitiesOf(plain), 50)).toEqual([])
    expect(dxfOf(planWith([label(0)]))).toBe(plain)
  })

  it('in the 3D box the note and the line carry their elevation', () => {
    const text = dxfOf(planWith([{ ...refLine, elevation: 12.5 }, { ...note('up'), elevation: 12.5 } as PlanEntity]))
    const es = parse(text).entities as any[]
    expect(es[0].elevation).toBe(12.5)
    expect(es[1].startPoint.z).toBe(12.5)
  })

  describe('characters in a note', () => {
    it('an accent stays as it is: the file is Windows-1252 and has it', () => {
      const text = dxfOf(planWith([note('áñü Ñ é')]))
      expect(written(text)).toEqual(['áñü Ñ é'])
      expect([...dxfBytes('áñü')]).toEqual([0xe1, 0xf1, 0xfc])
    })

    it('a character outside Windows-1252 is \\U+XXXX; an emoji, with no four-digit code, a ?', () => {
      expect(written(dxfOf(planWith([note('→ 日本 €')])))).toEqual(['\\U+2192 \\U+65E5\\U+672C €'])
      // R2000's \U+ takes four digits: a character beyond the plane is a ? in the file, never a byte the code page lacks
      const emoji = dxfOf(planWith([note('ok 😀')]))
      expect(written(emoji)).toEqual(['ok ?'])
      expect(emoji).not.toContain('😀')
      expect([...dxfBytes(emoji)].every((b) => b < 0x80)).toBe(true)
    })

    it('a caret is DXF’s own escape: written ^ and a space, so no ^J reads as a line feed', () => {
      expect(written(dxfOf(planWith([note('a^Jb')])))).toEqual(['a^ Jb'])
    })

    it('a backslash is written \\U+005C, so \\P, \\U+0041 and the like read as typed', () => {
      expect(written(dxfOf(planWith([note('a\\Pb \\U+0041 C:\\x')])))).toEqual(['a\\U+005CPb \\U+005CU+0041 C:\\U+005Cx'])
    })

    it('%% (CAD’s own codes: %%d degree, %%c diameter, %%p plus-minus, %%u underline) is written %%037 per %, so it reads as typed; a lone % stays', () => {
      expect(written(dxfOf(planWith([note('50%% off %%d %%u')])))).toEqual(['50%%037%%037 off %%037%%037d %%037%%037u'])
      expect(written(dxfOf(planWith([note('50% off')])))).toEqual(['50% off'])
    })

    it('a mass’s name goes the same way as a note’s', () => {
      const label: PlanEntity = { kind: 'text', layer: 'A-ANNO-TEXT', at: { x: 0, y: 0 }, height: 0.5, text: 'A\\P→ %%d', align: 'center' }
      expect(written(dxfOf(planWith([label])))).toEqual(written(dxfOf(planWith([note('A\\P→ %%d')]))))
      expect(written(dxfOf(planWith([label])))).toEqual(['A\\U+005CP\\U+2192 %%037%%037d'])
    })

    it('a control character is a space', () => {
      expect(written(dxfOf(planWith([note('a\tb\u0001c')])))).toEqual(['a b c'])
    })
  })
})
