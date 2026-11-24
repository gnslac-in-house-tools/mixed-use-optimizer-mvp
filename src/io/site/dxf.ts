// A site from a DXF (Phase 5.2, Decision "Site files"): every closed shape in its model space, in the drawing's own
// units, for the designer to pick the boundary from. Closed polylines (LWPOLYLINE, 2D POLYLINE) keep their arcs; loose
// lines, arcs and open polylines are chained end to end into closed loops (engine/geom/contour.ts contourFromSpans);
// circles are closed shapes of their own. Splines, ellipses, blocks with no height and what is in paper space are left
// out, each with a warning. For the ground (Decision "Site file survey") it also keeps every polyline and line as drawn
// with its heights, the points, how many texts each layer has and, as points of the ground too (Decision "Survey
// points and roads"): a block placed at a height (a surveyor's point block: its insertion's z, or its ELEV attribute),
// a 3D face's corners (a TIN) and a text that is a number (a spot height). dxf-parser drops an old 2D POLYLINE's
// elevation (its header's group 30): such contours read as drawn flat, and get their heights with the Heights tool.
// Read with dxf-parser (MIT); a DWG's entities (dwg.ts) go through the same `drawingOf`.
import DxfParser from 'dxf-parser'
import type { Contour, LengthUnit, Point } from '../../model/schema.ts'
import { contourFromSpans, contourToPolygon, normalize, withBulges, type Span } from '../../engine/geom/contour.ts'
import { area, bounds, type Bounds } from '../../engine/geom/polygon.ts'

export { LENGTH_UNITS, type LengthUnit } from '../../model/schema.ts'
/** Metres in one unit. */
export const METRES: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 }
/** The header's $INSUNITS codes GFit reads. */
const INSUNITS: Record<number, LengthUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' }

/** A closed shape of the drawing, in its units, and the layer it is on. */
export interface DrawnShape {
  contour: Contour
  layer: string
}

/** A corner of a line, with its height, in the drawing's units. */
export interface Pt3 {
  x: number
  y: number
  z: number
}

/**
 * A line as drawn (a polyline, a line; Decision "Site file survey"): its corners with their heights (a polyline's
 * elevation, a 3D polyline's or a line's own; an arc's bulge is left, its ends kept), closed or not. The survey reads
 * contours and points of the ground from them.
 */
export interface DrawnLine {
  points: Pt3[]
  closed: boolean
  layer: string
  /** A polyline's arcs: each corner's bulge to the next (DXF's sign, counter-clockwise positive); absent: all straight. */
  bulges?: number[]
}

export interface DrawnPoint extends Pt3 {
  layer: string
}

export interface DxfDrawing {
  shapes: DrawnShape[]
  /** Every polyline and line as drawn, open or closed, with its heights. */
  lines: DrawnLine[]
  /** The points (POINT, a block placed at a height, a 3D face's corners), with their heights. */
  points: DrawnPoint[]
  /** How many texts each layer has (TEXT, MTEXT). */
  texts: Record<string, number>
  /** The texts that are a number, at their place: spot heights (Decision "Survey points and roads"). */
  labels: DrawnPoint[]
  /** The arcs and circles, as lines of corners, flat (Decision "Drawing layers": a reference layer's lines). */
  curves: DrawnLine[]
  /** Each layer's colour, by its AutoCAD Color Index (1–255), as its file's layer table says; absent: unknown. */
  colors: Record<string, number>
  /** What the header says ($INSUNITS); null: unitless or a unit GFit does not read. */
  units: LengthUnit | null
  warnings: string[]
}

export const DXF_UNREADABLE = 'This file could not be read as a DXF (GFit reads ASCII DXF; a DWG is read as one)'

interface Pt {
  x: number
  y: number
}
/** An entity as dxf-parser gives it (a DWG's are turned into these, dwg.ts). */
export interface Entity {
  type: string
  layer?: string
  inPaperSpace?: boolean
  shape?: boolean
  vertices?: (Pt & { bulge?: number; z?: number })[]
  /** An LWPOLYLINE's height. */
  elevation?: number
  /** A POINT's, an INSERT's or an MTEXT's place. */
  position?: Pt & { z?: number }
  /** A TEXT's place. */
  startPoint?: Pt & { z?: number }
  /** A TEXT's or an MTEXT's words. */
  text?: string
  /** An INSERT's attributes (a DWG's: dxf-parser leaves them out). */
  attribs?: { tag: string; text: string }[]
  /** An INSERT's block, its scales and its rotation (degrees, counter-clockwise). */
  name?: string
  xScale?: number
  yScale?: number
  rotation?: number
  center?: Pt
  radius?: number
  startAngle?: number
  endAngle?: number
  extrusionDirectionZ?: number
  extrusionDirection?: { z: number }
  is3dPolyline?: boolean
  is3dPolygonMesh?: boolean
  isPolyfaceMesh?: boolean
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

/** An entity drawn with its extrusion pointing down (a mirrored OCS) is mirrored in x. */
const mirrored = (e: Entity) => (e.extrusionDirectionZ ?? e.extrusionDirection?.z ?? 1) < 0

/** A polyline's vertices as spans; DXF's bulge is counter-clockwise positive, GFit's the other way (contour.ts). */
function polylineSpans(e: Entity, closed: boolean): Span[] {
  const flip = mirrored(e) ? -1 : 1
  const vs = (e.vertices ?? []).map((v) => ({ x: flip * v.x, y: v.y, bulge: flip * (v.bulge ?? 0) }))
  const out: Span[] = []
  const n = vs.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = vs[i]
    const b = vs[(i + 1) % n]
    if (dist(a, b) < 1e-12) continue
    out.push(a.bulge ? arcSpan(a, b, a.bulge) : { kind: 'line', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } })
  }
  return out
}

/** The arc from a to b with a DXF bulge (counter-clockwise positive). */
function arcSpan(a: Pt, b: Pt, bulge: number): Span {
  const theta = 4 * Math.atan(bulge) // signed sweep, counter-clockwise positive
  const chord = dist(a, b)
  const radius = chord / (2 * Math.abs(Math.sin(theta / 2)))
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  // the centre is off the chord's middle, to the left of a → b for a counter-clockwise arc under 180°
  const h = (chord / 2) / Math.tan(theta / 2)
  const u = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord }
  const center = { x: mid.x - u.y * h, y: mid.y + u.x * h }
  return { kind: 'arc', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, center, radius, ccw: theta > 0 }
}

function arcEntitySpan(e: Entity): Span | null {
  if (!e.center || !e.radius || e.startAngle === undefined || e.endAngle === undefined) return null
  const flip = mirrored(e) ? -1 : 1
  const c = { x: flip * e.center.x, y: e.center.y }
  const at = (t: number) => ({ x: c.x + flip * e.radius! * Math.cos(t), y: c.y + e.radius! * Math.sin(t) })
  return { kind: 'arc', a: at(e.startAngle), b: at(e.endAngle), center: c, radius: e.radius, ccw: flip > 0 }
}

/** A circle as four quarter arcs. */
function circleContour(e: Entity): Contour | null {
  if (!e.center || !e.radius) return null
  const c = { x: (mirrored(e) ? -1 : 1) * e.center.x, y: e.center.y }
  const vs = [0, 1, 2, 3].map((k) => ({ x: c.x + e.radius! * Math.cos((k * Math.PI) / 2), y: c.y + e.radius! * Math.sin((k * Math.PI) / 2), r: 0 }))
  return withBulges(vs, [0, 1, 2, 3].map(() => -Math.tan(Math.PI / 8)))
}

/** Loose spans joined end to end into closed loops; what does not close is counted. */
function chain(spans: { span: Span; layer: string }[], tol: number): { loops: { spans: Span[]; layer: string }[]; open: number } {
  const free = spans.slice()
  const loops: { spans: Span[]; layer: string }[] = []
  let open = 0
  while (free.length) {
    const first = free.shift()!
    const loop: Span[] = [first.span]
    let closed = false
    for (;;) {
      const end = loop[loop.length - 1].b
      if (loop.length > 1 && dist(end, loop[0].a) <= tol) {
        closed = true
        break
      }
      const k = free.findIndex((f) => dist(f.span.a, end) <= tol || dist(f.span.b, end) <= tol)
      if (k < 0) break
      const { span } = free.splice(k, 1)[0]
      loop.push(dist(span.a, end) <= tol ? span : span.kind === 'line' ? { ...span, a: span.b, b: span.a } : { ...span, a: span.b, b: span.a, ccw: !span.ccw })
    }
    if (closed) loops.push({ spans: loop, layer: first.layer })
    else open++
  }
  return { loops, open }
}

/** Is it a shape the boundary can be: three corners or more, some area? */
function usable(c: Contour): boolean {
  return c.vertices.length >= 3 && area(contourToPolygon(c)) > 1e-9
}

/** A block's definition: its base point and its entities (an INSERT places them; Decision "Drawing layers"). */
export interface Block {
  base: Pt
  entities: Entity[]
}

type Parsed = {
  header?: Record<string, unknown>
  entities?: Entity[]
  tables?: { layer?: { layers?: Record<string, { colorIndex?: number }> } }
  blocks?: Record<string, { position?: Pt; entities?: Entity[] }>
}

function parse(text: string): Parsed | null {
  try {
    return new DxfParser().parseSync(text) as Parsed | null
  } catch {
    return null
  }
}

/** A text's words without an MTEXT's formatting (`{\fArial|b0;452.5}`, `\P`), trimmed. */
export function plainText(s: string): string {
  return s
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/\\[PpNn~]/g, ' ')
    .replace(/[{}]/g, '')
    .trim()
}

/** The height a text says, when it is a number and nothing else ("452.5", "+452.50", "452,5 m"); null otherwise. */
export function heightOf(text: string): number | null {
  const m = plainText(text).match(/^\+?(-?\d{1,6}(?:[.,]\d+)?)\s*m?$/)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** The attributes that say a point's height (a surveyor's point block). */
const HEIGHT_TAGS = /^(elev|elevation|elevacion|z|cota|nivel|alt|altura|height)$/i

/** A block placed: its height, from its insertion (z) or from an attribute that says it; null when it has none. */
function blockHeight(e: Entity): number | null {
  const z = e.position?.z ?? 0
  if (z !== 0) return z
  for (const a of e.attribs ?? []) if (HEIGHT_TAGS.test(a.tag)) return heightOf(a.text)
  return null
}

/** The closed shapes of an ASCII DXF, in its units. Throws DXF_UNREADABLE when it is not one. */
export function readDxf(text: string): DxfDrawing {
  const dxf = parse(text)
  if (!dxf || !Array.isArray(dxf.entities)) throw new Error(DXF_UNREADABLE)
  const code = dxf.header?.$INSUNITS
  const colors = Object.fromEntries(Object.entries(dxf.tables?.layer?.layers ?? {}).flatMap(([name, l]) => (typeof l.colorIndex === 'number' ? [[name, l.colorIndex]] : [])))
  const blocks = Object.fromEntries(Object.entries(dxf.blocks ?? {}).map(([name, b]) => [name, { base: { x: b.position?.x ?? 0, y: b.position?.y ?? 0 }, entities: b.entities ?? [] }]))
  return drawingOf(dxf.entities, typeof code === 'number' ? code : null, colors, blocks)
}

/** How deep blocks inside blocks are placed. */
const NESTING = 4

/**
 * A block placed (an INSERT that is no surveyor's point): its lines, arcs and circles as lines of corners on the plan,
 * scaled, turned and moved as the INSERT says, a block inside it too; what is drawn on layer 0 takes the INSERT's
 * layer, as in AutoCAD. Only for references (`curves`): no shape, no ground. How many corners it gave.
 */
function explode(e: Entity, layer: string, blocks: Record<string, Block>, push: (pts: Pt[], closed: boolean, layer: string) => void, outer: (p: Pt) => Pt = (p) => p, depth = 0): number {
  const b = e.name ? blocks[e.name] : undefined
  if (!b || !e.position || depth >= NESTING) return 0
  const [sx, sy] = [e.xScale ?? 1, e.yScale ?? 1]
  const t = ((e.rotation ?? 0) * Math.PI) / 180
  const [cos, sin] = [Math.cos(t), Math.sin(t)]
  const at = e.position
  const place = (p: Pt) => {
    const x = (p.x - b.base.x) * sx
    const y = (p.y - b.base.y) * sy
    return outer({ x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos })
  }
  let made = 0
  for (const c of b.entities) {
    const on = !c.layer || c.layer === '0' ? layer : c.layer
    const out = (pts: Pt[], closed: boolean) => {
      if (pts.length < 2) return
      push(pts.map(place), closed, on)
      made += pts.length
    }
    if (c.type === 'LWPOLYLINE' || c.type === 'POLYLINE') {
      const vs = c.vertices ?? []
      const closed = !!c.shape
      out(strokeOf({ points: vs.map((v) => ({ x: v.x, y: v.y, z: 0 })), closed, layer: on, bulges: vs.map((v) => v.bulge ?? 0) }), closed)
    } else if (c.type === 'LINE' && c.vertices?.length === 2) out(c.vertices, false)
    else if (c.type === 'CIRCLE' && c.center && c.radius) out(arcCorners(c.center, c.radius, 0, 2 * Math.PI), true)
    else if (c.type === 'ARC') {
      const span = arcEntitySpan(c)
      if (span?.kind === 'arc') {
        const a0 = Math.atan2(span.a.y - span.center.y, span.a.x - span.center.x)
        const a1 = Math.atan2(span.b.y - span.center.y, span.b.x - span.center.x)
        out(arcCorners(span.center, span.radius, a0, span.ccw ? turn(a1 - a0) : -turn(a0 - a1)), false)
      }
    } else if (c.type === 'INSERT') made += explode(c, on, blocks, push, place, depth + 1)
  }
  return made
}

/** The turn from one angle to another, counter-clockwise (0 to 2π, never none: a whole circle). */
const turn = (d: number) => ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI

/** Corners along an arc round `c` from angle `a0` by `sweep` (radians, counter-clockwise positive), a few degrees apart. */
function arcCorners(c: Pt, r: number, a0: number, sweep: number): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)))
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos(a0 + (sweep * i) / n), y: c.y + r * Math.sin(a0 + (sweep * i) / n) }))
}

/** A line's corners with its arcs (bulges) drawn as corners a few degrees apart: a reference layer's line as it shows. */
export function strokeOf(l: DrawnLine): Pt[] {
  const bulges = l.bulges
  if (!bulges?.some((b) => b !== 0)) return l.points.map((p) => ({ x: p.x, y: p.y }))
  const n = l.points.length
  const out: Pt[] = [{ x: l.points[0].x, y: l.points[0].y }]
  for (let i = 0; i < (l.closed ? n : n - 1); i++) {
    const a = l.points[i]
    const b = l.points[(i + 1) % n]
    const bulge = bulges[i] ?? 0
    const span = bulge && dist(a, b) > 1e-12 ? arcSpan(a, b, bulge) : null
    if (span?.kind !== 'arc') {
      out.push({ x: b.x, y: b.y })
      continue
    }
    const a0 = Math.atan2(a.y - span.center.y, a.x - span.center.x)
    out.push(...arcCorners(span.center, span.radius, a0, 4 * Math.atan(bulge)).slice(1))
  }
  return out
}

/** A drawing from its entities (a DXF's, or a DWG's turned into them) and its header's $INSUNITS code. */
export function drawingOf(entities: Entity[], insunits: number | null, colors: Record<string, number> = {}, blocks: Record<string, Block> = {}): DxfDrawing {
  const units = insunits === null ? null : (INSUNITS[insunits] ?? null)
  const warnings: string[] = []
  const shapes: DrawnShape[] = []
  const lines: DrawnLine[] = []
  const points: DrawnPoint[] = []
  const texts: Record<string, number> = {}
  const labels: DrawnPoint[] = []
  const curves: DrawnLine[] = []
  const curve = (pts: Pt[], closed: boolean, layer: string) => curves.push({ points: pts.map((p) => ({ x: p.x, y: p.y, z: 0 })), closed, layer })
  const loose: { span: Span; layer: string }[] = []
  const skipped: Record<string, number> = {}
  const skip = (what: string) => (skipped[what] = (skipped[what] ?? 0) + 1)
  // a TIN's corners are shared by its faces: each once per layer
  const corners = new Set<string>()
  const corner = (p: Pt3, layer: string) => {
    const key = `${layer}|${p.x}|${p.y}|${p.z}`
    if (corners.has(key)) return
    corners.add(key)
    points.push({ ...p, layer })
  }

  for (const e of entities) {
    if (e.inPaperSpace) {
      skip('paper space entities')
      continue
    }
    const layer = e.layer ?? '0'
    switch (e.type) {
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (e.is3dPolygonMesh || e.isPolyfaceMesh) {
          skip('meshes')
          break
        }
        const vs = e.vertices ?? []
        const closed = !!e.shape || (vs.length > 2 && dist(vs[0], vs[vs.length - 1]) < 1e-9)
        // as drawn, for the ground: an LWPOLYLINE's height is its elevation, a POLYLINE's its corners'
        const flip = mirrored(e) ? -1 : 1
        const flat = e.type === 'LWPOLYLINE' ? (e.elevation ?? 0) : null
        if (vs.length >= 2) {
          const bulges = vs.some((v) => v.bulge) ? vs.map((v) => flip * (v.bulge ?? 0)) : undefined
          lines.push({ points: vs.map((v) => ({ x: flip * v.x, y: v.y, z: flat ?? v.z ?? 0 })), closed, layer, ...(bulges ? { bulges } : {}) })
        }
        const spans = polylineSpans(e, closed)
        if (closed && spans.length >= 2) {
          const { contour, warnings: w } = contourFromSpans(spans)
          if (usable(contour)) shapes.push({ contour, layer })
          warnings.push(...w)
        } else spans.forEach((span) => loose.push({ span, layer }))
        break
      }
      case 'LINE': {
        const [a, b] = e.vertices ?? []
        if (a && b && dist(a, b) > 1e-12) {
          loose.push({ span: { kind: 'line', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }, layer })
          lines.push({ points: [{ x: a.x, y: a.y, z: a.z ?? 0 }, { x: b.x, y: b.y, z: b.z ?? 0 }], closed: false, layer })
        }
        break
      }
      case 'POINT':
        if (e.position) points.push({ x: e.position.x, y: e.position.y, z: e.position.z ?? 0, layer })
        break
      case 'TEXT':
      case 'MTEXT': {
        texts[layer] = (texts[layer] ?? 0) + 1
        const at = e.type === 'TEXT' ? (e.startPoint ?? e.position) : e.position
        const h = e.text === undefined ? null : heightOf(e.text)
        if (at && h !== null) labels.push({ x: at.x, y: at.y, z: h, layer })
        break
      }
      case '3DFACE':
        for (const v of e.vertices ?? []) if (Number.isFinite(v.x) && Number.isFinite(v.y)) corner({ x: v.x, y: v.y, z: v.z ?? 0 }, layer)
        break
      case 'ARC': {
        const span = arcEntitySpan(e)
        if (span?.kind === 'arc') {
          loose.push({ span, layer })
          // from its start to its end, counter-clockwise (clockwise when mirrored): the turn between them, never none
          const a0 = Math.atan2(span.a.y - span.center.y, span.a.x - span.center.x)
          const a1 = Math.atan2(span.b.y - span.center.y, span.b.x - span.center.x)
          curve(arcCorners(span.center, span.radius, a0, span.ccw ? turn(a1 - a0) : -turn(a0 - a1)), false, layer)
        }
        break
      }
      case 'CIRCLE': {
        const c = circleContour(e)
        if (c) {
          shapes.push({ contour: normalize(c), layer })
          curve(arcCorners({ x: (mirrored(e) ? -1 : 1) * e.center!.x, y: e.center!.y }, e.radius!, 0, 2 * Math.PI), true, layer)
        }
        break
      }
      case 'INSERT': {
        // a surveyor's point block: a point of the ground; any other block is left out
        // any other is placed as lines of reference (Decision "Drawing layers"): trees, furniture, marks
        const h = blockHeight(e)
        if (e.position && h !== null) points.push({ x: e.position.x, y: e.position.y, z: h, layer })
        else if (explode(e, layer, blocks, curve) === 0) skip('blocks (explode them to read them)')
        break
      }
      case 'SPLINE':
      case 'ELLIPSE':
        skip('splines and ellipses')
        break
      default:
        break
    }
  }

  if (loose.length) {
    const all = loose.flatMap((l) => [l.span.a, l.span.b])
    const b = bounds(all)
    const tol = Math.max(1e-9, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 1e-5)
    const { loops, open } = chain(loose, tol)
    for (const loop of loops) {
      const { contour, warnings: w } = contourFromSpans(loop.spans)
      if (usable(contour)) shapes.push({ contour, layer: loop.layer })
      warnings.push(...w)
    }
    if (open) warnings.push(`${open} open line${open === 1 ? '' : 's'} left out (not closed)`)
  }
  for (const [what, n] of Object.entries(skipped)) warnings.push(`${n} ${what} left out`)
  return { shapes, lines, points, texts, labels, curves, colors, units, warnings }
}

/** The box round a list of contours (their arcs included). */
export function contoursBounds(cs: Contour[]): Bounds | null {
  const pts: Point[] = cs.flatMap((c) => contourToPolygon(c))
  return pts.length ? bounds(pts) : null
}
