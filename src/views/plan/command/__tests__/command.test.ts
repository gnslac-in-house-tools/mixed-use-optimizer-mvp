// Ported from Plaza-Practiko `vistas/planta/iman/__tests__/comando.test.ts` (without the rotated work plane and the
// array's count).
import { describe, expect, it } from 'vitest'
import type { Point } from '../../../../model/schema.ts'
import { parseCommand, type Command, type CommandContext } from '../command.ts'

const p = (x: number, y: number): Point => ({ x, y })
const first: CommandContext = { first: true, base: null, cursor: null, rectangle: true }
const after = (cursor: Point | null = null, extra: Partial<CommandContext> = {}): CommandContext => ({
  first: false,
  base: p(10, 5),
  cursor,
  rectangle: true,
  ...extra,
})
const point = (c: Command) => {
  if (c.kind !== 'point') throw new Error(`expected a point: ${JSON.stringify(c)}`)
  return c.point
}
const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
}

describe('parseCommand', () => {
  it('x,y: absolute first, relative after; #x,y always absolute; @x,y relative', () => {
    near(point(parseCommand('12.5, 3', first)), p(12.5, 3))
    near(point(parseCommand('5,3', after())), p(15, 8))
    near(point(parseCommand('#5,3', after())), p(5, 3))
    near(point(parseCommand('@-2,0', after())), p(8, 5))
    expect(parseCommand('@1,1', first).kind).toBe('error')
  })

  it('d: towards the cursor; without one, towards +x', () => {
    near(point(parseCommand('10', after(p(10, 50)))), p(10, 15))
    near(point(parseCommand('4', after())), p(14, 5))
    near(point(parseCommand('4', after(p(10, 5)))), p(14, 5))
    expect(parseCommand('4', first).kind).toBe('error')
  })

  it('d<a: polar; <a: fixed angle; a bare distance follows the fixed angle on the cursor’s side', () => {
    near(point(parseCommand('10<90', after())), p(10, 15))
    near(point(parseCommand('2 < 180', after())), p(8, 5))
    expect(parseCommand('<30', after())).toEqual({ kind: 'angle', degrees: 30 })
    expect(parseCommand('<30', first).kind).toBe('error')
    near(point(parseCommand('10', after(p(0, 5), { angle: 0 }))), p(0, 5))
  })

  it('LxW: a rectangle towards the cursor’s quadrant, counter-clockwise', () => {
    const r = parseCommand('30x20', after(p(0, 0)))
    expect(r.kind).toBe('rectangle')
    if (r.kind !== 'rectangle') return
    const xs = r.polygon.map((q) => q.x)
    const ys = r.polygon.map((q) => q.y)
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([-20, 10, -15, 5])
    let s = 0
    r.polygon.forEach((q, i) => {
      const n = r.polygon[(i + 1) % 4]
      s += q.x * n.y - n.x * q.y
    })
    expect(s).toBeGreaterThan(0)
    expect(parseCommand('30*20', after(p(50, 50))).kind).toBe('rectangle')
    expect(parseCommand('30x20', after(p(0, 0), { rectangle: false })).kind).toBe('error')
    expect(parseCommand('30x20', first).kind).toBe('error')
    expect(parseCommand('0x20', after()).kind).toBe('error')
  })

  it('with angleOnly a bare number is an angle', () => {
    expect(parseCommand('30', after(p(10, 50), { angleOnly: true }))).toEqual({ kind: 'angle', degrees: 30 })
    expect(parseCommand('-45', after(null, { angleOnly: true }))).toEqual({ kind: 'angle', degrees: -45 })
    expect(parseCommand('<15', after(null, { angleOnly: true }))).toEqual({ kind: 'angle', degrees: 15 })
    // a point is still a point
    near(point(parseCommand('@1,0', after(null, { angleOnly: true }))), p(11, 5))
  })

  it('empty, and what is not understood', () => {
    expect(parseCommand('  ', after()).kind).toBe('empty')
    for (const t of ['12,', 'abc', '1,2,3', '<', '-', '12,5;3', '#', '@']) expect(parseCommand(t, after()).kind, t).toBe('error')
  })
})

describe('a width (Decision "Exterior circulation")', () => {
  it('"w 10" is the width of what the tool draws, where it takes one', () => {
    expect(parseCommand('w 10', { ...first, width: true })).toEqual({ kind: 'width', value: 10 })
    expect(parseCommand('W6.5', after(null, { width: true }))).toEqual({ kind: 'width', value: 6.5 })
    expect(parseCommand('w 10', first)).toEqual({ kind: 'error', reason: 'No width here' })
    expect(parseCommand('w 0', { ...first, width: true })).toEqual({ kind: 'error', reason: 'A width above 0' })
  })
})
