// The Chamfer tool, the pure part (Phase D.1, Decision "Chamfer"; beside `cornerRadius.ts`): what set-back a pointer position gives, and
// which corner can be chamfered. The tool sets both ends alike; the handles drag them apart after.
import type { Contour, Point } from '../../../model/schema.ts'
import { chamferOf } from '../../../engine/geom/contour.ts'
import { maxChamfer } from '../../../engine/geom/chamfer.ts'
import { bisector } from './cornerRadius.ts'

/** What fits at corner i with both ends alike: the shorter of the two ends `maxChamfer` leaves. */
export const roomAt = (c: Contour, i: number): number => {
  const [a, b] = maxChamfer(c, i)
  return Math.min(a, b)
}

/**
 * The set-back (m) the pointer at q gives, the same along both walls: the pointer is the middle of the cut, so the advance along the
 * bisector is `s · cos(angle / 2)`. Never negative nor more than fits (`maxChamfer`); rounded to `step` m (0 = not rounded).
 */
export function chamferFromPointer(c: Contour, i: number, q: Point, step = 0): number {
  const b = bisector(c, i)
  if (!b) return 0
  const v = c.vertices[i]
  const d = (q.x - v.x) * b.u.x + (q.y - v.y) * b.u.y
  const cos = Math.cos(b.angle / 2)
  if (d <= 0 || cos < 1e-6) return 0
  let s = d / cos
  if (step > 0) s = Math.round(s / step) * step
  return Math.min(Math.max(0, s), Math.max(0, roomAt(c, i)))
}

/** Can the corner be chamfered? (its two sides are straight and something fits, or it already has a chamfer or a radius) */
export function chamferable(c: Contour, i: number): boolean {
  const room = roomAt(c, i)
  return bisector(c, i) !== null && Number.isFinite(room) && (room > 1e-6 || chamferOf(c, i) !== null || c.vertices[i].r > 0)
}
