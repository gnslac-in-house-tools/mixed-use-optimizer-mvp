// How a hand-drawn dimension looks (port of Plaza-Practiko `vistas/planta/acotaciones.ts`), pure: extension lines,
// the dimension line, 45° ticks and the text above the line, never upside down. Points and offset are in metres (the
// plan's world, y up); gaps, ticks and lettering in screen px through `mPerPx`, so a dimension reads the same at any
// zoom.
import type { Dimension, Point } from '../../../model/schema.ts'

/** Lettering of a dimension, in px. */
export const DIMENSION_TEXT_PX = 10
/** Gap from an extension line to its point, and how far it passes the dimension line (px). */
const GAP_PX = 2
const OVERSHOOT_PX = 3
/** Half a 45° tick at the ends (px). */
const TICK_PX = 4
/** Between the dimension line and the foot of the text (px). */
const ABOVE_LINE_PX = 3

export interface Segment {
  a: Point
  b: Point
}

export interface DimensionDrawing {
  extensions: Segment[]
  line: Segment
  ticks: Segment[]
  text: {
    /** Where the text is anchored (on the dimension line). */
    q: Point
    /** Rotation in degrees (counter-clockwise, in (−90, 90]: never upside down). */
    angle: number
    /** 'middle' above the centre; 'start' outside the end, when it does not fit between the ticks. */
    anchor: 'middle' | 'start'
    content: string
    /** Letter height (m). */
    size: number
    /** The foot of the text, measured up from the line (m). */
    above: number
  }
  /** Measured length (m). */
  length: number
}

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "12.35": two decimals and no unit, as on drawings. */
export function dimensionText(m: number): string {
  return TWO_DECIMALS.format(m)
}

/** Approximate width of a text in Inter: 0.58 of the letter per character. */
const widthOf = (s: string, size: number) => s.length * 0.58 * size

/** The signed distance from q to the line a→b: positive on the left (the offset of a dimension through q). */
export function offsetFrom(a: Point, b: Point, q: Point): number {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  if (l < 1e-9) return 0
  return ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / l
}

/** The drawing of a dimension; null when its points coincide. `text` writes its length (the block editor's: in its
 *  unit, BE.10). */
export function dimensionDrawing(c: Pick<Dimension, 'a' | 'b' | 'offset'>, mPerPx: number, text: (m: number) => string = dimensionText): DimensionDrawing | null {
  const { a, b, offset } = c
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-9) return null
  const px = mPerPx
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const n = { x: -u.y, y: u.x }
  const plus = (q: Point, v: Point, s: number): Point => ({ x: q.x + v.x * s, y: q.y + v.y * s })
  const la = plus(a, n, offset)
  const lb = plus(b, n, offset)

  // extension lines start a gap away from the point and pass the line a little; a line almost on its points has none
  const side = offset >= 0 ? 1 : -1
  const gap = GAP_PX * px
  const overshoot = OVERSHOOT_PX * px
  const extensions = Math.abs(offset) > gap ? [a, b].map((q) => ({ a: plus(q, n, side * gap), b: plus(q, n, offset + side * overshoot) })) : []

  // 45° ticks (the diagonal between the line and its normal)
  const k = TICK_PX * px
  const d = { x: (u.x + n.x) * Math.SQRT1_2 * k, y: (u.y + n.y) * Math.SQRT1_2 * k }
  const ticks = [la, lb].map((q) => ({ a: { x: q.x - d.x, y: q.y - d.y }, b: { x: q.x + d.x, y: q.y + d.y } }))

  // the text reads left to right: its direction is u or −u, whichever has its angle in (−90, 90]
  let angle = (Math.atan2(u.y, u.x) * 180) / Math.PI
  const flip = angle > 90 || angle <= -90
  if (flip) angle = angle > 0 ? angle - 180 : angle + 180
  const reading = flip ? { x: -u.x, y: -u.y } : u
  const content = text(length)
  const size = DIMENSION_TEXT_PX * px
  const fits = widthOf(content, size) + 2 * k <= length
  // outside, past the end that is on the right when reading
  const end = flip ? la : lb
  const q = fits ? { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 } : plus(end, reading, k + 2 * px)
  return {
    extensions,
    line: { a: la, b: lb },
    ticks,
    text: { q, angle, anchor: fits ? 'middle' : 'start', content, size, above: ABOVE_LINE_PX * px },
    length,
  }
}
