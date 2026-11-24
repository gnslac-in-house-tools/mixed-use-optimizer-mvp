// The floating notice (Toast): one message at a time, a new one replaces the old; it may offer one action (a quiet
// question, as *Same floor*: ignored, it goes away and nothing happens). Also the inline confirmation
// (Cancel / Continue) asked before replacing a project that has changes. Port of Plaza-Practiko
// `vistas/paneles/mensajes.ts`.
import { create } from 'zustand'

export type ToastKind = 'error' | 'info'

/** A notice's one button: picked, it runs and the notice closes. */
export interface ToastAction {
  label: string
  run(): void
}

interface ToastState {
  toast: { kind: ToastKind; text: string; id: number; action?: ToastAction } | null
  confirmation: { text: string; onContinue: () => void; id: number; label?: string; other?: ToastAction } | null
  show(kind: ToastKind, text: string, action?: ToastAction): void
  close(): void
  /** Asks first; `onContinue` runs only if Continue (or `label`: *Run*…) is picked; `other`: a second way on, its own button. */
  confirm(text: string, onContinue: () => void, label?: string, other?: ToastAction): void
  closeConfirmation(): void
}

let next = 0

export const useToast = create<ToastState>()((set) => ({
  toast: null,
  confirmation: null,
  show: (kind, text, action) => set({ toast: { kind, text, id: ++next, ...(action ? { action } : {}) } }),
  close: () => set({ toast: null }),
  confirm: (text, onContinue, label, other) => set({ toast: null, confirmation: { text, onContinue, id: ++next, ...(label ? { label } : {}), ...(other ? { other } : {}) } }),
  closeConfirmation: () => set({ confirmation: null }),
}))
