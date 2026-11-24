// The box round what is picked, of every kind (Phase AS.5 task 6): the frame a group shows (`views/plan/MassHandles.tsx`) and the centre its dot turns it about. Pure: a project and what is
// picked in, a box out. A mass by its footprint, a street by its picked nodes, an existing street by its points, a free lot by its rectangle (an anchored one stands against its mass, which is in the box), a gate by its
// place on the boundary, a dimension by its two points, a reference line by its points, a note by its point. The drawings have no place here (a group never holds one).
import type { Id, Point, Project } from '../model/schema.ts'
import type { Picked } from '../model/picked.ts'
import { gatePlace, gatesOf } from './circulation/gates.ts'
import { contourToPolygon } from './geom/contour.ts'
import { footprintPolygon, rotate } from './geom/footprint.ts'
import { bounds, type Bounds } from './geom/polygon.ts'

/** The box round everything picked but the drawings; null when nothing picked has a place. */
export function pickedBox(p: Project, option: Id, picked: Picked): Bounds | null {
  const points: Point[] = []
  for (const m of p.masses) if (picked.masses.includes(m.id)) points.push(...footprintPolygon(m.footprint))
  const nodes = p.options.find((o) => o.id === option)?.streets?.nodes ?? []
  for (const n of nodes) if (picked.nodes.includes(n.id)) points.push({ x: n.x, y: n.y })
  for (const r of p.site.existingRoads ?? []) if (picked.existing.includes(r.id)) points.push(...r.points)
  for (const l of p.options.find((o) => o.id === option)?.lots ?? []) {
    if (!picked.lots.includes(l.id) || !l.rect) continue
    const { center, width, depth, rotation } = l.rect
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) points.push(rotate({ x: center.x + (x * width) / 2, y: center.y + (y * depth) / 2 }, center, rotation))
  }
  const boundary = p.site.boundary ? contourToPolygon(p.site.boundary) : null
  for (const g of gatesOf(p, option)) {
    if (!picked.gates.includes(g.id)) continue
    const place = gatePlace(g, boundary, { streets: p.options.find((o) => o.id === option)?.streets, existingRoads: p.site.existingRoads })
    if (place) points.push(place.at)
  }
  for (const d of p.dimensions ?? []) if (picked.dimensions.includes(d.id)) points.push(d.a, d.b)
  for (const r of p.referenceLines ?? []) if (picked.lines.includes(r.id)) points.push(...r.points)
  for (const n of p.notes ?? []) if (picked.notes.includes(n.id)) points.push(n.at)
  return points.length === 0 ? null : bounds(points)
}
