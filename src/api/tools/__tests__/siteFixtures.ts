// The sites the site tools are tested on (Phase 8.3–8.6): a rectangle, an L and an irregular one, each with an existing street
// along its first edge (what a frontage became in Phase PE.2) and a gate on it.
import { contourFromPolygon, contourToPolygon } from '../../../engine/geom/contour.ts'
import { nearestT, perimeterPath, vertexTs } from '../../../engine/geom/perimeter.ts'
import type { Point, Project } from '../../../model/schema.ts'
import { addExistingRoad, addGate } from '../../../state/actions/circulation.ts'
import { newProject } from '../../../typologies/index.ts'

/** An industrial project on `boundary`, an existing street 15 m wide outside its first edge and a gate at `gate` on it. */
export function siteProject(boundary: Point[], gate: Point, asDrawn = false): Project {
  let p = newProject('industrial', 'Site test')
  // contourFromPolygon stores it counter-clockwise; asDrawn keeps the order given (a contour from elsewhere may not be)
  p.site.boundary = asDrawn ? { vertices: boundary.map((q) => ({ ...q, r: 0 })) } : contourFromPolygon(boundary)
  const poly = contourToPolygon(p.site.boundary)
  const ts = vertexTs(poly)
  p = addExistingRoad(p, perimeterPath(poly, ts[0], ts[1]), 15, 'left')!.project
  return addGate(p, p.options[0].id, nearestT(poly, gate)).project
}

export const RECTANGLE = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 260 },
  { x: 0, y: 260 },
]
export const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 420, y: 0 },
  { x: 420, y: 160 },
  { x: 200, y: 160 },
  { x: 200, y: 340 },
  { x: 0, y: 340 },
]
export const IRREGULAR = [
  { x: 0, y: 0 },
  { x: 380, y: -20 },
  { x: 450, y: 150 },
  { x: 360, y: 300 },
  { x: 60, y: 270 },
  { x: -30, y: 120 },
]
