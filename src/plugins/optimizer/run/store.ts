// A run as the tabs see it (Decision "Optimizer worker"): one at a time, in the plugin's own store (a run is not the
// project's and never edits it; the app's store is the core's). ▶ Run starts one on an option of the project as it is
// then; Stop closes its worker and keeps the last generation's state; Resume opens a new worker on that state, so the
// run goes on exactly as it would have without the stop (the engine is seeded). Every specimen evaluated is kept, and
// the front of all of them: the best, what Specimens shows (the front of a front and the newly born is the front of
// all, so it grows a generation at a time). It remembers the options kept from it (Decision "Keep a specimen"), which
// *Discard run* takes away.
import { create } from 'zustand'
import type { Id, Project } from '../../../model/schema.ts'
import type { Genome } from '../engine/genes.ts'
import { paretoFront, type RunState, type Specimen } from '../engine/nsga2.ts'
import type { Template } from '../engine/template.ts'
import { defaultSpawn, type Port, type Spawn } from './client.ts'
import type { Described, FromWorker, RunInput } from './protocol.ts'

export type RunStatus = 'running' | 'stopped' | 'done' | 'error'

export interface Run {
  /** Unique in the session: a tab forgets what it picked of another run. */
  id: number
  /** The project as it was at ▶ Run. */
  base: Project
  optionId: Id
  template: Template
  status: RunStatus
  /** Null until the worker has built the problem. */
  problem: Described | null
  /** The last generation's: what Resume goes on from. */
  state: RunState | null
  /** Every specimen evaluated, in order of birth. */
  specimens: Specimen[]
  front: Specimen[]
  /** How many genomes of the generation under way are evaluated. */
  evaluated: number
  /** The genome evaluated last, as the worker said (every 100 ms, and each generation's last): Specimens' *All*. */
  trying: Genome | null
  /** Time spent running, ms (stops not counted). */
  elapsed: number
  error: string | null
  /** The options kept from it: a specimen's id and the option it made. */
  kept: { specimen: number; optionId: Id }[]
  /** The stage attempt it is (Decision "Stage plan"): its plan, its stage, which attempt. */
  stage?: StageRef
}

export interface StageRef {
  plan: string
  stage: string
  attempt: number
}

export interface RunStore {
  run: Run | null
  start(project: Project, optionId: Id, template: Template, stage?: StageRef): void
  stop(): void
  resume(): void
  clear(): void
  /** A specimen became an option. */
  keep(specimen: number, optionId: Id): void
  /** A run kept in the browser comes back (saved.ts), or none: the tabs show it, stopped or done; no worker opens. */
  load(run: Omit<Run, 'id'> | null): void
}

export function createRunStore(spawn: Spawn = defaultSpawn) {
  let port: Port | null = null
  let since = 0
  let runs = 0

  return create<RunStore>()((set, get) => {
    const update = (f: (r: Run) => Partial<Run>) => set((s) => (s.run ? { run: { ...s.run, ...f(s.run) } } : s))
    /** The run's time, up to now. */
    const tick = (r: Run) => {
      const now = performance.now()
      const elapsed = r.elapsed + now - since
      since = now
      return elapsed
    }
    const close = () => {
      port?.close()
      port = null
    }
    const receive = (m: FromWorker) => {
      if (m.type === 'started') update(() => ({ problem: m.problem, state: m.state }))
      else if (m.type === 'progress') update((r) => ({ evaluated: m.evaluated, trying: m.trying, elapsed: tick(r) }))
      else if (m.type === 'generation') {
        update((r) => ({
          state: m.state,
          specimens: [...r.specimens, ...m.born],
          front: paretoFront([...r.front, ...m.born]),
          evaluated: 0,
          trying: m.born.at(-1)?.genome ?? r.trying,
          elapsed: tick(r),
          status: m.state.done ? 'done' : r.status,
        }))
        if (m.state.done) close()
      } else {
        update((r) => ({ status: 'error', error: m.message, evaluated: 0, elapsed: tick(r) }))
        close()
      }
    }
    const open = (input: RunInput) => {
      close()
      since = performance.now()
      // a port closed (a stop, another run) is not heard any more
      const mine: Port = spawn((m) => {
        if (port === mine) receive(m)
      })
      port = mine
      mine.post({ type: 'run', input })
    }

    return {
      run: null,
      start(project, optionId, template, stage) {
        close()
        set({
          run: {
            id: ++runs,
            base: project,
            optionId,
            template,
            status: 'running',
            problem: null,
            state: null,
            specimens: [],
            front: [],
            evaluated: 0,
            trying: null,
            elapsed: 0,
            error: null,
            kept: [],
            ...(stage && { stage }),
          },
        })
        open({ project, optionId, template })
      },
      stop() {
        if (get().run?.status !== 'running') return
        close()
        update((r) => ({ status: 'stopped', evaluated: 0, elapsed: tick(r) }))
      },
      resume() {
        const r = get().run
        if (r?.status !== 'stopped') return
        update(() => ({ status: 'running' }))
        open({ project: r.base, optionId: r.optionId, template: r.template, state: r.state ?? undefined })
      },
      clear() {
        close()
        set({ run: null })
      },
      keep(specimen, optionId) {
        update((r) => ({ kept: [...r.kept, { specimen, optionId }] }))
      },
      load(run) {
        close()
        set({ run: run ? { ...run, id: ++runs } : null })
      },
    }
  })
}

/** The run of the app (both tabs read it). */
export const useRun = createRunStore()

/** How much of the run's budget is spent, 0 to 1. */
export function progressOf(r: Run): number {
  const { population, generations } = r.template.budget
  return Math.min(1, (r.specimens.length + r.evaluated) / (population * generations))
}

/** A specimen's objectives as read (the engine minimizes: a max one comes negated), as the design's own figures are. */
export const asRead = (problem: Described, s: Specimen) => s.objectives.map((v, i) => (problem.objectives[i].sense === 'max' ? -v : v))
