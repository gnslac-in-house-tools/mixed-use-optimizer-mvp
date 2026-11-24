// A truck court's far edge on the shape handles (Phase D.3 task 7): a wall that carries a `value` (its depth) says it as a depth, with the range it is held to, never as a
// length; while it is dragged, how far it went.
import { describe, expect, it } from 'vitest'
import { wallText } from '../labels.ts'

describe('wallText on a court’s far edge', () => {
  const far = { value: { now: 40, lo: 5, hi: 200 } }

  it('rest: Depth, its figure and the range it is held to', () => {
    expect(wallText(far, 96, false, 0)).toBe('Depth 40 m (5–200 m)')
  })

  it('dragged: how far it went, signed', () => {
    expect(wallText({ value: { now: 45, lo: 5, hi: 200 } }, 96, true, 5)).toBe('Depth 45 m (5–200 m) · +5.00 m')
    expect(wallText({ value: { now: 35, lo: 5, hi: 200 } }, 96, true, -5)).toBe('Depth 35 m (5–200 m) · −5.00 m')
  })

  it('a figure with decimals, in the viewport’s own unit', () => {
    const ft = { unit: 'ft', fig: (m: number) => (m * 3.28084).toFixed(0), delta: (m: number) => (m * 3.28084).toFixed(1) }
    expect(wallText({ value: { now: 12.5, lo: 5, hi: 200 } }, 10, false, 0)).toBe('Depth 12.50 m (5–200 m)')
    expect(wallText(far, 96, false, 0, ft)).toBe('Depth 131 ft (16–656 ft)')
  })
})
