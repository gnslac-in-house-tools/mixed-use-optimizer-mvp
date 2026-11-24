// Where paths meet (Decision "Streets"): the pure geometry of paths that touch, lifted out of the circulation (Phase PE.1).
//   joinEnds     two run ends at one node, drawn by different sides or widths: their centre lines carried to where they
//                cross, or run on past the node, so their pavings meet whole
//   joinedPaving the one paving of several roads: every strip, the ends that stop short run on, the outer corners where
//                roads end at one node closed, the streets and areas unioned, slivers of holes left out
import type { Point, Polygon } from '../../model/schema.ts'
import { unionPieces, type Region } from '../geom/boolean.ts'
import { area, distancePointSegment, cross, pointInPolygon } from '../geom/polygon.ts'
import { stripOutlines } from './strip.ts'

/** A road as the paving needs it: its centreline, its width, its turning radius (a street's). */
export interface PavingRoad {
  points: Point[]
  width: number
  radius?: number
}

/** m: how close a road's end must come to a street's paving (beyond its half width) to meet it. */
export const TOUCH = 0.5
/** m²: a hole of the paving smaller than this is a sliver between two road ends, no hole. */
export const SLIVER = 1

/** The polyline's segment nearest q: its index and how far q is from it. */
export function nearestSegment(q: Point, line: Point[]): { k: number; distance: number } {
  let best = { k: 0, distance: Infinity }
  for (let k = 0; k + 1 < line.length; k++) {
    const distance = distancePointSegment(q, line[k], line[k + 1])
    if (distance < best.distance) best = { k, distance }
  }
  return best
}

/** The shortest distance from q to the polyline. */
const toLine = (q: Point, line: Point[]): number => nearestSegment(q, line).distance

/** rad: a bend between two roads' ends sharper than this is bevelled: its mitre would pass twice the half width (offset's rule). */
const MITRE = (2 * Math.PI) / 3

/** A road's end: where it is, the way the road runs away from it, its half width. */
export interface End {
  at: Point
  away: Point
  half: number
}

/** A road's two ends, each with the direction of its last segment (its strip ends square to it). */
export function endsOf(r: PavingRoad): End[] {
  const q = r.points
  const end = (i: number, step: 1 | -1): End[] => {
    for (let k = i + step; k >= 0 && k < q.length; k += step) {
      const l = Math.hypot(q[k].x - q[i].x, q[k].y - q[i].y)
      if (l > 1e-6) return [{ at: q[i], away: { x: (q[k].x - q[i].x) / l, y: (q[k].y - q[i].y) / l }, half: r.width / 2 }]
    }
    return []
  }
  return r.width > 0 && q.length >= 2 ? [...end(0, 1), ...end(q.length - 1, -1)] : []
}

/**
 * What closes the outer corner where road p's end meets road q's: each strip ends square, so a bend between two roads
 * leaves a notch on its outer side. p's outer edge runs on to the mitre point and q's back to it, each at its own half
 * width; past MITRE, or where a step in width puts the mitre behind an end, a bevel between the two edges' ends. None
 * where they run straight on.
 */
function closing(p: End, q: End): Polygon | null {
  const uin = { x: -p.away.x, y: -p.away.y }
  const uout = q.away
  const sin = cross(uin, uout)
  const turn = Math.atan2(sin, uin.x * uout.x + uin.y * uout.y)
  if (Math.abs(turn) < 1e-6) return null
  // the outer side: right of a left turn, left of a right turn
  const s = turn > 0 ? -1 : 1
  const a = { x: p.at.x - uin.y * s * p.half, y: p.at.y + uin.x * s * p.half }
  const b = { x: q.at.x - uout.y * s * q.half, y: q.at.y + uout.x * s * q.half }
  const tail = Math.hypot(q.at.x - p.at.x, q.at.y - p.at.y) > 1e-9 ? [q.at] : []
  if (Math.abs(turn) <= MITRE) {
    const t = cross({ x: b.x - a.x, y: b.y - a.y }, uout) / sin
    const m = { x: a.x + uin.x * t, y: a.y + uin.y * t }
    const back = (m.x - b.x) * uout.x + (m.y - b.y) * uout.y
    if (t >= -1e-9 && back <= 1e-9) return [p.at, a, m, b, ...tail]
  }
  return [p.at, a, b, ...tail]
}

/** A road at a node: the way it runs away from it, and its end there (null: it passes through). */
interface Arm {
  angle: number
  end: End | null
}

/**
 * The closings where roads end at one node (their ends within TOUCH): round the node, the open side, a gap of more
 * than 180° between two roads, is where the square ends leave a notch, closed between the two roads on either side of
 * it. Only there: a closing between two roads with a third between them would stand past the third's edge. A road
 * that passes through the node counts as two roads that close nothing (its strip runs on through it).
 */
function endJoints(roads: PavingRoad[]): Polygon[] {
  const nodes: { at: Point; roads: Set<number>; arms: Arm[] }[] = []
  roads.forEach((r, k) =>
    endsOf(r).forEach((end) => {
      const arm = { angle: Math.atan2(end.away.y, end.away.x), end }
      const node = nodes.find((n) => Math.hypot(n.at.x - end.at.x, n.at.y - end.at.y) <= TOUCH)
      if (node) {
        node.arms.push(arm)
        node.roads.add(k)
      } else nodes.push({ at: end.at, roads: new Set([k]), arms: [arm] })
    }),
  )
  const out: Polygon[] = []
  for (const node of nodes) {
    if (node.arms.length < 2) continue
    roads.forEach((r, k) => {
      if (node.roads.has(k)) return
      for (let i = 0; i + 1 < r.points.length; i++) {
        const [a, b] = [r.points[i], r.points[i + 1]]
        if (Math.hypot(b.x - a.x, b.y - a.y) <= 1e-6 || distancePointSegment(node.at, a, b) > TOUCH) continue
        const angle = Math.atan2(b.y - a.y, b.x - a.x)
        node.arms.push({ angle, end: null }, { angle: angle > 0 ? angle - Math.PI : angle + Math.PI, end: null })
      }
    })
    const arms = node.arms.sort((x, y) => x.angle - y.angle)
    arms.forEach((p, i) => {
      const q = arms[(i + 1) % arms.length]
      const gap = i + 1 < arms.length ? q.angle - p.angle : q.angle + 2 * Math.PI - p.angle
      const c = p.end && q.end && gap > Math.PI + 1e-9 ? closing(p.end, q.end) : null
      if (c) out.push(c)
    })
  }
  return out
}

/**
 * The roads, each end that stops short of another's paving run on by TOUCH along its last segment: junctionsOf counts
 * an end up to TOUCH off another road's edge (b) as meeting it, so the union must join them too. Only an end on no
 * paving yet: one on another road already (a node, a T) would poke past it.
 */
function reaching(roads: PavingRoad[]): PavingRoad[] {
  const onPaving = (q: Point, i: number) => roads.some((o, j) => j !== i && o.points.length >= 2 && toLine(q, o.points) <= o.width / 2)
  const short = (q: Point, i: number) => roads.some((o, j) => j !== i && o.points.length >= 2 && toLine(q, o.points) <= o.width / 2 + TOUCH)
  return roads.map((r, i) => {
    let points = r.points
    // endsOf gives both ends or none: the first, then the last
    endsOf(r).forEach((e, k) => {
      if (!short(e.at, i) || onPaving(e.at, i)) return
      if (points === r.points) points = [...r.points]
      points[k === 0 ? 0 : points.length - 1] = { x: e.at.x - e.away.x * TOUCH, y: e.at.y - e.away.y * TOUCH }
    })
    return points === r.points ? r : { ...r, points }
  })
}

/**
 * The paving of `roads` with `also` (the courts and approaches), as [outer, ...holes]
 * regions: every road's strip (`stripOutlines`; an end short of another's paving run on to it), the outer corners
 * where roads end at one node closed, the areas unioned (a court inside a street must not cut a hole in
 * it), a hole under 1 m² (a sliver where two road ends nearly meet) dropped.
 */
export function joinedPaving(roads: PavingRoad[], also: { areas?: Polygon[] } = {}): Region[] {
  const pieces = [...reaching(roads).flatMap((r) => stripOutlines(r.points, r.width)), ...endJoints(roads), ...(also.areas ?? [])]
  if (pieces.length === 0) return []
  return unionPieces(pieces).map(([outer, ...holes]) => [outer, ...holes.filter((h) => area(h) >= SLIVER)])
}

/** A run of paths about to be joined: its drawn line, its centre line, the paving each side of the drawn line, and the node each end is at (null: at none). */
export interface JoinRun {
  drawn: Point[]
  line: Point[]
  left: number
  right: number
  ends: [string | null, string | null]
}

type Hand = 'left' | 'right' | 'centre'
/** The hand a run is drawn by, walking it: its drawn line its left edge (no paving on its left), its right edge, or neither. */
const handOf = (r: JoinRun): Hand => (r.left === 0 ? 'left' : r.right === 0 ? 'right' : 'centre')
const flip = (h: Hand, forward: boolean): Hand => (forward || h === 'centre' ? h : h === 'left' ? 'right' : 'left')

/**
 * Where two runs meet at a node only they share (two run ends with one key), drawn by different sides or widths
 * (Decision "Street side when drawing"), their centre lines' ends lie apart and their pavings would meet at a point or
 * leave a notch. At a real corner each end goes on (or back) to where the two centre lines cross: within the wider
 * one's width of the node, and with neither end's paving carried over the far side of the other's drawn edge (where
 * the mass it was drawn along is). Otherwise ends drawn by one side stay as they are (flush: their drawn edge shared);
 * a switch of side, in line or nearly, runs on half its width past the node, so the pavings overlap across it: only
 * the ends that stay off the other's far side, or both when neither does. Ends already together stay.
 * Returns each run's new centre line (the same array where nothing moved).
 */
export function joinEnds(runs: JoinRun[]): Point[][] {
  const lines = runs.map((r) => r.line)
  const width = (r: JoinRun) => r.left + r.right
  const at = new Map<string, { run: number; end: 0 | 1 }[]>()
  runs.forEach((r, k) =>
    r.ends.forEach((key, e) => {
      if (key !== null) at.set(key, [...(at.get(key) ?? []), { run: k, end: e as 0 | 1 }])
    }),
  )
  const idx = (k: number, end: 0 | 1) => (end === 0 ? 0 : lines[k].length - 1)
  const out = (k: number, i: number): Point | null => {
    const q = lines[k][i]
    const nb = lines[k][i === 0 ? 1 : i - 1]
    const l = Math.hypot(q.x - nb.x, q.y - nb.y)
    return l < 1e-9 ? null : { x: (q.x - nb.x) / l, y: (q.y - nb.y) / l }
  }
  /**
   * run k's end i carried to x keeps its new paving off the far side of o's drawn edge at N (the side o's paving is not
   * on, ahead of N along o): cut back, or o centred (no edge), it does.
   */
  const clean = (k: number, i: number, t: Point, x: Point, o: number, oEnd: 0 | 1): boolean => {
    const e = lines[k][i]
    if ((x.x - e.x) * t.x + (x.y - e.y) * t.y <= 1e-9 || handOf(runs[o]) === 'centre') return true
    const d = runs[o].drawn
    const N = oEnd === 0 ? d[0] : d[d.length - 1]
    const nb = oEnd === 0 ? d[1] : d[d.length - 2]
    const l = Math.hypot(nb.x - N.x, nb.y - N.y)
    if (l < 1e-9) return true
    const u = { x: (nb.x - N.x) / l, y: (nb.y - N.y) / l }
    const side = (q: Point) => u.x * (q.y - N.y) - u.y * (q.x - N.x)
    const paved = Math.sign(side(lines[o][idx(o, oEnd)]))
    const h = { x: (-t.y * width(runs[k])) / 2, y: (t.x * width(runs[k])) / 2 }
    const piece = [
      { x: e.x + h.x, y: e.y + h.y },
      { x: x.x + h.x, y: x.y + h.y },
      { x: x.x - h.x, y: x.y - h.y },
      { x: e.x - h.x, y: e.y - h.y },
    ]
    const far = clip(clip(piece, (q) => -side(q) * paved), (q) => (q.x - N.x) * u.x + (q.y - N.y) * u.y)
    return far.length < 3 || area(far) <= JOIN_TOL
  }
  const move = (k: number, i: number, to: Point) => {
    lines[k] = lines[k].map((q, n) => (n === i ? to : q))
  }
  for (const here of at.values()) {
    if (here.length !== 2 || here[0].run === here[1].run) continue
    const [{ run: k1, end: n1 }, { run: k2, end: n2 }] = here
    const r1 = runs[k1]
    const r2 = runs[k2]
    const i1 = idx(k1, n1)
    const i2 = idx(k2, n2)
    const e1 = lines[k1][i1]
    const e2 = lines[k2][i2]
    if (Math.hypot(e1.x - e2.x, e1.y - e2.y) < 1e-9) continue
    const t1 = out(k1, i1)
    const t2 = out(k2, i2)
    if (!t1 || !t2) continue
    const N = n1 === 0 ? r1.drawn[0] : r1.drawn[r1.drawn.length - 1]
    const nb1 = lines[k1][i1 === 0 ? 1 : i1 - 1]
    const nb2 = lines[k2][i2 === 0 ? 1 : i2 - 1]
    const det = t1.x * t2.y - t1.y * t2.x
    if (Math.abs(det) > 1e-6) {
      // e1 + s t1 = e2 + u t2
      const s = ((e2.x - e1.x) * t2.y - (e2.y - e1.y) * t2.x) / det
      const x = { x: e1.x + s * t1.x, y: e1.y + s * t1.y }
      // ahead of each one's corner before it, within a width of the node, each paving off the other's far side
      const ahead = (q: Point, t: Point) => (x.x - q.x) * t.x + (x.y - q.y) * t.y > 1e-6
      const near = Math.hypot(x.x - N.x, x.y - N.y) <= Math.max(width(r1), width(r2)) + 1e-9
      if (ahead(nb1, t1) && ahead(nb2, t2) && near && clean(k1, i1, t1, x, k2, n2) && clean(k2, i2, t2, x, k1, n1)) {
        move(k1, i1, x)
        move(k2, i2, x)
        continue
      }
    }
    // drawn by one side: flush, their drawn edge shared; doubling back: nothing to run on into. The hand read walking
    // into the node along r1 and out of it along r2
    if (flip(handOf(r1), n1 === 1) === flip(handOf(r2), n2 === 0) || t1.x * t2.x + t1.y * t2.y >= 0) continue
    // a switch of side in line (or nearly): on past the node, half a width each, the ends that stay clear (or both)
    const x1 = { x: e1.x + (t1.x * width(r1)) / 2, y: e1.y + (t1.y * width(r1)) / 2 }
    const x2 = { x: e2.x + (t2.x * width(r2)) / 2, y: e2.y + (t2.y * width(r2)) / 2 }
    const ok1 = clean(k1, i1, t1, x1, k2, n2)
    const ok2 = clean(k2, i2, t2, x2, k1, n1)
    if (ok1 || !ok2) move(k1, i1, x1)
    if (ok2 || !ok1) move(k2, i2, x2)
  }
  return lines
}

/** m²: a joined end's paving over the far side of the other's drawn edge by more than this is carried over it. */
const JOIN_TOL = 0.5

/** The part of a polygon where f ≥ 0 (f linear: a half-plane), Sutherland–Hodgman. */
function clip(poly: Point[], f: (q: Point) => number): Point[] {
  const kept: Point[] = []
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) kept.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      kept.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  })
  return kept
}


/** The first place the segment a → b leaves the polygons (t from a, 0..1), or null when it stays inside. */
function exitOf(a: Point, b: Point, polygons: Polygon[]): number | null {
  let best: number | null = null
  for (const poly of polygons)
    for (let i = 0; i < poly.length; i++) {
      const [c, d] = [poly[i], poly[(i + 1) % poly.length]]
      const r = { x: b.x - a.x, y: b.y - a.y }
      const s = { x: d.x - c.x, y: d.y - c.y }
      const den = cross(r, s)
      if (Math.abs(den) < 1e-12) continue
      const t = cross({ x: c.x - a.x, y: c.y - a.y }, s) / den
      const u = cross({ x: c.x - a.x, y: c.y - a.y }, r) / den
      if (t > 1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = Math.min(1, t)
    }
  return best
}

/**
 * Where each road's axis is drawn: a road whose end lies on another road's paving, along it (a T, a branch), has its axis
 * stopped at that paving's edge, so the axis of the road it meets runs through unbroken. Roads that end at each other's
 * ends (end to end) or pass through each other (a crossing) keep their whole axis. One list of open lines for each road,
 * in the order given (empty when the whole of it lies on another's paving).
 */
export function axesOf(roads: PavingRoad[]): Point[][][] {
  const strips = roads.map((r) => (r.width > 0 ? stripOutlines(r.points, r.width) : []))
  return roads.map((r, i) => {
    let line = r.points
    if (line.length < 2) return []
    for (const first of [true, false]) {
      if (line.length < 2) break
      const at = first ? line[0] : line[line.length - 1]
      // the road's own end on another road's paving, not on that road's end (an end-to-end join runs through)
      const over = roads.flatMap((o, j) => {
        if (j === i || o.points.length < 2 || o.width <= 0) return []
        const ends = [o.points[0], o.points[o.points.length - 1]]
        if (ends.some((e) => Math.hypot(e.x - at.x, e.y - at.y) <= TOUCH)) return []
        return strips[j].some((s) => s.length >= 3 && pointInPolygon(at, s)) ? [strips[j]] : []
      })
      if (over.length === 0) continue
      const polygons = over.flat()
      const walk = first ? [...line] : [...line].reverse()
      let cut: Point[] | null = null
      for (let k = 0; k + 1 < walk.length && !cut; k++) {
        const t = exitOf(walk[k], walk[k + 1], polygons)
        if (t !== null) cut = [{ x: walk[k].x + (walk[k + 1].x - walk[k].x) * t, y: walk[k].y + (walk[k + 1].y - walk[k].y) * t }, ...walk.slice(k + 1)]
      }
      line = cut ? (first ? cut : cut.reverse()) : []
    }
    return line.length >= 2 ? [line] : []
  })
}
