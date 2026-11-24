// Whose gates an option uses (Decision "Exterior circulation"): the site's, unless the option has its own copy (the
// client may change their mind per option). Pure: the verbs, the engine and the views ask the same question.
import type { DesignOption, ExistingRoad, Gate, Id, Point, Polygon, Project, Streets } from '../../model/schema.ts'
import { distancePointSegment, signedArea } from '../geom/polygon.ts'
import { directionAt, pointAt, vertexTs } from '../geom/perimeter.ts'
import { boundarySides, pointOn, roadSides, segmentSides, sideOfGate, type GateSide } from './gateGeometry.ts'

/** m: the slots a gate's side is divided in on the On edge engine (Phase PE.2, plan Decision 15). */
export const GATE_SLOT = 0.5

/** What a gate on a street can stand on: the option's streets and the site's existing streets. */
export interface GateHosts {
  streets?: Streets
  existingRoads?: ExistingRoad[]
}

/** The sides a gate's host has (its own; the boundary's when it has `t`): where it can stand. */
function sidesFor(g: Pick<Gate, 't' | 'on'>, boundary: Polygon | null, hosts: GateHosts): GateSide[] {
  if (!g.on) return boundarySides(boundary)
  if (g.on.kind === 'street') {
    const seg = hosts.streets?.segments.find((x) => x.id === g.on!.id)
    return seg ? segmentSides(hosts.streets, seg) : []
  }
  const road = hosts.existingRoads?.find((x) => x.id === g.on!.id)
  return road ? roadSides(road) : []
}

/** The side a gate stands on and how far along it (m from the side's start); null when its host is not there. */
export function gateSideOf(g: Pick<Gate, 't' | 'on'>, boundary: Polygon | null, hosts: GateHosts): { side: GateSide; along: number } | null {
  return sideOfGate(g, sidesFor(g, boundary, hosts))
}

/**
 * Where a gate's opening is (Phase PE.2): its middle `at` on its host's side, `dir` along the side and `inward` the way its lane runs (into the site
 * from the boundary; away from a street's paving). Null when its host is not there (a street edited away, a boundary of under 3 corners).
 */
export function gatePlace(g: Pick<Gate, 't' | 'on'>, boundary: Polygon | null, hosts: GateHosts): { at: Point; dir: Point; inward: Point } | null {
  if (!g.on) {
    // the boundary's, as it has always been measured: the perimeter's own point and direction, the lane into the outline
    if (g.t === undefined || !boundary || boundary.length < 3) return null
    const dir = directionAt(boundary, g.t)
    const turn = signedArea(boundary) >= 0 ? 1 : -1
    return { at: pointAt(boundary, g.t), dir, inward: { x: -dir.y * turn, y: dir.x * turn } }
  }
  const r = gateSideOf(g, boundary, hosts)
  return r && { at: pointOn(r.side, r.along), dir: r.side.dir, inward: r.side.lane }
}

const optionById = (p: Project, optionId: Id | null | undefined): DesignOption | undefined => p.options.find((o) => o.id === optionId)

/** Does the option use gates of its own? */
export const ownsGates = (p: Project, optionId: Id | null | undefined): boolean => optionById(p, optionId)?.gates !== undefined

/** The gates the option uses: its own, else the site's. */
export function gatesOf(p: Project, optionId: Id | null | undefined): Gate[] {
  return optionById(p, optionId)?.gates ?? p.site.gates ?? []
}

/**
 * Where a gate goes when none is aimed (+ Gate; Phase PE.2, plan Decision 19): the t of the middle of the boundary side
 * nearest an existing street (its drawn line, the side's middle to the line), else of the longest side. Null for a boundary of under 3 corners.
 */
export function gateSideMiddle(boundary: Polygon | null, streets: Point[][]): number | null {
  if (!boundary || boundary.length < 3) return null
  const n = boundary.length
  const ts = vertexTs(boundary)
  const sides = boundary.map((a, i) => {
    const b = boundary[(i + 1) % n]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const away = streets.flatMap((line) => line.slice(1).map((q, k) => distancePointSegment(mid, line[k], q)))
    return { t: (ts[i] + (i === n - 1 ? 1 : ts[i + 1])) / 2, length: Math.hypot(b.x - a.x, b.y - a.y), away: away.length ? Math.min(...away) : Infinity }
  })
  const near = sides.some((x) => x.away < Infinity)
  const best = sides.reduce((a, x) => (near ? (x.away < a.away ? x : a) : x.length > a.length ? x : a))
  return best.t % 1
}
