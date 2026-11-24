import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { solveBand } from '../src/layout/band'
import type { BandRules, BandSpec } from '../src/layout/band'
import { rng } from '../src/layout/rng'

const W = { studio: [4.2, 4.8, 5.4, 6.0], br1: [6.0, 6.6, 7.2, 7.8, 8.4], br2: [9.6, 10.2, 10.8, 11.4] }
const rules = (patch: Partial<BandRules> = {}): BandRules => ({
  types: Object.entries(W).map(([id, widths]) => ({ id, widths })),
  mix: { studio: 0.3, br1: 0.4, br2: 0.3 },
  along: () => 1,
  ...patch,
})
const band = (length: number, extra: Partial<BandSpec> = {}): BandSpec => ({ name: 'T', length, reach: () => true, entry: [0.45, 1.35], ...extra })
const counts = (): Record<string, number> => ({})

test('fills a band exactly with no gaps', () => {
  for (const L of [12.6, 18, 21.3, 27.6, 33.9, 45]) {
    const r = solveBand(band(L), rules(), rng(3), counts())
    expect(r.ok).toBe(true)
    if (!r.ok) continue
    expect(r.units.reduce((a, u) => a + u.w, 0)).toBeCloseTo(L, 6)
    let x = 0
    for (const u of r.units) { expect(u.x).toBeCloseTo(x, 6); x += u.w }
  }
})

test('same seed, same layout; other seeds differ', () => {
  expect(solveBand(band(27.6), rules(), rng(42), counts())).toEqual(solveBand(band(27.6), rules(), rng(42), counts()))
  const seen = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(solveBand(band(27.6), rules(), rng(s), counts()))))
  expect(seen.size).toBeGreaterThanOrEqual(2)
})

test('the mix is followed', () => {
  const c = counts()
  for (let s = 1; s <= 20; s++) solveBand(band(60), rules(), rng(s), c)
  const tot = Object.values(c).reduce((a, b) => a + b, 0)
  expect(Math.abs(c.studio / tot - 0.3)).toBeLessThan(0.1)
  expect(Math.abs(c.br1 / tot - 0.4)).toBeLessThan(0.1)
  expect(Math.abs(c.br2 / tot - 0.3)).toBeLessThan(0.1)
})

test('a forbidden along pair never appears side by side', () => {
  const R = rules({ along: (a, b) => (a === 'studio' && b === 'studio' ? 0 : 1) })
  for (let s = 1; s <= 20; s++) {
    const r = solveBand(band(30), R, rng(s), counts())
    if (!r.ok) continue
    for (let i = 1; i < r.units.length; i++) expect(r.units[i - 1].t === 'studio' && r.units[i].t === 'studio').toBe(false)
  }
})

test('reach: entries always reach; a band the corridor cannot serve fails instead of cheating', () => {
  const within = (lim: number) => (a: number, b: number) => a >= -1e-6 && b <= lim + 1e-6
  const bad = solveBand(band(30, { reach: within(14) }), rules(), rng(9), counts())
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.slot! * 0.3).toBeGreaterThan(14)
  for (let s = 1; s <= 10; s++) {
    const r = solveBand(band(30, { reach: within(20) }), rules(), rng(s), counts())
    if (!r.ok) continue
    for (const u of r.units) {
      const a = u.flip ? u.x + u.w - 1.35 : u.x + 0.45
      expect(a + 0.9).toBeLessThanOrEqual(20 + 1e-6)
    }
  }
})

test('bias steers a type', () => {
  let n = 0
  for (let s = 1; s <= 20; s++) {
    const r = solveBand(band(30, { bias: (t, x) => (t === 'br2' && x < 12 ? 50 : 1) }), rules(), rng(s), counts())
    if (r.ok && r.units[0].t === 'br2') n++
  }
  expect(n).toBeGreaterThanOrEqual(18)
})

test('an all-zero mix still fills the band', () => {
  const r = solveBand(band(30), rules({ mix: { studio: 0, br1: 0, br2: 0 } }), rng(1), counts())
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.units.reduce((a, u) => a + u.w, 0)).toBeCloseTo(30, 6)
})

test('any list of types works (four types, one of them new)', () => {
  const R = rules({ types: [...rules().types, { id: 'br3', widths: [12, 12.6, 13.2] }], mix: { studio: 0.2, br1: 0.2, br2: 0.2, br3: 0.4 } })
  const c = counts()
  for (let s = 1; s <= 10; s++) expect(solveBand(band(48), R, rng(s), c).ok).toBe(true)
  expect(c.br3).toBeGreaterThan(0)
})

test('a band whose corridor is blocked for metres reports every slot no unit can serve', () => {
  // the corridor is blocked from 0 to 14 m: a unit's door (0.45–1.35 m from either end) must land beyond 14 m
  const res = solveBand(band(30, { reach: (x0) => x0 >= 14 }), rules(), rng(3), counts())
  expect(res.ok).toBe(false)
  if (res.ok) return
  expect(res.slot).toBe(0)
  const slots = res.slots ?? []
  // a 2BR of 11.4 m mirrored reaches 14 m from 3.95 m on: slots up to ~2.6 m have no unit at all
  expect(slots.length).toBeGreaterThan(5)
  expect(slots.every((i) => i * 0.3 < 14)).toBe(true)
  expect(slots).toEqual([...slots].sort((a, b) => a - b))
})
