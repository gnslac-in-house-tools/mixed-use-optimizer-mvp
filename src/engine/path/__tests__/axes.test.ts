import { describe, expect, it } from 'vitest'
import { axesOf } from '../join.ts'

const road = (...pts: [number, number][]) => ({ points: pts.map(([x, y]) => ({ x, y })), width: 8 })

describe('axesOf', () => {
  it('a T: the branch axis stops at the main road’s strip, the main one runs through', () => {
    const [main, branch] = axesOf([road([-50, 0], [50, 0]), road([0, 60], [0, 0])])
    expect(main).toEqual([[{ x: -50, y: 0 }, { x: 50, y: 0 }]])
    expect(branch).toHaveLength(1)
    const [a, b] = branch[0]
    expect(a).toEqual({ x: 0, y: 60 })
    expect(b.x).toBeCloseTo(0, 6)
    expect(b.y).toBeCloseTo(4, 6)
  })
  it('an end-to-end join runs through: both axes keep their whole length', () => {
    const axes = axesOf([road([-50, 0], [0, 0]), road([0, 0], [50, 0])])
    expect(axes[0]).toEqual([[{ x: -50, y: 0 }, { x: 0, y: 0 }]])
    expect(axes[1]).toEqual([[{ x: 0, y: 0 }, { x: 50, y: 0 }]])
  })
  it('a crossing (X) runs through both', () => {
    const axes = axesOf([road([-50, 0], [50, 0]), road([0, -50], [0, 50])])
    expect(axes[0]).toEqual([[{ x: -50, y: 0 }, { x: 50, y: 0 }]])
    expect(axes[1]).toEqual([[{ x: 0, y: -50 }, { x: 0, y: 50 }]])
  })
  it('a branch that ends short of the strip is left whole; a road alone is its own axis', () => {
    expect(axesOf([road([0, 60], [0, 10]), road([-50, 0], [50, 0])])[0]).toEqual([[{ x: 0, y: 60 }, { x: 0, y: 10 }]])
    expect(axesOf([road([0, 0], [10, 0])])).toEqual([[[{ x: 0, y: 0 }, { x: 10, y: 0 }]]])
  })
})
