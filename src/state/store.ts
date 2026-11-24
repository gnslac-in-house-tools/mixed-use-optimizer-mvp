// App state (Zustand): the project, its derived result, history and selection.
// This is the ONLY place where the pure world (model, actions, engine) meets React.
//
//   view ──calls──▶ store.apply(action) ──▶ new project ──▶ derive() ──▶ new derived ──▶ views re-render
//
// - apply(f): one history step. f is a pure action (Project → Project).
// - preview(f): during a drag. f is applied to the project from the START of the drag (deltas are cumulative),
//   without recording; commit() on release records the whole drag as ONE step; cancel() (Esc) restores it. An
//   apply in the middle commits it first; an undo or a redo cancels it first.
//   f may return null: the edit was rejected, the view stays at the last valid one.
// - Every edit of apply and preview is settled (settle.ts): anchored dimensions follow their corners and the locks
//   hold, so every verb gets them without knowing. A refused edit changes nothing and leaves `refusal` (the reason)
//   for the view to tell; in a drag, once.
// - open(p): another project in place of this one (a .gft file, a new project): a fresh history, nothing selected.
// - selection: one or more masses of the active level and of the active option's other buildings (Decision
//   "Multi-selection": Shift+click, a window) and, when there is only one, optionally one of its corners (vertex
//   index), which Delete removes. It only selects: it never assigns or saves anything.
// - level: the active level (Decision "Levels"; Practiko's `nivelActivoId`): the plan draws and edits it. Selecting a
//   mass on another level goes to it. `showAll` (Practiko's `verTodos`) only shows: every level, nothing selected.
//   Both are view state, not in the Project or the history; a level that no longer exists falls to the ground floor.
//   The active level also says the active building: its levels are the ones the levels rail and the building's Properties show. It
//   stays in a building of the active option: one taken out of it (or removed) sends the plan to the option's first.
// - option: the active design option (Decision "Buildings and options"): derive() measures and checks it, so `derived`
//   `metrics` and `issues` are its. View state too; an option that no longer exists falls to the first.
// - The app opens with the project kept in this browser, in the option that was in view (Decision "Saving"; autosave
//   and Ctrl+S keep it: views/layout/saving.ts), else with the demo.
// - The decision log (Decision "Decision log"): each committed change (apply, a drag's commit, undo, redo) adds an
//   entry to `project.log`: when, the author, who decided (`by`: the caller's, else from the verb), what, the option's
//   Issues before → after. The log is never undone: undo and redo carry it forward and add their own entry.
// - In dev, every door is traced (state/trace/): the /state-graph page sees each call, its verbs and what changed.
// Pattern ported from Plaza-Practiko `estado/store.ts` (hacer / previsualizar / confirmar / cancelar).
import { create } from 'zustand'
import type { Id, LogBy, LogEntry, Mass, Project } from '../model/schema.ts'
import { allLevels, buildingOf, buildingOfLevel, optionBuildings, optionOf } from '../engine/buildings.ts'
import { footprintContour } from '../engine/geom/footprint.ts'
import { groundLevel, levelOrGround } from '../engine/levels.ts'
import * as engine from '../engine/derive.ts'
import type { Derived } from '../engine/types.ts'
import { readBrowserCopy } from '../io/browserCopy.ts'
import { projectInAddress } from '../io/route.ts'
import { authorNow } from './author.ts'
import { demoProject } from './demo.ts'
import { byOf, describe, withEntry } from './log.ts'
import { settle } from './settle.ts'
import { emptyHistory, record, redo as redoStep, undo as undoStep, type History } from './history.ts'
import { recordVerbs, traced } from './trace/calls.ts'
import { traceStore } from './trace/tracer.ts'

// traced like the verbs: the state graph sees when the engine runs and how long it takes
const { derive } = traced('engine/derive', engine)

export interface Selection {
  /** The mass when exactly one is selected (its handles, its typed edits, its Properties); null with none or several. */
  massId: Id | null
  /** A corner of that mass (index in its contour), or null. */
  vertex: number | null
  /** Every selected mass, in the order they were picked; empty = nothing. */
  massIds: Id[]
}

export interface AppState {
  project: Project
  derived: Derived
  history: History
  /** The project when the current drag started (null = no drag in progress). */
  dragStart: Project | null
  selection: Selection
  /** How many times a project was opened: the plan fits the new site when it changes (Practiko's `aperturas`). */
  opened: number
  /** The last edit a lock refused: why, and `n` to tell one refusal from the next (the toast shows each once). */
  refusal: { text: string; n: number } | null
  /** The active level: the plan draws and edits it. */
  level: Id
  /** All levels shown at once (a view: nothing is selected or edited); `level` stays, to come back to. */
  showAll: boolean
  /** The active design option: `derived.metrics` and `derived.issues` are its. */
  option: Id

  /** `by`: who decided, for the log (a plugin's kept specimen, an agent); absent, the designer or Solve by the verb. */
  apply(f: (p: Project) => Project, by?: LogBy): void
  preview(f: (p: Project) => Project | null): void
  commit(): void
  cancel(): void
  undo(): void
  redo(): void
  /** Replaces the project (a file opened, a new project): its history starts empty, as in Practiko's `abrir`. */
  open(p: Project): void
  /** Selects a mass (and a corner of it) and only it; one on another level takes the plan there. */
  select(massId: Id | null, vertex?: number | null): void
  /** Shift+click: adds the mass to the selection, or takes it out. One on another level is selected alone. */
  toggleSelect(massId: Id): void
  /** Selects these masses of the active level (a window, Ctrl+A, a pasted group); `add` keeps what was selected. */
  selectMany(ids: Id[], add?: boolean): void
  /** Goes to a level (and out of All); a mass selected on another level is let go. */
  setLevel(id: Id): void
  /** All levels at once, or back to the active one; showing them lets go of the selection. */
  setShowAll(on: boolean): void
  /** Goes to an option: its figures and checks; off one of its buildings, the plan goes to its first building's ground floor. */
  setOption(id: Id): void
}

export const NO_SELECTION: Selection = { massId: null, vertex: null, massIds: [] }
const NONE = NO_SELECTION

/** The selection of these masses (no repeats); a corner only when there is one mass. */
export function selectionOf(ids: Id[], vertex: number | null = null): Selection {
  const massIds = [...new Set(ids)]
  if (massIds.length === 0) return NONE
  return massIds.length === 1 ? { massId: massIds[0], vertex, massIds } : { massId: null, vertex: null, massIds }
}

/** A selection lets go of masses (or a corner) that no longer exist, after undo or delete, or that left the option. */
function validSelection(s: Selection, p: Project, option: Id): Selection {
  const shown = optionOf(p, option).buildingIds
  const ids = s.massIds.filter((id) => p.masses.some((m) => m.id === id && shown.includes(buildingOf(p, m).id)))
  if (ids.length !== s.massIds.length) return selectionOf(ids)
  const m = s.massId ? p.masses.find((x) => x.id === s.massId) : undefined
  if (m && s.vertex !== null && s.vertex >= footprintContour(m.footprint).vertices.length) return { ...s, vertex: null }
  return s
}

/**
 * The active level if it still exists and its building is in the active option. Gone from a building still shown (it
 * emptied, or joined a level at its elevation: Decision "Levels follow the masses"), that building's level nearest to
 * where it was (`before`: the project it was in). Else the ground floor of the option's first building (undo took it
 * away, *Remove from option* or a delete took its building, another project opened).
 */
function validLevel(level: Id, p: Project, option: Id, before?: Project): Id {
  const id = levelOrGround(p, level)
  const shown = optionOf(p, option).buildingIds
  if (id === level && shown.includes(buildingOfLevel(p, id)?.id ?? '')) return id
  const was = before && buildingOfLevel(before, level)
  const still = was && shown.includes(was.id) ? p.buildings.find((b) => b.id === was.id) : undefined
  if (was && still) {
    const at = was.levels.find((l) => l.id === level)!.elevation
    return still.levels.reduce((a, b) => (Math.abs(b.elevation - at) < Math.abs(a.elevation - at) ? b : a)).id
  }
  const first = optionBuildings(p, optionOf(p, option))[0]
  return first ? groundLevel(first.levels).id : id
}

/**
 * Can this mass join a selection of several? One of the active level, or of another building of the active option
 * (the plan shows those as context: Decision "Buildings layout"). Not in All, where nothing is selected.
 */
export function joinable(p: Project, level: Id, option: Id, showAll: boolean, m: Mass): boolean {
  if (showAll) return false
  if (m.levelId === level) return true
  const own = buildingOfLevel(p, m.levelId)
  return own !== undefined && own.id !== buildingOfLevel(p, level)?.id && optionOf(p, option).buildingIds.includes(own.id)
}

/** The active option if it still exists, else the first. */
const validOption = (option: Id, p: Project): Id => optionOf(p, option).id

/** A separate store per call: the app uses one, each test makes its own. `option`: the one in view (else the first). */
export function createAppStore(initial: Project, option?: Id) {
  const first = validOption(option ?? initial.options[0].id, initial)
  // a drag that hit a lock has said so already
  let refusedInDrag = false
  let refusals = 0
  // the drag's verbs and the option's Issues when it started, for its entry at commit
  let dragVerb = ''
  let dragIssues = 0
  // what made each project, in the log's words: undo and redo name the change they take back or bring again
  const steps = new WeakMap<Project, string>()
  const store = create<AppState>()((set, get) => {
    const refuse = (text: string) => set({ refusal: { text, n: ++refusals } })
    // undo / redo: the project they bring back, with what is selected and the level still in it
    const restored = (r: { project: Project; history: History }) => {
      const option = validOption(get().option, r.project)
      return {
        project: r.project,
        derived: derive(r.project, option),
        history: r.history,
        selection: validSelection(get().selection, r.project, option),
        level: validLevel(get().level, r.project, option),
        option,
      }
    }
    // the engine on the active option
    const run = (p: Project) => derive(p, get().option)
    const entry = (verb: string, what: string, by: LogBy, option: Id, issues: [number, number]): LogEntry => ({
      at: Date.now(),
      author: authorNow(),
      by,
      verb,
      what,
      option,
      issues,
    })
    // undo / redo: the project they bring back, with the log as it is now plus their own entry
    const stepped = (verb: 'undo' | 'redo', from: Project, r: { project: Project; history: History }) => {
      const label = steps.get(verb === 'undo' ? from : r.project) ?? 'a change'
      const s = restored(r)
      const e = entry(verb, `${verb === 'undo' ? 'Undid' : 'Redid'}: ${label}`, 'designer', s.option, [get().derived.issues.length, s.derived.issues.length])
      const project = { ...s.project, log: [...(from.log ?? []), e] }
      const made = steps.get(r.project)
      if (made) steps.set(project, made)
      return { ...s, project }
    }
    return {
      project: initial,
      derived: derive(initial, first),
      history: emptyHistory(),
      dragStart: null,
      selection: NONE,
      opened: 0,
      refusal: null,
      level: validLevel(levelOrGround(initial, null), initial, first),
      showAll: false,
      option: first,

      apply(f, by) {
        if (get().dragStart) get().commit()
        const { project, history, selection } = get()
        const { result, verbs } = recordVerbs(() => f(project))
        const settled = settle(project, result)
        if ('refused' in settled) return refuse(settled.refused)
        if (settled.project === project) return // the action changed nothing: no history step
        const option = validOption(get().option, settled.project)
        const derived = derive(settled.project, option)
        const verb = verbs[0] ?? ''
        const e = entry(verb, describe(verb, project, settled.project), byOf(verb, by), option, [get().derived.issues.length, derived.issues.length])
        const next = withEntry(settled.project, e)
        steps.set(next, e.what)
        set({
          project: next,
          derived,
          history: record(history, project),
          selection: validSelection(selection, next, option),
          level: validLevel(get().level, next, option, project),
          option,
        })
      },

      preview(f) {
        if (!get().dragStart) dragIssues = get().derived.issues.length
        const start = get().dragStart ?? get().project
        const { result: edited, verbs } = recordVerbs(() => f(start))
        if (verbs[0]) dragVerb = verbs[0]
        const settled = edited === null ? null : settle(start, edited)
        if (settled === null || 'refused' in settled) {
          // rejected: keep showing the last valid edit; a lock says why once per drag
          set({ dragStart: start })
          if (settled && !refusedInDrag) refuse(settled.refused)
          refusedInDrag = settled !== null || refusedInDrag
        } else set({ dragStart: start, project: settled.project, derived: run(settled.project) })
      },

      commit() {
        const { dragStart, project, history } = get()
        refusedInDrag = false
        if (!dragStart) return
        const verb = dragVerb
        dragVerb = ''
        if (project === dragStart) return set({ dragStart: null })
        const e = entry(verb, describe(verb, dragStart, project), byOf(verb), get().option, [dragIssues, get().derived.issues.length])
        const next = withEntry(project, e)
        steps.set(next, e.what)
        set({ dragStart: null, project: next, history: record(history, dragStart) })
      },

      cancel() {
        const { dragStart } = get()
        refusedInDrag = false
        if (!dragStart) return
        dragVerb = ''
        set({ dragStart: null, project: dragStart, derived: run(dragStart) })
      },

      undo() {
        // a standing preview (a drag, a Move's target) goes first, as apply commits one: the history never keeps a
        // project no step made
        if (get().dragStart) get().cancel()
        const r = undoStep(get().history, get().project)
        if (r) set(stepped('undo', get().project, r))
      },

      redo() {
        if (get().dragStart) get().cancel()
        const r = redoStep(get().history, get().project)
        if (r) set(stepped('redo', get().project, r))
      },

      open(p) {
        set({
          project: p,
          derived: derive(p, p.options[0].id),
          history: emptyHistory(),
          dragStart: null,
          selection: NONE,
          opened: get().opened + 1,
          level: validLevel(levelOrGround(p, null), p, p.options[0].id),
          showAll: false,
          option: p.options[0].id,
        })
      },

      select(massId, vertex = null) {
        const selection = massId === null ? NONE : selectionOf([massId], vertex)
        const m = massId === null ? undefined : get().project.masses.find((x) => x.id === massId)
        // a mass on another level (from the 3D, a warning, All): the plan goes there, where its handles are
        set(m ? { selection, level: m.levelId, showAll: false } : { selection })
      },

      toggleSelect(massId) {
        const { project, selection, level, showAll, option } = get()
        const m = project.masses.find((x) => x.id === massId)
        if (!m) return
        // one that cannot join (another level of the active building, another option, All) is picked alone
        if (!joinable(project, level, option, showAll, m)) return get().select(massId)
        const ids = selection.massIds
        set({ selection: selectionOf(ids.includes(massId) ? ids.filter((x) => x !== massId) : [...ids, massId]) })
      },

      selectMany(ids, add = false) {
        const { project, selection, level, showAll, option } = get()
        if (showAll) return
        const ok = ids.filter((id) => project.masses.some((m) => m.id === id && joinable(project, level, option, false, m)))
        set({ selection: selectionOf(add ? [...selection.massIds, ...ok] : ok) })
      },

      setLevel(id) {
        const { project, selection } = get()
        if (!allLevels(project).some((l) => l.id === id)) return
        // the selection keeps what can still join it: that level's, the option's other buildings'
        const kept = selection.massIds.filter((m) => project.masses.some((x) => x.id === m && joinable(project, id, get().option, false, x)))
        const next = kept.length === selection.massIds.length ? selection : selectionOf(kept)
        set({ level: id, showAll: false, selection: next })
      },

      setShowAll(on) {
        set(on ? { showAll: true, selection: NONE } : { showAll: false })
      },

      setOption(id) {
        const { project, level } = get()
        const o = project.options.find((x) => x.id === id)
        if (!o || id === get().option) return
        const here = buildingOfLevel(project, level)
        const first = optionBuildings(project, o)[0]
        // the active level's building is not in that option: go to the ground floor of its first building
        const away = here && !o.buildingIds.includes(here.id) && first
        set({
          option: id,
          derived: derive(project, id),
          ...(away ? { level: groundLevel(first.levels).id, showAll: false, selection: NONE } : {}),
        })
      },
    }
  })
  if (import.meta.env.DEV) traceStore(store)
  return store
}

/**
 * The project kept in this browser when the app opened (Decisions "Saving", "Home"): the one the address names, else
 * the one last kept; the app opens with it, else the demo.
 */
export const openedCopy = readBrowserCopy(projectInAddress())

/** The app's store. Components read it with selectors: useApp((s) => s.project). */
export const useApp = createAppStore(openedCopy?.project ?? demoProject(), openedCopy?.option ?? undefined)
