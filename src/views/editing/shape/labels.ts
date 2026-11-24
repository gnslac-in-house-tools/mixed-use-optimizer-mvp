// The texts the shape handles say beside what is hovered or dragged (Phase D.1 task 5): a wall's length and how far it moved, a block's
// modules and range, a stretch's size, a chamfer's two set-backs. Pure; the numbers are metres.
import type { ShapeWall } from '../../../engine/geom/shapeOp.ts'

export const fmt = (v: number): string => v.toFixed(2)

/** How a viewport writes a length: `unit`, a figure (a block's, whole metres without decimals) and a difference. The site's is metres; the block editor's is its own unit (BE.8: feet too). */
export interface Lengths {
  unit: string
  fig(m: number): string
  delta(m: number): string
}
export const signed = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v))}`
/** A block's figure: whole metres without decimals. */
export const metres = (v: number): string => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : fmt(v))
export const METRES: Lengths = { unit: 'm', fig: metres, delta: fmt }
const count = (k: number): string => `${k > 0 ? '+' : k < 0 ? '−' : '±'}${Math.abs(k)} ${Math.abs(k) === 1 ? 'module' : 'modules'}`

/** A box wall's range left: its length now is past it (by hand it may go there: Decision "Past the range by hand"). */
export const pastRange = (w: ShapeWall | undefined): boolean => !!w?.range && (w.range.now < w.range.lo - 0.005 || w.range.now > w.range.hi + 0.005)

/**
 * What a wall says: a box wall of a block its length or width with its range, an inner one its modules, any other its length. While it
 * is dragged (`moved`: how far it went, m) the move follows.
 * @param length the wall's length (m), the arc's for an arc edge
 */
export function wallText(wall: ShapeWall | undefined, length: number, dragged: boolean, moved: number, L: Lengths = METRES): string {
  const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${L.delta(Math.abs(v))}`
  // a truck court's far edge: its depth, in the range it is held to (Phase D.3)
  if (wall?.value) {
    const { lo, hi, now } = wall.value
    return `Depth ${L.fig(now)} ${L.unit} (${L.fig(lo)}–${L.fig(hi)} ${L.unit})${dragged ? ` · ${sign(moved)} ${L.unit}` : ''}`
  }
  if (wall?.range) {
    const { lo, hi, now } = wall.range
    const what = wall.axis === 'length' ? 'Length' : 'Width'
    return `${what} ${L.fig(now)} ${L.unit} (${pastRange(wall) ? 'past its range ' : ''}${L.fig(lo)}–${L.fig(hi)})${dragged ? ` · ${sign(moved)} ${L.unit}` : ''}`
  }
  if (wall?.module) {
    if (!dragged) return `An inner wall · ${L.delta(length)} ${L.unit}`
    // the metres as they are; the modules too when it lands on whole ones
    const k = wholeModules(moved, wall.module)
    return `${k ? `${count(k)} · ` : ''}${sign(moved)} ${L.unit}`
  }
  return `${L.delta(length)} ${L.unit}${dragged ? ` · ${sign(moved)} ${L.unit}` : ''}`
}

/** How many modules `v` m is, when it is whole ones (not none); null otherwise. */
function wholeModules(v: number, module: number): number | null {
  const k = module > 0 ? Math.round(v / module) : 0
  return k !== 0 && Math.abs(v / module - k) < 1e-6 ? k : null
}

/** A block's stretch picked on a wall of `module` m: what pulling it `moved` m out (in: negative) makes, and how big it is. The metres as they are, the modules too when whole ones. */
export function stretchText(module: number, from: number, to: number, moved: number, L: Lengths = METRES): string {
  const k = wholeModules(moved, module)
  const amount = k !== null ? `${Math.abs(k)} ${Math.abs(k) === 1 ? 'module' : 'modules'}` : `${L.delta(Math.abs(moved))} ${L.unit}`
  const what = Math.abs(moved) < 1e-9 ? 'Drag its face out or in' : moved > 0 ? `Out ${amount}` : `In ${amount}`
  const n = wholeModules(to - from, module)
  const size = n !== null ? `${n} ${n === 1 ? 'module' : 'modules'}, ${L.fig(to - from)} ${L.unit}` : `${L.fig(to - from)} ${L.unit}`
  return `${what} · ${size}`
}

/** A corner's chamfer: its two set-backs. */
export const chamferText = (a: number, b: number): string => `Chamfer ${fmt(a)} × ${fmt(b)} m`
