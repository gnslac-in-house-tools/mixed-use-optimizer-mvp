// Snap for a dragged wall (a dragged corner goes through resolve.ts). Pure, like move.ts.
// - Wall: it slides along its normal only. A wall along the grid's axes lands ON a grid line (an oblique one moves by
//   whole steps), unless a parallel wall nearby (other masses, site, setback) pulls it onto its line: Plaza's
//   `dDeArrastreMuro` plus our alignment. On a structural grid (Phase G.2b) the lines are its modules, on its axes.
import type { Point } from '../../../model/schema.ts'
import { axesOf, moduleOf, toGrid } from '../../../engine/grid/index.ts'
import { GRID_STEP, stepLength, type Step } from './grid.ts'
import type { SnapSettings } from './kinds.ts'
import type { SnapMark } from './move.ts'
import { snapToWalls, type LabeledWall, type Wall } from './walls.ts'

const round = (v: number, step: number) => Math.round(v / step) * step
const square = (c: number) => Math.abs(Math.abs(c) - 1) < 1e-9

/** How far a dragged wall moves along its outward normal: `d` (m) for a pointer offset `delta`. */
export function snapWallOffset(
  wall: Wall,
  delta: Point,
  targets: LabeledWall[],
  s: SnapSettings,
  tol: number,
  step: Step = GRID_STEP,
): { d: number; mark: SnapMark | null } {
  const n = wall.n
  const raw = delta.x * n.x + delta.y * n.y
  let base = raw
  if (s.grid) {
    // the grid's axes and spacing: the plan's and whole metres, or a structural grid's and its modules
    const { u, v } = typeof step === 'number' ? { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } } : axesOf(step)
    const m = typeof step === 'number' ? { x: step, y: step } : moduleOf(step)
    const a = typeof step === 'number' ? wall.a : toGrid(step, wall.a)
    const nu = n.x * u.x + n.y * u.y
    const nv = n.x * v.x + n.y * v.y
    if (square(nu)) base = (round(a.x + raw * nu, m.x) - a.x) * nu // across the grid's x: its u
    else if (square(nv)) base = (round(a.y + raw * nv, m.y) - a.y) * nv // across its y: its v
    else base = round(raw, stepLength(step))
  }
  if (s.on && s.align) {
    const along = (k: number) => ({ x: n.x * k, y: n.y * k })
    const r = snapToWalls([wall], targets, along(raw), along(base), tol)
    if (r) {
      const names = [...new Set(r.guides.map((g) => g.label))].join(' · ')
      return { d: r.delta.x * n.x + r.delta.y * n.y, mark: { kind: null, at: r.at, label: `Aligned · ${names}`, guides: r.guides } }
    }
  }
  return { d: base + 0, mark: null } // + 0: no −0
}
