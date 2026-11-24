// The tab's side of the MCP bridge (Decision "MCP server"): turned on, it listens to the server on this computer; each
// call runs through the host (an edit one undo step, the agent's) and its answer is posted back; another tab can take
// the connection; off, it stops. Per browser.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { derive } from '../../../engine/derive.ts'
import { demoProject } from '../../../state/demo.ts'
import { emptyHistory } from '../../../state/history.ts'
import { useApp } from '../../../state/store.ts'
import { MCP_KEY, MCP_URL, useMcp } from '../mcp.ts'

/** An EventSource in place of the browser's: the test sends its events. */
class FakeSource {
  static last: FakeSource | null = null
  closed = false
  listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>()
  url: string
  constructor(url: string) {
    this.url = url
    FakeSource.last = this
  }
  addEventListener(type: string, f: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), f])
  }
  emit(type: string, data: unknown = {}) {
    for (const f of this.listeners.get(type) ?? []) f({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
  close() {
    this.closed = true
  }
}

let posts: { url: string; body: unknown }[] = []
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('EventSource', FakeSource)
  posts = []
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
    posts.push({ url, body: JSON.parse(init.body as string) })
    return { ok: true, status: 204 } as Response
  }) as unknown as typeof fetch
  useMcp.getState().setOn(false)
  useMcp.setState({ calls: 0, last: null })
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null })
})

describe('the MCP bridge in the tab', () => {
  it('turned on, listens to the server on this computer, and remembers it', () => {
    useMcp.getState().setOn(true)
    expect(FakeSource.last!.url).toBe(`${MCP_URL}/events`)
    expect(useMcp.getState().status).toBe('waiting')
    expect(localStorage.getItem(MCP_KEY)).toBe('on')
    FakeSource.last!.emit('hello', { server: 'gfit-mcp' })
    expect(useMcp.getState().status).toBe('connected')
  })

  it('runs a call through the host, one undo step logged as the agent’s, and posts its answer', async () => {
    useMcp.getState().setOn(true)
    FakeSource.last!.emit('hello')
    FakeSource.last!.emit('call', { id: 'k1', name: 'moveMass', input: { mass: 'Warehouse 1', dx: 5, dy: 0 } })
    expect(useApp.getState().history.past).toHaveLength(1)
    expect(useApp.getState().project.log!.at(-1)).toMatchObject({ by: 'agent', verb: 'moveMass' })
    // a call is answered once it has run (a plugin's may take a while)
    await vi.waitFor(() => expect(posts).toEqual([{ url: `${MCP_URL}/reply`, body: { id: 'k1', ok: true, changed: true, output: 'Done.' } }]))
    FakeSource.last!.emit('call', { id: 'k2', name: 'moveMass', input: { mass: 'nope', dx: 1, dy: 0 } })
    await vi.waitFor(() => expect(posts[1]?.body).toMatchObject({ id: 'k2', ok: false, error: expect.stringMatching(/No mass "nope"/) }))
    expect(useMcp.getState()).toMatchObject({ calls: 2, last: { name: 'moveMass', ok: false } })
  })

  it('another tab takes it: this one stops and says so; off closes it', () => {
    useMcp.getState().setOn(true)
    const first = FakeSource.last!
    first.emit('replaced')
    expect(first.closed).toBe(true)
    expect(useMcp.getState().status).toBe('elsewhere')
    useMcp.getState().setOn(true)
    const second = FakeSource.last!
    useMcp.getState().setOn(false)
    expect(second.closed).toBe(true)
    expect(useMcp.getState().status).toBe('off')
    expect(localStorage.getItem(MCP_KEY)).toBe('off')
  })
})
