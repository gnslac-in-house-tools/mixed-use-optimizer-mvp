// The stages' tools (P.3, Decision "Stage tools"), called as an agent calls them, through the host: an option's plan
// read (the typology's until it changes); runStage presses ▶ Run (turned on, a new attempt, its
// run waited for and its front listed), or, for a stage the agent works, makes a copy of its input to edit;
// evaluateStage gives the stage's review; approveStage keeps the specimen (or the copy) as the stage's option, grouped
// under the plan's, logged as the agent's. What cannot be done says why. jsdom has no Worker: a small budget.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { derive } from '../../../../engine/derive.ts'
import { demoProject } from '../../../../state/demo.ts'
import { emptyHistory } from '../../../../state/history.ts'
import { useApp } from '../../../../state/store.ts'
import { callTool } from '../../../host.ts'
import { OptimizerDataSchema, planIn, savePlan, turnOn } from '../../data.ts'
import { oneStagePlan, stageFrom } from '../../engine/stages.ts'
import { MASSES } from '../../../../typologies/plans.ts'
import { useRun } from '../../run/store.ts'
import { actions } from '../../../../state/actions/index.ts'

async function call<T = Record<string, unknown>>(name: string, input: unknown = {}): Promise<T> {
  const r = await callTool(name, input)
  if (!r.ok) throw new Error(r.error)
  return r.output as T
}
const refusal = async (name: string, input: unknown) => {
  const r = await callTool(name, input)
  return r.ok ? 'it ran' : r.error
}

interface Read {
  on: boolean
  current: string | null
  stages: { id: string; number: number; name: string; by: string; status: string; input: string; attempts: number; aim?: string; approved?: { option: string }; worked?: string }[]
}
interface Evaluated {
  stage: string
  of: string
  against: string
  holds: boolean
  objectives: { id: string; way: string; before: number; after: number }[]
  mustHold: { id: string; held: boolean }[]
  unchanged: number
}

const QUICK = { population: 6, generations: 2, seed: 3, wait: 30 }
const plan = () => planIn(OptimizerDataSchema.parse(useApp.getState().project.plugins?.optimizer), 'o1', useApp.getState().project)
/** A plan of one stage, Masses (a single run), stored; the optimizer not turned on yet. */
function masses() {
  const p = useApp.getState().project
  const d = turnOn(p.typology, null)
  useApp.setState({ project: { ...p, plugins: { optimizer: { ...savePlan(d, oneStagePlan('o1', MASSES)), on: false } } } })
}

beforeEach(() => {
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null, option: 'o1' })
})
afterEach(() => useRun.getState().clear())

describe('the stages’ tools', () => {
  it('getStages: the option’s plan, the typology’s until it changes', async () => {
    const r = await call<Read>('getStages')
    expect(r.on).toBe(false)
    expect(r.current).toBe('stage-1')
    expect(r.stages.map((s) => s.name)).toEqual(['Grid', 'Buildings', 'Docks', 'Streets', 'Parking'])
    expect(r.stages[0]).toEqual(expect.objectContaining({ id: 'stage-1', number: 1, name: 'Grid', by: 'optimizer', status: 'todo', input: 'Option 1', attempts: 0 }))
  })

  it('runStage runs it (turned on, an attempt, the agent’s), evaluateStage reviews a specimen, approveStage keeps it', async () => {
    masses()
    const ran = await call<{ stage: string; attempt: number; status: string; specimens: { id: number }[] }>('runStage', { stage: '1', ...QUICK })
    expect(ran).toMatchObject({ stage: '① Masses', attempt: 1, status: 'done' })
    expect(plan().stages[0].attempts).toHaveLength(1)
    expect(plan().stages[0].attempts[0].template.budget).toMatchObject({ population: 6, generations: 2, seed: 3 })
    expect(useApp.getState().project.log!.at(-1)).toMatchObject({ by: 'agent' })
    expect((await call<Read>('getStages')).stages[0].status).toBe('review')

    // which specimen: none picked yet
    expect(await refusal('evaluateStage', { stage: 'Masses' })).toMatch(/Which specimen of ① Masses\?/)
    const id = ran.specimens[0].id
    const e = await call<Evaluated>('evaluateStage', { stage: 'stage-1', specimen: id })
    expect(e).toMatchObject({ stage: '① Masses', of: `#${id}`, against: 'Option 1' })
    expect(e.objectives.map((o) => o.id)).toEqual(MASSES.objectives.map((o) => o.measure))
    expect(e.objectives.every((o) => ['better', 'worse', 'same'].includes(o.way))).toBe(true)
    expect(e.mustHold.map((c) => c.id)).toEqual(MASSES.constraints.map((c) => c.measure))
    expect(e.holds).toBe(e.mustHold.every((c) => c.held))
    // a reading: nothing changed
    expect(useApp.getState().history.past).toHaveLength(2)

    const a = await call<{ approved: { id: string; name: string }; next: unknown; note: string }>('approveStage', { stage: '1', specimen: id })
    expect(a.approved.name).toBe(`① Masses · #${id}`)
    expect(a.next).toBeNull()
    const { project, option } = useApp.getState()
    expect(option).toBe(a.approved.id)
    expect(project.options.find((o) => o.id === a.approved.id)?.group).toEqual({ under: 'o1', name: 'Stages' })
    expect(project.log!.at(-1)).toMatchObject({ by: 'agent' })
    expect(plan().stages[0].approved).toMatchObject({ option: a.approved.id, specimen: id })
    // read from the option it approved: the same plan, approved; it cannot run again until reopened
    const read = await call<Read>('getStages')
    expect(read.stages[0]).toMatchObject({ status: 'approved', approved: { option: a.approved.name } })
    expect(await refusal('runStage', { stage: '1' })).toMatch(/is approved .*the designer reopens it/)
    // the approved option against its input
    expect(await call<Evaluated>('evaluateStage', { stage: '1' })).toMatchObject({ of: a.approved.name, against: 'Option 1' })
  })

  it('a stage the agent works: a copy of its input to edit, evaluated and approved as it is', async () => {
    const p = useApp.getState().project
    const d = turnOn(p.typology, null)
    const stage = { ...stageFrom(MASSES, 'stage-1', 'agent'), aim: 'Close the brief' }
    useApp.setState({ project: { ...p, plugins: { optimizer: { ...d, plans: [{ id: 'plan-o1', option: 'o1', stages: [stage] }] } } } })
    expect((await call<Read>('getStages')).stages[0]).toMatchObject({ by: 'agent', aim: 'Close the brief' })

    const w = await call<{ worked: { id: string; name: string } }>('runStage', { stage: '1', how: 'edit' })
    expect(w.worked.name).toBe('① Masses · by the agent')
    expect(useApp.getState().option).toBe(w.worked.id)
    expect(plan().stages[0].attempts[0]).toMatchObject({ input: 'o1', worked: w.worked.id })
    // untouched, its review changes nothing
    const e = await call<Evaluated>('evaluateStage', { stage: '1' })
    expect(e).toMatchObject({ of: w.worked.name, against: 'Option 1' })
    expect(e.objectives.every((o) => o.way === 'same')).toBe(true)

    const a = await call<{ approved: { id: string } }>('approveStage', { stage: '1' })
    expect(a.approved.id).toBe(w.worked.id)
    expect(plan().stages[0].approved?.option).toBe(w.worked.id)
  })

  it('what cannot be done says why', async () => {
    masses()
    expect(await refusal('getStages', { option: 'nope' })).toMatch(/No option "nope"/)
    expect(await refusal('runStage', { stage: 'nope' })).toMatch(/No stage "nope"\. There are: 1 stage-1 \(Masses\)/)
    expect(await refusal('evaluateStage', { stage: '1' })).toMatch(/has not run: runStage runs it/)
    expect(await refusal('approveStage', { stage: '1' })).toMatch(/has not run/)
    expect(await refusal('runStage', { stage: '1', how: 'edit' })).toMatch(/is the optimizer’s/)
    // one run at a time
    expect(await call<{ status: string }>('runStage', { stage: '1', option: 'Option 1', population: 40, generations: 50, wait: 0 })).toMatchObject({ status: 'running' })
    expect(await refusal('runStage', { stage: '1', ...QUICK })).toMatch(/A run is going/)
    useRun.getState().stop()
    // a plan whose first is by hand: the designer's; the second runs without it approved (Decision "Free steps")
    const p = useApp.getState().project
    const d = turnOn(p.typology, null)
    const stages = [stageFrom(MASSES, 'stage-1', 'hand'), stageFrom(MASSES, 'stage-2')]
    useApp.setState({ project: { ...p, plugins: { optimizer: { ...d, plans: [{ id: 'plan-o1', option: 'o1', stages }] } } } })
    expect(await refusal('runStage', { stage: '1' })).toMatch(/is the designer’s \(by hand\)/)
    const read = await call<{ stages: { input: string }[] }>('getStages', {})
    expect(read.stages[1].input).toBe('Option 1')
  })
})

describe('a copy past its range (Decision "Past the range by hand", RB.2)', () => {
  it('runStage refuses while one is past, naming it; with backToRange, it is brought back and the stage runs', async () => {
    const made = actions.addWarehouseType(useApp.getState().project)
    const placed = actions.placeWarehouse(made.project, made.id, { x: 200, y: 150 }, 0, 'o1')!
    const grown = actions.stretchWarehouseHall(placed.project, placed.id, { axis: 'length', end: 1 }, 60).project
    useApp.setState({ project: { ...grown, plugins: { optimizer: turnOn(grown.typology, null) } } })
    const length = () => useApp.getState().project.buildings.find((b) => b.id === placed.id)!.warehouse!.overrides?.hall?.length
    expect(await refusal('runStage', { stage: '1', ...QUICK })).toMatch(/1 copy is past its range: .*260 m long, its range 176–224 m.*backToRange: true/)
    expect(length()).toBe(260)
    const ran = await call<{ attempt: number }>('runStage', { stage: '1', ...QUICK, backToRange: true })
    expect(ran.attempt).toBe(1)
    expect(length()).toBe(224)
  })
})
