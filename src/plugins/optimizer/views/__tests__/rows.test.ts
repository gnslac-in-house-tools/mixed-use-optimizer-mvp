// What the Specimens tab lists (Decision "Specimens tab"): the specimens as read, their front, the most balanced, the
// list as shown and sorted, the scatter's own axes, and the figures in a narrow column.
import { describe, expect, it } from 'vitest'
import { paretoFront, type Specimen } from '../../engine/nsga2.ts'
import type { Described } from '../../run/protocol.ts'
import { against, compact, defaultAxes, extent, kneeOf, listed, rowsOf } from '../specimens/rows.ts'
import { PROBLEM, SPECIMENS } from './fixtures.ts'

const rows = rowsOf(PROBLEM, SPECIMENS, paretoFront(SPECIMENS))
const ids = (rs: { s: Specimen }[]) => rs.map((r) => r.s.id)

describe('the specimens as Specimens lists them', () => {
  it('reads a max objective as it is, leaves out the refused, marks the front and the feasible', () => {
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5])
    expect(rows[0].read).toEqual([100, 30_000, 424.2])
    expect(rows.filter((r) => r.front).map((r) => r.s.id)).toEqual([1, 2, 3])
    expect(rows.find((r) => r.s.id === 5)!.feasible).toBe(false)
  })

  it('the most balanced of the front is the nearest the best of every objective at once', () => {
    expect(kneeOf(rows)).toBe(2)
    expect(kneeOf(rows.filter((r) => !r.front))).toBeNull()
  })

  it('lists a Show, inside the filters, the feasible first, by balance, an objective or the newest', () => {
    expect(ids(listed(rows, { show: 'front', sort: 'balanced', filters: {} }))).toEqual([2, 3, 1])
    // free ground is maximized: the most first
    expect(ids(listed(rows, { show: 'front', sort: 1, filters: {} }))).toEqual([3, 2, 1])
    expect(ids(listed(rows, { show: 'all', sort: 'balanced', filters: {} }))).toEqual([2, 3, 1, 4, 5])
    expect(ids(listed(rows, { show: 'feasible', sort: 'newest', filters: {} }))).toEqual([4, 3, 2, 1])
    expect(ids(listed(rows, { show: 'all', sort: 'balanced', filters: { 0: [100, 200] } }))).toEqual([2, 1, 4])
  })

  it('the scatter takes the two objectives that differ most along the front, never a flat one', () => {
    expect(defaultAxes(rows, PROBLEM)).toEqual([0, 1])
    // brief Δ first in the problem: it hardly moves (a fraction of a m²), so the other two
    const flatFirst: Described = { ...PROBLEM, objectives: [PROBLEM.objectives[2], PROBLEM.objectives[0], PROBLEM.objectives[1]] }
    const turned = SPECIMENS.map((s) => ({ ...s, objectives: [s.objectives[2], s.objectives[0], s.objectives[1]] }))
    expect(defaultAxes(rowsOf(flatFirst, turned, paretoFront(turned)), flatFirst)).toEqual([1, 2])
    // only one that moves: against the generation
    const one: Described = { ...PROBLEM, objectives: [PROBLEM.objectives[2], PROBLEM.objectives[0]] }
    const pairs = SPECIMENS.map((s) => ({ ...s, objectives: [s.objectives[2], s.objectives[0]] }))
    expect(defaultAxes(rowsOf(one, pairs, paretoFront(pairs)), one)).toEqual(['generation', 1])
  })

  it('a span is never thinner than a few % of its values: a rounding draws flat', () => {
    const [lo, hi] = extent([424, 424.2])
    expect(lo).toBeLessThan(420)
    expect(hi).toBeGreaterThan(428)
    expect((lo + hi) / 2).toBeCloseTo(424.1)
    expect(extent([100, 300])).toEqual([100, 300])
    expect(extent([])).toEqual([0, 1])
  })

  it('says how a specimen stands against the design, and its figures in a narrow column', () => {
    expect(against(100, 300, 'min')).toEqual({ delta: -200, better: true })
    expect(against(30_000, 12_000, 'max')).toEqual({ delta: 18_000, better: true })
    expect(against(450, 424, 'min').better).toBe(false)
    expect(against(424, 424, 'min').better).toBeNull()
    expect([0, 9.87, 12.34, 1_234, 23_456].map((v) => compact(v, 'm2'))).toEqual(['0', '9.9', '12', '1.2k', '23k'])
    expect(compact(0.41, 'pct')).toBe('41%')
    expect(compact(3, 'count')).toBe('3')
  })
})
