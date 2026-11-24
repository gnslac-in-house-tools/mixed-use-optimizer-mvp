import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { area, inside, simplify, toShape } from '../src/model/geom'
import type { Pt, Ring, Shape } from '../src/model/geom'
import { candidates, chords, reachOf, runsOf, toWorld, zones } from '../src/layout/plate'
import type { Run } from '../src/layout/plate'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const circle = (cx: number, cy: number, R: number, step = 0.05): Ring => {
  const n = Math.round((2 * Math.PI * R) / step)
  return Array.from({ length: n }, (_, i) => [cx + R * Math.cos((2 * Math.PI * i) / n), cy + R * Math.sin((2 * Math.PI * i) / n)] as Pt)
}
const len = (c: [Pt, Pt]) => Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])

/** all runs of a plate, longest chord first, each band marking its own rectangle as taken */
function allRuns(plate: Shape, cores: Shape, d = 8.1, cw = 1.6): Run[] {
  const z = zones(plate, cores, d, cw)
  const taken: Shape[] = []
  const isTaken = (p: Pt) => taken.some((s) => inside(s, p))
  const out: Run[] = []
  for (const c of candidates(plate, z)) {
    for (const r of runsOf(c, z, isTaken)) {
      out.push(r)
      taken.push([[toWorld(r.frame, r.x0, 0), toWorld(r.frame, r.x1, 0), toWorld(r.frame, r.x1, z.d), toWorld(r.frame, r.x0, z.d)]])
    }
  }
  return out
}

test('a 30 × 30 square with a central 9 × 9 core: 4 chords; runs of 30, then shorter by the taken corners', () => {
  const plate = toShape([sq(0, 0, 30, 30)])
  expect(chords(plate[0]).map((c) => +len(c).toFixed(6)).sort()).toEqual([30, 30, 30, 30])
  const runs = allRuns(plate, toShape([sq(10.5, 10.5, 19.5, 19.5)]))
  const L = runs.map((r) => +(r.x1 - r.x0).toFixed(1))
  expect(L[0]).toBe(30)
  expect(L.slice(1).every((x) => x < 30)).toBe(true)
  expect(L.filter((x) => x > 5)).toHaveLength(4)
})

test('a 45 × 18 slab is double-loaded: a 1.8 m corridor and two long runs facing each other', () => {
  const plate = toShape([sq(0, 0, 45, 18)])
  const z = zones(plate, [], 8.1, 1.6)
  expect(Math.abs(area(z.corridor) - 1.8 * (45 - 16.2)) / (1.8 * 28.8)).toBeLessThan(0.02)
  const long = allRuns(plate, []).filter((r) => r.x1 - r.x0 > 40)
  expect(long).toHaveLength(2)
  expect(long[0].frame.v[1] * long[1].frame.v[1]).toBeLessThan(0)
})

test('a circle R 20 from 5 cm segments gives chords of about 10 m with a sagitta ≤ 0.6 m', () => {
  const ring = circle(0, 0, 20)
  const cs = chords(ring)
  for (const c of cs) {
    expect(len(c)).toBeGreaterThan(6)
    expect(len(c)).toBeLessThan(12)
    const m: Pt = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]
    expect(20 - Math.hypot(m[0], m[1])).toBeLessThanOrEqual(0.6 + 1e-6)
  }
})

test('a courtyard is a facade too: the hole gives runs whose normals point away from it', () => {
  const plate = toShape([sq(0, 0, 40, 40), sq(14, 14, 26, 26)])
  const z = zones(plate, [], 8.1, 1.6)
  expect(z.d).toBeLessThan(8.1)
  expect(area(z.corridor)).toBeGreaterThan(0)
  const holeRuns = allRuns(plate, []).filter((r) => r.ring === 1)
  expect(holeRuns.length).toBeGreaterThan(0)
  for (const r of holeRuns) {
    const p = toWorld(r.frame, (r.x0 + r.x1) / 2, 0)
    const q = toWorld(r.frame, (r.x0 + r.x1) / 2, 1)
    expect(Math.hypot(q[0] - 20, q[1] - 20)).toBeGreaterThan(Math.hypot(p[0] - 20, p[1] - 20))
  }
})

test('a mass section with two islands gives runs on both', () => {
  const runs = allRuns(toShape([sq(0, 0, 30, 30), sq(50, 0, 80, 30)]), [])
  expect(runs.some((r) => toWorld(r.frame, r.x0, 0)[0] < 40)).toBe(true)
  expect(runs.some((r) => toWorld(r.frame, r.x0, 0)[0] > 40)).toBe(true)
})

test('a core on the facade splits the band into two runs', () => {
  const runs = allRuns(toShape([sq(0, 0, 45, 18)]), toShape([sq(18, 0, 27, 9)]))
  const south = runs.filter((r) => Math.abs(r.frame.v[1] - 1) < 1e-9 && toWorld(r.frame, r.x0, 0)[1] < 1)
  expect(south).toHaveLength(2)
})

test('reach is false where the core blocks the corridor', () => {
  const plate = toShape([sq(0, 0, 45, 18)])
  const z = zones(plate, toShape([sq(18, 7, 27, 11)]), 8.1, 1.6)
  const north = allRuns(plate, toShape([sq(18, 7, 27, 11)])).find((r) => r.frame.v[1] < 0 && r.x1 - r.x0 > 40)!
  const reach = reachOf(north, z)
  const xAt = (wx: number) => Math.abs(wx - toWorld(north.frame, 0, 0)[0])
  expect(reach(xAt(12), xAt(12) + 0.9)).toBe(true)
  expect(reach(xAt(22), xAt(22) + 0.9)).toBe(false)
})

test('simplify keeps the corners of a square drawn with many points', () => {
  const pts: Pt[] = []
  for (let i = 0; i < 100; i++) pts.push([i * 0.3, 0])
  for (let i = 0; i < 100; i++) pts.push([30, i * 0.3])
  for (let i = 0; i < 100; i++) pts.push([30 - i * 0.3, 30])
  for (let i = 0; i < 100; i++) pts.push([0, 30 - i * 0.3])
  expect(simplify(pts, 0.05)).toHaveLength(4)
})
