// The ground's surface for the 3D (Phase E.2c, Decision "Terrain layout"), pure: plan (x, y) at height z is the
// scene's (x, (z − base) × k, −y), `base` the site's mean ground height (the platforms' levels stand over it, E.3c),
// `k` the vertical exaggeration (Decision "Vertical exaggeration"; 1: as it is). The
// mesh (its corners, or for the slope and the cut and fill each triangle on its own with its class), the site's lines
// and the major contours lying on it (not where the platforms grade it), and where the map's image falls on it.
import type { Point } from '../../model/schema.ts'
import type { Surface } from '../../modules/terrain/engine/index.ts'
import { EARTH_NONE, type EarthGrid } from '../../engine/types.ts'
import { earthClass, slopeClass, triangleSlope } from '../../modules/terrain/views/terrainDraw.ts'

/** Above the ground, so a line on it is not hidden by it (m). */
export const LIFT = 0.15

/**
 * The triangles turned to face up in the scene: the surface's run clockwise with y up (Delaunator's), which seen from
 * above is a triangle's back, culled and lit from below.
 */
export function upward(triangles: Uint32Array): Uint32Array {
  const out = new Uint32Array(triangles.length)
  for (let k = 0; k < triangles.length; k += 3) {
    out[k] = triangles[k]
    out[k + 1] = triangles[k + 2]
    out[k + 2] = triangles[k + 1]
  }
  return out
}

/** The surface's corners in the scene, three numbers each. */
export function surfacePositions(s: Surface, base: number, k = 1): Float32Array {
  const out = new Float32Array(s.x.length * 3)
  for (let i = 0; i < s.x.length; i++) out.set([s.x[i], (s.z[i] - base) * k, -s.y[i]], 3 * i)
  return out
}

/** Each triangle of `s` on its own (nine numbers), facing up. */
function eachTriangle(s: Surface, base: number, k: number): Float32Array {
  const n = s.triangles.length / 3
  const positions = new Float32Array(n * 9)
  const tri = upward(s.triangles)
  for (let t = 0; t < n; t++)
    for (let j = 0; j < 3; j++) {
      const i = tri[3 * t + j]
      positions.set([s.x[i], (s.z[i] - base) * k, -s.y[i]], 9 * t + 3 * j)
    }
  return positions
}

/**
 * The graded ground's triangles on their own, and each one's cut or fill class at its middle against the ground as it
 * was (−k cut, +k fill, k EARTH_CLASSES' index; 0: as it was).
 */
export function earthMesh(graded: Surface, ground: Surface, base: number, k = 1): { positions: Float32Array; classes: Int8Array } {
  const positions = eachTriangle(graded, base, k)
  const n = graded.triangles.length / 3
  const classes = new Int8Array(n)
  const { x, y, z, triangles } = graded
  for (let k = 0; k < n; k++) {
    const [a, b, c] = [triangles[3 * k], triangles[3 * k + 1], triangles[3 * k + 2]]
    const mid = { x: (x[a] + x[b] + x[c]) / 3, y: (y[a] + y[b] + y[c]) / 3 }
    const was = ground.elevation(mid)
    if (was === null) continue
    const d = (z[a] + z[b] + z[c]) / 3 - was
    const q = earthClass(d)
    classes[k] = q > 0 ? Math.sign(d) * q : 0
  }
  return { positions, classes }
}

/** Is p on a cell the platforms grade? */
export function graded(g: EarthGrid, p: Point): boolean {
  const i = Math.floor((p.x - g.x0) / g.size)
  const j = Math.floor((p.y - g.y0) / g.size)
  return i >= 0 && j >= 0 && i < g.cols && j < g.rows && g.kind[j * g.cols + i] !== EARTH_NONE
}

/** Lines cut where they cross graded cells: the pieces left on the ground as it is. */
export function offGraded(lines: { points: Point[]; z: number }[], g: EarthGrid | null): { points: Point[]; z: number }[] {
  if (!g) return lines
  return lines.flatMap((l) => {
    const out: { points: Point[]; z: number }[] = []
    let run: Point[] = []
    for (const p of l.points) {
      if (graded(g, p)) {
        if (run.length > 1) out.push({ points: run, z: l.z })
        run = []
      } else run.push(p)
    }
    if (run.length > 1) out.push({ points: run, z: l.z })
    return out
  })
}

/** Each triangle on its own (nine numbers), and its slope's class (-1: standing on edge). */
export function slopeMesh(s: Surface, base: number, k = 1): { positions: Float32Array; classes: Int8Array } {
  const n = s.triangles.length / 3
  const positions = eachTriangle(s, base, k)
  const classes = new Int8Array(n)
  for (let k = 0; k < n; k++) {
    const slope = triangleSlope(s, k)
    classes[k] = slope === null ? -1 : slopeClass(slope)
  }
  return { positions, classes }
}

/**
 * Closed rings lying on the ground: each side cut every `step` m and each cut at the ground's height there (where
 * there is no ground, at the base), `LIFT` above it.
 */
export function drapedSegments(rings: Point[][], elevation: (p: Point) => number | null, base: number, step = 2, k = 1, open = false): Float32Array {
  const out: number[] = []
  const at = (p: Point) => [p.x, ((elevation(p) ?? base) - base) * k + LIFT, -p.y]
  for (const r of rings) {
    if (r.length < 2) continue
    // `open`: lines, not rings (their last side is not drawn back)
    for (let i = 0; i < (open ? r.length - 1 : r.length); i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      const cuts = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
      for (let k = 0; k < cuts; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / cuts, y: a.y + ((b.y - a.y) * k) / cuts }
        const q = { x: a.x + ((b.x - a.x) * (k + 1)) / cuts, y: a.y + ((b.y - a.y) * (k + 1)) / cuts }
        out.push(...at(p), ...at(q))
      }
    }
  }
  return new Float32Array(out)
}

/** Contours at their heights (a line of corners each), `LIFT` above the ground. */
export function contourSegments(lines: { points: Point[]; z: number }[], base: number, k = 1): Float32Array {
  const out: number[] = []
  for (const l of lines)
    for (let i = 0; i + 1 < l.points.length; i++) {
      const a = l.points[i]
      const b = l.points[i + 1]
      out.push(a.x, (l.z - base) * k + LIFT, -a.y, b.x, (l.z - base) * k + LIFT, -b.y)
    }
  return new Float32Array(out)
}

/**
 * Where the map's image falls on each corner (u, v; 0 to 1 across the image, v up), the map laid as MapGround lays
 * it: `center` on the plan, turned `rotation` degrees, `width` × `height` m: the plan offset from the centre turned
 * back by the rotation, over the image's size (checked against three.js's own transform in the tests).
 */
export function mapUvs(s: Pick<Surface, 'x' | 'y'>, center: Point, rotation: number, width: number, height: number): Float32Array {
  const t = (rotation * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const out = new Float32Array(s.x.length * 2)
  for (let i = 0; i < s.x.length; i++) {
    const dx = s.x[i] - center.x
    const dy = s.y[i] - center.y
    out[2 * i] = (dx * cos + dy * sin) / width + 0.5
    out[2 * i + 1] = (-dx * sin + dy * cos) / height + 0.5
  }
  return out
}
