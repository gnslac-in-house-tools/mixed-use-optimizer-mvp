// Light or dark (Decision "Dark mode"). System follows the operating system; Light and Dark are chosen in the View
// menu or with the ☾ of the top bar, and remembered with the layout (`gfit.layout`, ui.ts). The choice is the
// `data-theme` attribute of <html>, which sets `color-scheme` in src/styles/tokens.css; every token is a
// `light-dark()` pair, so one attribute switches them all. With System there is no attribute and the system decides.
// The attribute is set before the store changes: what reads tokens in JS while it renders (the 3D scene) reads the
// new ones. index.html and state-graph.html set it before the first paint, so a dark choice never flashes light.
import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type Shown = 'light' | 'dark'

/** The View menu's rows, in order. */
export const THEMES: { key: Theme; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
]

export const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark'

/** Puts a choice on <html>: Light or Dark as `data-theme`; System as none. */
export function applyTheme(theme: Theme, root: HTMLElement | undefined = globalThis.document?.documentElement) {
  if (!root) return
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}

const QUERY = '(prefers-color-scheme: dark)'
const media = (): MediaQueryList | null => (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(QUERY) : null)

/** Whether the system prefers dark now; false where it cannot say. */
export const systemDark = (): boolean => media()?.matches ?? false

/** What shows: the choice, or the system's when the choice is System. */
export const resolveTheme = (theme: Theme, dark: boolean = systemDark()): Shown => (theme === 'system' ? (dark ? 'dark' : 'light') : theme)

function subscribe(onChange: () => void) {
  const m = media()
  m?.addEventListener('change', onChange)
  return () => m?.removeEventListener('change', onChange)
}

/** What shows for a choice, live: on System it changes when the system does. */
export function useShownTheme(theme: Theme): Shown {
  const dark = useSyncExternalStore(subscribe, systemDark, () => false)
  return resolveTheme(theme, dark)
}
