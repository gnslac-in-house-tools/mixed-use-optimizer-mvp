// A run off the main thread (Decision "Optimizer worker"): the runner (the worker's body) describes the problem, posts
// each generation and its progress, and goes on from a stopped run's state exactly as if it had never stopped; the
// store (what the tabs read) keeps every specimen and their front, stops, resumes and hears only its own run. Here
// the runner is on this thread (jsdom has no Worker: the browser runs the same code in one).
import { describe, expect, it, vi } from 'vitest'
import { toggleMassLock } from '../../../../state/actions/masses.ts'
import type { Project } from '../../../../model/schema.ts'
import { demoProject as gridded } from '../../../../state/demo.ts'
import { paretoFront } from '../../engine/nsga2.ts'
import type { Template } from '../../engine/template.ts'
import { MASSES } from '../../../../typologies/plans.ts'
import { threadPort, type Spawn } from '../client.ts'
import type { FromWorker, RunInput } from '../protocol.ts'
import { runner, type RunnerOptions } from '../runner.ts'
import { asRead, createRunStore, progressOf } from '../store.ts'

/** The demo off its grid (Decision "Grid always" gives every project one, the demo too): the masses' own kinds, in
 *  metres and degrees, as an optimizer meets a project read as raw JSON without a grid. */
const demoProject = (): Project => {
  const { grid: _, ...p } = gridded()
  return p
}

const SMALL: Template = { ...MASSES, budget: { population: 6, generations: 4, seed: 7 } }
const input = (over: Partial<RunInput> = {}): RunInput => ({ project: demoProject(), optionId: 'o1', template: SMALL, ...over })

/** Without a pause the runner goes through on this thread: every message is posted by the time it returns. */
function messages(i: RunInput, options?: RunnerOptions): FromWorker[] {
  const out: FromWorker[] = []
  runner((m) => out.push(m), options).receive({ type: 'run', input: i })
  return out
}
const generations = (ms: FromWorker[]) => ms.flatMap((m) => (m.type === 'generation' ? [m] : []))
const born = (ms: FromWorker[]) => generations(ms).flatMap((m) => m.born)

describe('the runner', () => {
  it('describes the problem, then posts each generation until the budget is spent', () => {
    const ms = messages(input())
    expect(ms[0].type).toBe('started')
    const started = ms[0] as Extract<FromWorker, { type: 'started' }>
    expect(started.problem.objectives.map((o) => [o.id, o.sense])).toEqual([
      ['brief-gap', 'min'],
      ['rules-gap', 'min'],
      ['dock-to-gate', 'min'],
      ['free-ground', 'max'],
    ])
    expect(started.problem.variables.map((v) => v.label)).toContain('Warehouse 1 · x')
    expect(started.problem.design.objectives).toHaveLength(4)
    expect(started.problem.design.constraints).toHaveLength(SMALL.constraints.length)
    expect(started.problem.missing).toEqual([])
    const gs = generations(ms)
    expect(gs.map((g) => g.state.done)).toEqual([false, false, false, true])
    expect(born(ms).map((s) => s.id)).toEqual([...Array(24).keys()])
    expect(ms.some((m) => m.type === 'error')).toBe(false)
  })

  it('goes on from a stopped run’s state as if it had never stopped', () => {
    const whole = messages(input())
    const first = generations(whole)[0]
    const rest = messages(input({ state: JSON.parse(JSON.stringify(first.state)) }))
    expect(rest[0].type).toBe('started')
    expect([...first.born, ...born(rest)]).toEqual(born(whole))
    expect(generations(rest).at(-1)!.state).toEqual(generations(whole).at(-1)!.state)
  })

  it('a long generation posts its progress, and the genome it tried last', () => {
    const ms = messages(input({ template: { ...SMALL, budget: { ...SMALL.budget, generations: 1 } } }), { slice: 0 })
    expect(ms.flatMap((m) => (m.type === 'progress' ? [m.evaluated] : []))).toEqual([1, 2, 3, 4, 5, 6])
    const started = ms.find((m) => m.type === 'started')!
    const progress = ms.filter((m) => m.type === 'progress')
    if (started.type !== 'started') throw new Error('not started')
    expect(progress.map((m) => (m.type === 'progress' ? m.trying : null))).toEqual(started.state.pending)
  })

  it('refuses a state whose genes are not its problem’s', () => {
    const state = generations(messages(input()))[0].state
    const ms = messages(input({ project: toggleMassLock(demoProject(), 'm1'), state }))
    expect(ms).toEqual([{ type: 'error', message: expect.stringMatching(/no longer fits/) }])
  })
})

/** The thread's port, with a hook on what the store hears. */
function spy() {
  const hook: { on?: (m: FromWorker) => void } = {}
  const spawn: Spawn = (receive) =>
    threadPort((m) => {
      receive(m)
      hook.on?.(m)
    })
  return { spawn, hook }
}

describe('the run store', () => {
  const whole = born(messages(input()))

  it('runs, keeps every specimen and their front, and says how far it is', async () => {
    const store = createRunStore(threadPort)
    store.getState().start(demoProject(), 'o1', SMALL)
    expect(store.getState().run!.status).toBe('running')
    await vi.waitFor(() => expect(store.getState().run!.status).toBe('done'), { timeout: 10_000 })
    const r = store.getState().run!
    expect(r.specimens).toEqual(whole)
    expect(r.front).toEqual(paretoFront(whole))
    expect(progressOf(r)).toBe(1)
    expect(r.elapsed).toBeGreaterThan(0)
    // a max objective comes back as read: free ground in m², not negated
    expect(asRead(r.problem!, r.front[0])[3]).toBeGreaterThanOrEqual(0)
  })

  it('stops after a generation and resumes to the same run', async () => {
    const { spawn, hook } = spy()
    const store = createRunStore(spawn)
    hook.on = (m) => {
      if (m.type === 'generation' && m.state.generation === 1) store.getState().stop()
    }
    store.getState().start(demoProject(), 'o1', SMALL)
    await vi.waitFor(() => expect(store.getState().run!.status).toBe('stopped'), { timeout: 10_000 })
    const stopped = store.getState().run!
    expect(stopped.specimens).toHaveLength(6)
    expect(progressOf(stopped)).toBeCloseTo(6 / 24, 9)
    // nothing more is heard from the stopped run
    await new Promise((ok) => setTimeout(ok, 50))
    expect(store.getState().run!.specimens).toHaveLength(6)
    hook.on = undefined
    store.getState().resume()
    await vi.waitFor(() => expect(store.getState().run!.status).toBe('done'), { timeout: 10_000 })
    expect(store.getState().run!.specimens).toEqual(whole)
  })

  it('a new run closes the one under way', async () => {
    const store = createRunStore(threadPort)
    store.getState().start(demoProject(), 'o1', { ...SMALL, budget: { ...SMALL.budget, seed: 99 } })
    store.getState().start(demoProject(), 'o1', SMALL)
    await vi.waitFor(() => expect(store.getState().run!.status).toBe('done'), { timeout: 10_000 })
    await new Promise((ok) => setTimeout(ok, 50))
    expect(store.getState().run!.specimens).toEqual(whole)
  })

  it('an error ends the run and says why', async () => {
    const closed = vi.fn()
    const store = createRunStore((receive) => ({ post: () => receive({ type: 'error', message: 'Out of memory' }), close: closed }))
    store.getState().start(demoProject(), 'o1', SMALL)
    expect(store.getState().run).toMatchObject({ status: 'error', error: 'Out of memory' })
    expect(closed).toHaveBeenCalled()
    store.getState().resume() // an error is not resumed: the run starts again
    expect(store.getState().run!.status).toBe('error')
    store.getState().clear()
    expect(store.getState().run).toBeNull()
  })
})
