// Who the decision log names as the author (Decision "Decision log"): a name set once per browser (`gfit.author`), at
// the top of the log; none set, "Designer". Sign in (Phase 12) will give it instead.
import { create } from 'zustand'

export const AUTHOR_KEY = 'gfit.author'
export const NO_AUTHOR = 'Designer'

function read(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? ''
  } catch {
    // no localStorage: no name
    return ''
  }
}

interface Author {
  /** As typed; '' when none. */
  name: string
  setName(name: string): void
}

export const useAuthor = create<Author>((set) => ({
  name: read(),
  setName(raw) {
    const name = raw.trim()
    set({ name })
    try {
      if (name) localStorage.setItem(AUTHOR_KEY, name)
      else localStorage.removeItem(AUTHOR_KEY)
    } catch {
      // full or blocked: it lasts as long as the tab
    }
  },
}))

/** The name an entry gets now. */
export const authorNow = () => useAuthor.getState().name || NO_AUTHOR
