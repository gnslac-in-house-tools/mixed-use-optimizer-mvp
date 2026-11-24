// What a run's client and its worker say to each other (Decision "Optimizer worker"). Plain JSON both ways: the
// project as it was at ▶ Run, the template and, to resume, a stopped run's state go in; the problem as the tabs show
// it, the progress and each generation's state and specimens come out.
//   client ── run { project, option, template, state? } ──▶ worker
//          ◀── started { state, problem } · progress { evaluated, trying }* · generation { state, born } … · error
// Stopping is the client's: it closes the worker and keeps the last generation's state, which a run resumes from.
import type { Id, Project } from '../../../model/schema.ts'
import type { MeasureUnit } from '../../../modules/types.ts'
import type { Genome } from '../engine/genes.ts'
import type { RunState, Specimen } from '../engine/nsga2.ts'
import type { Template } from '../engine/template.ts'

export interface RunInput {
  /** The project as it was at ▶ Run: every specimen is written into it, whatever happens to the design since. */
  project: Project
  optionId: Id
  template: Template
  /** A stopped run's state: the run goes on from it. */
  state?: RunState
}

/** The problem as the tabs show it: what each gene, objective and constraint is, and the design's own figures (◇). */
export interface Described {
  variables: { key: string; label: string }[]
  objectives: { id: string; label: string; unit: MeasureUnit; sense: 'min' | 'max' }[]
  constraints: { id: string; label: string; unit: MeasureUnit; max: number }[]
  /** The ids the template names that the registries no longer have. */
  missing: string[]
  /** The design as it is, measured: its objectives as read (a max one not negated) and its constraints. */
  design: { objectives: number[]; constraints: number[] }
}

export type ToWorker = { type: 'run'; input: RunInput } | { type: 'stop' }

export type FromWorker =
  | { type: 'started'; state: RunState; problem: Described }
  /** Within a generation, every so often: how many of its genomes are evaluated, and the last one (what Specimens'
   *  *All* shows while the run goes). */
  | { type: 'progress'; evaluated: number; trying: Genome }
  /** A generation told: the state to resume from (`done` when the budget is spent) and the specimens it evaluated. */
  | { type: 'generation'; state: RunState; born: Specimen[] }
  | { type: 'error'; message: string }
