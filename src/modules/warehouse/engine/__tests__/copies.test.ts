// A copy's place on the plan (Decision "Warehouse copies"): the type's frame on the plan and back.
import { describe, expect, it } from 'vitest'
import { fromPlace, onPlace } from '../copies.ts'

describe('fromPlace', () => {
  it('undoes onPlace', () => {
    for (const angle of [0, 30, -120]) {
      const pl = { x: 40, y: -25, angle }
      for (const q of [{ x: 0, y: 0 }, { x: 12.5, y: 7 }, { x: -30, y: 90 }]) {
        const back = fromPlace(pl, onPlace(pl, q))
        expect(back.x).toBeCloseTo(q.x, 9)
        expect(back.y).toBeCloseTo(q.y, 9)
      }
    }
  })
})
