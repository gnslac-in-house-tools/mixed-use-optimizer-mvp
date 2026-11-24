// The diagram's geometry (views/graph/diagram.ts): a line's point at any t, a label that finds a free place along its
// line, and a layout in the room it has, where no bubble and its name lie over another's.
import { describe, expect, it } from 'vitest'
import { bubbleBox, edgePath, labelSpot, layoutDiagram, type DiagramNode } from '../graph/diagram.ts'

describe('the lines and their labels', () => {
  it('a line’s middle is its point at one half, in every style', () => {
    for (const style of ['curved', 'straight', 'orthogonal'] as const) {
      const e = edgePath({ x: 0, y: 0 }, { x: 200, y: 100 }, 10, 10, style)
      expect(e.at(0.5).x).toBeCloseTo(e.mid.x)
      expect(e.at(0.5).y).toBeCloseTo(e.mid.y)
    }
  })

  it('a label sits at the middle when it is free, else at the nearest free place along the line', () => {
    const at = (t: number) => ({ x: t * 100, y: 0 })
    expect(labelSpot(at, 10, 10, [])).toEqual({ x: 50, y: 0 })
    // a name over the middle: the label moves towards an end, clear of it
    const spot = labelSpot(at, 10, 10, [{ x0: 40, y0: -5, x1: 60, y1: 5 }])
    expect(Math.abs(spot.x - 50)).toBeGreaterThanOrEqual(15)
    // nowhere free: the middle
    expect(labelSpot(at, 10, 10, [{ x0: -10, y0: -10, x1: 110, y1: 10 }])).toEqual({ x: 50, y: 0 })
  })
})

describe('the layout', () => {
  const ring: DiagramNode[] = Array.from({ length: 6 }, (_, i) => ({
    id: `n${i}`,
    r: 20,
    label: 110,
    seed: { x: Math.round(Math.cos((i / 6) * Math.PI * 2) * 200), y: Math.round(Math.sin((i / 6) * Math.PI * 2) * 200) },
  }))
  const room = { w: 900, h: 320 }

  it('in the room, no bubble and its name over another’s; the same input, the same answer', () => {
    const at = layoutDiagram(ring, [], {}, room)
    const boxes = ring.map((n) => bubbleBox(n, at.get(n.id)!, 0))
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false)
      }
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(0)
      expect(b.x1).toBeLessThanOrEqual(room.w)
    }
    expect(layoutDiagram(ring, [], {}, room)).toEqual(layoutDiagram(ring, [], {}, room))
  })

  it('a line pulls its ends together: adjacent closer than apart', () => {
    const two = ring.slice(0, 2)
    const gap = (kind: 'adjacent' | 'apart') => {
      const at = layoutDiagram(two, [{ a: 'n0', b: 'n1', kind }], {}, { w: 1200, h: 600 })
      return Math.hypot(at.get('n0')!.x - at.get('n1')!.x, at.get('n0')!.y - at.get('n1')!.y)
    }
    expect(gap('adjacent')).toBeLessThan(gap('apart'))
  })

  it('a pinned bubble stays where it was put', () => {
    expect(layoutDiagram(ring, [], { n0: { x: 7, y: 9 } }, room).get('n0')).toEqual({ x: 7, y: 9 })
  })
})
