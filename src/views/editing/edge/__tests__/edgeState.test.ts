// The On edge views' pure reads (Phase D.3 task 10): the slot under a point of an edge, as the engine reads the edge (`EdgeInfo`), in any frame.
import { describe, expect, it } from 'vitest'
import type { EdgeInfo } from '../../../../engine/edge/onEdge.ts'
import { countAtSlot, slideLabel, slotAt } from '../edgeState.ts'

const slots = [0, 1, 2, 3].map((k) => ({ k: k + 5, from: k * 3, to: (k + 1) * 3, group: 0 }))
const edge = (over: Partial<EdgeInfo> = {}): EdgeInfo => ({ id: 'e1', name: 'E1', a: { x: 0, y: 0 }, b: { x: 12, y: 0 }, out: { x: 0, y: -1 }, origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, slots, ...over })

describe('slotAt', () => {
  it('the slot whose stretch of the edge holds the point, by its number', () => {
    expect(slotAt(edge(), { x: 1, y: -5 })).toBe(5)
    expect(slotAt(edge(), { x: 4, y: 0 })).toBe(6)
    expect(slotAt(edge(), { x: 11.9, y: 3 })).toBe(8)
  })
  it('a point past the ends is held to the first or the last', () => {
    expect(slotAt(edge(), { x: -40, y: 0 })).toBe(5)
    expect(slotAt(edge(), { x: 99, y: 0 })).toBe(8)
  })
  it('in a turned frame: along the edge’s own direction', () => {
    const turned = edge({ origin: { x: 10, y: 10 }, dir: { x: 0, y: 1 } })
    expect(slotAt(turned, { x: 0, y: 14 })).toBe(6)
  })
  it('an edge without slots has none', () => {
    expect(slotAt(edge({ slots: [], refused: 'no' }), { x: 1, y: 0 })).toBeNull()
  })
})

describe('slideLabel', () => {
  it('says the modules, with its sign', () => {
    expect(slideLabel(3)).toBe('3 modules')
    expect(slideLabel(-1)).toBe('-1 module')
    expect(slideLabel(0)).toBe('0 modules')
  })
})

describe('the count a pill asks for (Phase D.3 task 11)', () => {
  const run = { lo: 25, hi: 30, held: 4, slots: [25, 26, 29, 30] }
  it('past the end of the run: the slots between; back along it: what the wall holds past that slot is taken', () => {
    expect(countAtSlot(run, 'end', 33)).toBe(7)
    expect(countAtSlot(run, 'end', 26)).toBe(2)
    expect(countAtSlot(run, 'end', 30)).toBe(4)
    expect(countAtSlot(run, 'end', 20)).toBe(0)
  })
  it('the start pill is the same the other way', () => {
    expect(countAtSlot(run, 'start', 22)).toBe(7)
    expect(countAtSlot(run, 'start', 29)).toBe(2)
    expect(countAtSlot(run, 'start', 25)).toBe(4)
  })
})
