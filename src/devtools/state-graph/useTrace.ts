// Listens to the app over the trace channel. Messages are batched every ~30 ms: a drag sends ~60 a second.
// A timer, not requestAnimationFrame: rAF stops in a hidden tab, and this page is often a tab behind the app.
// On open it says hello, so an app that is already running answers with its current state.
// The log is kept in sessionStorage (this tab only): deleting a source file makes Vite reload the page, and the
// trace should survive that.
import { useCallback, useEffect, useState } from 'react'
import { TRACE_CHANNEL, type TraceMessage } from '../../state/trace/channel.ts'
import { emptyView, receive, type LogEntry, type TraceView } from './log.ts'

const KEY = 'gfit.state-graph.log'
const KEPT = 500
const BATCH_MS = 30

function save(entries: LogEntry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-KEPT)))
  } catch {
    // full or blocked: the live log still works
  }
}

function restore(): TraceView {
  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved) return { ...emptyView(), entries: JSON.parse(saved) as LogEntry[] }
  } catch {
    // private mode or a bad value: start empty
  }
  return emptyView()
}

export function useTrace(): { view: TraceView; clear(): void } {
  const [view, setView] = useState(restore)

  useEffect(() => {
    const channel = new BroadcastChannel(TRACE_CHANNEL)
    let queue: TraceMessage[] = []
    let timer = 0
    const flush = () => {
      timer = 0
      const batch = queue
      queue = []
      setView((v) => receive(v, batch))
    }
    channel.onmessage = (e: MessageEvent<TraceMessage>) => {
      queue.push(e.data)
      if (!timer) timer = window.setTimeout(flush, BATCH_MS)
    }
    channel.postMessage({ type: 'hello' } satisfies TraceMessage)
    return () => {
      clearTimeout(timer)
      channel.close()
    }
  }, [])

  // save at most twice a second (not on every step of a drag), and once more when the page goes away
  useEffect(() => {
    const t = setTimeout(() => save(view.entries), 500)
    const leave = () => save(view.entries)
    window.addEventListener('pagehide', leave)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pagehide', leave)
    }
  }, [view.entries])

  const clear = useCallback(() => setView((v) => ({ ...v, entries: [] })), [])
  return { view, clear }
}
