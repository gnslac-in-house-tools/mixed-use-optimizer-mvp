// The optimizer's engine (Decision "Optimizer plugin"): genes keep their values, the same seed gives the same run,
// NSGA-II reaches known fronts (ZDT1; a constrained corner), stepped genes and choices stay what they are, a stopped
// run resumes exactly, seeds are only dropped for something at least as good, and evaluations that are not numbers
// do not break it.
import { describe, expect, it } from 'vitest'
import { genomeKey, randomGenome, repairGene, type Gene } from '../genes.ts'
import { dominates, fronts, optimize, paretoFront, resume, start, tell, type Evaluation, type Settings } from '../nsga2.ts'
import { rng } from '../random.ts'
import { corner, stepped, zdt1, zdt1Gap } from './problems.ts'

const ev = (objectives: number[], violation = 0): Evaluation => ({ objectives, violation })

describe('genes', () => {
  const angle: Gene = { kind: 'real', min: 0, max: 360, step: 15, wrap: true }
  it('keeps a stepped value on its steps and wraps an angle', () => {
    expect(repairGene(angle, 7)).toBe(0)
    expect(repairGene(angle, 8)).toBe(15)
    expect(repairGene(angle, 355)).toBe(0)
    expect(repairGene(angle, -20)).toBe(345)
    expect(repairGene(angle, 725)).toBe(0)
  })
  it('clamps a real and a stepped real that does not wrap, on its last whole step', () => {
    expect(repairGene({ kind: 'real', min: 2, max: 5 }, 9)).toBe(5)
    expect(repairGene({ kind: 'real', min: 0, max: 10, step: 3 }, 11)).toBe(9)
  })
  it('keeps a choice whole and in range; a value that is not a number takes the first', () => {
    const c: Gene = { kind: 'choice', options: 3 }
    expect(repairGene(c, 1.6)).toBe(2)
    expect(repairGene(c, 7)).toBe(2)
    expect(repairGene(c, NaN)).toBe(0)
    expect(repairGene(angle, NaN)).toBe(0)
  })
  it('draws random genomes inside their genes', () => {
    const genes: Gene[] = [angle, { kind: 'choice', options: 4 }, { kind: 'real', min: -1, max: 1 }]
    const r = rng(3)
    for (let i = 0; i < 200; i++) {
      const [a, c, x] = randomGenome(genes, r)
      expect(a % 15).toBe(0)
      expect(a).toBeLessThan(360)
      expect(Number.isInteger(c) && c >= 0 && c < 4).toBe(true)
      expect(x >= -1 && x <= 1).toBe(true)
    }
  })
})

describe('constrained domination and fronts', () => {
  it('a feasible specimen beats an infeasible one; of two infeasible, the smaller violation', () => {
    expect(dominates(ev([9, 9]), ev([0, 0], 1))).toBe(true)
    expect(dominates(ev([9, 9], 0.5), ev([0, 0], 1))).toBe(true)
    expect(dominates(ev([0, 0], 1), ev([0, 0], 1))).toBe(false)
    expect(dominates(ev([1, 2]), ev([2, 2]))).toBe(true)
    expect(dominates(ev([1, 3]), ev([2, 2]))).toBe(false)
  })
  it('sorts into fronts, best first', () => {
    const items = [ev([1, 3]), ev([2, 2]), ev([3, 3]), ev([0, 0], 2), ev([3, 1])]
    expect(fronts(items)).toEqual([[0, 1, 4], [2], [3]])
    expect(paretoFront(items)).toEqual([items[0], items[1], items[4]])
  })
})

describe('NSGA-II', () => {
  const settings: Settings = { population: 60, generations: 120, seed: 7 }

  it('reaches ZDT1’s front and spreads along it', () => {
    const { state } = optimize(zdt1(10), settings)
    const front = paretoFront(state.population)
    const gaps = front.map((s) => zdt1Gap(s.objectives))
    expect(Math.max(...gaps)).toBeLessThan(0.05)
    const f1 = front.map((s) => s.objectives[0])
    expect(Math.min(...f1)).toBeLessThan(0.05)
    expect(Math.max(...f1)).toBeGreaterThan(0.95)
    expect(front.length).toBeGreaterThan(40)
  })

  it('the same seed gives the same run; another seed, another', () => {
    const a = optimize(zdt1(6), { population: 20, generations: 15, seed: 1 })
    const b = optimize(zdt1(6), { population: 20, generations: 15, seed: 1 })
    const c = optimize(zdt1(6), { population: 20, generations: 15, seed: 2 })
    expect(b.specimens).toEqual(a.specimens)
    expect(c.specimens).not.toEqual(a.specimens)
    expect(a.specimens).toHaveLength(20 * 15)
  })

  it('finds the feasible ground when nothing random is feasible, and follows the constraint’s line', () => {
    const { state } = optimize(corner(1.9), { population: 40, generations: 80, seed: 5 })
    const front = paretoFront(state.population)
    expect(front.every((s) => s.violation === 0)).toBe(true)
    for (const s of front) expect(s.genome[0] + s.genome[1]).toBeCloseTo(1.9, 1)
  })

  it('keeps stepped genes on their steps and choices whole, finds the best of both, and avoids twins', () => {
    const { state, specimens } = optimize(stepped(), { population: 24, generations: 40, seed: 11 })
    for (const s of specimens) {
      expect(s.genome[0] % 15).toBe(0)
      expect([0, 1, 2]).toContain(s.genome[1])
    }
    const best = Math.min(...state.population.map((s) => s.objectives[0]))
    expect(best).toBe(5) // 105° (or 90° + 10) with the best choice: |105 − 100| = 5
    expect(new Set(state.population.map((s) => genomeKey(s.genome))).size).toBe(state.population.length)
  })

  it('a stopped run resumes exactly, from a JSON copy of its state', () => {
    const p = zdt1(6)
    const s: Settings = { population: 16, generations: 12, seed: 3 }
    const whole = optimize(p, s)
    const first = optimize(p, s, [], { stop: (st) => st.generation === 5 })
    expect(first.state.done).toBe(false)
    const copy = JSON.parse(JSON.stringify(first.state))
    const rest = resume(p, copy)
    expect([...first.specimens, ...rest.specimens]).toEqual(whole.specimens)
    expect(rest.state.population).toEqual(whole.state.population)
  })

  it('starts from its seeds and never loses one: the front of every specimen keeps it unless one dominates it', () => {
    const p = zdt1(6)
    const onFront = [0.25, 0, 0, 0, 0, 0] // (0.25, 0.5): nothing can dominate it
    const poor = [0.5, 0.9, 0.9, 0.9, 0.9, 0.9] // far above the front: the run beats it
    const { specimens } = optimize(p, { population: 20, generations: 30, seed: 9 }, [onFront, poor])
    expect(specimens.slice(0, 2).map((s) => s.genome)).toEqual([onFront, poor])
    const front = paretoFront(specimens)
    expect(front.some((s) => s.id === 0)).toBe(true)
    expect(front.some((s) => s.id === 1)).toBe(false)
    expect(front.some((s) => dominates(s, specimens[1]))).toBe(true)
  })

  it('an evaluation that is not a number is the worst there is, and the run goes on', () => {
    const p = zdt1(4)
    const bad = { genes: p.genes, evaluate: (x: number[]) => (x[0] > 0.5 ? ev([NaN, 1]) : p.evaluate(x)) }
    const { state, specimens } = optimize(bad, { population: 20, generations: 10, seed: 4 })
    expect(state.done).toBe(true)
    expect(JSON.stringify(state)).not.toMatch(/null|NaN/)
    for (const s of specimens.filter((x) => x.genome[0] > 0.5)) expect(s.violation).toBeGreaterThan(0)
    expect(paretoFront(state.population).every((s) => s.violation === 0)).toBe(true)
  })

  it('asks and is told: one evaluation per pending genome, nothing after the run is done', () => {
    const p = zdt1(4)
    const s0 = start(p.genes, { population: 8, generations: 1, seed: 1 })
    expect(s0.pending).toHaveLength(8)
    expect(() => tell(s0, [])).toThrow()
    const { state } = tell(s0, s0.pending.map((g) => p.evaluate(g)))
    expect(state.done).toBe(true)
    expect(state.pending).toEqual([])
    expect(() => tell(state, [])).toThrow()
  })
})
