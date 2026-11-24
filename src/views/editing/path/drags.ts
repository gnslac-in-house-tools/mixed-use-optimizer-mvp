// What each path handle does when pressed (Phase PE.1 task 10, Decision "Path engine"): the `Start` functions `useDrag` calls. Each
// reads the path once through `actions.pathOf`, edits it through `actions.editPath` (one op, a street or an existing street alike) and
// tells the typed dimension what it drags, so a number typed during the drag or right after it sets it exactly.
//   startPathNode     node `i` where the pointer says, snapped as a drawn point (perpendicular and ortho from its neighbour); a click picks it.
//                     Typed: a point (`@x,y`, `d<a`, `#x,y`, a distance along the drag).
//   startPathStretch  stretch `k` moved anywhere (both its nodes), snapped as a shape, its neighbours stretching; Shift is free.
//                     Typed: how far across the stretch, exactly (a number signed by the way it was dragged).
//   startPathSide     the paving of one side of stretch `k` pulled out or in: only that side moves, the other side and the drawn line stay, the width snapped to
//                     0.5 m (Ctrl frees it); Shift: that side of every stretch moves by the same amount (a side at 0 stays). Typed: the stretch's width by
//                     that side (Shift: every stretch's), exactly.
//   startPathLine    (Phase PE.2) the line between two lanes of stretch `k` moved across it: the lane on its left grows by what the one on its right gives (0.25 m steps, Ctrl frees them, a lane
//                     is 2 m at least); Shift: that line of every stretch that has it. Typed: the lane the press was beside (left or right of the line), exactly (Shift: of every stretch).
// A locked stretch the edit touches starts nothing and says it is locked.
import type { Id, Point, Project } from '../../../model/schema.ts'
import { standardsOf } from '../../../engine/circulation/standards.ts'
import { lanesOf, storedLanes } from '../../../engine/path/lanes.ts'
import type { Ref } from '../../../kinds/index.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { tellLockedPick } from '../../layers/locks.ts'
import { roadShape } from '../../plan/circulation/roadCommands.ts'
import { metres, beside } from '../../plan/editing.ts'
import { GRID_STEP } from '../../plan/snap/grid.ts'
import { snapMove, tolerances } from '../../plan/snap/move.ts'
import { resolveSnap } from '../../plan/snap/resolve.ts'
import { useSnapSettings } from '../../plan/snap/settings.ts'
import type { Mover, Start } from '../../plan/useDrag.ts'
import { moveTyped, startTyped, typedEnded } from '../dimension/typed.ts'
import type { PathHost } from './host.ts'
import { pathTargets } from './host.ts'
import { lineName, nodeName, sideName, stretchName } from './labels.ts'
import { pickPathNode } from './pathState.ts'
import { useToast } from '../../layout/toast.ts'
import type { Path } from '../../../engine/path/types.ts'

const LOCKED = /locked/

/**
 * Stretch `k` of `ref` moved by `by`: both its nodes; when a locked neighbour holds one of them, the free end alone (the locked
 * stretch and its two nodes stay). Refused (the same project, its reason) when it holds both.
 */
function moveStretch(p: Project, ref: Ref, k: number, by: Point, option: Id): ReturnType<typeof actions.editPath> {
  const whole = actions.editPath(p, ref, { op: 'stretch', k, by }, option)
  if (!LOCKED.test(whole.reason ?? '')) return whole
  const points = actions.pathOf(p, ref, option)?.path.points
  let q = p
  let moved = 0
  for (const i of [k, k + 1]) {
    const from = points?.[i]
    if (!from) continue
    const w = actions.editPath(q, ref, { op: 'node', i, to: { x: from.x + by.x, y: from.y + by.y } }, option)
    if (w.reason) continue
    q = w.project
    moved++
  }
  return moved > 0 ? { project: q } : whole
}

/** Node `i` of `ref` goes where the pointer says. */
export function startPathNode(ref: Ref, i: number, host: PathHost): Start {
  return () => {
    const { project, option } = useApp.getState()
    const read = actions.pathOf(project, ref, option)
    const p0 = read?.path.points[i]
    if (!read || !p0) return null
    // a node a locked stretch holds is not dragged
    if (LOCKED.test(actions.editPath(project, ref, { op: 'node', i, to: p0 }, option).reason ?? '')) {
      tellLockedPick()
      return null
    }
    const points = read.path.points
    const targets = pathTargets(ref, points.filter((_, j) => j !== i))
    const base = points[i === 0 ? 1 : i - 1] ?? null
    const tol = tolerances(1 / host.scale)
    const from = { x: p0.x, y: p0.y }
    startTyped({
      what: 'Move node',
      name: nodeName(ref, i),
      measure: 'point',
      shown: '',
      at: from,
      base: from,
      unit: ' m',
      apply: (to) => (p, told) => {
        const w = actions.editPath(p, ref, { op: 'node', i, to: to as Point }, option)
        if (w.reason) {
          told.why = w.reason
          return null
        }
        return w.project
      },
      mode: 'live',
      from: project,
    })
    const mover: Mover = (delta, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const q = { x: from.x + delta.x, y: from.y + delta.y }
      const s = e.shiftKey
        ? { point: q, mark: null }
        : resolveSnap(q, { targets, settings: useSnapSettings.getState().settings, tolPoint: tol.point, tolLine: tol.line, step: GRID_STEP, base, orthoFrom: base })
      let ok = true
      useApp.getState().preview((p) => {
        const w = actions.editPath(p, ref, { op: 'node', i, to: s.point }, option)
        ok = !w.reason
        return w.reason ? null : w.project
      })
      moveTyped(metres(Math.hypot(s.point.x - from.x, s.point.y - from.y)), delta, s.point)
      return { ok, mark: s.mark }
    }
    const id = read.nodes[i]
    mover.click = () => pickPathNode(ref, id)
    mover.done = () => pickPathNode(ref, id)
    return mover
  }
}

/** Stretch `k` of `ref` moves by what the pointer says: both its nodes, its neighbours stretching. */
export function startPathStretch(ref: Ref, k: number, host: PathHost): Start {
  return () => {
    const { project, option } = useApp.getState()
    const read = actions.pathOf(project, ref, option)
    const a = read?.path.points[k]
    const b = read?.path.points[k + 1]
    if (!read || !a || !b) return null
    if (LOCKED.test(moveStretch(project, ref, k, { x: 0, y: 0 }, option).reason ?? '')) {
      tellLockedPick()
      return null
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    // across the stretch: what a typed distance goes along
    const n = len < 1e-9 ? { x: 0, y: 1 } : { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
    const targets = pathTargets(ref)
    const shape = roadShape([a, b])
    const tol = tolerances(1 / host.scale)
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    startTyped({
      what: 'Move stretch',
      name: stretchName(ref, k),
      measure: 'distance',
      shown: '',
      at: middle,
      base: middle,
      way: 0,
      unit: ' m',
      apply: (v) => (p, told) => {
        const d = v as number
        const w = moveStretch(p, ref, k, { x: n.x * d, y: n.y * d }, option)
        if (w.reason || Math.abs(d) < 1e-9) {
          told.why = w.reason ?? 'The stretch stays where it was'
          return null
        }
        return w.project
      },
      mode: 'live',
      from: project,
    })
    const mover: Mover = (raw, e) => {
      if (typedEnded()) return { ok: true, mark: null }
      const snapped = e.shiftKey ? { delta: raw, mark: null } : snapMove(raw, shape, targets, useSnapSettings.getState().settings, tol)
      let ok = true
      useApp.getState().preview((p) => {
        const w = moveStretch(p, ref, k, snapped.delta, option)
        ok = !w.reason
        return w.reason ? null : w.project
      })
      const across = raw.x * n.x + raw.y * n.y
      moveTyped(metres(Math.hypot(snapped.delta.x, snapped.delta.y)), across, beside(middle, snapped.delta))
      return { ok, mark: snapped.mark }
    }
    return mover
  }
}

/** A double click on stretch `k`: a node there (`at`, projected onto it), picked. False when refused (said). */
export function insertPathNode(ref: Ref, k: number, at: Point): boolean {
  const { project, option } = useApp.getState()
  const w = actions.editPath(project, ref, { op: 'insert', k, at }, option)
  if (w.reason) {
    if (LOCKED.test(w.reason)) tellLockedPick()
    return false
  }
  useApp.getState().apply((p) => actions.editPath(p, ref, { op: 'insert', k, at }, option).project)
  const next = actions.pathOf(useApp.getState().project, ref, option)
  const id = next?.nodes[k + 1]
  if (id) pickPathNode(ref, id)
  return true
}

const STEP = 0.5

/** Where the pill of one side of stretch `k` stands: a third along the stretch, on the edge of that side (on the drawn line when the side is 0). Null when the stretch is not there. */
export function sidePill(path: Path, k: number, side: 'left' | 'right'): Point | null {
  const a = path.points[k]
  const b = path.points[k + 1]
  const s = path.stretches[k]
  if (!a || !b || !s) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1e-9) return null
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const d = side === 'left' ? s.left : -s.right
  return { x: a.x + (b.x - a.x) * 0.3 + n.x * d, y: a.y + (b.y - a.y) * 0.3 + n.y * d }
}

/** Where the lane pill of stretch `k` stands (Phase PE.2): 0.7 along it, on the paving's centre line. Null when the stretch is not there. */
export function lanePill(path: Path, k: number): Point | null {
  const a = path.points[k]
  const b = path.points[k + 1]
  const s = path.stretches[k]
  if (!a || !b || !s) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < 1e-9) return null
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const c = (s.left - s.right) / 2
  return { x: a.x + (b.x - a.x) * 0.7 + n.x * c, y: a.y + (b.y - a.y) * 0.7 + n.y * c }
}

/** The pill of one side of stretch `k` of `ref` pulled by what the pointer says. */
export function startPathSide(ref: Ref, k: number, side: 'left' | 'right', _host: PathHost): Start {
  return (e) => {
    const { project, option } = useApp.getState()
    const read = actions.pathOf(project, ref, option)
    const a = read?.path.points[k]
    const b = read?.path.points[k + 1]
    const st = read?.path.stretches[k]
    const pill = read ? sidePill(read.path, k, side) : null
    if (!read || !a || !b || !st || !pill) return null
    if (LOCKED.test(actions.editPath(project, ref, { op: 'side', k, side, by: 0 }, option).reason ?? '')) {
      tellLockedPick()
      return null
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
    const out = side === 'left' ? n : { x: -n.x, y: -n.y }
    const w0 = st.left + st.right
    // a side at 0 is the drawn line: pulling it with Shift moves that side of every stretch, the 0 ones too (as a typed width does); pulling a side that is not 0 leaves the others at 0
    const zeros = st[side] === 0
    let whole = e.shiftKey
    let told = false
    startTyped({
      what: 'Street width',
      name: sideName(ref, k, side),
      measure: 'value',
      shown: '',
      at: pill,
      base: pill,
      unit: ' m',
      help: 'the width by this side (Shift: of the whole street)',
      apply: (v) => (p, said) => {
        const w = actions.editPath(p, ref, { op: 'width', k: whole ? 'all' : k, side, to: v as number }, option)
        if (w.reason) {
          said.why = w.reason
          return null
        }
        return w.project
      },
      mode: 'live',
      from: project,
    })
    const mover: Mover = (delta, ev) => {
      if (typedEnded()) return { ok: true, mark: null }
      whole = ev.shiftKey
      const raw = w0 + delta.x * out.x + delta.y * out.y
      const w = ev.ctrlKey || ev.metaKey ? raw : Math.round(raw / STEP) * STEP
      const by = w - w0
      let ok = true
      let shown = metres(w)
      useApp.getState().preview((p) => {
        const r = actions.editPath(p, ref, { op: 'side', k: whole ? 'all' : k, side, by, zeros }, option)
        ok = !r.reason
        const say = r.reason ?? r.notes?.[0]
        if (say && !told) {
          told = true
          useToast.getState().show('info', say)
        }
        // a street with stored lanes reads its edge lane too: "Lane 4.5 m · 11.5 m"
        const after = r.reason ? undefined : actions.pathOf(r.project, ref, option)?.path.stretches[k]
        const lanes = after && storedLanes(after)
        if (after && lanes) shown = `Lane ${num(side === 'left' ? lanes[0] : lanes[lanes.length - 1])} m · ${metres(after.left + after.right)}`
        return r.reason ? null : r.project
      })
      moveTyped(shown, undefined, { x: pill.x + out.x * by, y: pill.y + out.y * by })
      return { ok, mark: null }
    }
    return mover
  }
}

const num = (v: number): string => `${Math.round(v * 100) / 100}`
const LANE_STEP = 0.25

/**
 * The line between lanes `line` and `line + 1` of stretch `k` of `ref` moved across the stretch (Phase PE.2): the lane on its left takes what the one on its right gives. `Start` reads
 * the press to tell which lane a typed number is: the one on the side of the line the press was on.
 */
export function startPathLine(ref: Ref, k: number, line: number, _host: PathHost): Start {
  return (e, press) => {
    const { project, option } = useApp.getState()
    const read = actions.pathOf(project, ref, option)
    const a = read?.path.points[k]
    const b = read?.path.points[k + 1]
    const st = read?.path.stretches[k]
    if (!read || !a || !b || !st) return null
    const laneWidth = standardsOf(project, project.options.find((o) => o.id === option)).laneWidth
    const lanes = lanesOf(st, laneWidth)
    if (!Number.isInteger(line) || line < 0 || line >= lanes.length - 1) return null
    if (LOCKED.test(actions.editPath(project, ref, { op: 'line', k, line, by: 0 }, option).reason ?? '')) {
      tellLockedPick()
      return null
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-9) return null
    // n: the stretch's left; the line stands `offset` m to the left of the drawn line (the paving's left edge is `left` m out, each lane before it takes its width in)
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
    const offset = st.left - lanes.slice(0, line + 1).reduce((x, y) => x + y, 0)
    const mid = { x: (a.x + b.x) / 2 + n.x * offset, y: (a.y + b.y) / 2 + n.y * offset }
    // the press on the line's left names the lane to its left, else the one to its right
    const side = (press.x - a.x) * n.x + (press.y - a.y) * n.y >= offset ? 'left' : 'right'
    const lane0 = lanes[line]
    let whole = e.shiftKey
    let told = false
    startTyped({
      what: 'Lane width',
      name: lineName(ref, k, line),
      measure: 'value',
      shown: '',
      at: mid,
      base: mid,
      unit: ' m',
      help: 'the lane beside this line (Shift: on every stretch)',
      apply: (v) => (p, said) => {
        const w = actions.editPath(p, ref, { op: 'lane', k: whole ? 'all' : k, line, side, to: v as number }, option)
        if (w.reason) {
          said.why = w.reason
          return null
        }
        return w.project
      },
      mode: 'live',
      from: project,
    })
    const mover: Mover = (delta, ev) => {
      if (typedEnded()) return { ok: true, mark: null }
      whole = ev.shiftKey
      // across to the right of the stretch: -n
      const raw = lane0 - (delta.x * n.x + delta.y * n.y)
      const w = ev.ctrlKey || ev.metaKey ? raw : Math.round(raw / LANE_STEP) * LANE_STEP
      const by = w - lane0
      let ok = true
      let shown = metres(w)
      useApp.getState().preview((p) => {
        const r = actions.editPath(p, ref, { op: 'line', k: whole ? 'all' : k, line, by }, option)
        ok = !r.reason
        const say = r.reason ?? r.notes?.[0]
        if (say && !told) {
          told = true
          useToast.getState().show('info', say)
        }
        const after = r.reason ? undefined : actions.pathOf(r.project, ref, option)?.path.stretches[k]
        if (after) shown = metres(lanesOf(after, laneWidth)[line] ?? w)
        return r.reason ? null : r.project
      })
      moveTyped(shown, undefined, { x: mid.x - n.x * by, y: mid.y - n.y * by })
      return { ok, mark: null }
    }
    return mover
  }
}
