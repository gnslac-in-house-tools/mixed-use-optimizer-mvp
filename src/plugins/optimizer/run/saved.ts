// The last run kept in the browser (Decision "Last run kept"): one per project, by its id, so a reload goes back to
// its specimens. The run's store is saved at most once a second as it changes (a generation, a stop, a kept option, not
// its progress alone); a run that was going comes back stopped, its last generation's state kept, so Resume goes on.
// Another project: the run leaves the tabs and that project's own comes back. Discard run forgets it. A stage's run
// is kept by its stage too, and comes back when that stage is picked again (`restoreStage`). The .gft keeps none of
// this: only the plans and their settings, whose seed makes a run repeatable. The shelf is IndexedDB in the app
// (`indexedShelf`, the forty runs saved last) and in memory in the tests.
import type { Id, Project } from '../../../model/schema.ts'
import type { Run, RunStore, StageRef } from './store.ts'

/** A run as kept: without its id in the session. */
export type SavedRun = Omit<Run, 'id'>

export interface Shelf {
  get(projectId: Id): Promise<SavedRun | null>
  put(projectId: Id, run: SavedRun): Promise<void>
  remove(projectId: Id): Promise<void>
}

/** The app's project, as the host gives it. */
export interface Projects {
  current(): Project
  subscribe(listener: (p: Project, before: Project) => void): () => void
}

type Store = { getState(): RunStore; subscribe(listener: (s: RunStore, before: RunStore) => void): () => void }

/** What is kept of a run: one that was going is stopped (its worker does not outlive the page). */
function saved(r: Run): SavedRun {
  const { id: _, ...rest } = r
  return { ...rest, status: r.status === 'running' ? 'stopped' : r.status, evaluated: 0, trying: null }
}

/** Keeps the store's run on the shelf, by project; `delay`: ms after its last change. */
export function keepRuns(store: Store, shelf: Shelf, projects: Projects, delay = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null
  /** A run coming back from the shelf is not saved again. */
  let loading = false
  const idNow = () => projects.current().id

  const save = (projectId: Id) => {
    timer = null
    const r = store.getState().run
    if (!r || r.base.id !== projectId) return
    shelf.put(projectId, saved(r)).catch(() => {})
    // a stage's run also by its stage, so going back to that stage brings its specimens back (Decision "Stage options")
    if (r.stage) shelf.put(stageKey(projectId, r.stage), saved(r)).catch(() => {})
  }
  const flush = (projectId: Id) => {
    if (timer === null) return
    clearTimeout(timer)
    save(projectId)
  }
  const restore = async (projectId: Id) => {
    const s = await shelf.get(projectId).catch(() => null)
    if (!s || idNow() !== projectId || store.getState().run) return
    loading = true
    store.getState().load(s)
    loading = false
  }

  store.subscribe(({ run }, before) => {
    if (loading) return
    if (!run) {
      // discarded (another project's going away is not)
      if (before.run && before.run.base.id === idNow()) {
        if (timer !== null) clearTimeout(timer)
        timer = null
        shelf.remove(before.run.base.id).catch(() => {})
        if (before.run.stage) shelf.remove(stageKey(before.run.base.id, before.run.stage)).catch(() => {})
      }
      return
    }
    if (run.base.id !== idNow()) return
    // its progress alone (every 100 ms while it goes) is not worth a save; a generation, a stop, a kept option are
    const b = before.run
    if (b && b.id === run.id && b.specimens === run.specimens && b.status === run.status && b.kept === run.kept && b.problem === run.problem) return
    // at most once a delay, so a run that goes on is saved as it goes
    if (timer !== null) return
    const id = run.base.id
    timer = setTimeout(() => save(id), delay)
  })
  projects.subscribe((p, before) => {
    if (p.id === before.id) return
    flush(before.id)
    const r = store.getState().run
    if (r && r.base.id !== p.id) store.getState().load(null)
    void restore(p.id)
  })
  const r = store.getState().run
  if (r && r.base.id !== idNow()) store.getState().load(null)
  void restore(idNow())
  /** A stage's last run back from the shelf, if it is that attempt's and no run goes: whether it came. */
  const restoreStage = async (ref: StageRef): Promise<boolean> => {
    const projectId = idNow()
    flush(projectId)
    const s = await shelf.get(stageKey(projectId, ref)).catch(() => null)
    const now = store.getState().run
    if (!s || idNow() !== projectId || now?.status === 'running' || s.stage?.attempt !== ref.attempt) return false
    loading = true
    store.getState().load(s)
    loading = false
    return true
  }
  return { flush: () => flush(idNow()), restoreStage }
}

/** Where a stage's last run is kept: by project, plan and stage (the attempt is in the run). */
const stageKey = (projectId: Id, ref: StageRef) => `${projectId}#${ref.plan}/${ref.stage}`

/** The tests' shelf: a copy kept in memory, as IndexedDB keeps one. */
export function memoryShelf(): Shelf {
  const runs = new Map<Id, SavedRun>()
  return {
    get: async (id) => (runs.has(id) ? structuredClone(runs.get(id)!) : null),
    put: async (id, run) => void runs.set(id, structuredClone(run)),
    remove: async (id) => void runs.delete(id),
  }
}

const DB = 'gfit-optimizer'
const RUNS = 'runs'
/** Runs kept: the ones saved last (a project's last, and each of its stages' last). */
const KEEP = 40

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

/** The browser's shelf: IndexedDB, `{ savedAt, run }` by project id, the oldest beyond five let go. */
export function indexedShelf(): Shelf {
  let db: Promise<IDBDatabase> | null = null
  const open = () => {
    db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(RUNS).createIndex('savedAt', 'savedAt')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return db
  }
  const runs = async (mode: IDBTransactionMode) => (await open()).transaction(RUNS, mode).objectStore(RUNS)
  return {
    async get(id) {
      const kept = (await done((await runs('readonly')).get(id))) as { run: SavedRun } | undefined
      return kept?.run ?? null
    },
    async put(id, run) {
      const store = await runs('readwrite')
      await done(store.put({ savedAt: Date.now(), run }, id))
      const extra = (await done(store.count())) - KEEP
      if (extra <= 0) return
      // the oldest go
      const cursor = store.index('savedAt').openKeyCursor()
      let left = extra
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c || left-- <= 0) return
        store.delete(c.primaryKey)
        c.continue()
      }
    },
    async remove(id) {
      await done((await runs('readwrite')).delete(id))
    },
  }
}
