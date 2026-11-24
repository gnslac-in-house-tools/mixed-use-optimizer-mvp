// Where the warnings stand on the Massing plan (Decision "Issues on the massing"; asked by the user: "warnings placed
// with indicators where the conflicts are, like chips beside the geometry; a click opens the message"). Pure: from the
// option's issues and the derived masses to one marker per place, in the plan's drawn coordinates (y down):
//   a mass        its issues (outside the buildable area, broken geometry…) at the top-right corner of its bounds
//   two masses    their issues (a broken rule, an overlap, too close) at the middle of the arc the plan draws between
//                 them (RulesLayer.tsx), so a broken rule's marker sits on its red arc
//   a place       an issue about no mass (a gate, a road's dead end: Decision "Exterior circulation") where it says, on
//                 every level
// The brief's counts (code `brief`, Decision "Brief issues") are about the brief as a whole, not a place: no marker.
// A marker shows on the level of one of its masses; its severity is the worst of its issues. Which place's issues are
// picked (its marker clicked, or one of them in the Summary's Issues tab: Decision "Issues, one list") and whether the
// warnings chip marks every place in red are per-browser UI state (`useIssueFocus`), never in the Project.
import { create } from 'zustand'
import type { Id, Point } from '../../model/schema.ts'
import { bounds, centroid } from '../../engine/geom/polygon.ts'
import type { DerivedMass, Issue } from '../../engine/types.ts'
import { edgePath } from '../graph/diagram.ts'

export interface IssueMarker {
  /** `mass:<id>`, `pair:<a>|<b>` (sorted) or `at:<x>,<y>`: the same place keeps its key while the massing changes. */
  key: string
  /** Where it stands, drawn (x, −y). */
  at: Point
  issues: Issue[]
  severity: Issue['severity']
}

/**
 * The picked place (a marker's key, or null): its issues stand out in the Issues tab and its marker on the plan. `n`
 * counts the picks, so the tab scrolls to one picked again. `highlight`: the warnings chip's red marks over every place
 * with issues.
 */
export const useIssueFocus = create<{ key: string | null; n: number; highlight: boolean }>(() => ({ key: null, n: 0, highlight: false }))

/** Picks a place's issues (null: none). */
export function pickIssues(key: string | null) {
  useIssueFocus.setState((s) => ({ key, n: s.n + 1 }))
}

/** A mass's middle as the plan draws it (y down). */
const drawn = (m: DerivedMass): Point => {
  const c = centroid(m.polygon)
  return { x: c.x, y: -c.y }
}

/** The midpoint of the curved arc the plan draws from a to b (the same as RulesLayer's). */
export function arcMiddle(a: DerivedMass, b: DerivedMass): Point {
  return edgePath(drawn(a), drawn(b), 0, 0, 'curved').mid
}

/** The masses of an issue the plan draws. */
const drawnIds = (issue: Issue, masses: Record<Id, DerivedMass>): Id[] => issue.massIds.filter((id) => (masses[id]?.polygon.length ?? 0) >= 3)

/**
 * The key of the place an issue stands at (its marker's), on any level; null: no place (the brief's counts). One about
 * the ground stands where it is (a platform's banks where they leave the site), not between its masses.
 */
export function issueKey(issue: Issue, masses: Record<Id, DerivedMass>): string | null {
  if (issue.code === 'brief') return null
  const at = issue.at ? `at:${issue.at.x.toFixed(1)},${issue.at.y.toFixed(1)}` : null
  if (issue.massIds.length === 0 || (issue.code === 'terrain' && at)) return at
  const ids = drawnIds(issue, masses)
  if (ids.length === 0) return null
  return ids.length === 1 ? `mass:${ids[0]}` : `pair:${[ids[0], ids[1]].sort().join('|')}`
}

export function issueMarkers(issues: Issue[], masses: Record<Id, DerivedMass>, level: Id): IssueMarker[] {
  const groups = new Map<string, Issue[]>()
  for (const issue of issues) {
    const key = issueKey(issue, masses)
    if (key === null) continue
    if (!key.startsWith('at:') && !drawnIds(issue, masses).some((id) => masses[id].levelId === level)) continue
    groups.set(key, [...(groups.get(key) ?? []), issue])
  }
  return [...groups].map(([key, list]) => {
    let at: Point
    if (key.startsWith('at:')) {
      const q = list[0].at!
      at = { x: q.x, y: -q.y }
    } else if (key.startsWith('mass:')) {
      const b = bounds(masses[key.slice(5)].polygon)
      at = { x: b.maxX, y: -b.maxY }
    } else {
      // a broken rule's order draws its arc: sit on it
      const first = list.find((i) => i.code === 'relation') ?? list[0]
      const [a, b] = first.massIds.filter((id) => (masses[id]?.polygon.length ?? 0) >= 3)
      at = arcMiddle(masses[a], masses[b])
    }
    return { key, at, issues: list, severity: list.some((i) => i.severity === 'error') ? 'error' : 'warning' }
  })
}
