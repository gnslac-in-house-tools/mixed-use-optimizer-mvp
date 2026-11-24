// Massing rules: is every built mass inside the buildable area, off the others, under the coverage limit?
// Each check returns Issues; it never throws and never changes the project.
import type { SiteRules } from '../../model/schema.ts'
import { difference, intersection, regionsArea } from '../geom/boolean.ts'
import { rings } from '../geom/holes.ts'
import { bounds, boundsTouch } from '../geom/polygon.ts'
import type { DerivedMass, DerivedSite, Issue, Metrics } from '../types.ts'

/** m². Below this, an overlap or an excess is numerical noise, not a design problem. */
const AREA_TOL = 0.01

const m2 = (v: number) => `${Math.round(v).toLocaleString('en-US')} m²`

export function checkSite(site: DerivedSite): Issue[] {
  if (site.polygon) return []
  return [{ code: 'no-site', severity: 'warning', massIds: [], message: 'No site boundary yet: site rules are not checked.' }]
}

/** Each built mass must stand inside the buildable area (site minus setback). */
export function checkBuildable(site: DerivedSite, masses: DerivedMass[], rules: SiteRules): Issue[] {
  if (!site.polygon) return []
  const issues: Issue[] = []
  const zone = site.buildable.flat()
  for (const m of masses) {
    if (!m.built || m.polygon.length < 3) continue
    const outside = regionsArea(difference(rings(m), zone))
    if (outside > AREA_TOL)
      issues.push({
        code: 'outside-buildable',
        severity: 'error',
        massIds: [m.id],
        message: `${m.name}: ${m2(outside)} outside the buildable area (setback ${rules.setback} m).`,
      })
  }
  return issues
}

/**
 * Built masses that stand side by side may not overlap (how far apart they keep is the brief's *apart* rules, Decision
 * "Spacing by rules"). Checked pair by pair:
 * in one building, the masses of a level (a mass over another one, on another level, is the building's floors);
 * between two buildings, the masses whose stacks share some height (Decision "Buildings and options"). Two context
 * masses are not checked; a design mass is checked against context.
 */
export function clash(a: DerivedMass, b: DerivedMass): boolean {
  if (a.context && b.context) return false
  if (a.buildingId === b.buildingId) return a.levelId === b.levelId
  return a.span[0] < b.span[1] - 1e-9 && b.span[0] < a.span[1] - 1e-9
}

/** Overlap between every pair of built masses that `clash`, one building or not. */
export function checkOverlap(masses: DerivedMass[]): Issue[] {
  const built = masses.filter((m) => m.built && m.polygon.length >= 3)
  const boxes = built.map((m) => bounds(m.polygon))
  const issues: Issue[] = []
  for (let i = 0; i < built.length; i++) {
    for (let j = i + 1; j < built.length; j++) {
      if (!clash(built[i], built[j])) continue
      // mixed-use-mvp: a nested mass (a core) may stand inside another mass of its own building
      if (built[i].buildingId === built[j].buildingId && (built[i].nested || built[j].nested)) continue
      // Cheap test first: if the boxes are apart, skip the expensive booleans.
      if (!boundsTouch(boxes[i], boxes[j], 0)) continue
      const a = built[i]
      const b = built[j]
      const overlap = regionsArea(intersection(rings(a), rings(b)))
      if (overlap > AREA_TOL) {
        issues.push({
          code: 'overlap',
          severity: 'error',
          massIds: [a.id, b.id],
          message: `${a.name} and ${b.name} overlap by ${m2(overlap)}.`,
        })
      }
    }
  }
  return issues
}

export function checkCoverage(metrics: Metrics, rules: SiteRules): Issue[] {
  if (rules.maxCoverage === null || metrics.coverage === null) return []
  if (metrics.coverage <= rules.maxCoverage + 1e-9) return []
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  return [
    {
      code: 'coverage-exceeded',
      severity: 'error',
      massIds: [],
      message: `Coverage ${pct(metrics.coverage)} exceeds the maximum ${pct(rules.maxCoverage)}.`,
    },
  ]
}
