// A gate's arrow on the plan (port of Plaza-Practiko `vistas/planta/flechaAcceso.ts`): its body from the street to
// the end of its lane and a head where traffic goes: in, out, or both. Drawn coordinates (y down).
import type { GateFlow, Point } from '../../../model/schema.ts'

/** The arrow's path from `from` (the street) to `to` (inside); `head` is the head's length, in m. */
export function arrowPath(from: Point, to: Point, flow: GateFlow, head: number): string {
  const l = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const u = { x: (to.x - from.x) / l, y: (to.y - from.y) / l }
  const tip = Math.min(head, l / 3)
  // a head at q, open backwards as s says (1: it points inside; −1: to the street)
  const at = (q: Point, s: number) => {
    const wing = (k: number) => ({ x: q.x - s * u.x * tip - u.y * k * tip * 0.6, y: q.y - s * u.y * tip + u.x * k * tip * 0.6 })
    const [w1, w2] = [wing(1), wing(-1)]
    return `M${w1.x} ${-w1.y}L${q.x} ${-q.y}L${w2.x} ${-w2.y}`
  }
  const body = `M${from.x} ${-from.y}L${to.x} ${-to.y}`
  if (flow === 'out') return `${body}${at(from, -1)}`
  if (flow === 'both') return `${body}${at(to, 1)}${at(from, -1)}`
  return `${body}${at(to, 1)}`
}
