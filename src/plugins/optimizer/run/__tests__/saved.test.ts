// The last run kept in the browser (Decision "Last run kept", O.6b): saved under its project's id a moment after it
// changes, back after a reload (a run that was going comes back stopped, to Resume), gone from the tabs when another
// project comes and back with its own, forgotten when it is discarded. Here the shelf is in memory (the app's is
// IndexedDB) and the runs are made up.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../../../model/schema.ts'
import { demoProject } from '../../../../state/demo.ts'
import { fakeRun } from '../../views/__tests__/fixtures.ts'
import { keepRuns, memoryShelf, type Shelf } from '../saved.ts'
import { createRunStore } from '../store.ts'

/** The app's project, as the host gives it: the one now and a word when it changes. */
function projects(first: Project) {
  let now = first
  const listeners = new Set<(p: Project, before: Project) => void>()
  return {
    current: () => now,
    subscribe(f: (p: Project, before: Project) => void) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    open(p: Project) {
      const before = now
      now = p
      for (const f of listeners) f(p, before)
    },
  }
}

const silent = () => ({ post() {}, close() {} })
/** The shelf's promises and the store's updates settle. */
const settle = () => vi.advanceTimersByTimeAsync(0)

let shelf: Shelf
beforeEach(() => {
  vi.useFakeTimers()
  shelf = memoryShelf()
})
afterEach(() => vi.useRealTimers())

describe('the last run, kept in the browser', () => {
  it('is saved under its project’s id a moment after it changes, and comes back in a new session', async () => {
    const a = demoProject()
    const store = createRunStore(silent)
    keepRuns(store, shelf, projects(a), 1000)
    store.setState({ run: { ...fakeRun(a, 1), status: 'running', evaluated: 3, kept: [{ specimen: 2, optionId: 'o2' }] } })
    await vi.advanceTimersByTimeAsync(500)
    expect(await shelf.get(a.id)).toBeNull()
    await vi.advanceTimersByTimeAsync(600)
    expect(await shelf.get(a.id)).not.toBeNull()

    // a reload: another store, the same shelf
    const again = createRunStore(silent)
    keepRuns(again, shelf, projects(a), 1000)
    await settle()
    const run = again.getState().run!
    expect(run.status).toBe('stopped')
    expect(run.evaluated).toBe(0)
    expect(run.specimens).toEqual(fakeRun(a, 1).specimens)
    expect(run.kept).toEqual([{ specimen: 2, optionId: 'o2' }])
    expect(run.base.id).toBe(a.id)
  })

  it('while it goes (its progress every 100 ms) it is saved each second, not when it stops changing', async () => {
    const a = demoProject()
    const store = createRunStore(silent)
    keepRuns(store, shelf, projects(a), 1000)
    store.setState({ run: { ...fakeRun(a, 1), status: 'running' } })
    for (let i = 0; i < 12; i++) {
      await vi.advanceTimersByTimeAsync(100)
      store.setState((s) => ({ run: { ...s.run!, evaluated: i, elapsed: i * 100 } }))
    }
    expect(await shelf.get(a.id)).not.toBeNull()
  })

  it('another project: the run leaves the tabs and its own comes; back to the first, the first’s', async () => {
    const a = demoProject()
    const b = demoProject()
    const store = createRunStore(silent)
    const app = projects(a)
    keepRuns(store, shelf, app, 1000)
    store.setState({ run: fakeRun(a, 1) })
    await vi.advanceTimersByTimeAsync(1100)
    app.open(b)
    await settle()
    expect(store.getState().run).toBeNull()
    expect(await shelf.get(a.id)).not.toBeNull()
    store.setState({ run: { ...fakeRun(b, 2), elapsed: 99 } })
    await vi.advanceTimersByTimeAsync(1100)
    app.open(a)
    await settle()
    expect(store.getState().run?.base.id).toBe(a.id)
    expect((await shelf.get(b.id))?.elapsed).toBe(99)
  })

  it('discarded, it is forgotten; a run of another project is never saved under this one', async () => {
    const a = demoProject()
    const store = createRunStore(silent)
    keepRuns(store, shelf, projects(a), 1000)
    store.setState({ run: fakeRun(a, 1) })
    await vi.advanceTimersByTimeAsync(1100)
    store.getState().clear()
    await settle()
    expect(await shelf.get(a.id)).toBeNull()
    store.setState({ run: fakeRun(demoProject(), 2) })
    await vi.advanceTimersByTimeAsync(1100)
    expect(await shelf.get(a.id)).toBeNull()
  })
})

describe('each stage’s last run (Decision "Stage options")', () => {
  const ref = (stage: string, attempt = 0) => ({ plan: 'plan-o1', stage, attempt })

  it('is kept by its stage too, and comes back when that stage is picked again, if it is its attempt', async () => {
    const a = demoProject()
    const store = createRunStore(silent)
    const kept = keepRuns(store, shelf, projects(a), 1000)
    store.setState({ run: { ...fakeRun(a, 1), stage: ref('stage-1') } })
    await vi.advanceTimersByTimeAsync(1100)
    // another stage's run takes the tabs (saved at once when the first comes back)
    store.setState({ run: { ...fakeRun(a, 2), stage: ref('stage-2'), elapsed: 5 } })
    expect(await kept.restoreStage(ref('stage-1'))).toBe(true)
    expect(store.getState().run).toMatchObject({ stage: ref('stage-1'), elapsed: 12_000 })
    expect(await kept.restoreStage(ref('stage-2'))).toBe(true)
    expect(store.getState().run).toMatchObject({ stage: ref('stage-2'), elapsed: 5 })
    // a later attempt's is not an earlier one's; a stage never run has none
    expect(await kept.restoreStage(ref('stage-1', 1))).toBe(false)
    expect(await kept.restoreStage(ref('stage-3'))).toBe(false)
  })

  it('not while a run goes; discarded, it is forgotten with the project’s', async () => {
    const a = demoProject()
    const store = createRunStore(silent)
    const kept = keepRuns(store, shelf, projects(a), 1000)
    store.setState({ run: { ...fakeRun(a, 1), stage: ref('stage-1') } })
    await vi.advanceTimersByTimeAsync(1100)
    store.setState({ run: { ...fakeRun(a, 2), status: 'running', stage: ref('stage-2') } })
    expect(await kept.restoreStage(ref('stage-1'))).toBe(false)
    store.setState({ run: { ...fakeRun(a, 3), stage: ref('stage-1') } })
    store.getState().clear()
    await settle()
    expect(await kept.restoreStage(ref('stage-1'))).toBe(false)
  })
})
