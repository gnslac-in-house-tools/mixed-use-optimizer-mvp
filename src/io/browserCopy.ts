// The project kept in this browser (Decision "Saving"): what autosave and Ctrl+S write, and what a reload opens, with
// the option that was in view. Since Decision "Library" each project is kept under its own id (io/library.ts) and
// `gfit.current` names the one last kept; the single copy of before (`gfit.project`) moves into the library the first
// time it is read. Kept as a .gft is, so an old copy is migrated and checked as a file is (readGft); a copy that does
// not read is left alone and the app opens the demo. localStorage: synchronous, so the app opens with it.
import type { Id, Project } from '../model/schema.ts'
import { library, readKept, type Kept, type Summary } from './library.ts'

/** The one copy kept before the library (Decision "Library"): moved into it once. */
export const COPY_KEY = 'gfit.project'
/** The id of the project last kept. */
export const CURRENT_KEY = 'gfit.current'

export type BrowserCopy = Kept

/** The copy of before the library, if any, moved into it (and gone from its old key). */
function moveOldCopy(): void {
  try {
    const raw = localStorage.getItem(COPY_KEY)
    if (raw === null) return
    const old = readKept(raw)
    if (old && library.write(old.project, old.option ?? old.project.options[0].id, old.savedAt)) localStorage.setItem(CURRENT_KEY, old.project.id)
    // one that does not read stays where it was: nothing is lost, and it is not read again as the current
    if (old) localStorage.removeItem(COPY_KEY)
  } catch {
    // no storage: nothing to move
  }
}

/** The id of the project last kept in this browser, or null. */
export function currentId(): Id | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

/** The copy of `id` kept in this browser (default: the one last kept), or null (none, unreadable, or no storage). */
export function readBrowserCopy(id: Id | null = null): BrowserCopy | null {
  moveOldCopy()
  const want = id ?? currentId()
  return want ? library.read(want) : null
}

/** Keeps the project in this browser, as the current one; false when the browser would not (full, or blocked). */
export function writeBrowserCopy(p: Project, option: Id, savedAt: number, thumb?: string, summary?: Summary): boolean {
  if (!library.write(p, option, savedAt, thumb, summary)) return false
  try {
    localStorage.setItem(CURRENT_KEY, p.id)
  } catch {
    // kept, only not marked as the current one
  }
  return true
}
