// Frozen: generate.ts, the block as BLOCK_VERSION 4 kept it, for the steps that read older files; never edited, never imported by
// the app (only engine/migrate.ts reaches this folder: src/modules/__tests__/boundaries.test.ts). Copied from generate.ts as it
// stood before Phase D.2; only its imports differ.
// The warehouse type as a generator (Decisions "Warehouse type", "Block shape"), pure: a type (with a copy's overrides)
// → its one mass (its outline and its holes, its program and height), its zones (information inside it), its columns,
// its walls and its doors, all in the type's own frame: column line A / 1 at (0, 0), x along the box's length, y along
// its width (bays.ts). Everything downstream reads masses: a copy's mass is this placed on the plan (copies.ts).
//   step 2  the box: its column lines, the runs of bays and modules the shape's corners stand on
//   step 3  a column at every grid intersection inside the outline (every n lines each way, the box's first and last
//           always), none in a hole
//   step 4  the envelope: a wall along each edge (the envelope's thickness, or the edge's own) and round each hole
//   step 5  the shape (shape.ts): the outline on the module lines, each edge's facade offset, the holes, the zones
//           (zones.ts: each its program and level, its pieces of the mass)
//   step 6  the elements: docks, doors and a named pattern, one centred on each module it names along its edge
//           (Decision "Elements by module"), counted on the box now (a copy's anchored onto it: typeWith)
import type { HallElement, HallSide, HallZone, Id, Point, Polygon } from '../../../../model/schema.ts'
import type { LegacyOutlineCorner as OutlineCorner, LegacyOverrides as WarehouseOverrides, LegacyShapeHole as ShapeHole, LegacyType as WarehouseType } from './types.ts'
import { difference, intersection } from '../../../../engine/geom/boolean.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { joinOn, moduleLine, runAlong, withOwnLines, type HallRuns, type JoinRule, type Run } from '../bays.ts'
import { axisOf, elementsAnchored, elementsNearest, elementsOn, facePolygon, faceOf, facing, holeRect, moduleSpot, outlineOn, outwardOf, ownBox, relaidRuns, relaidShape, shapeOf, type ShapeEdge } from './lines.ts'

export { moduleSpot }
/** The modules a run has (zones.ts, which reads the live shape: not imported here). */
const modulesOf = (r: Run): number => r.modules.length - 1

/** m: two lengths this close are the same. */
const ON = 0.005
/** m: how far past the box a zone on its edge reaches (it only has to). */
const FAR = 1e4

/**
 * A type with a copy's overrides: each step's figures over the type's, a list given in place of the type's (a
 * variant's own outline among them: Decision "Block shape"). Its elements on the copy's box (Decision "Elements by
 * module"): the type's, counted on the type's box, or the copy's own, counted on the box its own outline was drawn on,
 * each anchored onto the copy's box from the box its corners are (one frame: the type's elements under a copy's own
 * outline first onto that outline's box, as its corners were); on another grid, the type's each on the module nearest
 * where it stood.
 */
export function typeWith(t: WarehouseType, o: WarehouseOverrides | undefined): WarehouseType {
  if (!o) return t
  const made: WarehouseType = {
    ...t,
    program: o.program !== undefined ? o.program : t.program,
    grid: { ...t.grid, ...o.grid },
    hall: { ...t.hall, ...o.hall },
    columns: { ...t.columns, ...o.columns },
    envelope: { ...t.envelope, ...o.envelope },
    morphology: { ...t.morphology, ...o.morphology },
    elements: o.elements ?? t.elements,
    ...(o.courts ? { courts: o.courts } : {}),
  }
  if (!made.elements.length || !(o.hall || o.grid || o.morphology?.outline)) return made
  const from = hallRuns(t)
  const typeBox = boxOf(from)
  const typeAxis = axisOf(outlineOn(t.morphology, typeBox.x, typeBox.y))
  const own = (o.morphology?.outline?.length ?? 0) >= 4 ? o.morphology!.outline! : null
  const runs = hallRuns(made)
  let elements = made.elements
  if (!own && !o.elements && !sameGridAs(made, t)) elements = elementsNearest(elements, typeAxis, from, runs, shapeOf(made, runs).edges)
  else {
    if (own && !o.elements) elements = elementsAnchored(elements, typeAxis, typeBox, ownBox(own))
    const ownAxis = own ? axisOf(own) : typeAxis
    elements = elementsAnchored(elements, (e) => ownAxis(e) ?? typeAxis(e), own ? ownBox(own) : typeBox, boxOf(runs))
  }
  return elements === made.elements ? made : { ...made, elements }
}

/** A box's size in modules, from its runs. */
export const boxOf = (runs: HallRuns): { x: number; y: number } => ({ x: modulesOf(runs.x), y: modulesOf(runs.y) })

/** Whether two types lay their bays on one grid (the bay each way, the modules a bay). */
export const sameGridAs = (a: Pick<WarehouseType, 'grid'>, b: Pick<WarehouseType, 'grid'>): boolean => a.grid.x === b.grid.x && a.grid.y === b.grid.y && a.grid.modules === b.grid.modules

/**
 * A copy's own shape (and its own elements with it) drawn again on its box as it is after an edit of its box or its
 * type's (Decision "Elements by module": one frame for corners, holes, zones and elements, the box now): its outline,
 * holes and zones as they stand there, its own elements anchored there (another grid: each on the module nearest
 * where it stood; its box relaid at its size, `relaidRuns`: everything in its place in m). `tb`, `ob`: the type and the
 * overrides before; `ta`, `oa` after. No own shape, or its box as it was: `oa` as it is.
 */
export function rebasedCopy(tb: WarehouseType, ob: WarehouseOverrides | undefined, ta: WarehouseType, oa: WarehouseOverrides | undefined): WarehouseOverrides | undefined {
  const own = oa?.morphology?.outline
  if (!oa || !own || own.length < 4) return oa
  // one bundle: its own outline carries its own elements (`ownBundle`); those as they stood on its box before
  const before = typeWith(tb, { ...ob, ...(oa.elements ? { elements: oa.elements } : {}) })
  const after = typeWith(ta, oa)
  const rb = hallRuns(before)
  const ra = hallRuns(after)
  const box = boxOf(ra)
  const drawn = ownBox(own)
  const regrid = !sameGridAs(before, after)
  const was = shapeOf(before, rb)
  const relaid = !regrid && relaidRuns(rb, ra)
  if (relaid) {
    // its box relaid at its size (`relaidRuns`): everything of its own in its place in m
    const laid = relaidShape({ outline: was.outline, holes: was.holes, ...(after.morphology.zones?.length ? { zones: was.zones } : {}) }, rb, ra)
    if (laid) {
      const edges = shapeOf({ ...after, morphology: laid }, ra).edges
      return { ...oa, morphology: { ...after.morphology, ...laid }, elements: elementsNearest(elementsOn(before, rb, was.edges), axisOf(was.outline), rb, ra, edges) }
    }
  }
  if (!regrid && !relaid && drawn.x === box.x && drawn.y === box.y && oa.elements) return oa
  const shape = shapeOf(after, ra)
  // another grid, or a box relaid whose shape could not be (`relaidShape` null): by the nearest centre, never by index
  const elements = regrid || relaid ? elementsNearest(elementsOn(before, rb, was.edges), axisOf(was.outline), rb, ra, shape.edges) : elementsOn(after, ra, shape.edges)
  return { ...oa, morphology: shapeMorphology(after, shape), elements }
}

/** A shape as a copy keeps it: its outline, its holes and (its type's or its own having any) its zones. */
function shapeMorphology(t: Pick<WarehouseType, 'morphology'>, shape: { outline: OutlineCorner[]; holes: ShapeHole[]; zones: HallZone[] }): WarehouseOverrides['morphology'] {
  return { ...t.morphology, outline: shape.outline, holes: shape.holes, ...(t.morphology.zones?.length ? { zones: shape.zones } : {}) }
}

/**
 * A copy's own shape as one bundle (Decision "Elements by module", the controller's ruling): whenever it keeps an own
 * outline it keeps its own elements, holes and zones with it, all on one box, so it never reads its type's elements
 * through a frame of its own; its truck courts by edge too (BE.2: its type's on the edges its outline has, when it has
 * none of its own), so an edge id of its own never names its type's. One kept without them (`t`, `o`: its type and overrides as they are) given them as they
 * stand on its box now, the outline drawn there too. No own outline, or a whole bundle: as it is.
 */
export function ownBundle(t: WarehouseType, o: WarehouseOverrides | undefined): WarehouseOverrides | undefined {
  const own = o?.morphology?.outline
  if (!o || !own || own.length < 4) return o
  // its truck courts by edge too (BE.2): its own, else its type's on the edges its outline has
  const courts = o.courts ?? (t.courts ?? []).filter((c) => own.some((k) => k.id === c.edge))
  const whole = !!o.elements && !!o.morphology?.holes && (!!o.morphology.zones || !t.morphology.zones?.length)
  if (whole) return o.courts ? o : { ...o, courts }
  const c = typeWith(t, o)
  const runs = hallRuns(c)
  const shape = shapeOf(c, runs)
  return { ...o, morphology: shapeMorphology(c, shape), elements: elementsOn(c, runs, shape.edges), courts }
}

/**
 * The box's bays along its length and its width, its own lines moved or deleted (Decision "Grid by line"); `join`: a
 * join rule other than the hall's (an old file's).
 */
export function hallRuns(t: Pick<WarehouseType, 'grid' | 'hall'>, join: JoinRule | undefined = t.hall.joinUnder): HallRuns {
  return {
    x: withOwnLines(runAlong(t.hall.length, t.grid.x, t.grid.modules, t.hall.ends, t.hall.shortEnds?.x, joinOn(join, 'x')), t.grid.lines?.x),
    y: withOwnLines(runAlong(t.hall.width, t.grid.y, t.grid.modules, t.hall.endsWidth ?? t.hall.ends, t.hall.shortEnds?.y, joinOn(join, 'y')), t.grid.lines?.y),
  }
}

/** The box's bays by the rules alone: no line of its own. */
export function regularRuns(t: Pick<WarehouseType, 'grid' | 'hall'>): HallRuns {
  const { lines: _, ...grid } = t.grid
  return hallRuns({ ...t, grid })
}

/**
 * The lengths a variant's box may take along `key` (Decisions "Smart blocks", "Block shape"; by hand and by the
 * optimizer): whole modules of the block's grid counted from the block's size (its own need not be one), held to the
 * block's range (without one, `bays` either way), never under a module.
 */
export function hallLimits(t: Pick<WarehouseType, 'grid' | 'hall'>, key: 'length' | 'width', bays = 2): { module: number; lo: number; hi: number } {
  const bay = key === 'length' ? t.grid.x : t.grid.y
  const module = bay / t.grid.modules
  const base = t.hall[key]
  const range = t.hall.range?.[key] ?? [base - bays * bay, base + bays * bay]
  // each limit to the module inside it
  const lo = Math.max(base - Math.floor((base - module) / module + 1e-6) * module, base + Math.ceil((range[0] - base) / module - 1e-6) * module)
  const hi = Math.max(lo, base + Math.floor((range[1] - base) / module + 1e-6) * module)
  return { module, lo: mm(lo), hi: mm(hi) }
}

/** The block's one mass (Decision "Block shape": one mass, one program). */
export interface GeneratedPart {
  part: 'hall'
  name: string
  kind: 'hall'
  program: Id | null
  /** Its outline, the envelope's outer face, counter-clockwise. */
  polygon: Polygon
  /** Its holes' walls' outer faces, clockwise. */
  holes: Polygon[]
  height: number
  level: number
}

/**
 * A zone inside the mass: its program and level, its pieces (the zone's rectangle on the mass: their outlines, and
 * `regions` each its outline then the holes inside it), their area (m²).
 */
export interface GeneratedZone {
  id: Id
  name?: string
  program: Id | null
  level: number
  pieces: Polygon[]
  regions: Polygon[][]
  area: number
}

/** A stretch of wall: its outer face from `a` to `b`, `thickness` m inwards (its left); on an edge or round a hole. */
export interface GeneratedWall {
  a: Point
  b: Point
  side: HallSide
  thickness: number
  part: 'hall'
  edge?: Id
  hole?: Id
}

/** An element placed: its middle on its edge's outer face, its width along the wall, the way out; the module it is on
 *  (counted on the box now). */
export interface GeneratedDoor {
  element: Id
  kind: HallElement['kind']
  name?: string
  side: HallSide
  edge: Id
  module: number
  at: Point
  width: number
  part: 'hall'
}

export interface Generated {
  runs: HallRuns
  /** The box of the envelope's outer face. */
  box: { x0: number; y0: number; x1: number; y1: number }
  /** The outline on the box's module lines and its edges in m. */
  outline: OutlineCorner[]
  edges: ShapeEdge[]
  holes: ShapeHole[]
  parts: GeneratedPart[]
  zones: GeneratedZone[]
  columns: Point[]
  /** m: a column's side. */
  columnSize: number
  walls: GeneratedWall[]
  doors: GeneratedDoor[]
}

const mm = (v: number) => Math.round(v * 1000) / 1000
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

/** Every `n`th line of a run, its first and last always. */
const everyLine = (lines: number[], n: number) => lines.filter((_, i) => i === 0 || i === lines.length - 1 || i % n === 0)

/** A point inside or on an outline of column lines. */
function onOrIn(q: Point, poly: Polygon): boolean {
  let inside = false
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const onEdge =
      (Math.abs(a.x - b.x) < ON && Math.abs(q.x - a.x) < ON && q.y >= Math.min(a.y, b.y) - ON && q.y <= Math.max(a.y, b.y) + ON) ||
      (Math.abs(a.y - b.y) < ON && Math.abs(q.y - a.y) < ON && q.x >= Math.min(a.x, b.x) - ON && q.x <= Math.max(a.x, b.x) + ON)
    if (onEdge) return true
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The type's warehouse, in its own frame. */
export function generate(t: WarehouseType): Generated {
  const runs = hallRuns(t)
  const { outline, edges, holes, zones: zoneList } = shapeOf(t, runs)
  const height = t.envelope.height
  const thick = t.envelope.thickness

  // step 5: the outline's outer face, its holes' faces inside it
  const polygon = facePolygon(edges)
  const holeFaces = holes.map((h) => {
    const r = holeRect(h, runs, thick)
    return { h, r, ring: rect(r.x0, r.y0, r.x1, r.y1).reverse() }
  })
  const xs = polygon.map((q) => q.x)
  const ys = polygon.map((q) => q.y)
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  const parts: GeneratedPart[] = [{ part: 'hall', name: 'Hall', kind: 'hall', program: t.program, polygon, holes: holeFaces.map((x) => x.ring), height, level: 0 }]

  // the zones: each one's rectangle on the mass (one on the box's edge reaches past it, so the envelope's face is its)
  const nx = modulesOf(runs.x)
  const ny = modulesOf(runs.y)
  const from = (r: Run, i: number) => (i <= 0 ? -FAR : moduleLine(r, i))
  const to = (r: Run, i: number, n: number) => (i >= n ? FAR : moduleLine(r, i))
  const mass = holeFaces.length ? difference([polygon], holeFaces.map((x) => x.ring.slice().reverse())) : [[polygon]]
  const zs = zoneList.length ? zoneList : [{ id: '1', x: [0, nx], y: [0, ny] } as HallZone]
  const zones: GeneratedZone[] = zs.map((z) => {
    const whole = zs.length === 1 && z.x[0] === 0 && z.y[0] === 0 && z.x[1] === nx && z.y[1] === ny
    const regions = whole ? mass : intersection(mass.flat(), [rect(from(runs.x, z.x[0]), from(runs.y, z.y[0]), to(runs.x, z.x[1], nx), to(runs.y, z.y[1], ny))])
    const kept = regions.filter((r) => r[0] && area(r[0]) > ON)
    const a = kept.reduce((s, r) => s + area(r[0]) - r.slice(1).reduce((h, x) => h + area(x), 0), 0)
    return { id: z.id, ...(z.name ? { name: z.name } : {}), program: z.program === undefined ? t.program : z.program, level: z.level ?? 0, pieces: kept.map((r) => r[0]), regions: kept, area: mm(a) }
  })

  // step 3: the columns inside the outline's column lines, none in a hole
  const lines = edges.map((e) => e.a)
  const inHole = (q: Point) => holes.some((h) => {
    const r = holeRect(h, runs)
    return q.x > r.x0 + ON && q.x < r.x1 - ON && q.y > r.y0 + ON && q.y < r.y1 - ON
  })
  const columns = everyLine(runs.x.lines, t.columns.every.x).flatMap((x) => everyLine(runs.y.lines, t.columns.every.y).flatMap((y) => (onOrIn({ x, y }, lines) && !inHole({ x, y }) ? [{ x, y }] : [])))

  // step 4: a wall along each edge, its outer face from corner to corner; round each hole (clockwise, the mass on its left)
  const walls: GeneratedWall[] = edges.map((e, i) => ({ a: polygon[i], b: polygon[(i + 1) % polygon.length], side: e.side, thickness: e.thickness, part: 'hall', edge: e.id }))
  for (const { h, ring } of holeFaces)
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]
      walls.push({ a, b, side: facing(a, b), thickness: thick, part: 'hall', hole: h.id })
    })

  // step 6: each element centred on its module (anchored on the box now), on its edge's outer face
  const byId = new Map(edges.map((e) => [e.id, e]))
  const doors: GeneratedDoor[] = elementsOn(t, runs, edges).map((el) => {
    const e = byId.get(el.edge)!
    const out = outwardOf(e.side)
    const across = e.horizontal ? e.a.y + out.y * faceOf(e) : e.a.x + out.x * faceOf(e)
    const s = moduleSpot(runs, e, el.module)
    return {
      element: el.id,
      kind: el.kind,
      ...(el.name ? { name: el.name } : {}),
      side: e.side,
      edge: e.id,
      module: el.module,
      at: e.horizontal ? { x: s, y: mm(across) } : { x: mm(across), y: s },
      width: el.width,
      part: 'hall' as const,
    }
  })

  return { runs, box, outline, edges, holes, parts, zones, columns, columnSize: t.columns.size, walls, doors }
}

/** A wall's stretch as the outline of its box: its outer face from a to b, its thickness inwards (left of a → b). */
export function wallOutline(w: Pick<GeneratedWall, 'a' | 'b' | 'thickness'>): Polygon {
  const { a, b, thickness: t } = w
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const n = { x: (-(b.y - a.y) / l) * t, y: ((b.x - a.x) / l) * t }
  return [a, b, { x: b.x + n.x, y: b.y + n.y }, { x: a.x + n.x, y: a.y + n.y }]
}

/** A column's outline: a square of its size round its point. */
export const columnOutline = (c: Point, s: number): Polygon => rect(c.x - s / 2, c.y - s / 2, c.x + s / 2, c.y + s / 2)
