// Seeded random numbers for the optimizer (Decision "Optimizer plugin"): the same seed, the same run. Mulberry32: its
// whole state is one 32-bit number, so a run's state is plain JSON and a stopped run resumes exactly where it was
// (`rng(state())` goes on with the same numbers).

export interface Rng {
  /** A number in [0, 1). */
  next(): number
  /** An integer in [0, n). */
  int(n: number): number
  /** The generator's state: `rng(state())` goes on from here. */
  state(): number
}

export function rng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (n) => Math.floor(next() * n), state: () => s }
}
