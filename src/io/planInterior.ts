// A block's interior as the CAD plan draws it (Phase DI.1; spec docs/superpowers/specs/2026-11-09-dxf-interior-and-
// paving-design.md), pure: the plan cut at its floor, not its roof, because the drafters edit these pieces in CAD. All
// from the warehouse engine (`copyGenerated`: the type with the copy's overrides, made once by planOf), worked in the
// type's frame and put on the plan at the copy's place, in metres; planOf (exportPlan.ts) writes them on their layers
// in the output's units and frame.
//   walls     each wall's band, both faces: one region per closed run of walls (the envelope, each hole's)
//   columns   a square of its size at each
//   zones     those of another program than the block's, cut to inside the walls, a place for their label
//   axes      each column line, named as the block editor names it, BUBBLE_OUT past its ends: where the outline cuts it
//             (a notch, a chamfer, a hole), its first and last piece (the engine's `g.lines`)
//   modules   each module line that is no column line, as the engine clips it to the face less the holes (`g.lines`),
//             then cut to inside the walls
import { clipSegment } from '../engine/geom/clipSegment.ts'
import { difference, intersection, unionPieces, type Region } from '../engine/geom/boolean.ts'
import { area, centroid } from '../engine/geom/polygon.ts'
import { lineName } from '../engine/grid/index.ts'
import type { Id, Point, Polygon } from '../model/schema.ts'
import { onPlace, type Place } from '../modules/warehouse/engine/copies.ts'
import { columnOutline, wallOutline, type Generated, type GeneratedWall } from '../modules/warehouse/engine/generate.ts'

/** m: how far a block's axes run past its box at each end, their bubbles beyond. */
export const BUBBLE_OUT = 3

/** What a block's plan carries inside it, on the plan, in metres. */
export interface BlockInterior {
  /** Each [outer face, ...inner faces]. */
  walls: Region[]
  columns: Polygon[]
  zones: { regions: Region[]; name?: string; program: Id | null; area: number; at: Point }[]
  axes: { a: Point; b: Point; name: string }[]
  modules: [Point, Point][]
}

const unit = (a: Point, b: Point): Point => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}
const near = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-3

/** A ring without the corners that do not turn: the booleans keep one where two bands met, CAD would show it. */
function straight(ring: Polygon): Polygon {
  const r = [...ring]
  // until a whole lap keeps every corner
  for (let i = 0, kept = 0; r.length > 3 && kept < r.length; i %= r.length) {
    const p = r[(i - 1 + r.length) % r.length]
    const q = r[i]
    const n = r[(i + 1) % r.length]
    const u = { x: q.x - p.x, y: q.y - p.y }
    const v = { x: n.x - q.x, y: n.y - q.y }
    const flat = Math.abs(u.x * v.y - u.y * v.x) <= 1e-9 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) && u.x * v.x + u.y * v.y >= 0
    if (flat) {
      r.splice(i, 1)
      kept = 0
    } else {
      i++
      kept++
    }
  }
  return r
}
const straightened = (rs: Region[]): Region[] => rs.map((r) => r.map(straight))

/**
 * The walls' bands joined, cut to the mass (`mass`: its rings, holes by nesting). Each band runs on past a corner
 * where the next wall turns, by that wall's thickness: a reflex corner's square is closed, a convex corner's overhang
 * falls outside the mass and is cut away.
 */
export function wallRegions(walls: Pick<GeneratedWall, 'a' | 'b' | 'thickness'>[], mass: Polygon[]): Region[] {
  const bands = walls.map((w) => {
    const u = unit(w.a, w.b)
    const turns = (x: Pick<GeneratedWall, 'a' | 'b'>) => {
      const v = unit(x.a, x.b)
      return Math.abs(u.x * v.y - u.y * v.x) > 1e-6
    }
    const before = walls.find((x) => x !== w && near(x.b, w.a))
    const after = walls.find((x) => x !== w && near(x.a, w.b))
    const atA = before && turns(before) ? before.thickness : 0
    const atB = after && turns(after) ? after.thickness : 0
    return wallOutline({ a: { x: w.a.x - u.x * atA, y: w.a.y - u.y * atA }, b: { x: w.b.x + u.x * atB, y: w.b.y + u.y * atB }, thickness: w.thickness })
  })
  // each band an outer ring: in one operand of `union`, a band lying inside another would be read as its hole
  return straightened(intersection(unionPieces(bands).flat(), mass))
}

/** A block's interior on the plan at `place`: `g` its copy as its type makes it (copyGenerated), read where it stands. */
export function blockInterior(g: Generated, place: Place): BlockInterior {
  const hall = g.parts[0]
  const mass = hall.holes.length ? difference([hall.polygon], hall.holes.map((h) => h.slice().reverse())).flat() : [hall.polygon]
  const walls = wallRegions(g.walls, mass)
  const inside = difference(mass, walls.flat()).flat()

  const zones = g.zones
    .filter((z) => z.program !== hall.program && z.area > 0)
    .flatMap((z) => {
      const regions = straightened(intersection(z.regions.flat(), inside))
      if (!regions.length) return []
      const largest = regions.reduce((m, r) => (area(r[0]) > area(m[0]) ? r : m))
      return [{ regions, ...(z.name ? { name: z.name } : {}), program: z.program, area: z.area, at: centroid(largest[0]) }]
    })

  // each column line from its first piece to its last, a bubble beyond each end
  const axes = (['x', 'y'] as const).flatMap((axis) =>
    g.runs[axis].lines.flatMap((at, i) => {
      const pieces = g.lines.columns.filter((l) => l.axis === axis && l.line === i)
      if (!pieces.length) return []
      const along = (q: Point) => (axis === 'x' ? q.y : q.x)
      const ends = pieces.flatMap((l) => [along(l.a), along(l.b)])
      const [lo, hi] = [Math.min(...ends) - BUBBLE_OUT, Math.max(...ends) + BUBBLE_OUT]
      const name = lineName(axis, i)
      return [axis === 'x' ? { a: { x: at, y: lo }, b: { x: at, y: hi }, name } : { a: { x: lo, y: at }, b: { x: hi, y: at }, name }]
    }),
  )
  const modules = g.lines.modules.flatMap(([a, b]) => clipSegment(a, b, inside))

  const on = (q: Point) => onPlace(place, q)
  const placed = (rs: Region[]) => rs.map((r) => r.map((ring) => ring.map(on)))
  return {
    walls: placed(walls),
    columns: g.columns.map((c) => columnOutline(c, g.columnSize).map(on)),
    zones: zones.map((z) => ({ ...z, regions: placed(z.regions), at: on(z.at) })),
    axes: axes.map((x) => ({ ...x, a: on(x.a), b: on(x.b) })),
    modules: modules.map(([a, b]): [Point, Point] => [on(a), on(b)]),
  }
}
