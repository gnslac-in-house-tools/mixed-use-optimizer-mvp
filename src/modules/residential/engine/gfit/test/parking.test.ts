import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { layoutBasement } from '../src/parking/adapter'
import { area, intersection, toShape } from '../src/model/geom'
import type { Ring } from '../src/model/geom'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

test('60×50 rectangle at 90° and 6 m aisle lays out between 80 and 120 stalls', () => {
  const r = layoutBasement(toShape([sq(0, 0, 60, 50)]), [], { angle: 90, aisle: 6 })
  expect(r.count).toBeGreaterThanOrEqual(80)
  expect(r.count).toBeLessThanOrEqual(120)
  expect(r.stalls).toHaveLength(r.count)
  expect(r.stalls[0][0]).toHaveLength(2)
})

test('no stall overlaps a core', () => {
  const core = toShape([sq(26, 21, 33, 28)])
  const r = layoutBasement(toShape([sq(0, 0, 60, 50)]), core, { angle: 90, aisle: 6 })
  expect(r.count).toBeGreaterThan(0)
  expect(r.stalls.filter((s) => area(intersection(toShape([s]), core)) > 0.01)).toHaveLength(0)
})

test('a 20×20 core removes stalls', () => {
  const free = layoutBasement(toShape([sq(0, 0, 60, 50)]), [], { angle: 90, aisle: 6 }).count
  const withCore = layoutBasement(toShape([sq(0, 0, 60, 50)]), toShape([sq(20, 15, 40, 35)]), { angle: 90, aisle: 6 }).count
  expect(withCore).toBeLessThan(free)
})

test('45° gives fewer stalls than 90° on the same outline', () => {
  const a = layoutBasement(toShape([sq(0, 0, 60, 50)]), [], { angle: 90, aisle: 6 }).count
  const b = layoutBasement(toShape([sq(0, 0, 60, 50)]), [], { angle: 45, aisle: 6 }).count
  expect(b).toBeLessThan(a)
})

test('an empty outline gives no stalls and no error', () => {
  expect(layoutBasement([], [], { angle: 90, aisle: 6 }).count).toBe(0)
})

// ───────── Layout (Auto, Grid, Circuit) and Flow (Two-way, One-way) ─────────
const B = toShape([sq(0, 0, 64, 48)])
const lay = (layout: 'auto' | 'grid' | 'circuit', flow: 'two' | 'one' = 'two', angle: 90 | 60 | 45 = 90, outline = B) => layoutBasement(outline, [], { angle, aisle: 6, layout, flow })
const near = (s: Ring, edge: 'w' | 'e' | 's' | 'n') => s.every(([x, y]) => (edge === 'w' ? x < 5.1 : edge === 'e' ? x > 58.9 : edge === 's' ? y < 5.1 : y > 42.9))

test('Grid and Circuit are two different layouts', () => {
  const g = lay('grid'), c = lay('circuit')
  expect(g.used).toBe('grid')
  expect(c.used).toBe('circuit')
  expect(c.count).toBeGreaterThan(0)
  // the circuit lines all four edges with stalls and keeps every aisle a stall depth inside; grid aisles run to the edge
  for (const e of ['w', 'e', 's', 'n'] as const) expect(c.stalls.some((s) => near(s, e))).toBe(true)
  expect(c.aisles.every((a) => a.every(([x, y]) => x > 4.9 && x < 59.1 && y > 4.9 && y < 43.1))).toBe(true)
  expect(g.aisles.some((a) => a.some(([x]) => x < 1))).toBe(true)
})

test('Auto keeps the circuit only when it gives at least 95 % of the grid stalls', () => {
  const g = lay('grid'), c = lay('circuit'), a = lay('auto')
  expect(a.used).toBe(c.count >= g.count * 0.95 ? 'circuit' : 'grid')
  expect(a.count).toBe(a.used === 'circuit' ? c.count : g.count)
  expect(a.compare).toEqual({ grid: g.count, circuit: c.count })
})

test('Auto at 60° stays in the grid (the circuit is for 90° stalls)', () => {
  expect(lay('auto', 'two', 60).used).toBe('grid')
})

test('a circuit that does not fit falls back to the grid and says so', () => {
  const r = lay('circuit', 'two', 90, toShape([sq(0, 0, 64, 12)]))
  expect(r.used).toBe('grid')
  expect(r.count).toBeGreaterThan(0)
  expect(r.warnings).toContain('Circuit does not fit: the basement is too narrow for stalls on both sides of a ring aisle; using the grid')
})

test('One-way draws arrows; in the circuit the whole ring turns the same way', () => {
  const r = lay('circuit', 'one')
  expect(r.arrows.length).toBeGreaterThan(4)
  // the tip of each ring arrow (its first point) is ahead of its tail in the same turn around the centre
  const turn = r.arrows.filter((a) => a[0][0] < 11 || a[0][0] > 53 || a[0][1] < 11 || a[0][1] > 37).map((a) => {
    const [tx, ty] = a[0], tail = a.reduce((p, q) => [p[0] + q[0] / a.length, p[1] + q[1] / a.length], [0, 0])
    return Math.sign((tail[0] - 32) * (ty - 24) - (tail[1] - 24) * (tx - 32))
  })
  expect(turn.length).toBeGreaterThan(4)
  expect(new Set(turn).size).toBe(1)
})

test('Two-way draws arrows with a head at both ends', () => {
  const r = lay('grid', 'two')
  expect(r.arrows.length).toBeGreaterThan(0)
  expect(r.arrows.every((a) => a.length === 10)).toBe(true) // a double-headed arrow has 10 points, a one-way one 7
  expect(lay('grid', 'one').arrows.every((a) => a.length === 7)).toBe(true)
})

test('cores cut the ring into short pieces: the circuit still fits, and says the cores sit in its aisle', () => {
  const out = toShape([sq(-10, -4, 50, 46)]), cores = toShape([sq(7, 24, 14, 32), sq(28, 5, 35, 11)])
  const c = layoutBasement(out, cores, { angle: 90, aisle: 6, layout: 'circuit' })
  expect(c.used).toBe('circuit')
  expect(c.count).toBeGreaterThan(90)
  expect(c.warnings).toContain('Cores sit in the circuit aisle: move them, or use the grid, which fits its rows between them')
  const a = layoutBasement(out, cores, { angle: 90, aisle: 6, layout: 'auto' })
  expect(a.compare!.circuit).toBe(c.count)
})
