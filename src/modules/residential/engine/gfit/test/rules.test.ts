import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { priceFactor, ruleStatus, ruleText, RULE_CATALOG } from '../src/model/rules.ts'
import { RULE_KINDS, UNITS0 } from '../src/model/program.ts'
import type { SRule } from '../src/model/program.ts'
import type { LevelLayout, PlacedUnit } from '../src/layout/level.ts'

const types = UNITS0()
const unit = (type: string, patch: Partial<PlacedUnit> = {}): PlacedUnit => ({
  id: 'u', type, shape: [], area: 50, w: 6, corner: false, facing: ['S'], rooms: [], entry: [0, 0], ...patch,
})
const level = (units: PlacedUnit[]): LevelLayout => ({ units, unitA: 0, leftover: 0, issues: [], attempts: 1 })
const R = (r: Partial<SRule> & Pick<SRule, 'kind'>): SRule => ({ id: 'r', on: true, strength: 'preferred', types: [], ...r })

test('price-levels +8 % from 15 gives 1.08 on L15 and 1 on L14', () => {
  const rules = [R({ kind: 'price-levels', n: 15, p: 8 })]
  expect(priceFactor(unit('br1'), 15, rules)).toBeCloseTo(1.08, 10)
  expect(priceFactor(unit('br1'), 14, rules)).toBe(1)
})

test('corner +5 % and facing N +3 % with price-levels on L20 multiply', () => {
  const rules = [R({ kind: 'price-levels', n: 15, p: 8 }), R({ kind: 'price-corner', p: 5 }), R({ kind: 'price-facing', dir: 'N', p: 3 })]
  expect(priceFactor(unit('br2', { corner: true, facing: ['N', 'E'] }), 20, rules)).toBeCloseTo(1.08 * 1.05 * 1.03, 10)
  expect(priceFactor(unit('br2', { corner: true, facing: ['S'] }), 20, rules)).toBeCloseTo(1.08 * 1.05, 10)
  expect(priceFactor(unit('br2', { corner: true, facing: ['N'] }), 20, rules.map((r) => ({ ...r, on: false })))).toBe(1)
})

test('at-least status counts failing levels', () => {
  const ok = level([unit('br2'), unit('studio')])
  const bad = level([unit('studio'), unit('br1')])
  const layouts = [new Map([[2, ok], [3, bad], [4, bad], [5, ok]])]
  const r = R({ kind: 'at-least', types: ['br2'], n: 1 })
  expect(ruleStatus(r, layouts, types)).toEqual({ ok: false, text: '✕ 2 levels have no 2BR' })
  expect(ruleStatus(r, [new Map([[2, ok], [3, ok]])], types)).toEqual({ ok: true, text: '✓ 2 / 2 levels' })
  expect(ruleStatus({ ...r, on: false }, layouts, types)).toEqual({ ok: null, text: 'off' })
})

test('corners status: share of corner units that got the type, n/a without corners', () => {
  const r = R({ kind: 'corners', types: ['br2'] })
  const L = level([unit('br2', { corner: true }), unit('studio', { corner: true }), unit('br1')])
  expect(ruleStatus(r, [new Map([[2, L]])], types)).toEqual({ ok: true, text: '✓ 1 / 2 corners' })
  expect(ruleStatus(r, [new Map([[2, level([unit('br1')])]])], types)).toEqual({ ok: null, text: 'n/a · no corners' })
})

test('a rule naming a deleted type is n/a', () => {
  const r = R({ kind: 'at-least', types: ['gone'], n: 1 })
  expect(ruleStatus(r, [new Map([[2, level([unit('br2')])]])], types)).toEqual({ ok: null, text: 'n/a · its unit type was deleted' })
  const t = ruleText(r, types).parts
  expect(t).toContainEqual({ k: 'types', v: '?' })
})

test('rule text is a sentence with parameter chips', () => {
  const t = ruleText(R({ kind: 'levels-only', a: 5, b: 8, types: ['studio', 'br1'] }), types).parts
  expect(t).toEqual(['Levels ', { k: 'a', v: '5' }, '–', { k: 'b', v: '8' }, ' only ', { k: 'types', v: 'Studio, 1BR' }])
  const nn = ruleText(R({ kind: 'never-next', types: ['studio', 'br2'] }), types).parts
  expect(nn).toEqual(['Never ', { k: 'type', v: 'Studio' }, ' next to ', { k: 'type', v: '2BR' }])
  const pf = ruleText(R({ kind: 'price-facing', dir: 'N', p: 3 }), types).parts
  expect(pf).toEqual(['Units facing ', { k: 'dir', v: 'N' }, ' sell at +', { k: 'p', v: '3' }, '%'])
})

test('the catalog makes one rule of each kind with safe ids', () => {
  expect(RULE_CATALOG.map((c) => c.kind)).toEqual(RULE_KINDS)
  const made = RULE_CATALOG.map((c) => c.make(types))
  for (const [i, r] of made.entries()) {
    expect(r.kind).toBe(RULE_KINDS[i])
    expect(r.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(r.on).toBe(true)
    for (const t of r.types) expect(types.map((x) => x.id)).toContain(t)
    expect(ruleText(r, types).parts.length).toBeGreaterThan(0)
  }
  expect(new Set(made.map((r) => r.id)).size).toBe(made.length)
  expect(RULE_CATALOG.every((c) => c.label.length > 0)).toBe(true)
})
