// A demo project to work with until the DXF import exists (phase 5). Example values only.
import type { Project } from '../model/schema.ts'
import { newProject } from '../typologies/index.ts'
import { perimeter, perimeterPath } from '../engine/geom/perimeter.ts'
import { contourFromPolygon, contourToPolygon } from '../engine/geom/contour.ts'
import { refitGrids } from '../engine/grid/index.ts'
import { derivedRoadsOf, derivedRoadsToStreets } from '../engine/circulation/legacy/toStreets.ts'
import { addExistingRoad, addGate, updateExistingRoad } from './actions/circulation.ts'
import { linkStreetEnds } from './actions/streets.ts'
import { addMass } from './actions/masses.ts'
import { setProgramTarget } from './actions/programs.ts'

/**
 * `streets` false: without them (the stress test draws them itself, as the migration does). `southStreet` false: without its south street, the
 * existing street along its boundary (the grid is fitted with it, as it is; a test that draws a street of its own on that side asks for it).
 */
export function demoProject({ streets = true, southStreet = true }: { streets?: boolean; southStreet?: boolean } = {}): Project {
  let p = newProject('industrial', 'Demo site')
  // stalls along both sides of its streets, as it had: a new project has none (Decision "Street parking by side")
  p.standards = { ...p.standards, parking: 'double' }
  // An irregular four-sided site, about 11 ha.
  p.site.boundary = contourFromPolygon([
    { x: 0, y: 0 },
    { x: 420, y: 0 },
    { x: 440, y: 240 },
    { x: 20, y: 280 },
  ])
  const rect = (cx: number, cy: number, width: number, depth: number) =>
    ({ kind: 'rect', center: { x: cx, y: cy }, width, depth, rotation: 0 }) as const
  p = addMass(p, { programId: 'warehouse', footprint: rect(120, 110, 160, 80) }).project
  // turned round: its front (where a warehouse docks, Decision "Docks turn with the building") faces north
  p = addMass(p, { programId: 'warehouse', footprint: { ...rect(320, 110, 140, 80), rotation: 180 } }).project
  p = addMass(p, { programId: 'office', footprint: rect(120, 200, 40, 20), height: 8 }).project
  // what the client asks (Decision "Brief"): two warehouses of 24,000 m², an office of 1,200 m², a guard house
  const target = (id: string, area: number, count: number) => setProgramTarget(p, id, { area, count })
  p = target('warehouse', 24000, 2)
  p = target('office', 1200, 1)
  p = target('guardhouse', 24, 1)
  // its access (Decision "Exterior circulation"): the south side faces a 15 m existing street from x 60 to 380 (outside the boundary); one gate
  // for trucks and cars at x 225, between the warehouses
  const outline = contourToPolygon(p.site.boundary!)
  const along = (x: number) => x / perimeter(outline) // on the south side, from (0, 0)
  const street = addExistingRoad(p, perimeterPath(outline, along(60), along(380)), 15, 'left')!
  p = updateExistingRoad(street.project, street.id, { name: 'South street' })
  p = addGate(p, 'o1', along(225)).project
  // its structural grid (Decision "Grid always"), the typology's, fitted to the site: along its south street; its
  // streets (Decision "Streets", ST.4), the roads the app derived before: round each warehouse, to the gate
  p = refitGrids(p)
  if (!southStreet) p = { ...p, site: { ...p.site, existingRoads: undefined } }
  if (!streets) return p
  // the roads as the app found them before its south street was one (an existing street met by the gate would leave the rings unlinked to it)
  // its ends that meet the south street are linked to it (Decision "Street links"), as an edit would, so moving it carries them
  return linkStreetEnds(derivedRoadsToStreets(p, derivedRoadsOf({ ...p, site: { ...p.site, existingRoads: undefined } })))
}
