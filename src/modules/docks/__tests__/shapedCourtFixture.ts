// A fixture for the readers of a shaped truck court (Phase D.3, task 5): a block 36 × 24 m placed on the demo site at (330, 225) (not turned), its front wall (e1)
// with two courts after a split (the first with a chamfered far corner, a gap between them), its back wall (e3) with one chamfered court.
import type { Contour, CourtByEdge, Id, Point, Polygon, Project } from '../../../model/schema.ts'
import { derive } from '../../../engine/derive.ts'
import type { DerivedDock } from '../../../engine/types.ts'
import { demoProject } from '../../../state/demo.ts'
import { addWarehouseType, placeWarehouse, updateWarehouseStep } from '../../warehouse/actions.ts'

/** A court across the wall from x0 to x1, `depth` m out; with a chamfer on its far corner at x1. */
export const slab = (x0: number, x1: number, depth: number, chamfer = false): Contour => ({
  vertices: [
    { x: x0, y: 0, r: 0 },
    { x: x1, y: 0, r: 0 },
    { x: x1, y: depth, r: 0, ...(chamfer ? { chamfer: [3, 3] as [number, number] } : {}) },
    { x: x0, y: depth, r: 0 },
  ],
})

export const COURTS: CourtByEdge[] = [
  { edge: 'e1', id: 'c1', shape: slab(0, 14, 12, true) },
  { edge: 'e1', id: 'c2', shape: slab(22, 36, 12) },
  { edge: 'e3', id: 'c3', shape: slab(6, 30, 10, true) },
]

/** The block with these courts, placed at (330, 225) at `angle`: the project, its option, its type, its copy and its hall. */
export function shapedSite(courts: CourtByEdge[] = COURTS, angle = 0, from: Project = demoProject()) {
  let { project: p, id } = addWarehouseType(from)
  p = updateWarehouseStep(p, id, 'grid', { x: 12, y: 12, modules: 4 })
  p = updateWarehouseStep(p, id, 'hall', { length: 36, width: 24, ends: 'both' })
  p = { ...p, warehouseTypes: p.warehouseTypes!.map((t) => (t.id === id ? { ...t, courts } : t)) }
  const optionId = p.options[0].id
  const r = placeWarehouse(p, id, { x: 330, y: 225 }, angle, optionId)!
  const building = r.project.buildings.find((b) => b.id === r.id)!
  const levels = new Set(building.levels.map((l) => l.id))
  const hall = r.project.masses.find((m) => levels.has(m.levelId) && m.part === 'hall')!
  return { p: r.project, optionId, building, type: r.project.warehouseTypes!.find((t) => t.id === id)!, copy: building.warehouse!, hall }
}

/** The block's docked walls as the derived result has them: the one with two courts, the one with one. */
export function shapedDocks(p: Project, optionId: Id, hallId: Id): { d: ReturnType<typeof derive>; mine: DerivedDock[]; split: DerivedDock; single: DerivedDock } {
  const d = derive(p, optionId)
  const mine = d.circulation.docks.filter((k) => k.massId === hallId)
  const split = mine.find((k) => k.shapes?.length === 2)!
  const single = mine.find((k) => k.shapes?.length === 1)!
  return { d, mine, split, single }
}

/** A point of a dock's frame between its two courts, `out` m out of the wall: in the court's frame, in neither shape. */
export function gapOf(k: DerivedDock, out = 8): Point {
  return { x: (k.court[0].x + k.court[1].x) / 2 + k.out.x * out, y: (k.court[0].y + k.court[1].y) / 2 + k.out.y * out }
}

export const area = (poly: Polygon): number => Math.abs(poly.reduce((s, q, i) => s + (q.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * q.y), 0)) / 2
