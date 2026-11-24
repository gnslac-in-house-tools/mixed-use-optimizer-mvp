// The colours of a drawing's layers are AutoCAD's (Phases DL.2, DL.4, Decision "Drawing layers"): the named ones, the wheel, the greys;
// 7 and none are the plan's ink. (It was a case of the Site tab's Drawing layers test; the layer's row in Layers draws its swatch with it.)
import { describe, expect, it } from 'vitest'
import { aciColor, aciRgb } from '../aci.ts'

describe('the colours', () => {
  it('AutoCAD’s: the named ones, the wheel, the greys; 7 and none are the plan’s ink', () => {
    expect(aciRgb(1)).toEqual([255, 0, 0])
    expect(aciRgb(10)).toEqual([255, 0, 0])
    expect(aciRgb(11)).toEqual([255, 128, 128])
    expect(aciRgb(250)).toEqual([51, 51, 51])
    expect(aciColor(3)).toBe('rgb(0 255 0)')
    expect(aciColor(7)).toBe('var(--ink-secondary)')
    expect(aciColor(undefined)).toBe('var(--ink-secondary)')
  })
})
