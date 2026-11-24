// Saving (Decisions "Saving", revised by "Save in the app"; the user: "when I save the project, or press Ctrl+S, I want
// the app to save the project and confirm that the progress is saved" and "the manual save will no longer download a
// local .gft file"). One notion of saved: what this browser keeps (io/library.ts, localStorage, under this address).
//   autosave      on by default, remembered in this browser (`gfit.autosave`): a moment after each change the project
//                 (all its options) and the option in view are kept (io/browserCopy.ts); a reload opens them. Off,
//                 nothing is kept until Save, and leaving the page with changes not kept asks first
//   Save          Ctrl+S, Ctrl+Shift+S and File › Save: the field being typed is committed, the project is kept, and the
//                 notice says "Project saved". No file is written or downloaded, no picker opens: the .gft is
//                 File › Export › Project (.gft) (files.ts), Load project brings one in
//   the check     `keep()` reads the copy back after writing it (autosave's too) and compares it with the project in
//                 memory, and with the option in view: a copy that is missing or differs is a failure, said as one
//                 ("Could not save…", the indicator reads "Not saved"). Save never confirms what it did not verify
//   editors       in the block editor and the terrain editor (their project is never kept) Save does what the editor's
//                 own Save button does, with its notice: the block or the terrain goes to its library
// The indicator beside the project's name (SaveStatus.tsx) says what this browser has: Saved <time>, Unsaved changes,
// Not saved (the last attempt failed) or Not saved yet; a click on it turns autosave off or on. `kept` is the project
// as this browser keeps it: replacing a project asks only when it is not that one and it has changes (`unkept`).
import { create } from 'zustand'
import type { Id, Project } from '../../model/schema.ts'
import type { History } from '../../state/history.ts'
import { writeBrowserCopy } from '../../io/browserCopy.ts'
import { normalised, openedNotice } from '../../io/gft.ts'
import { library } from '../../io/library.ts'
import { sameData } from '../../io/same.ts'
import type { BrowserCopy } from '../../io/browserCopy.ts'
import { openedCopy, useApp } from '../../state/store.ts'
import { summarize } from '../home/summary.ts'
import { projectThumb } from '../home/thumb.ts'
import { BLOCK_EDITOR_ID, TERRAIN_EDITOR_ID } from '../home/editorId.ts'
import { useToast } from './toast.ts'

export const AUTOSAVE_KEY = 'gfit.autosave'

/** ms: autosave keeps the project this long after the last change (a burst of edits is kept once). */
export const AUTOSAVE_DELAY = 600

/** What Save says when this browser would not keep the project, or what it read back is not the project. */
export const SAVE_FAILED = 'Could not save: this browser’s storage is full or blocked. File › Export › Project (.gft) keeps a copy.'

interface SavingState {
  autosave: boolean
  /** When the project was last kept in this browser (this session, or the copy the app opened with); null: never. */
  savedAt: number | null
  /** The project as this browser keeps it: while the project is another, the change is not kept yet. */
  kept: Project | null
  /** The last attempt to keep the project failed (the browser would not, or the copy read back was not the project). */
  failed: boolean
  setAutosave(on: boolean): void
}

const readAutosave = () => {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== 'off'
  } catch {
    return true
  }
}

export const useSaving = create<SavingState>()((set) => ({
  autosave: readAutosave(),
  savedAt: openedCopy?.savedAt ?? null,
  kept: openedCopy ? useApp.getState().project : null,
  failed: false,
  setAutosave: (on) => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, on ? 'on' : 'off')
    } catch {
      // blocked: on or off for as long as the tab lasts
    }
    set({ autosave: on })
    if (on) keep()
  },
}))

/** Autosave on if it is off and off if it is on: the cloud beside the project's name, and File › Autosave. */
export function toggleAutosave(): void {
  useSaving.getState().setAutosave(!useSaving.getState().autosave)
}

/**
 * Whether the copy this browser holds of `project` is it: read back, it has the option in view and the same data.
 * Reading normalises on the way in (an empty building goes, the levels its masses make, a grid: readGft), so a project
 * that differs only so is compared with the project as it opens.
 */
export function readBack(project: Project, option: Id): boolean {
  const read = library.read(project.id)
  if (!read || read.option !== option) return false
  if (sameData(read.project, project)) return true
  // not through the schema (it would drop a key it does not know, on both sides): only the normalisers reading applies
  return sameData(read.project, normalised(JSON.parse(JSON.stringify(project)) as Project))
}

/**
 * A copy kept before the blocks, opened with the app (the one the address names, else the one last kept): what migrating did is said once
 * and the migrated copy is kept, so the next load says nothing (the report and the stored version agree). A copy with nothing to say: nothing.
 */
export function announceOpenedCopy(copy: BrowserCopy | null = openedCopy): void {
  const notes = copy?.notes ?? []
  if (!copy || !notes.length) return
  keep()
  useToast.getState().show('info', openedNotice(useApp.getState().project.name, notes))
}

/**
 * Keeps the project, and the option in view, in this browser now, reads the copy back and compares it with the project
 * in memory; false when the browser would not keep it or the copy is not the project (`failed`, until one is).
 */
export function keep(): boolean {
  const { project, option, derived } = useApp.getState()
  // the block and terrain editors' projects are never kept: their block or terrain is saved to the library (Phase BL.4,
  // Decision "Home libraries")
  if (project.id === BLOCK_EDITOR_ID || project.id === TERRAIN_EDITOR_ID) return true
  const at = Date.now()
  if (!writeBrowserCopy(project, option, at, projectThumb(project, option), summarize(project, derived)) || !readBack(project, option)) {
    useSaving.setState({ failed: true })
    return false
  }
  useSaving.setState({ savedAt: at, kept: project, failed: false })
  return true
}

/**
 * Whether replacing the project (or leaving the page) would lose work: it is not the one this browser keeps and it has
 * changes. Opening is not editing: a project just opened or started, not yet kept and not touched, has nothing to lose,
 * and one the app opened from this browser's copy is the kept one.
 */
export function unkept(): boolean {
  const { project, history } = useApp.getState()
  const { kept } = useSaving.getState()
  return project !== kept && (kept !== null || history.past.length > 0)
}

/** Another project in place of this one (opened, new, the demo): this browser has not kept it yet (files.ts says so when it opened a kept one). */
export function forgetKept(): void {
  useSaving.setState({ kept: null, failed: false, savedAt: null })
}

/** What an editor (the block's, the terrain's) holds of the project in the store while it is open: given back on closing. */
export interface HeldProject {
  project: Project
  option: Id
  history: History
  kept: Project | null
  savedAt: number | null
  failed: boolean
}

/** The project in the store, with its history and what saving says of it. Autosave on, a change not kept yet is kept first. */
export function holdProject(): HeldProject {
  if (useSaving.getState().autosave && unkept()) keep()
  const { project, option, history } = useApp.getState()
  const { kept, savedAt, failed } = useSaving.getState()
  return { project, option, history, kept, savedAt, failed }
}

/** Gives the held project back: as it was, its history, and whether this browser had kept it (open() forgets all that). */
export function restoreProject(h: HeldProject): void {
  useApp.getState().open(h.project)
  useApp.getState().setOption(h.option)
  useApp.setState({ history: h.history })
  useSaving.setState({ kept: h.kept, savedAt: h.savedAt, failed: h.failed })
}

/** What an editor's own Save does (the block editor's, the terrain editor's), by its project's id: they register at load. */
const editorSaves = new Map<Id, () => void>()

export function onEditorSave(id: Id, save: () => void): void {
  editorSaves.set(id, save)
}

/**
 * Ctrl+S, Ctrl+Shift+S and File › Save: the field being typed is committed, the project is kept and checked, and the notice
 * says which: "Project saved" or the error. No file. In an editor, what its own Save button does.
 */
export async function save(): Promise<void> {
  // a number being typed is part of what is saved: leaving its field commits it
  const typing = document.activeElement
  if (typing instanceof HTMLElement && (typing.tagName === 'INPUT' || typing.tagName === 'TEXTAREA')) typing.blur()
  const { show } = useToast.getState()
  const id = useApp.getState().project.id
  if (id === BLOCK_EDITOR_ID || id === TERRAIN_EDITOR_ID) {
    const own = editorSaves.get(id)
    if (own) return own()
    return show('info', `Use the ${id === BLOCK_EDITOR_ID ? 'block' : 'terrain'} editor’s own Save to keep it in the library.`)
  }
  if (keep()) show('info', 'Project saved')
  else show('error', SAVE_FAILED)
}

/**
 * Autosave, while the app is open: each change kept a moment later; a project replaced is not kept yet; leaving the page
 * keeps what is pending, or, with autosave off or a keep that failed, and changes this browser does not have, asks first.
 * Returns the way to stop it.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let warned = false
  const keepOrSay = () => {
    timer = null
    if (keep() || warned) return
    warned = true
    useToast.getState().show('error', 'Autosave could not keep the project in this browser (its storage is full or blocked). File › Export › Project (.gft) keeps a copy.')
  }
  const stop = useApp.subscribe((s, prev) => {
    // another project opened: nothing changed yet (Decision "Library": opening is not editing; files.ts keeps a new one)
    // (a keep pending for the project replaced is not for the new one: leaving it kept what autosave owed: files.ts)
    if (s.opened !== prev.opened) {
      if (timer) clearTimeout(timer)
      timer = null
      return forgetKept()
    }
    // a drag's release records what its preview already showed: the project is the same, the drag is over
    const released = prev.dragStart !== null && s.dragStart === null
    if ((s.project === prev.project && s.option === prev.option && !released) || !useSaving.getState().autosave) return
    // mid-drag the project is a preview: the release keeps it
    if (s.dragStart) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(keepOrSay, AUTOSAVE_DELAY)
  })
  const leave = (e: BeforeUnloadEvent) => {
    if (timer) {
      clearTimeout(timer)
      keepOrSay()
    }
    const { autosave, failed } = useSaving.getState()
    if ((!autosave || failed) && unkept()) e.preventDefault()
  }
  window.addEventListener('beforeunload', leave)
  return () => {
    stop()
    if (timer) clearTimeout(timer)
    window.removeEventListener('beforeunload', leave)
  }
}

// the copy the app opened with, if it was migrated: said and kept as the app starts
announceOpenedCopy()
