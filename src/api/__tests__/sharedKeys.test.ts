// @vitest-environment node
/// <reference types="node" />
// The shared keys (Decisions "Shared agent key", "Shared keys for GPT and Gemini"): GFit's server passes the Agent tab's
// calls on to Anthropic, OpenAI and Google with its own keys, never a browser's; without a key it says how to set one;
// nothing else passes. Each answer's tokens go to the usage book, which GET /api/usage reads (Decision "Agent usage for
// everyone").
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { noKey, sharedKeys } from '../../../server/sharedKeys.ts'
import { usageBook, type Book } from '../../../server/usage.ts'

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }

const servers: http.Server[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function listen(handler: http.RequestListener): Promise<string> {
  const s = http.createServer(handler)
  servers.push(s)
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
}

/** A fake vendor that says what it got (one for the three; Gemini's answers say their tokens), and GFit's server with
 *  the routes and the usage book in front of it. */
async function start(env: Record<string, string | undefined>) {
  const seen: Seen[] = []
  const upstream = await listen((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body })
      res.setHeader('content-type', 'application/json')
      const tokens = req.url?.includes(':generateContent') && { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 20, thoughtsTokenCount: 30 } }
      res.end(JSON.stringify({ ok: true, ...tokens }))
    })
  })
  const dir = await mkdtemp(path.join(tmpdir(), 'gfit-usage-'))
  dirs.push(dir)
  const book = usageBook(dir)
  const proxy = sharedKeys(env, { upstreams: { anthropic: upstream, openai: upstream, google: upstream }, book })
  const gfit = await listen((req, res) => {
    void book.route(req, res, () =>
      proxy(req, res, () => {
        res.statusCode = 200
        res.end('the app')
      }),
    )
  })
  return { seen, gfit }
}

const KEYS = { ANTHROPIC_API_KEY: 'sk-ant-server', OPENAI_API_KEY: 'sk-oai-server', GEMINI_API_KEY: 'g-server' }
const post = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ model: 'x' }) })

describe('GFit’s Anthropic route', () => {
  it('passes the messages on with the server’s key, never the browser’s', async () => {
    const { seen, gfit } = await start(KEYS)
    const r = await post(`${gfit}/api/anthropic/messages`, { 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-browser' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/messages', body: '{"model":"x"}' })
    expect(seen[0].headers['x-api-key']).toBe('sk-ant-server')
    expect(seen[0].headers['anthropic-dangerous-direct-browser-access']).toBeUndefined()
  })

  it('lists the models', async () => {
    const { seen, gfit } = await start(KEYS)
    expect((await fetch(`${gfit}/api/anthropic/models?limit=100`)).status).toBe(200)
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/models?limit=100' })
  })
})

describe('GFit’s OpenAI route', () => {
  it('passes the chat completions and the models on with the server’s key', async () => {
    const { seen, gfit } = await start(KEYS)
    expect((await post(`${gfit}/api/openai/chat/completions`, { authorization: 'Bearer sk-browser' })).status).toBe(200)
    expect((await fetch(`${gfit}/api/openai/models`)).status).toBe(200)
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/chat/completions', body: '{"model":"x"}' })
    expect(seen[0].headers.authorization).toBe('Bearer sk-oai-server')
    expect(seen[1]).toMatchObject({ method: 'GET', url: '/models' })
  })
})

describe('GFit’s Google route', () => {
  it('passes generateContent and the models on with the server’s key in a header, a browser’s key dropped', async () => {
    const { seen, gfit } = await start(KEYS)
    expect((await post(`${gfit}/api/google/models/gemini-2.5-flash:generateContent?key=browser`)).status).toBe(200)
    expect((await fetch(`${gfit}/api/google/models?pageSize=1000`)).status).toBe(200)
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/models/gemini-2.5-flash:generateContent', body: '{"model":"x"}' })
    expect(seen[0].headers['x-goog-api-key']).toBe('g-server')
    expect(seen[1]).toMatchObject({ method: 'GET', url: '/models?pageSize=1000' })
  })
})

describe('GFit’s usage, everyone’s', () => {
  it('adds each Gemini answer’s tokens by model, its thinking as out; GET /api/usage says them', async () => {
    const { gfit } = await start(KEYS)
    const empty = (await (await fetch(`${gfit}/api/usage`)).json()) as Book
    expect(empty.vendors).toEqual({})
    await post(`${gfit}/api/google/models/gemini-3.8-flash:generateContent`)
    await post(`${gfit}/api/google/models/gemini-3.8-flash:generateContent`)
    await post(`${gfit}/api/google/models/gemini-4-argon:generateContent`)
    // the others' answers say no tokens yet: nothing counted
    await post(`${gfit}/api/anthropic/messages`)
    const book = (await (await fetch(`${gfit}/api/usage`)).json()) as Book
    expect(book.vendors).toEqual({
      google: {
        'gemini-3.8-flash': { input: 2000, output: 100, answers: 2 },
        'gemini-4-argon': { input: 1000, output: 50, answers: 1 },
      },
    })
    expect((await fetch(`${gfit}/api/usage`, { method: 'POST' })).status).toBe(404)
  })
})

describe('when it cannot', () => {
  it('without a key, says which one and how to set it', async () => {
    const { seen, gfit } = await start({ ANTHROPIC_API_KEY: 'sk-ant-server' })
    const r = await fetch(`${gfit}/api/google/models`)
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: { message: noKey('google') } })
    expect(noKey('google')).toContain('GEMINI_API_KEY')
    expect((await fetch(`${gfit}/api/openai/models`)).status).toBe(503)
    expect(seen).toEqual([])
  })

  it('lets nothing else of the vendors’ through, and leaves the app’s own pages alone', async () => {
    const { seen, gfit } = await start(KEYS)
    expect((await fetch(`${gfit}/api/anthropic/files`)).status).toBe(404)
    expect((await fetch(`${gfit}/api/anthropic/messages`)).status).toBe(404)
    expect((await post(`${gfit}/api/openai/images/generations`)).status).toBe(404)
    expect((await post(`${gfit}/api/google/models/gemini-x:embedContent`)).status).toBe(404)
    expect(seen).toEqual([])
    expect(await (await fetch(`${gfit}/`)).text()).toBe('the app')
  })
})
