// Site → DerivedSite: the boundary as a polygon and the buildable area left after the setback. An existing road inside
// the parcel (Decision "Exterior circulation") is not buildable: the setback goes around it too.
import type { Site } from '../../model/schema.ts'
import { difference, offset, regionsArea } from '../geom/boolean.ts'
import { contourToPolygon } from '../geom/contour.ts'
import { area } from '../geom/polygon.ts'
import { existingRoads } from '../circulation/streets.ts'
import { LANE_WIDTH } from '../path/lanes.ts'
import { stripRegions } from '../path/strip.ts'
import type { DerivedSite } from '../types.ts'

export function deriveSite(site: Site, laneWidth: number = LANE_WIDTH): DerivedSite {
  if (!site.boundary) return { polygon: null, area: 0, buildable: [] }
  const polygon = contourToPolygon(site.boundary)
  // A negative offset shrinks the boundary inwards. It can split into several pieces (a narrow neck) or vanish.
  let buildable = site.rules.setback > 0 ? offset([polygon], -site.rules.setback) : [[polygon]]
  const roads = stripRegions(existingRoads(site, laneWidth).map((r) => ({ points: r.points, width: r.width })))
  if (roads.length) {
    const keepOff = site.rules.setback > 0 ? offset(roads.flat(), site.rules.setback) : roads
    buildable = difference(buildable.flat(), keepOff.flat())
  }
  return { polygon, area: area(polygon), buildable }
}

export function buildableArea(site: DerivedSite): number {
  return regionsArea(site.buildable)
}
