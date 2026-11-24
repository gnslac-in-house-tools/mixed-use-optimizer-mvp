// The module-line block engine frozen for the steps of older files (Phase D.2): `engine/legacy/` is the block as
// BLOCK_VERSION 4 kept it. These pins are numbers the module-line engine gave when it was frozen: the live engine may
// move on (an outline in metres, a clipped grid), the frozen one never does.
import { describe, expect, it } from 'vitest'
import { footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { endsKeeping, hallEnds, joinOn, moduleAt, moduleLine, nearestLine, nearestModule, runAlong, runsOf, withOwnLines } from '../bays.ts'
import { newWarehouseType } from '../defaults.ts'
import { freeElementId } from '../elements.ts'
import { copyParts } from '../legacy/copiesLines.ts'
import { generate, hallRuns } from '../legacy/generateLines.ts'
import { edgesOf, editOutline, validOutline } from '../legacy/lines.ts'
import { LegacyTypeSchema, type LegacyType } from '../legacy/types.ts'

/** 48 × 36 m on 12 m bays in 4 modules (16 × 12 modules): an L, a hole, a dock on its front. */
const type = (): LegacyType => ({
  ...newWarehouseType('wt1', 'W', { program: 'warehouse' }),
  hall: { length: 48, width: 36, ends: 'both' },
  morphology: {
    outline: [
      { id: 'e1', x: 0, y: 0 },
      { id: 'e2', x: 16, y: 0 },
      { id: 'e3', x: 16, y: 6 },
      { id: 'e4', x: 8, y: 6 },
      { id: 'e5', x: 8, y: 12 },
      { id: 'e6', x: 0, y: 12 },
    ],
    holes: [{ id: 'h1', x: [2, 4], y: [2, 4] }],
  },
  elements: [{ id: 'e1', kind: 'dock', edge: 'e1', module: 3, width: 3 }],
})

describe('the frozen module-line engine', () => {
  it('generates an L with a hole as the module-line engine did', () => {
    const g = generate(type())
    expect(g.parts).toHaveLength(1)
    expect(area(g.parts[0].polygon)).toBeCloseTo(1346.76, 6)
    expect(g.columns).toHaveLength(16)
    expect(g.walls).toHaveLength(10)
    expect(g.walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0)).toBeCloseTo(192, 6)
    expect(g.doors).toHaveLength(1)
  })

  it('places a copy of it: one part with the same floor', () => {
    const parts = copyParts(type(), { place: { x: 100, y: 50, angle: 30 } })
    expect(parts).toHaveLength(1)
    expect(area(footprintPolygon(parts[0].footprint))).toBeCloseTo(1346.76, 6)
  })

  it('reads an outline on its module lines: its edges, a valid outline, one pulled out', () => {
    const t = type()
    expect(validOutline(t.morphology.outline)).toBe(true)
    expect(edgesOf(t.morphology.outline, generate(t).runs, t.envelope.thickness).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'])
    const g = generate(t)
    // the notch's wall e4 pushed one module in: the L's step moves to line 7
    const edited = editOutline(t, g, { kind: 'move', edge: 'e4', by: -1 }, (hall) => hallRuns({ grid: t.grid, hall: { ...t.hall, ...hall } }))
    expect(edited?.moved).toBe(-1)
    expect(edited?.outline.find((c) => c.id === 'e4')).toMatchObject({ x: 7 })
  })

  it('its types keep the module lines: a corner off them is refused', () => {
    expect(LegacyTypeSchema.safeParse(type()).success).toBe(true)
    const off = type()
    off.morphology.outline[1] = { id: 'e2', x: 15.5, y: 0 }
    expect(LegacyTypeSchema.safeParse(off).success).toBe(false)
  })
})

// What the frozen engine and the older steps still read from the live files (`bays.ts`: the run builders; `elements.ts`:
// `freeElementId`). They are not copied into legacy/, so these numbers are what keeps an older file reading as it did: a change
// that moves one of them fails here, and the change is made as a new function, not by moving these.
describe('the run builders the frozen engine reads', () => {
  const lines = (length: number, ends: 'both' | 'start' | 'end', short = false) => runAlong(length, 12, 4, ends, short)

  it('runAlong: the end bays, the join rule, a short end, a hall shorter than a bay', () => {
    expect(lines(72, 'both').lines).toEqual([0, 12, 24, 36, 48, 60, 72])
    expect(lines(75, 'both')).toMatchObject({ lines: [0, 19.5, 31.5, 43.5, 55.5, 75], start: 19.5, end: 19.5, module: 3 })
    expect(lines(75, 'start')).toMatchObject({ lines: [0, 15, 27, 39, 51, 63, 75], start: 15, end: 0 })
    expect(lines(75, 'end', true)).toMatchObject({ lines: [0, 12, 24, 36, 48, 60, 72, 75], start: 0, end: 3 })
    expect(lines(80, 'both', true)).toMatchObject({ lines: [0, 10, 22, 34, 46, 58, 70, 80], start: 10, end: 10 })
    expect(lines(30, 'both').lines).toEqual([0, 9, 21, 30])
    expect(lines(8, 'both')).toMatchObject({ lines: [0, 8], start: 8, end: 0 })
    expect(lines(75, 'both').modules).toEqual([0, 2.786, 5.571, 8.357, 11.143, 13.929, 16.714, 19.5, 22.5, 25.5, 28.5, 31.5, 34.5, 37.5, 40.5, 43.5, 46.5, 49.5, 52.5, 55.5, 58.286, 61.071, 63.857, 66.643, 69.429, 72.214, 75])
  })

  it('the lines read back: moduleLine, moduleAt, nearestLine, nearestModule, an own line moved, the join rule', () => {
    const r = lines(75, 'both')
    expect([moduleLine(r, 3), moduleAt(r, 5), moduleAt(r, 9), nearestLine(r, 20), nearestModule(r, 20), nearestModule(r, 33.4)]).toEqual([8.357, 13.929, 25.5, 7, 7, 11])
    expect(withOwnLines(lines(72, 'both'), { on: [5], off: [4] }).lines).toEqual([0, 15, 24, 36, 48, 60, 72])
    expect([joinOn(5, 'x'), joinOn({ x: 2, y: 3 }, 'y')]).toEqual([5, 3])
  })

  it('the ends a box keeps, and how a block stores them', () => {
    const keep = { x: { lines: [0, 12, 24], modules: [0, 3, 6] }, y: { lines: [0, 12], modules: [0, 3] } }
    expect(endsKeeping({ x: 75, y: 48 }, { x: 12, y: 12, modules: 4 }, { x: 'both', y: 'both' }, keep)).toEqual({ x: 'end', y: 'both', short: { x: false, y: false } })
    expect(hallEnds({ x: 'start', y: 'both', short: { x: true } })).toEqual({ ends: 'start', endsWidth: 'both', shortEnds: { x: true } })
    const q = runsOf({ grid: { x: 12, y: 10, modules: 3 }, hall: { length: 70, width: 44, ends: 'both' } })
    expect([q.x.lines, q.y.lines]).toEqual([[0, 11, 23, 35, 47, 59, 70], [0, 7, 17, 27, 37, 44]])
  })

  it('freeElementId: the first e<n> not taken', () => {
    expect([freeElementId([]), freeElementId([{ id: 'e1' }, { id: 'e3' }]), freeElementId([{ id: 'e1' }, { id: 'e2' }])]).toEqual(['e1', 'e2', 'e3'])
  })
})
