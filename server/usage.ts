// What everyone has used through GFit's server (Decision "Agent usage for everyone"): each answer that comes back
// through a shared key (server/sharedKeys.ts) adds its tokens, by vendor and model, to one file:
//   .gfit-usage/usage.json   { since, vendors: { google: { "gemini-3.8-flash": { input, output, answers } } } }
// Route: GET /api/usage → that file, for the Agent tab's line *Everyone* (it prices the tokens: src/plugins/agent/usage.ts).
// Only tokens: the prices are the app's. Gemini's answers say theirs; another vendor counts once `tokensOf` reads them.
// To start again, delete the folder on the computer that serves GFit.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Vendor } from './sharedKeys.ts'

export const ROUTE = '/api/usage'

export interface Tokens {
  input: number
  output: number
}

export interface Book {
  since: string
  vendors: Partial<Record<Vendor, Record<string, Tokens & { answers: number }>>>
}

/** An answer's tokens, in and out (thinking counts as out), when its vendor says them. */
export function tokensOf(vendor: Vendor, answer: unknown): Tokens | null {
  if (vendor !== 'google') return null
  const u = (answer as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } } | null)
    ?.usageMetadata
  return u ? { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } : null
}

type Next = (err?: unknown) => void

/** The book on disk, with the route that reads it. Adds are written in turn, so none is lost. */
export function usageBook(root = path.resolve(process.cwd(), '.gfit-usage')) {
  const file = path.join(root, 'usage.json')
  let queue: Promise<unknown> = Promise.resolve()

  async function read(): Promise<Book> {
    try {
      const b = JSON.parse(await readFile(file, 'utf8')) as Book
      if (b && typeof b.since === 'string' && b.vendors && typeof b.vendors === 'object') return b
    } catch {
      // none yet, or unreadable: start again
    }
    return { since: new Date().toISOString(), vendors: {} }
  }

  function add(vendor: Vendor, model: string, tokens: Tokens): Promise<void> {
    const next = queue.then(async () => {
      const b = await read()
      const models = (b.vendors[vendor] ??= {})
      const was = models[model] ?? { input: 0, output: 0, answers: 0 }
      models[model] = { input: was.input + tokens.input, output: was.output + tokens.output, answers: was.answers + 1 }
      await mkdir(root, { recursive: true })
      await writeFile(`${file}.tmp`, JSON.stringify(b, null, 2))
      await rename(`${file}.tmp`, file)
    })
    queue = next.catch(() => undefined)
    return next
  }

  const route = async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    if (req.url !== ROUTE) return next()
    res.setHeader('content-type', 'application/json')
    if (req.method !== 'GET') {
      res.statusCode = 404
      return res.end(JSON.stringify({ error: { message: `Not a route of GFit’s usage: ${req.method}` } }))
    }
    await queue
    res.end(JSON.stringify(await read()))
  }

  return { add, read, route }
}

export type UsageBook = ReturnType<typeof usageBook>
