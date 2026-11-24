// Pure geometry of the 3D view. Port of Plaza-Practiko `vistas/tresd/geometria3d.ts` (extrusion, volume, rings as
// segments, the scene's box), on our types: no levels, a mass stands on the ground (z = 0) and rises `height` m.
// The plan's (x, y, z) is drawn in three as (x, z, −y): Y up. That is a rotation (determinant +1), so a
// counter-clockwise outline seen from above keeps its orientation and the extrusion's normals point out.
import * as THREE from 'three'
import type { Mass, Point, Project } from '../../model/schema.ts'
import { levelOf, massHeight } from '../../engine/levels.ts'
import type { Derived } from '../../engine/types.ts'

function signedArea(p: Point[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return a / 2
}

/** Drops a repeated closing point (last = first) and consecutive equal points. */
function clean(p: Point[]): Point[] {
  const r: Point[] = []
  for (const q of p) {
    const u = r[r.length - 1]
    if (!u || u.x !== q.x || u.y !== q.y) r.push(q)
  }
  if (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop()
  return r
}

/**
 * A straight prism on a polygon, from z0 to z0 + height (metres). Non-indexed geometry with flat normals; empty when
 * the polygon has fewer than 3 points or the height is not positive.
 */
export function extrude(polygon: Point[], z0: number, height: number, holes: Point[][] = []): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  let p = clean(polygon)
  if (p.length < 3 || !(height > 0) || signedArea(p) === 0) {
    g.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    return g
  }
  if (signedArea(p) < 0) p = p.slice().reverse()
  const z1 = z0 + height
  const pos: number[] = []
  const v = (x: number, y: number, z: number): void => {
    pos.push(x, z, -y)
  }

  // holes run clockwise: so their sides also face out of the solid
  const hs = holes
    .map((h) => clean(h))
    .filter((h) => h.length >= 3 && signedArea(h) !== 0)
    .map((h) => (signedArea(h) > 0 ? h.slice().reverse() : h))
  // caps: a triangulation that respects concave polygons and holes (indices run the outline, then the holes)
  const all = [...p, ...hs.flat()]
  const tri = THREE.ShapeUtils.triangulateShape(
    p.map((q) => new THREE.Vector2(q.x, q.y)),
    hs.map((h) => h.map((q) => new THREE.Vector2(q.x, q.y))),
  )
  for (const [i, j, k] of tri) {
    let [a, b, c] = [all[i], all[j], all[k]]
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) [b, c] = [c, b] // counter-clockwise
    v(a.x, a.y, z1)
    v(b.x, b.y, z1)
    v(c.x, c.y, z1)
    v(a.x, a.y, z0)
    v(c.x, c.y, z0)
    v(b.x, b.y, z0)
  }
  // sides: edge a→b of a counter-clockwise outline (or a clockwise hole) faces out
  for (const ring of [p, ...hs]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      v(a.x, a.y, z0)
      v(b.x, b.y, z0)
      v(b.x, b.y, z1)
      v(a.x, a.y, z0)
      v(b.x, b.y, z1)
      v(a.x, a.y, z1)
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** The volume of a closed non-indexed mesh (sum of signed tetrahedra). Positive when the normals point out. */
export function volume(g: THREE.BufferGeometry): number {
  const a = g.getAttribute('position')
  let v = 0
  for (let i = 0; i + 2 < a.count; i += 3) {
    const [x1, y1, z1] = [a.getX(i), a.getY(i), a.getZ(i)]
    const [x2, y2, z2] = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)]
    const [x3, y3, z3] = [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)]
    v += (x1 * (y2 * z3 - z2 * y3) - y1 * (x2 * z3 - z2 * x3) + z1 * (x2 * y3 - y2 * x3)) / 6
  }
  return v
}

/** Closed rings at height z → segment positions (pairs of points) for LineSegments. */
export function ringSegments(rings: Point[][], z: number): Float32Array {
  let n = 0
  for (const r of rings) if (r.length >= 2) n += r.length
  const out = new Float32Array(n * 6)
  let k = 0
  for (const r of rings) {
    if (r.length < 2) continue
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      out.set([a.x, z, -a.y, b.x, z, -b.y], k)
      k += 6
    }
  }
  return out
}

/** How thick a mass that is not built (outdoor storage, a yard) is drawn: it reads as paving, not as a volume. */
export const SLAB = 0.15

/**
 * Where a mass's extrusion starts (its level's elevation) and how tall it is: built → its height (its own or its
 * level's); not built → a thin slab. `floors`: where each copy starts when its level repeats ×N (Decision "Levels"),
 * one level height apart; the first is `z0`.
 */
export function massBody(p: Project, m: Mass): { z0: number; height: number; slab: boolean; floors: number[] } {
  const program = m.programId ? p.programs.find((g) => g.id === m.programId) : undefined
  const slab = program !== undefined && !program.built
  const level = levelOf(p, m)
  const floors = Array.from({ length: level.repeat }, (_, k) => level.elevation + k * level.height)
  return { z0: level.elevation, height: slab ? SLAB : massHeight(p, m), slab, floors }
}

/** The box of the site and every mass, in three's coordinates; null when there is nothing. */
export function sceneBox(project: Project, derived: Pick<Derived, 'masses' | 'site'>): THREE.Box3 | null {
  const box = new THREE.Box3()
  for (const p of derived.site.polygon ?? []) box.expandByPoint(new THREE.Vector3(p.x, 0, -p.y))
  for (const m of project.masses) {
    const d = derived.masses[m.id]
    if (!d) continue
    const { z0, height, floors } = massBody(project, m)
    const top = floors[floors.length - 1] + height
    for (const p of d.polygon) {
      box.expandByPoint(new THREE.Vector3(p.x, z0, -p.y))
      box.expandByPoint(new THREE.Vector3(p.x, top, -p.y))
    }
  }
  return box.isEmpty() ? null : box
}
