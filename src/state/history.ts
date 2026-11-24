// Undo / redo: two stacks of immutable projects, at most 100 steps.
// Ported from Plaza-Practiko `estado/historial.ts`. It works because actions never mutate a project:
// every edit returns a NEW project, so keeping the old one is enough to go back.
import type { Project } from '../model/schema.ts'

export const MAX_HISTORY = 100

export interface History {
  past: Project[] // last = most recent
  future: Project[] // last = next to redo
}

export const emptyHistory = (): History => ({ past: [], future: [] })

/** Saves the project from before a change; a new change clears the redo stack. */
export function record(h: History, previous: Project): History {
  return { past: [...h.past, previous].slice(-MAX_HISTORY), future: [] }
}

export function undo(h: History, current: Project): { history: History; project: Project } | null {
  if (h.past.length === 0) return null
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, current].slice(-MAX_HISTORY) },
    project: h.past[h.past.length - 1],
  }
}

export function redo(h: History, current: Project): { history: History; project: Project } | null {
  if (h.future.length === 0) return null
  return {
    history: { past: [...h.past, current].slice(-MAX_HISTORY), future: h.future.slice(0, -1) },
    project: h.future[h.future.length - 1],
  }
}
