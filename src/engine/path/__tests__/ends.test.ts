import { describe, expect, it } from 'vitest'
import { endOn } from '../ends.ts'
import type { Path } from '../types.ts'

const line = (y: number, w = 4): Path => ({ points: [{ x: 0, y }, { x: 100, y }], stretches: [{ left: w, right: w }] })

describe('endOn', () => {
  it('a node within 0.05 m', () => {
    expect(endOn({ x: 100.02, y: 0 }, [line(0)])).toMatchObject({ on: 'node', path: 0, i: 1 })
  })
  it('a point on the paving lands on the stretch at its nearest point on the drawn line', () => {
    expect(endOn({ x: 40, y: 3 }, [line(0)])).toEqual({ on: 'stretch', path: 0, k: 0, at: { x: 40, y: 0 } })
  })
  it('past a free tip, within half the width', () => {
    expect(endOn({ x: 102, y: 0 }, [line(0)])).toMatchObject({ on: 'stretch', k: 0 })
    expect(endOn({ x: 105, y: 0 }, [line(0)])).toBeNull()
  })
  it('two pavings: the nearer', () => {
    expect(endOn({ x: 40, y: 5 }, [line(0, 8), line(8, 8)])).toMatchObject({ path: 1 })
  })
  it('none: null', () => {
    expect(endOn({ x: 40, y: 50 }, [line(0)])).toBeNull()
  })
})
