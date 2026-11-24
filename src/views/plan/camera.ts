// Plan camera math: pure, so it is tested without a browser.
// Adapted from Plaza-Practiko `vistas/planta/usePlantaCamara.ts`.
//
// Two coordinate systems:
//   world  — metres, y UP (north), what the engine uses
//   screen — pixels from the SVG's top-left corner, y DOWN
// The SVG draws in metres with y flipped (svgY = −worldY); the viewBox decides which part is visible and at what zoom.
import type { Point } from '../../model/schema.ts'
import type { Bounds } from '../../engine/geom/polygon.ts'

/** What the camera looks at: world centre (m) and zoom (screen px per metre). */
export interface View {
  cx: number
  cy: number
  scale: number
}

export interface Size {
  w: number
  h: number
}

/** Margin around the content when fitting, as a fraction of its size. */
export const MARGIN = 0.08
/** Allowed zoom, relative to the fitted view. */
export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 60
/** Pointer movement (px) under which press + release is a click, not a drag. */
export const CLICK_TOLERANCE = 4
/** Size assumed where the SVG cannot be measured (jsdom in tests). */
export const UNMEASURED_SIZE: Size = { w: 800, h: 600 }

/**
 * The view that shows `b` whole, centred, with a margin. `left`: screen px a window covers on the left (the survey
 * window while a file is imported): `b` goes whole and centred in what is left of the width (at least 40 % of it).
 */
export function fit(b: Bounds, s: Size, margin = MARGIN, left = 0): View {
  const w = Math.max((b.maxX - b.minX) * (1 + 2 * margin), 1e-6)
  const h = Math.max((b.maxY - b.minY) * (1 + 2 * margin), 1e-6)
  const free = Math.max(s.w - left, s.w * 0.4)
  const scale = Math.min(free / w, s.h / h)
  return { cx: (b.minX + b.maxX) / 2 - (s.w - free) / 2 / scale, cy: (b.minY + b.maxY) / 2, scale }
}

/** The SVG viewBox (in flipped-y SVG units) that shows this view at this size. */
export function viewBoxOf(v: View, s: Size): string {
  const w = s.w / v.scale
  const h = s.h / v.scale
  return `${v.cx - w / 2} ${-v.cy - h / 2} ${w} ${h}`
}

/** Screen pixel → world metres. */
export function toWorld(v: View, s: Size, px: number, py: number): Point {
  return { x: v.cx + (px - s.w / 2) / v.scale, y: v.cy - (py - s.h / 2) / v.scale }
}

/** Zoom by `factor`, keeping the world point under the cursor still. `min`/`max` limit the scale. */
export function zoomAt(v: View, s: Size, px: number, py: number, factor: number, min: number, max: number): View {
  const scale = Math.min(max, Math.max(min, v.scale * factor))
  const m = toWorld(v, s, px, py)
  return { cx: m.x - (px - s.w / 2) / scale, cy: m.y + (py - s.h / 2) / scale, scale }
}

/** Dragging dx px right and dy px down moves the drawing with the pointer. */
export function pan(v: View, dx: number, dy: number): View {
  return { cx: v.cx - dx / v.scale, cy: v.cy + dy / v.scale, scale: v.scale }
}

/** SVG path data for polygons (several rings = one path; use fill-rule evenodd for holes). Flips y. */
export function pathOf(rings: Point[][]): string {
  return rings
    .filter((r) => r.length >= 2)
    .map((r) => `M${r.map((p) => `${p.x},${-p.y}`).join('L')}Z`)
    .join('')
}
