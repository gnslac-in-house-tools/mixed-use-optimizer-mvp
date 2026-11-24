// A warehouse type's copies on the site (Decision "Warehouse type": linked, with variants), pure: a copy's place (where
// the type's column line A / 1 stands and its x axis's angle), its one mass placed there (Decision "Block shape"): its
// footprint and its holes, its docked walls and its doors; and the place read back from its mass moved or turned on
// the plan.
import type { Contour, Footprint, Id, Mass, Point, Polygon, WarehouseCopy, WarehouseType } from '../../../model/schema.ts'
import { dockableWalls, type Wall } from '../../docks/engine/docks.ts'
import { cosSin, footprintPolygon } from '../../../engine/geom/footprint.ts'
import { distancePointSegment } from '../../../engine/geom/polygon.ts'
import { clipToWall, faceSpan, fromWall, wallFrame } from './courts.ts'
import { generate, typeWith, type Generated } from './generate.ts'
import type { ShapeEdge } from './shape.ts'

export type Place = WarehouseCopy['place']

/** A point of the type's frame on the plan, at that place. */
export function onPlace(pl: Place, p: Point): Point {
  const [c, s] = cosSin(pl.angle)
  return { x: pl.x + p.x * c - p.y * s, y: pl.y + p.x * s + p.y * c }
}

/** A point of the plan in the type's frame at that place: the inverse of `onPlace`. */
export function fromPlace(pl: Place, q: Point): Point {
  const [c, s] = cosSin(pl.angle)
  const dx = q.x - pl.x
  const dy = q.y - pl.y
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

const angleOf = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
const tidyAngle = (deg: number) => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180
  return Math.round(a * 1e9) / 1e9 + 0
}

/**
 * Where an outline of the type's frame (`local`, as the type makes it) stands on the plan, read from that outline as it
 * is there (`site`: moved and turned, vertex for vertex): null when they are not the same outline.
 */
export function placeOf(local: Polygon, site: Polygon): Place | null {
  if (local.length < 2 || local.length !== site.length) return null
  const angle = tidyAngle(angleOf(site[0], site[1]) - angleOf(local[0], local[1]))
  const [c, s] = cosSin(angle)
  const r = (p: Point) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })
  const o = r(local[0])
  const mm = (v: number) => Math.round(v * 1e6) / 1e6 + 0
  return { x: mm(site[0].x - o.x), y: mm(site[0].y - o.y), angle }
}

/** A part's outline as a mass's footprint at that place: a rect while it is one, else a contour. */
export function partFootprint(poly: Polygon, pl: Place): Footprint {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  const isRect = poly.length === 4 && poly.every((p) => (Math.abs(p.x - box.x0) < 1e-9 || Math.abs(p.x - box.x1) < 1e-9) && (Math.abs(p.y - box.y0) < 1e-9 || Math.abs(p.y - box.y1) < 1e-9))
  if (isRect)
    return {
      kind: 'rect',
      center: onPlace(pl, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }),
      width: Math.round((box.x1 - box.x0) * 1000) / 1000,
      depth: Math.round((box.y1 - box.y0) * 1000) / 1000,
      rotation: pl.angle,
    }
  return { kind: 'contour', contour: { vertices: poly.map((p) => ({ ...onPlace(pl, p), r: 0 })) } }
}

/** A wall of a copy's hall: along its length (the type's x) or its width (y), at the low end (0: column line A / 1)
 *  or the high one (1). */
export interface HallSide {
  axis: 'length' | 'width'
  end: 0 | 1
}

/**
 * Which wall of a hall standing at `angle` (its rect's rotation) a wall whose middle is `mid` is, the hall's centre at
 * `center`; and the way out of it on the plan.
 */
export function hallSide(center: Point, angle: number, mid: Point): { side: HallSide; out: Point } {
  const [c, s] = cosSin(angle)
  const d = { x: mid.x - center.x, y: mid.y - center.y }
  const u = d.x * c + d.y * s
  const v = -d.x * s + d.y * c
  if (Math.abs(u) >= Math.abs(v)) return { side: { axis: 'length', end: u > 0 ? 1 : 0 }, out: u > 0 ? { x: c, y: s } : { x: -c, y: -s } }
  return { side: { axis: 'width', end: v > 0 ? 1 : 0 }, out: v > 0 ? { x: -s, y: c } : { x: s, y: -c } }
}

/** A copy's mass as its type makes it: its part, name, program, footprint and holes, height, level, docks and doors. */
export interface CopyPart {
  part: string
  name: string
  programId: Id | null
  footprint: Footprint
  /** Its holes (courts) on the plan, each a contour. */
  holes: Contour[]
  height: number
  /** m from the hall's floor (a level step). */
  level: number
  /** Its docked walls, by the t of each one's middle: those with docks, and those its block puts a court in front of
   *  without docks (BE.2). */
  docks: number[]
  doorsAt: NonNullable<Mass['doorsAt']>
  /**
   * What its block gives some of its walls (WarehouseType.courts), by wall: a depth, or (Phase D.3) a court's shape with its id, in the wall's
   * frame as the site reads it (`onWall`); several to a wall where it was split.
   */
  blockCourts: NonNullable<Mass['blockCourts']>
  /** What its zones give another program than its own: m² by program, the largest first. */
  zones: NonNullable<Mass['zones']>
}

/** The floor a block's zones give programs other than its own, m² by program (Decision "Block shape"). */
export function otherPrograms(g: Generated, program: Id | null): NonNullable<Mass['zones']> {
  const by = new Map<Id | null, number>()
  for (const z of g.zones) if (z.program !== program && z.area > 0) by.set(z.program, (by.get(z.program) ?? 0) + z.area)
  return [...by].map(([programId, area]) => ({ programId, area: Math.round(area * 100) / 100 })).sort((a, b) => b.area - a.area)
}

/**
 * A court's shape (in its edge's frame: x from the reference line's start, y out of the face) as the site reads it (Phase D.3, Decision "Courts in
 * the circulation"): the same points on the plan through the copy's place, in the frame of the footprint's wall `w` (x from the wall's start along
 * it, y out of it), which is where `deriveDocks` draws it. The wall's face starts a corner's reach before the reference line does (a wall's
 * thickness at a convex corner), so x moves by that; a shape's corners, radii, chamfers and arcs go with it. Null: an edge not along the grid
 * (a court there is refused), or a frame that does not run the wall's way.
 */
export function onWall(shape: Contour, e: Pick<ShapeEdge, 'a' | 'b' | 'horizontal' | 'side' | 'offset' | 'thickness' | 'axis'>, place: Place, w: Pick<Wall, 'a' | 'b' | 'out'>): Contour | null {
  if (e.axis === null) return null
  const frame = wallFrame(e)
  const u = { x: w.b.x - w.a.x, y: w.b.y - w.a.y }
  const l = Math.hypot(u.x, u.y)
  if (l < 1e-9) return null
  u.x /= l
  u.y /= l
  const o = onPlace(place, frame.origin)
  const along = onPlace(place, { x: frame.origin.x + frame.along.x, y: frame.origin.y + frame.along.y })
  const out = onPlace(place, { x: frame.origin.x + frame.out.x, y: frame.origin.y + frame.out.y })
  if ((along.x - o.x) * u.x + (along.y - o.y) * u.y < 0.999 || (out.x - o.x) * w.out.x + (out.y - o.y) * w.out.y < 0.999) return null
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0
  return {
    ...shape,
    vertices: shape.vertices.map((v) => {
      const q = onPlace(place, fromWall(frame, v))
      const d = { x: q.x - w.a.x, y: q.y - w.a.y }
      return { ...v, x: r6(d.x * u.x + d.y * u.y), y: r6(d.x * w.out.x + d.y * w.out.y) }
    }),
  }
}

/** What a copy makes: its type with its overrides, generated. */
export const copyGenerated = (t: WarehouseType, copy: Pick<WarehouseCopy, 'overrides'>): Generated => generate(typeWith(t, copy.overrides))

/**
 * A copy's mass placed on the plan, with its holes, its docked walls and its doors, wall by wall: a wall with docks, and
 * one its block's courts by edge (BE.2) put a court in front of; each of those with a depth of its own, by wall, or (Phase D.3) its courts'
 * shapes, each court an entry of its own (a wall may have several).
 */
export function copyParts(t: WarehouseType, copy: Pick<WarehouseCopy, 'place' | 'overrides'>): CopyPart[] {
  const made = typeWith(t, copy.overrides)
  const g = generate(made)
  return g.parts.map((p) => {
    const footprint = partFootprint(p.polygon, copy.place)
    const walls = dockableWalls(footprintPolygon(footprint))
    const byWall = new Map<string, { t: number; kind: 'dock' | 'door'; at: number[] }>()
    for (const d of g.doors) {
      if (d.part !== p.part || d.kind === 'pattern') continue
      const at = onPlace(copy.place, d.at)
      const w = walls.find((x) => distancePointSegment(at, x.a, x.b) < 1e-3)
      if (!w) continue
      const key = `${w.t}|${d.kind}`
      const entry = byWall.get(key) ?? { t: w.t, kind: d.kind, at: [] }
      entry.at.push(Math.round(Math.hypot(at.x - w.a.x, at.y - w.a.y) * 1000) / 1000)
      byWall.set(key, entry)
    }
    const doorsAt = [...byWall.values()].map((e) => ({ t: e.t, at: e.at.sort((a, b) => a - b), kind: e.kind }))
    const docks = [...new Set(doorsAt.filter((e) => e.kind === 'dock').map((e) => e.t))]
    // its courts by edge: each edge's wall found by its middle on the plan
    const blockCourts: CopyPart['blockCourts'] = []
    for (const c of made.courts ?? []) {
      const edge = g.walls.find((x) => x.part === p.part && x.edge === c.edge)
      if (!edge) continue
      const mid = onPlace(copy.place, { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 })
      const w = walls.find((x) => distancePointSegment(mid, x.a, x.b) < 1e-3)
      if (!w) continue
      if (!docks.includes(w.t)) docks.push(w.t)
      // a court with a shape of its own: its shape (it has no depth), one entry each, so a wall split in two has two
      if (c.shape) {
        const own = g.edges.find((x) => x.id === c.edge)
        // its wall side stays within its wall as the copy is now (a box shrunk, a pill, a relaid box or a candidate moved the wall's ends: Phase D.3)
        const span = own && (faceSpan(own, g.walls) ?? { lo: 0, hi: wallFrame(own).length })
        const held = own && span && clipToWall(c.shape, span.hi, false, span.lo)
        const shape = own && held && onWall(held, own, copy.place, w)
        if (shape) blockCourts.push({ t: w.t, ...(c.id ? { id: c.id } : {}), shape })
      } else if (c.depth !== undefined) blockCourts.push({ t: w.t, depth: c.depth })
    }
    // a hole of the hall keeps its corridor (Phase H.4): the cut is its face, the corridor runs round it inside the block
    const holes = p.holes.map((h, i) => ({ vertices: h.map((q) => ({ ...onPlace(copy.place, q), r: 0 })), ...(p.part === 'hall' && g.holes[i]?.corridor ? { corridor: g.holes[i].corridor } : {}) }))
    return { part: p.part, name: p.name, programId: p.program, footprint, holes, height: p.height, level: p.level, docks, doorsAt, blockCourts, zones: otherPrograms(g, p.program) }
  })
}

/**
 * A copy as it stands on the plan: its place read from its hall (`placeFromHall`), else the one it keeps (no hall).
 * Whatever moves masses (a drag, a turn, Solve, an alignment, the optimizer, the agent) moves the hall alone, never
 * the copy's `place`, so the place it keeps is as old as its last remake: every reader of where a placed copy stands
 * (its walls picked on the plan, its masses made again) goes through this, never `copy.place` alone.
 */
export function copyOnPlan<C extends Pick<WarehouseCopy, 'place' | 'overrides'>>(t: WarehouseType, copy: C, hall: Footprint | undefined): C {
  const place = placeFromHall(t, copy, hall)
  return place && JSON.stringify(place) !== JSON.stringify(copy.place) ? { ...copy, place } : copy
}

/**
 * Where a copy stands, read from its hall as it is on the plan (moved or turned since it was made): its footprint
 * against the hall the type made at the copy's place, as it was made (`t`: the type as it was). Null without its hall.
 */
export function placeFromHall(t: WarehouseType, copy: Pick<WarehouseCopy, 'place' | 'overrides'>, hall: Footprint | undefined): Place | null {
  if (!hall) return null
  const made = copyGenerated(t, copy).parts.find((p) => p.part === 'hall')
  if (!made) return null
  const origin = { x: 0, y: 0, angle: 0 }
  const local = footprintPolygon(partFootprint(made.polygon, origin))
  // the place moves the made outline as the hall was moved: read from the outline made at the origin
  const site = footprintPolygon(hall)
  return placeOf(local, site)
}
