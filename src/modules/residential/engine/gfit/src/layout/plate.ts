// Any floor plate → facade bands for the band WFC (spec 2026-11-04-program-wfc §5).
// The facade ring of depth d (minus the cores) is where units go; the ring just inside it is the corridor. Every
// ring of the plate (holes too: a courtyard is a facade) is simplified into chords; each chord is a band with a
// local frame (x along the chord, y into the plate). Chords are taken longest first, and a band only covers what
// earlier bands left, so a corner square goes to the longer side and wraps there.
import { area, difference, inside, offset, simplify } from '../model/geom.ts'
import type { Pt, Ring, Shape } from '../model/geom.ts'
import { Q } from './band.ts'

export interface Frame { o: Pt; u: Pt; v: Pt }
export const toWorld = (f: Frame, x: number, y: number): Pt => [f.o[0] + f.u[0] * x + f.v[0] * y, f.o[1] + f.u[1] * x + f.v[1] * y]

export interface Zones {
  /** the plate and cores as used (simplified at 5 cm) */
  plate: Shape
  cores: Shape
  /** where units may go: the facade ring minus the cores (+0.3 m) */
  unit: Shape
  corridor: Shape
  /** the unit depth actually used: lower than asked when the plate is too thin for two bands and a corridor */
  d: number
  cw: number
}

export interface Candidate { ring: number; a: Pt; b: Pt; L: number; frame: Frame; convexA: boolean; convexB: boolean }
export interface Run { ring: number; frame: Frame; x0: number; x1: number; depth: number; convexStart: boolean; convexEnd: boolean }

const MIN_D = 5.4

/** Douglas–Peucker at 0.25 m, then chords that keep every point within `tol`, starting at the sharpest corner. */
export function chords(ring: Ring, tol = 0.6): [Pt, Pt][] {
  let r = simplify(ring, 0.25)
  const n = r.length
  if (n < 3) return []
  let start = 0, sharp = Infinity
  for (let i = 0; i < n; i++) {
    const p = r[(i - 1 + n) % n], q = r[i], s = r[(i + 1) % n]
    const ax = q[0] - p[0], ay = q[1] - p[1], bx = s[0] - q[0], by = s[1] - q[1]
    const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1)
    if (c < sharp) { sharp = c; start = i }
  }
  r = [...r.slice(start), ...r.slice(0, start)]
  const at = (k: number) => r[k % n]
  const within = (i: number, j: number) => {
    const A = at(i), B = at(j)
    const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy
    for (let k = i + 1; k < j; k++) {
      const p = at(k)
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l2)) : 0
      if (Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dy) > tol) return false
    }
    return true
  }
  const out: [Pt, Pt][] = []
  for (let i = 0; i < n;) {
    let j = i + 1
    while (j + 1 <= n && within(i, j + 1)) j++
    out.push([at(i), at(j)])
    i = j
  }
  return out
}

export function zones(plate: Shape, cores: Shape, d: number, cw: number): Zones {
  const P = plate.map((r) => simplify(r, 0.05)).filter((r) => r.length >= 3)
  const C = cores.map((r) => simplify(r, 0.05)).filter((r) => r.length >= 3)
  let dd = d
  while (dd > MIN_D + 1e-9 && area(offset(P, -(dd + cw / 2))) <= 1e-6) dd = Math.round((dd - 0.3) * 10) / 10
  const inner = offset(P, -dd)
  const unit = difference(difference(P, inner), offset(C, 0.3))
  const corridor = difference(difference(inner, offset(P, -(dd + cw))), C)
  return { plate: P, cores: C, unit, corridor, d: dd, cw }
}

/** every chord of every ring as a band candidate, longest first */
export function candidates(plate: Shape, z: Zones): Candidate[] {
  const out: Candidate[] = []
  z.plate.forEach((ring, ri) => {
    for (const [a, b] of chords(ring)) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L < 1e-6) continue
      const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
      let v: Pt = [-u[1], u[0]]
      const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      if (!inside(z.plate, [m[0] + v[0] * 0.7, m[1] + v[1] * 0.7])) v = [-v[0], -v[1]]
      const convex = (p: Pt, s: number) => !inside(z.plate, [p[0] + u[0] * 0.5 * s + v[0] * 0.5, p[1] + u[1] * 0.5 * s + v[1] * 0.5])
      out.push({ ring: ri, a, b, L, frame: { o: a, u, v }, convexA: convex(a, -1), convexB: convex(b, 1) })
    }
  })
  void plate
  return out.sort((p, q) => q.L - p.L)
}

/** the stretches of a chord deep enough for units (≥ 0.75 d of free unit zone), as runs in chord x */
export function runsOf(c: Candidate, z: Zones, taken: (p: Pt) => boolean): Run[] {
  const runs: Run[] = []
  const nx = Math.floor(c.L / Q + 1e-9)
  let cur: { s: number; e: number; dmin: number } | null = null
  const flush = () => {
    if (!cur) return
    const x0 = Math.max(0, cur.s * Q), x1 = cur.e === nx - 1 ? c.L : Math.min(c.L, (cur.e + 1) * Q)
    runs.push({ ring: c.ring, frame: c.frame, x0, x1, depth: cur.dmin, convexStart: c.convexA && x0 < Q, convexEnd: c.convexB && x1 > c.L - Q })
    cur = null
  }
  for (let k = 0; k < nx; k++) {
    const x = (k + 0.5) * Q
    let n = 0
    for (let y = Q / 2; y < z.d; y += Q) {
      const p = toWorld(c.frame, x, y)
      // a chord of a concave arc runs up to 0.6 m outside the plate: start counting where the plate starts
      if (!n && y < 0.9 && !inside(z.plate, p)) continue
      if (inside(z.unit, p) && !taken(p)) n++
      else break
    }
    const depth = n * Q
    if (depth >= 0.75 * z.d - 1e-9) {
      if (cur) { cur.e = k; cur.dmin = Math.min(cur.dmin, depth) } else cur = { s: k, e: k, dmin: depth }
    } else flush()
  }
  flush()
  return runs
}

/** can an entry door spanning run x0…x1 (measured from the run's start) open onto the corridor? */
export function reachOf(run: Run, z: Zones): (x0: number, x1: number) => boolean {
  const y = z.d + 0.4
  return (x0, x1) => {
    if (x1 < x0) return false
    for (let x = x0; ; x = Math.min(x1, x + 0.15)) {
      if (!inside(z.corridor, toWorld(run.frame, run.x0 + x, y))) return false
      if (x >= x1) return true
    }
  }
}
