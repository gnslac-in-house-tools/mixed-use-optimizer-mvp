// A run's problem and specimens, made up for the Specimens tab's tests: nothing is run (runOnDesign only takes the
// design's genome from its problem, so a preview has a project to write).
import { MASSES } from '../../../../typologies/plans.ts'
import { problemOf } from '../../engine/problem.ts'
import { repair, type Gene } from '../../engine/genes.ts'
import { paretoFront, type Specimen } from '../../engine/nsga2.ts'
import type { Described } from '../../run/protocol.ts'
import type { Run } from '../../run/store.ts'
import type { Project } from '../../../../model/schema.ts'

export const PROBLEM: Described = {
  variables: [
    { key: 'w1.x', label: 'Warehouse 1 · x' },
    { key: 'w1.y', label: 'Warehouse 1 · y' },
  ],
  objectives: [
    { id: 'dock-to-gate', label: 'Dock → truck gate', unit: 'm', sense: 'min' },
    { id: 'free-ground', label: 'Free ground', unit: 'm2', sense: 'max' },
    { id: 'brief-gap', label: 'Brief Δ', unit: 'm2', sense: 'min' },
  ],
  constraints: [],
  missing: [],
  design: { objectives: [300, 12_000, 424], constraints: [] },
}

export const specimen = (id: number, generation: number, objectives: number[], violation = 0): Specimen => ({ id, generation, genome: [id * 10, 50], objectives, violation })

/** Three on the front (#2 the balanced), one behind it, one that breaks a must-hold, one the problem refused. */
export const SPECIMENS = [
  specimen(1, 0, [100, -30_000, 424.2]),
  specimen(2, 1, [150, -40_000, 424.1]),
  specimen(3, 1, [250, -45_000, 424]),
  specimen(4, 2, [200, -20_000, 424.3]),
  specimen(5, 2, [90, -50_000, 424], 12),
  specimen(6, 2, [1e100, 1e100, 1e100], 1e100),
]

export const GENES: Gene[] = [
  { kind: 'real', min: 0, max: 100, step: 1 },
  { kind: 'real', min: 0, max: 100, step: 1 },
]

/** A run done with those specimens, as the run's store keeps it. */
export function fakeRun(base: Project, id: number, specimens: Specimen[] = SPECIMENS): Run {
  return {
    id,
    base,
    optionId: 'o1',
    template: MASSES,
    status: 'done',
    problem: PROBLEM,
    state: { genes: GENES, settings: { population: 6, generations: 3, seed: 1 }, generation: 3, rng: 1, nextId: 7, population: [], pending: [], done: true },
    specimens,
    front: paretoFront(specimens),
    evaluated: 0,
    trying: null,
    elapsed: 12_000,
    error: null,
    kept: [],
  }
}

/** The same run with genomes of the project's own problem: the design's, its first gene moved a step or two. */
export function runOnDesign(base: Project, id: number): Run {
  const problem = problemOf(base, 'o1', MASSES)
  const genome = problem.seeds[0]
  const specimens = SPECIMENS.slice(0, 3).map((s, i) => ({ ...s, genome: repair(problem.problem.genes, genome.map((v, k) => (k === 0 ? v + (i + 1) * 3 : v))) }))
  return { ...fakeRun(base, id, specimens), state: { ...fakeRun(base, id).state!, genes: problem.problem.genes } }
}
