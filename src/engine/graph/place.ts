// Where a new mass goes (Decisions "Graph mode" and "Rules"): *From brief* and a new node put each mass where the
// brief's rules about its program ask (placeByRules), or in free buildable ground (freeSpot). Pure and deterministic:
// candidate centres, the best first, and the first where the rectangle stands inside the buildable area and keeps the
// site's spacing from every mass already there, off the truck courts; on a structural grid, along its axes with its
// corners on its modules (found in the stress test: ▶ Solve put an office 45 × 22.5 m off the grid, in a truck court).
import type { Grid, Id, Point, Polygon, Project } from '../../model/schema.ts'
import { massesOfOption, optionOf } from '../buildings.ts'
import { intersection, regionsArea, type Region } from '../geom/boolean.ts'
import { footprintPolygon } from '../geom/footprint.ts'
import { bounds, centroid, pointInPolygon } from '../geom/polygon.ts'
import { moduleOf, toGrid, toPlan } from '../grid/index.ts'
import { deriveSite } from '../massing/site.ts'
import { optionNodes } from './links.ts'
import { polygonDistance } from './relations.ts'

/** Less than this of a rectangle on what it must keep off (a truck court) is touching, not standing on it (m²). */
const ON_COURT = 1
/** m²: less than this of two rectangles over each other is touching, not one in the other. */
const TOUCH = 0.01
/** m: how far a rectangle reaches to meet a wall (TOUCH over it: 1 m of wall at least, so a corner alone never counts). */
const REACH = 0.01

/** What a new mass keeps off besides the masses, and the grid it goes on. */
export interface PlaceOptions {
  /** The truck courts (or anything else): touching is fine, standing on one is not. */
  avoid?: Polygon[]
  /** The grid the option stands on: the rectangle runs along its axes, its corners on its modules. */
  grid?: Grid | null
}

/** An axis-aligned w × d rectangle around c. */
export function rectAround(c: Point, w: number, d: number): Polygon {
  return [
    { x: c.x - w / 2, y: c.y - d / 2 },
    { x: c.x + w / 2, y: c.y - d / 2 },
    { x: c.x + w / 2, y: c.y + d / 2 },
    { x: c.x - w / 2, y: c.y + d / 2 },
  ]
}

/** Inside one of the regions: in its outer ring and in none of its holes. */
export function inRegions(q: Point, regions: Region[]): boolean {
  return regions.some(([outer, ...holes]) => outer !== undefined && pointInPolygon(q, outer) && !holes.some((h) => pointInPolygon(q, h)))
}

/** The rectangle stands inside the buildable area: its corners and the middles of its sides do. */
function standsIn(rect: Polygon, regions: Region[]): boolean {
  const pts = rect.flatMap((a, i) => {
    const b = rect[(i + 1) % rect.length]
    return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]
  })
  return pts.every((q) => inRegions(q, regions))
}

/**
 * The centre of a free place for a w × d rectangle, or null when there is none: inside `buildable`, at least
 * `spacing` from every one of `taken` (and never touching one), nearest `near` first.
 */
export function freeSpot(buildable: Region[], taken: Polygon[], w: number, d: number, spacing: number, near: Point): Point | null {
  const rings = buildable.map((r) => r[0]).filter((r): r is Polygon => r !== undefined && r.length >= 3)
  if (rings.length === 0) return null
  const b = bounds(rings.flat())
  const step = Math.max(2, Math.min(w, d) / 4)
  const candidates: Point[] = []
  for (let x = b.minX + w / 2; x <= b.maxX - w / 2 + 1e-9; x += step)
    for (let y = b.minY + d / 2; y <= b.maxY - d / 2 + 1e-9; y += step) candidates.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
  const dist = (q: Point) => Math.hypot(q.x - near.x, q.y - near.y)
  candidates.sort((p, q) => dist(p) - dist(q) || p.x - q.x || p.y - q.y)
  const gap = Math.max(spacing, 0.01)
  for (const c of candidates) {
    const rect = rectAround(c, w, d)
    if (!standsIn(rect, buildable)) continue
    if (taken.every((t) => t.length < 3 || polygonDistance(rect, t) >= gap - 1e-6)) return c
  }
  return null
}

/**
 * Where a new w × d mass of `programId` goes in an option, by the brief's rules about it (Decision "Rules"): next to
 * the masses it must be adjacent to or move with (against one of their walls), within reach of the ones it must be
 * near, far enough from the ones it must keep apart from; always inside the buildable area and not touching the others. Without a partner to be near, the free place nearest the masses of its own program (alike ones
 * together), or, the first of its program, nearest the top-left corner of the buildable area (it packs from there
 * and leaves room for the next ones: in the middle, a first warehouse would leave no room for a second). Never on what
 * `avoid` lists (the truck courts). On `grid` the w × d runs along its axes (w along its x) and its corners land on its
 * modules: the search goes in the grid's frame and its centre comes back on the plan. null when none fits.
 */
export function placeByRules(p: Project, optionId: Id, programId: Id, w: number, d: number, opts: PlaceOptions = {}): Point | null {
  const option = optionOf(p, optionId)
  const g = opts.grid ?? null
  // the grid's frame (the plan's without one): the rectangles below are axis-aligned in it
  const ring = (r: Polygon) => (g ? r.map((q) => toGrid(g, q)) : r)
  const site = deriveSite(p.site)
  const buildable: Region[] = g ? site.buildable.map((r) => r.map(ring)) : site.buildable
  const nodes = optionNodes(p, option).map((n) => ({ ...n, polygon: ring(n.polygon) }))
  const shown = massesOfOption(p, option).flatMap((m) => {
    try {
      return [{ id: m.id, polygon: ring(footprintPolygon(m.footprint)) }]
    } catch {
      return []
    }
  })
  const avoid = (opts.avoid ?? []).filter((a) => a.length >= 3).map(ring)
  const offCourts = (rect: Polygon) => avoid.every((a) => regionsArea(intersection([rect], [a])) < ON_COURT)
  // on the grid, a centre moved so the rectangle's low corner lands on the nearest module lines
  const m = g ? moduleOf(g) : null
  const snapX = (x: number) => (m ? Math.round((x - w / 2) / m.x) * m.x + w / 2 : x)
  const snapY = (y: number) => (m ? Math.round((y - d / 2) / m.y) * m.y + d / 2 : y)
  const snap = (c: Point): Point => ({ x: snapX(c.x), y: snapY(c.y) })
  const out = (c: Point): Point => {
    const q = g ? toPlan(g, c) : c
    return { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }
  }
  const rings = buildable.map((r) => r[0]).filter((r): r is Polygon => r !== undefined && r.length >= 3)
  if (rings.length === 0) return null
  const box = bounds(rings.flat())
  const middle = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const spacing = 0.01 // never touching one it does not join; farther is the apart rules' (Decision "Spacing by rules")
  const rules = (p.rules ?? []).filter((r) => r.a === programId)
  const of = (program: Id) => nodes.filter((n) => n.programId === program)
  const dist = (q: Point, r: Point) => Math.hypot(q.x - r.x, q.y - r.y)

  // the masses it joins (adjacent or moves with): it may touch them
  const joins = rules.filter((r) => r.kind === 'adjacent' || r.kind === 'attached').flatMap((r) => of(r.b))
  const fits = (c: Point, partner?: Id) => {
    const rect = rectAround(c, w, d)
    if (!standsIn(rect, buildable)) return false
    if (!shown.every((t) => t.id === partner || polygonDistance(rect, t.polygon) >= spacing - 1e-6)) return false
    if (!offCourts(rect)) return false
    return rules.every((r) => {
      const others = of(r.b)
      if (others.length === 0) return true
      if (r.kind === 'near') return others.some((o) => polygonDistance(rect, o.polygon) <= r.max + 1e-6)
      if (r.kind === 'apart') return others.every((o) => polygonDistance(rect, o.polygon) >= r.min - 1e-6)
      return true
    })
  }

  // against a wall of one it joins: the sides of its bounds, centred or flush with either end, nearest the middle first.
  // On the grid (Decision "Grid always": the demo's masses are off its module lines), the candidate snapped onto the
  // modules where it still meets the wall; else flush with the wall across and on the modules along it (a wall off the
  // module lines is met all the same); else snapped as it comes, never into the partner
  const into = (c: Point, partner: Polygon) => regionsArea(intersection([rectAround(c, w, d)], [partner])) >= TOUCH
  const meets = (c: Point, partner: Polygon) => !into(c, partner) && regionsArea(intersection([rectAround(c, w + 2 * REACH, d + 2 * REACH)], [partner])) >= TOUCH
  for (const partner of [...joins].sort((a, b) => dist(centroid(a.polygon), middle) - dist(centroid(b.polygon), middle))) {
    const b = bounds(partner.polygon)
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const ys = [cy, b.maxY - d / 2, b.minY + d / 2]
    const xs = [cx, b.minX + w / 2, b.maxX - w / 2]
    const flush = [
      ...ys.map((y) => ({ x: b.maxX + w / 2, y, along: 'y' as const })),
      ...ys.map((y) => ({ x: b.minX - w / 2, y, along: 'y' as const })),
      ...xs.map((x) => ({ x, y: b.maxY + d / 2, along: 'x' as const })),
      ...xs.map((x) => ({ x, y: b.minY - d / 2, along: 'x' as const })),
    ].sort((q, r) => dist(q, middle) - dist(r, middle))
    const snapped = flush.map(snap)
    const across = flush.map((c) => (c.along === 'y' ? { x: c.x, y: snapY(c.y) } : { x: snapX(c.x), y: c.y }))
    const ok = (c: Point) => fits(c, partner.id) && !into(c, partner.polygon)
    const hit =
      snapped.find((c) => ok(c) && meets(c, partner.polygon)) ??
      (m ? across.find((c) => ok(c) && meets(c, partner.polygon)) : undefined) ??
      snapped.find(ok)
    if (hit) return out(hit)
  }

  // otherwise free ground: nearest what it must be near, else its own program's masses, else the top-left corner
  const near = rules.filter((r) => r.kind === 'near').flatMap((r) => of(r.b))
  const alike = of(programId)
  const anchor = near.length ? centroid(near[0].polygon) : alike.length ? centroid(alike[0].polygon) : { x: box.minX, y: box.maxY }
  const step = Math.max(2, Math.min(w, d) / 4)
  const spots = new Map<string, Point>()
  for (let x = box.minX + w / 2; x <= box.maxX - w / 2 + 1e-9; x += step)
    for (let y = box.minY + d / 2; y <= box.maxY - d / 2 + 1e-9; y += step) {
      const c = snap({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
      spots.set(`${c.x.toFixed(2)},${c.y.toFixed(2)}`, c)
    }
  const free = [...spots.values()].sort((q, r) => dist(q, anchor) - dist(r, anchor) || q.x - r.x || q.y - r.y)
  const hit = free.find((c) => fits(c))
  return hit ? out(hit) : null
}
