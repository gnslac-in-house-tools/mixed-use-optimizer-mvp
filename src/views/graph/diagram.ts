// The abstract graph's layout and lines (Decisions "Graph mode", "Steps"): where each bubble goes and how a line is
// drawn. Pure and deterministic, so the same graph always looks the same; the diagram's positions are a view, never
// the masses'.
//   layout  in the room the diagram has, in screen pixels (so its text needs no shrinking): a force layout in a few
//           hundred quiet steps. Each bubble is a box with its name under it; two boxes never overlap (they are
//           pushed apart along the side they overlap least) and keep a little apart; every line pulls its ends to a
//           rest length that says its kind (adjacent and moves with: close; near: further; apart: far); all of them
//           drift a little towards the middle and stay inside the room. It starts from `seed` (programs round a
//           circle), fitted into the room; a pinned bubble stays put. More than fits the room overflows it: the
//           diagram then shows it all, smaller (Diagram.tsx).
//   lines   curved (a gentle arc; two lines between the same bubbles bow to either side), straight or orthogonal
//           (across, then down, then across), from rim to rim
//   labels  a line's label sits at its middle, or, when that covers a bubble or a name, at the nearest free place
//           along the line (labelSpot)
import type { Point, RuleKind } from '../../model/schema.ts'
import type { LineStyle } from './graphState.ts'

export interface DiagramNode {
  id: string
  /** Its radius, px. */
  r: number
  seed: Point
  /** Its name's width under it, px: the layout keeps names apart too. */
  label?: number
}

export interface DiagramEdge {
  a: string
  b: string
  kind: RuleKind
}

/** The room the diagram has, px. */
export interface Room {
  w: number
  h: number
}

/** The gap between two rims a line of each kind rests at, px: room for the names under the bubbles and the line's label. */
const REST: Record<RuleKind, number> = { adjacent: 90, attached: 80, near: 150, apart: 240 }
const STEPS = 300
/** Under a bubble: its name and the line under it, px. */
export const NAME_H = 34
const GAP = 20 // px between two bubbles' boxes
const MARGIN = 24 // px from the room's edges

const len = (v: Point) => Math.hypot(v.x, v.y)

/** A bubble's box at p: the circle and its name under it, half a gap all round. */
export function bubbleBox(n: Pick<DiagramNode, 'r' | 'label'>, p: Point, gap = GAP): Box {
  const hw = Math.max(n.r, (n.label ?? 0) / 2) + gap / 2
  return { x0: p.x - hw, y0: p.y - n.r - gap / 2, x1: p.x + hw, y1: p.y + n.r + NAME_H + gap / 2 }
}

export function layoutDiagram(nodes: DiagramNode[], edges: DiagramEdge[], pinned: Record<string, Point> = {}, room: Room = { w: 800, h: 480 }): Map<string, Point> {
  if (nodes.length === 0) return new Map()
  const radius = new Map(nodes.map((n) => [n.id, n.r]))
  const centre = { x: room.w / 2, y: room.h / 2 }
  // the seeds fitted into the room, centred
  const xs = nodes.map((n) => n.seed.x)
  const ys = nodes.map((n) => n.seed.y)
  const sx = Math.max(Math.max(...xs) - Math.min(...xs), 1)
  const sy = Math.max(Math.max(...ys) - Math.min(...ys), 1)
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2
  const my = (Math.max(...ys) + Math.min(...ys)) / 2
  const kx = Math.max(room.w - 2 * MARGIN - 120, 40) / sx
  const ky = Math.max(room.h - 2 * MARGIN - 80, 40) / sy
  const at = new Map(
    nodes.map((n) => [n.id, pinned[n.id] ? { ...pinned[n.id] } : { x: centre.x + (n.seed.x - mx) * kx, y: centre.y + (n.seed.y - my) * ky }]),
  )
  const links = edges.filter((e) => e.a !== e.b && at.has(e.a) && at.has(e.b))
  for (let step = 0; step < STEPS; step++) {
    const heat = 24 * (1 - step / STEPS) + 0.5 // how far a bubble may move in this step
    const force = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]))
    const push = (id: string, v: Point) => {
      const f = force.get(id)!
      f.x += v.x
      f.y += v.y
    }
    // boxes: never overlapping (apart along the side they overlap least), a little apart beyond
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const pa = at.get(a.id)!
        const pb = at.get(b.id)!
        const ba = bubbleBox(a, pa)
        const bb = bubbleBox(b, pb)
        const ox = Math.min(ba.x1, bb.x1) - Math.max(ba.x0, bb.x0)
        const oy = Math.min(ba.y1, bb.y1) - Math.max(ba.y0, bb.y0)
        // two on the same spot: apart along a fixed direction, by their order
        const dx = pb.x - pa.x || Math.cos(i + j)
        const dy = pb.y - pa.y || Math.sin(i + j)
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const k = (ox / 2) * Math.sign(dx)
            push(a.id, { x: -k, y: 0 })
            push(b.id, { x: k, y: 0 })
          } else {
            const k = (oy / 2) * Math.sign(dy)
            push(a.id, { x: 0, y: -k })
            push(b.id, { x: 0, y: k })
          }
          continue
        }
        const d = Math.max(Math.hypot(dx, dy), 1)
        const k = 2000 / (d * d)
        push(a.id, { x: (-dx / d) * k, y: (-dy / d) * k })
        push(b.id, { x: (dx / d) * k, y: (dy / d) * k })
      }
    // the lines: each pulls (or pushes) its ends to its rest length
    for (const e of links) {
      const pa = at.get(e.a)!
      const pb = at.get(e.b)!
      const d = { x: pb.x - pa.x, y: pb.y - pa.y }
      const l = Math.max(len(d), 1e-6)
      const rest = radius.get(e.a)! + radius.get(e.b)! + REST[e.kind]
      const k = (l - rest) * 0.08
      push(e.a, { x: (d.x / l) * k, y: (d.y / l) * k })
      push(e.b, { x: (-d.x / l) * k, y: (-d.y / l) * k })
    }
    for (const n of nodes) {
      const p = at.get(n.id)!
      // a little towards the middle, so loose bubbles do not drift away
      push(n.id, { x: (centre.x - p.x) * 0.01, y: (centre.y - p.y) * 0.01 })
      // inside the room
      const b = bubbleBox(n, p, 0)
      const left = MARGIN - b.x0
      const right = b.x1 - (room.w - MARGIN)
      const top = MARGIN - b.y0
      const bottom = b.y1 - (room.h - MARGIN)
      push(n.id, { x: (left > 0 ? left : 0) - (right > 0 ? right : 0), y: (top > 0 ? top : 0) - (bottom > 0 ? bottom : 0) })
    }
    for (const n of nodes) {
      if (pinned[n.id]) continue
      const f = force.get(n.id)!
      const l = len(f)
      if (l < 1e-9) continue
      const k = Math.min(l, heat) / l
      const p = at.get(n.id)!
      p.x += f.x * k
      p.y += f.y * k
    }
  }
  for (const p of at.values()) {
    p.x = Math.round(p.x * 10) / 10
    p.y = Math.round(p.y * 10) / 10
  }
  return at
}

/** A box in the diagram's units: what a label must not cover (a bubble, a name, another label). */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const overlaps = (p: Box, q: Box) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1

/**
 * Where a w × h label goes along a line (`at`: its point at t, 0 → 1): the middle, or the nearest place towards
 * either end that covers none of `taken`; the middle when none is free.
 */
export function labelSpot(at: (t: number) => Point, w: number, h: number, taken: Box[]): Point {
  for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
    const p = at(t)
    const box = { x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 }
    if (!taken.some((q) => overlaps(box, q))) return p
  }
  return at(0.5)
}

/**
 * A line from bubble a (rim ra) to bubble b (rim rb): its SVG path, the point at its middle (for the label) and its
 * point at any t (0 at a's rim, 1 at b's). `bend`: which of several lines between the same two bubbles this is (0, 1,
 * −1, 2…): they bow apart.
 */
export function edgePath(a: Point, b: Point, ra: number, rb: number, style: LineStyle, bend = 0): { d: string; mid: Point; at(t: number): Point } {
  const d = { x: b.x - a.x, y: b.y - a.y }
  const l = Math.max(len(d), 1e-6)
  const u = { x: d.x / l, y: d.y / l }
  const n = { x: -u.y, y: u.x }
  const f = (v: number) => Math.round(v * 10) / 10
  if (style === 'orthogonal') {
    // across, then down, then across: out of the side of each bubble that faces the other
    const sx = Math.sign(d.x) || 1
    const s = { x: a.x + sx * ra, y: a.y + bend * 8 }
    const e = { x: b.x - sx * rb, y: b.y + bend * 8 }
    const mx = (s.x + e.x) / 2
    // along the three legs, by length
    const legs = [Math.abs(mx - s.x), Math.abs(e.y - s.y), Math.abs(e.x - mx)]
    const total = Math.max(legs[0] + legs[1] + legs[2], 1e-6)
    const at = (t: number): Point => {
      let k = t * total
      if (k <= legs[0]) return { x: s.x + Math.sign(mx - s.x) * k, y: s.y }
      k -= legs[0]
      if (k <= legs[1]) return { x: mx, y: s.y + Math.sign(e.y - s.y) * k }
      k -= legs[1]
      return { x: mx + Math.sign(e.x - mx) * k, y: e.y }
    }
    return { d: `M${f(s.x)} ${f(s.y)}H${f(mx)}V${f(e.y)}H${f(e.x)}`, mid: { x: mx, y: (s.y + e.y) / 2 }, at }
  }
  const bow = style === 'curved' ? l * 0.16 + Math.abs(bend) * 18 : Math.abs(bend) * 14
  const side = bend < 0 ? -1 : 1
  const c = { x: (a.x + b.x) / 2 + n.x * bow * side, y: (a.y + b.y) / 2 + n.y * bow * side }
  // from rim to rim, towards the control point
  const toward = (p: Point, q: Point, r: number) => {
    const v = { x: q.x - p.x, y: q.y - p.y }
    const k = r / Math.max(len(v), 1e-6)
    return { x: p.x + v.x * k, y: p.y + v.y * k }
  }
  const s = toward(a, c, ra)
  const e = toward(b, c, rb)
  if (bow === 0) {
    const at = (t: number): Point => ({ x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t })
    return { d: `M${f(s.x)} ${f(s.y)}L${f(e.x)} ${f(e.y)}`, mid: at(0.5), at }
  }
  const at = (t: number): Point => ({
    x: (1 - t) * (1 - t) * s.x + 2 * (1 - t) * t * c.x + t * t * e.x,
    y: (1 - t) * (1 - t) * s.y + 2 * (1 - t) * t * c.y + t * t * e.y,
  })
  return { d: `M${f(s.x)} ${f(s.y)}Q${f(c.x)} ${f(c.y)} ${f(e.x)} ${f(e.y)}`, mid: at(0.5), at }
}

/** Which of the lines between the same two bubbles each one is: 0, 1, −1, 2, −2… in order. */
export function bends<T extends { a: string; b: string }>(edges: T[]): number[] {
  const seen = new Map<string, number>()
  return edges.map((e) => {
    const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`
    const k = seen.get(key) ?? 0
    seen.set(key, k + 1)
    return k === 0 ? 0 : k % 2 === 1 ? (k + 1) / 2 : -k / 2
  })
}

/** How a line of each kind looks: its width and dashes (the legend draws the same). */
export const LINE_LOOK: Record<RuleKind, { width: number; dash?: string; label: string }> = {
  adjacent: { width: 5, label: 'adjacent: share a wall' },
  near: { width: 2, label: 'near: within a distance' },
  apart: { width: 2, dash: '10 6', label: 'apart: at least a distance' },
  attached: { width: 2.5, dash: '1 6', label: 'moves with: follows it' },
}
