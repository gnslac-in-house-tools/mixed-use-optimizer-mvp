// Where the agent's model runs (Decision "Agent"): LM Studio on this computer, Claude, GPT or Gemini through GFit's own
// server with the keys of the computer that serves it (Decisions "Shared agent key", "Shared keys for GPT and Gemini"),
// or a provider with the designer's API key. The
// models are not listed here: each provider lists its own (`/models`), so a new model shows without a release.

import { STATIC_HOST } from '../hosting.ts'

export type ProviderId = 'lmstudio' | 'shared' | 'shared-openai' | 'shared-google' | 'anthropic' | 'openai' | 'google'

export interface Provider {
  id: ProviderId
  label: string
  /** Its name in messages, when not the label's. */
  short?: string
  /** What it needs to connect: its server's address (local), an API key, or nothing (GFit's server has the key). */
  needs: 'server' | 'key' | 'none'
  /** The address it starts with. */
  server?: string
  /** The models it offers, of all it lists: the best candidates, the first the one it starts with. None listed: all. */
  models?: string[]
  /** One line on what it is and where the conversation goes. */
  note: string
}

/** Gemini's candidates (Decision "Shared keys for GPT and Gemini"): Flash to start, tools well done at a Flash price;
 *  Flash-Lite, the cheapest, for simple asks; 4 Argon, the most capable, for the hard ones. */
const GEMINI = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon']
/** GPT's: Sol to start, near the flagship at a fifth of its price; Luna, the cheapest; Astra, the flagship. */
const GPT = ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']
/** Claude's: Sonnet to start, the balance; Haiku, the cheapest; Opus, for the hard ones. */
const CLAUDE = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']

const ALL: Provider[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    needs: 'server',
    server: 'http://127.0.0.1:1234',
    note: 'The model loaded in LM Studio, on this computer: nothing leaves it. No key; turn on CORS in its server settings.',
  },
  {
    id: 'shared',
    label: 'Claude (GFit’s server)',
    short: 'GFit’s server',
    needs: 'none',
    models: CLAUDE,
    note: 'Claude, through the computer that serves GFit, with its key: no key of yours. Its owner pays for what you ask.',
  },
  {
    id: 'shared-openai',
    label: 'GPT (GFit’s server)',
    short: 'GFit’s server',
    needs: 'none',
    models: GPT,
    note: 'GPT, through the computer that serves GFit, with its key: no key of yours. Its owner pays for what you ask.',
  },
  {
    id: 'shared-google',
    label: 'Gemini (GFit’s server)',
    short: 'GFit’s server',
    needs: 'none',
    models: GEMINI,
    note: 'Gemini, through the computer that serves GFit, with its key: no key of yours. Its owner pays for what you ask.',
  },
  { id: 'anthropic', label: 'Anthropic', needs: 'key', models: CLAUDE, note: 'Claude, with your Anthropic API key, kept in this browser only.' },
  { id: 'openai', label: 'OpenAI', needs: 'key', models: GPT, note: 'GPT, with your OpenAI API key, kept in this browser only.' },
  { id: 'google', label: 'Google', needs: 'key', models: GEMINI, note: 'Gemini, with your Google AI API key, kept in this browser only.' },
]

/** What is offered: on a static host (the public link) GFit's server is not there, so the providers that go through it are not. */
export const PROVIDERS: Provider[] = STATIC_HOST ? ALL.filter((p) => p.id !== 'shared' && p.id !== 'shared-openai' && p.id !== 'shared-google') : ALL

export const providerOf = (id: ProviderId) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

/** What the provider offers of the models it lists: its candidates, in their order; none of them listed, all. */
export function shortlist(p: Provider, listed: string[]): string[] {
  const some = (p.models ?? []).filter((m) => listed.includes(m))
  return some.length > 0 ? some : listed
}

/** The short name, for messages: "LM Studio". */
export const shortName = (p: Provider) => p.short ?? p.label.replace(' (local)', '')
