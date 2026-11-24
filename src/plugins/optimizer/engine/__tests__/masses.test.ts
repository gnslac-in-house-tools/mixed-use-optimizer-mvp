// The Masses template on a project (Decisions "Optimizer plugin" and "Optimization pipeline"): which masses get genes,
// the design reads back exactly, every decoded value is on its steps and keeps its mass's area, followers go with their
// leader, the project is never changed; the axis is the street's; the measures on cases with known answers; a short run
// on the demo finds feasible specimens better than the design. The demo: Warehouse 1 (m1, 160 × 80 at 120, 110),
// Warehouse 2 (m2, 140 × 80 at 320, 110, turned 180°), Office 1 (m3, 40 × 20 at 120, 200), a south street, one gate.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { addRule } from '../../../../state/actions/graph.ts'
import { moveMass, toggleMassLock, updateMass } from '../../../../state/actions/masses.ts'
import { demoProject as gridded } from '../../../../state/demo.ts'
import { randomGenome } from '../genes.ts'
import { measureCatalog as catalog } from '../../../../modules/catalog.ts'
import { optimize, paretoFront } from '../nsga2.ts'
import { centreOf, mainAxis } from '../../../../modules/vary.ts'
import { problemOf } from '../problem.ts'
import { rng } from '../random.ts'
import type { Template } from '../template.ts'
import { MASSES } from './freeMasses.ts'

/** The demo off its grid (Decision "Grid always" gives every project one, the demo too): the masses' own kinds, in
 *  metres and degrees, as an optimizer meets a project read as raw JSON without a grid. */
const demoProject = (): Project => {
  const { grid: _, ...p } = gridded()
  return p
}

const demo = () => demoProject()
const o1 = (p: Project) => p.options[0].id
const masses = (p: Project) => problemOf(p, o1(p), MASSES)
const value = (p: Project, id: string) => {
  const t = problemOf(p, o1(p), { ...MASSES, objectives: [{ measure: id, sense: 'min' }], constraints: [] })
  return t.measure(p).objectives[0]
}

describe('which masses', () => {
  it('each unlocked design mass gets its width, rotation and centre', () => {
    const t = masses(demo())
    expect(t.missing).toEqual([])
    expect(t.variables.map((v) => v.key)).toEqual(['m1.width', 'm2.width', 'm3.width', 'm1.rotation', 'm2.rotation', 'm3.rotation', 'm1.x', 'm1.y', 'm2.x', 'm2.y', 'm3.x', 'm3.y'])
    expect(t.variables[0].gene).toEqual({ kind: 'real', min: 66, max: 195, step: 1 }) // 12,800 m² from 1:3 to 3:1, whole metres inside
    expect(t.variables[3].gene).toEqual({ kind: 'real', min: 0, max: 360, step: 15, wrap: true })
  })

  it('a locked mass, or one that moves with another, gets none', () => {
    let p = toggleMassLock(demo(), 'm2')
    p = addRule(p, { kind: 'attached', a: 'office', b: 'warehouse', weight: 1 })!.project
    expect(new Set(masses(p).variables.map((v) => v.target))).toEqual(new Set(['m1']))
  })

  it('a template naming what no registry has says so', () => {
    const t = problemOf(demo(), 'o1', { ...MASSES, variables: [...MASSES.variables, { kind: 'mass.colour', step: 1 }], constraints: [{ measure: 'nope', max: 0 }] })
    expect(t.missing).toEqual(['nope', 'mass.colour'])
  })
})

describe('decode', () => {
  it('the design reads back exactly: its seed decodes to the same masses and measures the same', () => {
    const p = demo()
    const t = masses(p)
    expect(t.decode(t.seeds[0]).masses).toEqual(p.masses)
    expect(t.problem.evaluate(t.seeds[0]).objectives.slice(0, 3)).toEqual(t.measure(p).objectives.slice(0, 3))
  })

  it('every value on its steps: rotations by 15° from the axis, whole widths and centres, the area kept', () => {
    const p = demo()
    const t = masses(p)
    const r = rng(5)
    for (let k = 0; k < 30; k++) {
      const q = t.decode(randomGenome(t.problem.genes, r))
      for (const m of q.masses) {
        const f = m.footprint
        if (f.kind !== 'rect') continue
        const was = p.masses.find((x) => x.id === m.id)!.footprint as typeof f
        expect(((f.rotation % 15) + 15) % 15).toBeCloseTo(0, 9)
        expect(Number.isInteger(f.width)).toBe(true)
        expect(f.width * f.depth).toBeCloseTo(was.width * was.depth, 6)
        expect(Number.isInteger(Math.round(f.center.x * 1e6) / 1e6)).toBe(true)
        expect(Number.isInteger(Math.round(f.center.y * 1e6) / 1e6)).toBe(true)
      }
    }
  })

  it('a follower keeps its place from its leader', () => {
    const p = addRule(demo(), { kind: 'attached', a: 'office', b: 'warehouse', weight: 1 })!.project
    const t = masses(p)
    const offset = (q: Project) => {
      const [a, b] = [centreOf(q.masses.find((m) => m.id === 'm1')!), centreOf(q.masses.find((m) => m.id === 'm3')!)]
      return { x: b.x - a.x, y: b.y - a.y }
    }
    const g = t.seeds[0].map((v, i) => (t.variables[i].key === 'm1.x' ? v - 30 : t.variables[i].key === 'm1.y' ? v + 12 : v))
    const q = t.decode(g)
    expect(centreOf(q.masses.find((m) => m.id === 'm1')!)).toEqual({ x: 90, y: 122 })
    expect(offset(q)).toEqual(offset(p))
  })

  it('never changes the project it was made from', () => {
    const p = demo()
    const before = structuredClone(p)
    const t = masses(p)
    t.decode(randomGenome(t.problem.genes, rng(1)))
    t.problem.evaluate(randomGenome(t.problem.genes, rng(2)))
    expect(p).toEqual(before)
  })
})

describe('the main axis', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 300 },
    { x: 0, y: 300 },
  ]
  it('is the longest stretch of the existing street along the boundary, else the longest side, within (−45°, 45°]', () => {
    const tilted = square.map((q) => ({ x: q.x * Math.cos(Math.PI / 6) - q.y * Math.sin(Math.PI / 6), y: q.x * Math.sin(Math.PI / 6) + q.y * Math.cos(Math.PI / 6) }))
    expect(mainAxis(tilted)).toBeCloseTo(30, 9)
    const kite = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 430, y: 300 }, { x: 0, y: 260 }]
    expect(mainAxis(kite)).toBeCloseTo((Math.atan2(40, 430) * 180) / Math.PI, 9) // the north side is longest
    expect(mainAxis(kite, [[{ x: 0, y: 0 }, { x: 286, y: 0 }]])).toBe(0) // its street runs along the south side
  })
  it('the demo’s is its south street’s', () => {
    const p = demo()
    expect(masses(p).decode(masses(p).seeds[0]).masses.map((m) => (m.footprint.kind === 'rect' ? m.footprint.rotation : null))).toEqual([0, 180, 0])
  })
})

describe('measures', () => {
  it('the catalog: the modules’ own measures, then every KPI, each id once', () => {
    const ids = catalog(demo()).map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const own = ['brief-gap', 'rules-gap', 'required-gap', 'dock-to-gate', 'free-ground', 'circulation-issues', 'outside-buildable', 'overlap', 'coverage-over', 'court-clash', 'road-room']
    expect(ids.slice(0, own.length)).toEqual(own)
    expect(ids).toEqual(expect.arrayContaining(['coverage', 'gfa', 'stalls']))
  })

  it('the demo stands within every constraint; its brief misses 424 m² (the office’s 400, the guard house’s 24)', () => {
    const p = demo()
    for (const c of MASSES.constraints) expect(value(p, c.measure)).toBe(0)
    expect(value(p, 'brief-gap')).toBe(424)
  })

  it('overlap: the shared area of two masses that clash', () => {
    const p = moveMass(demo(), 'm2', { x: -110, y: 0 }) // m2 spans x 140–280 over m1's 40–200: 60 × 80
    expect(value(p, 'overlap')).toBeCloseTo(4800, 3)
  })

  it('outside the buildable area: how much of the footprint is out', () => {
    const p = moveMass(demo(), 'm1', { x: -100, y: 0 }) // x −60–100 against the 10 m setback
    expect(value(p, 'outside-buildable')).toBeGreaterThan(5000)
  })

  it('road room: two warehouses 10 m apart miss what a road and its clearances need', () => {
    const p = moveMass(demo(), 'm2', { x: -40, y: 0 }) // m1 ends at 200, m2 starts at 210
    expect(value(p, 'road-room')).toBeCloseTo(8 + 2 * 7 - 10, 6)
  })

  it('dock to gate: nearer when a warehouse comes to the gate', () => {
    const p = demo()
    expect(value(moveMass(p, 'm2', { x: -60, y: 0 }), 'dock-to-gate')).toBeLessThan(value(p, 'dock-to-gate'))
  })

  it('free ground: with no masses, about the whole buildable rectangle; masses take it away', () => {
    const p = demo()
    const empty = { ...p, masses: [] }
    const all = value(empty, 'free-ground')
    expect(all).toBeGreaterThan(80000)
    expect(value(p, 'free-ground')).toBeLessThan(all / 3)
    expect(value(updateMass(p, 'm3', { programId: 'office' }), 'free-ground')).toBe(value(p, 'free-ground'))
  })
})

describe('a run on the demo', () => {
  it('finds feasible specimens, some nearer the gate than the design, in a few ms each', () => {
    const p = demo()
    const t = masses(p)
    const design = t.measure(p).objectives
    const start = performance.now()
    const { specimens } = optimize(t.problem, { population: 16, generations: 8, seed: 3 }, t.seeds)
    const ms = (performance.now() - start) / specimens.length
    const front = paretoFront(specimens)
    expect(front.every((s) => s.violation === 0)).toBe(true)
    expect(Math.min(...front.map((s) => s.objectives[2]))).toBeLessThan(design[2])
    expect(ms).toBeLessThan(60)
  })

  it('a template of one objective and no constraint is a problem too', () => {
    const one: Template = { ...MASSES, objectives: [{ measure: 'free-ground', sense: 'max' }], constraints: [] }
    const t = problemOf(demo(), 'o1', one)
    expect(t.problem.evaluate(t.seeds[0])).toEqual({ objectives: [-t.measure(demo()).objectives[0]], violation: 0 })
  })
})
