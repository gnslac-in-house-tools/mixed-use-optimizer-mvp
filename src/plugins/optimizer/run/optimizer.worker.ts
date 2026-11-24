// The optimizer's worker (Decision "Optimizer worker"): a run off the main thread, so the page keeps drawing while
// thousands of specimens are measured. Its body is the runner; it never yields: the client stops it by closing it.
import type { FromWorker, ToWorker } from './protocol.ts'
import { runner } from './runner.ts'

const scope = self as unknown as { postMessage(m: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }
const run = runner((m) => scope.postMessage(m))
scope.onmessage = (e) => run.receive(e.data)
