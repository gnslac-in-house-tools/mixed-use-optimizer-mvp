// Test problems with known answers, for the optimizer's engine.
import type { Gene } from '../genes.ts'
import type { Problem } from '../nsga2.ts'

/** ZDT1 (Zitzler, Deb and Thiele): two objectives, a convex front f2 = 1 − √f1 where x2 … xn are 0. */
export function zdt1(n = 10): Problem {
  const genes: Gene[] = Array.from({ length: n }, () => ({ kind: 'real', min: 0, max: 1 }))
  return {
    genes,
    evaluate: (x) => {
      const g = 1 + (9 * x.slice(1).reduce((s, v) => s + v, 0)) / (n - 1)
      return { objectives: [x[0], g * (1 - Math.sqrt(x[0] / g))], violation: 0 }
    },
  }
}

/** How far a point is above ZDT1's true front (0 = on it). */
export const zdt1Gap = ([f1, f2]: number[]) => f2 - (1 - Math.sqrt(f1))

/** Minimize x and y in [0, 1] with x + y ≥ `sum`: the front is the line x + y = sum. */
export function corner(sum: number): Problem {
  return {
    genes: [
      { kind: 'real', min: 0, max: 1 },
      { kind: 'real', min: 0, max: 1 },
    ],
    evaluate: ([x, y]) => ({ objectives: [x, y], violation: Math.max(0, sum - x - y) }),
  }
}

/** A turned mass and a dock wall, as a template will make them: an angle in 15° steps (best: nearest 100°) and one of
 *  three choices (best: 2), with a second objective that pulls the angle the other way (best: nearest 300°). */
export function stepped(): Problem {
  const off = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  return {
    genes: [
      { kind: 'real', min: 0, max: 360, step: 15, wrap: true },
      { kind: 'choice', options: 3 },
    ],
    evaluate: ([a, c]) => ({ objectives: [off(a, 100) + (2 - c) * 50, off(a, 300)], violation: 0 }),
  }
}
