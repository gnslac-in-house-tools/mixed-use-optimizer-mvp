// Carries the trace from the app's tab to the /state-graph page, over a BroadcastChannel (same origin, any tab).
// Dev only: main.tsx connects it.
//
//   app  ── app: connected ─────────▶ page      (on start: the page knows the app (re)loaded)
//   app  ── event ──▶ state ────────▶ page      (each store call, then the data after it: one state per batch)
//   app  ◀───────────────── hello ── page      (the page opened: send the current state)
//   app  ── app: closed ────────────▶ page      (the tab closed or reloaded)
import { subscribe } from './bus.ts'
import type { StateSnapshot, TraceEvent } from './tracer.ts'

export const TRACE_CHANNEL = 'gfit-trace'

export type TraceMessage =
  | { type: 'app'; tab: string; status: 'connected' | 'closed'; at: number }
  | { type: 'event'; tab: string; event: TraceEvent }
  | { type: 'state'; tab: string; state: StateSnapshot }
  | { type: 'hello' }

/** What the channel needs from a BroadcastChannel (a fake one in tests). */
export interface Port {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  close(): void
}

function send(port: Port, message: TraceMessage) {
  try {
    port.postMessage(message)
  } catch {
    // an arg the browser cannot copy (a function…): send it as JSON, which drops what it cannot write
    port.postMessage(JSON.parse(JSON.stringify(message)))
  }
}

/** Starts forwarding; returns the function that stops it (and tells the page the app is gone). */
export function connectTraceChannel(
  read: () => StateSnapshot,
  port: Port = new BroadcastChannel(TRACE_CHANNEL),
  tab: string = Math.random().toString(36).slice(2, 8),
): () => void {
  let pending = false
  const sendState = () => send(port, { type: 'state', tab, state: read() })

  const off = subscribe((event) => {
    send(port, { type: 'event', tab, event })
    if (pending) return
    // apply may commit first: two events, one state after both
    pending = true
    queueMicrotask(() => {
      pending = false
      sendState()
    })
  })
  port.addEventListener('message', (e) => {
    if ((e.data as TraceMessage | null)?.type === 'hello') sendState()
  })
  send(port, { type: 'app', tab, status: 'connected', at: Date.now() })
  sendState()

  return () => {
    off()
    send(port, { type: 'app', tab, status: 'closed', at: Date.now() })
    port.close()
  }
}
