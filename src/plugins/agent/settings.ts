// The agent's settings, per browser (`gfit.agent`; Decision "Agent"): where it runs, the model chosen for each
// provider, each provider's key and LM Studio's address. Never in the project or its file: a key is the designer's own.
import { create } from 'zustand'
import { STATIC_HOST } from '../hosting.ts'
import { PROVIDERS, providerOf, type ProviderId } from './providers.ts'
import type { Connection } from './wire.ts'

export const AGENT_KEY = 'gfit.agent'

interface Saved {
  provider: ProviderId
  server: string
  keys: Partial<Record<ProviderId, string>>
  models: Partial<Record<ProviderId, string>>
}

// by default the shared Gemini of GFit's server, its first model (gemini-3.8-flash; the user: "leave this setting as the
// default"); LM Studio's address stays ready for whoever picks it. On a static host (the public link) there is no server
// to lend a key: Claude with the visitor's own.
const DEFAULT: Saved = { provider: STATIC_HOST ? 'anthropic' : 'shared-google', server: providerOf('lmstudio').server!, keys: {}, models: {} }

function read(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(AGENT_KEY) ?? 'null') as Partial<Saved> | null
    if (!raw) return DEFAULT
    return {
      provider: PROVIDERS.some((p) => p.id === raw.provider) ? raw.provider! : DEFAULT.provider,
      server: typeof raw.server === 'string' && raw.server ? raw.server : DEFAULT.server,
      keys: typeof raw.keys === 'object' && raw.keys ? raw.keys : {},
      models: typeof raw.models === 'object' && raw.models ? raw.models : {},
    }
  } catch {
    return DEFAULT
  }
}

interface AgentSettings extends Saved {
  set(patch: Partial<Saved>): void
  setKey(provider: ProviderId, key: string): void
  setModel(provider: ProviderId, model: string): void
}

export const useAgentSettings = create<AgentSettings>((set, get) => {
  const save = (patch: Partial<Saved>) => {
    set(patch)
    const { provider, server, keys, models } = get()
    try {
      localStorage.setItem(AGENT_KEY, JSON.stringify({ provider, server, keys, models }))
    } catch {
      // full or blocked: it lasts as long as the tab
    }
  }
  return {
    ...read(),
    set: save,
    setKey: (provider, key) => save({ keys: { ...get().keys, [provider]: key.trim() } }),
    setModel: (provider, model) => save({ models: { ...get().models, [provider]: model } }),
  }
})

/** The connection the agent uses now. */
export function connectionOf(s: Saved): Connection {
  return { provider: s.provider, server: s.server, key: s.keys[s.provider] ?? '' }
}

/** Ready to talk: a model chosen and, for a provider that needs one, a key. */
export const ready = (s: Saved) => Boolean(s.models[s.provider]) && (providerOf(s.provider).needs !== 'key' || Boolean(s.keys[s.provider]))
