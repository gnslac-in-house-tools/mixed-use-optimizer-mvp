import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { normMix, removeRoomType, removeUnitType } from '../src/model/program'
import { fresh, parseSaved } from '../src/model/state'

const j = (v: unknown) => JSON.stringify(v)

test('fresh() has 10 rooms, 3 unit types and the 4 default rules', () => {
  const s = fresh()
  expect(s.rooms.length).toBe(10)
  expect(s.unitTypes.map((t) => t.id)).toEqual(['studio', 'br1', 'br2'])
  expect(s.rules.map((r) => r.kind)).toEqual(['corners', 'at-least', 'core-face', 'price-levels'])
  const b = s.options[0].buildings[0]
  expect(b.mix).toEqual({ studio: 30, br1: 45, br2: 25 })
  expect(b.unitDepth).toBe(8.1)
  expect(b.corridor).toBe(1.6)
})

test('a v0.1 save migrates mix, residential prices and rules', () => {
  const s = fresh() as unknown as Record<string, any>
  delete s.rooms; delete s.unitTypes
  s.options[0].buildings[0].mix = [20, 50, 30]
  delete s.options[0].buildings[0].unitDepth
  s.progs[0].units = [{ r: 0.6, p: 4100 }, { r: 0.9, p: 3900 }, { r: 1.3, p: 3700 }]
  s.rules = [{ id: 'corner2br', on: false, h: 'x' }, { id: 'premium', on: true, h: 'x' }]
  s.cg.prem = 10
  const r = parseSaved(j(s)).state
  expect(r.options[0].buildings[0].mix).toEqual({ studio: 20, br1: 50, br2: 30 })
  expect(r.options[0].buildings[0].unitDepth).toBe(8.1)
  expect(r.unitTypes[1].price).toBe(3900)
  expect(r.unitTypes[2].stalls).toBe(1.3)
  expect(r.rules).toContainEqual(expect.objectContaining({ kind: 'corners', on: false, types: ['br2'] }))
  expect(r.rules).toContainEqual(expect.objectContaining({ kind: 'price-levels', n: 15, p: 10, on: true }))
  expect(r.rooms.length).toBe(10)
})

test('unit types, rooms and rules are sanitized', () => {
  const s = fresh() as unknown as Record<string, any>
  s.unitTypes[0] = { ...s.unitTypes[0], id: 'a"b', color: 'red" x', wMin: 'x', rooms: ['R-01', '<b>'] }
  s.unitTypes[1] = { ...s.unitTypes[1], wMin: 9, wMax: 6 }
  s.rooms[0] = { ...s.rooms[0], name: 7, kind: 'pool', area: 'x' }
  s.rules.push({ id: 'zz', kind: 'explode', on: true, strength: 'required', types: [] })
  s.rules.push({ id: 'z<b>', kind: 'levels-only', on: true, strength: 'nope', types: ['br1', '"x'], a: 'one', b: 9 })
  const r = parseSaved(j(s)).state
  const t0 = r.unitTypes[0]
  expect(t0.id).toMatch(/^[A-Za-z0-9_-]+$/)
  expect(t0.color).toMatch(/^#[0-9a-fA-F]{6}$/)
  expect(t0.wMin).toBe(4.2)
  expect(t0.rooms).toEqual(['R-01'])
  expect([r.unitTypes[1].wMin, r.unitTypes[1].wMax]).toEqual([6, 9])
  expect(r.rooms[0].kind).toBe('living')
  expect(typeof r.rooms[0].name).toBe('string')
  expect(r.rules.some((x) => (x.kind as string) === 'explode')).toBe(false)
  const lo = r.rules.find((x) => x.kind === 'levels-only')!
  expect(lo.id).toMatch(/^[A-Za-z0-9_-]+$/)
  expect(lo.strength).toBe('preferred')
  expect(lo.types).toEqual(['br1'])
  expect(lo.a).toBe(2)
  expect(lo.b).toBe(9)
})

test('removing a unit type renormalises mixes and cleans rules', () => {
  const s = fresh()
  s.options[0].buildings[0].mix = { studio: 30, br1: 40, br2: 30 }
  s.rules.push({ id: 'r9', kind: 'levels-only', on: true, strength: 'required', types: ['br1', 'br2'], a: 2, b: 10 })
  expect(removeUnitType(s, 'br1')).toBe(true)
  expect(s.unitTypes.map((t) => t.id)).toEqual(['studio', 'br2'])
  expect(s.options[0].buildings[0].mix).toEqual({ studio: 50, br2: 50 })
  expect(s.rules.find((r) => r.id === 'r9')!.types).toEqual(['br2'])
  removeUnitType(s, 'studio')
  expect(removeUnitType(s, 'br2')).toBe(false)
  expect(s.unitTypes).toHaveLength(1)
})

test('normMix: all zeros gives the first type 100; unknown ids are dropped; sums to 100', () => {
  const types = fresh().unitTypes
  expect(normMix({ studio: 0, br1: 0, br2: 0 }, types)).toEqual({ studio: 100, br1: 0, br2: 0 })
  expect(normMix({ studio: 1, ghost: 5 }, types)).toEqual({ studio: 100, br1: 0, br2: 0 })
  const m = normMix({ studio: 1, br1: 1, br2: 1 }, types)
  expect(m.studio + m.br1 + m.br2).toBe(100)
})

test('removing a room type cleans programmes', () => {
  const s = fresh()
  expect(removeRoomType(s, 'R-05')).toBe(3)
  expect(s.unitTypes.every((t) => !t.rooms.includes('R-05'))).toBe(true)
  expect(s.rooms.some((r) => r.id === 'R-05')).toBe(false)
})
