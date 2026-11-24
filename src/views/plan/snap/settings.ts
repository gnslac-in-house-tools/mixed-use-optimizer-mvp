// Snap settings: UI state of whoever is drawing, in this browser. Port of Plaza-Practiko `vistas/planta/iman/ajustes.ts`.
// Not in the Project, not in the undo history: turning the grid off is not a design decision.
// Saved in localStorage; if it cannot be read or written, the defaults stay.
import { create } from 'zustand'
import { DEFAULT_SNAP, SNAP_KINDS, SNAP_TO, type SnapKind, type SnapSettings, type SnapTo } from './kinds.ts'

export const STORAGE_KEY = 'gfit.snap'

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** What was saved, merged with the defaults: an old or broken JSON leaves no gaps. */
export function readSaved(): SnapSettings {
  let raw: Record<string, unknown> = {}
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    raw = record(t ? JSON.parse(t) : null)
  } catch {
    // no localStorage, or garbage in it: the defaults
  }
  const kinds = record(raw.kinds)
  const to = record(raw.to)
  return {
    to: Object.fromEntries(SNAP_TO.map((k) => [k, bool(to[k], DEFAULT_SNAP.to[k])])) as Record<SnapTo, boolean>,
    on: bool(raw.on, DEFAULT_SNAP.on),
    kinds: Object.fromEntries(SNAP_KINDS.map((k) => [k, bool(kinds[k], DEFAULT_SNAP.kinds[k])])) as Record<SnapKind, boolean>,
    align: bool(raw.align, DEFAULT_SNAP.align),
    ortho: bool(raw.ortho, DEFAULT_SNAP.ortho),
    grid: bool(raw.grid, DEFAULT_SNAP.grid),
  }
}

function save(s: SnapSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // full or blocked: the settings last as long as the tab
  }
}

export type SnapSwitch = 'on' | 'align' | 'ortho' | 'grid'

export const useSnapSettings = create<{
  settings: SnapSettings
  toggle(k: SnapSwitch): void
  toggleKind(k: SnapKind): void
  toggleTo(k: SnapTo): void
}>()((set, get) => {
  const change = (settings: SnapSettings) => {
    set({ settings })
    save(settings)
  }
  return {
    settings: readSaved(),
    toggle: (k) => change({ ...get().settings, [k]: !get().settings[k] }),
    toggleKind: (k) => {
      const s = get().settings
      change({ ...s, kinds: { ...s.kinds, [k]: !s.kinds[k] } })
    },
    toggleTo: (k) => {
      const s = get().settings
      change({ ...s, to: { ...s.to, [k]: !s.to[k] } })
    },
  }
})
