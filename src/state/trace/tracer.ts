// One event per store call ("door"): who called, which verbs and engine calls ran, what changed, how long it took.
// Dev only: store.ts turns it on.
//
//   view ─▶ store.apply(f) ─▶ frame: [state/actions/masses.moveMass, engine/derive.derive] ─▶ new state ─▶ TraceEvent
//
// It wraps the store's doors once, at creation; the store itself does not know it is traced.
// A door that calls another (apply commits a pending drag first) emits both: the inner one first.
import type { StoreApi } from 'zustand'
import type { DerivedMass, Issue, Metrics } from '../../engine/types.ts'
import type { Id, Project } from '../../model/schema.ts'
import type { AppState, Selection } from '../store.ts'
import { publish } from './bus.ts'
import { recordCalls, type ActionCall } from './calls.ts'
import { diffIssues, diffProject, type Change, type IssueRef } from './diff.ts'

export const DOORS = ['apply', 'preview', 'commit', 'cancel', 'undo', 'redo', 'open', 'select', 'toggleSelect', 'selectMany', 'setLevel', 'setShowAll', 'setOption'] as const
export type Door = (typeof DOORS)[number]

/** The parts of the store's state a view can read (`useApp((s) => s.derived…)`). */
export const SLICES = ['project', 'derived', 'history', 'dragStart', 'selection', 'opened', 'level', 'showAll', 'option'] as const
export type Slice = (typeof SLICES)[number]

export interface TraceEvent {
  seq: number
  /** Wall clock (ms since 1970), so two tabs agree. */
  at: number
  door: Door
  /** The module that called the door, as a path under src/ ('views/plan/editing.ts'); null if unknown. */
  origin: string | null
  /** Verbs and engine calls that ran inside, in call order, each with its own time. */
  calls: ActionCall[]
  /** apply / preview: the function returned null (an edit the geometry rejected). */
  rejected: boolean
  /** The parts of the state that are new objects after the call: the views that read them re-render. */
  slices: Slice[]
  changes: Change[]
  issues: { added: IssueRef[]; resolved: IssueRef[]; total: number }
  history: { past: number; future: number }
  /** A drag is in progress after this call. */
  dragging: boolean
  selection: Selection
  /** The whole call, in ms: verbs + derive + the rest. */
  ms: number
}

/** The live data, for the state graph's State tab. Polygons are left out: the plan already draws them. */
export interface StateSnapshot {
  project: Project
  metrics: Metrics
  issues: Issue[]
  masses: Record<Id, Pick<DerivedMass, 'area' | 'built'>>
  selection: Selection
  history: { past: number; future: number }
  dragging: boolean
}

export function snapshot(s: AppState): StateSnapshot {
  return {
    project: s.project,
    metrics: s.derived.metrics,
    issues: s.derived.issues,
    masses: Object.fromEntries(Object.entries(s.derived.masses).map(([id, m]) => [id, { area: m.area, built: m.built }])),
    selection: s.selection,
    history: { past: s.history.past.length, future: s.history.future.length },
    dragging: s.dragStart !== null,
  }
}

// frames of the tracing itself, skipped when looking for who called
const SELF = ['state/store.ts', 'state/trace/tracer.ts', 'state/trace/calls.ts']

/** The first module under src/ in a stack trace that is not the store or the tracer. Works for browser URLs
 *  (http://localhost:5173/src/views/x.ts?t=1:2:3) and file paths (C:/…/src/views/x.ts:2:3). */
export function originOf(stack: string | undefined): string | null {
  for (const line of (stack ?? '').split('\n').slice(1)) {
    if (line.includes('node_modules')) continue
    const m = /\/src\/([^?:)\s]+\.tsx?)/.exec(line)
    if (m && !SELF.includes(m[1])) return m[1]
  }
  return null
}

let seq = 0

export function traceStore(store: StoreApi<AppState>, emit: (e: TraceEvent) => void = publish) {
  const doors = store.getState()
  const wrapped = Object.fromEntries(
    DOORS.map((door) => {
      const original = doors[door] as (...args: unknown[]) => void
      const traced = (...args: unknown[]) => {
        const origin = originOf(new Error().stack)
        let rejected = false
        if (door === 'apply' || door === 'preview') {
          const f = args[0] as (p: unknown) => unknown
          args = [(p: unknown) => {
            const r = f(p)
            rejected = r === null
            return r
          }, ...args.slice(1)] // apply's `by` goes on to the store
        }
        const before = store.getState()
        const t0 = performance.now()
        const { calls } = recordCalls(() => original(...args))
        const ms = performance.now() - t0
        const after = store.getState()
        emit({
          seq: ++seq,
          at: Date.now(),
          door,
          origin,
          calls,
          rejected,
          slices: SLICES.filter((k) => before[k] !== after[k]),
          changes: diffProject(before.project, after.project),
          issues: diffIssues(before.derived.issues, after.derived.issues),
          history: { past: after.history.past.length, future: after.history.future.length },
          dragging: after.dragStart !== null,
          selection: after.selection,
          ms,
        })
      }
      return [door, traced]
    }),
  )
  store.setState(wrapped as Partial<AppState>)
}
