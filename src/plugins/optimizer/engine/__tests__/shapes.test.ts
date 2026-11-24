// What a shape may become (Decision "Fixed size", O.3c): a size the brief fixes is kept exactly (its masses only move
// and turn, floors or not); a free rect stays within its program's N:1; a contour keeps its shape and turns from the
// way it is drawn; a dimension on one mass is a knob (off by default, ±20 % in whole metres, written as a typed length
// is); a lock holds as on the plan: a locked dimension holds its mass's shape, pins a mass it holds by one end (it
// moves, never turns) and ties two masses into one unit; a specimen that would still break one is the worst there is.
// The demo: Warehouse 1 (m1, 160 × 80 at 120, 110), Warehouse 2 (m2), Office 1 (m3, 40 × 20 at 120, 200), all on L1.
import { describe, expect, it } from 'vitest'
import type { Project, Vertex } from '../../../../model/schema.ts'
import { footprintContour, footprintPolygon } from '../../../../engine/geom/footprint.ts'
import { area } from '../../../../engine/geom/polygon.ts'
import { addDimension, setDimensionLength, toggleDimensionLock } from '../../../../state/actions/dimensions.ts'
import { updateMass } from '../../../../state/actions/masses.ts'
import { updateProgram } from '../../../../state/actions/programs.ts'
import { demoProject as gridded } from '../../../../state/demo.ts'
import { settle } from '../../../../state/settle.ts'
import { randomGenome } from '../genes.ts'
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

const KNOBS: Template = { ...MASSES, variables: [{ kind: 'dimension.length', step: 1 }, ...MASSES.variables] }
const Z: Template = { ...MASSES, variables: [...MASSES.variables, { kind: 'level.floors', step: 1 }] }

const mass = (p: Project, id: string) => p.masses.find((m) => m.id === id)!
const keys = (t: ReturnType<typeof problemOf>) => t.variables.map((v) => v.key)
const sizeOf = (p: Project, id: string) => {
  const f = mass(p, id).footprint
  return f.kind === 'rect' ? { width: f.width, depth: f.depth } : null
}
/** The design's genome with some values set by key. */
const genome = (t: ReturnType<typeof problemOf>, set: Record<string, number>) => t.seeds[0].map((v, i) => set[t.variables[i].key] ?? v)
const randoms = (t: ReturnType<typeof problemOf>, n: number, seed = 3) => {
  const r = rng(seed)
  return Array.from({ length: n }, () => randomGenome(t.problem.genes, r))
}
const lengthOf = (p: Project, id: string) => {
  const d = p.dimensions!.find((x) => x.id === id)!
  return Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)
}
const sides = (p: Project, id: string) => {
  const v = footprintContour(mass(p, id).footprint).vertices
  return v.map((a, i) => Math.round(Math.hypot(v[(i + 1) % v.length].x - a.x, v[(i + 1) % v.length].y - a.y) * 1e6) / 1e6).sort((a, b) => a - b)
}
function dimension(p: Project, a: { x: number; y: number }, b: { x: number; y: number }, locked = false) {
  const r = addDimension(p, a, b, -3, 'l1')!
  return { p: locked ? toggleDimensionLock(r.project, r.id) : r.project, id: r.id }
}

/** The office as an L: 40 × 10 along its bottom, 20 × 10 over its left half (600 m²). */
const L: Vertex[] = [
  { x: 100, y: 190, r: 0 },
  { x: 140, y: 190, r: 0 },
  { x: 140, y: 200, r: 0 },
  { x: 120, y: 200, r: 0 },
  { x: 120, y: 210, r: 0 },
  { x: 100, y: 210, r: 0 },
]
const withL = () => updateMass(demoProject(), 'm3', { footprint: { kind: 'contour', contour: { vertices: L } } })

describe('a size the brief fixes', () => {
  const fixed = () => updateProgram(demoProject(), 'office', { size: { width: 30, depth: 25, fixed: true } })

  it('its masses get no width: they take exactly that size, and only move and turn', () => {
    const t = problemOf(fixed(), 'o1', MASSES)
    expect(keys(t)).not.toContain('m3.width')
    expect(keys(t)).toEqual(expect.arrayContaining(['m3.rotation', 'm3.x', 'm3.y']))
    for (const g of [t.seeds[0], ...randoms(t, 20)]) expect(sizeOf(t.decode(g), 'm3')).toEqual({ width: 30, depth: 25 })
  })

  it('more floors do not change it', () => {
    const t = problemOf(fixed(), 'o1', Z)
    const q = t.decode(genome(t, { 'l1.floors': 3 }))
    expect(sizeOf(q, 'm3')).toEqual({ width: 30, depth: 25 })
    expect(sizeOf(q, 'm1')).not.toEqual(sizeOf(fixed(), 'm1')) // a free one follows its floors
  })

  it('unfixed, its own size is only where a new mass starts: the proportion is free again', () => {
    const p = updateProgram(demoProject(), 'office', { size: { width: 30, depth: 25 } })
    expect(keys(problemOf(p, 'o1', MASSES))).toContain('m3.width')
  })
})

describe('how elongated a free one may be', () => {
  it('within its program’s N:1, either way round', () => {
    const p = updateProgram(demoProject(), 'warehouse', { maxAspect: 1.5 })
    const t = problemOf(p, 'o1', MASSES)
    // 12,800 m² between 1:1.5 and 1.5:1, whole metres inside
    expect(t.variables.find((v) => v.key === 'm1.width')!.gene).toEqual({ kind: 'real', min: 93, max: 138, step: 1 })
    for (const g of randoms(t, 30)) {
      const s = sizeOf(t.decode(g), 'm1')!
      expect(Math.max(s.width / s.depth, s.depth / s.width)).toBeLessThanOrEqual(1.5 + 1e-9)
    }
  })
})

describe('a contour', () => {
  it('keeps its shape: it moves and turns, from the way it is drawn, never stretches', () => {
    const p = withL()
    const t = problemOf(p, 'o1', MASSES)
    expect(keys(t).filter((k) => k.startsWith('m3.'))).toEqual(['m3.rotation', 'm3.x', 'm3.y'])
    expect(t.variables.find((v) => v.key === 'm3.rotation')!.read(p)).toBe(0)
    const q = t.decode(genome(t, { 'm3.rotation': 90 }))
    expect(sides(q, 'm3')).toEqual(sides(p, 'm3'))
    expect(area(footprintPolygon(mass(q, 'm3').footprint))).toBeCloseTo(600, 6)
    // turned: its bottom side now runs up
    const v = footprintContour(mass(q, 'm3').footprint).vertices
    expect(Math.abs(v[1].x - v[0].x)).toBeCloseTo(0, 6)
    expect(Math.abs(v[1].y - v[0].y)).toBeCloseTo(40, 6)
  })
})

describe('a dimension as a knob', () => {
  const knob = () => dimension(withL(), { x: 100, y: 190 }, { x: 140, y: 190 })

  it('off by default; on, an unlocked one on one mass goes ±20 % in whole metres', () => {
    const { p, id } = knob()
    expect(keys(problemOf(p, 'o1', MASSES))).not.toContain(`${id}.length`)
    const v = problemOf(p, 'o1', KNOBS).variables.find((x) => x.key === `${id}.length`)!
    expect(v.gene).toEqual({ kind: 'real', min: 32, max: 48, step: 1 })
    expect(v.label).toBe('Office 1 · 40 m dimension')
    expect(problemOf(p, 'o1', { ...KNOBS, variables: [{ kind: 'dimension.length', step: 1, range: 0.5 }] }).variables[0].gene).toMatchObject({ min: 20, max: 60 })
  })

  it('stretches the same wall as a typed length, and the dimension follows', () => {
    const { p, id } = knob()
    const t = problemOf(p, 'o1', { ...KNOBS, variables: [{ kind: 'dimension.length', step: 1 }] })
    const q = t.decode([46])
    expect(lengthOf(q, id)).toBeCloseTo(46, 6)
    const typed = setDimensionLength(p, id, 46).project
    expect(mass(q, 'm3').footprint).toEqual(mass(typed, 'm3').footprint)
    expect(mass(q, 'm3').footprint).toEqual(mass((settle(p, typed) as { project: Project }).project, 'm3').footprint)
  })

  it('with the rest of the template, the length stays as the knob says wherever the mass goes', () => {
    const { p, id } = knob()
    const t = problemOf(p, 'o1', KNOBS)
    const i = keys(t).indexOf(`${id}.length`)
    for (const g of randoms(t, 15)) expect(lengthOf(t.decode(g), id)).toBeCloseTo(g[i], 6)
  })
})

describe('locks hold as on the plan', () => {
  it('a locked dimension holds its mass’s shape: no knob, no width', () => {
    const { p, id } = dimension(withL(), { x: 100, y: 190 }, { x: 140, y: 190 }, true)
    expect(keys(problemOf(p, 'o1', KNOBS))).not.toContain(`${id}.length`)
    // on a rect: its side keeps its length
    const r = dimension(demoProject(), { x: 40, y: 70 }, { x: 200, y: 70 }, true)
    const t = problemOf(r.p, 'o1', MASSES)
    expect(keys(t)).not.toContain('m1.width')
    for (const g of randoms(t, 15)) expect(lengthOf(t.decode(g), r.id)).toBeCloseTo(160, 6)
  })

  it('a mass a lock holds by one end moves but never turns', () => {
    const { p } = dimension(demoProject(), { x: 100, y: 210 }, { x: 100, y: 230 }, true) // m3's corner to a free point
    const t = problemOf(p, 'o1', MASSES)
    expect(keys(t)).not.toContain('m3.rotation')
    expect(keys(t)).toEqual(expect.arrayContaining(['m3.x', 'm3.y']))
    for (const g of randoms(t, 15)) expect(t.problem.evaluate(g).violation).toBeLessThan(Infinity)
  })

  it('two masses a locked dimension ties go as one, carried by the first', () => {
    const { p, id } = dimension(demoProject(), { x: 200, y: 150 }, { x: 140, y: 190 }, true) // m1's corner to m3's
    const t = problemOf(p, 'o1', MASSES)
    expect(keys(t).some((k) => k.startsWith('m3.'))).toBe(false)
    expect(keys(t)).not.toContain('m1.width')
    expect(keys(t)).toEqual(expect.arrayContaining(['m1.rotation', 'm1.x', 'm1.y']))
    const l = lengthOf(p, id)
    for (const g of randoms(t, 15)) {
      expect(t.problem.evaluate(g).violation).toBeLessThan(Infinity)
      expect(lengthOf(t.decode(g), id)).toBeCloseTo(l, 6)
    }
  })

  it('a specimen that would still break one is the worst there is, never measured', () => {
    // a locked dimension off its corners by 1 m: following them would change its length
    const { p: p0, id } = dimension(demoProject(), { x: 100, y: 190 }, { x: 140, y: 190 }, true)
    const p: Project = { ...p0, dimensions: p0.dimensions!.map((d) => (d.id === id ? { ...d, a: { x: 99, y: 190 } } : d)) }
    const t = problemOf(p, 'o1', MASSES)
    const e = t.problem.evaluate(genome(t, { 'm3.x': 150 }))
    expect(e.violation).toBe(Infinity)
    expect(e.objectives.every((o) => o === Infinity)).toBe(true)
  })
})
