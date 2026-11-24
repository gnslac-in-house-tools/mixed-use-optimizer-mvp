import { describe, expect, it } from 'vitest'
import { placeInWindow } from '../place.ts'

const win = { width: 400, height: 300 }
const size = { width: 100, height: 80 }

describe('placeInWindow', () => {
  it('keeps the wanted place when the box fits', () => {
    expect(placeInWindow({ x: 50, y: 60 }, size, win)).toEqual({ x: 50, y: 60 })
  })
  it('flips left when it leaves on the right, and shifts when the flip does not fit', () => {
    expect(placeInWindow({ x: 350, y: 10 }, size, win, { x: 250 })).toEqual({ x: 250, y: 10 })
    expect(placeInWindow({ x: 350, y: 10 }, size, win, { x: -20 })).toEqual({ x: 296, y: 10 })
    expect(placeInWindow({ x: 350, y: 10 }, size, win)).toEqual({ x: 296, y: 10 })
  })
  it('flips up when it leaves at the bottom', () => {
    expect(placeInWindow({ x: 10, y: 280 }, size, win, { y: 200 })).toEqual({ x: 10, y: 200 })
  })
  it('never goes below the margin, even for a box larger than the window', () => {
    expect(placeInWindow({ x: -30, y: -5 }, size, win)).toEqual({ x: 4, y: 4 })
    expect(placeInWindow({ x: 20, y: 20 }, { width: 900, height: 900 }, win)).toEqual({ x: 4, y: 4 })
  })
})
