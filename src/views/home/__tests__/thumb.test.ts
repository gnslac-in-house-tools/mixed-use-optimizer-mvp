// A terrain's small plan (Decision "Home libraries"): fitted to its contours when it has no boundary, however many
// corners a survey has (the engine takes no more than about 100k arguments in one call).
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../model/schema.ts'
import { terrainThumb } from '../thumb.ts'

describe('terrainThumb', () => {
  it('a survey of 200k corners and no boundary: drawn, fitted to its contours', () => {
    const points: Point[] = Array.from({ length: 200_000 }, (_, i) => ({ x: i / 100, y: Math.sin(i / 1000) }))
    const svg = terrainThumb({ boundary: null, terrain: { contours: [{ points }], points: [] } })
    expect(svg).toMatch(/^<svg/)
  })

  it('nothing drawn: no plan', () => {
    expect(terrainThumb({ boundary: null })).toBeUndefined()
  })
})
