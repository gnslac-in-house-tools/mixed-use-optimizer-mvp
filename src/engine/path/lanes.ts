// A path's lanes (Phase PE.2): the arithmetic of a stretch's lanes, pure. Lanes are listed left to right walking the path.
import type { Point } from '../../model/schema.ts'
import { offsetLine } from './offset.ts'
import type { Stretch } from './types.ts'

/** m: a lane is this wide unless the Standards say otherwise (Standards.laneWidth). */
export const LANE_WIDTH = 3.5
/** m: a lane is this wide at least, whenever a person makes or changes one. */
export const MIN_LANE = 2

const EPS = 1e-9
/** m: stored lanes add up to the stretch's width within this. */
const SUM_TOL = 1e-3

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

/** The lanes stored on a stretch when they are whole (each over 0, their sum its width within 1 mm), else null. */
export function storedLanes(s: Stretch): number[] | null {
  const l = s.lanes
  if (!l || l.length === 0 || l.some((x) => !Number.isFinite(x) || !(x > 0))) return null
  return Math.abs(sum(l) - (s.left + s.right)) <= SUM_TOL ? l : null
}

/**
 * The lanes of a stretch, left to right: the stored ones when they add up to its width (1 mm), else
 * `max(1, round(width / laneWidth))` equal lanes (Decision: unstored lanes follow the width).
 */
export function lanesOf(s: Stretch, laneWidth: number = LANE_WIDTH): number[] {
  const stored = storedLanes(s)
  if (stored) return stored
  const w = s.left + s.right
  const n = Math.max(1, Math.round(w / (laneWidth > 0 ? laneWidth : LANE_WIDTH)))
  return Array.from({ length: n }, () => w / n)
}

/**
 * The dividers between lanes: each is `axis` (the paving's centre line) shifted so it lies where the lanes meet.
 * `left + right` is the paving's width, the left edge half of it to the axis' left; one lane has none.
 */
export function laneLines(axis: Point[], left: number, right: number, lanes: number[]): Point[][] {
  const half = (left + right) / 2
  const lines: Point[][] = []
  let c = 0
  for (let i = 0; i < lanes.length - 1; i++) {
    c += lanes[i]
    lines.push(offsetLine(axis, half - c))
  }
  return lines
}

/**
 * The lanes after an edge moved by `by` (out is positive): out, the edge lane grows; in, the amount is cut from the edge
 * lane, whole lanes going while it lasts, and an edge lane left under `MIN_LANE` merges into its neighbour (`gone`).
 * The input is left alone; the last lane is never removed.
 */
export function pulledLanes(lanes: number[], side: 'left' | 'right', by: number): { lanes: number[]; gone: boolean } {
  // l[0] is the edge lane
  const l = side === 'left' ? [...lanes] : [...lanes].reverse()
  let gone = false
  if (by > EPS) l[0] += by
  else if (by < -EPS) {
    let cut = -by
    while (cut > EPS && l.length > 1 && l[0] <= cut + EPS) {
      cut -= l[0]
      l.shift()
      gone = true
    }
    l[0] -= Math.max(0, cut)
    if (l[0] < MIN_LANE && l.length > 1) {
      l[1] += l[0]
      l.shift()
      gone = true
    }
  }
  return { lanes: side === 'left' ? l : l.reverse(), gone }
}
