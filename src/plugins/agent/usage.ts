// What the agent has used, per provider, in this browser (`gfit.agent.usage`; Decision "Agent usage"): the tokens each
// answer says it took, in and out (its thinking counts as out), and what they cost at the prices below. Each designer
// counts their own: through GFit's server, its owner pays for everyone's. Gemini reports its tokens; another vendor
// counts once its answers bring them (`Reply.usage` in wire.ts) and its provider is in METERED.
// Everyone's (Decision "Agent usage for everyone"): GFit's server counts the tokens of every answer through its keys
// (server/usage.ts, GET /api/usage); priced here, as one's own.
import { create } from 'zustand'
import type { ProviderId } from './providers.ts'

export const USAGE_KEY = 'gfit.agent.usage'

export interface Tokens {
  input: number
  output: number
}

/** USD per 1M tokens, in and out, as each vendor lists them on 2026-10-20. */
export const PRICES: Record<string, Tokens> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 }, // introductory, to 2026-12-31; then 1.50 / 7.50
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-4-argon': { input: 2, output: 10 }, // to 2026-11-30; then 4.00 / 20.00
  'gpt-6.1-sol': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-6-astra': { input: 10, output: 50 },
}

/** The providers whose answers say their tokens. */
export const METERED: ProviderId[] = ['google', 'shared-google']

/** USD for some tokens of a model; null without its price. */
export function costOf(model: string, t: Tokens): number | null {
  const price = PRICES[model]
  return price ? (t.input * price.input + t.output * price.output) / 1e6 : null
}

/** The vendor whose key GFit's server lends a provider: its usage is everyone's too. */
export const SHARED_VENDOR: Partial<Record<ProviderId, 'anthropic' | 'openai' | 'google'>> = {
  shared: 'anthropic',
  'shared-openai': 'openai',
  'shared-google': 'google',
}

/** What GFit's server has counted (server/usage.ts). */
export interface Everyone {
  since: string
  vendors: Partial<Record<string, Record<string, Tokens & { answers: number }>>>
}

export async function fetchEveryone(signal?: AbortSignal): Promise<Everyone> {
  const r = await fetch('/api/usage', { signal })
  if (!r.ok) throw new Error(`GFit’s server: ${r.status}`)
  return (await r.json()) as Everyone
}

/** Everyone's usage of a vendor, priced: nothing counted yet, undefined. */
export function everyoneUsed(e: Everyone, vendor: string): Used | undefined {
  const models = Object.entries(e.vendors?.[vendor] ?? {})
  if (models.length === 0) return undefined
  return models.reduce<Used>(
    (u, [model, t]) => {
      const cost = costOf(model, t)
      return { input: u.input + t.input, output: u.output + t.output, cost: u.cost + (cost ?? 0), unpriced: u.unpriced || cost === null, since: u.since }
    },
    { input: 0, output: 0, cost: 0, unpriced: false, since: e.since },
  )
}

export interface Used extends Tokens {
  /** USD, at the price of each answer's model when it came. */
  cost: number
  /** Some answers came from a model without a price here: the cost leaves them out. */
  unpriced: boolean
  /** When it started counting (ISO). */
  since: string
}

type Usage = Partial<Record<ProviderId, Used>>

function read(): Usage {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null') as Usage | null
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

interface UsageStore {
  used: Usage
  /** One answer's tokens, with the model that gave them. */
  add(provider: ProviderId, model: string, tokens: Tokens): void
  reset(provider: ProviderId): void
}

export const useUsage = create<UsageStore>((set, get) => {
  const save = (used: Usage) => {
    set({ used })
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(used))
    } catch {
      // full or blocked: it lasts as long as the tab
    }
  }
  return {
    used: read(),
    add(provider, model, tokens) {
      const was = get().used[provider] ?? { input: 0, output: 0, cost: 0, unpriced: false, since: new Date().toISOString() }
      const cost = costOf(model, tokens)
      save({
        ...get().used,
        [provider]: {
          input: was.input + tokens.input,
          output: was.output + tokens.output,
          cost: was.cost + (cost ?? 0),
          unpriced: was.unpriced || cost === null,
          since: was.since,
        },
      })
    },
    reset(provider) {
      const { [provider]: _gone, ...rest } = get().used
      save(rest)
    },
  }
})

/** 950, 41.2k, 1.3M. */
export const tokens = (n: number) => (n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`)

/** $0.04, < $0.01, $0. */
export const dollars = (usd: number) => (usd === 0 ? '$0' : usd < 0.01 ? '< $0.01' : `$${usd.toFixed(2)}`)

/** The line: "41.2k in · 3.1k out · ≈ $0.04". */
export function usageLine(u: Used | undefined): string {
  if (!u) return 'Nothing yet'
  return `${tokens(u.input)} in · ${tokens(u.output)} out · ≈ ${dollars(u.cost)}${u.unpriced ? ' (some models without a price)' : ''}`
}
