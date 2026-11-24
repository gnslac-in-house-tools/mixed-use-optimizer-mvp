// What the main plan's tools snap to on the block editor's plan (Phase BE.10), pure: given to them through
// views/plan/snap/SnapSourceContext.tsx, so the Ruler and the Dimension tool are the main plan's, not a copy. The
// block's columns (endpoints at their centres), its walls' corners and middles (the mass's outer face, its holes, each
// wall's band) and its elements' openings (ends and middle); with Grid on, its module-line nodes too (intersections),
// and the module node nearest the pointer where nothing else attracts, inside the block only (late review of BE.10).
import type { Point } from '../../../model/schema.ts'
import type { Targets } from '../../../views/plan/snap/move.ts'
import { targetsOf } from '../../../views/plan/snap/move.ts'
import type { SnapPoint, Source } from '../../../views/plan/snap/points.ts'
import type { HallRuns } from '../engine/bays.ts'
import { wallOutline, type Generated, type GeneratedDoor } from '../engine/generate.ts'
import { outwardOf } from '../engine/shape.ts'

const contour = (ps: Point[]) => ({ vertices: ps.map((q) => ({ x: q.x, y: q.y, r: 0 })) })

const doorName = (d: GeneratedDoor) => (d.kind === 'dock' ? 'Dock' : d.kind === 'door' ? 'Level door' : (d.name ?? 'Pattern'))

/** What attracts on the block plan; with `grid` (Grid on) its module-line nodes too. */
export function blockTargets(g: Generated, grid: boolean): Targets {
  const sources: Source[] = [
    ...g.parts.flatMap((p) => [{ contour: contour(p.polygon), label: 'Wall' }, ...p.holes.map((h) => ({ contour: contour(h), label: 'Hole' }))]),
    // each wall's band: its inner face's corners (no crossings: the bands overlap at the corners)
    ...g.walls.map((w) => ({ contour: contour(wallOutline(w)), label: 'Wall', crossings: false, track: false })),
    // an element's opening on its wall: its two ends and its middle
    ...g.doors.map((d) => {
      const n = outwardOf(d.side)
      const u = { x: Math.abs(n.y), y: Math.abs(n.x) }
      const h = d.width / 2
      const ends = [
        { x: d.at.x - u.x * h, y: d.at.y - u.y * h },
        { x: d.at.x + u.x * h, y: d.at.y + u.y * h },
      ]
      return { contour: contour(ends), label: doorName(d), open: true, crossings: false, track: false }
    }),
  ]
  const t = targetsOf(sources)
  const columns: SnapPoint[] = g.columns.map((c) => ({ p: { x: c.x, y: c.y }, kind: 'endpoint', label: 'Column' }))
  const nodes: SnapPoint[] = !grid ? [] : g.runs.x.modules.flatMap((x) => g.runs.y.modules.map((y): SnapPoint => ({ p: { x, y }, kind: 'intersection', label: 'Module' })))
  return { ...t, points: [...columns, ...t.points, ...nodes] }
}

const nearestOf = (vs: number[], v: number) => vs.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), vs[0] ?? v)

/** The block's Grid (its modules, which need not be evenly spaced: the end bays): the module node nearest q, while q
 *  is on the block or within `tol` (m) of it; farther out none (a dimension's line, a truck court, the ground). */
export function moduleNode(runs: HallRuns, q: Point, tol: number): Point | null {
  const within = (vs: number[], v: number) => v >= vs[0] - tol && v <= vs[vs.length - 1] + tol
  if (!within(runs.x.modules, q.x) || !within(runs.y.modules, q.y)) return null
  return { x: nearestOf(runs.x.modules, q.x), y: nearestOf(runs.y.modules, q.y) }
}
