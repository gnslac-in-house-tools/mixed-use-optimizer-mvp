// The command line's language (port of Plaza-Practiko `vistas/planta/iman/comando.ts`, on the world axes: Plaza's
// rotated work plane waits until a site needs it). What is typed while a tool places points becomes a point, a
// rectangle or a fixed angle. Metres; the decimal is the point and the comma separates two numbers, as in AutoCAD and
// Rhino.
//   x,y    absolute for the first point, relative to the previous one after it
//   #x,y   always absolute          @x,y   always relative
//   d      d metres towards the cursor          d<a   d metres at a degrees (counter-clockwise from +x)
//   <a     fixes the angle of the next segment  LxW   a rectangle from the first point, towards the cursor's quadrant
//   w d    the width of what is drawn (a road: Decision "Exterior circulation")
//   xN     with `count` (Array: Decision "Mirror, Array, Align"), the copies in a row, the original counted: x5, X5, ×5
//   a      with `angleOnly` (Rotate's end: Decision "General tools"), a bare number is an angle, as <a
//   (empty) Enter: close or finish
import type { Point } from '../../../model/schema.ts'
import { signedArea } from '../../../engine/geom/polygon.ts'

export interface CommandContext {
  /** No point placed yet. */
  first: boolean
  /** The previous point. */
  base: Point | null
  /** The last snapped point under the pointer: the direction of a bare distance. */
  cursor: Point | null
  /** The tool takes "LxW" (the Mass tool). */
  rectangle: boolean
  /** The tool takes "w d", a width (the Road and Existing road tools). */
  width?: boolean
  /** The fixed angle of "<a" (degrees): a bare distance goes that way. */
  angle?: number | null
  /** A bare number is an angle (degrees, counter-clockwise), not a distance: Rotate's end. */
  angleOnly?: boolean
  /** The tool takes "xN", a count of copies (the Array tool). */
  count?: boolean
}

export type Command =
  | { kind: 'point'; point: Point }
  /** The four corners, counter-clockwise. */
  | { kind: 'rectangle'; polygon: Point[] }
  | { kind: 'angle'; degrees: number }
  | { kind: 'width'; value: number }
  /** A count of copies, a whole number from 1. */
  | { kind: 'count'; value: number }
  | { kind: 'empty' }
  | { kind: 'error'; reason: string }

const NUM = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)`
const PAIR = new RegExp(String.raw`^(${NUM})\s*,\s*(${NUM})$`)
const ONE = new RegExp(String.raw`^(${NUM})$`)
const POLAR = new RegExp(String.raw`^(${NUM})\s*<\s*(${NUM})$`)
const ANGLE = new RegExp(String.raw`^<\s*(${NUM})$`)
const RECT = new RegExp(String.raw`^(${NUM})\s*[x*×]\s*(${NUM})$`, 'i')
const WIDTH = new RegExp(String.raw`^w\s*(${NUM})$`, 'i')

const COUNT = /^[x×]\s*(\d+)$/i

const error = (reason: string): Command => ({ kind: 'error', reason })
const towards = (degrees: number): [number, number] => {
  const a = (degrees * Math.PI) / 180
  return [Math.cos(a), Math.sin(a)]
}

export function parseCommand(text: string, c: CommandContext): Command {
  const t = text.trim()
  if (t === '') return { kind: 'empty' }
  const base = c.first ? null : c.base

  const w = WIDTH.exec(t)
  if (w) {
    if (!c.width) return error('No width here')
    const value = Number(w[1])
    return value > 0 ? { kind: 'width', value } : error('A width above 0')
  }

  const k = COUNT.exec(t)
  if (k) {
    if (!c.count) return error('No count here')
    const value = Number(k[1])
    return value >= 1 ? { kind: 'count', value } : error('A whole count from 1')
  }

  if (t.startsWith('#')) {
    const m = PAIR.exec(t.slice(1).trim())
    if (!m) return error('Type #x,y')
    return { kind: 'point', point: { x: Number(m[1]), y: Number(m[2]) } }
  }
  if (t.startsWith('@')) {
    const m = PAIR.exec(t.slice(1).trim())
    if (!m) return error('Type @x,y')
    if (!base) return error('The first point takes x,y')
    return { kind: 'point', point: { x: base.x + Number(m[1]), y: base.y + Number(m[2]) } }
  }
  let m = ANGLE.exec(t)
  if (m) {
    if (!base) return error('Place a point first')
    return { kind: 'angle', degrees: Number(m[1]) }
  }
  m = PAIR.exec(t)
  if (m) {
    const u = Number(m[1])
    const v = Number(m[2])
    return { kind: 'point', point: base ? { x: base.x + u, y: base.y + v } : { x: u, y: v } }
  }
  m = POLAR.exec(t)
  if (m) {
    if (!base) return error('Place a point first')
    const d = Number(m[1])
    const [cu, cv] = towards(Number(m[2]))
    return { kind: 'point', point: { x: base.x + d * cu, y: base.y + d * cv } }
  }
  m = RECT.exec(t)
  if (m) {
    if (!c.rectangle) return error('No rectangle here')
    if (!base) return error('Place the first corner first')
    const l = Math.abs(Number(m[1]))
    const w = Math.abs(Number(m[2]))
    if (!(l > 0) || !(w > 0)) return error('A rectangle needs a length and a width')
    const cur = c.cursor ?? { x: base.x + 1, y: base.y + 1 }
    const sx = cur.x < base.x ? -1 : 1
    const sy = cur.y < base.y ? -1 : 1
    const ps = [base, { x: base.x + sx * l, y: base.y }, { x: base.x + sx * l, y: base.y + sy * w }, { x: base.x, y: base.y + sy * w }]
    return { kind: 'rectangle', polygon: signedArea(ps) < 0 ? ps.reverse() : ps }
  }
  m = ONE.exec(t)
  if (m) {
    if (c.angleOnly) return { kind: 'angle', degrees: Number(m[1]) }
    if (!base) return error('The first point takes x,y')
    const d = Number(m[1])
    let dx = c.cursor ? c.cursor.x - base.x : 0
    let dy = c.cursor ? c.cursor.y - base.y : 0
    if (c.angle != null) {
      // on the fixed angle's line, on the cursor's side
      const [ux, uy] = towards(c.angle)
      const s = dx * ux + dy * uy < 0 ? -1 : 1
      return { kind: 'point', point: { x: base.x + ux * d * s, y: base.y + uy * d * s } }
    }
    const l = Math.hypot(dx, dy)
    if (l < 1e-9) {
      dx = 1 // no direction: towards +x
      dy = 0
    } else {
      dx /= l
      dy /= l
    }
    return { kind: 'point', point: { x: base.x + dx * d, y: base.y + dy * d } }
  }
  return error('Not understood')
}
