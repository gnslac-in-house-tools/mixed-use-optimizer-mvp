// @vitest-environment node
/// <reference types="node" />
// GFit's MCP server end to end (Decision "MCP server"): Node runs mcp/server.ts as Claude Desktop would; it answers
// initialize and tools/list over stdio, and a call runs in the tab that listens on the bridge (here a stand-in: an
// event stream read with fetch), or says GFit is not connected. Pages of other sites are refused. A second server on
// the same port (Claude Desktop starts two) relays its calls through the first, and takes the port when it goes.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { afterEach, describe, expect, it } from 'vitest'

const PORT = 4590 + 100 + Math.floor(Math.random() * 300)
const BASE = `http://127.0.0.1:${PORT}`

let servers: ChildProcessWithoutNullStreams[] = []
afterEach(() => {
  for (const s of servers) {
    s.stdin.end()
    s.kill()
  }
  servers = []
})

/** A server, and a way to send a request and wait for its answer; `ready`: what its log says once it runs. */
async function start(ready = 'bridge on') {
  const child = spawn(process.execPath, ['mcp/server.ts'], { env: { ...process.env, GFIT_MCP_PORT: String(PORT), GFIT_MCP_RECONNECT_MS: '300' } })
  servers.push(child)
  const answers = new Map<number, (a: unknown) => void>()
  createInterface({ input: child.stdout }).on('line', (line) => {
    const a = JSON.parse(line) as { id: number }
    answers.get(a.id)?.(a)
  })
  await new Promise<void>((up) => child.stderr.on('data', (d: Buffer) => d.toString().includes(ready) && up()))
  let n = 0
  const ask = (method: string, params?: unknown) =>
    new Promise<{ result?: Record<string, unknown>; error?: { message: string } }>((resolve) => {
      const id = ++n
      answers.set(id, resolve as (a: unknown) => void)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  return { ask, child }
}

/** A tab on the bridge: it answers every call with what `answer` says. */
async function tab(answer: (call: { id: string; name: string; input: unknown }) => unknown, origin = 'http://localhost:5173') {
  const res = await fetch(`${BASE}/events`, { headers: { origin } })
  if (!res.ok) return res.status
  const reader = res.body!.getReader()
  let buffer = ''
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) return
      buffer += new TextDecoder().decode(value)
      let at: number
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        if (!chunk.startsWith('event: call')) continue
        const call = JSON.parse(chunk.split('\ndata: ')[1]) as { id: string; name: string; input: unknown }
        await fetch(`${BASE}/reply`, { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: JSON.stringify({ id: call.id, ...(answer(call) as object) }) })
      }
    }
  })()
  return 200
}

describe('the MCP server', () => {
  it('says who it is and lists the app’s tools with their schemas', { timeout: 20_000 }, async () => {
    const { ask } = await start()
    const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'gfit' }, capabilities: { tools: {} } })
    expect(init.result!.instructions).toMatch(/getProject first/)
    const list = await ask('tools/list')
    const tools = list.result!.tools as { name: string; inputSchema: Record<string, unknown> }[]
    // the plugins' too (Decision "Plugin tools"), read by folder: Node loads none of their views
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['getProject', 'moveMass', 'solve', 'runOptimizer', 'keepSpecimen']))
    expect(tools[0].inputSchema.$schema).toBeUndefined()
  })

  it('a call without GFit open says how to connect it', { timeout: 20_000 }, async () => {
    const { ask } = await start()
    const r = await ask('tools/call', { name: 'getIssues', arguments: {} })
    expect(r.result).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringMatching(/GFit is not connected/) }] })
  })

  it('a call runs in the tab that listens, and its answer comes back', { timeout: 20_000 }, async () => {
    const { ask } = await start()
    const seen: unknown[] = []
    expect(await tab((c) => (seen.push(c), c.name === 'moveMass' ? { ok: true, output: 'Done.' } : { ok: false, error: 'No mass "x".' }))).toBe(200)
    await new Promise((r) => setTimeout(r, 100))
    expect(await (await fetch(`${BASE}/`)).json()).toEqual({ app: true })
    const moved = await ask('tools/call', { name: 'moveMass', arguments: { mass: 'm1', dx: 5, dy: 0 } })
    expect(moved.result).toEqual({ content: [{ type: 'text', text: '"Done."' }] })
    expect(seen).toEqual([expect.objectContaining({ name: 'moveMass', input: { mass: 'm1', dx: 5, dy: 0 } })])
    const wrong = await ask('tools/call', { name: 'removeMasses', arguments: { masses: ['x'] } })
    expect(wrong.result).toMatchObject({ isError: true, content: [{ text: 'No mass "x".' }] })
    expect((await ask('tools/call', { name: 'flyAway' })).error!.message).toBe('Unknown tool: flyAway')
  })

  it('a second server on the same port relays through the first, and takes the port when it goes', { timeout: 20_000 }, async () => {
    const first = await start()
    const second = await start('port')
    expect(await tab((c) => ({ ok: true, output: `ran ${c.name}` }))).toBe(200)
    await new Promise((r) => setTimeout(r, 100))
    expect((await second.ask('tools/call', { name: 'getIssues', arguments: {} })).result).toEqual({ content: [{ type: 'text', text: '"ran getIssues"' }] })
    // pages cannot use the relay
    expect((await fetch(`${BASE}/call`, { method: 'POST', headers: { origin: 'http://localhost:5173' }, body: '{}' })).status).toBe(403)
    // the first one closes (its client quit): the second opens the port and the tab can find it there
    first.child.stdin.end()
    await new Promise((r) => first.child.once('exit', r))
    const r = await second.ask('tools/call', { name: 'getIssues', arguments: {} })
    expect(r.result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/^GFit is not connected/) }] })
    expect(await (await fetch(`${BASE}/`)).json()).toEqual({ app: false })
  })

  it('refuses a page of another site', { timeout: 20_000 }, async () => {
    await start()
    expect(await tab(() => ({}), 'https://example.com')).toBe(403)
  })
})
