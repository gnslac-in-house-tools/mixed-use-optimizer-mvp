// The optimizer's engine (Decision "Optimizer plugin"): pure, seeded, ask and tell. Templates (O.3) build a `Problem`
// on top of it; the worker and the tabs only use what is exported here.
export { genomeKey, randomGenome, repair, repairGene, type Gene, type Genome } from './genes.ts'
export { OPERATORS, type Operators } from './operators.ts'
export {
  crowding,
  dominates,
  fronts,
  optimize,
  paretoFront,
  resume,
  start,
  tell,
  type Drive,
  type Evaluation,
  type Problem,
  type RunState,
  type Settings,
  type Specimen,
} from './nsga2.ts'
export { rng, type Rng } from './random.ts'
