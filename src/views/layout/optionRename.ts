// Design › Options › Rename…: the option switch (OptionSwitch.tsx) keeps its menu and its name field in its own state,
// so the command asks it, through this store, to open on the field: the switch watches `asked` and opens its menu in
// rename mode when it changes. UI state, never in the Project or the history.
import { create } from 'zustand'

export const useOptionRename = create<{ asked: number; ask(): void }>()((set) => ({
  asked: 0,
  ask: () => set((s) => ({ asked: s.asked + 1 })),
}))
