// Rename (Phase AS.4, Decision "One menu"): F2, Edit › Rename and the right-click menu's Rename ask for the name of what is picked to be
// edited, and the Properties of that thing answer: its name field takes the focus with its text selected. The request is one store
// (as `layout/optionRename.ts` is the option switch's): `ask` shows the Properties tab and leaves the ref asked; the name field of that
// ref's Properties, when it is on screen, takes it (`take`) and focuses; one that mounts after the request (the tab was not open) finds
// it waiting. Each Properties' name field answers with `useRenameField` (the mass's, a lot's, an existing road's; a note's name is its text, a field of several lines).
// UI state, never in the Project or the history.
import { useEffect, useRef, type RefObject } from 'react'
import { create } from 'zustand'
import type { Ref } from '../../kinds/types.ts'
import { showProperties } from '../plan/massCommands.ts'

interface RenameRequest {
  /** The ref whose name field is asked for; null when nothing waits. */
  asked: Ref | null
  /** Asks for the name of `ref`: the Properties tab opens on it. */
  ask(ref: Ref): void
  /** The field that answered: the request is over. */
  take(): void
}

export const useRename = create<RenameRequest>()((set) => ({
  asked: null,
  ask: (ref) => {
    showProperties()
    // a new object every time, so asking twice for the same ref focuses the field twice
    set({ asked: { ...ref } })
  },
  take: () => set({ asked: null }),
}))

/**
 * The ref of a name field in a Properties card: put it on the field (`inputRef`). When the name of this `kind` and `id` is asked for and the field is there
 * and free (`enabled`: the panel's card answers, the one over the viewport leaves it), it takes the focus with its text selected, and the request is over.
 */
export function useRenameField<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(kind: string, id: string, enabled = true): RefObject<T | null> {
  const field = useRef<T>(null)
  const asked = useRename((s) => (s.asked?.kind === kind && s.asked.id === id ? s.asked : null))
  useEffect(() => {
    if (!asked || !enabled || !field.current || field.current.disabled) return
    field.current.focus()
    field.current.select()
    useRename.getState().take()
  })
  return field
}
