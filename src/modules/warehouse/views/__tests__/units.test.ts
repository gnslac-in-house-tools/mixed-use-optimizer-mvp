// The block editor in metres or feet (Phase BE.8, spec Goal 12): everything stays stored in metres; the toggle changes
// only what is shown and typed. Feet are decimal, two decimals ("50.00 ft"); areas in ft².
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { areaText, FT, fromShown, lengthText, toShown, useUnits } from '../units.ts'

beforeEach(() => {
  act(() => useUnits.getState().setUnit('m'))
})

describe('units: the pure conversions', () => {
  it('a foot is 0.3048 m', () => expect(FT).toBe(0.3048))

  it('feet round trip does not drift', () => {
    expect(fromShown(50, 'ft')).toBe(15.24)
    expect(lengthText(15.24, 'ft')).toBe('50.00 ft')
    // typing back what is shown leaves the stored value as it was (toggling writes nothing: lengthField.test.tsx)
    expect(fromShown(Number(lengthText(15.24, 'ft').replace(' ft', '')), 'ft')).toBe(15.24)
  })

  it('metres are the identity', () => {
    expect(toShown(12.3456, 'm')).toBe(12.3456)
    expect(fromShown(12.3456, 'm')).toBe(12.3456)
    expect(lengthText(15.24, 'm')).toBe('15.24 m')
    expect(lengthText(12, 'm')).toBe('12 m')
  })

  it('areas: ft² = m² / FT²', () => {
    expect(areaText(92.903, 'ft')).toBe('1,000 ft²')
    expect(areaText(24800, 'm')).toBe('24,800 m²')
  })
})
