// Where a run is evaluated (Decision "Optimizer worker"): a port to it, the same whether it is a Worker (the app) or
// the runner on this thread (where there is no Worker: the tests). Closing a port ends its run at once: a worker is
// terminated, whatever it was evaluating; the thread's runner stops at its next pause. Neither loads the engine here:
// the worker has its own chunk, the thread's runner is imported when a run starts (Optimize, drawn with the frame,
// reads the run's store, not the engine).
import type { FromWorker, ToWorker } from './protocol.ts'

export interface Port {
  post(m: ToWorker): void
  close(): void
}

export type Spawn = (receive: (m: FromWorker) => void) => Port

export const workerPort: Spawn = (receive) => {
  const w = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<FromWorker>) => receive(e.data)
  w.onerror = (e) => {
    e.preventDefault()
    receive({ type: 'error', message: e.message || 'The optimizer could not start' })
  }
  return { post: (m) => w.postMessage(m), close: () => w.terminate() }
}

export const threadPort: Spawn = (receive) => {
  let closed = false
  let run: { receive(m: ToWorker): void } | null = null
  const waiting: ToWorker[] = []
  void import('./runner.ts').then(({ runner }) => {
    if (closed) return
    run = runner(receive, { pause: () => new Promise((ok) => setTimeout(ok, 0)) })
    for (const m of waiting.splice(0)) run.receive(m)
  })
  return {
    post: (m) => (run ? run.receive(m) : waiting.push(m)),
    close: () => {
      closed = true
      run?.receive({ type: 'stop' })
    },
  }
}

export const defaultSpawn: Spawn = typeof Worker === 'undefined' ? threadPort : workerPort
