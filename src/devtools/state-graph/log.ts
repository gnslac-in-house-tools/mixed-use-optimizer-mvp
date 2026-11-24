// What the page knows from the channel, and how the log groups it. Pure: messages in, view state out.
import type { TraceMessage } from '../../state/trace/channel.ts'
import type { StateSnapshot, TraceEvent } from '../../state/trace/tracer.ts'

export const MAX_ENTRIES = 3000

export type LogEntry =
  | { kind: 'event'; tab: string; event: TraceEvent }
  | { kind: 'app'; tab: string; status: 'connected' | 'closed'; at: number }

export interface TraceView {
  entries: LogEntry[]
  state: StateSnapshot | null
  app: { status: 'waiting' | 'connected' | 'closed'; tab: string | null }
}

export const emptyView = (): TraceView => ({ entries: [], state: null, app: { status: 'waiting', tab: null } })

export function receive(v: TraceView, messages: TraceMessage[]): TraceView {
  let { entries, state, app } = v
  const added: LogEntry[] = []
  for (const m of messages) {
    if (m.type === 'event') {
      added.push({ kind: 'event', tab: m.tab, event: m.event })
      if (app.status !== 'connected' || app.tab !== m.tab) app = { status: 'connected', tab: m.tab } // the page opened after the app
    } else if (m.type === 'state') {
      state = m.state
      if (app.status !== 'connected' || app.tab !== m.tab) app = { status: 'connected', tab: m.tab }
    } else if (m.type === 'app') {
      added.push({ kind: 'app', tab: m.tab, status: m.status, at: m.at })
      if (m.status === 'connected') app = { status: 'connected', tab: m.tab }
      else if (app.tab === m.tab) app = { status: 'closed', tab: m.tab }
    }
  }
  if (added.length) entries = [...entries, ...added].slice(-MAX_ENTRIES)
  return { entries, state, app }
}

/** One log row: a single event, a drag (consecutive previews from the same place), or an app (re)load. */
export type LogRow =
  | { kind: 'event'; key: string; events: TraceEvent[] }
  | { kind: 'app'; key: string; status: 'connected' | 'closed'; at: number; tab: string }

const sameDrag = (a: TraceEvent, b: TraceEvent) => a.door === 'preview' && b.door === 'preview' && a.origin === b.origin

export function rows(entries: LogEntry[]): LogRow[] {
  const out: LogRow[] = []
  for (const e of entries) {
    if (e.kind === 'app') {
      out.push({ kind: 'app', key: `app-${e.tab}-${e.at}-${e.status}`, status: e.status, at: e.at, tab: e.tab })
      continue
    }
    const last = out[out.length - 1]
    if (last?.kind === 'event' && sameDrag(last.events[last.events.length - 1], e.event)) last.events.push(e.event)
    else out.push({ kind: 'event', key: `${e.tab}-${e.event.seq}`, events: [e.event] })
  }
  return out
}

/** The verbs of an event in one line: "moveMass · derive". */
export const callLine = (e: TraceEvent) => e.calls.map((c) => c.name).join(' · ') || '—'

/** 'views/plan/editing.ts' → 'editing.ts'. */
export const shortPath = (p: string | null) => (p ? p.slice(p.lastIndexOf('/') + 1) : '—')
