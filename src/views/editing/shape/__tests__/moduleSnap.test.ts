// D.2 task 6: the module lines are a snap, not a rule. Pure parts: the push's snap across a wall (the lines of the grid, and past its ends the
// module again), the snap of a point to the lines, a stretch's end following the pointer, and the words a wall and a stretch say.
import { describe, expect, it } from 'vitest'
import { stretchEnded } from '../drags.ts'
import { stretchText, wallText } from '../labels.ts'
import { moduleMark, snapAcross, snapToGuides } from '../moduleSnap.ts'

describe('snapAcross: how far a wall moves, onto a module line when one is near', () => {
  // a wall with a module line every 3 m: 9 m behind it to 6 m in front of it (out is positive)
  const wall = { module: 3, across: [-9, -6, -3, 0, 3, 6] }

  it('a line within the tolerance wins: 2.9 m is 3 m', () => {
    expect(snapAcross(wall, 2.9, 0.5)).toBe(3)
    expect(snapAcross(wall, -3.2, 0.5)).toBe(-3)
  })
  it('none within it: null, the pointer’s own distance stands', () => {
    expect(snapAcross(wall, 7.3, 0.5)).toBeNull()
    expect(snapAcross(wall, 1.5, 0.5)).toBeNull()
  })
  it('past the last line the module goes on: out of the box by whole modules', () => {
    expect(snapAcross(wall, 9.1, 0.5)).toBe(9)
    expect(snapAcross(wall, 18.2, 0.5)).toBe(18)
    expect(snapAcross(wall, -12.1, 0.5)).toBe(-12)
  })
  it('a wall with no lines (angled) has none to snap to', () => {
    expect(snapAcross({}, 3, 5)).toBeNull()
    expect(snapAcross(undefined, 3, 5)).toBeNull()
  })
})

describe('snapToGuides: a point onto the module lines', () => {
  const guides: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: 0, y: 0 }, { x: 0, y: 30 }],
    [{ x: 3, y: 0 }, { x: 3, y: 30 }],
    [{ x: 0, y: 6 }, { x: 30, y: 6 }],
  ]
  it('where two lines cross within the aperture: their node, the mark an intersection', () => {
    const r = snapToGuides({ x: 3.2, y: 5.8 }, guides, 0.5)
    expect(r?.point).toEqual({ x: 3, y: 6 })
    expect(r?.mark.kind).toBe('intersection')
    expect(r?.mark.label).toMatch(/Module line/)
  })
  it('along one line: the foot of the point on it, the line drawn', () => {
    const r = snapToGuides({ x: 3.2, y: 14 }, guides, 0.5)
    expect(r?.point.x).toBeCloseTo(3, 9)
    expect(r?.point.y).toBeCloseTo(14, 9)
    expect(r?.mark.kind).toBeNull()
    expect(r?.mark.lines).toHaveLength(1)
  })
  it('none near: null', () => {
    expect(snapToGuides({ x: 1.5, y: 14 }, guides, 0.5)).toBeNull()
  })
  it('a line stops where its segment stops: a point past its end is not on it', () => {
    expect(snapToGuides({ x: 3.1, y: 40 }, guides, 0.5)).toBeNull()
  })
})

describe('moduleMark: the dashed line a wall landed on', () => {
  it('runs along the wall moved by d, and says Module line', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, length: 10, u: { x: 1, y: 0 }, n: { x: 0, y: -1 } }
    const m = moduleMark(wall, 3)
    expect(m.label).toMatch(/Module line/)
    expect(m.guides).toHaveLength(1)
    expect(m.guides[0].a).toEqual({ x: 0, y: -3 })
    expect(m.guides[0].b).toEqual({ x: 10, y: -3 })
  })
  it('a wall whose face stands 0.3 m out of its reference line: the mark is on the module line, the reference, 0.3 m back of the face', () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, length: 10, u: { x: 1, y: 0 }, n: { x: 0, y: -1 } }
    const m = moduleMark(wall, 3, 0.3)
    expect(m.guides[0].a.y).toBeCloseTo(-2.7, 9)
    expect(m.guides[0].b.y).toBeCloseTo(-2.7, 9)
  })
})

describe('a stretch’s end follows the pointer along its wall', () => {
  const stops = [0, 3, 6, 9, 12]
  it('onto a module line within the tolerance', () => {
    expect(stretchEnded(stops, 3, 9, 'to', 11.8, 12, 0.5)).toEqual({ from: 3, to: 12 })
  })
  it('free elsewhere: exactly where the pointer is, inside the wall', () => {
    expect(stretchEnded(stops, 3, 9, 'to', 10.4, 12, 0.5)).toEqual({ from: 3, to: 10.4 })
    expect(stretchEnded(stops, 3, 9, 'from', 1.4, 12, 0.5)).toEqual({ from: 1.4, to: 9 })
  })
  it('never past the wall, nor to the other end', () => {
    expect(stretchEnded(stops, 3, 9, 'to', 40, 12, 0.5)).toEqual({ from: 3, to: 12 })
    expect(stretchEnded(stops, 3, 9, 'to', 2, 12, 0.5).to).toBeGreaterThan(3)
    expect(stretchEnded(stops, 3, 9, 'from', 20, 12, 0.5).from).toBeLessThan(9)
  })
  it('without a tolerance (Shift) it is always free', () => {
    expect(stretchEnded(stops, 3, 9, 'to', 11.8, 12, 0)).toEqual({ from: 3, to: 11.8 })
  })
})

describe('the words: modules when it is whole modules, metres always', () => {
  const inner = { id: 'e5', tone: 'inner' as const, module: 3 }
  it('a wall dragged a whole number of modules says them and the metres', () => {
    expect(wallText(inner, 12, true, 3)).toBe('+1 module · +3.00 m')
    expect(wallText(inner, 12, true, -6)).toBe('−2 modules · −6.00 m')
  })
  it('a wall dragged between two lines says the metres alone', () => {
    expect(wallText(inner, 12, true, 7.3)).toBe('+7.30 m')
  })
  it('a wall at rest says its length (its modules, when it spans whole ones)', () => {
    expect(wallText(inner, 12, false, 0)).toBe('An inner wall · 12.00 m')
  })
  it('a stretch says out or in by modules when whole, else by metres; its size the same', () => {
    expect(stretchText(3, 0, 12, 6)).toBe('Out 2 modules · 4 modules, 12 m')
    expect(stretchText(3, 0, 12, 7.3)).toBe('Out 7.30 m · 4 modules, 12 m')
    expect(stretchText(3, 0, 10.4, 0)).toBe('Drag its face out or in · 10.40 m')
  })
})
