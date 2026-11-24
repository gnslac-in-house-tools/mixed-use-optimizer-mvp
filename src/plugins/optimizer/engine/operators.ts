// How children are made (Decision "Optimizer plugin"): Deb's simulated binary crossover (SBX) and polynomial mutation
// for real genes, a swap and a new pick for choices; then every value is repaired into its gene, so a stepped value
// stays on its steps and a choice stays a choice. A stepped gene that a mutation leaves on the same step moves one
// step either way instead: otherwise a small mutation of a coarse step (15°) would almost never change anything.
import { repairGene, type Gene, type Genome } from './genes.ts'
import type { Rng } from './random.ts'

export interface Operators {
  /** The chance that two parents cross (else the children are their copies). */
  crossover: number
  /** The chance that each gene mutates (default 1 / genes). */
  mutation?: number
  /** SBX's spread: higher keeps children nearer their parents. */
  etaCrossover: number
  /** Polynomial mutation's spread: higher keeps the mutated value nearer. */
  etaMutation: number
}

export const OPERATORS: Operators = { crossover: 0.9, etaCrossover: 15, etaMutation: 20 }

/** SBX on one bounded real gene (Deb and Agrawal; the bounded form of Deb's NSGA-II code). */
function sbx(a: number, b: number, lo: number, hi: number, eta: number, r: Rng): [number, number] {
  if (Math.abs(a - b) < 1e-14 || hi <= lo) return [a, b]
  const y1 = Math.min(a, b)
  const y2 = Math.max(a, b)
  const u = r.next()
  const betaq = (beta: number) => {
    const alpha = 2 - beta ** -(eta + 1)
    return u <= 1 / alpha ? (u * alpha) ** (1 / (eta + 1)) : (1 / (2 - u * alpha)) ** (1 / (eta + 1))
  }
  const c1 = 0.5 * (y1 + y2 - betaq(1 + (2 * (y1 - lo)) / (y2 - y1)) * (y2 - y1))
  const c2 = 0.5 * (y1 + y2 + betaq(1 + (2 * (hi - y2)) / (y2 - y1)) * (y2 - y1))
  const k1 = Math.min(hi, Math.max(lo, c1))
  const k2 = Math.min(hi, Math.max(lo, c2))
  return r.next() < 0.5 ? [k2, k1] : [k1, k2]
}

/** Polynomial mutation on one bounded real value. */
function polynomial(y: number, lo: number, hi: number, eta: number, r: Rng): number {
  if (hi <= lo) return lo
  const d1 = (y - lo) / (hi - lo)
  const d2 = (hi - y) / (hi - lo)
  const u = r.next()
  const pow = 1 / (eta + 1)
  const dq =
    u < 0.5
      ? (2 * u + (1 - 2 * u) * (1 - d1) ** (eta + 1)) ** pow - 1
      : 1 - (2 * (1 - u) + 2 * (u - 0.5) * (1 - d2) ** (eta + 1)) ** pow
  return Math.min(hi, Math.max(lo, y + dq * (hi - lo)))
}

export function crossover(genes: Gene[], a: Genome, b: Genome, ops: Operators, r: Rng): [Genome, Genome] {
  const c1 = [...a]
  const c2 = [...b]
  if (r.next() >= ops.crossover) return [c1, c2]
  genes.forEach((g, i) => {
    if (r.next() >= 0.5) return
    if (g.kind === 'choice') [c1[i], c2[i]] = [b[i], a[i]]
    else [c1[i], c2[i]] = sbx(a[i], b[i], g.min, g.max, ops.etaCrossover, r)
  })
  return [c1, c2]
}

/** One gene's mutation, repaired: a choice takes another option, a stepped value moves at least one step. */
export function mutateGene(g: Gene, v: number, ops: Operators, r: Rng): number {
  if (g.kind === 'choice') return g.options < 2 ? v : (v + 1 + r.int(g.options - 1)) % g.options
  const next = repairGene(g, polynomial(v, g.min, g.max, ops.etaMutation, r))
  if (!g.step || next !== v) return next
  const up = repairGene(g, v + g.step)
  const down = repairGene(g, v - g.step)
  return r.next() < 0.5 ? (up !== v ? up : down) : down !== v ? down : up
}

export function mutate(genes: Gene[], genome: Genome, ops: Operators, r: Rng): Genome {
  const p = ops.mutation ?? 1 / Math.max(1, genes.length)
  return genes.map((g, i) => repairGene(g, r.next() < p ? mutateGene(g, genome[i], ops, r) : genome[i]))
}
