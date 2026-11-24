// The engine with buildings and options (Decision "Buildings and options"): each option is measured and checked on its
// own; between buildings, masses clash when their stacks share some height; context is drawn, never counted.
// The demo: Building 1 (b1) with m1 (120, 110) 160 × 80 and m2 (320, 110) 140 × 80, warehouses, and m3, an office;
// all on L1, inside Option 1 (o1). Its levels are 12 m tall.
import { describe, expect, it } from 'vitest'
import type { Footprint, Project } from '../../model/schema.ts'
import { addBuilding, addOption, updateBuilding } from '../../state/actions/buildings.ts'
import { addLevelAtEnd } from '../../state/actions/levels.ts'
import { addMass } from '../../state/actions/masses.ts'
import { demoProject } from '../../state/demo.ts'
import { derive } from '../derive.ts'

const rect = (x: number, y: number, w: number, d: number): Footprint => ({ kind: 'rect', center: { x, y }, width: w, depth: d, rotation: 0 })

/** The demo plus Building 2 with one warehouse over m1 (on its L1), in `option` (absent: in no option). */
function withSecond(option?: string): { p: Project; b2: string; m: string } {
  const b = addBuilding(demoProject(), { optionId: option })
  const m = addMass(b.project, { programId: 'warehouse', footprint: rect(120, 110, 100, 60), levelId: b.levelId })
  return { p: m.project, b2: b.id, m: m.id }
}

const codes = (p: Project, option?: string) => derive(p, option).issues.map((i) => i.code)

describe('options in the engine', () => {
  it('two buildings in one option are checked against each other; in two options, never', () => {
    const same = withSecond('o1')
    expect(codes(same.p)).toContain('overlap')
    const apart = withSecond()
    const two = addOption(apart.p, { buildingIds: [apart.b2] })
    expect(codes(two.project)).not.toContain('overlap')
    expect(codes(two.project, two.id)).not.toContain('overlap')
  })

  it('between buildings, a mass clashes only with what shares some height: one stacked above does not', () => {
    // Building 2's L1 moved up to 20 m: above m1's 12 m
    const { p, b2 } = withSecond('o1')
    const level = p.buildings.find((b) => b.id === b2)!.levels[0]
    const raised = { ...p, buildings: p.buildings.map((b) => (b.id === b2 ? { ...b, levels: [{ ...level, elevation: 20 }] } : b)) }
    expect(codes(raised)).not.toContain('overlap')
    // in one building, a level over another is its floors: not a clash either
    const up = addLevelAtEnd(demoProject(), 'above')
    const floors = addMass(up.project, { programId: 'warehouse', footprint: rect(120, 110, 100, 60), levelId: up.id }).project
    expect(codes(floors)).not.toContain('overlap')
  })

  it('metrics and issues are the asked option’s; `options` has every one', () => {
    const { p, b2 } = withSecond()
    const two = addOption(p, { buildingIds: ['b1', b2] })
    const d1 = derive(two.project)
    const d2 = derive(two.project, two.id)
    expect(d1.option).toBe('o1')
    expect(d2.option).toBe(two.id)
    expect(d1.metrics.builtMasses).toBe(3)
    expect(d2.metrics.builtMasses).toBe(4)
    expect(d2.metrics.buildings).toBe(2)
    expect(d1.options[two.id]).toEqual({ metrics: d2.metrics, issues: d2.issues, relations: d2.relations, docks: d2.docks, earthwork: d2.earthwork, circulation: d2.circulation, roadGrading: d2.roadGrading })
    expect(derive(two.project, 'nowhere').option).toBe('o1')
  })

  it('context is drawn but not counted: no figures, no checks of its own; design masses are checked against it', () => {
    const { p, b2 } = withSecond('o1')
    const ctx = updateBuilding(p, b2, { context: true })
    const d = derive(ctx)
    expect(d.masses[Object.keys(d.masses).at(-1)!]).toMatchObject({ buildingId: b2, context: true })
    expect(d.metrics.builtMasses).toBe(3)
    expect(d.metrics.buildings).toBe(1)
    expect(d.metrics.builtFootprint).toBeCloseTo(derive(demoProject()).metrics.builtFootprint, 6)
    // m1 over the context warehouse is still an overlap
    expect(d.issues.find((i) => i.code === 'overlap')?.massIds).toContain('m1')
    // two context buildings over each other: nothing to say
    const both = updateBuilding(ctx, 'b1', { context: true })
    expect(codes(both)).not.toContain('overlap')
  })

  it('each building has its own figures, whatever option shows it', () => {
    const { p, b2 } = withSecond()
    const d = derive(p)
    expect(d.buildings[b2].footprint).toBeCloseTo(6000, 6)
    expect(d.buildings[b2].gfa).toBeCloseTo(6000, 6)
    expect(d.buildings[b2].builtVolume).toBeCloseTo(6000 * 12, 6)
    expect(d.buildings.b1.footprint).toBeCloseTo(d.metrics.builtFootprint, 6)
  })
})
