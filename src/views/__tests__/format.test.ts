// One format module for every figure. Money ported from Plaza-Practiko's formato tests (formatoDinero), in en-US.
import { describe, expect, it } from 'vitest'
import { figure, formatFigure, m2, money, pct } from '../format.ts'

describe('format', () => {
  it('areas and percentages as the panels show them', () => {
    expect(m2(12345.6)).toBe('12,346 m²')
    expect(pct(0.2264)).toBe('22.6%')
  })

  it('KPI figures: a big number and a small unit; nothing measured → a dash', () => {
    expect(figure(24800, 'm2')).toEqual({ value: '24,800', unit: 'm²' })
    expect(figure(297600, 'm3')).toEqual({ value: '297,600', unit: 'm³' })
    expect(figure(0.2263, 'pct')).toEqual({ value: '22.6', unit: '%' })
    expect(figure(3, 'count')).toEqual({ value: '3', unit: '' })
    expect(figure(null, 'm2')).toEqual({ value: '—', unit: '' })
    expect(formatFigure(0.6, 'pct')).toBe('60.0 %')
    expect(formatFigure(3, 'count')).toBe('3')
  })

  it('compact money: k, M, B; negative with a true minus', () => {
    expect(money(950)).toBe('$950')
    expect(money(45_200)).toBe('$45.2 k')
    expect(money(12_300_000)).toBe('$12.3 M')
    expect(money(1_200_000_000)).toBe('$1.2 B')
    expect(money(-45_200)).toBe('−$45.2 k')
    expect(money(Number.NaN)).toBe('$0')
  })
})
