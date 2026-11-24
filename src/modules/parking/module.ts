// The parking module (Decision "Circulation demand"): the stalls along the roads and what the programs ask; for the
// optimizer, the side the stalls go on (params.ts). Present when a program asks for stalls, or when the site has a
// boundary (no boundary, no stalls) and an option has roads to park along whose parking draws some. Roads are the
// engine's (`hasRoads`, engine/circulation/streets.ts): the option's gates (its own or the site's) or streets. The
// side is the engine's own question (`roadSides`: a street segment's own, else the option's, else the standards'; a
// new industrial project's: none, Decision "Street parking by side").
import { hasRoads } from '../../engine/circulation/streets.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { PARKING_KPIS } from './kpis.ts'
import type { DesignOption, ParkingSide, Project } from '../../model/schema.ts'
import type { Module } from '../types.ts'
import { PARKING_PARAMS } from './params.ts'

const draws = (side: ParkingSide) => side === 'single' || side === 'double'

/** Stalls go along them: by the option's side, else the standards', or along a street segment of its own side. */
const drawsStalls = (p: Project, o: DesignOption) =>
  hasRoads(p, o) && (draws(o.parking ?? standardsOf(p, o).parking) || (o.streets?.segments.some((s) => s.parking && s.parking !== 'none') ?? false))

export const parking: Module = {
  id: 'parking',
  label: 'Parking',
  present: (p) =>
    p.programs.some((g) => g.demand?.carStalls || g.demand?.trailerStalls) ||
    p.options.some((o) => (o.lots?.length ?? 0) > 0) ||
    (!!p.site.boundary && p.options.some((o) => drawsStalls(p, o))),
  kpis: () => PARKING_KPIS,
  measures: [],
  params: PARKING_PARAMS,
}
