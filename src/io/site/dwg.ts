// A site from a DWG (Decision "DWG as DXF"; the user: "the import should take AutoCAD too: transform it to DXF"):
// LibreDWG compiled to WebAssembly (@mlightcad/libredwg-web, GPL-3.0) reads the file in the browser, and its
// entities are turned into the ones dxf-parser gives for a DXF, so the drawing is read by the same `drawingOf`
// (dxf.ts): what a DXF of it would give, and its surveyor's point blocks with their ELEV attribute. The library and
// its 9 MB of WebAssembly load only when a .dwg is opened (`load`), never with the app.
import { drawingOf, type Block, type DxfDrawing, type Entity } from './dxf.ts'

export const DWG_UNREADABLE = 'This file could not be read as a DWG'

interface P3 {
  x: number
  y: number
  z?: number
}
/** What the entities of @mlightcad/libredwg-web's DwgDatabase hold that a site needs (its types, loosely). */
export interface DwgEntityLike {
  type: string
  layer: string
  isInPaperSpace?: boolean
  flag?: number
  elevation?: number
  extrusionDirection?: P3
  vertices?: (P3 & { bulge?: number })[]
  startPoint?: P3
  endPoint?: P3
  position?: P3
  insertionPoint?: P3
  center?: P3
  radius?: number
  startAngle?: number
  endAngle?: number
  text?: string
  attribs?: { tag?: string; text?: { text?: string } | string }[]
  /** An INSERT's block, its scales and its rotation (radians, as LibreDWG gives it). */
  name?: string
  xScale?: number
  yScale?: number
  rotation?: number
  corner1?: P3
  corner2?: P3
  corner3?: P3
  corner4?: P3
}

/** A DWG's extrusion is stored only when it is not the default: (0, 0, 0) is up. */
const upZ = (e: DwgEntityLike) => (e.extrusionDirection && e.extrusionDirection.z !== 0 ? e.extrusionDirection.z : 1)

/** LibreDWG's LWPOLYLINE flag: closed is 512 (a DXF's is 1). */
const LW_CLOSED = 512
/** A POLYLINE's (2D, 3D): closed is 1, as in a DXF. */
const PL_CLOSED = 1

/** A DWG entity as dxf-parser would give it from the DXF of the same drawing; null: one a site never reads. */
export function asDxfEntity(e: DwgEntityLike): Entity | null {
  const base = { layer: e.layer, inPaperSpace: !!e.isInPaperSpace, extrusionDirectionZ: upZ(e) }
  switch (e.type) {
    case 'LWPOLYLINE':
      return { ...base, type: 'LWPOLYLINE', shape: ((e.flag ?? 0) & LW_CLOSED) !== 0, elevation: e.elevation ?? 0, vertices: (e.vertices ?? []).map((v) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 })) }
    case 'POLYLINE2D':
      return { ...base, type: 'POLYLINE', shape: ((e.flag ?? 0) & PL_CLOSED) !== 0, vertices: (e.vertices ?? []).map((v) => ({ x: v.x, y: v.y, z: e.elevation ?? v.z ?? 0, bulge: v.bulge ?? 0 })) }
    case 'POLYLINE3D':
      return { ...base, type: 'POLYLINE', shape: ((e.flag ?? 0) & PL_CLOSED) !== 0, is3dPolyline: true, vertices: (e.vertices ?? []).map((v) => ({ x: v.x, y: v.y, z: v.z ?? 0 })) }
    case 'LINE':
      return e.startPoint && e.endPoint ? { ...base, type: 'LINE', vertices: [e.startPoint, e.endPoint] } : null
    case 'POINT':
      return e.position ? { ...base, type: 'POINT', position: e.position } : null
    case 'CIRCLE':
      return { ...base, type: 'CIRCLE', center: e.center, radius: e.radius }
    case 'ARC':
      return { ...base, type: 'ARC', center: e.center, radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle }
    case 'TEXT':
      return { ...base, type: 'TEXT', text: e.text ?? '', startPoint: e.startPoint }
    case 'MTEXT':
      return { ...base, type: 'MTEXT', text: e.text ?? '', position: e.insertionPoint }
    case 'INSERT':
      return {
        ...base,
        type: 'INSERT',
        position: e.insertionPoint,
        name: e.name,
        xScale: e.xScale,
        yScale: e.yScale,
        // dxf-parser's is in degrees
        rotation: ((e.rotation ?? 0) * 180) / Math.PI,
        attribs: (e.attribs ?? []).map((a) => ({ tag: a.tag ?? '', text: typeof a.text === 'string' ? a.text : (a.text?.text ?? '') })),
      }
    case '3DFACE':
      return { ...base, type: '3DFACE', vertices: [e.corner1, e.corner2, e.corner3, e.corner4].filter((c): c is P3 => !!c) }
    case 'SPLINE':
    case 'ELLIPSE':
      return { ...base, type: e.type }
    default:
      return null
  }
}

/** A DWG's layer table, as far as a site reads it: each layer's name and its colour (AutoCAD Color Index). */
export interface DwgLayerLike {
  name: string
  colorIndex?: number
}

/** A DWG's block, as far as a site reads it: its name, base point and entities (LibreDWG's BLOCK_RECORD). */
export interface DwgBlockLike {
  name: string
  basePoint?: P3
  entities?: DwgEntityLike[]
}

/** A DWG's entities, header's units, layers and blocks, as a drawing (what `readDwg` does once the library has read the file). */
export function dwgDrawing(entities: DwgEntityLike[], insunits: number | null | undefined, layers: DwgLayerLike[] = [], blocks: DwgBlockLike[] = []): DxfDrawing {
  const colors = Object.fromEntries(layers.flatMap((l) => (typeof l.colorIndex === 'number' && l.colorIndex > 0 ? [[l.name, l.colorIndex]] : [])))
  const defs = Object.fromEntries(
    blocks
      .filter((b) => !/^\*(model|paper)_space/i.test(b.name) && b.entities?.length)
      .map((b): [string, Block] => [b.name, { base: { x: b.basePoint?.x ?? 0, y: b.basePoint?.y ?? 0 }, entities: b.entities!.flatMap((e) => asDxfEntity(e) ?? []) }]),
  )
  return drawingOf(entities.flatMap((e) => asDxfEntity(e) ?? []), insunits ?? null, colors, defs)
}

type Library = typeof import('@mlightcad/libredwg-web')
type Instance = ReturnType<Library['LibreDwg']['createByWasmInstance']>
let loading: Promise<{ lib: Library; wasm: ArrayBuffer }> | null = null

/** The library and its WebAssembly's bytes, fetched once, the first time a DWG is opened. */
function load() {
  loading ??= (async () => {
    const [lib, url] = await Promise.all([import('@mlightcad/libredwg-web'), import('libredwg-wasm?url')])
    const wasm = await (await fetch(url.default)).arrayBuffer()
    return { lib, wasm }
  })()
  loading.catch(() => (loading = null))
  return loading
}

/**
 * A new instance of LibreDWG, for one read. Its state does not survive a read: a second file read by the same
 * instance throws ("null function or function signature mismatch"), so a DWG opened after another (or after an import
 * let go) read as unreadable. The WebAssembly is fetched once; each read instantiates it afresh (~150 ms).
 */
async function instance(): Promise<{ lib: Library; dwg: Instance }> {
  const { lib, wasm } = await load()
  return { lib, dwg: lib.LibreDwg.createByWasmInstance(await lib.createModule({ wasmBinary: wasm })) }
}

/** A DWG's drawing, in its units. Throws DWG_UNREADABLE when it is not one. */
export async function readDwg(bytes: ArrayBuffer, open: () => Promise<{ lib: Pick<Library, 'Dwg_File_Type'>; dwg: Instance }> = instance): Promise<DxfDrawing> {
  const { lib, dwg } = await open()
  let data: ReturnType<typeof dwg.dwg_read_data> | undefined
  try {
    data = dwg.dwg_read_data(bytes, lib.Dwg_File_Type.DWG)
    if (!data) throw new Error(DWG_UNREADABLE)
    const db = dwg.convert(data)
    return dwgDrawing(
      db.entities as unknown as DwgEntityLike[],
      db.header.INSUNITS,
      (db.tables?.LAYER?.entries ?? []) as unknown as DwgLayerLike[],
      (db.tables?.BLOCK_RECORD?.entries ?? []) as unknown as DwgBlockLike[],
    )
  } catch {
    throw new Error(DWG_UNREADABLE)
  } finally {
    if (data) dwg.dwg_free(data)
  }
}
