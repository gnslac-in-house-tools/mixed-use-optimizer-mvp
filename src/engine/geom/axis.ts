// The site's main axis (moved from the optimizer's parameters, Phase G.1: the grid lines up with it too). Pure.
import type { Point } from '../../model/schema.ts'

/** An angle in [0, 360). */
const turn = (a: number) => ((a % 360) + 360) % 360

/**
 * The site's main axis, in degrees within (−45°, 45°]: the longest straight stretch of `runs` (the drawn lines of the
 * existing streets along its boundary, `boundaryRoads`: the street it faces, buildings line up with it), else of its
 * whole boundary. Not its minimum rectangle, which a four-sided site tilts toward a diagonal. Rotations step from it,
 * so 90° turns stay on the steps.
 */
export function mainAxis(boundary: Point[], runs: Point[][] = []): number {
  const lines = runs.length ? runs : [[...boundary, boundary[0]]]
  let best = { len: 0, angle: 0 }
  for (const run of lines)
    for (let i = 0; i + 1 < run.length; i++) {
      const [a, b] = [run[i], run[i + 1]]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > best.len + 1e-9) best = { len, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
    }
  const a = turn(best.angle) % 90
  return a > 45 ? a - 90 : a
}
