// Which plugins are on, hidden or off (Decision "Optimizer plugin"): per browser, like the layout (`gfit.plugins`),
// never in the Project or the undo history; *View* turns them. Absent: on (every plugin is on by default).
import { create } from 'zustand'
import { COMING_SOON } from './comingSoon.ts'
import type { PluginMode } from './types.ts'

export const PLUGINS_KEY = 'gfit.plugins'

const MODES: PluginMode[] = ['on', 'hidden', 'off']

function read(): Record<string, PluginMode> {
  try {
    const raw = JSON.parse(localStorage.getItem(PLUGINS_KEY) ?? '{}') as Record<string, unknown> | null
    return Object.fromEntries(Object.entries(raw ?? {}).filter((e): e is [string, PluginMode] => MODES.includes(e[1] as PluginMode)))
  } catch {
    // no localStorage, or garbage in it: every plugin on
    return {}
  }
}

interface PluginModes {
  modes: Record<string, PluginMode>
  /** Plugins the core holds back for now, with why (Decision "Plugin lock": the agent while the sample is open): their
   *  action shows, greyed, with the reason; their tabs and tools are not offered. This session only, never saved. */
  locks: Record<string, string>
  /** Plugins held back as "coming soon" (Decision "Coming soon"), with their notice: a standing reason, apart from the
   *  locks (a lock that lets go does not release it). Starts as `COMING_SOON`; a test empties it. */
  soon: Record<string, string>
  setMode(id: string, mode: PluginMode): void
  /** Holds a plugin back with a reason; null lets it go. */
  lock(id: string, reason: string | null): void
}

export const usePluginModes = create<PluginModes>((set, get) => ({
  modes: read(),
  locks: {},
  soon: COMING_SOON,
  lock(id, reason) {
    const { [id]: _, ...rest } = get().locks
    if ((get().locks[id] ?? null) !== reason) set({ locks: reason === null ? rest : { ...rest, [id]: reason } })
  },
  setMode(id, mode) {
    const modes = { ...get().modes, [id]: mode }
    set({ modes })
    try {
      localStorage.setItem(PLUGINS_KEY, JSON.stringify(modes))
    } catch {
      // full or blocked: it lasts as long as the tab
    }
  },
}))

export const modeOf = (modes: Record<string, PluginMode>, id: string): PluginMode => modes[id] ?? 'on'

/** Why a plugin is held back, or null: it works. "Coming soon" first, then a lock (the sample's). */
export const heldBack = (s: Pick<PluginModes, 'soon' | 'locks'>, id: string): string | null => s.soon[id] ?? s.locks[id] ?? null
/** Whether a plugin is held back as "coming soon" (not for a lock). */
export const isSoon = (soon: Record<string, string>, id: string): boolean => id in soon
