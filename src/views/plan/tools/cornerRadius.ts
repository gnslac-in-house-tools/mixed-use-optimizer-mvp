// The Corner tool, the pure part (port of Plaza-Practiko `vistas/planta/edicion/radioDeEsquina.ts`): which corner the
// pointer is at, and what radius a pointer position gives.
import type { Contour, Id, Mass, Point } from '../../../model/schema.ts'
import { maxRadius, turnAt } from '../../../engine/geom/contour.ts'
import { footprintContour } from '../../../engine/geom/footprint.ts'
import type { ShapeOpName, ShapeRead } from '../../../engine/geom/shapeOp.ts'

/** A corner of a mass, or of a truck court of the block picked (`massId` is then its ref's id): its vertex index. */
export interface PickedCorner {
  massId: Id
  i: number
}

/**
 * The bisector of corner i: the unit vector into the corner (between its two sides) and the angle (rad) between the
 * sides. The centre of an arc of radius r lies on it, r / sin(angle / 2) from the vertex.
 */
export function bisector(c: Contour, i: number): { u: Point; angle: number } | null {
  const n = c.vertices.length
  const v = c.vertices[i]
  const a = c.vertices[(i + n - 1) % n]
  const b = c.vertices[(i + 1) % n]
  const la = Math.hypot(a.x - v.x, a.y - v.y)
  const lb = Math.hypot(b.x - v.x, b.y - v.y)
  if (la < 1e-9 || lb < 1e-9) return null
  const sx = (a.x - v.x) / la + (b.x - v.x) / lb
  const sy = (a.y - v.y) / la + (b.y - v.y) / lb
  const l = Math.hypot(sx, sy)
  // opposite sides (a flat corner): no useful bisector
  if (l < 1e-9) return null
  return { u: { x: sx / l, y: sy / l }, angle: Math.PI - Math.abs(turnAt(c, i)) }
}

/**
 * The radius the pointer at q gives: the arc's centre follows q projected on the bisector. Never negative nor more
 * than what fits in the corner (`maxRadius`); rounded to `step` m (0 = not rounded).
 */
export function radiusFromPointer(c: Contour, i: number, q: Point, step = 0): number {
  const b = bisector(c, i)
  if (!b) return 0
  const v = c.vertices[i]
  const d = (q.x - v.x) * b.u.x + (q.y - v.y) * b.u.y
  if (d <= 0) return 0
  let r = d * Math.sin(b.angle / 2)
  if (step > 0) r = Math.round(r / step) * step
  return Math.min(Math.max(0, r), Math.max(0, maxRadius(c, i)))
}

/** Can the corner be rounded? (its two sides are straight and something fits, or it already has a radius) */
export function roundable(c: Contour, i: number): boolean {
  const max = maxRadius(c, i)
  return bisector(c, i) !== null && Number.isFinite(max) && (max > 1e-6 || c.vertices[i].r > 0)
}

/** The roundable corner nearest to q among the masses (or any outlines with an id), within `tol` m; null if none. `fits` says which corners count (the Chamfer's own); `contourOf` the outline each mass is read on (a block's: its face). */
export function nearestCorner<T extends { id: Id }>(masses: T[], q: Point, tol: number, fits: (c: Contour, i: number) => boolean = roundable, contourOf: (m: T) => Contour = (m) => footprintContour((m as unknown as Mass).footprint)): PickedCorner | null {
  let best: PickedCorner | null = null
  let dBest = tol
  for (const m of masses) {
    const c = contourOf(m)
    c.vertices.forEach((v, i) => {
      const d = Math.hypot(v.x - q.x, v.y - q.y)
      if (d <= dBest && fits(c, i)) {
        dBest = d
        best = { massId: m.id, i }
      }
    })
  }
  return best
}

/**
 * Why the object refuses `op` (nothing does now: a block's outline is free since D.2, and an object may still say), as its kind's reader says it; null when it
 * takes it (or is not there). A corner the object refuses is not offered by the Corner and Chamfer tools: a click on it says why.
 */
export function refusedBy(read: ShapeRead | null, op: ShapeOpName): string | null {
  return read?.without?.includes(op) ? (read.why ?? `That object does not take ${op}`) : null
}
