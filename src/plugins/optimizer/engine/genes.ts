// Genes (Decision "Optimizer plugin"): what the engine knows about a variable, and nothing else. A template turns its
// variables into genes (a mass's x is a `real`, its rotation a `real` with a step that wraps, its dock wall a `choice`);
// the engine only keeps each value inside its gene. A step keeps a value on min + k × step (the user: "free, in steps,
// so there are fewer specimens"); `wrap` makes the range a circle (an angle: max is min again, so 0..360 by 15 gives
// 0, 15 … 345). The gene's shape is the catalog's (the kinds that make them are the modules'); keeping a value inside
// one is the engine's.
import type { Gene } from '../../../modules/types.ts'
import type { Rng } from './random.ts'

export type { Gene }

export type Genome = number[]

/** How many values a stepped real gene can take. */
const stepCount = (g: { min: number; max: number; step: number; wrap?: boolean }) =>
  Math.max(1, Math.floor((g.max - g.min) / g.step + 1e-9) + (g.wrap ? 0 : 1))

/** The value kept inside its gene: wrapped or clamped, on its step, a whole choice. A value that is not a number takes
 *  the gene's first value. */
export function repairGene(g: Gene, v: number): number {
  if (g.kind === 'choice') return Number.isFinite(v) ? Math.min(g.options - 1, Math.max(0, Math.round(v))) : 0
  if (!Number.isFinite(v)) return g.min
  const span = g.max - g.min
  if (span <= 0) return g.min
  let x = g.wrap ? g.min + ((((v - g.min) % span) + span) % span) : Math.min(g.max, Math.max(g.min, v))
  if (g.step) {
    const k = Math.round((x - g.min) / g.step)
    const n = stepCount({ ...g, step: g.step })
    x = g.min + (g.wrap ? ((k % n) + n) % n : Math.min(k, n - 1)) * g.step
  }
  return x
}

export const repair = (genes: Gene[], genome: Genome): Genome => genes.map((g, i) => repairGene(g, genome[i]))

/**
 * The gene narrowed to so many of its steps either way of a value, on steps from that value (so the value itself stays
 * one the gene can take): what an earlier stage approved, within its margin (Decision "Stages"). An angle's window does
 * not wrap; a choice, or a real with no step, stays as it is.
 */
export function within(g: Gene, v: number, steps: number): Gene {
  if (g.kind === 'choice' || !g.step || !Number.isFinite(v)) return g
  if (g.wrap) return 2 * steps * g.step >= g.max - g.min ? g : { kind: 'real', min: v - steps * g.step, max: v + steps * g.step, step: g.step }
  const at = Math.min(g.max, Math.max(g.min, v))
  const down = Math.min(steps, Math.floor((at - g.min) / g.step + 1e-9))
  const up = Math.min(steps, Math.floor((g.max - at) / g.step + 1e-9))
  return { kind: 'real', min: at - down * g.step, max: at + up * g.step, step: g.step }
}

export function randomGene(g: Gene, r: Rng): number {
  if (g.kind === 'choice') return r.int(g.options)
  if (g.step) return g.min + r.int(stepCount({ ...g, step: g.step })) * g.step
  return g.min + r.next() * (g.max - g.min)
}

export const randomGenome = (genes: Gene[], r: Rng): Genome => genes.map((g) => randomGene(g, r))

/** Two genomes with the same key are the same specimen. */
export const genomeKey = (genome: Genome) => genome.join(',')
