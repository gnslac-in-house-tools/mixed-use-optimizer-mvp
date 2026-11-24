// The providers behind one interface (Decision "Agent"): each gets the conversation and the tools in its own format,
// and its answer comes back as text and calls; a provider out of reach or refusing says so.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels, send, type Connection, type ToolSpec, type Turn } from '../wire.ts'

const tools: ToolSpec[] = [{ name: 'moveMass', description: 'Moves a mass', inputSchema: { $schema: 'x', type: 'object', properties: { mass: { type: 'string' } } } }]
const turns: Turn[] = [
  { role: 'user', text: 'Move it' },
  { role: 'assistant', text: 'Moving', calls: [{ id: 'c1', name: 'moveMass', input: { mass: 'm1' } }] },
  { role: 'tools', results: [{ id: 'c1', name: 'moveMass', ok: true, output: '"Done."' }] },
]

let sent: { url: string; init: RequestInit }[] = []
function answer(...bodies: unknown[]) {
  sent = []
  const queue = [...bodies]
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    const body = queue.shift()
    return { ok: !(body as { status?: number })?.status, status: (body as { status?: number })?.status ?? 200, json: async () => body } as Response
  }) as unknown as typeof fetch
}
const bodyOf = (i = 0) => JSON.parse(sent[i].init.body as string)
const headersOf = (i = 0) => sent[i].init.headers as Record<string, string>
afterEach(() => vi.restoreAllMocks())

const lm: Connection = { provider: 'lmstudio', server: 'http://127.0.0.1:1234/', key: '' }

describe('LM Studio and OpenAI: chat completions', () => {
  it('sends the system, the turns and the tools; reads text and calls', async () => {
    answer({ choices: [{ message: { content: null, tool_calls: [{ id: 'c2', function: { name: 'getIssues', arguments: '{}' } }] } }] })
    const r = await send(lm, 'qwen', 'SYS', turns, tools)
    expect(sent[0].url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    expect(headersOf().authorization).toBeUndefined()
    const b = bodyOf()
    expect(b.model).toBe('qwen')
    expect(b.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'Move it' },
      { role: 'assistant', content: 'Moving', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'moveMass', arguments: '{"mass":"m1"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '"Done."' },
    ])
    expect(b.tools[0].function.parameters).toEqual({ type: 'object', properties: { mass: { type: 'string' } } })
    expect(r).toMatchObject({ text: '', calls: [{ id: 'c2', name: 'getIssues', input: {} }] })
  })

  it('OpenAI with the key; its models without the ones that are not chat', async () => {
    answer({ data: [{ id: 'gpt-x' }, { id: 'text-embedding-3' }, { id: 'whisper-1' }, { id: 'gpt-a' }] })
    const models = await listModels({ provider: 'openai', server: '', key: 'sk-1' })
    expect(sent[0].url).toBe('https://api.openai.com/v1/models')
    expect(headersOf().authorization).toBe('Bearer sk-1')
    expect(models).toEqual(['gpt-a', 'gpt-x'])
  })

  it('GPT through GFit’s server: its own route, no key of the browser’s (Decision "Shared keys for GPT and Gemini")', async () => {
    const shared: Connection = { provider: 'shared-openai', server: '', key: 'left-over' }
    answer({ data: [{ id: 'gpt-x' }] }, { choices: [{ message: { content: 'Hi' } }] })
    expect(await listModels(shared)).toEqual(['gpt-x'])
    expect(sent[0].url).toBe('/api/openai/models')
    expect(await send(shared, 'gpt-x', 'SYS', turns, tools)).toMatchObject({ text: 'Hi' })
    expect(sent[1].url).toBe('/api/openai/chat/completions')
    expect(headersOf(1)).toEqual({ 'content-type': 'application/json' })
  })
})

describe('Anthropic: messages', () => {
  it('sends its headers, the tool uses and results as blocks; reads text and tool uses', async () => {
    answer({ content: [{ type: 'text', text: 'Done' }, { type: 'tool_use', id: 't9', name: 'getKpis', input: { ids: ['coverage'] } }] })
    const r = await send({ provider: 'anthropic', server: '', key: 'ak' }, 'claude-x', 'SYS', turns, tools)
    expect(sent[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(headersOf()).toMatchObject({ 'x-api-key': 'ak', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    const b = bodyOf()
    expect(b.system).toBe('SYS')
    expect(b.messages[1].content).toEqual([{ type: 'text', text: 'Moving' }, { type: 'tool_use', id: 'c1', name: 'moveMass', input: { mass: 'm1' } }])
    expect(b.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '"Done."', is_error: false }] })
    expect(b.tools[0].input_schema.$schema).toBeUndefined()
    expect(r).toMatchObject({ text: 'Done', calls: [{ id: 't9', name: 'getKpis', input: { ids: ['coverage'] } }] })
    // its own content goes back as it came (its thinking, signed)
    answer({ content: [{ type: 'text', text: 'ok' }] })
    await send({ provider: 'anthropic', server: '', key: 'ak' }, 'claude-x', 'SYS', [...turns, { role: 'assistant', text: 'Done', calls: r.calls, raw: r.raw }], tools)
    expect(bodyOf().messages[3].content).toEqual(r.raw.content)
  })

  it('through GFit’s server: its own route, no key of the browser’s (Decision "Shared agent key")', async () => {
    const shared: Connection = { provider: 'shared', server: '', key: 'left-over' }
    answer({ data: [{ id: 'claude-x' }] }, { content: [{ type: 'text', text: 'Hi' }] })
    expect(await listModels(shared)).toEqual(['claude-x'])
    expect(sent[0].url).toBe('/api/anthropic/models?limit=100')
    const r = await send(shared, 'claude-x', 'SYS', turns, tools)
    expect(sent[1].url).toBe('/api/anthropic/messages')
    expect(headersOf(1)).toEqual({ 'content-type': 'application/json', 'anthropic-version': '2023-06-01' })
    expect(bodyOf(1).messages[1].content[1].type).toBe('tool_use')
    // the same content as Anthropic's: a conversation goes on when the designer switches between the two
    expect(r.raw.provider).toBe('anthropic')
  })
})

describe('Google: generateContent', () => {
  it('sends the key, the function calls and responses as parts; reads text and calls, its thoughts left out', async () => {
    answer({ candidates: [{ content: { parts: [{ text: 'hm', thought: true }, { text: 'Here' }, { functionCall: { name: 'getProject', args: {} } }] } }] })
    const r = await send({ provider: 'google', server: '', key: 'g k' }, 'gemini-x', 'SYS', turns, tools)
    expect(sent[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=g%20k')
    const b = bodyOf()
    expect(b.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] })
    expect(b.contents[1]).toEqual({ role: 'model', parts: [{ text: 'Moving' }, { functionCall: { name: 'moveMass', args: { mass: 'm1' } } }] })
    expect(b.contents[2]).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'moveMass', response: { result: '"Done."' } } }] })
    expect(b.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual({ type: 'object', properties: { mass: { type: 'string' } } })
    expect(r).toMatchObject({ text: 'Here', calls: [{ id: 'getProject-2', name: 'getProject', input: {} }] })
    expect(r.usage).toBeUndefined()
  })

  it('says the tokens it took, its thinking counted as out (Decision "Agent usage")', async () => {
    answer({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 30, thoughtsTokenCount: 70 } })
    const r = await send({ provider: 'shared-google', server: '', key: '' }, 'gemini-x', 'SYS', turns, tools)
    expect(r.usage).toEqual({ input: 1200, output: 100 })
  })

  it('through GFit’s server: its own route, no key of the browser’s (Decision "Shared keys for GPT and Gemini")', async () => {
    const shared: Connection = { provider: 'shared-google', server: '', key: 'left-over' }
    answer({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }] }, { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] })
    expect(await listModels(shared)).toEqual(['gemini-a'])
    expect(sent[0].url).toBe('/api/google/models?pageSize=1000')
    const r = await send(shared, 'gemini-a', 'SYS', turns, tools)
    expect(sent[1].url).toBe('/api/google/models/gemini-a:generateContent')
    expect(headersOf(1)).toEqual({ 'content-type': 'application/json' })
    // the same content as Google's: a conversation goes on when the designer switches between the two
    expect(r.raw.provider).toBe('google')
  })

  it('its models: only those that generate content', async () => {
    answer({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] })
    expect(await listModels({ provider: 'google', server: '', key: 'k' })).toEqual(['gemini-a'])
  })
})

describe('when it cannot', () => {
  it('says the provider’s refusal, with its message', async () => {
    answer({ status: 401, error: { message: 'invalid x-api-key' } })
    await expect(send({ provider: 'anthropic', server: '', key: 'bad' }, 'm', 'S', turns, tools)).rejects.toThrow('Anthropic: 401 invalid x-api-key')
  })

  it('LM Studio out of reach: is its server on, with CORS', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(listModels(lm)).rejects.toThrow('Could not reach LM Studio at http://127.0.0.1:1234/. Is its server running, with CORS on?')
  })
})
