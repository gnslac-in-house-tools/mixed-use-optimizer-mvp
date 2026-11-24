// For the tests (ST.3): a road drawn by hand as the old `addRoad` made one, now a street (Decision "Streets"): of the
// type its vehicles take, at the standards' road width and for trucks and cars unless told; its id the first segment's,
// its derived road `street:<id>`.
import type { Id, Point, Project, Vehicles } from '../../model/schema.ts'
import { standardsOf } from '../../engine/circulation/standards.ts'
import { streetTypesOf, typeForVehicles } from '../../engine/circulation/streets.ts'
import { drawStreet } from '../actions/streets.ts'

export function addRoad(p: Project, optionId: Id, points: Point[], init: { width?: number; vehicles?: Vehicles } = {}): { project: Project; id: Id } | null {
  const vehicles = init.vehicles ?? 'all'
  const type = typeForVehicles(streetTypesOf(p, p.options.find((o) => o.id === optionId)), vehicles).id
  const r = drawStreet(p, optionId, points, type, init.width ?? standardsOf(p).roadWidth, vehicles)
  return r && { project: r.project, id: r.segments[0] }
}
