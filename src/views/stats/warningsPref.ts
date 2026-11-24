// Whether the warnings chip on the viewport shows its count is a preference of whoever looks (port of Plaza-Practiko
// `vistas/paneles/avisosVisibles.ts`): it lives in localStorage and changes no issue or figure.
import { create } from 'zustand'

export const WARNINGS_KEY = 'gfit.warnings'

function read(): boolean {
  try {
    return localStorage.getItem(WARNINGS_KEY) !== 'no'
  } catch {
    return true
  }
}

export const useWarningsPref = create<{ visible: boolean; set(v: boolean): void }>()((set) => ({
  visible: read(),
  set(visible) {
    set({ visible })
    try {
      localStorage.setItem(WARNINGS_KEY, visible ? 'yes' : 'no')
    } catch {
      // it stays in memory
    }
  },
}))
