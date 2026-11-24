// The z axis and groups in the Masses template (Decision "Masses template", O.3b): each level's floor height and its
// floors, written with updateLevel so the levels above go up with them (nothing floats); with the floors, a footprint
// follows them (the brief's area per mass ÷ floors, else the floor area it has); the proportion stays inside what the
// new area allows; a group goes whole, carried by its first mass. The project: the demo, with the office (m3, 40 × 20,
// its own height 8 m; the brief asks 1,200 m² of office in one mass) in an *Office* building of its own, whose L1 has
// an L2 above it.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { addBuilding, assignMasses } from '../../../../state/actions/buildings.ts'
import { groupMasses } from '../../../../state/actions/groups.ts'
import { addLevelAtEnd } from '../../../../state/actions/levels.ts'
import { addMass, moveMasses, toggleMassLock } from '../../../../state/actions/masses.ts'
import { setProgramTarget } from '../../../../state/actions/programs.ts'
import { demoProject as gridded } from '../../../../state/demo.ts'
import { randomGenome } from '../genes.ts'
import { MAX_ASPECT } from '../../../../engine/brief.ts'
import { centreOf } from '../../../../modules/vary.ts'
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

const Z: Template = { ...MASSES, variables: [...MASSES.variables, { kind: 'level.height', step: 0.5 }, { kind: 'level.floors', step: 1 }] }

function officeBuilding() {
  const b = addBuilding(demoProject(), { name: 'Office', optionId: 'o1' })
  let p = assignMasses(b.project, ['m3'], b.id, 'o1')
  const l2 = addLevelAtEnd(p, 'above', b.id)
  // a level stands only where a mass does (Decision "Levels follow the masses"): a locked one, so L2 has no genes
  const roof = addMass(l2.project, { programId: null, footprint: { kind: 'rect', center: { x: 0, y: 0 }, width: 5, depth: 5, rotation: 0 }, levelId: l2.id, name: 'Roof' })
  p = toggleMassLock(roof.project, roof.id)
  return { p, building: b.id, l1: b.levelId, l2: l2.id }
}

const level = (p: Project, id: string) => p.buildings.flatMap((b) => b.levels).find((l) => l.id === id)!
const mass = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const area = (p: Project, id: string) => {
  const f = mass(p, id).footprint
  return f.kind === 'rect' ? f.width * f.depth : NaN
}
/** The genome of the design, with some values set by key. */
function genome(t: ReturnType<typeof problemOf>, set: Record<string, number>) {
  return t.seeds[0].map((v, i) => set[t.variables[i].key] ?? v)
}

describe('the z axis', () => {
  it('each level with a free mass gets its floor height (±2 m by 0.5) and its floors (1 to 4)', () => {
    const { p, l1 } = officeBuilding()
    const t = problemOf(p, 'o1', Z)
    const office = t.variables.filter((v) => v.target === l1)
    expect(office.map((v) => v.key)).toEqual([`${l1}.height`, `${l1}.floors`])
    const h = level(p, l1).height
    expect(office[0].gene).toEqual({ kind: 'real', min: Math.max(2.5, h - 2), max: h + 2, step: 0.5 })
    expect(office[1].gene).toEqual({ kind: 'real', min: 1, max: 4, step: 1 })
    // the warehouses' level too; the empty L2 has none
    expect(t.variables.some((v) => v.target === 'l1')).toBe(true)
    expect(t.variables.some((v) => v.target.startsWith('l') && v.target !== 'l1' && v.target !== l1)).toBe(false)
  })

  it('more floors: the levels above go up with them, and the footprint follows the brief over its floors', () => {
    const { p, l1, l2 } = officeBuilding()
    const t = problemOf(p, 'o1', Z)
    const q = t.decode(genome(t, { [`${l1}.floors`]: 3 }))
    const a = level(q, l1)
    expect(a.repeat).toBe(3)
    expect(level(q, l2).elevation).toBeCloseTo(a.elevation + a.height * 3, 9) // nothing floats
    expect(area(q, 'm3')).toBeCloseTo(1200 / 3, 6)
    expect(t.measure(q).objectives[0]).toBeCloseTo(24, 0) // brief Δ: only the guard house's 24 m² is left (the booleans round to 0.1 mm)
  })

  it('a program the brief gives no area keeps the floor area it has', () => {
    const { p: p0, l1 } = officeBuilding()
    const p = setProgramTarget(p0, 'office', { area: null, count: null })
    const t = problemOf(p, 'o1', Z)
    expect(area(t.decode(genome(t, { [`${l1}.floors`]: 2 })), 'm3')).toBeCloseTo(800 / 2, 6)
  })

  it('a taller floor lifts the levels above; a mass of its own height keeps it', () => {
    const { p, l1, l2 } = officeBuilding()
    const t = problemOf(p, 'o1', Z)
    const h = level(p, l1).height
    const q = t.decode(genome(t, { [`${l1}.height`]: h + 1.5 }))
    expect(level(q, l1).height).toBe(h + 1.5)
    expect(level(q, l2).elevation).toBeCloseTo(h + 1.5, 9)
    expect(mass(q, 'm3').height).toBe(8)
  })

  it('with the floors, every proportion stays inside what its new area allows, on whole metres', () => {
    const { p } = officeBuilding()
    const t = problemOf(p, 'o1', Z)
    const r = rng(9)
    for (let k = 0; k < 40; k++) {
      const q = t.decode(randomGenome(t.problem.genes, r))
      for (const id of ['m1', 'm2', 'm3']) {
        const f = mass(q, id).footprint
        if (f.kind !== 'rect') continue
        const a = f.width * f.depth
        expect(Number.isInteger(f.width)).toBe(true)
        expect(f.width).toBeGreaterThanOrEqual(Math.sqrt(a / MAX_ASPECT) - 1e-6)
        expect(f.width).toBeLessThanOrEqual(Math.sqrt(a * MAX_ASPECT) + 1e-6)
      }
    }
  })

  it('without the z kinds nothing of the levels changes (the Masses template)', () => {
    const { p } = officeBuilding()
    const t = problemOf(p, 'o1', MASSES)
    const q = t.decode(randomGenome(t.problem.genes, rng(4)))
    expect(q.buildings).toEqual(p.buildings)
  })
})

describe('groups', () => {
  const grouped = () => groupMasses(demoProject(), ['m1', 'm2'])!.project

  it('only the first of a group gets genes, and no proportion', () => {
    const t = problemOf(grouped(), 'o1', MASSES)
    const targets = new Set(t.variables.map((v) => v.target))
    expect(targets.has('m2')).toBe(false)
    expect(t.variables.map((v) => v.key)).not.toContain('m1.width')
    expect(t.variables.map((v) => v.key)).toEqual(expect.arrayContaining(['m1.rotation', 'm1.x', 'm1.y', 'm3.width']))
  })

  it('moves and turns whole: the members keep their distance and their size', () => {
    const p = grouped()
    const t = problemOf(p, 'o1', MASSES)
    const gap = (q: Project) => Math.hypot(centreOf(mass(q, 'm2')).x - centreOf(mass(q, 'm1')).x, centreOf(mass(q, 'm2')).y - centreOf(mass(q, 'm1')).y)
    const moved = t.decode(genome(t, { 'm1.x': 140 }))
    expect(centreOf(mass(moved, 'm2')).x - centreOf(mass(p, 'm2')).x).toBeCloseTo(20, 9)
    const turned = t.decode(genome(t, { 'm1.rotation': 90 }))
    expect(gap(turned)).toBeCloseTo(gap(p), 6)
    expect(area(turned, 'm2')).toBeCloseTo(area(p, 'm2'), 6)
    const f = mass(turned, 'm2').footprint
    expect(f.kind === 'rect' && ((f.rotation - 270) % 360 + 360) % 360).toBeCloseTo(0, 6) // m2 was at 180
  })

  it('a group with a locked member stays as it is', () => {
    const p = toggleMassLock(grouped(), 'm2')
    expect(problemOf(p, 'o1', MASSES).variables.some((v) => v.target === 'm1' || v.target === 'm2')).toBe(false)
  })
})

describe('a building’s masses that touch', () => {
  // the office (m3, 40 × 20 at y 200) against warehouse 1's north wall (m1, 160 × 80 at y 110: up to y 150)
  const against = () => moveMasses(demoProject(), ['m3'], { x: 0, y: -40 })

  it('go as one, carried by the first: the office gets no genes, the warehouse no proportion', () => {
    const t = problemOf(against(), 'o1', MASSES)
    const keys = t.variables.map((v) => v.key)
    expect(keys.some((k) => k.startsWith('m3.'))).toBe(false)
    expect(keys).not.toContain('m1.width')
    expect(keys).toEqual(expect.arrayContaining(['m1.x', 'm1.y', 'm1.rotation', 'm2.width']))
    const moved = t.decode(genome(t, { 'm1.x': 140 }))
    expect(centreOf(mass(moved, 'm3')).x - centreOf(mass(against(), 'm3')).x).toBeCloseTo(20, 9)
  })

  it('apart, or in another building, each goes its own way', () => {
    expect(problemOf(demoProject(), 'o1', MASSES).variables.map((v) => v.key)).toContain('m3.x')
    const b = addBuilding(against(), { name: 'Office', optionId: 'o1' })
    const p = assignMasses(b.project, ['m3'], b.id, 'o1')
    expect(problemOf(p, 'o1', MASSES).variables.map((v) => v.key)).toEqual(expect.arrayContaining(['m1.width', 'm3.x']))
  })
})
