// The ground once graded (Decision "Platforms in 3D"), pure: the surface again through the ground's points outside
// what the platforms grade, the outlines of what they grade at its height (a mass's at its platform's level, a court's
// the dock height below, its edge at the dock wall a hair out from the wall, so the dock reads as a face), the banks'
// cells at their height (E.5, Decision "Banks"), and the ground's height at the middle of every cell next to a graded
// one (so a corner the masses leave keeps its ground, and a bank meets the ground); and the design roads graded
// (Decision "Graded roads"): the ground's points under each road left out, its edges and middle at its profile's
// height, so the road cuts into the ground or stands on its fill. A bank under a road gives way to it (Decision "Banks
// meet the roads"): its cells and the ground beside them are left out along the road, which lies on the bank's height
// (roads.ts reads the banked ground), so the two never interleave in a saw. Made once per earthwork and roads.
import type { Point, Polygon } from '../../../model/schema.ts'
import { bounds, distancePointSegment, pointInPolygon, type Bounds } from '../../../engine/geom/polygon.ts'
import { EARTH_BANK, EARTH_NONE, type Earthwork, type RoadGrading } from '../../../engine/types.ts'
import { surfaceFrom, type Surface } from './surface.ts'

/** How far out from its dock wall a court's edge stands (m): the dock is a face, not a ramp. */
const DOCK_FACE = 0.05

const made = new WeakMap<Earthwork, { roads: RoadGrading | null; out: Surface | null }>()

/** How far beyond a road's edge the ground's own points are left out (m): the road's edge is its own. */
const ROAD_MARGIN = 0.5

/**
 * The ground with the platforms and their courts graded flat, and the design roads on their profiles; the ground as it
 * is when nothing is graded.
 */
export function gradedSurfaceOf(ground: Surface, e: Earthwork, roads: RoadGrading | null = null): Surface | null {
  const graded = roads?.roads.filter((r) => r.stations.length >= 2) ?? []
  if (e.shapes.length === 0 && graded.length === 0) return ground
  const had = made.get(e)
  if (had && had.roads === roads) return had.out
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  const add = (x: number, y: number, z: number) => {
    xs.push(x)
    ys.push(y)
    zs.push(z)
  }
  const boxes: Bounds[] = e.shapes.map((s) => bounds(s.polygon))
  const inside = (p: Point) => e.shapes.some((s, k) => p.x >= boxes[k].minX && p.x <= boxes[k].maxX && p.y >= boxes[k].minY && p.y <= boxes[k].maxY && pointInPolygon(p, s.polygon))
  // inside a graded shape or within ROAD_MARGIN of its outline: a road's point there would stand on the shape's edge at
  // another height, a cliff on a line the triangulation fans across the shape
  const nearShape = (p: Point) =>
    inside(p) ||
    e.shapes.some((s, k) => {
      const b = boxes[k]
      if (p.x < b.minX - ROAD_MARGIN || p.x > b.maxX + ROAD_MARGIN || p.y < b.minY - ROAD_MARGIN || p.y > b.maxY + ROAD_MARGIN) return false
      return s.polygon.some((a, i) => distancePointSegment(p, a, s.polygon[(i + 1) % s.polygon.length]) < ROAD_MARGIN)
    })

  // the ground's own points, but where it is graded or banked
  const g = e.grid
  const banked = (p: Point) => {
    const i = Math.floor((p.x - g.x0) / g.size)
    const j = Math.floor((p.y - g.y0) / g.size)
    return i >= 0 && j >= 0 && i < g.cols && j < g.rows && g.kind[j * g.cols + i] === EARTH_BANK
  }
  const onRoad = roadsNear(graded)
  for (let i = 0; i < ground.x.length; i++) {
    const p = { x: ground.x[i], y: ground.y[i] }
    if (!inside(p) && !banked(p) && !onRoad(p)) add(p.x, p.y, ground.z[i])
  }

  // each road's middle and edges at its profile's height (where a platform or court grades it, or meets its edge, that
  // wins), every cell of the earthwork's grid between its stations (the profile straight between them): its edge as
  // dense as the bank beside it, so the two meet in a strip, not in a saw
  for (const r of graded) {
    const s = r.stations
    for (let i = 0; i < s.length; i++) {
      const a = s[Math.max(0, i - 1)].p
      const b = s[Math.min(s.length - 1, i + 1)].p
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1e-9) continue
      const nx = (-(b.y - a.y) / len) * (r.width / 2)
      const ny = ((b.x - a.x) / len) * (r.width / 2)
      const next = s[i + 1]
      const cuts = next ? Math.max(1, Math.ceil(Math.hypot(next.p.x - s[i].p.x, next.p.y - s[i].p.y) / g.size)) : 1
      for (let c = 0; c < cuts; c++) {
        const t = c / cuts
        const o = next ? { x: s[i].p.x + (next.p.x - s[i].p.x) * t, y: s[i].p.y + (next.p.y - s[i].p.y) * t } : s[i].p
        const z = next ? s[i].z + (next.z - s[i].z) * t : s[i].z
        for (const k of [-1, 0, 1]) {
          const p = { x: o.x + k * nx, y: o.y + k * ny }
          if (!nearShape(p)) add(p.x, p.y, z)
        }
      }
    }
  }

  // what is graded: its outline, cut every cell, at its height
  const step = e.grid.size
  for (const s of e.shapes)
    for (const p of along(s.polygon, step)) {
      const w = s.wall
      if (w && distancePointSegment(p, w.a, w.b) < 1e-3) add(p.x + w.out.x * DOCK_FACE, p.y + w.out.y * DOCK_FACE, s.z)
      else add(p.x, p.y, s.z)
    }

  // a bank's cells at its height; the ground at the middle of each cell beside a graded or banked one
  for (let j = 0; j < g.rows; j++)
    for (let i = 0; i < g.cols; i++) {
      const c = j * g.cols + i
      const p = { x: g.x0 + (i + 0.5) * g.size, y: g.y0 + (j + 0.5) * g.size }
      const kind = g.kind[c]
      if (kind === EARTH_BANK) {
        const z = ground.elevation(p)
        if (z !== null && !inside(p) && !onRoad(p)) add(p.x, p.y, z + g.depth[c])
        continue
      }
      if (kind !== EARTH_NONE || !besideGraded(g, i, j) || inside(p) || onRoad(p)) continue
      const z = ground.elevation(p)
      if (z !== null) add(p.x, p.y, z)
    }

  const out = surfaceFrom(Float64Array.from(xs), Float64Array.from(ys), Float64Array.from(zs))
  made.set(e, { roads, out })
  return out
}

/** Is p on one of the roads (within its half width and a margin of its centreline)? Its stretches bucketed on a grid. */
function roadsNear(roads: RoadGrading['roads']): (p: Point) => boolean {
  if (roads.length === 0) return () => false
  const CELL = 10
  const buckets = new Map<string, { a: Point; b: Point; reach: number }[]>()
  for (const r of roads) {
    const reach = r.width / 2 + ROAD_MARGIN
    for (let i = 0; i + 1 < r.stations.length; i++) {
      const a = r.stations[i].p
      const b = r.stations[i + 1].p
      const seg = { a, b, reach }
      for (let gx = Math.floor((Math.min(a.x, b.x) - reach) / CELL); gx <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); gx++)
        for (let gy = Math.floor((Math.min(a.y, b.y) - reach) / CELL); gy <= Math.floor((Math.max(a.y, b.y) + reach) / CELL); gy++) {
          const key = `${gx}:${gy}`
          const list = buckets.get(key)
          if (list) list.push(seg)
          else buckets.set(key, [seg])
        }
    }
  }
  return (p) => (buckets.get(`${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`) ?? []).some((s) => distancePointSegment(p, s.a, s.b) < s.reach)
}

/** A closed ring's corners and points between them, none farther apart than `step`. */
function along(poly: Polygon, step: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return out
}

/** A cell with a graded one among its eight neighbours. */
function besideGraded(g: Earthwork['grid'], i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const a = i + di
      const b = j + dj
      if ((di || dj) && a >= 0 && b >= 0 && a < g.cols && b < g.rows && g.kind[b * g.cols + a] !== EARTH_NONE) return true
    }
  return false
}
