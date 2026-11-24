// The optimizer's tools (Phase 8.1b), called as an agent calls them, through the host: the templates read; a run
// started as ▶ Run starts one (the optimizer turned on and the template made active, one undo step, the agent's), waited
// for, its front listed against the design; one run at a time; a specimen kept as a new option, logged as the agent's.
// The run is on this thread (jsdom has no Worker), so a small budget ends in a moment.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { callTool } from '../../../host.ts'
import { useRun } from '../../run/store.ts'

/** A tool's answer, or the test fails with why it could not run. */
async function call<T = Record<string, unknown>>(name: string, input: unknown = {}): Promise<T> {
  const r = await callTool(name, input)
  if (!r.ok) throw new Error(r.error)
  return r.output as T
}

interface Listed {
  status: string
  evaluated: number
  design: { objectives: Record<string, number>; holds: boolean }
  best: Record<string, number>
  specimens: { id: number; holds: boolean; objectives: Record<string, number> }[]
}

const QUICK = { population: 6, generations: 2, seed: 3, wait: 30 }

beforeEach(() => {
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, option: p.options[0].id })
})
afterEach(() => useRun.getState().clear())

describe('the optimizer’s tools', () => {
  it('getOptimizer: the templates turning it on gives, labelled, and no run yet', async () => {
    const o = await call<{ on: boolean; active: string; templates: { id: string; aims: { label: string }[]; budget: { specimens: number } }[]; run: unknown }>('getOptimizer')
    expect(o.on).toBe(false)
    expect(o.templates.map((t) => t.id)).toEqual(['masses', 'masses-circulation', 'circulation'])
    expect(o.active).toBe('masses')
    expect(o.templates[0].aims.every((a) => !a.label.includes('missing'))).toBe(true)
    expect(o.templates[0].budget.specimens).toBe(60 * 80)
    expect(o.run).toBeNull()
  })

  it('runOptimizer turns it on, runs and waits, and lists the front against the design', async () => {
    const r = await call<Listed>('runOptimizer', { template: 'Masses', ...QUICK })
    expect(r.status).toBe('done')
    expect(r.evaluated).toBe(QUICK.population * QUICK.generations)
    expect(Object.keys(r.design.objectives)).toEqual(['brief-gap', 'rules-gap', 'dock-to-gate', 'free-ground'])
    expect(r.specimens.length).toBeGreaterThan(0)
    expect(Object.keys(r.best)).toEqual(Object.keys(r.design.objectives))
    // on for the project, the template active: one undo step, the agent's; the design itself unchanged
    const { project, history } = useApp.getState()
    expect(project.plugins?.optimizer).toMatchObject({ on: true, active: 'masses' })
    expect(history.past).toHaveLength(1)
    expect(project.log!.at(-1)).toMatchObject({ by: 'agent' })
    expect(project.masses).toEqual(demoProject().masses)
    // getSpecimens reads the same run
    const again = await call<Listed>('getSpecimens', { limit: 2 })
    expect(again.specimens.length).toBeLessThanOrEqual(2)
    expect(again.evaluated).toBe(r.evaluated)
  })

  it('one run at a time; a template or an option that is not there says what there is', async () => {
    const going = await call<Listed>('runOptimizer', { population: 40, generations: 50, wait: 0 })
    expect(going.status).toBe('running')
    expect(await callTool('runOptimizer', QUICK)).toEqual({ ok: false, error: expect.stringMatching(/A run is going/) })
    useRun.getState().stop()
    expect(await callTool('runOptimizer', { template: 'nope' })).toEqual({ ok: false, error: expect.stringMatching(/No template "nope"\. There are: masses \(Masses\)/) })
    expect(await callTool('runOptimizer', { option: 'nope' })).toEqual({ ok: false, error: expect.stringMatching(/No option "nope"/) })
  })

  it('keepSpecimen makes a new option of a specimen and goes to it, logged as the agent’s', async () => {
    expect(await callTool('keepSpecimen', { specimen: 1 })).toEqual({ ok: false, error: expect.stringMatching(/No run/) })
    const r = await call<Listed>('runOptimizer', QUICK)
    const id = r.specimens[0].id
    const before = useApp.getState().project.options.length
    const kept = await call<{ option: { id: string; name: string } }>('keepSpecimen', { specimen: id })
    const { project, option } = useApp.getState()
    expect(project.options).toHaveLength(before + 1)
    expect(kept.option.name).toBe(`${demoProject().options[0].name} · #${id}`)
    expect(option).toBe(kept.option.id)
    expect(project.log!.at(-1)).toMatchObject({ by: 'agent' })
    // the listing says which option a specimen was kept as
    const listed = await call<{ specimens: { id: number; keptAs?: string }[] }>('getSpecimens', { limit: 30 })
    expect(listed.specimens.find((s) => s.id === id)?.keptAs).toBe(kept.option.name)
    expect(await callTool('keepSpecimen', { specimen: 99_999 })).toEqual({ ok: false, error: expect.stringMatching(/No specimen #99999/) })
  })
})

describe('what the agent is told a template holds', () => {
  it('is what a run holds: the fixed rules and a strict COS, even when the stored template lacks them', async () => {
    const { described } = await import('../run.ts')
    const { measureCatalog } = await import('../../../../modules/catalog.ts')
    const t = { id: 't', name: 'T', from: 'user' as const, variables: [{ kind: 'mass.position', step: 1 }], objectives: [{ measure: 'brief-gap', sense: 'min' as const }], constraints: [{ measure: 'overlap', max: 5 }, { measure: 'court-clash', max: 0 }], budget: { population: 6, generations: 2, seed: 1 } }
    const held = described(t, measureCatalog(useApp.getState().project)).mustHold
    expect(held.map((c) => [c.measure, c.max])).toEqual([['overlap', 0], ['court-clash', 0], ['outside-buildable', 0], ['required-gap', 0], ['coverage-over', 0]])
    // the stored template is as it was
    expect(t.constraints[0].max).toBe(5)
  })
})
