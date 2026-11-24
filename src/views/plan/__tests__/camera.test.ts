import { describe, expect, it } from 'vitest'
import { fit, pan, pathOf, toWorld, viewBoxOf, zoomAt } from '../camera.ts'

const size = { w: 800, h: 600 }

describe('plan camera', () => {
  it('fit centres the content and picks the limiting side', () => {
    // 400 × 100 m with 8 % margin each side → 464 m wide must fit 800 px.
    const v = fit({ minX: 0, minY: 0, maxX: 400, maxY: 100 }, size)
    expect(v.cx).toBe(200)
    expect(v.cy).toBe(50)
    expect(v.scale).toBeCloseTo(800 / 464)
  })

  it('fit with a window over the left: whole and centred in what is left (the survey window)', () => {
    // 300 px covered: 500 px left for 464 m; the content's middle 150 px right of the screen's
    const v = fit({ minX: 0, minY: 0, maxX: 400, maxY: 100 }, size, undefined, 300)
    expect(v.scale).toBeCloseTo(500 / 464)
    const left = toWorld(v, size, 300, 300).x
    const right = toWorld(v, size, 800, 300).x
    expect((left + right) / 2).toBeCloseTo(200)
    expect(left).toBeLessThan(0)
  })

  it('the screen centre is the view centre; screen y grows downwards', () => {
    const v = { cx: 10, cy: 20, scale: 2 }
    expect(toWorld(v, size, 400, 300)).toEqual({ x: 10, y: 20 })
    expect(toWorld(v, size, 400, 200).y).toBe(70) // 100 px up = 50 m north
  })

  it('zoom keeps the point under the cursor still', () => {
    const v = { cx: 0, cy: 0, scale: 1 }
    const before = toWorld(v, size, 650, 120)
    const after = toWorld(zoomAt(v, size, 650, 120, 3, 0.1, 100), size, 650, 120)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('pan moves the drawing with the pointer', () => {
    const v = pan({ cx: 0, cy: 0, scale: 2 }, 20, 10) // 20 px right, 10 px down
    expect(v).toEqual({ cx: -10, cy: 5, scale: 2 })
  })

  it('viewBox and paths flip y', () => {
    expect(viewBoxOf({ cx: 0, cy: 10, scale: 2 }, size)).toBe('-200 -160 400 300')
    expect(pathOf([[{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 4 }]])).toBe('M0,0L1,-2L3,-4Z')
  })
})
