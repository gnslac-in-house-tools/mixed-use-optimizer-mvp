// The DXF writer (Phase DX.3; spec docs/superpowers/specs/2026-11-09-dxf-export-design.md), pure: a `PlanExport`
// (io/exportPlan.ts, already in the output's coordinates and unit) as DXF R2000 text (AC1015), CRLF line ends.
// The R2000 AutoCAD reads, so AutoCAD and Civil 3D open it without a recovery: what AutoCAD itself saves in an R2000
// file, the plot style and the layouts included (AutoCAD refused the file without them, 2026-11-09: a LAYER needs
// its plot style, 390, so the file carries the plot style dictionary, and with it the layouts and multiline style
// AutoCAD writes; left out on purpose: DEFPOINTS points in the dimension blocks):
//   HEADER    version, code page, units, extents, the dimension style's variables, $HANDSEED above every handle
//   CLASSES   ACDBDICTIONARYWDFLT, ACDBPLACEHOLDER and LAYOUT, the objects below that are not DXF's own
//   TABLES    VPORT *ACTIVE framing the extents; LTYPE ByBlock, ByLayer, Continuous and the layers' dashed ones (their
//             dashes in paper mm as drawing units, $LTSCALE = $DIMSCALE); LAYER 0 and each of the plan's with colour,
//             linetype, lineweight and the plot style Normal (390); STYLE Standard and GFIT; VIEW and UCS empty; APPID
//             ACAD; DIMSTYLE Standard and GFIT (2.5 mm text, architectural ticks); BLOCK_RECORD *Model_Space and
//             *Paper_Space with their layout (340), one *D<n> per dimension (340 0)
//   BLOCKS    *Model_Space, *Paper_Space, each *D<n> holding its dimension as drawn (lines, ticks, text; ByBlock)
//   ENTITIES  every entity on its layer, colour, linetype and lineweight ByLayer (DXF's defaults: not written)
//   OBJECTS   the root dictionary: ACAD_GROUP (empty), ACAD_LAYOUT (Model and Layout1, A3), ACAD_MLINESTYLE
//             (Standard) and ACAD_PLOTSTYLENAME (a dictionary with default whose Normal is a placeholder)
// Every table, record, entity and object has its own handle (5; a DIMSTYLE's is 105), its owner (330) and its
// subclass markers (100). Numbers: six decimals at most, never exponent notation. Text: the file's code page is
// Windows-1252 (`dxfBytes` gives its bytes); any other character is written `\U+XXXX`, and in a TEXT a backslash and a
// `%%` are written so CAD reads them as typed (`textValue`).
import type { Point } from '../model/schema.ts'
import type { LayerStyle, PlanEntity, PlanExport, PlanUnit } from './exportPlan.ts'
import { fileName } from './gft.ts'
import { METRES } from './site/dxf.ts'

/** $INSUNITS and $MEASUREMENT of each unit. */
const INSUNITS: Record<PlanUnit, number> = { m: 6, ft: 2 }
const MEASUREMENT: Record<PlanUnit, number> = { m: 1, ft: 0 }

/** The plot scale the dimensions and linetypes are sized for ($DIMSCALE, $LTSCALE): the drafter sets theirs. */
const DIMSCALE = 200

/** The style GFIT, in paper mm (× $DIMSCALE in the drawing). */
const DIM_MM = { txt: 2.5, asz: 2.5, tsz: 2.5, exo: 0.625, exe: 1.25, gap: 0.625, dli: 3.75, cen: 2.5 }

/** The linetypes the layers name, in acadiso.lin's paper mm (dash > 0, gap < 0, dot 0). */
const LINETYPES: Record<Exclude<LayerStyle['linetype'], 'CONTINUOUS'>, { text: string; dashes: number[] }> = {
  CENTER: { text: 'Center ____ _ ____ _ ____ _', dashes: [31.75, -6.35, 6.35, -6.35] },
  DASHED: { text: 'Dashed __ __ __ __ __ __', dashes: [12.7, -6.35] },
  PHANTOM: { text: 'Phantom ______  __  __  ______', dashes: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] },
  DIVIDE: { text: 'Divide ____ . . ____ . . ____', dashes: [12.7, -6.35, 0, -6.35, 0, -6.35] },
}
/** The name of a layer's linetype in the file: AutoCAD's own spelling of Continuous. */
const ltypeName = (t: LayerStyle['linetype']) => (t === 'CONTINUOUS' ? 'Continuous' : t)

/** Windows-1252's characters in 0x80–0x9F, by their byte. */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

/** A character's Windows-1252 byte; undefined when the code page has none. */
function cp1252(cp: number): number | undefined {
  if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) return cp
  return CP1252_HIGH[cp]
}

/** A string value: control characters as spaces, a caret as `^ ` (DXF's own escape), outside Windows-1252 `\U+XXXX`. */
function encodeText(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) out += ' '
    else if (ch === '^') out += '^ '
    else if (cp1252(cp) !== undefined) out += ch
    else if (cp <= 0xffff) out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
    else out += '?'
  }
  return out
}

/**
 * What a TEXT's string (group 1) says, so that CAD shows what was typed. `encodeText`'s rules, and CAD's own codes in a TEXT
 * put out of play: a backslash is `\U+005C` (so `\U+0041`, `\M+` or `\P` typed by a person stay as typed, not read as an
 * escape), and when the string holds `%%` (CAD's `%%d` degree, `%%c` diameter, `%%p` plus-minus, `%%u` underline, `%%o`
 * overline) every `%` is `%%037` (the code of the character 37), so none pairs up; a lone `%` is left as it is.
 */
function textValue(s: string): string {
  const slashed = s.replace(/\\/g, '\\U+005C')
  return encodeText(s.includes('%%') ? slashed.replace(/%/g, '%%037') : slashed)
}

/** The file as Windows-1252 bytes, its code page ($DWGCODEPAGE ANSI_1252); a character it has none for as `?`. */
export function dxfBytes(text: string): Uint8Array {
  const bytes: number[] = []
  for (const ch of text) bytes.push(cp1252(ch.codePointAt(0)!) ?? 0x3f)
  return Uint8Array.from(bytes)
}

/** A number: six decimals at most, trailing zeros trimmed, never exponent notation, -0 and non-finite as 0. */
export function dxfNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const s = n.toFixed(6).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

/** `<project> plan` (or `plan 3D`) as the app names its files: `Nave-Sur-plan_2026-11-09.dxf`. */
export function dxfFileName(project: string, threeD: boolean, date = new Date()): string {
  return fileName(`${project} plan${threeD ? ' 3D' : ''}`, 'dxf', date)
}

type Value = string | number
type Dim = Extract<PlanEntity, { kind: 'dim' }>

/** A dimension as drawn in its block, in the drawing's unit: the line, extension lines, ticks and text. */
interface DimDrawing {
  /** the dimension line's ends, opposite `a` and `b` */
  p1: Point
  p2: Point
  ext: [Point, Point][]
  ticks: [Point, Point][]
  /** the text's baseline middle, its angle (degrees, reading left to right or upwards) and the text's middle */
  text: Point
  angle: number
  middle: Point
  length: number
}

const add = (p: Point, v: Point, t = 1): Point => ({ x: p.x + v.x * t, y: p.y + v.y * t })

function dimDrawing(e: Dim, size: { txt: number; tsz: number; exo: number; exe: number; gap: number }): DimDrawing {
  const length = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
  const u = length > 0 ? { x: (e.b.x - e.a.x) / length, y: (e.b.y - e.a.y) / length } : { x: 1, y: 0 }
  const n = { x: -u.y, y: u.x }
  const off = (e.line.x - e.a.x) * n.x + (e.line.y - e.a.y) * n.y
  const p1 = add(e.a, n, off)
  const p2 = add(e.b, n, off)
  const side = off < 0 ? -1 : 1
  const out = { x: n.x * side, y: n.y * side }
  // each extension line from just off its point to just past the dimension line
  const ext: [Point, Point][] = [
    [add(e.a, out, Math.min(size.exo, Math.abs(off))), add(p1, out, size.exe)],
    [add(e.b, out, Math.min(size.exo, Math.abs(off))), add(p2, out, size.exe)],
  ]
  // an architectural tick: a stroke at 45° across each end of the dimension line
  const diag = { x: (u.x + n.x) / 2, y: (u.y + n.y) / 2 }
  const ticks: [Point, Point][] = [p1, p2].map((p) => [add(p, diag, -size.tsz), add(p, diag, size.tsz)])
  // the text above the line as it reads (Decision: DIMTAD 1), left to right or upwards
  const flip = u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0)
  const r = flip ? { x: -u.x, y: -u.y } : u
  const up = { x: -r.y, y: r.x }
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  return {
    p1,
    p2,
    ext,
    ticks,
    text: add(mid, up, size.gap),
    angle: (Math.atan2(r.y, r.x) * 180) / Math.PI,
    middle: add(mid, up, size.gap + size.txt / 2),
    length,
  }
}

export function dxfOf(plan: PlanExport): string {
  const k = METRES[plan.units]
  /** paper mm at $DIMSCALE 1 in the drawing's unit */
  const mm = (v: number) => (v * 0.001) / k
  /** paper mm at the header's $DIMSCALE, in the drawing's unit: what the dimension blocks draw */
  const drawn = (v: number) => mm(v) * DIMSCALE

  let next = 1
  const handle = () => (next++).toString(16).toUpperCase()

  const lines: string[] = []
  const g = (code: number, value: Value) => {
    lines.push(String(code).padStart(3, ' '), typeof value === 'number' ? dxfNumber(value) : value)
  }
  const point = (code: number, p: Point, z = 0) => {
    g(code, p.x)
    g(code + 10, p.y)
    g(code + 20, z)
  }

  const entities = plan.entities.filter((e) => (e.kind === 'poly' || e.kind === 'poly3d' ? e.points.length >= 2 : true))
  const dims = entities.filter((e): e is Dim => e.kind === 'dim')
  const size = { txt: drawn(DIM_MM.txt), tsz: drawn(DIM_MM.tsz), exo: drawn(DIM_MM.exo), exe: drawn(DIM_MM.exe), gap: drawn(DIM_MM.gap) }
  const drawings = dims.map((d) => dimDrawing(d, size))

  // ---- the extents of what is drawn
  const ext = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity }
  const grow = (p: Point, z = 0) => {
    ext.x0 = Math.min(ext.x0, p.x)
    ext.y0 = Math.min(ext.y0, p.y)
    ext.z0 = Math.min(ext.z0, z)
    ext.x1 = Math.max(ext.x1, p.x)
    ext.y1 = Math.max(ext.y1, p.y)
    ext.z1 = Math.max(ext.z1, z)
  }
  for (const e of entities) {
    if (e.kind === 'poly')
      for (const p of e.points) {
        grow(p, e.elevation)
        grow(p, e.elevation + e.thickness)
      }
    else if (e.kind === 'poly3d') for (const p of e.points) grow(p, p.z)
    else if (e.kind === 'line') [e.a, e.b].forEach((p) => grow(p, e.elevation))
    else if (e.kind === 'circle') [add(e.c, { x: 1, y: 1 }, -e.r), add(e.c, { x: 1, y: 1 }, e.r)].forEach((p) => grow(p, e.elevation))
    else if (e.kind === 'text') grow(e.at, e.elevation)
  }
  drawings.forEach((d, i) => [dims[i].a, dims[i].b, d.p1, d.p2, d.middle].forEach((p) => grow(p, dims[i].elevation)))
  const empty = !(ext.x0 <= ext.x1)
  const lo = empty ? { x: 0, y: 0, z: 0 } : { x: ext.x0, y: ext.y0, z: ext.z0 }
  const hi = empty ? { x: 0, y: 0, z: 0 } : { x: ext.x1, y: ext.y1, z: ext.z1 }

  // ---- handles fixed ahead: the tables, the block records, the styles, the dictionaries
  const tableNames = ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'] as const
  const table = Object.fromEntries(tableNames.map((t) => [t, handle()])) as Record<(typeof tableNames)[number], string>
  const record = { model: handle(), paper: handle(), dims: dims.map(() => handle()) }
  const styles = { Standard: handle(), GFIT: handle() }
  const dictionary = { root: handle(), group: handle(), plotStyle: handle(), layout: handle(), mlineStyle: handle() }
  /** the plot style Normal (a placeholder: the drawing is colour-dependent), the two layouts, the multiline style */
  const normal = handle()
  const layouts = { model: handle(), paper: handle() }
  const mlineStandard = handle()
  const dimBlock = (i: number) => `*D${i + 1}`

  // ---- CLASSES: the objects AutoCAD's own R2000 files declare, TABLES
  g(0, 'SECTION')
  g(2, 'CLASSES')
  for (const [dxfName, cppName] of [
    ['ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault'],
    ['ACDBPLACEHOLDER', 'AcDbPlaceHolder'],
    ['LAYOUT', 'AcDbLayout'],
  ]) {
    g(0, 'CLASS')
    g(1, dxfName)
    g(2, cppName)
    g(3, 'ObjectDBX Classes')
    g(90, 0)
    g(280, 0)
    g(281, 0)
  }
  g(0, 'ENDSEC')
  g(0, 'SECTION')
  g(2, 'TABLES')

  const openTable = (name: (typeof tableNames)[number], count: number) => {
    g(0, 'TABLE')
    g(2, name)
    g(5, table[name])
    g(330, '0')
    g(100, 'AcDbSymbolTable')
    g(70, count)
  }
  const openRecord = (type: string, subclass: string, owner: string, h = handle(), handleCode = 5) => {
    g(0, type)
    g(handleCode, h)
    g(330, owner)
    g(100, 'AcDbSymbolTableRecord')
    g(100, subclass)
  }

  // VPORT: the active viewport framing the extents
  openTable('VPORT', 1)
  openRecord('VPORT', 'AcDbViewportTableRecord', table.VPORT)
  const aspect = 1.6
  const height = empty ? 100 : Math.max(hi.y - lo.y, (hi.x - lo.x) / aspect, 1) * 1.1
  g(2, '*ACTIVE')
  g(70, 0)
  g(10, 0)
  g(20, 0)
  g(11, 1)
  g(21, 1)
  g(12, (lo.x + hi.x) / 2)
  g(22, (lo.y + hi.y) / 2)
  g(13, 0)
  g(23, 0)
  g(14, 1)
  g(24, 1)
  g(15, 10)
  g(25, 10)
  point(16, { x: 0, y: 0 }, 1)
  point(17, { x: 0, y: 0 }, 0)
  g(40, height)
  g(41, aspect)
  g(42, 50)
  g(43, 0)
  g(44, 0)
  g(50, 0)
  g(51, 0)
  for (const [code, v] of [[71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0], [281, 0], [65, 1]]) g(code, v)
  point(110, { x: 0, y: 0 })
  point(111, { x: 1, y: 0 })
  point(112, { x: 0, y: 1 })
  g(79, 0)
  g(146, 0)
  g(0, 'ENDTAB')

  // LTYPE: ByBlock, ByLayer, Continuous and the dashed ones, in paper mm as drawing units ($LTSCALE scales them)
  const linetypes: [string, string, number[]][] = [
    ['ByBlock', '', []],
    ['ByLayer', '', []],
    ['Continuous', 'Solid line', []],
    ...Object.entries(LINETYPES).map(([n, t]): [string, string, number[]] => [n, t.text, t.dashes]),
  ]
  openTable('LTYPE', linetypes.length)
  for (const [name, text, dashes] of linetypes) {
    openRecord('LTYPE', 'AcDbLinetypeTableRecord', table.LTYPE)
    g(2, name)
    g(70, 0)
    g(3, text)
    g(72, 65)
    g(73, dashes.length)
    // the total, of the elements as written: it equals their sum in the file
    g(40, dashes.reduce((s, d) => s + Math.abs(Number(dxfNumber(mm(d)))), 0))
    for (const d of dashes) {
      g(49, mm(d))
      g(74, 0)
    }
  }
  g(0, 'ENDTAB')

  // LAYER: 0 and each of the plan's, with colour, linetype, lineweight (hundredths of a mm) and the plot style Normal
  // (390: AutoCAD refuses a layer without one)
  const layers = Object.entries(plan.layers).filter(([name]) => name !== '0')
  // a layer an entity names that the plan's table lacks: in the file too (white, Continuous, the default weight)
  const missing = [...new Set(entities.map((e) => e.layer))].filter((l) => l !== '0' && !(l in plan.layers))
  openTable('LAYER', 1 + layers.length + missing.length)
  const layer = (name: string, color: number, linetype: string, weight: number) => {
    openRecord('LAYER', 'AcDbLayerTableRecord', table.LAYER)
    g(2, encodeText(name))
    g(70, 0)
    g(62, color)
    g(6, linetype)
    g(370, weight)
    g(390, normal)
  }
  layer('0', 7, 'Continuous', -3)
  for (const [name, s] of layers) layer(name, s.color, ltypeName(s.linetype), Math.round(s.weight * 100))
  for (const name of missing) layer(name, 7, 'Continuous', -3)
  g(0, 'ENDTAB')

  // STYLE: Standard and GFIT, both on AutoCAD's txt font, their height free (0)
  openTable('STYLE', 2)
  for (const [name, h] of Object.entries(styles)) {
    openRecord('STYLE', 'AcDbTextStyleTableRecord', table.STYLE, h)
    g(2, name)
    g(70, 0)
    g(40, 0)
    g(41, 1)
    g(50, 0)
    g(71, 0)
    g(42, drawn(DIM_MM.txt))
    g(3, 'txt')
    g(4, '')
  }
  g(0, 'ENDTAB')

  // VIEW, UCS: empty; APPID: ACAD
  openTable('VIEW', 0)
  g(0, 'ENDTAB')
  openTable('UCS', 0)
  g(0, 'ENDTAB')
  openTable('APPID', 1)
  openRecord('APPID', 'AcDbRegAppTableRecord', table.APPID)
  g(2, 'ACAD')
  g(70, 0)
  g(0, 'ENDTAB')

  // DIMSTYLE: Standard (AutoCAD's defaults) and GFIT (2.5 mm text and ticks, text above the line, two decimals)
  const dimStyles = { Standard: handle(), GFIT: handle() }
  openTable('DIMSTYLE', 2)
  g(100, 'AcDbDimStyleTable')
  g(71, 2)
  for (const h of Object.values(dimStyles)) g(340, h)
  openRecord('DIMSTYLE', 'AcDbDimStyleTableRecord', table.DIMSTYLE, dimStyles.Standard, 105)
  g(2, 'Standard')
  g(70, 0)
  g(340, styles.Standard)
  openRecord('DIMSTYLE', 'AcDbDimStyleTableRecord', table.DIMSTYLE, dimStyles.GFIT, 105)
  g(2, 'GFIT')
  g(70, 0)
  /** each variable: its header name, its group in the style and in the header, its value */
  const gfit: [string, number, number, number][] = [
    ['$DIMSCALE', 40, 40, DIMSCALE],
    ['$DIMASZ', 41, 40, mm(DIM_MM.asz)],
    ['$DIMEXO', 42, 40, mm(DIM_MM.exo)],
    ['$DIMDLI', 43, 40, mm(DIM_MM.dli)],
    ['$DIMEXE', 44, 40, mm(DIM_MM.exe)],
    ['$DIMTXT', 140, 40, mm(DIM_MM.txt)],
    ['$DIMCEN', 141, 40, mm(DIM_MM.cen)],
    ['$DIMTSZ', 142, 40, mm(DIM_MM.tsz)],
    ['$DIMGAP', 147, 40, mm(DIM_MM.gap)],
    ['$DIMTIH', 73, 70, 0],
    ['$DIMTOH', 74, 70, 0],
    ['$DIMTAD', 77, 70, 1],
    ['$DIMZIN', 78, 70, 0],
    ['$DIMDEC', 271, 70, 2],
    ['$DIMLUNIT', 277, 70, 2],
    ['$DIMDSEP', 278, 70, 46],
  ]
  for (const [, code, , v] of gfit) g(code, v)
  g(340, styles.GFIT)
  g(0, 'ENDTAB')

  // BLOCK_RECORD: model space and paper space, each with its layout (340), one anonymous *D<n> per dimension (none)
  openTable('BLOCK_RECORD', 2 + dims.length)
  const blockRecords: [string, string, string][] = [
    ['*Model_Space', record.model, layouts.model],
    ['*Paper_Space', record.paper, layouts.paper],
    ...record.dims.map((h, i): [string, string, string] => [dimBlock(i), h, '0']),
  ]
  for (const [name, h, layout] of blockRecords) {
    openRecord('BLOCK_RECORD', 'AcDbBlockTableRecord', table.BLOCK_RECORD, h)
    g(2, name)
    g(340, layout)
  }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')

  // ---- the entities' writers
  const entityHead = (type: string, owner: string, layerName: string, byBlock = false, h = handle()) => {
    g(0, type)
    g(5, h)
    g(330, owner)
    g(100, 'AcDbEntity')
    g(8, encodeText(layerName))
    if (byBlock) {
      g(6, 'ByBlock')
      g(62, 0)
      g(370, -2)
    }
    return h
  }
  // `z`: the height a flat entity stands at (3D plans: the ground; absent: 0)
  const writeLine = (owner: string, layerName: string, a: Point, b: Point, byBlock = false, z = 0) => {
    entityHead('LINE', owner, layerName, byBlock)
    g(100, 'AcDbLine')
    point(10, a, z)
    point(11, b, z)
  }
  const writeText = (owner: string, layerName: string, at: Point, height: number, text: string, center: boolean, angle = 0, byBlock = false, z = 0) => {
    entityHead('TEXT', owner, layerName, byBlock)
    g(100, 'AcDbText')
    point(10, at, z)
    g(40, height)
    g(1, textValue(text))
    if (angle !== 0) g(50, angle)
    g(7, 'GFIT')
    if (center) {
      g(72, 1)
      point(11, at, z)
    }
    g(100, 'AcDbText')
    g(73, 0)
  }
  const writeEntity = (e: PlanEntity, owner: string, dimIndex: number) => {
    switch (e.kind) {
      case 'poly': {
        entityHead('LWPOLYLINE', owner, e.layer)
        g(100, 'AcDbPolyline')
        g(90, e.points.length)
        g(70, e.closed ? 1 : 0)
        if (e.elevation !== 0) g(38, e.elevation)
        if (e.thickness !== 0) g(39, e.thickness)
        e.points.forEach((p, i) => {
          g(10, p.x)
          g(20, p.y)
          const b = e.bulges[i] ?? 0
          if (dxfNumber(b) !== '0') g(42, b)
        })
        return
      }
      case 'poly3d': {
        const h = entityHead('POLYLINE', owner, e.layer)
        g(100, 'AcDb3dPolyline')
        g(66, 1)
        point(10, { x: 0, y: 0 })
        g(70, 8 + (e.closed ? 1 : 0))
        for (const p of e.points) {
          entityHead('VERTEX', h, e.layer)
          g(100, 'AcDbVertex')
          g(100, 'AcDb3dPolylineVertex')
          point(10, p, p.z)
          g(70, 32)
        }
        entityHead('SEQEND', h, e.layer)
        return
      }
      case 'line':
        writeLine(owner, e.layer, e.a, e.b, false, e.elevation ?? 0)
        return
      case 'circle':
        entityHead('CIRCLE', owner, e.layer)
        g(100, 'AcDbCircle')
        point(10, e.c, e.elevation ?? 0)
        g(40, e.r)
        return
      case 'text':
        writeText(owner, e.layer, e.at, e.height, e.text, e.align === 'center', e.angle ?? 0, false, e.elevation ?? 0)
        return
      case 'dim': {
        const d = drawings[dimIndex]
        entityHead('DIMENSION', owner, e.layer)
        g(100, 'AcDbDimension')
        g(2, dimBlock(dimIndex))
        point(10, d.p2, e.elevation ?? 0)
        point(11, d.middle, e.elevation ?? 0)
        g(70, 1 + 32)
        g(71, 5)
        g(42, d.length)
        // no group 1: the text is the measurement (its block draws `e.text`, GFIT's DIMDEC 2), never an override, so
        // CAD updates it when a drafter stretches the dimension
        g(3, 'GFIT')
        g(100, 'AcDbAlignedDimension')
        point(13, e.a, e.elevation ?? 0)
        point(14, e.b, e.elevation ?? 0)
      }
    }
  }

  // ---- BLOCKS: model space, paper space, each dimension's drawing
  g(0, 'SECTION')
  g(2, 'BLOCKS')
  const block = (name: string, owner: string, paper: boolean, anonymous: boolean, body: () => void) => {
    g(0, 'BLOCK')
    g(5, handle())
    g(330, owner)
    g(100, 'AcDbEntity')
    if (paper) g(67, 1)
    g(8, '0')
    g(100, 'AcDbBlockBegin')
    g(2, name)
    g(70, anonymous ? 1 : 0)
    point(10, { x: 0, y: 0 })
    g(3, name)
    g(1, '')
    body()
    g(0, 'ENDBLK')
    g(5, handle())
    g(330, owner)
    g(100, 'AcDbEntity')
    if (paper) g(67, 1)
    g(8, '0')
    g(100, 'AcDbBlockEnd')
  }
  block('*Model_Space', record.model, false, false, () => {})
  block('*Paper_Space', record.paper, true, false, () => {})
  dims.forEach((e, i) => {
    const d = drawings[i]
    const owner = record.dims[i]
    block(dimBlock(i), owner, false, true, () => {
      const z = e.elevation ?? 0
      writeLine(owner, '0', d.p1, d.p2, true, z)
      for (const [a, b] of d.ext) writeLine(owner, '0', a, b, true, z)
      for (const [a, b] of d.ticks) writeLine(owner, '0', a, b, true, z)
      writeText(owner, '0', d.text, size.txt, e.text, true, d.angle, true, z)
    })
  })
  g(0, 'ENDSEC')

  // ---- ENTITIES, in model space
  g(0, 'SECTION')
  g(2, 'ENTITIES')
  let dimIndex = 0
  for (const e of entities) writeEntity(e, record.model, e.kind === 'dim' ? dimIndex++ : -1)
  g(0, 'ENDSEC')

  // ---- OBJECTS: the root dictionary, its groups, layouts, multiline styles and plot styles, as AutoCAD saves R2000
  g(0, 'SECTION')
  g(2, 'OBJECTS')
  const dict = (type: string, h: string, owner: string, entries: [string, string][]) => {
    g(0, type)
    g(5, h)
    g(330, owner)
    g(100, 'AcDbDictionary')
    g(281, 1)
    for (const [name, entry] of entries) {
      g(3, name)
      g(350, entry)
    }
  }
  dict('DICTIONARY', dictionary.root, '0', [
    ['ACAD_GROUP', dictionary.group],
    ['ACAD_LAYOUT', dictionary.layout],
    ['ACAD_MLINESTYLE', dictionary.mlineStyle],
    ['ACAD_PLOTSTYLENAME', dictionary.plotStyle],
  ])
  dict('DICTIONARY', dictionary.group, dictionary.root, [])
  // the plot styles: Normal, the default, the one every layer names
  dict('ACDBDICTIONARYWDFLT', dictionary.plotStyle, dictionary.root, [['Normal', normal]])
  g(100, 'AcDbDictionaryWithDefault')
  g(340, normal)
  g(0, 'ACDBPLACEHOLDER')
  g(5, normal)
  g(330, dictionary.plotStyle)
  // the layouts: Model and Layout1, an A3 sheet each, tied to their space's block record
  dict('DICTIONARY', dictionary.layout, dictionary.root, [
    ['Model', layouts.model],
    ['Layout1', layouts.paper],
  ])
  const writeLayout = (h: string, name: string, tab: number, blockRecord: string) => {
    g(0, 'LAYOUT')
    g(5, h)
    g(330, dictionary.layout)
    // the plot settings: AutoCAD's A3 defaults (the model's flag 1024: its tab)
    g(100, 'AcDbPlotSettings')
    const settings: [number, Value][] = [
      [1, ''], [4, 'A3'], [6, ''], [40, 7.5], [41, 20], [42, 7.5], [43, 20], [44, 420], [45, 297], [46, 0], [47, 0],
      [48, 0], [49, 0], [140, 0], [141, 0], [142, 1], [143, 1], [70, tab === 0 ? 1024 : 0], [72, 1], [73, 0], [74, 5],
      [7, ''], [75, 16], [76, 0], [77, 2], [78, 300], [147, 1], [148, 0], [149, 0],
    ]
    for (const [code, v] of settings) g(code, v)
    // the layout: its name, tab, limits, extents (1e20 and -1e20: none yet, written in full by `dxfNumber`), UCS
    g(100, 'AcDbLayout')
    const layout: [number, Value][] = [
      [1, name], [70, 1], [71, tab], [10, 0], [20, 0], [11, 420], [21, 297], [12, 0], [22, 0], [32, 0],
      [14, 1e20], [24, 1e20], [34, 1e20], [15, -1e20], [25, -1e20], [35, -1e20], [146, 0], [13, 0], [23, 0], [33, 0],
      [16, 1], [26, 0], [36, 0], [17, 0], [27, 1], [37, 0], [76, 1], [330, blockRecord],
    ]
    for (const [code, v] of layout) g(code, v)
  }
  writeLayout(layouts.model, 'Model', 0, record.model)
  writeLayout(layouts.paper, 'Layout1', 1, record.paper)
  // the multiline styles: Standard, two lines half a unit off its axis, ByLayer
  dict('DICTIONARY', dictionary.mlineStyle, dictionary.root, [['Standard', mlineStandard]])
  g(0, 'MLINESTYLE')
  g(5, mlineStandard)
  g(330, dictionary.mlineStyle)
  g(100, 'AcDbMlineStyle')
  const mline: [number, Value][] = [
    [2, 'Standard'], [70, 0], [3, ''], [62, 256], [51, 90], [52, 90], [71, 2],
    [49, 0.5], [62, 256], [6, 'BYLAYER'], [49, -0.5], [62, 256], [6, 'BYLAYER'],
  ]
  for (const [code, v] of mline) g(code, v)
  g(0, 'ENDSEC')
  g(0, 'EOF')

  // ---- HEADER, last: $HANDSEED is the next handle free
  const body = lines.splice(0)
  g(0, 'SECTION')
  g(2, 'HEADER')
  const variable = (name: string, ...groups: [number, Value][]) => {
    g(9, name)
    for (const [code, v] of groups) g(code, v)
  }
  const at3 = (p: { x: number; y: number; z: number }): [number, Value][] => [[10, p.x], [20, p.y], [30, p.z]]
  variable('$ACADVER', [1, 'AC1015'])
  variable('$DWGCODEPAGE', [3, 'ANSI_1252'])
  variable('$INSBASE', ...at3({ x: 0, y: 0, z: 0 }))
  variable('$EXTMIN', ...at3(lo))
  variable('$EXTMAX', ...at3(hi))
  variable('$LIMMIN', [10, lo.x], [20, lo.y])
  variable('$LIMMAX', [10, hi.x], [20, hi.y])
  variable('$LTSCALE', [40, DIMSCALE])
  variable('$PSLTSCALE', [70, 1])
  variable('$TEXTSTYLE', [7, 'GFIT'])
  variable('$CLAYER', [8, '0'])
  variable('$CELTYPE', [6, 'ByLayer'])
  variable('$CECOLOR', [62, 256])
  variable('$CELWEIGHT', [370, -1])
  variable('$DIMSTYLE', [2, 'GFIT'])
  for (const [name, , code, v] of gfit) variable(name, [code, v])
  variable('$DIMTXSTY', [7, 'GFIT'])
  variable('$LUNITS', [70, 2])
  variable('$LUPREC', [70, 4])
  variable('$INSUNITS', [70, INSUNITS[plan.units]])
  variable('$MEASUREMENT', [70, MEASUREMENT[plan.units]])
  variable('$LWDISPLAY', [290, 1])
  variable('$HANDSEED', [5, handle()])
  g(0, 'ENDSEC')

  return `${[...lines, ...body].join('\r\n')}\r\n`
}
