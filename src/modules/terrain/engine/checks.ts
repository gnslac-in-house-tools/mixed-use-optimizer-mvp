// What the ground says of the design (Decision "Terrain", E.4a), pure: its Issues (a built mass on ground steeper than
// the site's rules allow; two platforms side by side further apart than the standards' step: of one building, its steps
// or buildings joined, or two buildings' that touch, a wall; a platform whose banks leave the site, E.5, standing where
// they leave it) and the figures the KPIs read (the largest step between platforms side by side, the
// steepest ground of the buildable area); a design road that, graded, still climbs over the max. grade (roads.ts). Every one an estimate: the ground sampled on a grid.
import type { Point, Polygon, Project } from '../../../model/schema.ts'
import type { Region } from '../../../engine/geom/boolean.ts'
import { area, bounds, pointInPolygon } from '../../../engine/geom/polygon.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import type { DerivedMass, Earthwork, Issue, RoadGrading } from '../../../engine/types.ts'
import type { Surface } from './surface.ts'

/** A mass is on ground too steep when this share of it or more is. */
export const STEEP_SHARE = 0.1
/** About how many points a mass's ground is sampled at. */
const SAMPLES = 400
/** Less of a bank than this outside the site is a cell's rounding, not a bank that leaves it (m²). */
const OUTSIDE_TOL = 5

const percent = (v: number) => `${Math.round(v * 100)} %`
const gradePct = (v: number) => `${(v * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`
const metres = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} m`

/** The points of a grid of about `n` cells over the polygon whose middle is in it. */
function samplesIn(poly: Polygon, n: number, inside: (p: Point) => boolean = (p) => pointInPolygon(p, poly)): Point[] {
  const b = bounds(poly)
  const step = Math.max(0.5, Math.sqrt(Math.max(area(poly), 1) / n))
  const out: Point[] = []
  for (let y = b.minY + step / 2; y < b.maxY; y += step)
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      const p = { x, y }
      if (inside(p)) out.push(p)
    }
  return out
}

/** How much of a polygon's ground is steeper than `max`, and its steepest; null where there is no ground. */
export function steepUnder(s: Surface, poly: Polygon, max: number): { share: number; steepest: number } | null {
  let n = 0
  let steep = 0
  let steepest = 0
  for (const p of samplesIn(poly, SAMPLES)) {
    const v = s.slope(p)
    if (v === null) continue
    n++
    if (v > max) steep++
    steepest = Math.max(steepest, v)
  }
  return n ? { share: steep / n, steepest } : null
}

/** The steepest ground of the buildable area (rise over run); null without ground under it. */
export function steepestGround(s: Surface, buildable: Region[]): number | null {
  let out: number | null = null
  for (const [outer, ...holes] of buildable) {
    if (!outer || outer.length < 3) continue
    const inside = (p: Point) => pointInPolygon(p, outer) && !holes.some((h) => pointInPolygon(p, h))
    for (const p of samplesIn(outer, 2500, inside)) {
      const v = s.slope(p)
      if (v !== null) out = Math.max(out ?? 0, v)
    }
  }
  return out
}

/** The largest difference of level between two platforms side by side (m); null with none side by side. */
export function largestStep(e: Earthwork | null): number | null {
  if (!e) return null
  let out: number | null = null
  for (const [i, j] of e.neighbours) {
    const a = e.platforms[i].level
    const b = e.platforms[j].level
    if (a !== null && b !== null) out = Math.max(out ?? 0, Math.abs(a - b))
  }
  return out
}

/**
 * The design roads that, graded, still climb steeper than the standards' max. grade (Decision "Graded roads": the
 * levels they join are too far apart in height for their length), each an Issue where it climbs most (a Flow one).
 */
export function roadGradeIssues(p: Project, grading: RoadGrading | null): Issue[] {
  if (!grading) return []
  const { maxGrade } = standardsOf(p)
  return grading.roads.flatMap((r): Issue[] =>
    r.grade <= maxGrade + 1e-6
      ? []
      : [
          {
            code: 'road',
            severity: 'warning',
            massIds: [],
            at: r.at,
            message: `A road climbs ${gradePct(r.grade)} here, over the ${gradePct(maxGrade)} max. road grade: the levels it joins are too far apart for its length.`,
          },
        ],
  )
}

/**
 * The ground's Issues for an option: each design built mass on ground steeper than the site's maximum (a tenth of it
 * or more), each pair of platforms side by side further apart than the standards' step (of one building a step, of two
 * a wall where they touch), each platform whose banks leave the site (where they leave it).
 */
export function terrainIssues(p: Project, e: Earthwork | null, s: Surface | null, design: DerivedMass[]): Issue[] {
  if (!s) return []
  const out: Issue[] = []
  const max = p.site.rules.maxSlope
  if (max)
    for (const m of design) {
      if (!m.built || m.polygon.length < 3) continue
      const under = steepUnder(s, m.polygon, max)
      if (!under || under.share < STEEP_SHARE) continue
      out.push({
        code: 'terrain',
        severity: 'warning',
        massIds: [m.id],
        message: `${m.name}: ${percent(under.share)} of it on ground steeper than ${percent(max)} (up to ${percent(under.steepest)}), too steep to build.`,
      })
    }
  if (e) {
    const { maxStep } = standardsOf(p)
    const names = new Map(design.map((m) => [m.id, m.name]))
    // a building's platform by its buildings, a step by its masses
    const name = (i: number) => {
      const x = e.platforms[i]
      return x.step ? x.massIds.map((id) => names.get(id) ?? id).join(', ') : x.buildingIds.map((id) => p.buildings.find((b) => b.id === id)?.name ?? id).join(' + ')
    }
    e.platforms.forEach((x, i) => {
      if (x.context || x.banks.outside < OUTSIDE_TOL) return
      out.push({
        code: 'terrain',
        severity: 'warning',
        massIds: x.massIds,
        ...(x.banks.outsideAt ? { at: x.banks.outsideAt } : {}),
        message: `The banks of ${name(i)}’s platform leave the site (about ${Math.round(x.banks.outside).toLocaleString('en-US')} m² outside).`,
      })
    })
    for (const [i, j] of e.neighbours) {
      const a = e.platforms[i]
      const b = e.platforms[j]
      if (a.level === null || b.level === null || a.context || b.context) continue
      const step = Math.abs(a.level - b.level)
      if (step <= maxStep + 1e-9) continue
      // two buildings' platforms that touch (their courts, say) have no room for a bank between them: a wall
      const own = a.buildingIds.some((id) => b.buildingIds.includes(id))
      out.push({
        code: 'terrain',
        severity: 'warning',
        massIds: [...a.massIds, ...b.massIds],
        message: own
          ? `A step of ${metres(step)} between ${name(i)} and ${name(j)}, over the ${metres(maxStep)} a building’s platforms may differ.`
          : `A wall of ${metres(step)} where ${name(i)}’s and ${name(j)}’s platforms touch (no room for a bank), over the ${metres(maxStep)} max. step.`,
      })
    }
  }
  return out
}
