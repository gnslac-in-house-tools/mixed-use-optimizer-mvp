// Where the Tools strip docks (AS.2 task 5; spec "The Tools strip", "It moves"): pure, no React, no store, no DOM. `dockAt` reads
// a pointer's place against the window's <main> and the viewport's column and says which of the five docks it asks for;
// `stepDock` says where an arrow key on the grip walks the strip. The grip's drag (tools/ToolStrip.tsx) and its tests use them.
import type { StripDock } from '../layout/ui.ts'

/** A rectangle by its four edges, in the page's pixels: a DOMRect has them, and a test writes four numbers. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The dock a pointer asks for. Left of the middle between the window's left edge and the viewport's left edge: `left`, the
 * window's left. Anywhere else: the viewport's nearest edge, by distance to the edge's line: its left edge `panel` (between the
 * left panel and the viewport), its right edge `right`, its top `top`, its bottom `bottom`. A tie goes in that order. Inside the
 * viewport, around it or on its border.
 */
export function dockAt(p: { x: number; y: number }, r: { main: Rect; viewport: Rect }): StripDock {
  const { main, viewport } = r
  if (p.x < main.left + (viewport.left - main.left) / 2) return 'left'
  const edges: [StripDock, number][] = [
    ['panel', Math.abs(p.x - viewport.left)],
    ['right', Math.abs(p.x - viewport.right)],
    ['top', Math.abs(p.y - viewport.top)],
    ['bottom', Math.abs(p.y - viewport.bottom)],
  ]
  return edges.reduce((best, e) => (e[1] < best[1] ? e : best))[0]
}

/** Where an arrow key on the grip puts the strip: ← → walk left · panel · right and stop at the ends (from above or below, ←
 *  goes to `panel` and → to `right`); ↑ goes above the viewport and ↓ below it, from anywhere. */
export function stepDock(from: StripDock, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): StripDock {
  if (key === 'ArrowUp') return 'top'
  if (key === 'ArrowDown') return 'bottom'
  const walk: StripDock[] = ['left', 'panel', 'right']
  const i = walk.indexOf(from)
  if (key === 'ArrowLeft') return i === -1 ? 'panel' : walk[Math.max(0, i - 1)]
  return i === -1 ? 'right' : walk[Math.min(walk.length - 1, i + 1)]
}
