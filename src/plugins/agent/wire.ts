// The providers behind one interface (Decision "Agent"): a conversation in our own turns goes out in each one's format
// and its answer comes back as text and tool calls. Called from the browser: LM Studio and OpenAI speak the same
// (chat completions), Anthropic and Google their own; each through GFit's server speaks as its vendor does.
//   user       what the designer wrote
//   assistant  the model's text and the tools it asked for (`raw`: its own content, sent back as it came, so a model
//              that signs its thinking, as Gemini and Claude do, gets it again)
//   tools      what each call answered
import { providerOf, shortName, type ProviderId } from './providers.ts'

export interface Call {
  id: string
  name: string
  input: unknown
}

export interface ToolResult {
  id: string
  name: string
  ok: boolean
  /** JSON, or why it could not run. */
  output: string
}

export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; calls: Call[]; raw?: { provider: ProviderId; content: unknown } }
  | { role: 'tools'; results: ToolResult[] }

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface Connection {
  provider: ProviderId
  /** LM Studio's address. */
  server: string
  key: string
}

export interface Reply {
  text: string
  calls: Call[]
  raw: { provider: ProviderId; content: unknown }
  /** The tokens it took, in and out (its thinking counts as out), when the vendor says them (Decision "Agent usage"). */
  usage?: { input: number; output: number }
}

const ANTHROPIC = 'https://api.anthropic.com/v1'
const OPENAI = 'https://api.openai.com/v1'
const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta'
const MAX_TOKENS = 4096

/** A JSON Schema as providers take it: without its `$schema`. */
const schemaOf = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== '$schema'))

async function request(c: Connection, url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const p = providerOf(c.provider)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new Error(
      c.provider === 'lmstudio'
        ? `Could not reach LM Studio at ${c.server}. Is its server running, with CORS on?`
        : `Could not reach ${shortName(p)}. Check the connection.`,
    )
  }
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null
  if (!res.ok) {
    const why = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new Error(`${shortName(p)}: ${res.status}${why ? ` ${why}` : ''}`)
  }
  return body
}

const json = (headers: Record<string, string>, body?: unknown): RequestInit => ({
  method: body === undefined ? 'GET' : 'POST',
  headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
  ...(body !== undefined && { body: JSON.stringify(body) }),
})

const parseArgs = (s: string): unknown => {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return s
  }
}

// ---- OpenAI's chat completions (OpenAI, LM Studio) ----

/** LM Studio's address as it shows it (http://127.0.0.1:1234), or with its /v1. */
const lmBase = (server: string) => `${server.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`
/** GFit's own server passes them on with its keys (server/sharedKeys.ts; Decision "Shared keys for GPT and Gemini"). */
const SHARED_OPENAI = '/api/openai'
const SHARED_GOOGLE = '/api/google'
const openaiBase = (c: Connection) => (c.provider === 'lmstudio' ? lmBase(c.server) : c.provider === 'shared-openai' ? SHARED_OPENAI : OPENAI)
const openaiHeaders = (c: Connection): Record<string, string> => (c.provider === 'openai' ? { authorization: `Bearer ${c.key}` } : {})

function openaiMessages(system: string, turns: Turn[]) {
  const out: unknown[] = [{ role: 'system', content: system }]
  for (const t of turns) {
    if (t.role === 'user') out.push({ role: 'user', content: t.text })
    else if (t.role === 'assistant')
      out.push({
        role: 'assistant',
        content: t.text || null,
        ...(t.calls.length > 0 && {
          tool_calls: t.calls.map((x) => ({ id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.input ?? {}) } })),
        }),
      })
    else for (const r of t.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.output })
  }
  return out
}

interface OpenAiReply {
  choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
}

async function openaiSend(c: Connection, model: string, system: string, turns: Turn[], tools: ToolSpec[], signal?: AbortSignal): Promise<Reply> {
  const body = {
    model,
    messages: openaiMessages(system, turns),
    tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: schemaOf(t.inputSchema) } })),
  }
  const r = (await request(c, `${openaiBase(c)}/chat/completions`, json(openaiHeaders(c), body), signal)) as OpenAiReply
  const m = r.choices[0]?.message
  const calls = (m?.tool_calls ?? []).map((x) => ({ id: x.id, name: x.function.name, input: parseArgs(x.function.arguments) }))
  return { text: m?.content ?? '', calls, raw: { provider: c.provider, content: m } }
}

/** Not chat models: embeddings, speech, images. */
const NOT_CHAT = /embed|whisper|tts|dall-e|moderation|audio|image|transcribe|realtime|search/i

async function openaiModels(c: Connection, signal?: AbortSignal): Promise<string[]> {
  const r = (await request(c, `${openaiBase(c)}/models`, json(openaiHeaders(c)), signal)) as { data: { id: string }[] }
  return r.data.map((m) => m.id).filter((id) => !NOT_CHAT.test(id)).sort()
}

// ---- Anthropic's messages (Anthropic, GFit's server) ----

/** GFit's own server passes it on with its key (server/sharedKeys.ts; Decision "Shared agent key"). */
const SHARED = '/api/anthropic'
const anthropicBase = (c: Connection) => (c.provider === 'shared' ? SHARED : ANTHROPIC)
const anthropicHeaders = (c: Connection): Record<string, string> =>
  c.provider === 'shared'
    ? { 'anthropic-version': '2023-06-01' }
    : {
        'x-api-key': c.key,
        'anthropic-version': '2023-06-01',
        // the key is the designer's own, in their own browser (Decision "Agent")
        'anthropic-dangerous-direct-browser-access': 'true',
      }
const isAnthropic = (c: Connection) => c.provider === 'anthropic' || c.provider === 'shared'

function anthropicMessages(turns: Turn[]) {
  return turns.map((t) => {
    if (t.role === 'user') return { role: 'user', content: t.text }
    if (t.role === 'assistant')
      return {
        role: 'assistant',
        content:
          t.raw?.provider === 'anthropic'
            ? t.raw.content
            : [...(t.text ? [{ type: 'text', text: t.text }] : []), ...t.calls.map((x) => ({ type: 'tool_use', id: x.id, name: x.name, input: x.input ?? {} }))],
      }
    return { role: 'user', content: t.results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.output, is_error: !r.ok })) }
  })
}

type AnthropicBlock = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: string }

async function anthropicSend(c: Connection, model: string, system: string, turns: Turn[], tools: ToolSpec[], signal?: AbortSignal): Promise<Reply> {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: anthropicMessages(turns),
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: schemaOf(t.inputSchema) })),
  }
  const r = (await request(c, `${anthropicBase(c)}/messages`, json(anthropicHeaders(c), body), signal)) as { content: AnthropicBlock[] }
  const text = r.content.flatMap((b) => (b.type === 'text' ? [(b as { text: string }).text] : [])).join('\n')
  const calls = r.content.flatMap((b) => (b.type === 'tool_use' ? [b as Call] : [])).map(({ id, name, input }) => ({ id, name, input }))
  return { text, calls, raw: { provider: 'anthropic', content: r.content } }
}

async function anthropicModels(c: Connection, signal?: AbortSignal): Promise<string[]> {
  const r = (await request(c, `${anthropicBase(c)}/models?limit=100`, json(anthropicHeaders(c)), signal)) as { data: { id: string }[] }
  return r.data.map((m) => m.id)
}

// ---- Google's generateContent ----

const isGoogle = (c: Connection) => c.provider === 'google' || c.provider === 'shared-google'
/** Google's address for a path and its query; the designer's own key goes in the query, GFit's server puts its own. */
const googleUrl = (c: Connection, path: string, query: string[] = []) => {
  const q = c.provider === 'google' ? [...query, `key=${encodeURIComponent(c.key)}`] : query
  return `${c.provider === 'shared-google' ? SHARED_GOOGLE : GOOGLE}${path}${q.length > 0 ? `?${q.join('&')}` : ''}`
}

type GooglePart = { text?: string; functionCall?: { id?: string; name: string; args?: unknown }; thought?: boolean }

function googleContents(turns: Turn[]) {
  return turns.map((t) => {
    if (t.role === 'user') return { role: 'user', parts: [{ text: t.text }] }
    if (t.role === 'assistant')
      return {
        role: 'model',
        parts:
          t.raw?.provider === 'google'
            ? t.raw.content
            : [...(t.text ? [{ text: t.text }] : []), ...t.calls.map((x) => ({ functionCall: { name: x.name, args: x.input ?? {} } }))],
      }
    return { role: 'user', parts: t.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.output } } })) }
  })
}

async function googleSend(c: Connection, model: string, system: string, turns: Turn[], tools: ToolSpec[], signal?: AbortSignal): Promise<Reply> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: googleContents(turns),
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: schemaOf(t.inputSchema) })) }],
  }
  const r = (await request(c, googleUrl(c, `/models/${model}:generateContent`), json({}, body), signal)) as {
    candidates?: { content?: { parts?: GooglePart[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  }
  const parts = r.candidates?.[0]?.content?.parts ?? []
  const text = parts.flatMap((x) => (x.text && !x.thought ? [x.text] : [])).join('')
  const calls = parts.flatMap((x, i) => (x.functionCall ? [{ id: x.functionCall.id ?? `${x.functionCall.name}-${i}`, name: x.functionCall.name, input: x.functionCall.args ?? {} }] : []))
  const u = r.usageMetadata
  const usage = u && { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }
  return { text, calls, raw: { provider: 'google', content: parts }, ...(usage && { usage }) }
}

async function googleModels(c: Connection, signal?: AbortSignal): Promise<string[]> {
  const r = (await request(c, googleUrl(c, '/models', ['pageSize=1000']), json({}), signal)) as {
    models: { name: string; supportedGenerationMethods?: string[] }[]
  }
  return r.models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
}

// ---- One interface ----

/** The model's next answer to the conversation, with the tools it may call. */
export function send(c: Connection, model: string, system: string, turns: Turn[], tools: ToolSpec[], signal?: AbortSignal): Promise<Reply> {
  if (isAnthropic(c)) return anthropicSend(c, model, system, turns, tools, signal)
  if (isGoogle(c)) return googleSend(c, model, system, turns, tools, signal)
  return openaiSend(c, model, system, turns, tools, signal)
}

/** The models the provider offers (LM Studio: the ones it has). */
export function listModels(c: Connection, signal?: AbortSignal): Promise<string[]> {
  if (isAnthropic(c)) return anthropicModels(c, signal)
  if (isGoogle(c)) return googleModels(c, signal)
  return openaiModels(c, signal)
}
