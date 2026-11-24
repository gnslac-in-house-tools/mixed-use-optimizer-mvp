import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { generateRooms, minWidth } from '../src/layout/rooms'
import { ROOMS0, UNITS0 } from '../src/model/program'
import type { RoomType } from '../src/model/program'

const R = ROOMS0()
const prog = (id: string): RoomType[] => UNITS0().find((t) => t.id === id)!.rooms.map((r) => R.find((x) => x.id === r)!)
const A = (r: [number, number, number, number]) => (r[2] - r[0]) * (r[3] - r[1])
const ov = (a: number[], b: number[]) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))

test('a 1BR programme fills a 7.2 × 8.1 shell with no gaps', () => {
  const g = generateRooms(7.2, 8.1, prog('br1'), 1)
  expect(g.fail).toBeUndefined()
  expect(g.rooms.reduce((s, r) => s + A(r.r), 0)).toBeCloseTo(58.32, 6)
  g.rooms.forEach((a, i) => g.rooms.forEach((b, j) => { if (j > i) expect(ov(a.r, b.r)).toBeLessThan(1e-6) }))
  for (const k of ['living', 'kitchen', 'bed', 'bath', 'hall']) expect(g.rooms.some((x) => x.kind === k)).toBe(true)
})

test('rooms that need daylight sit on the facade (y = d)', () => {
  for (const seed of [1, 2, 3, 4]) {
    const g = generateRooms(10.2, 8.1, prog('br2'), seed)
    expect(g.fail).toBeUndefined()
    for (const r of g.rooms) if (['living', 'master', 'bed'].includes(r.kind)) expect(r.r[3]).toBeCloseTo(8.1, 6)
  }
})

test('deterministic by seed, and seeds vary', () => {
  expect(generateRooms(10.2, 8.1, prog('br2'), 3)).toEqual(generateRooms(10.2, 8.1, prog('br2'), 3))
  const seen = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(generateRooms(10.2, 8.1, prog('br2'), s).rooms.map((r) => r.r))))
  expect(seen.size).toBeGreaterThan(1)
})

test('too narrow says why', () => {
  const g = generateRooms(6, 8.1, prog('br2'), 1)
  expect(g.rooms).toEqual([])
  expect(g.fail).toMatch(/facade rooms need/)
})

test('minWidth: the studio programme fits 4.2 m, the 2BR needs at least 7.2 m', () => {
  expect(minWidth(prog('studio'), 8.1)).toBeLessThanOrEqual(4.2 + 1e-6)
  expect(minWidth(prog('br2'), 8.1)).toBeGreaterThanOrEqual(7.2)
})

test('the entry sits on the hall, on the corridor side', () => {
  const g = generateRooms(7.2, 8.1, prog('br1'), 2)
  const hall = g.rooms.find((r) => r.kind === 'hall')!
  expect(hall.r[1]).toBe(0)
  expect(g.entry).toBeGreaterThan(hall.r[0])
  expect(g.entry).toBeLessThan(hall.r[2])
})

test('an empty programme says so', () => {
  expect(generateRooms(6, 8.1, [], 1).fail).toMatch(/no rooms/)
})

test('every default unit type lays out at every width of its range (d 8.1, seeds 1–5)', () => {
  const bad: string[] = []
  for (const t of UNITS0()) {
    for (let w = t.wMin; w <= t.wMax + 1e-6; w += 0.6) for (let s = 1; s <= 5; s++) {
      const g = generateRooms(+w.toFixed(2), 8.1, prog(t.id), s)
      if (g.fail) bad.push(t.id + ' ' + w.toFixed(1) + ' s' + s + ': ' + g.fail)
    }
  }
  expect(bad).toEqual([])
})

test('a shell width off the 0.3 grid never squeezes a room below its min width', () => {
  for (const [id, w] of [['br1', 6.08], ['br1', 6.56], ['br1', 7.8], ['studio', 5.97], ['studio', 5.4]] as const) for (let s = 1; s <= 5; s++) {
    const g = generateRooms(w, 8.1, prog(id), s)
    expect(g.fail, id + ' ' + w + ' s' + s).toBeUndefined()
    for (const r of g.rooms) { const t = R.find((x) => x.name === r.name); if (t) expect(Math.min(r.r[2] - r.r[0], r.r[3] - r.r[1])).toBeGreaterThanOrEqual(t.minWidth - 1e-6) }
  }
})

test('a 2BR at any width of its range gets a door to every bedroom (seeds 1–10)', () => {
  for (const w of [9.66, 9.6, 10.06, 10.74, 11.33]) for (let s = 1; s <= 10; s++) expect(generateRooms(w, 8.1, prog('br2'), s).fail, w + ' s' + s).toBeUndefined()
})

test('a shallow unit (6 m) picks a facade depth that leaves the interior rooms room', () => {
  for (let s = 1; s <= 5; s++) expect(generateRooms(5.4, 6.0, prog('studio'), s).fail).toBeUndefined()
})
