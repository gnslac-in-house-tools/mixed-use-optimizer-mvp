// Where the Tools strip lands (AS.2 task 5, `tools/stripDock.ts`): `dockAt` says which of the five docks a pointer at (x, y)
// asks for, `stepDock` where an arrow key on the grip walks it. Pure: rects are plain numbers, no DOM.
import { describe, expect, it } from 'vitest'
import { dockAt, stepDock, type Rect } from '../stripDock.ts'
import type { StripDock } from '../../layout/ui.ts'

// the window's <main>, and the viewport's column inside it (a left panel and the strip before it, Summary after it)
const main: Rect = { left: 0, top: 0, right: 1400, bottom: 800 }
const viewport: Rect = { left: 400, top: 100, right: 1000, bottom: 700 }
// the middle between the window's edge and the viewport's left edge: x = 200
const at = (x: number, y: number) => dockAt({ x, y }, { main, viewport })

describe('dockAt', () => {
  it('left of the middle between the window’s edge and the viewport’s left edge is the window’s left', () => {
    expect(at(0, 400)).toBe('left')
    expect(at(100, 400)).toBe('left')
    expect(at(199.9, 400)).toBe('left')
    // at any height: above or below the viewport too
    expect(at(50, 10)).toBe('left')
    expect(at(50, 790)).toBe('left')
  })

  it('on the middle itself it is no longer the left: the viewport’s nearest edge decides', () => {
    expect(at(200, 400)).toBe('panel')
  })

  it('inside the viewport: its nearest edge', () => {
    expect(at(450, 400)).toBe('panel')
    expect(at(950, 400)).toBe('right')
    expect(at(700, 120)).toBe('top')
    expect(at(700, 680)).toBe('bottom')
  })

  it('on the viewport’s borders: that border', () => {
    expect(at(400, 400)).toBe('panel')
    expect(at(1000, 400)).toBe('right')
    expect(at(700, 100)).toBe('top')
    expect(at(700, 700)).toBe('bottom')
  })

  it('around the viewport: the edge it is nearest to', () => {
    expect(at(300, 400)).toBe('panel')
    expect(at(1300, 400)).toBe('right')
    expect(at(700, 10)).toBe('top')
    expect(at(700, 790)).toBe('bottom')
    // over the corner: the nearer of the two edges
    expect(at(1100, 90)).toBe('top')
    expect(at(1090, 200)).toBe('right')
  })

  it('a hidden left panel: the middle is nearer the viewport, and the same rules hold', () => {
    const near: Rect = { left: 100, top: 100, right: 1000, bottom: 700 }
    const there = (x: number, y: number) => dockAt({ x, y }, { main, viewport: near })
    expect(there(40, 400)).toBe('left')
    expect(there(60, 400)).toBe('panel')
    expect(there(900, 400)).toBe('right')
  })

  it('takes the rects of the DOM as they are (a DOMRect has the same four edges)', () => {
    const r = { left: 0, top: 0, right: 10, bottom: 10, x: 0, y: 0, width: 10, height: 10, toJSON: () => ({}) } as DOMRect
    expect(dockAt({ x: 5, y: 0 }, { main: r, viewport: r })).toBe('top')
  })
})

describe('stepDock', () => {
  const docks: StripDock[] = ['left', 'panel', 'right', 'top', 'bottom']

  it('← → walk left · panel · right and stop at the ends', () => {
    expect(stepDock('left', 'ArrowLeft')).toBe('left')
    expect(stepDock('panel', 'ArrowLeft')).toBe('left')
    expect(stepDock('right', 'ArrowLeft')).toBe('panel')
    expect(stepDock('left', 'ArrowRight')).toBe('panel')
    expect(stepDock('panel', 'ArrowRight')).toBe('right')
    expect(stepDock('right', 'ArrowRight')).toBe('right')
  })

  it('from above or below, ← goes to panel and → to right', () => {
    for (const d of ['top', 'bottom'] as const) {
      expect(stepDock(d, 'ArrowLeft')).toBe('panel')
      expect(stepDock(d, 'ArrowRight')).toBe('right')
    }
  })

  it('↑ goes above the viewport and ↓ below it, from anywhere', () => {
    for (const d of docks) {
      expect(stepDock(d, 'ArrowUp')).toBe('top')
      expect(stepDock(d, 'ArrowDown')).toBe('bottom')
    }
  })
})
