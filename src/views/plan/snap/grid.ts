// The grid: the last resort when nothing else attracts. Same rule as Plaza-Practiko's `ajustarMovimiento`: the shape's
// first corner lands ON the grid (not just moves by whole steps), so walls end up on whole metres. While the option
// stands on a structural grid (Phase G.2b, Decision "Grid layout") the grid is its modules, along its axes, from its
// origin: a step is a number (m, on the plan's axes) or that grid.
import type { Grid, Id, Point, Project } from '../../../model/schema.ts'
import { gridOf, moduleOf, snapToModules } from '../../../engine/grid/index.ts'

/** Grid step (m) without a structural grid. */
export const GRID_STEP = 1

/** What the plan snaps to: whole metres on its axes, or a structural grid's modules. */
export type Step = number | Grid

const round = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v)

/** The step the plan snaps to: the modules of the grid the option stands on, else 1 m. */
export function planStep(p: Project, optionId: Id): Step {
  return gridOf(p, optionId) ?? GRID_STEP
}

/** A step as one length (m): a structural grid's smaller module. */
export const stepLength = (step: Step): number => (typeof step === 'number' ? step : Math.min(moduleOf(step).x, moduleOf(step).y))

/** The grid node closest to q. */
export function snapToGrid(q: Point, step: Step = GRID_STEP): Point {
  if (typeof step !== 'number') return snapToModules(step, q)
  return { x: round(q.x, step), y: round(q.y, step) }
}

/** The offset that, applied to `anchor` instead of `raw`, puts it on the grid. */
export function gridDelta(anchor: Point, raw: Point, step: Step = GRID_STEP): Point {
  const g = snapToGrid({ x: anchor.x + raw.x, y: anchor.y + raw.y }, step)
  return { x: g.x - anchor.x, y: g.y - anchor.y }
}
