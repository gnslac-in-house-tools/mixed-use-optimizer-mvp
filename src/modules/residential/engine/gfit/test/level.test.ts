import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { area, difference, inside, intersection, offset, toShape } from '../src/model/geom'
import type { Pt, Ring, Shape } from '../src/model/geom'
import { layoutLevel } from '../src/layout/level'
import type { LevelInput, LevelLayout } from '../src/layout/level'
import { fresh } from '../src/model/state'
import type { SRule } from '../src/model/program'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const circle = (R: number, step = 0.05): Ring => {
  const n = Math.round((2 * Math.PI * R) / step)
  return Array.from({ length: n }, (_, i) => [R * Math.cos((2 * Math.PI * i) / n), R * Math.sin((2 * Math.PI * i) / n)] as Pt)
}
function input(plate: Shape, cores: Shape, patch: Partial<LevelInput> = {}): LevelInput {
  const s = fresh()
  return { plate, cores, d: 8.1, cw: 1.6, num: 5, seed: 1187, types: s.unitTypes, rooms: s.rooms, rules: s.rules, mix: { studio: 30, br1: 45, br2: 25 }, ...patch }
}
const POINT = toShape([sq(0, 0, 30, 30)])
const CORE = toShape([sq(10.5, 10.5, 19.5, 19.5)])

function sound(L: LevelLayout, plate: Shape, cores: Shape) {
  for (let i = 0; i < L.units.length; i++) {
    for (let j = i + 1; j < L.units.length; j++) expect(area(intersection(L.units[i].shape, L.units[j].shape))).toBeLessThan(0.01)
    expect(area(difference(L.units[i].shape, plate))).toBeLessThan(0.01)
    expect(Number.isFinite(L.units[i].area)).toBe(true)
  }
  expect(L.unitA + L.leftover).toBeLessThanOrEqual(area(plate) - area(cores) + 0.5)
}

test('a 30 × 30 point tower with a 9 × 9 core: units around, none overlapping, all inside', () => {
  const L = layoutLevel(input(POINT, CORE))
  expect(L.units.length).toBeGreaterThan(8)
  sound(L, POINT, CORE)
})

test('a 45 × 18 slab has units on both long sides, each entering from the corridor', () => {
  const plate = toShape([sq(0, 0, 45, 18)])
  const L = layoutLevel(input(plate, []))
  const ys = L.units.map((u) => u.shape[0].reduce((a, p) => a + p[1], 0) / u.shape[0].length)
  expect(ys.some((y) => y < 9)).toBe(true)
  expect(ys.some((y) => y > 9)).toBe(true)
  const near = offset(toShape([sq(0, 8.1, 45, 9.9)]), 0.5)
  for (const u of L.units) expect(inside(near, u.entry)).toBe(true)
  sound(L, plate, [])
})

test('deterministic: same input, same units; another seed differs', () => {
  const sig = (L: LevelLayout) => L.units.map((u) => u.type + ':' + u.area.toFixed(2)).join(',')
  expect(sig(layoutLevel(input(POINT, CORE)))).toBe(sig(layoutLevel(input(POINT, CORE))))
  const others = [1, 2, 3, 4].map((k) => sig(layoutLevel(input(POINT, CORE, { seed: 1187 + k }))))
  expect(new Set([sig(layoutLevel(input(POINT, CORE))), ...others]).size).toBeGreaterThan(1)
})

test('corners prefer 2BR', () => {
  const rules: SRule[] = [{ id: 'c', kind: 'corners', on: true, strength: 'required', types: ['br2'] }]
  const L = layoutLevel(input(POINT, CORE, { rules }))
  const corners = L.units.filter((u) => u.corner)
  expect(corners.length).toBeGreaterThanOrEqual(3)
  expect(corners.filter((u) => u.type === 'br2').length).toBeGreaterThanOrEqual(3)
})

test('at least one 2BR per level (required) holds where it can', () => {
  const rules: SRule[] = [{ id: 'a', kind: 'at-least', on: true, strength: 'required', types: ['br2'], n: 1 }]
  const L = layoutLevel(input(POINT, CORE, { rules, mix: { studio: 60, br1: 40, br2: 0 } }))
  expect(L.units.filter((u) => u.type === 'br2').length).toBeGreaterThanOrEqual(1)
  expect(L.ruleFail).toBeUndefined()
})

test('levels-only studio (required) makes every unit a studio', () => {
  const rules: SRule[] = [{ id: 'o', kind: 'levels-only', on: true, strength: 'required', types: ['studio'], a: 1, b: 99 }]
  const L = layoutLevel(input(toShape([sq(0, 0, 45, 18)]), [], { rules }))
  expect(L.units.length).toBeGreaterThan(0)
  expect(L.units.every((u) => u.type === 'studio')).toBe(true)
})

test('a 10 × 10 plate gives no units, says why, and nothing is NaN', () => {
  const plate = toShape([sq(0, 0, 10, 10)])
  const L = layoutLevel(input(plate, []))
  expect(L.units).toEqual([])
  expect(L.issues).toContain('No unit fits this plate')
  expect(L.leftover).toBeGreaterThan(0)
  expect(Number.isFinite(L.unitA + L.leftover)).toBe(true)
})

test('a 6 m-wide bar gives no units and the same issue', () => {
  const L = layoutLevel(input(toShape([sq(0, 0, 60, 6)]), []))
  expect(L.units).toEqual([])
  expect(L.issues).toContain('No unit fits this plate')
})

test('a circle R 20 drawn from 5 cm segments gets units all around', () => {
  const plate = toShape([circle(20)])
  const L = layoutLevel(input(plate, []))
  expect(L.units.length).toBeGreaterThan(6)
  sound(L, plate, [])
})

test('rooms are inside their unit', () => {
  const L = layoutLevel(input(POINT, CORE))
  let n = 0
  for (const u of L.units) for (const r of u.rooms) { n++; expect(area(difference(r.shape, u.shape))).toBeLessThan(0.01) }
  expect(n).toBeGreaterThan(L.units.length * 3)
})

test('a unit whose programme cannot fit says why and still counts', () => {
  const s = fresh()
  const tight = [{ ...s.unitTypes[2], wMin: 4.2, wMax: 6.0 }]
  const L = layoutLevel(input(toShape([sq(0, 0, 45, 18)]), [], { types: tight, mix: { br2: 100 } }))
  expect(L.units.length).toBeGreaterThan(0)
  expect(L.units[0].issue).toMatch(/facade rooms need/)
  expect(L.units[0].rooms).toEqual([])
})

test('facing: units on the north side of a slab face N', () => {
  const L = layoutLevel(input(toShape([sq(0, 0, 45, 18)]), []))
  const north = L.units.filter((u) => u.shape[0].every((p) => p[1] > 9 - 1e-6))
  expect(north.length).toBeGreaterThan(0)
  for (const u of north) expect(u.facing).toContain('N')
})

test('on ordinary plates every unit gets its rooms (no unit with an issue)', () => {
  for (const [plate, cores] of [[POINT, CORE], [toShape([sq(0, 0, 45, 18)]), []], [toShape([sq(0, 0, 40, 40), sq(14, 14, 26, 26)]), toShape([sq(0, 16, 6, 24)])]] as [Shape, Shape][]) {
    const L = layoutLevel(input(plate, cores))
    expect(L.units.filter((u) => u.issue).map((u) => u.type + ' ' + u.w.toFixed(2) + ': ' + u.issue)).toEqual([])
  }
})

test('facade wedges between chords join their units: a circle leaves < 10 % of the unit zone unassigned', () => {
  const plate = toShape([circle(20)])
  const L = layoutLevel(input(plate, []))
  expect(L.leftover / (L.unitA + L.leftover)).toBeLessThan(0.1)
  sound(L, plate, [])
})

test('a core that blocks the corridor for metres splits the band instead of emptying it (demo L, FP_A)', () => {
  const plate = toShape([[[0, 0], [42, 0], [42, 18], [20, 18], [20, 40], [0, 40]]])
  const cores = toShape([sq(7, 24, 14, 32), sq(28, 5, 35, 11)])
  const L = layoutLevel(input(plate, cores))
  // was 64 % before splitting; what is left (~21 %) is facade whose doors would land on a core that cuts the
  // corridor, which the reach rule (spec §5.6: the door touches the corridor K) leaves unassigned
  expect(L.leftover / (L.unitA + L.leftover)).toBeLessThan(0.25)
  expect(L.units.length).toBeGreaterThan(9)
  sound(L, plate, cores)
})

test('a plate in UTM coordinates gets the same layout as at the origin', () => {
  const mv = (r: Ring, dx: number, dy: number): Ring => r.map((p) => [p[0] + dx, p[1] + dy] as Pt)
  const FP: Ring = [[0, 0], [42, 0], [42, 18], [20, 18], [20, 40], [0, 40]]
  const at = (dx: number, dy: number) => layoutLevel(input(toShape([mv(FP, dx, dy)]), toShape([mv(sq(7, 24, 14, 32), dx, dy), mv(sq(28, 5, 35, 11), dx, dy)])))
  const a = at(0, 0), b = at(483_217.4, 2_141_905.8)
  expect(b.units.map((u) => u.type)).toEqual(a.units.map((u) => u.type))
  expect(Math.abs(b.unitA - a.unitA)).toBeLessThan(0.01)
  expect(b.units[0].entry[0] - a.units[0].entry[0]).toBeCloseTo(483_217.4, 3)
})

test('circles of other vertex counts are sound too (R 20 from 2500 points)', () => {
  for (const n of [2500, 2400, 2600]) {
    const plate = toShape([Array.from({ length: n }, (_, i) => [20 * Math.cos((2 * Math.PI * i) / n), 20 * Math.sin((2 * Math.PI * i) / n)] as Pt)])
    sound(layoutLevel(input(plate, [])), plate, [])
  }
})
