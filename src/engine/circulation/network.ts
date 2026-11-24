// The option's road network (Decision "Exterior circulation"; since ST.4 nothing of it is derived, Decision "Streets"):
// the roads the designer keeps (existing ones and the streets, drawn by hand or by Connect), read for
//   reached     the masses whose docks a truck gate reaches: a court served by a part of the network, through the
//               roads trucks take (not a street for cars alone), that a truck gate meets
//   nowhere     the gates no road meets
//   approaches  a court served from its side, or from its mouth a little way off: the ground between it and the
//               road, paved (no stalls)
// A court is served at its mouth (a road up to half the room for two stall rows past it), or from a side a road
// passes within the ring clearance (two dock walls sharing one court). Pure.
import type { Point, Polygon } from '../../model/schema.ts'
import type { StandardFigures } from './standards.ts'
import { distancePointSegment, pointInPolygon } from '../geom/polygon.ts'
import type { DerivedDock, DerivedGate, DerivedRoad } from '../types.ts'
import { segmentDistance } from './route.ts'

/** m: a point this close (plus half a road) is on it; a court's mouth this close (plus half a road) to a road is served. */
const JOIN = 0.5
const SERVE = 1

export interface NetworkInput {
  docks: DerivedDock[]
  gates: DerivedGate[]
  /** The roads the designer keeps: existing ones and the streets. */
  roads: DerivedRoad[]
  standards: StandardFigures
}

export interface Network {
  roads: DerivedRoad[]
  /** The masses whose docks a truck gate reaches. */
  reached: Set<string>
  /** The courts a truck gate reaches, each `massId:wall`. */
  courts: Set<string>
  /** The roads (their ids) of a part of the network a truck gate meets, along the roads trucks take. */
  trucked: Set<string>
  /** The gates no road meets. */
  nowhere: Set<string>
  /** The way into a court served from its side: the clearance between it and the road, paved. */
  approaches: Polygon[]
}

const segments = (r: DerivedRoad) => r.points.slice(1).map((b, i) => [r.points[i], b] as const)

/** The distance from a road's centreline to the segment a–b. */
const roadTo = (r: DerivedRoad, a: Point, b: Point) => Math.min(...segments(r).map(([p, q]) => segmentDistance(p, q, a, b)))

/** Is the point on this road (within half its width and a little)? */
const onRoad = (r: DerivedRoad, q: Point, slack = JOIN) => segments(r).some(([a, b]) => distancePointSegment(q, a, b) <= r.width / 2 + slack)

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
const boxOf = (r: DerivedRoad, pad: number): Box => ({
  minX: Math.min(...r.points.map((q) => q.x)) - pad,
  minY: Math.min(...r.points.map((q) => q.y)) - pad,
  maxX: Math.max(...r.points.map((q) => q.x)) + pad,
  maxY: Math.max(...r.points.map((q) => q.y)) + pad,
})
const touch = (a: Box, b: Box) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY

/** Two roads whose paving touches: a vehicle passes from one to the other. */
const joined = (r: DerivedRoad, o: DerivedRoad) => segments(r).some(([a, b]) => roadTo(o, a, b) <= (r.width + o.width) / 2)

/** The connected parts of these roads (union–find): each road's part, -1 for a road left out. */
function partsOf(roads: DerivedRoad[], open: (r: DerivedRoad) => boolean): number[] {
  const parent = roads.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const boxes = roads.map((r) => boxOf(r, r.width / 2))
  for (let i = 0; i < roads.length; i++)
    for (let j = 0; j < i; j++) {
      if (!open(roads[i]) || !open(roads[j]) || find(i) === find(j) || !touch(boxes[i], boxes[j])) continue
      if (joined(roads[i], roads[j])) parent[find(i)] = find(j)
    }
  return roads.map((r, i) => (open(r) ? find(i) : -1))
}

export function deriveNetwork(input: NetworkInput): Network {
  const { docks, gates, roads, standards: s } = input
  const reach = s.ringClear + SERVE
  const mouthReach = SERVE + s.roadWidth / 2 + s.stallDepth
  const atMouth = (d: DerivedDock, r: DerivedRoad) => roadTo(r, d.court[3], d.court[2]) <= r.width / 2 + mouthReach
  const sides = (d: DerivedDock) => [
    [d.court[0], d.court[3], -1],
    [d.court[1], d.court[2], 1],
  ] as const
  const atSide = (d: DerivedDock, r: DerivedRoad) => sides(d).some(([a, b]) => roadTo(r, a, b) <= r.width / 2 + reach)
  const meets = (g: DerivedGate) => roads.some((r) => roadTo(r, g.at, g.end) <= r.width / 2)
  const touchesGate = (r: DerivedRoad, g: DerivedGate) => onRoad(r, g.at) || roadTo(r, g.at, g.end) <= r.width / 2

  // who is reached: a court served by a road of a part a truck gate meets, along roads trucks take
  const truckRoad = (r: DerivedRoad) => r.vehicles !== 'cars'
  const part = partsOf(roads, truckRoad)
  const trucked = new Set(
    gates
      .filter((g) => g.vehicles !== 'cars' && g.flow !== 'out')
      .flatMap((g) => roads.flatMap((r, i) => (part[i] >= 0 && touchesGate(r, g) ? [part[i]] : []))),
  )
  const reached = new Set<string>()
  const courts = new Set<string>()
  for (const d of docks)
    if (roads.some((r, i) => part[i] >= 0 && trucked.has(part[i]) && (atMouth(d, r) || atSide(d, r)))) {
      reached.add(d.massId)
      courts.add(`${d.massId}:${d.wall}`)
    }
  const nowhere = new Set(gates.filter((g) => !meets(g) && !roads.some((r) => onRoad(r, g.at))).map((g) => g.id))

  // the approaches: from a court's mouth to the road that serves it there, a little way off; else from its sides to
  // the roads that pass them
  const approaches: Polygon[] = []
  for (const d of docks) {
    const [c, e] = [d.court[2], d.court[3]]
    const mouth = Math.min(...roads.filter((r) => atMouth(d, r)).map((r) => roadTo(r, e, c) - r.width / 2))
    if (Number.isFinite(mouth)) {
      if (mouth > SERVE / 2) {
        const o = { x: d.out.x * mouth, y: d.out.y * mouth }
        approaches.push([e, c, { x: c.x + o.x, y: c.y + o.y }, { x: e.x + o.x, y: e.y + o.y }])
      }
      continue
    }
    const along = { x: d.b.x - d.a.x, y: d.b.y - d.a.y }
    const l = Math.hypot(along.x, along.y) || 1
    for (const [a, b, sign] of sides(d)) {
      const gap = Math.min(...roads.map((r) => roadTo(r, a, b) - r.width / 2))
      if (gap > reach || gap <= 0) continue
      const o = { x: (along.x / l) * gap * sign, y: (along.y / l) * gap * sign }
      approaches.push([a, b, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }])
    }
  }
  const ways = new Set(roads.flatMap((r, i) => (part[i] >= 0 && trucked.has(part[i]) ? [r.id] : [])))
  return { roads, reached, courts, trucked: ways, nowhere, approaches }
}

/** Is q inside one of the courts? (A road may end in a court: it is no dead end.) */
export const inCourt = (q: Point, docks: DerivedDock[]) => docks.some((d) => pointInPolygon(q, d.court))
