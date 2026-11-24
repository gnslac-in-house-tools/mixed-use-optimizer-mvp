// The path engine's operations (Decision "Path engine"): one op on a path in, the new path out, never throwing. Pure.
import type { Point } from '../../model/schema.ts'
import { LANE_WIDTH, lanesOf, MIN_LANE, pulledLanes, storedLanes } from './lanes.ts'
import { centreOf } from './offset.ts'
import type { Path, PathOp, PathRun, Stretch } from './types.ts'

/** m: a street is this wide at least (the sum of its two sides). */
export const MIN_WIDTH = 0.5

const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y)

const EPS = 1e-9
/** m: lanes given add up to the width within this. */
const SUM_TOL = 1e-3
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
/** A stretch copied, its lanes in an array of their own. */
const copyOf = (s: Stretch): Stretch => (s.lanes ? { ...s, lanes: [...s.lanes] } : { ...s })

function nearestOn(q: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2))
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** Runs one op on a path. A refused op returns the same path with `ok` false and its reason. */
export function runPathOp(path: Path, op: PathOp): PathRun {
  const { points, stretches } = path
  const identity = stretches.map((_, k) => k)
  const refuse = (reason: string): PathRun => ({ ok: false, path, from: identity, reason, notes: [] })
  const done = (p: Path, from: (number | null)[] = identity, notes: string[] = []): PathRun => ({ ok: true, path: p, from, notes })
  const notes: string[] = []
  const note = (s: string) => {
    if (!notes.includes(s)) notes.push(s)
  }
  const nodeOk = (i: number) => Number.isInteger(i) && i >= 0 && i < points.length
  const stretchOk = (k: number) => Number.isInteger(k) && k >= 0 && k < stretches.length

  /** A stretch with one side set to v: stored lanes follow (the edge lane takes the change); unstored ones stay unstored. */
  const moved = (s: Stretch, side: 'left' | 'right', v: number): Stretch => {
    const next: Stretch = { left: s.left, right: s.right, [side]: v }
    const lanes = storedLanes(s)
    if (lanes) {
      const r = pulledLanes(lanes, side, v - s[side])
      next.lanes = r.lanes
      if (r.gone) note('The lane on that edge went')
    }
    return next
  }

  /** What a lane op does to one stretch: the stretch after it, a refusal, or null (the stretch has not what it names). */
  type Lane = Stretch | { refuse: string } | null
  const onLanes = (k: number | 'all', none: string, f: (s: Stretch) => Lane): PathRun => {
    if (k !== 'all' && !stretchOk(k)) return refuse('No such stretch')
    let applied = 0
    const next: Stretch[] = []
    for (let i = 0; i < stretches.length; i++) {
      if (k !== 'all' && k !== i) {
        next.push(stretches[i])
        continue
      }
      const r = f(stretches[i])
      if (r === null) next.push(stretches[i])
      else if ('refuse' in r) return refuse(r.refuse)
      else {
        applied++
        next.push(r)
      }
    }
    if (!applied) return refuse(none)
    return done({ points, stretches: next }, identity, notes)
  }
  const lineAt = (lanes: number[], line: number) => Number.isInteger(line) && line >= 0 && line < lanes.length - 1

  switch (op.op) {
    case 'node': {
      if (!nodeOk(op.i)) return refuse('No such node')
      if (!finite(op.to)) return refuse('Not a point')
      return done({ points: points.map((q, i) => (i === op.i ? { x: op.to.x, y: op.to.y } : q)), stretches })
    }
    case 'insert': {
      if (!stretchOk(op.k)) return refuse('No such stretch')
      if (!finite(op.at)) return refuse('Not a point')
      const at = nearestOn(op.at, points[op.k], points[op.k + 1])
      const s = stretches[op.k]
      return done(
        { points: [...points.slice(0, op.k + 1), at, ...points.slice(op.k + 1)], stretches: [...stretches.slice(0, op.k), copyOf(s), copyOf(s), ...stretches.slice(op.k + 1)] },
        [...identity.slice(0, op.k), op.k, op.k, ...identity.slice(op.k + 1)],
      )
    }
    case 'remove': {
      if (!nodeOk(op.i)) return refuse('No such node')
      if (points.length <= 2) return refuse('A street has two nodes at least')
      const nextPoints = points.filter((_, i) => i !== op.i)
      if (op.i === 0) return done({ points: nextPoints, stretches: stretches.slice(1) }, identity.slice(1))
      if (op.i === points.length - 1) return done({ points: nextPoints, stretches: stretches.slice(0, -1) }, identity.slice(0, -1))
      return done(
        { points: nextPoints, stretches: [...stretches.slice(0, op.i), ...stretches.slice(op.i + 1)] },
        [...identity.slice(0, op.i), ...identity.slice(op.i + 1)],
      )
    }
    case 'stretch': {
      if (!stretchOk(op.k)) return refuse('No such stretch')
      if (!finite(op.by)) return refuse('Not a point')
      return done({ points: points.map((q, i) => (i === op.k || i === op.k + 1 ? { x: q.x + op.by.x, y: q.y + op.by.y } : q)), stretches })
    }
    case 'side': {
      if (op.k !== 'all' && !stretchOk(op.k)) return refuse('No such stretch')
      if (!Number.isFinite(op.by)) return refuse('Not a number')
      const next = stretches.map((s, k) => {
        if (op.k !== 'all' && op.k !== k) return s
        const cur = s[op.side]
        if (op.k === 'all' && cur === 0 && !op.zeros) return s
        const other = s[op.side === 'left' ? 'right' : 'left']
        let v = cur + op.by
        if (v < 0) {
          v = 0
          note('That side is the drawn line now')
        }
        if (v + other < MIN_WIDTH) {
          v = MIN_WIDTH - other
          note('A street is 0.5 m wide at least')
        }
        return moved(s, op.side, v)
      })
      return done({ points, stretches: next }, identity, notes)
    }
    case 'width': {
      if (op.k !== 'all' && !stretchOk(op.k)) return refuse('No such stretch')
      if (!Number.isFinite(op.to)) return refuse('Not a number')
      if (op.to < MIN_WIDTH) return refuse('A street is 0.5 m wide at least')
      const hand = op.side === 'left' ? 'right' : 'left'
      const next: Path['stretches'] = []
      for (let k = 0; k < stretches.length; k++) {
        const s = stretches[k]
        if (op.k !== 'all' && op.k !== k) {
          next.push(s)
          continue
        }
        const v = op.to - s[hand]
        if (v < 0) return refuse('That side would pass the drawn line')
        next.push(moved(s, op.side, v))
      }
      return done({ points, stretches: next }, identity, notes)
    }
    case 'lanes': {
      if (op.by !== 1 && op.by !== -1) return refuse('Not a number of lanes')
      const w = op.laneWidth !== undefined && op.laneWidth > 0 ? op.laneWidth : LANE_WIDTH
      return onLanes(op.k, 'No such stretch', (s) => {
        const lanes = [...lanesOf(s, op.laneWidth)]
        const centred = Math.abs(s.left - s.right) < 1e-6
        const onLeft = !centred && s.left > s.right
        let { left, right } = s
        if (op.by === 1) {
          if (centred) {
            left += w / 2
            right += w / 2
            lanes.push(w)
          } else if (onLeft) {
            left += w
            lanes.unshift(w)
          } else {
            right += w
            lanes.push(w)
          }
        } else {
          if (lanes.length <= 1) return { refuse: 'A street has one lane at least' }
          const gone = onLeft ? lanes.shift()! : lanes.pop()!
          if (centred) {
            left -= gone / 2
            right -= gone / 2
          } else if (onLeft) {
            left -= gone
            if (left < 0) {
              right += left
              left = 0
              note('That side is the drawn line now')
            }
          } else {
            right -= gone
            if (right < 0) {
              left += right
              right = 0
              note('That side is the drawn line now')
            }
          }
        }
        return { left, right, lanes }
      })
    }
    case 'line': {
      if (op.k !== 'all' && !stretchOk(op.k)) return refuse('No such stretch')
      if (!Number.isFinite(op.by)) return refuse('Not a number')
      return onLanes(op.k, 'No such lane line', (s) => {
        const lanes = [...lanesOf(s, op.laneWidth)]
        if (!lineAt(lanes, op.line)) return null
        const a = lanes[op.line]
        const b = lanes[op.line + 1]
        const by = Math.min(Math.max(op.by, Math.min(0, MIN_LANE - a)), Math.max(0, b - MIN_LANE))
        if (Math.abs(by - op.by) > EPS) note('A lane is 2 m wide at least')
        lanes[op.line] = a + by
        lanes[op.line + 1] = b - by
        return { left: s.left, right: s.right, lanes }
      })
    }
    case 'lane': {
      if (op.k !== 'all' && !stretchOk(op.k)) return refuse('No such stretch')
      if (!Number.isFinite(op.to)) return refuse('Not a number')
      return onLanes(op.k, 'No such lane line', (s) => {
        const lanes = [...lanesOf(s, op.laneWidth)]
        if (!lineAt(lanes, op.line)) return null
        const both = lanes[op.line] + lanes[op.line + 1]
        const a = op.side === 'left' ? op.to : both - op.to
        const b = both - a
        if (a < MIN_LANE - EPS || b < MIN_LANE - EPS) return { refuse: 'A lane is 2 m wide at least' }
        lanes[op.line] = a
        lanes[op.line + 1] = b
        return { left: s.left, right: s.right, lanes }
      })
    }
    case 'equal-lanes': {
      if (op.n !== undefined && (!Number.isInteger(op.n) || op.n < 1)) return refuse('Not a number of lanes')
      return onLanes(op.k, 'No such stretch', (s) => {
        const w = s.left + s.right
        const n = op.n ?? lanesOf(s, op.laneWidth).length
        if (n > 1 && w / n < MIN_LANE - EPS) return { refuse: 'A lane is 2 m wide at least' }
        return { left: s.left, right: s.right, lanes: Array.from({ length: n }, () => w / n) }
      })
    }
    case 'lane-widths': {
      if (!Array.isArray(op.widths) || op.widths.length === 0) return refuse('Not a number of lanes')
      if (op.widths.some((x) => !Number.isFinite(x))) return refuse('Not a number')
      return onLanes(op.k, 'No such stretch', (s) => {
        const w = s.left + s.right
        if (op.widths.some((x) => !(x > 0) || (op.widths.length > 1 && x < MIN_LANE - EPS))) return { refuse: 'A lane is 2 m wide at least' }
        if (Math.abs(sum(op.widths) - w) > SUM_TOL) return { refuse: `The lanes must add up to the street's width (${+w.toFixed(2)} m)` }
        return { left: s.left, right: s.right, lanes: [...op.widths] }
      })
    }
    case 'equal': {
      const held = new Set(op.held ?? [])
      const centre = centreOf(path)
      if (held.size) note('Its ends tied to something else stayed')
      return done(
        { points: points.map((q, i) => (held.has(i) ? q : centre[i])), stretches: stretches.map((s) => ({ left: (s.left + s.right) / 2, right: (s.left + s.right) / 2, ...(s.lanes ? { lanes: s.lanes } : {}) })) },
        identity,
        notes,
      )
    }
  }
}
