// The shared keys (Decisions "Shared agent key" and "Shared keys for GPT and Gemini"): GFit's own server (Vite's dev
// server or its preview) answers /api/anthropic/*, /api/openai/* and /api/google/* by passing them on to each vendor's
// API with the key of the computer that serves GFit, so the designers who open GFit over the network use Claude, GPT
// or Gemini without a key of their own and the key never reaches a browser.
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY   in .env.local (never committed) or the environment; none: the
//                                                       route says how to set it
// Only the calls the Agent tab makes pass (each vendor's models and messages); a browser's own key or header is dropped.
// Each answer's tokens go to the usage book (server/usage.ts), for everyone's line in the Agent tab.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tokensOf, type UsageBook } from './usage.ts'

export type Vendor = 'anthropic' | 'openai' | 'google'

interface Spec {
  name: string
  route: string
  upstream: string
  env: string
  /** The calls that pass: the method and the path, without its query. */
  calls: { method: 'GET' | 'POST'; path: RegExp }[]
  headers(key: string, req: IncomingMessage): Record<string, string>
}

export const VENDORS: Record<Vendor, Spec> = {
  anthropic: {
    name: 'Anthropic',
    route: '/api/anthropic',
    upstream: 'https://api.anthropic.com/v1',
    env: 'ANTHROPIC_API_KEY',
    calls: [
      { method: 'GET', path: /^\/models$/ },
      { method: 'POST', path: /^\/messages$/ },
    ],
    headers: (key, req) => ({ 'x-api-key': key, 'anthropic-version': String(req.headers['anthropic-version'] ?? '2023-06-01') }),
  },
  openai: {
    name: 'OpenAI',
    route: '/api/openai',
    upstream: 'https://api.openai.com/v1',
    env: 'OPENAI_API_KEY',
    calls: [
      { method: 'GET', path: /^\/models$/ },
      { method: 'POST', path: /^\/chat\/completions$/ },
    ],
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  google: {
    name: 'Google',
    route: '/api/google',
    upstream: 'https://generativelanguage.googleapis.com/v1beta',
    env: 'GEMINI_API_KEY',
    calls: [
      { method: 'GET', path: /^\/models$/ },
      { method: 'POST', path: /^\/models\/[\w.-]+:generateContent$/ },
    ],
    headers: (key) => ({ 'x-goog-api-key': key }),
  },
}

const MAX_BODY = 8 * 1024 * 1024

export const noKey = (v: Vendor) =>
  `GFit’s server has no ${VENDORS[v].name} key: on the computer that serves GFit, put ${VENDORS[v].env} in .env.local and start it again.`

type Next = (err?: unknown) => void

function answer(res: ServerResponse, status: number, message: string) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: { message } }))
}

/** The request's JSON, as text. */
async function bodyOf(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new Error('too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** The model an answer came from: in the path (Google's) or in the request (the others'). */
function modelOf(path: string, body: string | undefined): string {
  const m = /^\/models\/([\w.-]+):/.exec(path)
  if (m) return m[1]
  try {
    return String((JSON.parse(body ?? '{}') as { model?: unknown }).model ?? 'unknown')
  } catch {
    return 'unknown'
  }
}

/** The routes as one middleware of Vite's server (connect): the keys are read once, when the server starts.
 *  `upstreams` stands in for the vendors' APIs (tests); `book` counts each answer's tokens. */
export function sharedKeys(env: Record<string, string | undefined>, o: { upstreams?: Partial<Record<Vendor, string>>; book?: UsageBook } = {}) {
  const upstreams = o.upstreams ?? {}
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = req.url ?? ''
    const vendor = (Object.keys(VENDORS) as Vendor[]).find((v) => url === VENDORS[v].route || url.startsWith(`${VENDORS[v].route}/`))
    if (!vendor) return next()
    const spec = VENDORS[vendor]
    const target = new URL(url.slice(spec.route.length) || '/', 'http://gfit')
    if (!spec.calls.some((c) => c.method === req.method && c.path.test(target.pathname)))
      return answer(res, 404, `Not a route of GFit’s ${spec.name} key: ${req.method} ${target.pathname}`)
    const key = env[spec.env]
    if (!key) return answer(res, 503, noKey(vendor))
    // a key in the query (Google's way) is the browser's: the server's goes in a header
    target.searchParams.delete('key')
    try {
      const body = req.method === 'POST' ? await bodyOf(req) : undefined
      const r = await fetch(`${upstreams[vendor] ?? spec.upstream}${target.pathname}${target.search}`, {
        method: req.method,
        headers: { ...spec.headers(key, req), ...(body && { 'content-type': 'application/json' }) },
        body,
      })
      const answer = Buffer.from(await r.arrayBuffer())
      res.statusCode = r.status
      res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json')
      res.end(answer)
      if (o.book && r.ok && req.method === 'POST') {
        const tokens = (() => {
          try {
            return tokensOf(vendor, JSON.parse(answer.toString('utf8')))
          } catch {
            return null
          }
        })()
        if (tokens) await o.book.add(vendor, modelOf(target.pathname, body), tokens).catch(() => undefined)
      }
    } catch (e) {
      answer(res, 502, `GFit’s server could not reach ${spec.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
