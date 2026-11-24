// Which verbs ran inside one store call: the raw material of the state graph (dev only).
//
//   store.apply(f) ──recordCalls──▶ f(project) ──▶ actions.moveMass(p, id, d) ──▶ frame: [{ state/actions/masses, moveMass, [id, d] }]
//
// - `traced(module, m)` wraps every function of an action module: same args, same result, plus one entry in the open
//   frame. Outside a frame (a test, an MCP tool) it records nothing.
// - In a production build it only names each verb to `recordVerbs` (the decision log's: Decision "Decision log"), in
//   every build: no arguments, no times, no frame.
// - Actions stay pure: they never see the frame. Only the wrapper does.

export interface ActionCall {
  /** The module's path under src/, without extension: 'state/actions/masses', 'engine/derive'… */
  module: string
  /** The verb: 'moveMass'… */
  name: string
  /** Its arguments after the project, as passed. */
  args: unknown[]
  /** How long it took, in ms. */
  ms: number
}

let frame: ActionCall[] | null = null
let names: string[] | null = null

/** The verbs `run` called, outermost first, in any build (the decision log's, apart from the state graph's frames). */
export function recordVerbs<T>(run: () => T): { result: T; verbs: string[] } {
  const outer = names
  const verbs: string[] = []
  names = verbs
  try {
    return { result: run(), verbs }
  } finally {
    names = outer
  }
}

/** Runs `run` and returns what it returned plus the verbs it called. Frames nest: an inner one does not leak out. */
export function recordCalls<T>(run: () => T): { result: T; calls: ActionCall[] } {
  const outer = frame
  const calls: ActionCall[] = []
  frame = calls
  try {
    return { result: run(), calls }
  } finally {
    frame = outer
  }
}

/** A module's functions: its constants (a message a view also reads) are no verbs. */
type Verbs<M> = { [K in keyof M as M[K] extends (...args: never[]) => unknown ? K : never]: M[K] }

/** The same module, with each function reporting itself to the open frame. */
export function traced<M extends object>(module: string, m: M): Verbs<M> {
  // outside Vite (the MCP server, in Node) there is no env: not dev
  const dev = import.meta.env?.DEV === true
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(m)) {
    if (typeof value !== 'function') continue
    const f = value as (...args: unknown[]) => unknown
    out[name] = (...args: unknown[]) => {
      names?.push(name)
      if (!dev || !frame) return f(...args)
      const call: ActionCall = { module, name, args: args.slice(1), ms: 0 }
      frame.push(call) // before running: a verb inside a verb comes after it
      const t0 = performance.now()
      try {
        return f(...args)
      } finally {
        call.ms = performance.now() - t0
      }
    }
  }
  return out as Verbs<M>
}
