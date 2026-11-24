// *Place*'s geometry (Phase 5.5; port of Practiko's `vistas/mapa/ajuste.ts`): the turn a drag round the map's centre
// gives (Shift: steps of 15°), and where the turning handle stands so it stays in view. Pure.
import type { Point } from '../../../model/schema.ts'
import { normalizeDegrees } from '../../../engine/geo/local.ts'

export const TURN_STEP = 15 // degrees, with Shift

/** The angle (degrees, counter-clockwise from +x) of the vector c → q. */
export function angleTo(c: Point, q: Point): number {
  return (Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI
}

/**
 * The turn after dragging the handle: the start's plus how far the pointer went round the centre. With a step, the
 * result is rounded to its multiples.
 */
export function turnedBy(start: number, angleStart: number, angleNow: number, step: number | null): number {
  let r = start + (angleNow - angleStart)
  if (step) r = Math.round(r / step) * step
  return normalizeDegrees(Math.round(r * 1e6) / 1e6)
}

/**
 * How far (m) from the map's centre the turning handle stands, along its local +y (turned): normally `max` (above the
 * map's edge); if that point is out of view, it comes nearer along the same axis until it is inside, `margin` m from
 * the view's edge, never under `min`. `view`: what is seen, in metres, its centre and its width and height.
 */
export function handleDistance(center: Point, rotation: number, max: number, min: number, view: { cx: number; cy: number; w: number; h: number }, margin: number): number {
  const r = (rotation * Math.PI) / 180
  const ux = -Math.sin(r)
  const uy = Math.cos(r)
  const limit = (c: number, u: number, lo: number, hi: number) => {
    if (Math.abs(u) < 1e-9) return Infinity
    const a = (lo - c) / u
    const b = (hi - c) / u
    return Math.max(a, b)
  }
  const tx = limit(center.x, ux, view.cx - view.w / 2 + margin, view.cx + view.w / 2 - margin)
  const ty = limit(center.y, uy, view.cy - view.h / 2 + margin, view.cy + view.h / 2 - margin)
  return Math.max(min, Math.min(max, tx, ty))
}
