// Reflection about a line (Phase AS.5, Mirror): a point, a direction, an angle, a footprint (rect or contour), holes. Pure:
// numbers and shapes in, shapes out. The line is the one through `a` and `b`; the caller checks they are two points.
//   rect     its centre is reflected and its box kept (a box is its own mirror image); its rotation becomes 2α − rotation (α: the
//            line's angle) plus 180° when it is wider than deep, so that what stands on its local frame stays where a mirror puts it.
//            A reflection flips the frame's hand: with 2α − rotation the new local +y is the opposite of the reflected old +y, and
//            the wall a program's docks take (the first long wall along the outline, which starts at the local bottom-left: the
//            bottom of a wide rect, the right of a tall one) would land on the opposite wall of the mirror image. A wide rect
//            takes the +180° (the new y is the reflected old y: bottom stays bottom, left and right swap); a tall rect, whose
//            front is its right wall, takes 2α − rotation (the new x is the reflected old x: right stays right, bottom and top swap)
//   contour  every vertex is reflected, the order put back counter-clockwise (`normalize`): a reflection and the reversal each
//            change the sign of a bulge, so an arc keeps its bulge's value and moves to its edge's new index (n − 2 − i)
//            and a corner keeps its radius on its own corner. The reversal makes another edge the first: `first` names the old
//            edge that is to be the new first edge, and the vertices start there (the walls in the mirror of their old order)
import type { Contour, Footprint, Point } from '../../model/schema.ts'
import { bulges, normalize, withBulges } from './contour.ts'

/** The line's angle, degrees (counter-clockwise from +x), snapped to a billionth so a vertical line is 90 and not 90.00000000000001. */
export function lineAngle(a: Point, b: Point): number {
  return Math.round(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) * 1e9) / 1e9
}

const unit = (a: Point, b: Point): Point => {
  const l = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
}

/** `q` reflected about the line through a and b (a + 0 turns a −0 into 0). */
export function reflectPoint(q: Point, a: Point, b: Point): Point {
  const d = unit(a, b)
  const v = { x: q.x - a.x, y: q.y - a.y }
  const k = 2 * (v.x * d.x + v.y * d.y)
  return { x: a.x + k * d.x - v.x + 0, y: a.y + k * d.y - v.y + 0 }
}

/** A direction (a vector, no place) reflected about the line's direction. */
export function reflectVector(v: Point, a: Point, b: Point): Point {
  const d = unit(a, b)
  const k = 2 * (v.x * d.x + v.y * d.y)
  return { x: k * d.x - v.x + 0, y: k * d.y - v.y + 0 }
}

/** An angle (degrees) seen in the mirror: 2α − angle, kept in 0 … 360. */
export function reflectAngle(degrees: number, a: Point, b: Point): number {
  const r = (((2 * lineAngle(a, b) - degrees) % 360) + 360) % 360
  return 360 - r < 1e-9 ? 0 : r // a turn that comes round to 360 within rounding is 0
}

/**
 * A contour reflected: counter-clockwise, its vertices in the order of the reflection reversed, each arc's bulge on its edge in
 * that order, each corner's radius on its corner. Reflected twice it is the contour it was, vertex for vertex.
 * `first`: the old edge that is to be the new first edge (the one between the new vertices 0 and 1). A reversed outline runs its edges
 * the other way round, so the walls come in the mirror of their old order starting from that one (old edge `first`, then `first − 1`,
 * …), and what reads the first edge (a program's docks, an anchored lot's frame) finds the mirror image of what it found. The vertices
 * start at the image of old vertex `first + 1`; each arc and each radius goes with its edge and its corner. Reflected twice that way, the
 * shape is the same, the vertex order turned. Absent, or no edge of the outline: the plain reflection.
 */
export function reflectContour(c: Contour, a: Point, b: Point, first?: number): Contour {
  const vertices = c.vertices.map((v) => ({ ...v, ...reflectPoint(v, a, b) }))
  const arcs: Record<string, number> = {}
  for (const [i, bulge] of Object.entries(c.arcs ?? {})) arcs[i] = -bulge // the same arc, seen from the other hand
  const r = normalize(Object.keys(arcs).length ? { vertices, arcs } : { vertices })
  const n = c.vertices.length
  if (first === undefined || !Number.isInteger(first) || first < 0 || first >= n || r.vertices.length !== n) return r
  // the new index of the image of old vertex first + 1 (the reversal puts it at n − 2 − first; found by place, so a contour that was not reversed is left)
  const start = vertices[(first + 1) % n]
  const s = r.vertices.findIndex((v) => Math.hypot(v.x - start.x, v.y - start.y) < 1e-9)
  const then = vertices[first]
  const after = r.vertices[(s + 1) % n]
  if (s < 0 || Math.hypot(after.x - then.x, after.y - then.y) >= 1e-9) return r
  if (s === 0) return r
  const bs = bulges(r)
  return withBulges(
    r.vertices.map((_, i) => r.vertices[(i + s) % n]),
    bs.map((_, i) => bs[(i + s) % n]),
  )
}

/** Holes reflected, each as a contour (and keeping what else it carries, a corridor's width). */
export function reflectHoles<C extends Contour>(holes: C[], a: Point, b: Point): C[] {
  return holes.map((h) => {
    const { arcs: _, vertices: __, ...rest } = h
    return { ...rest, ...reflectContour(h, a, b) } as C
  })
}

/** A footprint reflected: a rect by its centre and rotation, a contour by its vertices (`first`: the old edge it starts at, see `reflectContour`). */
export function reflectFootprint(f: Footprint, a: Point, b: Point, first?: number): Footprint {
  if (f.kind === 'rect') return { ...f, center: reflectPoint(f.center, a, b), rotation: reflectAngle(f.rotation - (f.width >= f.depth ? 180 : 0), a, b) }
  return { kind: 'contour', contour: reflectContour(f.contour, a, b, first) }
}
