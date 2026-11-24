// The Split tool's one writer (Phase D.3 task 8, Decision "Shape engine"): a line from `a` to `b` splits each truck court it crosses, through `actions.editShape` (op `split`), on the
// site (`block-court` refs) and in the block editor (`court` refs) alike. It lives in the shape folder, the one place of the views that names `editShape` for the handles' kind of work.
// A court the line does not reach is left as it is; the line across no court says why the tool is no use there (*Split takes a truck court for now*: the tool says it, the kinds do not list `split`).
import type { Point, Project } from '../../../model/schema.ts'
import type { Ref } from '../../../kinds/index.ts'
import { contourToPolygon } from '../../../engine/geom/contour.ts'
import { pointInPolygon, segmentsTouch } from '../../../engine/geom/polygon.ts'
import { actions } from '../../../state/actions/index.ts'

/** What the tool says for a line across nothing it can split. */
export const SPLIT_COURT_ONLY = 'Split takes a truck court for now'

/** The engine's reason for a line that misses the shape. */
const MISSES = 'The line does not cross it'

export interface Splitted {
  project: Project
  /** How many courts the line split. */
  count: number
  /** Why nothing was split (a court that refused, else `SPLIT_COURT_ONLY`); absent when something was. */
  reason?: string
  /** What the splits say besides (the pieces off the wall that went). */
  notes: string[]
}

/**
 * Whether the drawn segment `a`-`b` reaches the court: an end inside it or the segment across a side. The cut itself is the line's (it runs through the whole court), but only the
 * courts the drawn segment touches are cut: a segment on one block does not reach the copies of its type far from it (review, browser check).
 */
function reached(p: Project, ref: Ref, a: Point, b: Point): boolean {
  const read = actions.shapeOf(p, ref)
  if (!read) return true
  const ring = contourToPolygon(read.contour)
  return pointInPolygon(a, ring) || pointInPolygon(b, ring) || ring.some((q, i) => segmentsTouch(a, b, q, ring[(i + 1) % ring.length]))
}

/** `p` with every court of `refs` the segment `a`-`b` reaches split, in order; the same project, with a reason, when none was. */
export function splitCourts(p: Project, refs: readonly Ref[], a: Point, b: Point): Splitted {
  let project = p
  let count = 0
  let reason: string | undefined
  const notes: string[] = []
  for (const ref of refs) {
    if (!reached(project, ref, a, b)) continue
    const w = actions.editShape(project, ref, { op: 'split', a, b })
    if (w.reason) {
      if (w.reason !== MISSES) reason ??= w.reason
      continue
    }
    if (w.project === project) continue
    project = w.project
    count++
    notes.push(...(w.notes ?? []))
  }
  return count > 0 ? { project, count, notes } : { project: p, count: 0, reason: reason ?? SPLIT_COURT_ONLY, notes }
}
