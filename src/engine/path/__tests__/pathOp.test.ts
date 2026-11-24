import { describe, expect, it } from 'vitest'
import { runPathOp } from '../pathOp.ts'
import type { Path, PathOp } from '../types.ts'

const path = (): Path => ({
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }],
  stretches: [{ left: 4, right: 4 }, { left: 0, right: 8 }],
})

describe('runPathOp', () => {
  it('moves a node, keeping the sides', () => {
    const r = runPathOp(path(), { op: 'node', i: 1, to: { x: 110, y: 0 } })
    expect(r.ok).toBe(true)
    expect(r.path.points[1]).toEqual({ x: 110, y: 0 })
    expect(r.path.stretches).toEqual(path().stretches)
    expect(r.from).toEqual([0, 1])
  })
  it('inserts a node on a stretch, both halves keeping its sides', () => {
    const r = runPathOp(path(), { op: 'insert', k: 0, at: { x: 30, y: 5 } })
    expect(r.path.points[1]).toEqual({ x: 30, y: 0 })
    expect(r.path.stretches).toEqual([{ left: 4, right: 4 }, { left: 4, right: 4 }, { left: 0, right: 8 }])
    expect(r.from).toEqual([0, 0, 1])
  })
  it('removes a node: inner merges, an end drops its stretch, two nodes refused', () => {
    const inner = runPathOp(path(), { op: 'remove', i: 1 })
    expect(inner.path.stretches).toEqual([{ left: 4, right: 4 }])
    expect(inner.from).toEqual([0])
    const first = runPathOp(path(), { op: 'remove', i: 0 })
    expect(first.path.stretches).toEqual([{ left: 0, right: 8 }])
    expect(first.from).toEqual([1])
    const two = runPathOp(inner.path, { op: 'remove', i: 0 })
    expect(two.ok).toBe(false)
    expect(two.reason).toBe('A street has two nodes at least')
    expect(two.path).toBe(inner.path)
  })
  it('moves a stretch with its two nodes', () => {
    const r = runPathOp(path(), { op: 'stretch', k: 0, by: { x: 0, y: 10 } })
    expect(r.path.points).toEqual([{ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 80 }])
  })
  it('side: clamps at the drawn line and at the least width, "all" keeps a 0 side at 0', () => {
    const a = runPathOp(path(), { op: 'side', k: 0, side: 'left', by: -6 })
    expect(a.path.stretches[0]).toEqual({ left: 0, right: 4 })
    expect(a.notes).toContain('That side is the drawn line now')
    const b = runPathOp(path(), { op: 'side', k: 1, side: 'right', by: -7.8 })
    expect(b.path.stretches[1].left + b.path.stretches[1].right).toBeCloseTo(0.5)
    expect(b.notes).toContain('A street is 0.5 m wide at least')
    const c = runPathOp(path(), { op: 'side', k: 'all', side: 'left', by: 2 })
    expect(c.path.stretches).toEqual([{ left: 6, right: 4 }, { left: 0, right: 8 }])
    // `zeros`: the 0 sides move too (the grabbed side was a 0 one)
    const d = runPathOp(path(), { op: 'side', k: 'all', side: 'left', by: 2, zeros: true })
    expect(d.path.stretches).toEqual([{ left: 6, right: 4 }, { left: 2, right: 8 }])
    const e = runPathOp(path(), { op: 'side', k: 'all', side: 'left', by: -2, zeros: true })
    expect(e.path.stretches).toEqual([{ left: 2, right: 4 }, { left: 0, right: 8 }])
  })
  it('width: sets the stretch width on that side, refuses what cannot be', () => {
    expect(runPathOp(path(), { op: 'width', k: 0, side: 'left', to: 10 }).path.stretches[0]).toEqual({ left: 6, right: 4 })
    const past = runPathOp(path(), { op: 'width', k: 0, side: 'left', to: 3 })
    expect(past.ok).toBe(false)
    expect(past.reason).toBe('That side would pass the drawn line')
    const thin = runPathOp(path(), { op: 'width', k: 0, side: 'left', to: 0.3 })
    expect(thin.reason).toBe('A street is 0.5 m wide at least')
    expect(runPathOp(path(), { op: 'width', k: 'all', side: 'right', to: 12 }).path.stretches).toEqual([{ left: 4, right: 8 }, { left: 0, right: 12 }])
  })
  it('equal: onto the centre, sides equal, held nodes stay', () => {
    const r = runPathOp(path(), { op: 'equal' })
    expect(r.path.stretches).toEqual([{ left: 4, right: 4 }, { left: 4, right: 4 }])
    expect(r.path.points[0]).toEqual({ x: 0, y: 0 })
    expect(r.path.points[2].x).toBeCloseTo(104)
    const h = runPathOp(path(), { op: 'equal', held: [2] })
    expect(h.path.points[2]).toEqual({ x: 100, y: 80 })
    expect(h.notes).toContain('Its ends tied to something else stayed')
  })
  it('refuses a non-finite point', () => {
    const r = runPathOp(path(), { op: 'node', i: 0, to: { x: NaN, y: 0 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('Not a point')
  })
})

// lanes (Phase PE.2): path (0,0) → (100,0) → (100,80), stretches {0, 7} and {4, 4}
describe('runPathOp: lanes', () => {
  const lp = (): Path => ({
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }],
    stretches: [{ left: 0, right: 7 }, { left: 4, right: 4 }],
  })
  const three = (lanes = [3.5, 3.5, 3.5]): Path => ({
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    stretches: [{ left: 0, right: lanes.reduce((a, b) => a + b, 0), lanes }],
  })

  describe('lanes (+1 / −1)', () => {
    it('adds a lane on the side farther from the drawn line', () => {
      const r = runPathOp(lp(), { op: 'lanes', k: 0, by: 1 })
      expect(r.ok).toBe(true)
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] })
      expect(r.path.stretches[1]).toEqual({ left: 4, right: 4 })
      const l = runPathOp({ ...lp(), stretches: [{ left: 7, right: 0 }, { left: 4, right: 4 }] }, { op: 'lanes', k: 0, by: 1 })
      expect(l.path.stretches[0]).toEqual({ left: 10.5, right: 0, lanes: [3.5, 3.5, 3.5] })
    })
    it('adds half a lane each side of a centred stretch, the lane listed at the right end', () => {
      const r = runPathOp(lp(), { op: 'lanes', k: 1, by: 1 })
      expect(r.path.stretches[1]).toEqual({ left: 5.75, right: 5.75, lanes: [4, 4, 3.5] })
    })
    it('takes the lane at that same end, the other side giving when one would pass the drawn line', () => {
      const c = runPathOp(lp(), { op: 'lanes', k: 1, by: -1 })
      expect(c.path.stretches[1]).toEqual({ left: 2, right: 2, lanes: [4] })
      const far: Path = { ...lp(), stretches: [{ left: 1, right: 7, lanes: [2, 6] }, { left: 4, right: 4 }] }
      expect(runPathOp(far, { op: 'lanes', k: 0, by: -1 }).path.stretches[0]).toEqual({ left: 1, right: 1, lanes: [2] })
      const over: Path = { ...lp(), stretches: [{ left: 3, right: 5, lanes: [2, 6] }, { left: 4, right: 4 }] }
      const o = runPathOp(over, { op: 'lanes', k: 0, by: -1 })
      expect(o.path.stretches[0]).toEqual({ left: 2, right: 0, lanes: [2] })
      expect(o.notes).toContain('That side is the drawn line now')
      const left: Path = { ...lp(), stretches: [{ left: 7, right: 0, lanes: [3, 4] }, { left: 4, right: 4 }] }
      expect(runPathOp(left, { op: 'lanes', k: 0, by: -1 }).path.stretches[0]).toEqual({ left: 4, right: 0, lanes: [4] })
    })
    it('refuses to take the only lane, the path unchanged', () => {
      const one: Path = { ...lp(), stretches: [{ left: 0, right: 4 }, { left: 0, right: 4 }] }
      const r = runPathOp(one, { op: 'lanes', k: 0, by: -1 })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('A street has one lane at least')
      expect(r.path).toBe(one)
    })
    it('"all" acts on every stretch, and refuses the whole op on any refusal', () => {
      const r = runPathOp(lp(), { op: 'lanes', k: 'all', by: 1 })
      expect(r.path.stretches[0].lanes).toEqual([3.5, 3.5, 3.5])
      expect(r.path.stretches[1].lanes).toEqual([4, 4, 3.5])
      const mixed: Path = { ...lp(), stretches: [{ left: 0, right: 4 }, { left: 4, right: 4 }] }
      expect(runPathOp(mixed, { op: 'lanes', k: 'all', by: -1 }).ok).toBe(false)
    })
    it('uses the lane width given for a new lane', () => {
      const r = runPathOp(lp(), { op: 'lanes', k: 0, by: 1, laneWidth: 3 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 10, lanes: [3.5, 3.5, 3] })
    })
    it('refuses a bad stretch or count', () => {
      expect(runPathOp(lp(), { op: 'lanes', k: 5, by: 1 }).reason).toBe('No such stretch')
      expect(runPathOp(lp(), { op: 'lanes', k: 0, by: 2 as 1 }).reason).toBe('Not a number of lanes')
    })
  })

  describe('line', () => {
    it('moves a lane line, the lane on one side growing and the other giving', () => {
      const r = runPathOp(three(), { op: 'line', k: 0, line: 0, by: 1 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 10.5, lanes: [4.5, 2.5, 3.5] })
      expect(r.from).toEqual([0])
      const back = runPathOp(three(), { op: 'line', k: 0, line: 1, by: -1 })
      expect(back.path.stretches[0].lanes).toEqual([3.5, 2.5, 4.5])
    })
    it('stops at 2 m for the lane that gives, with a note', () => {
      const r = runPathOp(three(), { op: 'line', k: 0, line: 0, by: 2 })
      expect(r.path.stretches[0].lanes).toEqual([5, 2, 3.5])
      expect(r.notes).toContain('A lane is 2 m wide at least')
    })
    it('refuses a line that is not there', () => {
      const r = runPathOp(three(), { op: 'line', k: 0, line: 2, by: 1 })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('No such lane line')
      expect(runPathOp(three(), { op: 'line', k: 0, line: -1, by: 1 }).reason).toBe('No such lane line')
      expect(runPathOp(three(), { op: 'line', k: 0, line: 0, by: NaN }).reason).toBe('Not a number')
    })
    it('"all" acts on the stretches that have the line', () => {
      const p: Path = {
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }],
        stretches: [{ left: 0, right: 10.5, lanes: [3.5, 3.5, 3.5] }, { left: 0, right: 7, lanes: [3.5, 3.5] }],
      }
      const r = runPathOp(p, { op: 'line', k: 'all', line: 1, by: 1 })
      expect(r.path.stretches[0].lanes).toEqual([3.5, 4.5, 2.5])
      expect(r.path.stretches[1].lanes).toEqual([3.5, 3.5])
      expect(runPathOp(p, { op: 'line', k: 'all', line: 2, by: 1 }).reason).toBe('No such lane line')
    })
    it('on a stretch with no lanes stored, stores the ones it shows', () => {
      const r = runPathOp(lp(), { op: 'line', k: 0, line: 0, by: 0.5 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 7, lanes: [4, 3] })
    })
  })

  describe('lane (a width typed)', () => {
    it('sets the lane on that side of the line, the other giving', () => {
      const r = runPathOp(three(), { op: 'lane', k: 0, line: 0, side: 'right', to: 3 })
      expect(r.path.stretches[0].lanes).toEqual([4, 3, 3.5])
      const l = runPathOp(three(), { op: 'lane', k: 0, line: 0, side: 'left', to: 5 })
      expect(l.path.stretches[0].lanes).toEqual([5, 2, 3.5])
    })
    it('refuses a lane under 2 m, either the typed one or the one that gives', () => {
      const a = runPathOp(three(), { op: 'lane', k: 0, line: 0, side: 'right', to: 1.5 })
      expect(a.ok).toBe(false)
      expect(a.reason).toBe('A lane is 2 m wide at least')
      expect(runPathOp(three(), { op: 'lane', k: 0, line: 0, side: 'left', to: 5.5 }).reason).toBe('A lane is 2 m wide at least')
      expect(runPathOp(three(), { op: 'lane', k: 0, line: 0, side: 'left', to: NaN }).reason).toBe('Not a number')
      expect(runPathOp(three(), { op: 'lane', k: 0, line: 3, side: 'left', to: 3 }).reason).toBe('No such lane line')
    })
  })

  describe('equal-lanes', () => {
    it('makes the lanes equal, their number kept', () => {
      const r = runPathOp(three([3, 3.5, 4]), { op: 'equal-lanes', k: 0 })
      expect(r.path.stretches[0].lanes).toEqual([3.5, 3.5, 3.5])
    })
    it('makes n lanes of the width', () => {
      const r = runPathOp(three([3, 3.5, 4]), { op: 'equal-lanes', k: 0, n: 2 })
      expect(r.path.stretches[0].lanes).toEqual([5.25, 5.25])
      expect(r.path.stretches[0].right).toBe(10.5)
    })
    it('shows the equal lanes of a stretch with none stored, and stores them', () => {
      const r = runPathOp(lp(), { op: 'equal-lanes', k: 0 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 7, lanes: [3.5, 3.5] })
    })
    it('refuses a bad count and lanes that would be under 2 m', () => {
      expect(runPathOp(three(), { op: 'equal-lanes', k: 0, n: 0 }).reason).toBe('Not a number of lanes')
      expect(runPathOp(three(), { op: 'equal-lanes', k: 0, n: 1.5 }).reason).toBe('Not a number of lanes')
      const six = runPathOp(three(), { op: 'equal-lanes', k: 0, n: 6 })
      expect(six.ok).toBe(false)
      expect(six.reason).toBe('A lane is 2 m wide at least')
    })
    it('lets a one-lane street keep its width', () => {
      const thin: Path = { ...lp(), stretches: [{ left: 0, right: 0.5 }, { left: 4, right: 4 }] }
      const r = runPathOp(thin, { op: 'equal-lanes', k: 0 })
      expect(r.ok).toBe(true)
      expect(r.path.stretches[0].lanes).toEqual([0.5])
    })
    it('"all" makes every stretch equal', () => {
      const r = runPathOp(lp(), { op: 'equal-lanes', k: 'all' })
      expect(r.path.stretches[0].lanes).toEqual([3.5, 3.5])
      expect(r.path.stretches[1].lanes).toEqual([4, 4])
    })
  })

  describe('lane-widths', () => {
    it('stores every lane given when they add up to the width', () => {
      const r = runPathOp(three(), { op: 'lane-widths', k: 0, widths: [3, 7.5] })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 10.5, lanes: [3, 7.5] })
    })
    it('refuses lanes that do not add up, are under 2 m or are not numbers', () => {
      const a = runPathOp(three(), { op: 'lane-widths', k: 0, widths: [3, 7] })
      expect(a.ok).toBe(false)
      expect(a.reason).toBe("The lanes must add up to the street's width (10.5 m)")
      expect(runPathOp(three(), { op: 'lane-widths', k: 0, widths: [1, 9.5] }).reason).toBe('A lane is 2 m wide at least')
      expect(runPathOp(three(), { op: 'lane-widths', k: 0, widths: [NaN, 5] }).reason).toBe('Not a number')
    })
    it('does not share the array it was given', () => {
      const widths = [3, 7.5]
      const r = runPathOp(three(), { op: 'lane-widths', k: 0, widths })
      widths[0] = 99
      expect(r.path.stretches[0].lanes).toEqual([3, 7.5])
    })
  })

  describe('the other ops with lanes', () => {
    it('side on a stretch with no lanes stores none; with lanes it pulls them', () => {
      const none = runPathOp(lp(), { op: 'side', k: 0, side: 'right', by: 1 })
      expect(none.path.stretches[0]).toEqual({ left: 0, right: 8 })
      expect('lanes' in none.path.stretches[0]).toBe(false)
      const out = runPathOp(three(), { op: 'side', k: 0, side: 'right', by: 1 })
      expect(out.path.stretches[0]).toEqual({ left: 0, right: 11.5, lanes: [3.5, 3.5, 4.5] })
      const inn = runPathOp(three(), { op: 'side', k: 0, side: 'right', by: -2.5 })
      expect(inn.path.stretches[0]).toEqual({ left: 0, right: 8, lanes: [3.5, 4.5] })
      expect(inn.notes).toContain('The lane on that edge went')
    })
    it('side clamped at the drawn line pulls the lanes by what it moved', () => {
      const p: Path = { ...three(), stretches: [{ left: 2, right: 8.5, lanes: [2, 3.5, 5] }] }
      const r = runPathOp(p, { op: 'side', k: 0, side: 'left', by: -6 })
      expect(r.path.stretches[0].left).toBe(0)
      expect(r.path.stretches[0].lanes).toEqual([3.5, 5])
      expect(r.notes).toContain('That side is the drawn line now')
    })
    it('width pulls the lanes by the amount the side moved', () => {
      const r = runPathOp(three(), { op: 'width', k: 0, side: 'right', to: 12 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 12, lanes: [3.5, 3.5, 5] })
      const inn = runPathOp(three(), { op: 'width', k: 0, side: 'left', to: 8 })
      expect(inn.path.stretches[0].left).toBe(0)
      expect(inn.ok).toBe(false)
      const ok = runPathOp(three([3.5, 3.5, 3.5]), { op: 'width', k: 0, side: 'right', to: 7 })
      expect(ok.path.stretches[0]).toEqual({ left: 0, right: 7, lanes: [3.5, 3.5] })
    })
    it('drops stored lanes that no longer add up instead of pulling them', () => {
      const stale: Path = { ...three(), stretches: [{ left: 0, right: 8, lanes: [3.5, 3.5, 3.5] }] }
      const r = runPathOp(stale, { op: 'side', k: 0, side: 'right', by: 1 })
      expect(r.path.stretches[0]).toEqual({ left: 0, right: 9 })
      expect('lanes' in r.path.stretches[0]).toBe(false)
    })
    it('insert copies the lanes, the halves sharing no array', () => {
      const r = runPathOp(three(), { op: 'insert', k: 0, at: { x: 40, y: 0 } })
      expect(r.path.stretches[0].lanes).toEqual([3.5, 3.5, 3.5])
      expect(r.path.stretches[1].lanes).toEqual([3.5, 3.5, 3.5])
      expect(r.path.stretches[0].lanes).not.toBe(r.path.stretches[1].lanes)
    })
    it('remove keeps the first stretch lanes', () => {
      const p: Path = {
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }],
        stretches: [{ left: 0, right: 7, lanes: [3, 4] }, { left: 0, right: 7, lanes: [4, 3] }],
      }
      expect(runPathOp(p, { op: 'remove', i: 1 }).path.stretches).toEqual([{ left: 0, right: 7, lanes: [3, 4] }])
      expect(runPathOp(p, { op: 'remove', i: 0 }).path.stretches).toEqual([{ left: 0, right: 7, lanes: [4, 3] }])
    })
    it('equal keeps the lanes', () => {
      const p: Path = { ...three(), stretches: [{ left: 0, right: 10.5, lanes: [3, 3.5, 4] }] }
      expect(runPathOp(p, { op: 'equal' }).path.stretches[0]).toEqual({ left: 5.25, right: 5.25, lanes: [3, 3.5, 4] })
    })
  })

  it('every lane op leaves `from` the identity', () => {
    const ops: PathOp[] = [
      { op: 'lanes', k: 'all', by: 1 },
      { op: 'line', k: 0, line: 0, by: 0.5 },
      { op: 'lane', k: 0, line: 0, side: 'right', to: 3 },
      { op: 'equal-lanes', k: 'all' },
      { op: 'lane-widths', k: 0, widths: [3, 4] },
    ]
    for (const op of ops) {
      const p = op.op === 'line' || op.op === 'lane' ? three() : lp()
      const r = runPathOp(p, op)
      expect(r.ok).toBe(true)
      expect(r.from).toEqual(p.stretches.map((_, k) => k))
      expect(r.path.points).toEqual(p.points)
    }
  })
  it('a lane op refused leaves the path itself', () => {
    const p = three()
    const r = runPathOp(p, { op: 'line', k: 9, line: 0, by: 1 })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('No such stretch')
    expect(r.path).toBe(p)
  })
})
