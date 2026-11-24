// The sides of a host a gate can stand on (Phase PE.2, Decision "On edge engine"): a street's (every segment of the chain a person picks, two sides
// each), an existing street's (two a stretch) or the boundary's (one a side). Pure: the On edge engine's adapters (`state/actions/gateEdges.ts`),
// `followGates` and the audit read them through this.
import type { Gate, GateOn, Id, Point, Polygon } from '../../model/schema.ts'
import { boundarySides, gateRange, nearestSide, onOf, roadSides, segmentSides, type GateHostKind, type GateSide } from './gateGeometry.ts'
import type { GateHosts } from './gates.ts'
import { streetChains } from './streets.ts'

/** The segments of the street `id` names (`street:<segment>` or a segment's id): its chain's, in order; none when it is not there. */
export function streetSegments(streets: GateHosts['streets'], id: Id): Id[] {
  if (!streets) return []
  const seg = id.startsWith('street:') ? id.slice('street:'.length) : id
  return streetChains(streets).find((c) => c.segs.includes(seg))?.segs ?? []
}

/** The sides of one host: a street (its chain's segments), an existing street, the boundary; none for a host that is not there. */
export function gateSides(host: { kind: string; id: Id }, hosts: GateHosts, boundary?: Polygon | null): GateSide[] {
  if (host.kind === 'street') {
    const ids = streetSegments(hosts.streets, host.id)
    return ids.flatMap((id) => {
      const seg = hosts.streets!.segments.find((g) => g.id === id)
      return seg ? segmentSides(hosts.streets, seg) : []
    })
  }
  if (host.kind === 'existing-road') {
    const road = hosts.existingRoads?.find((r) => r.id === host.id)
    return road ? roadSides(road) : []
  }
  if (host.kind === 'boundary') return boundarySides(boundary)
  return []
}

/** Every side of every host of a kind: where a gate moved across the site may land. */
export function allGateSides(kind: GateHostKind, hosts: GateHosts, boundary?: Polygon | null): GateSide[] {
  if (kind === 'street') return (hosts.streets?.segments ?? []).flatMap((seg) => segmentSides(hosts.streets, seg))
  if (kind === 'existing-road') return (hosts.existingRoads ?? []).flatMap(roadSides)
  return boundarySides(boundary)
}

/** m: a gate moved or copied by Transform lands on a side of its kind of host only within this of where the move puts it (plan Decision 17). */
export const REHOME_REACH = 5

/**
 * Where a gate with `on` goes when Transform puts it at `to` (a point): the nearest point of any side of its kind of host (a street's or an existing
 * street's), half its width in from the ends, within `REHOME_REACH`; null when there is none (the gate stays, a copy is not made).
 */
export function gateHomeNear(g: Pick<Gate, 'on' | 'width'>, hosts: GateHosts, to: Point, reach = REHOME_REACH): GateOn | null {
  if (!g.on) return null
  const near = nearestSide(to, allGateSides(g.on.kind, hosts), (s) => gateRange(s, g.width))
  return near && near.distance <= reach ? onOf(near.side, near.along) : null
}
