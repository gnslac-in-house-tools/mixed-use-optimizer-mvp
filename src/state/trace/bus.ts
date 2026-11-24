// Where trace events go inside this tab. The tracer publishes; the channel (and tests) listen.
import type { TraceEvent } from './tracer.ts'

type Listener = (e: TraceEvent) => void

const listeners = new Set<Listener>()

export function publish(e: TraceEvent) {
  for (const l of listeners) l(e)
}

/** Returns the function that stops listening. */
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
