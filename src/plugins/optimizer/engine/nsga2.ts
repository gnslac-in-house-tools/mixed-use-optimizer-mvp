// NSGA-II (Deb et al., 2002), the optimizer's engine (Decision "Optimizer plugin"). It never knows what a mass or a
// road is: it sees genes and gets back, for each genome, its objectives (all minimized: a template negates the ones it
// maximizes) and how far it is from meeting its constraints (`violation`, 0 = feasible).
//
// Ask and tell: the engine says which genomes to evaluate (`state.pending`), the caller evaluates them where it wants
// (here, a worker, several workers) and tells the results back (`tell`). The state is plain JSON (the random
// generator's state is one number), so a run stops after any generation and resumes from a copy of its state.
//
// A generation: the population and its children are ranked by **constrained domination** (Deb: a feasible specimen
// beats an infeasible one; of two infeasible ones, the smaller violation wins; of two feasible ones, Pareto
// dominance), front by front; the last front that fits is cut by **crowding distance** (the ones in emptier stretches
// stay), so the front spreads out. The best N stay (elitism). A seed (the design as it is) can still be crowded out of
// a full front, but it is never lost: every specimen evaluated is kept (`born`), and the front of all of them (what the
// Specimens tab shows) keeps a seed unless a specimen dominates it.
// Children: two parents by binary tournament (lower front, then more crowding room), SBX and polynomial mutation,
// repaired into their genes. A child that is already in the population, or born twice, is mutated again (a few
// tries), then drawn at random: with stepped genes the same specimen would otherwise fill the population. Twins left
// in the pool survive only when there are not enough distinct specimens.
import { genomeKey, randomGenome, repair, type Gene, type Genome } from './genes.ts'
import { OPERATORS, crossover, mutate, mutateGene, type Operators } from './operators.ts'
import { rng, type Rng } from './random.ts'

export interface Evaluation {
  /** Every objective is minimized. */
  objectives: number[]
  /** How far from meeting the constraints (0 = feasible). */
  violation: number
}

export interface Specimen extends Evaluation {
  /** In order of birth, unique in a run. */
  id: number
  genome: Genome
  /** The generation it was born in (0 = the first population). */
  generation: number
}

export interface Settings {
  population: number
  /** How many populations are evaluated, the first included: population × generations evaluations. */
  generations: number
  seed: number
  operators?: Partial<Operators>
}

export interface RunState {
  genes: Gene[]
  settings: Settings
  /** The generation of the genomes in `pending`. */
  generation: number
  /** The random generator's state. */
  rng: number
  nextId: number
  /** The survivors so far (empty until the first generation is told). */
  population: Specimen[]
  /** The genomes to evaluate next, in order. */
  pending: Genome[]
  done: boolean
}

export interface Problem {
  genes: Gene[]
  evaluate(genome: Genome): Evaluation
}

/** What an evaluation that is not a number becomes: the worst there is, still finite (JSON, crowding). */
const WORST = 1e100
const RETRIES = 5

/** An evaluation the engine can rank: finite numbers, the violation ≥ 0. */
export function sanitize(e: Evaluation, objectives: number): Evaluation {
  const bad = e.objectives.length !== objectives || e.objectives.some((o) => !Number.isFinite(o)) || !(e.violation >= 0) || !Number.isFinite(e.violation)
  return bad ? { objectives: Array.from({ length: objectives }, () => WORST), violation: WORST } : { objectives: [...e.objectives], violation: e.violation }
}

/** Constrained domination. */
export function dominates(a: Evaluation, b: Evaluation): boolean {
  if (a.violation > 0 || b.violation > 0) return a.violation < b.violation
  let better = false
  for (let i = 0; i < a.objectives.length; i++) {
    if (a.objectives[i] > b.objectives[i]) return false
    if (a.objectives[i] < b.objectives[i]) better = true
  }
  return better
}

/** Fast non-dominated sort: the fronts, best first, as indices into `items`. */
export function fronts(items: Evaluation[]): number[][] {
  const beats: number[][] = items.map(() => [])
  const beaten = items.map(() => 0)
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (dominates(items[i], items[j])) {
        beats[i].push(j)
        beaten[j]++
      } else if (dominates(items[j], items[i])) {
        beats[j].push(i)
        beaten[i]++
      }
    }
  const out: number[][] = []
  let current = items.flatMap((_, i) => (beaten[i] === 0 ? [i] : []))
  while (current.length) {
    out.push(current)
    const next: number[] = []
    for (const i of current)
      for (const j of beats[i]) if (--beaten[j] === 0) next.push(j)
    current = next.sort((a, b) => a - b)
  }
  return out
}

/** Crowding distance of each member of a front (aligned with `front`); its ends are Infinity. */
export function crowding(items: Evaluation[], front: number[]): number[] {
  const d = new Map(front.map((i) => [i, 0]))
  const m = items[front[0]]?.objectives.length ?? 0
  for (let k = 0; k < m; k++) {
    const sorted = [...front].sort((a, b) => items[a].objectives[k] - items[b].objectives[k] || a - b)
    const lo = items[sorted[0]].objectives[k]
    const hi = items[sorted[sorted.length - 1]].objectives[k]
    d.set(sorted[0], Infinity)
    d.set(sorted[sorted.length - 1], Infinity)
    if (hi - lo <= 0) continue
    for (let s = 1; s < sorted.length - 1; s++) {
      const i = sorted[s]
      d.set(i, d.get(i)! + (items[sorted[s + 1]].objectives[k] - items[sorted[s - 1]].objectives[k]) / (hi - lo))
    }
  }
  return front.map((i) => d.get(i)!)
}

/** Each item's front (0 = best) and crowding distance. */
function ranking(items: Evaluation[]) {
  const rank = Array.from({ length: items.length }, () => 0)
  const crowd = Array.from({ length: items.length }, () => 0)
  fronts(items).forEach((f, r) => {
    const c = crowding(items, f)
    f.forEach((i, k) => {
      rank[i] = r
      crowd[i] = c[k]
    })
  })
  return { rank, crowd }
}

/** The best `n` of a pool, twins last. */
function survivors(pool: Specimen[], n: number): Specimen[] {
  const seen = new Set<string>()
  const distinct: Specimen[] = []
  const twins: Specimen[] = []
  for (const s of pool) {
    const k = genomeKey(s.genome)
    ;(seen.has(k) ? twins : distinct).push(s)
    seen.add(k)
  }
  const out = best(distinct, n)
  return out.length < n ? [...out, ...best(twins, n - out.length)] : out
}

/** The best `n`: whole fronts while they fit, then the roomiest of the next (ties: the older). */
function best(pool: Specimen[], n: number): Specimen[] {
  const out: Specimen[] = []
  if (n <= 0) return out
  for (const f of fronts(pool)) {
    if (out.length + f.length <= n) {
      out.push(...f.map((i) => pool[i]))
      if (out.length === n) break
      continue
    }
    const c = crowding(pool, f)
    const order = f.map((i, k) => ({ i, c: c[k] })).sort((a, b) => b.c - a.c || pool[a.i].id - pool[b.i].id)
    out.push(...order.slice(0, n - out.length).map((o) => pool[o.i]))
    break
  }
  return out
}

/** The best specimens of a list: its first front (the feasible non-dominated ones, else the least infeasible). */
export function paretoFront<S extends Evaluation>(specimens: S[]): S[] {
  return specimens.length ? fronts(specimens)[0].map((i) => specimens[i]) : []
}

const operatorsOf = (s: Settings): Operators => ({ ...OPERATORS, ...s.operators })

/** A genome not yet in `seen`: the one given, else mutated again a few times (a random gene each time), else drawn at
 *  random a few times; a space too small for that keeps the twin. */
function fresh(genes: Gene[], genome: Genome, seen: Set<string>, ops: Operators, r: Rng): Genome {
  let g = genome
  for (let t = 0; t < RETRIES && seen.has(genomeKey(g)); t++) {
    g = mutate(genes, g, ops, r)
    if (seen.has(genomeKey(g)) && genes.length) {
      const i = r.int(genes.length)
      g = g.map((v, k) => (k === i ? mutateGene(genes[k], v, ops, r) : v))
    }
  }
  for (let t = 0; t < RETRIES && seen.has(genomeKey(g)); t++) g = randomGenome(genes, r)
  seen.add(genomeKey(g))
  return g
}

function children(genes: Gene[], population: Specimen[], n: number, ops: Operators, r: Rng): Genome[] {
  const { rank, crowd } = ranking(population)
  const pick = () => {
    const a = r.int(population.length)
    const b = r.int(population.length)
    if (rank[a] !== rank[b]) return rank[a] < rank[b] ? a : b
    if (crowd[a] !== crowd[b]) return crowd[a] > crowd[b] ? a : b
    return r.next() < 0.5 ? a : b
  }
  const seen = new Set(population.map((s) => genomeKey(s.genome)))
  const out: Genome[] = []
  while (out.length < n) {
    const [c1, c2] = crossover(genes, population[pick()].genome, population[pick()].genome, ops, r)
    out.push(fresh(genes, mutate(genes, c1, ops, r), seen, ops, r))
    if (out.length < n) out.push(fresh(genes, mutate(genes, c2, ops, r), seen, ops, r))
  }
  return out
}

/** A new run: the first population is the seeds (repaired, each once, at most `population`), then random genomes. */
export function start(genes: Gene[], settings: Settings, seeds: Genome[] = []): RunState {
  const r = rng(settings.seed)
  const ops = operatorsOf(settings)
  const seen = new Set<string>()
  const pending: Genome[] = []
  for (const s of seeds) {
    const g = repair(genes, s)
    if (pending.length < settings.population && !seen.has(genomeKey(g))) {
      seen.add(genomeKey(g))
      pending.push(g)
    }
  }
  while (pending.length < settings.population) pending.push(fresh(genes, randomGenome(genes, r), seen, ops, r))
  return { genes, settings, generation: 0, rng: r.state(), nextId: 0, population: [], pending, done: settings.generations < 1 }
}

/** The evaluations of `state.pending`, in its order: the survivors, the next genomes to evaluate (none when the run is
 *  done), and the specimens just born (to keep every one evaluated, not only the survivors). */
export function tell(state: RunState, evaluations: Evaluation[]): { state: RunState; born: Specimen[] } {
  if (state.done) throw new Error('The run is done: there is nothing to tell')
  if (evaluations.length !== state.pending.length) throw new Error(`Expected ${state.pending.length} evaluations, got ${evaluations.length}`)
  const objectives =
    state.population[0]?.objectives.length ??
    (evaluations.find((e) => e.objectives.every(Number.isFinite)) ?? evaluations[0])?.objectives.length ??
    0
  const born: Specimen[] = state.pending.map((genome, i) => ({
    id: state.nextId + i,
    genome,
    generation: state.generation,
    ...sanitize(evaluations[i], objectives),
  }))
  const population = survivors([...state.population, ...born], state.settings.population)
  const done = state.generation + 1 >= state.settings.generations
  const r = rng(state.rng)
  const pending = done ? [] : children(state.genes, population, state.settings.population, operatorsOf(state.settings), r)
  return {
    state: { ...state, generation: done ? state.generation : state.generation + 1, rng: r.state(), nextId: state.nextId + born.length, population, pending, done },
    born,
  }
}

export interface Drive {
  /** After each generation: the state and the specimens it evaluated. */
  onGeneration?(state: RunState, born: Specimen[]): void
  /** Checked after each generation: true stops the run (resume it from the state it returns). */
  stop?(state: RunState): boolean
}

/** Evaluates on this thread until the run is done or asked to stop. */
export function resume(problem: Problem, state: RunState, drive: Drive = {}): { state: RunState; specimens: Specimen[] } {
  const specimens: Specimen[] = []
  let s = state
  while (!s.done) {
    const told = tell(s, s.pending.map((g) => problem.evaluate(g)))
    s = told.state
    specimens.push(...told.born)
    drive.onGeneration?.(s, told.born)
    if (!s.done && drive.stop?.(s)) break
  }
  return { state: s, specimens }
}

export const optimize = (problem: Problem, settings: Settings, seeds: Genome[] = [], drive: Drive = {}) =>
  resume(problem, start(problem.genes, settings, seeds), drive)
