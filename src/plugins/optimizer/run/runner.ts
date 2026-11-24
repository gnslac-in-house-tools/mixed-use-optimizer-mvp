// A run, wherever it is evaluated (Decision "Optimizer worker"): the worker's body, and the same loop on this thread
// where there is no Worker (the tests). It builds the template's problem on the project it is given, starts the
// engine (or goes on from a stopped run's state) and evaluates each generation's genomes, telling the engine after
// each one and posting what it says. A long generation posts its progress every `slice` ms; `pause` (on this thread
// only) yields there and between generations, so the page keeps drawing and a stop is heard.
import { start, tell, type Evaluation, type RunState } from '../engine/nsga2.ts'
import { problemOf, type TemplateProblem } from '../engine/problem.ts'
import type { Project } from '../../../model/schema.ts'
import type { Described, FromWorker, ToWorker } from './protocol.ts'

export interface RunnerOptions {
  /** Yields to the event loop (this thread only: a worker never needs to). */
  pause?: () => Promise<void>
  /** How often a generation posts its progress, ms. */
  slice?: number
}

export function describe(t: TemplateProblem, project: Project): Described {
  return {
    variables: t.variables.map((v) => ({ key: v.key, label: v.label })),
    objectives: t.objectives.map((o) => ({ id: o.measure.id, label: o.measure.label, unit: o.measure.unit, sense: o.sense })),
    constraints: t.constraints.map((c) => ({ id: c.measure.id, label: c.measure.label, unit: c.measure.unit, max: c.max })),
    missing: t.missing,
    design: t.measure(project),
  }
}

const sameGenes = (a: RunState['genes'], b: RunState['genes']) => JSON.stringify(a) === JSON.stringify(b)

export function runner(post: (m: FromWorker) => void, { pause, slice = 100 }: RunnerOptions = {}) {
  let stopped = false

  async function run(input: Extract<ToWorker, { type: 'run' }>['input']) {
    try {
      const t = problemOf(input.project, input.optionId, input.template)
      const { population, generations, seed } = input.template.budget
      if (input.state && !sameGenes(input.state.genes, t.problem.genes)) {
        throw new Error('This run no longer fits its template or its project: run it again')
      }
      let state = input.state ?? start(t.problem.genes, { population, generations, seed }, t.seeds)
      post({ type: 'started', state, problem: describe(t, input.project) })
      while (!state.done) {
        const evaluations: Evaluation[] = []
        let mark = performance.now()
        for (const genome of state.pending) {
          evaluations.push(t.problem.evaluate(genome))
          if (performance.now() - mark >= slice) {
            post({ type: 'progress', evaluated: evaluations.length, trying: genome })
            if (pause) await pause()
            if (stopped) return
            mark = performance.now()
          }
        }
        const told = tell(state, evaluations)
        state = told.state
        post({ type: 'generation', state, born: told.born })
        if (pause) await pause()
        if (stopped) return
      }
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    receive(m: ToWorker) {
      if (m.type === 'stop') stopped = true
      else void run(m.input)
    },
  }
}
