// The bridge between the MCP server and GFit's open tab (Decision "MCP server"): an HTTP server on this computer only
// (127.0.0.1). The tab listens on /events (server-sent events) for the calls and posts each answer to /reply; the
// project stays in the tab, so Claude Desktop changes the design the designer sees, each edit one undo step.
//   GET  /         {"app": true | false}: whether a tab listens
//   GET  /events   the tab's stream: hello, then a call {id, name, input} each time; a newer tab replaces it
//   POST /reply    {id, ok, output | error}
//   POST /call     {name, input} → {ok, output | error}: a call of another GFit MCP server of this computer, run in
//                  the tab (Claude Desktop starts the server twice, one second apart: the second finds the port taken
//                  and is the one it talks to; it relays through the first). Not for pages: they always send an Origin
// Only pages of this computer (localhost, 127.0.0.1) may listen or answer, and only by its own name (no DNS rebinding).
// A tab that drops for a moment (a reload, the dev server's update, sleep) reconnects by itself: a call made meanwhile
// waits RECONNECT_WAIT for it (stress test: "a call failed on a momentary disconnection"); a call the tab had when it
// dropped is answered at once that it may or may not have run, so the agent reads the project before trying again.
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import type { CallAnswer } from '../src/api/mcp/protocol.ts'

export const DEFAULT_PORT = 4590
/** How long a call waits for the tab. */
export const CALL_TIMEOUT = 60_000
/** How long a call made with no tab listening waits for one to (re)connect. */
export const RECONNECT_WAIT = 8_000

export const DROPPED =
  'GFit disconnected during the call: it may or may not have run. Read the project (getProject) before calling it again.'

export const NOT_OPEN =
  'GFit is not connected. Open GFit in the browser, then in its Agent tab turn on "Claude Desktop (MCP)". Then call the tool again.'

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

export interface Bridge {
  /** Runs a tool in the tab and waits for its answer. */
  call(name: string, input: unknown): Promise<CallAnswer>
  connected(): boolean
  close(): Promise<void>
  /** The port it listens on (0 asked: the one it was given). */
  port: number
}

export function startBridge(port = DEFAULT_PORT, log: (s: string) => void = () => {}, reconnectWait = RECONNECT_WAIT): Promise<Bridge> {
  let app: http.ServerResponse | null = null
  const pending = new Map<string, { resolve(a: CallAnswer): void; timer: NodeJS.Timeout; tab: http.ServerResponse }>()
  /** Calls waiting for a tab: each runs when one says hello. */
  let waiting: ((tab: http.ServerResponse) => void)[] = []
  const send = (res: http.ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin
    if ((origin && !LOCAL_ORIGIN.test(origin)) || !LOCAL_HOST.test(req.headers.host ?? '')) {
      res.writeHead(403).end()
      return
    }
    if (origin) res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'origin')
    const path = (req.url ?? '/').split('?')[0]
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' }).end()
    } else if (req.method === 'GET' && path === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      if (app) {
        send(app, 'replaced', {})
        app.end()
      }
      app = res
      send(res, 'hello', { server: 'gfit-mcp' })
      log('GFit connected')
      const ready = waiting
      waiting = []
      for (const run of ready) run(res)
      const beat = setInterval(() => res.write(': ping\n\n'), 20_000)
      req.on('close', () => {
        clearInterval(beat)
        if (app === res) {
          app = null
          log('GFit disconnected')
        }
        // what it had not answered may or may not have run: say so now, not in a minute
        for (const [id, p] of pending)
          if (p.tab === res) {
            clearTimeout(p.timer)
            pending.delete(id)
            p.resolve({ ok: false, error: DROPPED })
          }
      })
    } else if (req.method === 'POST' && path === '/reply') {
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => {
        try {
          const r = JSON.parse(body) as { id: string } & CallAnswer
          const waiting = pending.get(r.id)
          if (waiting) {
            clearTimeout(waiting.timer)
            pending.delete(r.id)
            waiting.resolve(r.ok ? { ok: true, output: r.output } : { ok: false, error: String(r.error) })
          }
          res.writeHead(204).end()
        } catch {
          res.writeHead(400).end()
        }
      })
    } else if (req.method === 'POST' && path === '/call') {
      if (origin) {
        res.writeHead(403).end()
        return
      }
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => {
        let call: { name: string; input: unknown }
        try {
          call = JSON.parse(body) as { name: string; input: unknown }
        } catch {
          res.writeHead(400).end()
          return
        }
        void bridge.call(call.name, call.input).then((a) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(a)))
      })
    } else if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: app !== null }))
    } else res.writeHead(404).end()
  })

  const bridge: Bridge = {
    port,
    connected: () => app !== null,
    call(name, input) {
      return new Promise((resolve) => {
        const run = (tab: http.ServerResponse) => {
          const id = randomUUID()
          const timer = setTimeout(() => {
            pending.delete(id)
            resolve({ ok: false, error: `GFit did not answer in ${CALL_TIMEOUT / 1000} s.` })
          }, CALL_TIMEOUT)
          pending.set(id, { resolve, timer, tab })
          send(tab, 'call', { id, name, input })
        }
        if (app) return run(app)
        // no tab now: one that dropped for a moment comes back by itself
        const timer = setTimeout(() => {
          waiting = waiting.filter((w) => w !== wait)
          resolve({ ok: false, error: NOT_OPEN })
        }, reconnectWait)
        const wait = (tab: http.ServerResponse) => {
          clearTimeout(timer)
          run(tab)
        }
        waiting.push(wait)
      })
    },
    close: () =>
      new Promise((done) => {
        waiting = []
        app?.end()
        server.closeAllConnections()
        server.close(() => done())
      }),
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const a = server.address()
      bridge.port = typeof a === 'object' && a ? a.port : port
      resolve(bridge)
    })
  })
}

/** Runs a call through the GFit MCP server that holds `port` (POST /call); null when nothing answers there. */
export async function relayCall(port: number, name: string, input: unknown): Promise<CallAnswer | null> {
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${port}/call`, { method: 'POST', body: JSON.stringify({ name, input }) })
  } catch {
    return null
  }
  if (!res.ok) return { ok: false, error: `Port ${port} is taken by another program, not GFit's MCP server: set GFIT_MCP_PORT.` }
  return (await res.json()) as CallAnswer
}
