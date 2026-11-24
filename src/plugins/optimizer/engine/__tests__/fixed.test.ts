// The fixed rules (Decision "Fixed constraints"): outside the buildable area, overlap and required gap held at 0 in
// every run, and COS strict unless the stage loosens it. Applied at run time; a saved stage is never rewritten.
import { describe, expect, it } from 'vitest'
import { demoProject } from '../../../../state/demo.ts'
import { OPTIMIZER_PLANS } from '../../../../typologies/plans.ts'
import { summaryOf } from '../problem.ts'
import { reviewOf } from '../review.ts'
import { COS, FIXED_RULES, withFixedRules, type Template } from '../template.ts'

const base: Template = {
  id: 't',
  name: 'T',
  from: 'user',
  variables: [{ kind: 'mass.position', step: 1 }],
  objectives: [{ measure: 'built-footprint', sense: 'min' }],
  constraints: [],
  budget: { population: 8, generations: 2, seed: 1 },
}

describe('the fixed rules', () => {
  it('names the three fixed rules and the COS', () => {
    expect([...FIXED_RULES]).toEqual(['outside-buildable', 'overlap', 'required-gap'])
    expect(COS).toBe('coverage-over')
  })

  it('adds the fixed rules and a strict COS to a template that lacks them', () => {
    const t = { ...base, constraints: [{ measure: 'stalls-short', max: 0 }] }
    const out = withFixedRules(t)
    expect(out.constraints).toEqual([
      { measure: 'stalls-short', max: 0 },
      { measure: 'outside-buildable', max: 0 },
      { measure: 'overlap', max: 0 },
      { measure: 'required-gap', max: 0 },
      { measure: 'coverage-over', max: 0 },
    ])
    expect(t.constraints).toHaveLength(1) // not mutated
  })

  it('forces a loosened fixed rule back to 0 and keeps a loosened COS', () => {
    const t = { ...base, constraints: [{ measure: 'overlap', max: 5 }, { measure: 'coverage-over', max: 120 }] }
    const out = withFixedRules(t)
    expect(out.constraints.find((c) => c.measure === 'overlap')!.max).toBe(0)
    expect(out.constraints.find((c) => c.measure === 'coverage-over')!.max).toBe(120)
    expect(out.constraints.filter((c) => c.measure === 'overlap')).toHaveLength(1)
    expect(t.constraints[0].max).toBe(5) // not mutated
  })

  it('a problem built from a template without them measures them', () => {
    const s = summaryOf(demoProject(), 'o1', base)
    const ids = s.constraints.map((c) => c.measure.id)
    for (const id of [...FIXED_RULES, COS]) expect(ids).toContain(id)
    expect(s.constraints.every((c) => c.max === 0)).toBe(true)
    expect(s.design.constraints).toHaveLength(s.constraints.length)
  })

  it('a stage saved with overlap at 5 runs with it at 0, and its stored template stays as it was', () => {
    const t = { ...base, constraints: [{ measure: 'overlap', max: 5 }] }
    const s = summaryOf(demoProject(), 'o1', t)
    expect(s.constraints.find((c) => c.measure.id === 'overlap')!.max).toBe(0)
    expect(t.constraints).toEqual([{ measure: 'overlap', max: 5 }])
  })

  it('the review checks them too', () => {
    const p = demoProject()
    const r = reviewOf({ project: p, option: 'o1' }, { project: p, option: 'o1' }, base)
    const ids = r.constraints.map((c) => c.id)
    for (const id of [...FIXED_RULES, COS]) expect(ids).toContain(id)
  })

  it('the typology templates are unchanged by it', () => {
    const all = [...OPTIMIZER_PLANS.templates, ...OPTIMIZER_PLANS.stages, ...OPTIMIZER_PLANS.byModule.flatMap((m) => m.stages)]
    expect(all.length).toBeGreaterThan(0)
    for (const t of all) {
      const tpl = t as Template
      const key = (c: { measure: string; max: number }) => `${c.measure}:${c.max}`
      expect(new Set(withFixedRules(tpl).constraints.map(key))).toEqual(new Set(tpl.constraints.map(key)))
    }
  })
})
