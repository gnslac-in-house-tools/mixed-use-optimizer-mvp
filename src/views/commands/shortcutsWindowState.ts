// Whether the keyboard shortcuts window is open (AS.1 task 6): per session, never saved. Edit › Keyboard shortcuts…
// (commands/edit.ts) opens it, the top bar shows it (ShortcutsWindow.tsx), and the dispatcher counts it as a window
// (`placeNow` is `dialog` while it is open: only Undo, Redo, Save and Load answer behind it, as with any other window).
// A store of its own, in no component's file, so the dispatcher and the command can read it without importing a view.
import { create } from 'zustand'

export const useShortcutsWindow = create<{ open: boolean }>()(() => ({ open: false }))
export const openShortcuts = (): void => useShortcutsWindow.setState({ open: true })
export const closeShortcuts = (): void => useShortcutsWindow.setState({ open: false })
